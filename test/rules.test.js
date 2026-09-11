import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/wps-test-data';
process.env.TIMEZONE = 'America/Toronto';

const { openDb } = await import('../src/lib/db.js');
const rules = await import('../src/lib/rules.js');
const { endOfDay, zonedParts } = await import('../src/lib/time.js');
const { config } = await import('../src/config.js');

function fresh() {
  const db = openDb(':memory:');
  const now = Date.now();
  const mk = (first, phone) => {
    const { lastInsertRowid } = db.run(
      `INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, created_at, updated_at)
       VALUES (?, '', 'Org', ?, 'fr', 'user', 'active', ?, ?, ?)`, first, phone, 'tok' + phone, now, now);
    return db.get('SELECT * FROM contacts WHERE id = ?', lastInsertRowid);
  };
  const alice = mk('Alice', '+18190000001');
  const bob = mk('Bob', '+18190000002');
  const carol = mk('Carol', '+18190000003');
  return { db, alice, bob, carol };
}

function draft(db, { lots = 3, max = 1 } = {}) {
  const { lastInsertRowid } = db.run(
    `INSERT INTO offers(title, lot_description, lot_count, max_per_contact, status, created_at) VALUES ('Sushi', '10 plateaux', ?, ?, 'draft', ?)`,
    lots, max, Date.now());
  return Number(lastInsertRowid);
}

const MIN = 60_000;

test('publish creates lots and sets expiry to end of local day', () => {
  const { db } = fresh();
  const id = draft(db, { lots: 4 });
  const t0 = Date.UTC(2026, 8, 11, 18, 0, 0); // 14:00 Toronto (EDT)
  const offer = rules.publishOffer(db, id, t0);
  assert.equal(offer.status, 'active');
  assert.equal(db.all('SELECT * FROM lots WHERE offer_id = ?', id).length, 4);
  const p = zonedParts(offer.expires_at, 'America/Toronto');
  assert.deepEqual([p.h, p.mi, p.s], [23, 59, 59]);
  assert.equal(offer.expires_at, endOfDay(t0, 'America/Toronto'));
});

test('first come first served: a lot can only be reserved once', () => {
  const { db, alice, bob } = fresh();
  const id = draft(db, { lots: 1 });
  const t0 = Date.now();
  rules.publishOffer(db, id, t0);
  const lot = db.get('SELECT * FROM lots WHERE offer_id = ?', id);
  rules.reserveLot(db, alice, lot.id, t0 + 1000);
  assert.throws(() => rules.reserveLot(db, bob, lot.id, t0 + 2000), (e) => e.reason === 'taken');
});

test('max lots per contact is enforced', () => {
  const { db, alice } = fresh();
  const id = draft(db, { lots: 3, max: 2 });
  const t0 = Date.now();
  rules.publishOffer(db, id, t0);
  const lots = db.all('SELECT * FROM lots WHERE offer_id = ? ORDER BY number', id);
  rules.reserveLot(db, alice, lots[0].id, t0);
  rules.reserveLot(db, alice, lots[1].id, t0);
  assert.throws(() => rules.reserveLot(db, alice, lots[2].id, t0), (e) => e.reason === 'max');
});

test('cooldown: reserving on N blocks the first 15 minutes of N+1, then clears when N+1 ends', () => {
  const { db, alice, bob } = fresh();
  const n1 = draft(db);
  const t0 = Date.UTC(2026, 8, 11, 14, 0, 0);
  rules.publishOffer(db, n1, t0);
  const lot1 = db.get('SELECT * FROM lots WHERE offer_id = ?', n1);
  rules.reserveLot(db, alice, lot1.id, t0 + MIN);
  // Pending penalty exists
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND status = 'pending'`, alice.id).n, 1);

  const n2 = draft(db);
  const t1 = t0 + 60 * MIN;
  const offer2 = rules.publishOffer(db, n2, t1);
  const lot2 = db.get('SELECT * FROM lots WHERE offer_id = ?', n2);
  // Within 15 minutes → refused with until
  const c = rules.canReserve(db, alice, offer2, t1 + 5 * MIN);
  assert.equal(c.ok, false); assert.equal(c.reason, 'cooldown'); assert.equal(c.until, t1 + config.cooldownMinutes * MIN);
  assert.throws(() => rules.reserveLot(db, alice, lot2.id, t1 + 5 * MIN), (e) => e.reason === 'cooldown');
  // Bob (no penalty) can reserve immediately
  assert.equal(rules.canReserve(db, bob, offer2, t1 + 1000).ok, true);
  // After 15 minutes Alice can reserve
  assert.equal(rules.canReserve(db, alice, offer2, t1 + 16 * MIN).ok, true);
  rules.reserveLot(db, alice, lot2.id, t1 + 16 * MIN);
  // That earned a new pending cooldown for the offer after
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND status = 'pending'`, alice.id).n, 1);
  // Ending N+1 clears the active one
  rules.endOffer(db, n2, 'closed', t1 + 120 * MIN);
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND status = 'active'`, alice.id).n, 0);
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND status = 'cleared'`, alice.id).n, 1);
});

test('cooldown does not stack when reserving several lots on the same offer', () => {
  const { db, alice } = fresh();
  const id = draft(db, { lots: 3, max: 3 });
  const t0 = Date.now();
  rules.publishOffer(db, id, t0);
  for (const lot of db.all('SELECT * FROM lots WHERE offer_id = ?', id)) rules.reserveLot(db, alice, lot.id, t0);
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ?`, alice.id).n, 1);
});

test('no-show blocks the whole next offer, undo removes it, and it clears when that offer ends', () => {
  const { db, alice } = fresh();
  const n1 = draft(db);
  const t0 = Date.now();
  rules.publishOffer(db, n1, t0);
  const lot1 = db.get('SELECT * FROM lots WHERE offer_id = ?', n1);
  rules.reserveLot(db, alice, lot1.id, t0);
  rules.adminSetLot(db, lot1.id, 'no_show', t0 + MIN);
  // Undo then redo, to check idempotence
  rules.adminSetLot(db, lot1.id, 'reserved', t0 + 2 * MIN);
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND type = 'no_show'`, alice.id).n, 0);
  rules.adminSetLot(db, lot1.id, 'no_show', t0 + 3 * MIN);
  rules.endOffer(db, n1, 'expired', t0 + 4 * MIN);

  const n2 = draft(db);
  const t1 = t0 + 24 * 60 * MIN;
  const offer2 = rules.publishOffer(db, n2, t1);
  // Even after the 15 minutes, still blocked on N+1
  const c = rules.canReserve(db, alice, offer2, t1 + 60 * MIN);
  assert.equal(c.ok, false); assert.equal(c.reason, 'no_show');
  rules.endOffer(db, n2, 'expired', t1 + 120 * MIN);

  const n3 = draft(db);
  const offer3 = rules.publishOffer(db, n3, t1 + 200 * MIN);
  assert.equal(rules.canReserve(db, alice, offer3, t1 + 201 * MIN).ok, true);
});

test('cancelling a reservation frees the lot but keeps the cooldown', () => {
  const { db, alice, bob } = fresh();
  const id = draft(db, { lots: 1 });
  const t0 = Date.now();
  rules.publishOffer(db, id, t0);
  const lot = db.get('SELECT * FROM lots WHERE offer_id = ?', id);
  rules.reserveLot(db, alice, lot.id, t0);
  assert.throws(() => rules.cancelReservation(db, bob, lot.id, t0), (e) => e.reason === 'not_yours');
  rules.cancelReservation(db, alice, lot.id, t0 + 1000);
  assert.equal(db.get('SELECT status FROM lots WHERE id = ?', lot.id).status, 'available');
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND status = 'pending'`, alice.id).n, 1);
  rules.reserveLot(db, bob, lot.id, t0 + 2000);
});

test('offers expire automatically at end of day and reservations stop', () => {
  const { db, alice } = fresh();
  const id = draft(db);
  const t0 = Date.UTC(2026, 8, 11, 20, 0, 0);
  const offer = rules.publishOffer(db, id, t0);
  const lot = db.get('SELECT * FROM lots WHERE offer_id = ?', id);
  const afterMidnight = offer.expires_at + 1;
  // Lazy status is already 'expired' even before the timer runs
  assert.equal(rules.effectiveStatus(offer, afterMidnight), 'expired');
  assert.throws(() => rules.reserveLot(db, alice, lot.id, afterMidnight), (e) => e.reason === 'inactive');
  const ended = rules.expireDueOffers(db, afterMidnight);
  assert.deepEqual(ended, [id]);
  assert.equal(db.get('SELECT status FROM offers WHERE id = ?', id).status, 'expired');
  // Not expired one second before
  assert.equal(rules.expireDueOffers(openDb(':memory:'), 0).length, 0);
});

test('lot counts', () => {
  const { db, alice } = fresh();
  const id = draft(db, { lots: 3 });
  const t0 = Date.now();
  rules.publishOffer(db, id, t0);
  const lot = db.get('SELECT * FROM lots WHERE offer_id = ?', id);
  rules.reserveLot(db, alice, lot.id, t0);
  rules.adminSetLot(db, lot.id, 'picked_up', t0);
  assert.deepEqual(rules.lotCounts(db, id), { total: 3, available: 2, reserved: 1, picked_up: 1, no_show: 0 });
});
