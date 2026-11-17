// Fold the church platform (jc) into the food-bank one (spp), so only spp has
// to be maintained from now on. David's decision, 2026-11-17: the contacts and
// the offers of jc are added to spp, and nothing else.
//
//   node scripts/merge-jc-into-spp.js <jc data dir> <spp data dir> [--dry-run]
//
// What comes across:
//   - every contact. One whose phone is already on spp is the same person: the
//     spp record is kept as it is, and their jc history is attached to it.
//   - every offer, with its lots (who held what, absences included — those are
//     the strikes), its chat and its photos. Offers get new numbers on spp.
// What does not: penalties still waiting for "the next offer" (that meant the
// next jc offer), the SMS log, sessions, login codes, join requests, settings.
//
// Additive only: nothing on spp is changed or deleted. Runs once — it records
// the merge in spp's settings and refuses a second run. Both apps must be
// stopped while it runs; update.sh takes care of that on the server.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { token } from '../src/lib/crypto.js';
import { DEMO_PHONE } from '../src/lib/demo.js';

const [jcDir, sppDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');
if (!jcDir || !sppDir) {
  console.error('usage: node scripts/merge-jc-into-spp.js <jc data dir> <spp data dir> [--dry-run]');
  process.exit(2);
}

const jc = new DatabaseSync(path.join(jcDir, 'wps.sqlite'));
const spp = new DatabaseSync(path.join(sppDir, 'wps.sqlite'));
spp.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

if (spp.prepare(`SELECT value FROM settings WHERE key = 'merged_from_jc_at'`).get()) {
  console.error('Already merged: spp records a merge from jc. Nothing done.');
  process.exit(1);
}

// Copy every column both databases have, so a column added by a later
// migration comes across without this script being touched.
const cols = (table) => {
  const there = new Set(spp.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name));
  return jc.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name)
    .filter((c) => c !== 'id' && there.has(c));
};
function insert(table, row) {
  const c = Object.keys(row);
  return Number(spp.prepare(`INSERT INTO ${table}(${c.join(', ')}) VALUES (${c.map(() => '?').join(', ')})`)
    .run(...c.map((k) => row[k])).lastInsertRowid);
}
const pick = (row, names) => Object.fromEntries(names.map((n) => [n, row[n]]));

// Photos are files with random names. A name already used on spp by a
// different file gets a fresh one; nothing on spp is ever overwritten.
const copies = [];
const photoName = new Map();
function photo(file) {
  if (!file) return file;
  if (photoName.has(file)) return photoName.get(file);
  const from = path.join(jcDir, 'uploads', file);
  if (!fs.existsSync(from)) { console.warn(`  ! photo missing on jc, row kept: ${file}`); photoName.set(file, file); return file; }
  let name = file;
  const to = () => path.join(sppDir, 'uploads', name);
  while (fs.existsSync(to()) && !fs.readFileSync(to()).equals(fs.readFileSync(from))) {
    name = token(20) + path.extname(file);
  }
  copies.push([from, to()]);
  photoName.set(file, name);
  return name;
}

const report = { contactsAdded: 0, contactsMatched: 0, offers: 0, lots: 0, messages: 0, photos: 0 };
const contactId = new Map();   // jc contact id → spp contact id
const offerId = {};            // jc offer id → spp offer id, kept for redirects

spp.exec('BEGIN IMMEDIATE');
try {
  // ---- contacts --------------------------------------------------------------
  const contactCols = cols('contacts');
  for (const c of jc.prepare('SELECT * FROM contacts ORDER BY id').all()) {
    // spp has its own demonstration account; the jc one is not a person.
    if (c.phone === DEMO_PHONE) continue;
    const same = spp.prepare('SELECT id FROM contacts WHERE phone = ?').get(c.phone);
    if (same) { contactId.set(c.id, same.id); report.contactsMatched++; continue; }
    const row = pick(c, contactCols);
    // Keep the personal link working if the token is free on spp.
    while (spp.prepare('SELECT 1 FROM contacts WHERE token = ?').get(row.token)) row.token = token();
    contactId.set(c.id, insert('contacts', row));
    report.contactsAdded++;
  }
  const who = (id) => (id == null ? null : contactId.get(id) ?? null);

  // ---- offers, oldest first, with their lots, chat and photos -----------------
  const offerCols = cols('offers'), lotCols = cols('lots'), msgCols = cols('messages'), photoCols = cols('offer_photos');
  for (const o of jc.prepare('SELECT * FROM offers ORDER BY created_at, id').all()) {
    const row = pick(o, offerCols);
    row.created_by = who(o.created_by);
    row.pickup_photo = photo(o.pickup_photo);
    const id = insert('offers', row);
    offerId[o.id] = id;
    report.offers++;

    for (const l of jc.prepare('SELECT * FROM lots WHERE offer_id = ? ORDER BY number').all(o.id)) {
      insert('lots', { ...pick(l, lotCols), offer_id: id, reserved_by: who(l.reserved_by) });
      report.lots++;
    }
    for (const m of jc.prepare('SELECT * FROM messages WHERE offer_id = ? ORDER BY id').all(o.id)) {
      const author = who(m.contact_id);
      if (author == null) continue; // only the demonstration account, which cannot write
      insert('messages', { ...pick(m, msgCols), offer_id: id, contact_id: author });
      report.messages++;
    }
    for (const p of jc.prepare('SELECT * FROM offer_photos WHERE offer_id = ? ORDER BY position, id').all(o.id)) {
      insert('offer_photos', { ...pick(p, photoCols), offer_id: id, file: photo(p.file) });
      report.photos++;
    }
  }

  spp.prepare(`INSERT INTO settings(key, value) VALUES ('merged_from_jc_at', ?)`).run(String(Date.now()));
  if (dryRun) throw Object.assign(new Error('dry run'), { dryRun: true });
  spp.exec('COMMIT');
} catch (e) {
  spp.exec('ROLLBACK');
  if (!e.dryRun) throw e;
}

if (!dryRun) {
  fs.mkdirSync(path.join(sppDir, 'uploads'), { recursive: true });
  for (const [from, to] of copies) if (!fs.existsSync(to)) fs.copyFileSync(from, to);
  // Which jc offer became which spp offer, for redirecting old links later.
  fs.writeFileSync(path.join(sppDir, 'merged-from-jc.json'),
    JSON.stringify({ at: new Date().toISOString(), offers: offerId }, null, 2));
}

console.log(`${dryRun ? 'DRY RUN, nothing written. Would merge' : 'Merged'} jc into spp:`);
console.log(`  contacts: ${report.contactsAdded} added, ${report.contactsMatched} already on spp (same phone, kept as is)`);
console.log(`  offers: ${report.offers}, lots: ${report.lots}, chat messages: ${report.messages}, photos: ${report.photos} (${copies.length} files)`);
