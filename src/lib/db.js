// SQLite database (node:sqlite, built into Node 22+). One file, WAL mode.
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE,            -- E.164, e.g. +18192085721
  lang TEXT NOT NULL DEFAULT 'fr',       -- fr | en
  role TEXT NOT NULL DEFAULT 'user',     -- user | admin
  status TEXT NOT NULL DEFAULT 'active', -- active | opted_out | removed
  token TEXT NOT NULL UNIQUE,            -- personal link token
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  organization TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'fr',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | refused
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by INTEGER
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lot_description TEXT NOT NULL,          -- what one lot contains
  lot_count INTEGER NOT NULL,
  max_per_contact INTEGER NOT NULL DEFAULT 1,
  pickup_name TEXT NOT NULL DEFAULT '',
  pickup_address TEXT NOT NULL DEFAULT '',
  pickup_details TEXT NOT NULL DEFAULT '',
  pickup_photo TEXT NOT NULL DEFAULT '',
  pickup_from TEXT NOT NULL DEFAULT '',   -- HH:MM local, optional
  pickup_to TEXT NOT NULL DEFAULT '',     -- HH:MM local, optional
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | active | closed | expired
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  expires_at INTEGER,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS offer_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available', -- available | reserved | picked_up | no_show
  reserved_by INTEGER REFERENCES contacts(id),
  reserved_at INTEGER,
  UNIQUE(offer_id, number)
);

CREATE TABLE IF NOT EXISTS penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                     -- cooldown | no_show
  source_offer_id INTEGER NOT NULL,
  target_offer_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | cleared
  created_at INTEGER NOT NULL,
  cleared_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_offer ON messages(offer_id, id);

CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_codes_phone ON login_codes(phone, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  via TEXT NOT NULL,                      -- link | code
  admin_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER,
  offer_id INTEGER,
  to_phone TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- offer | code | welcome | test | other
  body TEXT NOT NULL,
  sid TEXT,
  status TEXT NOT NULL,                   -- queued | sent | delivered | failed | dry_run
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sms_offer ON sms_log(offer_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;

// Columns added after v1. Each is applied only if missing (safe on existing databases).
const MIGRATIONS = [
  ['contacts', 'no_sms', 'INTEGER NOT NULL DEFAULT 0'],   // test accounts: never texted
  ['offers', 'sms_fr', "TEXT NOT NULL DEFAULT ''"],        // per-offer SMS template overrides
  ['offers', 'sms_en', "TEXT NOT NULL DEFAULT ''"],
];

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  for (const [table, col, def] of MIGRATIONS) {
    const has = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(table, col);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
  return wrap(db);
}

/** Small convenience layer over DatabaseSync. */
function wrap(db) {
  const cache = new Map();
  const prep = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  return {
    raw: db,
    get: (sql, ...args) => prep(sql).get(...args),
    all: (sql, ...args) => prep(sql).all(...args),
    run: (sql, ...args) => prep(sql).run(...args),
    exec: (sql) => db.exec(sql),
    /** Run fn inside a transaction (IMMEDIATE — takes the write lock up front). */
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
    },
    setting(key, dflt = '') {
      const r = prep('SELECT value FROM settings WHERE key = ?').get(key);
      return r ? r.value : dflt;
    },
    setSetting(key, value) {
      prep('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value ?? ''));
    },
    close: () => db.close(),
  };
}
