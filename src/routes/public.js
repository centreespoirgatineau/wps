// Visitor-facing routes: login by SMS code, personal links, about, join request.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../lib/http.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { normalizeLang } from '../lib/i18n.js';
import { createSession, destroySession, issueLoginCode, verifyLoginCode, rateLimit, checkCsrf } from '../lib/auth.js';
import { DEMO_PHONE, ensureDemoContact } from '../lib/demo.js';
import { config } from '../config.js';
import { publicUrl } from '../lib/site.js';

const MIN = 60_000;

// The slideshow is a single static file, read once at boot, and there is one
// per audience: the church deck is built around the gospel and must never be
// served to the food banks. A brand with no deck of its own simply has no
// /presentation — `hasDeck` below is what the views use to decide where
// "Qu'est-ce que cette plateforme ?" should point.
const DECKS = { jc: 'presentation-surplus.html', spp: 'presentation-spp.html' };
const deckFile = path.join(path.dirname(fileURLToPath(import.meta.url)),
  '../../presentation/', DECKS[config.brand] || '');
const deckHtml = DECKS[config.brand] && fs.existsSync(deckFile) ? fs.readFileSync(deckFile, 'utf8') : '';
export const hasDeck = deckHtml.length > 0;
const deckCsp = (() => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(deckHtml)?.[1] ?? '';
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  return "default-src 'none'; img-src 'self' data:; "
    + "style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
    + `script-src 'sha256-${hash}'; frame-src 'self'; base-uri 'none'; form-action 'none'`;
})();

// The deck writes the address as __ORIGIN__ (a full URL, for the link-preview
// tags and the join button) and __HOST__ (just the domain, for the address a
// church reads off a slide), so changing it in Réglages is enough. Substituting
// on a 150 KB string is worth doing once per address, not once per request.
// Neither placeholder appears inside the deck's inline script, so the hash the
// page's own policy allows is unaffected.
let deckCache = { origin: null, html: '' };
function deckFor(origin) {
  if (deckCache.origin !== origin) {
    const host = origin.replace(/^https?:\/\//, '').replace(/\/$/, '');
    deckCache = { origin, html: deckHtml.replaceAll('__ORIGIN__', origin).replaceAll('__HOST__', host) };
  }
  return deckCache.html;
}

function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

function homeFor(ctx) {
  return ctx.state.contact?.role === 'admin' ? '/admin' : '/offres';
}

export function publicRoutes(app, db) {
  app.get('/', (ctx) => {
    if (ctx.state.contact) return ctx.redirect(homeFor(ctx));
    ctx.render('login', { centered: true, title: ctx.t('login.title'), step: 'phone', phone: '' });
  });

  app.get('/connexion', (ctx) => {
    if (ctx.state.contact && !ctx.query.next) return ctx.redirect(homeFor(ctx));
    ctx.render('login', { centered: true, title: ctx.t('login.title'), step: 'phone', phone: '', next: safeNext(ctx.query.next) });
  });

  // Step 1: phone → code
  app.post('/connexion', async (ctx) => {
    const body = await ctx.body();
    const next = safeNext(body.next);
    const phone = normalizePhone(body.phone);
    const view = (extra) => ctx.render('login', { centered: true, title: ctx.t('login.title'), step: 'phone', phone: body.phone || '', next, ...extra });
    if (!phone) return view({ error: ctx.t('login.invalid_phone') });
    // The demonstration number walks straight in: no code, no text message.
    // It is read-only once inside (see lib/demo.js). Its own generous bucket,
    // so showing the interface repeatedly never eats the real login budget —
    // and being throttled at all keeps it from being a way to pile up sessions.
    if (phone === DEMO_PHONE) {
      if (!rateLimit(db, `login:demo:${ctx.ip}`, 30, 15 * MIN)) return view({ error: ctx.t('error.too_many') });
      const demo = ensureDemoContact(db, ctx.state.lang);
      if (demo.status !== 'active') {
        // Closing the door also ends any session already holding it open.
        db.run('DELETE FROM sessions WHERE contact_id = ?', demo.id);
        return view({ error: ctx.t('login.demo_closed') });
      }
      if (ctx.state.session) db.run('DELETE FROM sessions WHERE id = ?', ctx.state.session.id);
      createSession(db, demo.id, 'link', ctx);
      ctx.state.contact = demo;
      return ctx.redirect(next || '/offres');
    }
    if (!rateLimit(db, `login:ip:${ctx.ip}`, 20, 15 * MIN) || !rateLimit(db, `login:phone:${phone}`, 5, 15 * MIN)) {
      return view({ error: ctx.t('error.too_many') });
    }
    const contact = db.get('SELECT * FROM contacts WHERE phone = ? AND status != ?', phone, 'removed');
    if (!contact) return view({ unknown: true, phoneE164: phone });
    if (contact.status === 'opted_out') return view({ error: ctx.t('login.opted_out'), unknown: true, phoneE164: phone });
    if (contact.no_sms) return view({ error: ctx.t('login.test_account') });
    const code = await issueLoginCode(db, contact);
    ctx.render('login', { centered: true,
      title: ctx.t('login.title'), step: 'code', phone: body.phone, phoneE164: phone, next,
      info: ctx.t('login.code_sent', { phone: formatPhone(phone) }),
      devCode: config.env === 'development' || config.twilio.dryRun ? code : null,
    });
  });

  // Step 2: code → session
  app.post('/connexion/code', async (ctx) => {
    const body = await ctx.body();
    const next = safeNext(body.next);
    const phone = normalizePhone(body.phone);
    if (!phone) return ctx.redirect('/connexion');
    if (!rateLimit(db, `code:ip:${ctx.ip}`, 30, 15 * MIN)) throw new HttpError(429);
    const result = verifyLoginCode(db, phone, body.code || '');
    if (result !== 'ok') {
      return ctx.render('login', { centered: true,
        title: ctx.t('login.title'), step: 'code', phone: formatPhone(phone), phoneE164: phone, next,
        error: ctx.t(result === 'expired' ? 'login.code_expired' : 'login.code_invalid'),
      });
    }
    const contact = db.get('SELECT * FROM contacts WHERE phone = ? AND status != ?', phone, 'removed');
    if (!contact) return ctx.redirect('/connexion');
    // A fresh code-based session (also refreshes admin verification).
    if (ctx.state.session) db.run('DELETE FROM sessions WHERE id = ?', ctx.state.session.id);
    createSession(db, contact.id, 'code', ctx);
    ctx.state.contact = contact;
    ctx.redirect(next || homeFor(ctx));
  });

  // Personal links from SMS
  const linkLogin = (ctx, redirectTo) => {
    const contact = db.get('SELECT * FROM contacts WHERE token = ? AND status != ?', ctx.params.token, 'removed');
    if (!contact) throw new HttpError(404);
    if (!ctx.state.contact || ctx.state.contact.id !== contact.id) {
      if (ctx.state.session) db.run('DELETE FROM sessions WHERE id = ?', ctx.state.session.id);
      createSession(db, contact.id, 'link', ctx);
    }
    ctx.redirect(redirectTo);
  };
  app.get('/r/:token', (ctx) => linkLogin(ctx, '/offres'));
  app.get('/o/:offerId/:token', (ctx) => linkLogin(ctx, `/offres/${encodeURIComponent(ctx.params.offerId)}`));

  app.post('/deconnexion', async (ctx) => {
    const body = await ctx.body();
    if (ctx.state.session) checkCsrf(ctx, body);
    destroySession(db, ctx);
    ctx.redirect('/');
  });

  app.get('/a-propos', (ctx) => ctx.render('about', { title: ctx.t('about.title') }));

  // The slideshow for prospective churches. One self-contained file, so it
  // carries its own inline <style> and <script>: the site-wide policy forbids
  // inline script, so this route serves a policy of its own that allows only
  // this exact script, by hash. Nothing here is user-supplied.
  app.get('/presentation', (ctx) => {
    if (!hasDeck) throw new HttpError(404);
    ctx.set('Content-Security-Policy', deckCsp);
    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.html(deckFor(publicUrl()));
  });

  // Join requests
  app.get('/demande', (ctx) => {
    const phone = ctx.query.phone ? formatPhone(normalizePhone(ctx.query.phone) || '') : '';
    ctx.render('join', { title: ctx.t('join.title'), form: { phone, lang: ctx.state.lang } });
  });

  app.post('/demande', async (ctx) => {
    const body = await ctx.body();
    const form = {
      first_name: String(body.first_name || '').trim().slice(0, 80),
      last_name: String(body.last_name || '').trim().slice(0, 80),
      organization: String(body.organization || '').trim().slice(0, 120),
      phone: String(body.phone || '').trim(),
      lang: normalizeLang(body.lang, ctx.state.lang),
      message: String(body.message || '').trim().slice(0, 1000),
    };
    const view = (error) => ctx.render('join', { title: ctx.t('join.title'), form, error });
    const phone = normalizePhone(form.phone);
    if (!form.first_name || !form.organization || !phone) return view(ctx.t(!phone && form.first_name && form.organization ? 'login.invalid_phone' : 'join.required'));
    if (!rateLimit(db, `join:ip:${ctx.ip}`, 5, 60 * MIN)) return view(ctx.t('error.too_many'));
    if (db.get('SELECT id FROM contacts WHERE phone = ? AND status = ?', phone, 'active')) return view(ctx.t('join.already_member'));
    if (db.get('SELECT id FROM join_requests WHERE phone = ? AND status = ?', phone, 'pending')) return view(ctx.t('join.already_pending'));
    db.run(`INSERT INTO join_requests(first_name, last_name, organization, phone, lang, message, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      form.first_name, form.last_name, form.organization, phone, form.lang, form.message, Date.now());
    ctx.render('join_done', { title: ctx.t('join.thanks_title') });
  });

  app.get('/robots.txt', (ctx) => ctx.text('User-agent: *\nDisallow: /\n'));
  app.get('/healthz', (ctx) => ctx.json({ ok: true, time: Date.now() }));
}
