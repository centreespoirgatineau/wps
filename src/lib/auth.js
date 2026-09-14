// Sessions, login codes, personal links.
import { config } from '../config.js';
import { sessionId, token as newToken, loginCode, hmac, safeEqual } from './crypto.js';
import { sendSms, gsmSafe } from './sms.js';
import { translator } from './i18n.js';
import { HttpError } from './http.js';
import { publicUrl } from './site.js';

const DAY = 86_400_000;
export const SESSION_COOKIE = 'wps_sid';

export function cookieOpts(maxAgeMs) {
  return { httpOnly: true, secure: config.isHttps(), sameSite: 'Lax', path: '/', maxAge: Math.floor(maxAgeMs / 1000) };
}

export function createSession(db, contactId, via, ctx) {
  const now = Date.now();
  const id = sessionId();
  const csrf = newToken(24);
  const adminVerifiedAt = via === 'code' ? now : null;
  db.run(`INSERT INTO sessions(id, contact_id, csrf, via, admin_verified_at, created_at, last_seen_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, contactId, csrf, via, adminVerifiedAt, now, now, now + config.sessionDays * DAY);
  ctx.setCookie(SESSION_COOKIE, id, cookieOpts(config.sessionDays * DAY));
  return db.get('SELECT * FROM sessions WHERE id = ?', id);
}

export function destroySession(db, ctx) {
  const sid = ctx.cookies[SESSION_COOKIE];
  if (sid) db.run('DELETE FROM sessions WHERE id = ?', sid);
  ctx.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Load session + contact into ctx.state (middleware). */
export function loadSession(db) {
  return (ctx) => {
    const sid = ctx.cookies[SESSION_COOKIE];
    if (!sid) return;
    const s = db.get('SELECT * FROM sessions WHERE id = ? AND expires_at > ?', sid, Date.now());
    if (!s) { ctx.clearCookie(SESSION_COOKIE, { path: '/' }); return; }
    const c = db.get('SELECT * FROM contacts WHERE id = ? AND status != ?', s.contact_id, 'removed');
    if (!c) { db.run('DELETE FROM sessions WHERE id = ?', sid); ctx.clearCookie(SESSION_COOKIE, { path: '/' }); return; }
    // Sliding expiry, refreshed at most once an hour to limit writes.
    const now = Date.now();
    if (now - s.last_seen_at > 3_600_000) {
      db.run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', now, now + config.sessionDays * DAY, sid);
    }
    ctx.state.session = s;
    ctx.state.contact = c;
  };
}

export const isAdmin = (ctx) => ctx.state.contact?.role === 'admin';

export function adminFresh(ctx) {
  const s = ctx.state.session;
  return Boolean(s?.admin_verified_at && Date.now() - s.admin_verified_at < config.adminFreshHours * 3_600_000);
}

/** Route guards. */
export function requireContact(ctx) {
  if (!ctx.state.contact) {
    const next = encodeURIComponent(ctx.path + (ctx.url.search || ''));
    ctx.redirect(`/connexion?next=${next}`);
  }
}

export function requireAdmin(ctx) {
  if (!ctx.state.contact) return requireContact(ctx);
  if (!isAdmin(ctx)) throw new HttpError(403);
  if (!adminFresh(ctx)) {
    const next = encodeURIComponent(ctx.path + (ctx.url.search || ''));
    ctx.redirect(`/admin/verifier?next=${next}`);
  }
}

/** CSRF: forms post `_csrf`, fetch sends `X-CSRF` header. */
export function checkCsrf(ctx, body) {
  const s = ctx.state.session;
  const given = (body && body._csrf) || ctx.req.headers['x-csrf'];
  if (!s || !given || !safeEqual(given, s.csrf)) throw new HttpError(403, 'csrf', { csrf: true });
}

// ---- login codes ----

export async function issueLoginCode(db, contact) {
  const code = loginCode();
  const now = Date.now();
  db.run(`UPDATE login_codes SET used_at = ? WHERE phone = ? AND used_at IS NULL`, now, contact.phone); // invalidate older codes
  db.run(`INSERT INTO login_codes(phone, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    contact.phone, hmac(config.secret, contact.phone, code), now + config.loginCodeMinutes * 60_000, now);
  const t = translator(contact.lang);
  await sendSms(db, { to: contact.phone, body: gsmSafe(t('sms.code', { code })), kind: 'code', contactId: contact.id });
  return code; // returned only for tests / dry-run display in dev
}

/** Returns 'ok' | 'invalid' | 'expired'. */
export function verifyLoginCode(db, phone, code) {
  const row = db.get(`SELECT * FROM login_codes WHERE phone = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`, phone);
  if (!row) return 'expired';
  if (row.expires_at < Date.now()) return 'expired';
  if (row.attempts >= 5) return 'expired';
  db.run('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
  if (!safeEqual(row.code_hash, hmac(config.secret, phone, String(code).replace(/\D/g, '')))) return 'invalid';
  db.run('UPDATE login_codes SET used_at = ? WHERE id = ?', Date.now(), row.id);
  return 'ok';
}

// ---- rate limiting (SQLite-backed, survives restarts) ----

export function rateLimit(db, key, max, windowMs) {
  const now = Date.now();
  const row = db.get('SELECT * FROM rate_limits WHERE key = ?', key);
  if (!row || row.reset_at <= now) {
    db.run(`INSERT INTO rate_limits(key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`, key, now + windowMs);
    return true;
  }
  if (row.count >= max) return false;
  db.run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', key);
  return true;
}

export function personalLink(contact, offerId = null) {
  return offerId ? `${publicUrl()}/o/${offerId}/${contact.token}` : `${publicUrl()}/r/${contact.token}`;
}

/** Periodic cleanup. */
export function cleanupAuth(db) {
  const now = Date.now();
  db.run('DELETE FROM sessions WHERE expires_at <= ?', now);
  db.run('DELETE FROM login_codes WHERE expires_at <= ?', now - DAY);
  db.run('DELETE FROM rate_limits WHERE reset_at <= ?', now);
}
