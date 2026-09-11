// The fairness rules, in one place.
//
//  • Publishing offer N creates its lots and turns every *pending* penalty into
//    an *active* penalty targeting N.
//  • Reserving a lot on N gives the contact a *pending* cooldown: on the next
//    published offer they must wait COOLDOWN minutes after publication.
//  • An admin marking a lot "no_show" gives the holder a *pending* no-show
//    penalty: they cannot reserve at all on the next published offer.
//  • When an offer ends (23:59 local or closed by an admin), every penalty
//    targeting it is cleared — everyone starts equal again.
import { config } from '../config.js';
import { endOfDay } from './time.js';

export class RuleError extends Error {
  constructor(reason, extra = {}) { super(reason); this.reason = reason; Object.assign(this, extra); }
}

const cooldownMs = () => config.cooldownMinutes * 60_000;

export function getOffer(db, id) {
  return db.get('SELECT * FROM offers WHERE id = ?', id);
}

/** The status an offer *should* have right now (handles the timer lagging). */
export function effectiveStatus(offer, now = Date.now()) {
  if (offer.status === 'active' && offer.expires_at && offer.expires_at <= now) return 'expired';
  return offer.status;
}
export const isActive = (offer, now = Date.now()) => effectiveStatus(offer, now) === 'active';

export function publishOffer(db, offerId, now = Date.now()) {
  return db.tx(() => {
    const offer = getOffer(db, offerId);
    if (!offer) throw new RuleError('not_found');
    if (offer.status !== 'draft') throw new RuleError('not_draft');
    const expiresAt = endOfDay(now, config.timezone);
    db.run(`UPDATE offers SET status = 'active', published_at = ?, expires_at = ? WHERE id = ?`, now, expiresAt, offerId);
    for (let n = 1; n <= offer.lot_count; n++) {
      db.run(`INSERT INTO lots(offer_id, number, status) VALUES (?, ?, 'available')`, offerId, n);
    }
    // Pending penalties earned on earlier offers now apply to this one.
    db.run(`UPDATE penalties SET status = 'active', target_offer_id = ?
            WHERE status = 'pending' AND source_offer_id != ?`, offerId, offerId);
    return { ...offer, status: 'active', published_at: now, expires_at: expiresAt };
  });
}

export function endOffer(db, offerId, status = 'closed', now = Date.now()) {
  return db.tx(() => {
    const offer = getOffer(db, offerId);
    if (!offer || offer.status !== 'active') return offer;
    db.run(`UPDATE offers SET status = ?, ended_at = ? WHERE id = ?`, status, now, offerId);
    db.run(`UPDATE penalties SET status = 'cleared', cleared_at = ? WHERE status = 'active' AND target_offer_id = ?`, now, offerId);
    return { ...offer, status, ended_at: now };
  });
}

/** Close every active offer whose day has ended. Returns the ids ended. */
export function expireDueOffers(db, now = Date.now()) {
  const due = db.all(`SELECT id FROM offers WHERE status = 'active' AND expires_at <= ?`, now);
  for (const { id } of due) endOffer(db, id, 'expired', now);
  return due.map((r) => r.id);
}

/** Active penalties for a contact on a given offer. */
export function penaltiesFor(db, contactId, offerId) {
  return db.all(`SELECT * FROM penalties WHERE contact_id = ? AND target_offer_id = ? AND status = 'active'`, contactId, offerId);
}

/**
 * Can this contact reserve one more lot on this offer right now?
 * Returns { ok: true } or { ok: false, reason, until? }.
 */
export function canReserve(db, contact, offer, now = Date.now()) {
  if (!isActive(offer, now)) return { ok: false, reason: 'inactive' };
  if (contact.status !== 'active') return { ok: false, reason: 'contact_inactive' };
  const pens = penaltiesFor(db, contact.id, offer.id);
  if (pens.some((p) => p.type === 'no_show')) return { ok: false, reason: 'no_show' };
  const cd = pens.find((p) => p.type === 'cooldown');
  if (cd) {
    const until = offer.published_at + cooldownMs();
    if (now < until) return { ok: false, reason: 'cooldown', until };
  }
  const { n } = db.get(`SELECT COUNT(*) AS n FROM lots WHERE offer_id = ? AND reserved_by = ? AND status IN ('reserved','picked_up')`, offer.id, contact.id);
  if (n >= offer.max_per_contact) return { ok: false, reason: 'max', max: offer.max_per_contact };
  return { ok: true };
}

export function reserveLot(db, contact, lotId, now = Date.now()) {
  return db.tx(() => {
    const lot = db.get('SELECT * FROM lots WHERE id = ?', lotId);
    if (!lot) throw new RuleError('not_found');
    const offer = getOffer(db, lot.offer_id);
    const check = canReserve(db, contact, offer, now);
    if (!check.ok) throw new RuleError(check.reason, check);
    if (lot.status !== 'available') throw new RuleError('taken');
    db.run(`UPDATE lots SET status = 'reserved', reserved_by = ?, reserved_at = ? WHERE id = ? AND status = 'available'`, contact.id, now, lotId);
    // One pending cooldown per contact — reserving twice does not stack.
    const pending = db.get(`SELECT id FROM penalties WHERE contact_id = ? AND type = 'cooldown' AND status = 'pending'`, contact.id);
    if (!pending) {
      db.run(`INSERT INTO penalties(contact_id, type, source_offer_id, status, created_at) VALUES (?, 'cooldown', ?, 'pending', ?)`, contact.id, offer.id, now);
    }
    return { ...lot, status: 'reserved', reserved_by: contact.id, reserved_at: now };
  });
}

export function cancelReservation(db, contact, lotId, now = Date.now()) {
  return db.tx(() => {
    const lot = db.get('SELECT * FROM lots WHERE id = ?', lotId);
    if (!lot || lot.reserved_by !== contact.id || lot.status !== 'reserved') throw new RuleError('not_yours');
    const offer = getOffer(db, lot.offer_id);
    if (!isActive(offer, now)) throw new RuleError('inactive');
    db.run(`UPDATE lots SET status = 'available', reserved_by = NULL, reserved_at = NULL WHERE id = ?`, lotId);
    // The cooldown earned by reserving stays: it was the act of reserving that
    // took the lot away from others for a while.
    return { ...lot, status: 'available', reserved_by: null };
  });
}

/**
 * Admin actions on a lot: 'picked_up' | 'no_show' | 'reserved' (undo) | 'free'.
 */
export function adminSetLot(db, lotId, action, now = Date.now()) {
  return db.tx(() => {
    const lot = db.get('SELECT * FROM lots WHERE id = ?', lotId);
    if (!lot) throw new RuleError('not_found');
    const holder = lot.reserved_by;
    switch (action) {
      case 'picked_up':
        if (!holder) throw new RuleError('no_holder');
        db.run(`UPDATE lots SET status = 'picked_up' WHERE id = ?`, lotId);
        removePendingNoShow(db, holder, lot.offer_id);
        break;
      case 'no_show': {
        if (!holder) throw new RuleError('no_holder');
        db.run(`UPDATE lots SET status = 'no_show' WHERE id = ?`, lotId);
        const existing = db.get(`SELECT id FROM penalties WHERE contact_id = ? AND type = 'no_show' AND status = 'pending'`, holder);
        if (!existing) db.run(`INSERT INTO penalties(contact_id, type, source_offer_id, status, created_at) VALUES (?, 'no_show', ?, 'pending', ?)`, holder, lot.offer_id, now);
        break;
      }
      case 'reserved': // undo picked_up / no_show
        if (!holder) throw new RuleError('no_holder');
        db.run(`UPDATE lots SET status = 'reserved' WHERE id = ?`, lotId);
        removePendingNoShow(db, holder, lot.offer_id);
        break;
      case 'free':
        db.run(`UPDATE lots SET status = 'available', reserved_by = NULL, reserved_at = NULL WHERE id = ?`, lotId);
        if (holder) removePendingNoShow(db, holder, lot.offer_id);
        break;
      default:
        throw new RuleError('bad_action');
    }
    return db.get('SELECT * FROM lots WHERE id = ?', lotId);
  });
}

function removePendingNoShow(db, contactId, offerId) {
  db.run(`DELETE FROM penalties WHERE contact_id = ? AND type = 'no_show' AND status = 'pending' AND source_offer_id = ?`, contactId, offerId);
}

export function clearPenalty(db, penaltyId, now = Date.now()) {
  db.run(`UPDATE penalties SET status = 'cleared', cleared_at = ? WHERE id = ? AND status IN ('pending','active')`, now, penaltyId);
}

/** Lots of an offer with holder details, for display. */
export function lotsWithHolders(db, offerId) {
  return db.all(`
    SELECT l.*, c.first_name, c.last_name, c.organization, c.phone
    FROM lots l LEFT JOIN contacts c ON c.id = l.reserved_by
    WHERE l.offer_id = ? ORDER BY l.number`, offerId);
}

export function lotCounts(db, offerId) {
  const r = db.get(`
    SELECT COUNT(*) AS total,
           SUM(status = 'available') AS available,
           SUM(status IN ('reserved','picked_up')) AS reserved,
           SUM(status = 'picked_up') AS picked_up,
           SUM(status = 'no_show') AS no_show
    FROM lots WHERE offer_id = ?`, offerId);
  return { total: r.total || 0, available: r.available || 0, reserved: r.reserved || 0, picked_up: r.picked_up || 0, no_show: r.no_show || 0 };
}
