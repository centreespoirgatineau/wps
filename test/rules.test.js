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

test('a reservation cannot be undone by the contact who made it', () => {
  const { db, alice } = fresh();
  const id = draft(db, { lots: 1 });
  const t0 = Date.now();
  rules.publishOffer(db, id, t0);
  const lot = db.get('SELECT * FROM lots WHERE offer_id = ?', id);
  rules.reserveLot(db, alice, lot.id, t0);
  // The rules engine offers no way back: freeing a lot is an admin action.
  assert.equal(typeof rules.cancelReservation, 'undefined');
  rules.adminSetLot(db, lot.id, 'free', t0 + 1000);
  assert.equal(db.get('SELECT status FROM lots WHERE id = ?', lot.id).status, 'available');
  // The cooldown earned by reserving stays: it was the act of reserving that
  // took the lot away from others for a while.
  assert.equal(db.get(`SELECT COUNT(*) n FROM penalties WHERE contact_id = ? AND status = 'pending'`, alice.id).n, 1);
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

test('three absences remove a contact from the list; undoing the third brings them back', () => {
  const { db, alice } = fresh();
  assert.equal(config.strikeLimit, 3);
  const lots = [];
  // Three offers, Alice reserves one lot on each and never comes for it.
  for (let i = 0; i < 3; i++) {
    const id = draft(db, { lots: 2 });
    rules.publishOffer(db, id, Date.now());
    const free = db.get(`SELECT * FROM lots WHERE offer_id = ? AND status = 'available'`, id);
    // Clear the cooldown earned on the previous offer so she can reserve again.
    db.run(`UPDATE penalties SET status = 'cleared' WHERE contact_id = ?`, alice.id);
    rules.reserveLot(db, alice, free.id);
    lots.push(free.id);
    assert.equal(rules.strikeCount(db, alice.id), i, 'no strike before the absence is marked');
    rules.adminSetLot(db, free.id, 'no_show');
    assert.equal(rules.strikeCount(db, alice.id), i + 1);
    const after = db.get('SELECT status, auto_removed FROM contacts WHERE id = ?', alice.id);
    if (i < 2) assert.equal(after.status, 'active', `still on the list after ${i + 1}`);
    else {
      assert.equal(after.status, 'removed');
      assert.equal(after.auto_removed, 1);
    }
  }
  // Undoing the third absence puts her back.
  rules.adminSetLot(db, lots[2], 'reserved');
  const back = db.get('SELECT status, auto_removed FROM contacts WHERE id = ?', alice.id);
  assert.equal(rules.strikeCount(db, alice.id), 2);
  assert.equal(back.status, 'active');
  assert.equal(back.auto_removed, 0);
});

test('an administrator is never removed by the absence rule', () => {
  const { db, bob } = fresh();
  db.run(`UPDATE contacts SET role = 'admin' WHERE id = ?`, bob.id);
  const admin = db.get('SELECT * FROM contacts WHERE id = ?', bob.id);
  for (let i = 0; i < 4; i++) {
    const id = draft(db, { lots: 2 });
    rules.publishOffer(db, id, Date.now());
    const free = db.get(`SELECT * FROM lots WHERE offer_id = ? AND status = 'available'`, id);
    db.run(`UPDATE penalties SET status = 'cleared' WHERE contact_id = ?`, admin.id);
    rules.reserveLot(db, admin, free.id);
    rules.adminSetLot(db, free.id, 'no_show');
  }
  assert.equal(rules.strikeCount(db, admin.id), 4);
  assert.equal(db.get('SELECT status FROM contacts WHERE id = ?', admin.id).status, 'active');
});

test('reinstating a contact stops their past absences from counting', () => {
  const { db, carol } = fresh();
  const marked = [];
  for (let i = 0; i < 3; i++) {
    const id = draft(db, { lots: 2 });
    rules.publishOffer(db, id, Date.now());
    const free = db.get(`SELECT * FROM lots WHERE offer_id = ? AND status = 'available'`, id);
    db.run(`UPDATE penalties SET status = 'cleared' WHERE contact_id = ?`, carol.id);
    rules.reserveLot(db, carol, free.id);
    rules.adminSetLot(db, free.id, 'no_show');
    marked.push(free.id);
  }
  assert.equal(db.get('SELECT status FROM contacts WHERE id = ?', carol.id).status, 'removed');
  // What the admin's "reinstate" button does.
  db.run(`UPDATE contacts SET status = 'active', auto_removed = 0, strikes_reset_at = ? WHERE id = ?`, Date.now() + 1, carol.id);
  assert.equal(rules.strikeCount(db, carol.id), 0, 'the slate is clean');
  // The lots still say what happened.
  assert.equal(db.all(`SELECT id FROM lots WHERE reserved_by = ? AND status = 'no_show'`, carol.id).length, 3);
});

// ---- the administrator override -------------------------------------------
//
// An admin reserves by hand: no waiting period, no per-contact limit, and no
// cooldown earned. Each test below also checks an ordinary contact in the same
// situation, because the danger of a privilege is not that it fails to work —
// it is that it quietly applies to everyone.

function admin(db) {
  const now = Date.now();
  const { lastInsertRowid } = db.run(
    `INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, created_at, updated_at)
     VALUES ('David', 'Hatin', 'Centre Espoir', '+18192085721', 'fr', 'admin', 'active', 'tokadmin', ?, ?)`, now, now);
  return db.get('SELECT * FROM contacts WHERE id = ?', lastInsertRowid);
}

test('admin override: no per-contact maximum, and none of it leaks to a contact', () => {
  const { db, alice } = fresh();
  const boss = admin(db);
  const offer = rules.publishOffer(db, draft(db, { lots: 5, max: 1 }));
  const lots = db.all('SELECT * FROM lots WHERE offer_id = ? ORDER BY number', offer.id);

  rules.reserveLot(db, boss, lots[0].id);
  const second = rules.canReserve(db, boss, offer);
  assert.equal(second.ok, true, 'the admin is past the maximum of 1 and may still reserve');
  assert.equal(second.override, true);
  rules.reserveLot(db, boss, lots[1].id);
  assert.equal(db.all(`SELECT * FROM lots WHERE reserved_by = ?`, boss.id).length, 2);

  // The same offer, the same moment, an ordinary contact: still one lot only.
  rules.reserveLot(db, alice, lots[2].id);
  const hers = rules.canReserve(db, alice, offer);
  assert.equal(hers.ok, false);
  assert.equal(hers.reason, 'max');
  assert.throws(() => rules.reserveLot(db, alice, lots[3].id), (e) => e.reason === 'max');
});

test('admin override: no cooldown earned, and no cooldown applied', () => {
  const { db, alice } = fresh();
  const boss = admin(db);
  const t0 = Date.now();
  const first = rules.publishOffer(db, draft(db, { lots: 3 }), t0);
  rules.reserveLot(db, boss, db.get('SELECT * FROM lots WHERE offer_id = ?', first.id).id, t0);
  rules.reserveLot(db, alice, db.all('SELECT * FROM lots WHERE offer_id = ? ORDER BY number', first.id)[1].id, t0);

  // Reserving earns Alice a pending cooldown. It must not earn the admin one:
  // it could never apply, and it would sit in the offer's penalties list.
  assert.equal(db.all(`SELECT * FROM penalties WHERE contact_id = ?`, boss.id).length, 0);
  assert.equal(db.all(`SELECT * FROM penalties WHERE contact_id = ?`, alice.id).length, 1);

  const t1 = t0 + 60 * MIN;
  const next = rules.publishOffer(db, draft(db, { lots: 3 }), t1);
  assert.equal(rules.canReserve(db, boss, next, t1 + 1000).ok, true, 'admin waits for nothing');
  const hers = rules.canReserve(db, alice, next, t1 + 1000);
  assert.equal(hers.ok, false);
  assert.equal(hers.reason, 'cooldown');
});

test('admin override waives the fairness rules only — never the rest', () => {
  const { db } = fresh();
  const boss = admin(db);

  // A closed offer stays closed.
  const offer = rules.publishOffer(db, draft(db, { lots: 2 }));
  const lot = db.get('SELECT * FROM lots WHERE offer_id = ?', offer.id);
  const ended = { ...offer, status: 'expired' };
  assert.equal(rules.canReserve(db, boss, ended).ok, false);
  assert.equal(rules.canReserve(db, boss, ended).reason, 'inactive');

  // An admin who has left the list is refused like anyone else.
  db.run(`UPDATE contacts SET status = 'removed' WHERE id = ?`, boss.id);
  const gone = db.get('SELECT * FROM contacts WHERE id = ?', boss.id);
  assert.equal(rules.canReserve(db, gone, offer).reason, 'contact_inactive');

  // And a lot already taken is still taken.
  db.run(`UPDATE contacts SET status = 'active' WHERE id = ?`, boss.id);
  const back = db.get('SELECT * FROM contacts WHERE id = ?', boss.id);
  rules.reserveLot(db, back, lot.id);
  assert.throws(() => rules.reserveLot(db, back, lot.id), (e) => e.reason === 'taken');
});
