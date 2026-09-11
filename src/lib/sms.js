// Twilio Programmable Messaging through its REST API (plain fetch, no SDK).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export function smsConfigured() {
  const t = config.twilio;
  return Boolean(t.accountSid && t.authToken && t.from) && !t.dryRun;
}

/**
 * Send one SMS and record it in sms_log. Never throws: failures are logged.
 * Returns the sms_log row id.
 */
export async function sendSms(db, { to, body, kind = 'other', contactId = null, offerId = null }) {
  const now = Date.now();
  // Test accounts are never texted, whatever the caller.
  if (contactId && db.get('SELECT no_sms FROM contacts WHERE id = ?', contactId)?.no_sms) {
    const { lastInsertRowid } = db.run(
      `INSERT INTO sms_log(contact_id, offer_id, to_phone, kind, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'skipped', ?, ?)`,
      contactId, offerId, to, kind, body, now, now);
    return lastInsertRowid;
  }
  const { lastInsertRowid: logId } = db.run(
    `INSERT INTO sms_log(contact_id, offer_id, to_phone, kind, body, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
    contactId, offerId, to, kind, body, now, now,
  );

  if (!smsConfigured()) {
    db.run(`UPDATE sms_log SET status = 'dry_run', updated_at = ? WHERE id = ?`, Date.now(), logId);
    console.log(`[sms dry-run] to=${to} kind=${kind} :: ${body}`);
    return logId;
  }

  const t = config.twilio;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(t.accountSid)}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: t.from, Body: body });
  if (config.isHttps()) params.set('StatusCallback', `${config.appUrl}/twilio/status`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${t.accountSid}:${t.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = `${data.code || res.status}: ${data.message || res.statusText}`;
      db.run(`UPDATE sms_log SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`, err, Date.now(), logId);
      console.error(`[sms] failed to=${to}: ${err}`);
    } else {
      db.run(`UPDATE sms_log SET status = ?, sid = ?, updated_at = ? WHERE id = ?`,
        mapStatus(data.status), data.sid || null, Date.now(), logId);
    }
  } catch (e) {
    db.run(`UPDATE sms_log SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`, String(e.message || e), Date.now(), logId);
    console.error(`[sms] error to=${to}: ${e.message}`);
  }
  return logId;
}

export function mapStatus(s) {
  switch (s) {
    case 'queued': case 'accepted': case 'scheduled': return 'queued';
    case 'sending': case 'sent': return 'sent';
    case 'delivered': case 'read': return 'delivered';
    case 'undelivered': return 'undelivered';
    case 'failed': case 'canceled': return 'failed';
    default: return s || 'sent';
  }
}

/** Validate X-Twilio-Signature for a webhook (HMAC-SHA1 of URL + sorted params). */
export function validateTwilioSignature(signature, url, params) {
  if (!config.twilio.authToken || !signature) return false;
  const keys = Object.keys(params).sort();
  let data = url;
  for (const k of keys) data += k + params[k];
  const expected = createHmac('sha1', config.twilio.authToken).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Keep SMS bodies within GSM-7 where possible so they stay 1–2 segments. */
export function gsmSafe(s) {
  return String(s)
    .replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C').replace(/[êëÊË]/g, 'e').replace(/[ôöÔÖ]/g, 'o')
    .replace(/[îïÎÏ]/g, 'i').replace(/[ûÛ]/g, 'u').replace(/[âÂ]/g, 'a').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/[  ]/g, ' ');
}
