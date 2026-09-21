// Outgoing email through the Resend REST API (plain fetch, no SDK).
//
// The project has no npm dependencies, so SMTP is out: a mailer library would
// be the first one. Resend is an HTTPS call with a bearer token, exactly like
// the Twilio call in sms.js, and centreespoir.ca is already a verified sending
// domain there.
//
// Nothing here may ever break what it is reporting on. A reservation is the
// contact's commitment and it is already written to the database by the time a
// notice goes out; if the mail fails, it is logged and the reservation stands.
// So every function below swallows its errors, and the callers do not await.
import { config } from '../config.js';

const API = 'https://api.resend.com/emails';

export function mailConfigured() {
  const m = config.mail;
  return Boolean(m.apiKey && m.from && m.to.length) && !m.dryRun;
}

/**
 * Send one email. Never throws. Returns true when the API accepted it.
 *
 * `to` is the internal notification list from the environment — this function
 * has no contact-facing use, and the addresses never come from a request.
 */
export async function sendMail({ subject, text }) {
  const m = config.mail;
  if (!m.apiKey || !m.from || !m.to.length) {
    console.log(`[mail not configured] ${subject}`);
    return false;
  }
  if (m.dryRun) {
    console.log(`[mail dry-run] to=${m.to.join(', ')} :: ${subject}\n${text}`);
    return true;
  }
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${m.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: m.from, to: m.to, subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[mail] failed: ${res.status} ${data.message || res.statusText}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[mail] failed: ${e.message}`);
    return false;
  }
}
