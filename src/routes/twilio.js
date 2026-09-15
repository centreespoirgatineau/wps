// Twilio webhooks: delivery status updates and inbound STOP/START keywords.
// Both are optional; configure them in the Twilio console with the URLs
//   {APP_URL}/twilio/status   (Messages → StatusCallback, set automatically)
//   {APP_URL}/twilio/inbound  (Phone number → "A message comes in")
import { HttpError } from '../lib/http.js';
import { validateTwilioSignature, mapStatus } from '../lib/sms.js';
import { publicUrl } from '../lib/site.js';

function verify(ctx, params) {
  const url = `${publicUrl()}${ctx.path}`;
  if (!validateTwilioSignature(ctx.req.headers['x-twilio-signature'], url, params)) {
    throw new HttpError(403, 'bad signature');
  }
}

export function twilioRoutes(app, db) {
  app.post('/twilio/status', async (ctx) => {
    const p = await ctx.body();
    verify(ctx, p);
    if (p.MessageSid && p.MessageStatus) {
      db.run(`UPDATE sms_log SET status = ?, error = COALESCE(?, error), updated_at = ? WHERE sid = ?`,
        mapStatus(p.MessageStatus), p.ErrorCode ? `Twilio ${p.ErrorCode}` : null, Date.now(), p.MessageSid);
      const row = db.get('SELECT offer_id FROM sms_log WHERE sid = ?', p.MessageSid);
      if (row?.offer_id) (await import('../lib/sse.js')).publish(row.offer_id, 'refresh', { reason: 'sms' });
    }
    ctx.status(204).send('', 'text/plain');
  });

  app.post('/twilio/inbound', async (ctx) => {
    const p = await ctx.body();
    verify(ctx, p);
    const from = String(p.From || '');
    const body = String(p.Body || '').trim().toUpperCase();
    const contact = db.get(`SELECT * FROM contacts WHERE phone = ? AND status != 'removed'`, from);
    if (contact) {
      if (['STOP', 'ARRET', 'ARRÊT', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(body)) {
        db.run(`UPDATE contacts SET status = 'opted_out', updated_at = ? WHERE id = ?`, Date.now(), contact.id);
      } else if (['START', 'UNSTOP', 'YES', 'OUI', 'DEBUT', 'DÉBUT'].includes(body)) {
        db.run(`UPDATE contacts SET status = 'active', updated_at = ? WHERE id = ?`, Date.now(), contact.id);
      }
    }
    // Empty TwiML: no auto-reply (Twilio handles STOP confirmations itself).
    ctx.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 'text/xml');
  });
}
