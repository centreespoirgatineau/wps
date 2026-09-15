import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { App, HttpError } from './lib/http.js';
import { openDb } from './lib/db.js';
import { render, renderPartial } from './lib/view.js';
import { translator, normalizeLang } from './lib/i18n.js';
import { loadSession, isAdmin, adminFresh } from './lib/auth.js';
import { isDemo } from './lib/demo.js';
import { loadPublicUrl, publicUrl } from './lib/site.js';
import { startScheduler } from './lib/scheduler.js';
import { formatPhone, normalizePhone } from './lib/phone.js';
import { token } from './lib/crypto.js';
import { formatDate, formatDateTimeShort, formatDateTimeLong, hmToH } from './lib/time.js';
import { publicRoutes, hasDeck } from './routes/public.js';
import { contactRoutes } from './routes/contact.js';
import { adminRoutes } from './routes/admin.js';
import { twilioRoutes } from './routes/twilio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const db = openDb(config.dbPath);
loadPublicUrl(db);   // the address links are built from; may be overridden in Réglages

// Static assets are addressed by content hash (?v=…) so browsers never keep a stale stylesheet.
const assetVersion = createHash('sha1')
  .update(fs.readFileSync(path.join(here, 'public/app.css')))
  .update(fs.readFileSync(path.join(here, 'public/app.js')))
  .update(fs.readFileSync(path.join(here, 'public/mark.svg')))
  .update(fs.readFileSync(path.join(here, 'public/og.png')))
  .digest('hex').slice(0, 10);

// Default settings on first run.
if (!db.setting('pickup_name')) {
  db.setSetting('pickup_name', 'Centre Espoir de Gatineau');
  db.setSetting('pickup_address', '791 boulevard Maloney Est, Gatineau, QC J8P 1H8');
  db.setSetting('pickup_details', '');
}
if (!db.setting('app_name')) db.setSetting('app_name', config.appName);

// The first administrator of a brand-new instance, from ADMIN_PHONE. Only ever
// when the list has no administrator at all: it cannot promote, overwrite or
// resurrect anyone once the platform is in use, so leaving the variable in the
// environment forever is harmless.
if (config.bootstrapAdmin.phone && !db.get(`SELECT id FROM contacts WHERE role = 'admin' LIMIT 1`)) {
  const a = config.bootstrapAdmin;
  const phone = normalizePhone(a.phone);
  if (!phone) {
    console.error(`[boot] ADMIN_PHONE is not a usable number: ${a.phone}`);
  } else if (db.get('SELECT id FROM contacts WHERE phone = ?', phone)) {
    console.error(`[boot] ${a.phone} is already on the list; promote it from another admin account.`);
  } else {
    const now = Date.now();
    db.run(`INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'fr', 'admin', 'active', ?, ?, ?)`,
      a.first, a.last, a.org, phone, token(12), now, now);
    console.log(`[boot] first administrator created: ${a.first} ${a.last} ${formatPhone(phone)}`);
  }
}

const app = new App();

// --- security headers, language, view helpers ---
app.use((ctx) => {
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.set('X-Frame-Options', 'DENY');
  ctx.set('Referrer-Policy', 'same-origin');
  ctx.set('X-Robots-Tag', 'noindex, nofollow');
  if (!ctx.path.startsWith('/static/') && !ctx.path.startsWith('/media/')) ctx.set('Cache-Control', 'no-store');
  ctx.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
});

app.use(loadSession(db));

app.use((ctx) => {
  // Language: ?lang= (and persist) > contact preference > cookie > French.
  // The browser's Accept-Language is deliberately NOT consulted: the platform
  // is French by default and English is a choice the visitor makes, otherwise
  // a phone set to English opens the site in English on the first visit.
  let lang;
  if (ctx.query.lang) {
    lang = normalizeLang(ctx.query.lang, config.defaultLang);
    ctx.setCookie('wps_lang', lang, { httpOnly: false, secure: config.isHttps(), maxAge: 365 * 86400, path: '/' });
    if (ctx.state.contact && ctx.state.contact.lang !== lang) {
      db.run('UPDATE contacts SET lang = ?, updated_at = ? WHERE id = ?', lang, Date.now(), ctx.state.contact.id);
      ctx.state.contact.lang = lang;
    }
    // Clean the URL
    const u = new URL(ctx.url); u.searchParams.delete('lang');
    return ctx.redirect(u.pathname + (u.search || ''));
  }
  lang = ctx.state.contact?.lang || normalizeLang(ctx.cookies.wps_lang, '') || config.defaultLang;
  ctx.state.lang = lang;
  ctx.t = translator(lang);

  // Flash message (one-shot, cookie based)
  if (ctx.cookies.wps_flash) {
    try { ctx.state.flash = JSON.parse(ctx.cookies.wps_flash); } catch {}
    ctx.clearCookie('wps_flash', { path: '/' });
  }
  ctx.flash = (type, text) => ctx.setCookie('wps_flash', JSON.stringify({ type, text }), { secure: config.isHttps(), path: '/', maxAge: 60 });

  ctx.locals = (locals = {}) => {
    const u = new URL(ctx.url); u.searchParams.set('lang', ctx.t('lang.other_code'));
    return {
      t: ctx.t, lang, config,
      appName: db.setting('app_name', config.appName),
      contact: ctx.state.contact || null,
      isAdmin: isAdmin(ctx),
      isDemo: isDemo(ctx.state.contact),
      publicUrl: publicUrl(),
      donateUrl: db.setting('donate_url', ''),
      // "Qu'est-ce que cette plateforme ?" opens the slideshow where this brand
      // has one, and the About page where it does not.
      deckUrl: hasDeck ? '/presentation' : '/a-propos',
      adminFresh: adminFresh(ctx),
      csrf: ctx.state.session?.csrf || '',
      path: ctx.path,
      v: assetVersion,
      langSwitchUrl: u.pathname + u.search,
      flash: ctx.state.flash || null,
      pendingCount: isAdmin(ctx) ? db.get(`SELECT COUNT(*) n FROM join_requests WHERE status = 'pending'`).n : 0,
      fmtPhone: formatPhone,
      fmtDate: (ms, withTime) => formatDate(ms, config.timezone, lang, withTime),
      fmtShort: (ms) => formatDateTimeShort(ms, config.timezone, lang),
      fmtWhen: (ms) => formatDateTimeLong(ms, config.timezone, lang),
      hmToH: (hm) => hmToH(hm, lang),
      ...locals,
    };
  };
  ctx.render = (view, locals) => ctx.html(render(view, ctx.locals(locals)));
  ctx.partial = (view, locals) => ctx.html(renderPartial(view, ctx.locals(locals)));
});

app.static('/static', path.join(here, 'public'), { maxAge: 365 * 86400 });

publicRoutes(app, db);
contactRoutes(app, db);
adminRoutes(app, db);
twilioRoutes(app, db);

app.onError((err, ctx) => {
  if (!(err instanceof HttpError) || err.status >= 500) console.error(err);
  if (!ctx.t) ctx.t = translator(config.defaultLang);
  if (!ctx.render) ctx.render = (view, locals) => ctx.text(locals?.message || 'Error');
  const status = err.status || 500;
  if (ctx.req.headers.accept?.includes('application/json') || ctx.req.headers['x-csrf']) {
    return ctx.json({ error: err.csrf ? ctx.t('error.csrf') : status === 404 ? ctx.t('error.not_found') : status === 403 ? ctx.t('error.forbidden') : ctx.t('error.generic') }, status);
  }
  ctx.status(status);
  const message = err.csrf ? ctx.t('error.csrf') : status === 404 ? ctx.t('error.not_found') : status === 403 ? ctx.t('error.forbidden') : status === 429 ? ctx.t('error.too_many') : ctx.t('error.generic');
  try { ctx.render('error', { title: message, message, status }); }
  catch { ctx.text(message); }
});

startScheduler(db);

app.listen(config.port, config.host, () => {
  console.log(`wps listening on http://${config.host}:${config.port} (${publicUrl()}) tz=${config.timezone} sms=${config.twilio.dryRun || !config.twilio.accountSid ? 'dry-run' : 'twilio'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log(`\n${sig} received, closing`); try { db.close(); } catch {} process.exit(0); });
}
