// The one-time merge of the church platform into the food-bank one, run for
// real against two throwaway databases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { openDb } = await import('../src/lib/db.js');
const { legacyTarget } = await import('../src/lib/legacy.js');

const now = Date.now();
function instance(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wps-merge-${name}-`));
  fs.mkdirSync(path.join(dir, 'uploads'));
  return { dir, db: openDb(path.join(dir, 'wps.sqlite')) };
}
function contact(db, first, phone, token, extra = {}) {
  const row = { first_name: first, organization: `${first} org`, phone, token, created_at: now, updated_at: now, ...extra };
  const c = Object.keys(row);
  return Number(db.run(`INSERT INTO contacts(${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`, ...c.map((k) => row[k])).lastInsertRowid);
}
function offer(db, title, by) {
  return Number(db.run(`INSERT INTO offers(title, lot_description, lot_count, status, created_by, created_at, published_at)
    VALUES (?, '1 caisse', 2, 'expired', ?, ?, ?)`, title, by, now, now).lastInsertRowid);
}
const merge = (jc, spp, ...flags) => spawnSync(process.execPath,
  ['--no-warnings=ExperimentalWarning', 'scripts/merge-jc-into-spp.js', jc.dir, spp.dir, ...flags], { encoding: 'utf8' });

test('jc contacts and offers are added to spp, and nothing else', () => {
  const jc = instance('jc'), spp = instance('spp');

  // spp already has David, its own demo account, an offer and a photo named
  // like one of jc's but holding something else.
  const sppDavid = contact(spp.db, 'David', '+18192085721', 'daviddspp', { role: 'admin' });
  contact(spp.db, 'Démo', '+15555555555', 'demospp');
  offer(spp.db, 'Raisins rouges', sppDavid);
  fs.writeFileSync(path.join(spp.dir, 'uploads', 'same.jpg'), 'spp photo');

  const jcDavid = contact(jc.db, 'David', '+18192085721', 'daviddjc', { role: 'admin' });
  contact(jc.db, 'Démo', '+15555555555', 'demojc');
  const pasteur = contact(jc.db, 'Paul', '+18195550200', 'paultoken');
  const clash = contact(jc.db, 'Ruth', '+18195550201', 'demospp'); // token already taken on spp
  const sushi = offer(jc.db, 'Sushis', jcDavid);
  jc.db.run(`INSERT INTO lots(offer_id, number, status, reserved_by, reserved_at) VALUES (?, 1, 'no_show', ?, ?)`, sushi, pasteur, now);
  jc.db.run(`INSERT INTO lots(offer_id, number, status, reserved_by, reserved_at) VALUES (?, 2, 'picked_up', ?, ?)`, sushi, clash, now);
  jc.db.run(`INSERT INTO messages(offer_id, contact_id, body, created_at) VALUES (?, ?, 'Je passe à 14H', ?)`, sushi, pasteur, now);
  jc.db.run(`INSERT INTO offer_photos(offer_id, file, position) VALUES (?, 'same.jpg', 0)`, sushi);
  fs.writeFileSync(path.join(jc.dir, 'uploads', 'same.jpg'), 'jc photo');
  jc.db.run(`INSERT INTO penalties(contact_id, type, source_offer_id, status, created_at) VALUES (?, 'no_show', ?, 'pending', ?)`, pasteur, sushi, now);
  jc.db.run(`INSERT INTO sms_log(to_phone, kind, body, status, created_at, updated_at) VALUES ('+18195550200', 'offer', 'x', 'sent', ?, ?)`, now, now);

  // A dry run writes nothing.
  let r = merge(jc, spp, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
  assert.match(r.stdout, /2 added, 1 already on spp/);
  assert.equal(spp.db.get('SELECT COUNT(*) n FROM contacts').n, 2);
  assert.equal(spp.db.get('SELECT COUNT(*) n FROM offers').n, 1);

  r = merge(jc, spp);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 added, 1 already on spp/);

  // Contacts: Paul and Ruth added, David matched by phone and left alone, the
  // jc demo account dropped; Paul keeps his link, Ruth's clashed and changed.
  assert.equal(spp.db.get('SELECT COUNT(*) n FROM contacts').n, 4);
  assert.equal(spp.db.get(`SELECT token FROM contacts WHERE phone = '+18192085721'`).token, 'daviddspp');
  const paul = spp.db.get(`SELECT * FROM contacts WHERE phone = '+18195550200'`);
  assert.equal(paul.token, 'paultoken');
  const ruth = spp.db.get(`SELECT * FROM contacts WHERE phone = '+18195550201'`);
  assert.notEqual(ruth.token, 'demospp');

  // The offer, renumbered, authored by spp's David, with its lots, chat, photo.
  const merged = spp.db.get(`SELECT * FROM offers WHERE title = 'Sushis'`);
  assert.equal(merged.created_by, sppDavid);
  const lots = spp.db.all('SELECT * FROM lots WHERE offer_id = ? ORDER BY number', merged.id);
  assert.deepEqual(lots.map((l) => [l.status, l.reserved_by]), [['no_show', paul.id], ['picked_up', ruth.id]]);
  assert.equal(spp.db.get('SELECT body FROM messages WHERE offer_id = ?', merged.id).body, 'Je passe à 14H');
  const file = spp.db.get('SELECT file FROM offer_photos WHERE offer_id = ?', merged.id).file;
  assert.notEqual(file, 'same.jpg', 'a clashing photo name gets a new one');
  assert.equal(fs.readFileSync(path.join(spp.dir, 'uploads', file), 'utf8'), 'jc photo');
  assert.equal(fs.readFileSync(path.join(spp.dir, 'uploads', 'same.jpg'), 'utf8'), 'spp photo', 'spp photo untouched');

  // Nothing else: no penalty, no SMS log came across.
  assert.equal(spp.db.get('SELECT COUNT(*) n FROM penalties').n, 0);
  assert.equal(spp.db.get('SELECT COUNT(*) n FROM sms_log').n, 0);

  // The map of old to new offer numbers, and a second run refused.
  const map = JSON.parse(fs.readFileSync(path.join(spp.dir, 'merged-from-jc.json'), 'utf8'));
  assert.equal(map.offers[sushi], merged.id);
  r = merge(jc, spp);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Already merged/);
  assert.equal(spp.db.get('SELECT COUNT(*) n FROM offers').n, 2);

  for (const i of [jc, spp]) { i.db.raw.close(); fs.rmSync(i.dir, { recursive: true, force: true }); }
});

test('old jc links land on the same thing on spp', () => {
  const opts = { offers: { 9: 15, 14: 20 }, tokenKnown: (t) => t === 'paultoken' };
  const go = (p, s = '') => legacyTarget(p, s, opts);
  // An offer, by its old number, whoever asks.
  assert.equal(go('/offres/9'), '/offres/15');
  assert.equal(go('/admin/offres/14/modifier'), '/offres/20');
  assert.equal(go('/offres/2'), '/offres', 'an offer that never came across: the list');
  // A personal link keeps signing its owner in when the token came across...
  assert.equal(go('/o/14/paultoken'), '/o/20/paultoken');
  assert.equal(go('/r/paultoken'), '/r/paultoken');
  // ...and otherwise still opens the offer, behind the sign-in.
  assert.equal(go('/o/14/oldtoken'), '/offres/20');
  assert.equal(go('/r/oldtoken'), '/connexion');
  // Everything else keeps its path and query.
  assert.equal(go('/demande', '?phone=8195550000'), '/demande?phone=8195550000');
  assert.equal(go('/'), '/');
});
