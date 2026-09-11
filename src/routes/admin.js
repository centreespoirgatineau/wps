// Admin routes: offers (draft → confirm → publish + SMS), lots, contacts,
// join requests, SMS log, settings, admin re-verification.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../lib/http.js';
import { requireAdmin, requireContact, isAdmin, checkCsrf, issueLoginCode, verifyLoginCode, rateLimit, personalLink } from '../lib/auth.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { normalizeLang, translator } from '../lib/i18n.js';
import { token as newToken } from '../lib/crypto.js';
import { sendSms, gsmSafe, smsConfigured } from '../lib/sms.js';
import { config } from '../config.js';
import * as rules from '../lib/rules.js';
import * as sse from '../lib/sse.js';
import { loadOffer } from './contact.js';

const MIN = 60_000;
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v, dflt, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
const hm = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? v : '');

function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
}

/** Build the SMS body for a contact/offer, in the contact's language. */
export function offerSmsBody(contact, offer) {
  const t = translator(contact.lang);
  return gsmSafe(t('sms.offer', {
    first: contact.first_name, org: contact.organization || '-', title: offer.title,
    n: offer.lot_count, url: personalLink(contact, offer.id),
  }));
}

/** Send the offer to the chosen contacts, one by one, in the background. */
async function broadcastOffer(db, offer, contactIds) {
  for (const id of contactIds) {
    const c = db.get(`SELECT * FROM contacts WHERE id = ? AND status = 'active'`, id);
    if (!c) continue;
    await sendSms(db, { to: c.phone, body: offerSmsBody(c, offer), kind: 'offer', contactId: c.id, offerId: offer.id });
    sse.publish(offer.id, 'refresh', { reason: 'sms' });
  }
}

function defaultPickup(db) {
  return {
    pickup_name: db.setting('pickup_name'),
    pickup_address: db.setting('pickup_address'),
    pickup_details: db.setting('pickup_details'),
    pickup_photo: db.setting('pickup_photo'),
  };
}

function offerFromBody(body) {
  return {
    title: str(body.title, 120),
    description: str(body.description, 2000),
    lot_description: str(body.lot_description, 300),
    lot_count: int(body.lot_count, 0, 1, 500),
    max_per_contact: int(body.max_per_contact, 1, 1, 500),
    pickup_name: str(body.pickup_name, 120),
    pickup_address: str(body.pickup_address, 300),
    pickup_details: str(body.pickup_details, 1000),
    pickup_photo: /^[A-Za-z0-9_-]+\.jpg$/.test(body.pickup_photo || '') ? body.pickup_photo : '',
    pickup_from: hm(body.pickup_from),
    pickup_to: hm(body.pickup_to),
    photos: (Array.isArray(body.photos) ? body.photos : body.photos ? [body.photos] : []).filter((f) => /^[A-Za-z0-9_-]+\.jpg$/.test(f)).slice(0, config.maxPhotosPerOffer),
  };
}

export function adminRoutes(app, db) {
  // ---- admin re-verification by SMS code ----
  app.get('/admin/verifier', requireContact, async (ctx) => {
    if (!isAdmin(ctx)) throw new HttpError(403);
    const next = safeNext(ctx.query.next);
    let sent = false;
    if (rateLimit(db, `verify:${ctx.state.contact.id}`, 1, MIN)) { await issueLoginCode(db, ctx.state.contact); sent = true; }
    ctx.render('admin/verify', { title: ctx.t('admin.verify_title'), next, sent });
  });

  app.post('/admin/verifier', requireContact, async (ctx) => {
    if (!isAdmin(ctx)) throw new HttpError(403);
    const body = await ctx.body();
    checkCsrf(ctx, body);
    const next = safeNext(body.next);
    if (!rateLimit(db, `verifycode:${ctx.state.contact.id}`, 10, 15 * MIN)) throw new HttpError(429);
    const r = verifyLoginCode(db, ctx.state.contact.phone, body.code || '');
    if (r !== 'ok') return ctx.render('admin/verify', { title: ctx.t('admin.verify_title'), next, sent: true, error: ctx.t(r === 'expired' ? 'login.code_expired' : 'login.code_invalid') });
    db.run('UPDATE sessions SET admin_verified_at = ? WHERE id = ?', Date.now(), ctx.state.session.id);
    ctx.redirect(next);
  });

  // ---- dashboard ----
  app.get('/admin', requireAdmin, (ctx) => {
    const offers = db.all(`SELECT * FROM offers ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 10`);
    for (const o of offers) { o.effective = rules.effectiveStatus(o); o.active = o.effective === 'active'; o.counts = rules.lotCounts(db, o.id); }
    const pending = db.get(`SELECT COUNT(*) n FROM join_requests WHERE status = 'pending'`).n;
    const activeContacts = db.get(`SELECT COUNT(*) n FROM contacts WHERE status = 'active'`).n;
    ctx.render('admin/dashboard', { title: ctx.t('admin.dashboard'), offers, pending, activeContacts, smsOk: smsConfigured() });
  });

  // ---- photos (browser-resized JPEG, raw body) ----
  app.post('/admin/photos', requireAdmin, async (ctx) => {
    checkCsrf(ctx);
    const buf = await ctx.body(config.maxPhotoBytes);
    if (!Buffer.isBuffer(buf) || buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new HttpError(400, 'Not a JPEG');
    const file = `${newToken(20)}.jpg`;
    await fs.promises.writeFile(path.join(config.uploadsDir, file), buf, { mode: 0o640 });
    ctx.json({ file, url: `/media/${file}` });
  });

  // ---- offers ----
  app.get('/admin/offres', requireAdmin, (ctx) => {
    const offers = db.all(`SELECT * FROM offers ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 200`);
    for (const o of offers) { o.effective = rules.effectiveStatus(o); o.active = o.effective === 'active'; o.counts = rules.lotCounts(db, o.id); }
    ctx.render('admin/offers', { title: ctx.t('admin.offers'), offers });
  });

  app.get('/admin/offres/nouvelle', requireAdmin, (ctx) => {
    const form = { title: '', description: '', lot_description: '', lot_count: '', max_per_contact: 1, pickup_from: '', pickup_to: '', photos: [], ...defaultPickup(db) };
    ctx.render('admin/offer_form', { title: ctx.t('offer.form.title'), form, offerId: null, defaults: defaultPickup(db) });
  });

  app.post('/admin/offres', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const form = offerFromBody(body);
    if (!form.title || !form.lot_description || !form.lot_count) {
      return ctx.render('admin/offer_form', { title: ctx.t('offer.form.title'), form, offerId: null, defaults: defaultPickup(db), error: ctx.t('offer.form.required') });
    }
    const id = db.tx(() => {
      const { lastInsertRowid } = db.run(`
        INSERT INTO offers(title, description, lot_description, lot_count, max_per_contact, pickup_name, pickup_address, pickup_details, pickup_photo, pickup_from, pickup_to, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        form.title, form.description, form.lot_description, form.lot_count, form.max_per_contact, form.pickup_name, form.pickup_address, form.pickup_details, form.pickup_photo, form.pickup_from, form.pickup_to, ctx.state.contact.id, Date.now());
      form.photos.forEach((f, i) => db.run('INSERT INTO offer_photos(offer_id, file, position) VALUES (?, ?, ?)', lastInsertRowid, f, i));
      return Number(lastInsertRowid);
    });
    ctx.redirect(`/admin/offres/${id}/confirmer`);
  });

  app.get('/admin/offres/:id/modifier', requireAdmin, (ctx) => {
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status !== 'draft') return ctx.redirect(`/admin/offres/${offer.id}`);
    const form = { ...offer, photos: offer.photos.map((p) => p.file) };
    ctx.render('admin/offer_form', { title: ctx.t('offer.form.edit_title'), form, offerId: offer.id, defaults: defaultPickup(db) });
  });

  app.post('/admin/offres/:id', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status !== 'draft') throw new HttpError(409, 'not a draft');
    const form = offerFromBody(body);
    if (!form.title || !form.lot_description || !form.lot_count) {
      return ctx.render('admin/offer_form', { title: ctx.t('offer.form.edit_title'), form, offerId: offer.id, defaults: defaultPickup(db), error: ctx.t('offer.form.required') });
    }
    db.tx(() => {
      db.run(`UPDATE offers SET title=?, description=?, lot_description=?, lot_count=?, max_per_contact=?, pickup_name=?, pickup_address=?, pickup_details=?, pickup_photo=?, pickup_from=?, pickup_to=? WHERE id=?`,
        form.title, form.description, form.lot_description, form.lot_count, form.max_per_contact, form.pickup_name, form.pickup_address, form.pickup_details, form.pickup_photo, form.pickup_from, form.pickup_to, offer.id);
      db.run('DELETE FROM offer_photos WHERE offer_id = ?', offer.id);
      form.photos.forEach((f, i) => db.run('INSERT INTO offer_photos(offer_id, file, position) VALUES (?, ?, ?)', offer.id, f, i));
    });
    ctx.redirect(`/admin/offres/${offer.id}/confirmer`);
  });

  app.get('/admin/offres/:id/confirmer', requireAdmin, (ctx) => {
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status !== 'draft') return ctx.redirect(`/admin/offres/${offer.id}`);
    const contacts = db.all(`SELECT * FROM contacts WHERE status = 'active' ORDER BY organization, first_name`);
    const previews = {
      fr: offerSmsBody({ first_name: 'Prénom', organization: 'Organisme', lang: 'fr', token: 'xxxxxxxxxxxx' }, offer),
      en: offerSmsBody({ first_name: 'FirstName', organization: 'Organization', lang: 'en', token: 'xxxxxxxxxxxx' }, offer),
    };
    ctx.render('admin/offer_confirm', { title: ctx.t('offer.confirm.title'), offer, contacts, previews, smsOk: smsConfigured() });
  });

  app.post('/admin/offres/:id/publier', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status !== 'draft') return ctx.redirect(`/admin/offres/${offer.id}`);
    const ids = (Array.isArray(body.contacts) ? body.contacts : body.contacts ? [body.contacts] : []).map(Number).filter(Boolean);
    if (!ids.length) { ctx.flash('error', ctx.t('offer.confirm.no_recipients')); return ctx.redirect(`/admin/offres/${offer.id}/confirmer`); }
    const published = rules.publishOffer(db, offer.id);
    // Fire and forget; delivery is visible on the offer page.
    broadcastOffer(db, published, ids).catch((e) => console.error('[broadcast]', e));
    ctx.flash('ok', ctx.t('offer.sent.body'));
    ctx.redirect(`/admin/offres/${offer.id}`);
  });

  app.post('/admin/offres/:id/supprimer', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status !== 'draft') throw new HttpError(409);
    db.run('DELETE FROM offers WHERE id = ?', offer.id);
    ctx.redirect('/admin/offres');
  });

  app.get('/admin/offres/:id', requireAdmin, (ctx) => {
    const offer = loadOffer(db, ctx.params.id);
    if (offer.status === 'draft') return ctx.redirect(`/admin/offres/${offer.id}/confirmer`);
    const sms = db.all(`SELECT s.*, c.first_name, c.last_name, c.organization FROM sms_log s LEFT JOIN contacts c ON c.id = s.contact_id WHERE s.offer_id = ? AND s.kind = 'offer' ORDER BY s.id`, offer.id);
    const penalties = db.all(`SELECT p.*, c.first_name, c.last_name, c.organization FROM penalties p JOIN contacts c ON c.id = p.contact_id WHERE p.target_offer_id = ? AND p.status = 'active' ORDER BY p.type, c.first_name`, offer.id);
    ctx.render('admin/offer', { title: offer.title, offer, sms, penalties });
  });

  // Partial for live refresh of the admin lots table
  app.get('/admin/offres/:id/lots', requireAdmin, (ctx) => {
    const offer = loadOffer(db, ctx.params.id);
    const sms = db.all(`SELECT s.*, c.first_name, c.last_name, c.organization FROM sms_log s LEFT JOIN contacts c ON c.id = s.contact_id WHERE s.offer_id = ? AND s.kind = 'offer' ORDER BY s.id`, offer.id);
    ctx.partial('admin/_offer_lots', { offer, sms });
  });

  app.post('/admin/offres/:id/lots/:lotId', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    const lot = offer.lots.find((l) => l.id === Number(ctx.params.lotId));
    if (!lot) throw new HttpError(404);
    try { rules.adminSetLot(db, lot.id, String(body.action)); }
    catch (e) { if (!(e instanceof rules.RuleError)) throw e; throw new HttpError(409, e.reason); }
    sse.publish(offer.id, 'refresh', { reason: 'admin' });
    if (ctx.req.headers['x-csrf']) return ctx.json({ ok: true });
    ctx.redirect(`/admin/offres/${offer.id}`);
  });

  app.post('/admin/offres/:id/fermer', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    rules.endOffer(db, offer.id, 'closed');
    sse.publish(offer.id, 'refresh', { reason: 'closed' });
    ctx.redirect(`/admin/offres/${offer.id}`);
  });

  app.post('/admin/offres/:id/renvoyer/:contactId', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const offer = loadOffer(db, ctx.params.id);
    if (!offer.active) throw new HttpError(409);
    const c = db.get(`SELECT * FROM contacts WHERE id = ? AND status = 'active'`, Number(ctx.params.contactId));
    if (!c) throw new HttpError(404);
    if (!rateLimit(db, `resend:${offer.id}:${c.id}`, 3, 10 * MIN)) throw new HttpError(429);
    await sendSms(db, { to: c.phone, body: offerSmsBody(c, offer), kind: 'offer', contactId: c.id, offerId: offer.id });
    ctx.flash('ok', ctx.t('contacts.sms_sent'));
    ctx.redirect(`/admin/offres/${offer.id}`);
  });

  app.post('/admin/penalites/:id/lever', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const p = db.get('SELECT * FROM penalties WHERE id = ?', Number(ctx.params.id));
    if (!p) throw new HttpError(404);
    rules.clearPenalty(db, p.id);
    if (p.target_offer_id) sse.publish(p.target_offer_id, 'refresh', { reason: 'penalty' });
    ctx.redirect(body.back && String(body.back).startsWith('/') ? body.back : '/admin');
  });

  // ---- contacts ----
  app.get('/admin/contacts', requireAdmin, (ctx) => {
    const q = str(ctx.query.q, 80).toLowerCase();
    let contacts = db.all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM lots l WHERE l.reserved_by = c.id AND l.status IN ('reserved','picked_up')) AS reservations,
        (SELECT COUNT(*) FROM lots l WHERE l.reserved_by = c.id AND l.status = 'no_show') AS no_shows,
        (SELECT MAX(last_seen_at) FROM sessions s WHERE s.contact_id = c.id) AS last_seen
      FROM contacts c WHERE c.status != 'removed' ORDER BY c.status = 'active' DESC, c.organization, c.first_name`);
    if (q) contacts = contacts.filter((c) => `${c.first_name} ${c.last_name} ${c.organization} ${c.phone}`.toLowerCase().includes(q));
    ctx.render('admin/contacts', { title: ctx.t('contacts.title'), contacts, q });
  });

  app.get('/admin/contacts/nouveau', requireAdmin, (ctx) => {
    ctx.render('admin/contact_form', { title: ctx.t('contacts.add'), form: { lang: 'fr', role: 'user', status: 'active' }, contactId: null });
  });

  const contactFromBody = (body) => ({
    first_name: str(body.first_name, 80), last_name: str(body.last_name, 80), organization: str(body.organization, 120),
    phone_raw: str(body.phone, 30), lang: normalizeLang(body.lang, 'fr'),
    role: body.role === 'admin' ? 'admin' : 'user',
    status: ['active', 'opted_out'].includes(body.status) ? body.status : 'active',
    notes: str(body.notes, 2000),
  });

  app.post('/admin/contacts', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const form = contactFromBody(body);
    const phone = normalizePhone(form.phone_raw);
    const view = (error) => ctx.render('admin/contact_form', { title: ctx.t('contacts.add'), form: { ...form, phone: form.phone_raw }, contactId: null, error });
    if (!form.first_name || !form.phone_raw) return view(ctx.t('contacts.required'));
    if (!phone) return view(ctx.t('contacts.invalid_phone'));
    if (db.get('SELECT id FROM contacts WHERE phone = ?', phone)) return view(ctx.t('contacts.phone_in_use'));
    const now = Date.now();
    const { lastInsertRowid } = db.run(`INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      form.first_name, form.last_name, form.organization, phone, form.lang, form.role, form.status, newToken(12), form.notes, now, now);
    ctx.flash('ok', ctx.t('contacts.saved'));
    ctx.redirect(`/admin/contacts/${lastInsertRowid}`);
  });

  app.get('/admin/contacts/:id', requireAdmin, (ctx) => {
    const c = db.get(`SELECT * FROM contacts WHERE id = ? AND status != 'removed'`, Number(ctx.params.id));
    if (!c) throw new HttpError(404);
    const history = db.all(`SELECT l.*, o.title, o.published_at FROM lots l JOIN offers o ON o.id = l.offer_id WHERE l.reserved_by = ? ORDER BY l.reserved_at DESC LIMIT 20`, c.id);
    const penalties = db.all(`SELECT * FROM penalties WHERE contact_id = ? AND status IN ('pending','active') ORDER BY id DESC`, c.id);
    ctx.render('admin/contact_form', { title: ctx.t('contacts.edit'), form: c, contactId: c.id, link: personalLink(c), history, penalties });
  });

  app.post('/admin/contacts/:id', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const c = db.get(`SELECT * FROM contacts WHERE id = ? AND status != 'removed'`, Number(ctx.params.id));
    if (!c) throw new HttpError(404);
    const form = contactFromBody(body);
    const phone = normalizePhone(form.phone_raw);
    const view = (error) => ctx.render('admin/contact_form', { title: ctx.t('contacts.edit'), form: { ...c, ...form, phone: form.phone_raw }, contactId: c.id, link: personalLink(c), error });
    if (!form.first_name || !form.phone_raw) return view(ctx.t('contacts.required'));
    if (!phone) return view(ctx.t('contacts.invalid_phone'));
    const dup = db.get('SELECT id FROM contacts WHERE phone = ? AND id != ?', phone, c.id);
    if (dup) return view(ctx.t('contacts.phone_in_use'));
    // Never let the last admin demote themself by accident.
    let role = form.role;
    if (c.id === ctx.state.contact.id) role = 'admin';
    db.run(`UPDATE contacts SET first_name=?, last_name=?, organization=?, phone=?, lang=?, role=?, status=?, notes=?, updated_at=? WHERE id=?`,
      form.first_name, form.last_name, form.organization, phone, form.lang, role, form.status, form.notes, Date.now(), c.id);
    ctx.flash('ok', ctx.t('contacts.saved'));
    ctx.redirect(`/admin/contacts/${c.id}`);
  });

  app.post('/admin/contacts/:id/supprimer', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const id = Number(ctx.params.id);
    if (id === ctx.state.contact.id) throw new HttpError(409);
    db.run(`UPDATE contacts SET status = 'removed', updated_at = ? WHERE id = ?`, Date.now(), id);
    db.run('DELETE FROM sessions WHERE contact_id = ?', id);
    ctx.redirect('/admin/contacts');
  });

  app.post('/admin/contacts/:id/lien', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const id = Number(ctx.params.id);
    db.run('UPDATE contacts SET token = ?, updated_at = ? WHERE id = ?', newToken(12), Date.now(), id);
    db.run(`DELETE FROM sessions WHERE contact_id = ? AND via = 'link'`, id);
    ctx.redirect(`/admin/contacts/${id}`);
  });

  app.post('/admin/contacts/:id/sms', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const c = db.get(`SELECT * FROM contacts WHERE id = ? AND status != 'removed'`, Number(ctx.params.id));
    if (!c) throw new HttpError(404);
    if (!rateLimit(db, `adminsms:${c.id}`, 5, 10 * MIN)) throw new HttpError(429);
    const t = translator(c.lang);
    const kind = body.kind === 'link' ? 'link' : 'test';
    const text = kind === 'link' ? t('sms.link', { first: c.first_name, url: personalLink(c) }) : t('sms.test');
    await sendSms(db, { to: c.phone, body: gsmSafe(text), kind, contactId: c.id });
    ctx.flash('ok', ctx.t('contacts.sms_sent'));
    ctx.redirect(`/admin/contacts/${c.id}`);
  });

  // ---- join requests ----
  app.get('/admin/demandes', requireAdmin, (ctx) => {
    const pending = db.all(`SELECT * FROM join_requests WHERE status = 'pending' ORDER BY id`);
    const history = db.all(`SELECT * FROM join_requests WHERE status != 'pending' ORDER BY decided_at DESC LIMIT 30`);
    ctx.render('admin/requests', { title: ctx.t('requests.title'), pending, history });
  });

  app.post('/admin/demandes/:id/approuver', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    const r = db.get(`SELECT * FROM join_requests WHERE id = ? AND status = 'pending'`, Number(ctx.params.id));
    if (!r) throw new HttpError(404);
    const now = Date.now();
    const contact = db.tx(() => {
      let c = db.get('SELECT * FROM contacts WHERE phone = ?', r.phone);
      if (c) {
        db.run(`UPDATE contacts SET status = 'active', first_name = ?, last_name = ?, organization = ?, lang = ?, updated_at = ? WHERE id = ?`,
          r.first_name, r.last_name, r.organization, r.lang, now, c.id);
      } else {
        const { lastInsertRowid } = db.run(`INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?, ?, ?)`,
          r.first_name, r.last_name, r.organization, r.phone, r.lang, newToken(12), r.message, now, now);
        c = { id: Number(lastInsertRowid) };
      }
      db.run(`UPDATE join_requests SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?`, now, ctx.state.contact.id, r.id);
      return db.get('SELECT * FROM contacts WHERE id = ?', c.id);
    });
    const t = translator(contact.lang);
    await sendSms(db, { to: contact.phone, body: gsmSafe(t('sms.welcome', { first: contact.first_name, url: personalLink(contact) })), kind: 'welcome', contactId: contact.id });
    ctx.flash('ok', ctx.t('requests.approved'));
    ctx.redirect('/admin/demandes');
  });

  app.post('/admin/demandes/:id/refuser', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    db.run(`UPDATE join_requests SET status = 'refused', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'`, Date.now(), ctx.state.contact.id, Number(ctx.params.id));
    ctx.flash('ok', ctx.t('requests.refused'));
    ctx.redirect('/admin/demandes');
  });

  // ---- SMS log ----
  app.get('/admin/sms', requireAdmin, (ctx) => {
    const rows = db.all(`SELECT s.*, c.first_name, c.last_name, c.organization, o.title FROM sms_log s LEFT JOIN contacts c ON c.id = s.contact_id LEFT JOIN offers o ON o.id = s.offer_id ORDER BY s.id DESC LIMIT 300`);
    ctx.render('admin/sms', { title: ctx.t('sms.title'), rows, smsOk: smsConfigured() });
  });

  // ---- settings ----
  app.get('/admin/parametres', requireAdmin, (ctx) => {
    ctx.render('admin/settings', { title: ctx.t('settings.title'), s: { app_name: db.setting('app_name', config.appName), ...defaultPickup(db) }, smsOk: smsConfigured() });
  });

  app.post('/admin/parametres', requireAdmin, async (ctx) => {
    const body = await ctx.body(); checkCsrf(ctx, body);
    db.setSetting('app_name', str(body.app_name, 40) || config.appName);
    db.setSetting('pickup_name', str(body.pickup_name, 120));
    db.setSetting('pickup_address', str(body.pickup_address, 300));
    db.setSetting('pickup_details', str(body.pickup_details, 1000));
    db.setSetting('pickup_photo', /^[A-Za-z0-9_-]+\.jpg$/.test(body.pickup_photo || '') ? body.pickup_photo : '');
    ctx.flash('ok', ctx.t('settings.saved'));
    ctx.redirect('/admin/parametres');
  });
}
