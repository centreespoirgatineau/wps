#!/usr/bin/env node
// Create (or promote) an administrator from the command line.
//   node scripts/make-admin.js "(819) 555-1234" David Hatin "Centre Espoir de Gatineau" [fr|en]
import { config } from '../src/config.js';
import { openDb } from '../src/lib/db.js';
import { normalizePhone } from '../src/lib/phone.js';
import { token } from '../src/lib/crypto.js';

const [phoneArg, first = 'Admin', last = '', org = '', lang = 'fr'] = process.argv.slice(2);
const phone = normalizePhone(phoneArg);
if (!phone) {
  console.error('Usage: make-admin.js "<phone>" [first] [last] [organization] [fr|en]');
  process.exit(1);
}
const db = openDb(config.dbPath);
const now = Date.now();
const existing = db.get('SELECT * FROM contacts WHERE phone = ?', phone);
if (existing) {
  db.run(`UPDATE contacts SET role = 'admin', status = 'active', updated_at = ? WHERE id = ?`, now, existing.id);
  console.log(`Promoted ${existing.first_name} ${existing.last_name} (${phone}) to admin.`);
} else {
  db.run(`INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, ?, ?)`, first, last, org, phone, lang === 'en' ? 'en' : 'fr', token(12), now, now);
  console.log(`Created admin ${first} ${last} (${phone}).`);
}
const c = db.get('SELECT token FROM contacts WHERE phone = ?', phone);
console.log(`Personal link: ${config.appUrl}/r/${c.token}`);
console.log(`Or sign in with the phone number at ${config.appUrl}/`);
db.close();
