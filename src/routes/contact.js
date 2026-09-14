// Signed-in contact routes: offers, reservations, chat, profile, private media.
import path from 'node:path';
import { HttpError, sendFile } from '../lib/http.js';
import { requireContact, checkCsrf, destroySession, rateLimit } from '../lib/auth.js';
import { isDemo } from '../lib/demo.js';
import { normalizeLang } from '../lib/i18n.js';
import { config } from '../config.js';
import * as rules from '../lib/rules.js';
import * as sse from '../lib/sse.js';

export function loadOffer(db, id) {
  const offer = db.get('SELECT * FROM offers WHERE id = ?', Number(id));
  if (!offer) throw new HttpError(404);
  offer.effective = rules.effectiveStatus(offer);
  offer.active = offer.effective === 'active';
  offer.photos = db.all('SELECT * FROM offer_photos WHERE offer_id = ? ORDER BY position, id', offer.id);
  offer.lots = rules.lotsWithHolders(db, offer.id);
  offer.counts = rules.lotCounts(db, offer.id);
  return offer;
}

/** Everything the offer page needs for this viewer. */
export function offerViewModel(db, ctx, offer) {
  const contact = ctx.state.contact;
  const check = rules.canReserve(db, contact, offer);
  const mine = offer.lots.filter((l) => l.reserved_by === contact.id && l.status !== 'no_show');
  return { offer, check, mine, myId: contact.id, cooldownMs: config.cooldownMinutes * 60_000 };
}

export function listOffers(db) {
  const offers = db.all(`SELECT * FROM offers WHERE status != 'draft' ORDER BY published_at DESC, id DESC LIMIT 200`);
  for (const o of offers) { o.effective = rules.effectiveStatus(o); o.active = o.effective === 'active'; o.counts = rules.lotCounts(db, o.id); }
  return { active: offers.filter((o) => o.active), past: offers.filter((o) => !o.active) };
}

/**
 * The demonstration account may read everything and write nothing. Used as a
 * route guard: the router stops the chain as soon as a handler has answered.
 */
function refuseDemo(ctx) {
  if (isDemo(ctx.state.contact)) ctx.json({ ok: false, reason: 'demo', message: ctx.t('demo.read_only') }, 403);
}

export function contactRoutes(app, db) {
  app.get('/offres', requireContact, (ctx) => {
    ctx.render('offers', { title: ctx.t('offers.title'), ...listOffers(db) });
  });

  app.get('/offres/:id', requireContact, (ctx) => {
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status === 'draft') throw new HttpError(404);
    const messages = db.all(`
      SELECT m.*, c.first_name, c.last_name, c.organization FROM messages m JOIN contacts c ON c.id = m.contact_id
      WHERE m.offer_id = ? ORDER BY m.id ASC LIMIT 500`, offer.id);
    ctx.render('offer', { title: offer.title, ...offerViewModel(db, ctx, offer), messages });
  });

  // Partial: the lots block, re-fetched on SSE "refresh".
  app.get('/offres/:id/lots', requireContact, (ctx) => {
    const offer = loadOffer(db, ctx.params.id);
    ctx.partial('_lots', offerViewModel(db, ctx, offer));
  });

  app.get('/offres/:id/stream', requireContact, (ctx) => {
    loadOffer(db, ctx.params.id);
    sse.subscribe(ctx.params.id, ctx);
  });

  app.post('/offres/:id/lots/:lotId/reserver', requireContact, refuseDemo, async (ctx) => {
    const body = await ctx.body();
    checkCsrf(ctx, body);
    if (!rateLimit(db, `reserve:${ctx.state.contact.id}`, 30, 60_000)) throw new HttpError(429);
    try {
      const lot = rules.reserveLot(db, ctx.state.contact, Number(ctx.params.lotId));
      if (lot.offer_id !== Number(ctx.params.id)) throw new HttpError(404);
      sse.publish(ctx.params.id, 'refresh', { reason: 'reserved', lot: lot.number });
      ctx.json({ ok: true, message: ctx.t('offer.reserved_ok') });
    } catch (e) {
      if (!(e instanceof rules.RuleError)) throw e;
      ctx.json({ ok: false, reason: e.reason, message: reasonText(ctx, e) }, 409);
    }
  });

  app.post('/offres/:id/lots/:lotId/annuler', requireContact, refuseDemo, async (ctx) => {
    const body = await ctx.body();
    checkCsrf(ctx, body);
    try {
      rules.cancelReservation(db, ctx.state.contact, Number(ctx.params.lotId));
      sse.publish(ctx.params.id, 'refresh', { reason: 'cancelled' });
      ctx.json({ ok: true });
    } catch (e) {
      if (!(e instanceof rules.RuleError)) throw e;
      ctx.json({ ok: false, reason: e.reason, message: reasonText(ctx, e) }, 409);
    }
  });

  // Chat
  app.get('/offres/:id/messages', requireContact, (ctx) => {
    const after = Number(ctx.query.after || 0);
    const rows = db.all(`
      SELECT m.id, m.body, m.created_at, m.contact_id, c.first_name, c.last_name, c.organization
      FROM messages m JOIN contacts c ON c.id = m.contact_id
      WHERE m.offer_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200`, Number(ctx.params.id), after);
    ctx.json({ messages: rows.map((m) => messageJson(m, ctx.state.contact.id)) });
  });

  app.post('/offres/:id/messages', requireContact, refuseDemo, async (ctx) => {
    const body = await ctx.body();
    checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    if (!offer.active) return ctx.json({ ok: false, message: ctx.t('chat.closed') }, 409);
    if (ctx.state.contact.status !== 'active') throw new HttpError(403);
    const text = String(body.body || '').trim().slice(0, 1000);
    if (!text) return ctx.json({ ok: false }, 400);
    if (!rateLimit(db, `chat:${ctx.state.contact.id}`, 30, 60_000)) throw new HttpError(429);
    const now = Date.now();
    const { lastInsertRowid } = db.run('INSERT INTO messages(offer_id, contact_id, body, created_at) VALUES (?, ?, ?, ?)', offer.id, ctx.state.contact.id, text, now);
    const c = ctx.state.contact;
    const msg = { id: Number(lastInsertRowid), body: text, created_at: now, contact_id: c.id, first_name: c.first_name, last_name: c.last_name, organization: c.organization };
    sse.publish(offer.id, 'message', messageJson(msg));
    ctx.json({ ok: true, message: messageJson(msg, c.id) });
  });

  // Personal settings
  app.get('/moi', (ctx) => ctx.redirect('/reglages'));
  app.get('/reglages', requireContact, (ctx) => ctx.render('me', { title: ctx.t('settings.title') }));

  app.post('/reglages', requireContact, async (ctx) => {
    const body = await ctx.body();
    checkCsrf(ctx, body);
    const lang = normalizeLang(body.lang, ctx.state.contact.lang);
    db.run('UPDATE contacts SET lang = ?, updated_at = ? WHERE id = ?', lang, Date.now(), ctx.state.contact.id);
    ctx.flash('ok', ctx.t('me.saved'));
    ctx.redirect('/reglages');
  });

  app.post('/reglages/retrait', requireContact, async (ctx) => {
    const body = await ctx.body();
    checkCsrf(ctx, body);
    // The demonstration account cannot retire itself — that would close the
    // door for everyone. Only an admin can, by changing its status.
    if (isDemo(ctx.state.contact)) {
      ctx.flash('error', ctx.t('demo.read_only'));
      return ctx.redirect('/reglages');
    }
    db.run(`UPDATE contacts SET status = 'opted_out', updated_at = ? WHERE id = ?`, Date.now(), ctx.state.contact.id);
    // Free their reservations on active offers so others can take them.
    const lots = db.all(`SELECT l.id, l.offer_id FROM lots l JOIN offers o ON o.id = l.offer_id WHERE l.reserved_by = ? AND l.status = 'reserved' AND o.status = 'active'`, ctx.state.contact.id);
    for (const l of lots) { rules.adminSetLot(db, l.id, 'free'); sse.publish(l.offer_id, 'refresh', { reason: 'freed' }); }
    destroySession(db, ctx);
    ctx.render('login', { centered: true, title: ctx.t('login.title'), step: 'phone', phone: '', info: ctx.t('me.opted_out') });
  });

  // Private media (photos)
  app.get('/media/:file', requireContact, async (ctx) => {
    const file = path.basename(ctx.params.file);
    if (!/^[A-Za-z0-9_-]+\.(jpg|webp|png)$/.test(file)) throw new HttpError(404);
    await sendFile(ctx, path.join(config.uploadsDir, file), { maxAge: 7 * 86400 });
  });
}

export function messageJson(m, myId) {
  return {
    id: m.id, body: m.body, at: m.created_at, contactId: m.contact_id,
    name: `${m.first_name} ${m.last_name ? m.last_name[0] + '.' : ''}`.trim(),
    org: m.organization, mine: myId ? m.contact_id === myId : undefined,
  };
}

export function reasonText(ctx, e) {
  switch (e.reason) {
    case 'taken': return ctx.t('offer.reserve_taken');
    case 'inactive': return ctx.t('offer.inactive');
    case 'no_show': return ctx.t('offer.noshow_block');
    case 'cooldown': return ctx.t('offer.cooldown', { time: msToClock(e.until - Date.now()) }).replace(/<[^>]+>/g, '');
    case 'max': return ctx.t('offer.max_reached', { n: e.max });
    case 'demo': return ctx.t('demo.read_only');
    default: return ctx.t('offer.reserve_refused');
  }
}

export function msToClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
