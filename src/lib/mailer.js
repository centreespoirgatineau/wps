// The internal notices Centre Espoir receives by email, and their French wording.
//
// Separate from mail.js on purpose: that file knows how to reach Resend, this
// one knows what the Centre wants to read. Written in French only — these go to
// direction@ and communications@, not to the contacts, so there is no language
// to switch on.
//
// Both platforms report to the same two addresses, so **every message names the
// platform it came from**. Without that, a reservation on the food-bank side
// and one on the church side are indistinguishable in the inbox.
import { config } from '../config.js';
import { formatDateTimeLong } from './time.js';
import { formatPhone } from './phone.js';
import { publicUrl } from './site.js';
import { sendMail } from './mail.js';

const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };

/**
 * Compose the "a lot has been reserved" notice.
 *
 * `held` is how many lots this organisation now holds on this offer, which is
 * the number the Centre actually plans around — not how many exist in total.
 */
export function reservationEmail({ contact, offer, lot, held, override, at = Date.now() }) {
  const site = publicUrl();
  const host = hostOf(site);
  const who = `${contact.first_name} ${contact.last_name || ''}`.trim();
  const lots = held === 1 ? '1 lot' : `${held} lots`;

  const lines = [
    `Une réservation vient d'être faite sur ${host}.`,
    '',
    `Organisme : ${contact.organization || '—'}`,
    `Personne  : ${who}`,
    `Téléphone : ${formatPhone(contact.phone)}`,
    '',
    `Offre : ${offer.title}`,
    `Contenu d'un lot : ${offer.lot_description}`,
    `Lot réservé : n° ${lot.number} sur ${offer.lot_count}`,
    `Cet organisme détient maintenant ${lots} sur cette offre.`,
  ];
  // Worth saying out loud: the fairness rules were not applied to this one.
  if (override) {
    lines.push('', "Réservation faite par un administrateur, en dérogation : ni délai d'attente ni maximum n'ont été appliqués.");
  }
  lines.push('', `Voir l'offre : ${site}/offres/${offer.id}`, '', `Le ${formatDateTimeLong(at, config.timezone, 'fr')}.`);

  return {
    subject: `Réservation — ${offer.title} (${host})`,
    text: lines.join('\n'),
  };
}

/**
 * Tell the Centre a lot has just been taken. Fire and forget.
 *
 * The reservation is already committed to the database before this runs, and
 * the contact is waiting on the response, so this is never awaited and never
 * allowed to throw: a mail outage must not look like a failed reservation.
 */
export function notifyReservation(payload) {
  const { subject, text } = reservationEmail(payload);
  sendMail({ subject, text }).catch((e) => console.error('[mail] notifyReservation', e));
}
