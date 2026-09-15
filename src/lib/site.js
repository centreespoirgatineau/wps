// The public address the platform answers on.
//
// It is what every personal link in a text message is built from, and what
// Twilio posts its delivery receipts back to. It normally comes from APP_URL in
// the environment, but an administrator can override it from Admin → Réglages,
// so moving the site to a new domain no longer needs a terminal.
//
// Deliberately NOT used for cookie security: that stays tied to APP_URL in the
// environment, so a typo here can never quietly sign everyone out.
import { config } from '../config.js';

let current = config.appUrl;

/** An origin and nothing else: scheme, host, optional port, no trailing slash. */
export function normalizeUrl(value) {
  const s = String(value ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s) ? s : null;
}

/**
 * The donation page shown to contacts, or '' to show nothing anywhere. Must be
 * https with nothing exotic: this address ends up in an href the whole list is
 * given, so a javascript: URL must never survive. null means "not usable".
 */
export function donateUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  try { return new URL(s).protocol === 'https:' ? s.slice(0, 500) : null; } catch { return null; }
}

export const publicUrl = () => current;
export const publicIsHttps = () => current.startsWith('https://');

/** Read the stored address at boot. Falls back to APP_URL. */
export function loadPublicUrl(db) {
  current = normalizeUrl(db.setting('public_url')) || config.appUrl;
  return current;
}

/**
 * Store a new address. An empty value (or one equal to APP_URL) clears the
 * override. Returns null if the value was not a usable address.
 */
export function savePublicUrl(db, value) {
  const raw = String(value ?? '').trim();
  if (!raw) { db.setSetting('public_url', ''); return loadPublicUrl(db); }
  const url = normalizeUrl(raw);
  if (!url) return null;
  db.setSetting('public_url', url === config.appUrl ? '' : url);
  return loadPublicUrl(db);
}
