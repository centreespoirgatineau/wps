// The text every administrator gets when a lot is reserved, so the Centre hears
// about it on the phone within seconds rather than in an inbox. It sits beside
// the email notice (mailer.js) and is hooked in the same single place, the
// reserve route.
//
// Each text carries the administrator's own personal link to the offer: one tap
// opens it signed in. An administrator who already has a session keeps it, so a
// fresh code-verified session is not traded for a weaker one.
//
// Both platforms text from the same number, so every text starts with the
// address of the platform it came from.
import { sendSms, gsmSafe } from './sms.js';
import { translator } from './i18n.js';
import { personalLink } from './auth.js';
import { publicUrl } from './site.js';

const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };

export function reservationSmsBody(admin, { contact, offer, lot, left }) {
  const t = translator(admin.lang);
  const who = contact.organization || `${contact.first_name} ${contact.last_name || ''}`.trim();
  return gsmSafe(t('sms.reserved', {
    host: hostOf(publicUrl()), lot: lot.number, org: who, title: offer.title, left,
    url: personalLink(admin, offer.id),
  }));
}

/**
 * Text every active administrator but the one who reserved. Fire and forget:
 * sendSms never throws, and the caller does not await, for the same reason as
 * the email — the reservation is already committed.
 */
export function textAdmins(db, { contact, offer, lot }) {
  const { n: left } = db.get(`SELECT COUNT(*) AS n FROM lots WHERE offer_id = ? AND status = 'available'`, offer.id);
  const admins = db.all(
    `SELECT * FROM contacts WHERE role = 'admin' AND status = 'active' AND no_sms = 0 AND id != ?`, contact.id);
  for (const a of admins) {
    sendSms(db, { to: a.phone, body: reservationSmsBody(a, { contact, offer, lot, left }), kind: 'reserved', contactId: a.id, offerId: offer.id });
  }
}
