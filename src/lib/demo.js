// Demonstration account.
//
// One well-known number — (555) 555-5555 — opens the contact dashboard without
// a text message, so the interface can be shown or checked without a second
// phone. It looks at everything a contact sees and changes nothing: refusals
// are enforced centrally (rules.canReserve, sendSms) rather than only in the
// views, so a hand-made request cannot get past them either.
//
// To close the door: Admin → Contacts → Démonstration, set the status to
// anything but active. Login then refuses and the account is not re-created.
import { token as newToken } from './crypto.js';

/** The number that walks straight in, stored in E.164 like every phone. */
export const DEMO_PHONE = '+15555555555';

export const isDemo = (contact) => Boolean(contact) && contact.phone === DEMO_PHONE;

/**
 * The demo contact, created on first use so a fresh database needs no setup.
 * Returned whatever its status — the caller decides whether to let it in, which
 * is what makes deactivating it in the admin an off switch.
 */
export function ensureDemoContact(db, lang = 'fr') {
  const existing = db.get('SELECT * FROM contacts WHERE phone = ?', DEMO_PHONE);
  if (existing) return existing;
  const now = Date.now();
  db.run(
    `INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, notes, no_sms, created_at, updated_at)
     VALUES (?, '', ?, ?, ?, 'user', 'active', ?, ?, 1, ?, ?)`,
    'Démonstration', 'Démonstration', DEMO_PHONE, lang, newToken(12),
    'Compte de démonstration : ouvre le tableau de bord sans texto, en lecture seule.',
    now, now,
  );
  return db.get('SELECT * FROM contacts WHERE phone = ?', DEMO_PHONE);
}
