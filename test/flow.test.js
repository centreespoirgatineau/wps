// End-to-end HTTP flow against a real server process (SMS in dry-run).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wps-flow-'));
let proc;

// Tiny cookie-jar client
function client() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  async function req(method, url, { form, json, headers = {}, raw } = {}) {
    const h = { Cookie: cookieHeader(), ...headers };
    let body;
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (raw) body = raw;
    const res = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = sc.split(';');
      const [k, v] = pair.split('=');
      if (attrs.some((a) => /max-age=0/i.test(a))) jar.delete(k.trim()); else jar.set(k.trim(), v);
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text, json: () => JSON.parse(text),
      headers: { csp: res.headers.get('content-security-policy') } };
  }
  const c = { jar, get: (u, o) => req('GET', u, o), post: (u, o) => req('POST', u, o) };
  c.csrf = async (u = '/moi') => { const r = await c.get(u); return /name="csrf" content="([^"]+)"/.exec(r.text)?.[1]; };
  return c;
}

before(async () => {
  proc = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'src/server.js'], {
    env: { ...process.env, NODE_ENV: 'development', DATA_DIR: dataDir, PORT: String(PORT), APP_URL: BASE, SMS_DRY_RUN: '1', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write(d));
  await new Promise((resolve, reject) => {
    // Generous: on a cold machine (files not yet cached, a virus scanner
    // reading node.exe and the sources for the first time) boot can take well
    // over 8 s, and a timeout here fails the whole file for no real reason.
    const t = setTimeout(() => reject(new Error('server did not start')), 30000);
    proc.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
  });
  // First admin via CLI
  await new Promise((resolve) => {
    const p = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'scripts/make-admin.js', '8195550001', 'David', 'Hatin', 'Centre Espoir', 'fr'],
      { env: { ...process.env, DATA_DIR: dataDir, APP_URL: BASE }, stdio: 'ignore' });
    p.on('exit', resolve);
  });
});

after(async () => {
  // Wait for the server to actually exit: on Windows it still holds the SQLite
  // file for a moment afterwards, and deleting it too early fails the run with
  // EBUSY even though every test passed.
  if (proc && proc.exitCode === null) {
    const ended = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await ended;
  }
  for (let i = 0; i < 30; i++) {
    try { fs.rmSync(dataDir, { recursive: true, force: true }); return; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
});

async function loginByCode(c, phone) {
  const r1 = await c.post('/connexion', { form: { phone } });
  assert.equal(r1.status, 200);
  const code = /dry-run code: <code>(\d{6})<\/code>/.exec(r1.text)?.[1];
  assert.ok(code, 'dev code shown');
  const r2 = await c.post('/connexion/code', { form: { phone, code } });
  assert.equal(r2.status, 303);
  return r2.location;
}

// The admin signs in by code, and codes are rate-limited per phone (5 / 15 min
// in production). Tests that only need admin rights share one session rather
// than spending a login each.
let sharedAdmin = null;
async function adminClient() {
  if (!sharedAdmin) { sharedAdmin = client(); await loginByCode(sharedAdmin, '(819) 555-0001'); }
  return sharedAdmin;
}

test('unknown phone is told to request access', async () => {
  const c = client();
  const r = await c.post('/connexion', { form: { phone: '(819) 555-9999' } });
  assert.match(r.text, /n’est pas sur la liste/);
  assert.match(r.text, /\/demande\?phone=/);
});

test('invalid phone is rejected', async () => {
  const c = client();
  const r = await c.post('/connexion', { form: { phone: '123' } });
  assert.match(r.text, /pas valide/);
});

test('full admin → offer → contact → reserve → chat flow', async () => {
  const admin = client();
  const loc = await loginByCode(admin, '(819) 555-0001');
  assert.equal(loc, '/admin');
  let r = await admin.get('/admin');
  assert.equal(r.status, 200);
  assert.match(r.text, /Accueil/);
  const csrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];

  // Create two contacts
  r = await admin.post('/admin/contacts', { form: { _csrf: csrf, first_name: 'Marie', last_name: 'Tremblay', organization: 'Église de la Grâce', phone: '(819) 555-0002', lang: 'fr', role: 'user', status: 'active' } });
  assert.equal(r.status, 303);
  r = await admin.post('/admin/contacts', { form: { _csrf: csrf, first_name: 'John', last_name: 'Smith', organization: 'Hope Church', phone: '(613) 555-0003', lang: 'en', role: 'user', status: 'active' } });
  assert.equal(r.status, 303);
  // Duplicate phone refused
  r = await admin.post('/admin/contacts', { form: { _csrf: csrf, first_name: 'Dup', phone: '(819) 555-0002', lang: 'fr' } });
  assert.match(r.text, /déjà utilisé/);

  // Photo upload (fake JPEG header)
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
  r = await admin.post('/admin/photos', { raw: jpeg, headers: { 'Content-Type': 'image/jpeg', 'X-CSRF': csrf } });
  assert.equal(r.status, 200);
  const photo = r.json().file;
  assert.match(photo, /\.jpg$/);

  // Draft offer
  r = await admin.post('/admin/offres', { form: { _csrf: csrf, title: 'Plateaux de sushis', lot_description: '10 plateaux', lot_count: '2', max_per_contact: '1', pickup_name: 'Centre Espoir', pickup_address: '791 boulevard Maloney Est', pickup_to: '17:00', photos: photo } });
  assert.equal(r.status, 303);
  const offerId = /\/admin\/offres\/(\d+)\/confirmer/.exec(r.location)[1];
  r = await admin.get(r.location);
  assert.match(r.text, /Surplus disponible aujourd(&#39;|')hui/);
  assert.match(r.text, /Surplus available today/);
  assert.match(r.text, /Marie Tremblay/);

  // Publish to both contacts
  const ids = [...r.text.matchAll(/name="contacts" value="(\d+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 3); // David (admin) + Marie + John
  r = await admin.post(`/admin/offres/${offerId}/publier`, { form: new URLSearchParams([['_csrf', csrf], ...ids.map((i) => ['contacts', i])]) });
  assert.equal(r.status, 303);
  await new Promise((res) => setTimeout(res, 300));
  r = await admin.get(`/admin/offres/${offerId}`);
  assert.match(r.text, /Simulé/); // dry-run deliveries logged
  assert.equal((r.text.match(/Simulé/g) || []).length, 3);

  // Marie opens her personal link (from the sms log via admin contact page)
  r = await admin.get('/admin/contacts');
  const marieId = /\/admin\/contacts\/(\d+)"[^>]*>\s*<strong>Marie/.exec(r.text)[1];
  r = await admin.get(`/admin/contacts/${marieId}`);
  const token = /\/r\/([A-Za-z0-9]+)</.exec(r.text)[1];

  const marie = client();
  r = await marie.get(`/o/${offerId}/${token}`);
  assert.equal(r.status, 303);
  assert.equal(r.location, `/offres/${offerId}`);
  r = await marie.get(`/offres/${offerId}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Plateaux de sushis/);
  assert.match(r.text, /data-reserve="(\d+)"/);
  const lotId = /data-reserve="(\d+)"/.exec(r.text)[1];
  const mcsrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];

  // Reserve without CSRF → 403
  r = await marie.post(`/offres/${offerId}/lots/${lotId}/reserver`, { json: {} });
  assert.equal(r.status, 403);
  // Reserve properly
  r = await marie.post(`/offres/${offerId}/lots/${lotId}/reserver`, { json: {}, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.status, 200);
  assert.equal(r.json().ok, true);
  // Second reservation blocked by max_per_contact
  const r2 = await marie.get(`/offres/${offerId}/lots`);
  assert.match(r2.text, /Votre lot/);
  assert.match(r2.text, /maximum de 1 lot/);

  // Chat
  r = await marie.post(`/offres/${offerId}/messages`, { json: { body: 'Je passe à 15H' }, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.status, 200);
  r = await marie.get(`/offres/${offerId}/messages?after=0`);
  assert.equal(r.json().messages.length, 1);
  assert.equal(r.json().messages[0].mine, true);

  // John sees Marie's lot with her phone, reserves the other one
  r = await admin.get('/admin/contacts');
  const johnId = /\/admin\/contacts\/(\d+)"[^>]*>\s*<strong>John/.exec(r.text)[1];
  r = await admin.get(`/admin/contacts/${johnId}`);
  const jtoken = /\/r\/([A-Za-z0-9]+)</.exec(r.text)[1];
  const john = client();
  await john.get(`/o/${offerId}/${jtoken}`);
  r = await john.get(`/offres/${offerId}`);
  assert.match(r.text, /Marie T\./);
  assert.doesNotMatch(r.text, /\(819\) 555-0002/); // phones are for admins only
  assert.doesNotMatch(r.text, /tel:/);
  assert.match(r.text, /Reserve/); // English UI for John
  const jcsrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];
  const lot2 = /data-reserve="(\d+)"/.exec(r.text)[1];
  assert.notEqual(lot2, lotId);
  r = await john.post(`/offres/${offerId}/lots/${lot2}/reserver`, { json: {}, headers: { 'X-CSRF': jcsrf } });
  assert.equal(r.json().ok, true);
  // Taken lot cannot be reserved again by John (max) nor by anyone
  r = await john.post(`/offres/${offerId}/lots/${lotId}/reserver`, { json: {}, headers: { 'X-CSRF': jcsrf } });
  assert.equal(r.status, 409);

  // The same offer page, seen by an admin, does show the numbers.
  r = await admin.get(`/offres/${offerId}`);
  assert.match(r.text, /\(819\) 555-0002/);
  assert.match(r.text, /tel:/);

  // Admin marks Marie picked up, John no-show; closes the offer
  r = await admin.post(`/admin/offres/${offerId}/lots/${lotId}`, { json: { action: 'picked_up' }, headers: { 'X-CSRF': csrf } });
  assert.equal(r.status, 200);
  r = await admin.post(`/admin/offres/${offerId}/lots/${lot2}`, { json: { action: 'no_show' }, headers: { 'X-CSRF': csrf } });
  assert.equal(r.status, 200);
  r = await admin.post(`/admin/offres/${offerId}/fermer`, { form: { _csrf: csrf } });
  assert.equal(r.status, 303);
  r = await marie.get(`/offres/${offerId}`);
  assert.match(r.text, /Cette offre est terminée/);
  r = await marie.post(`/offres/${offerId}/messages`, { json: { body: 'trop tard' }, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.status, 409);

  // Second offer: John blocked (no-show), Marie cooldown
  r = await admin.post('/admin/offres', { form: { _csrf: csrf, title: 'Pains', lot_description: '20 pains', lot_count: '3', max_per_contact: '2' } });
  const offer2 = /\/admin\/offres\/(\d+)\/confirmer/.exec(r.location)[1];
  r = await admin.post(`/admin/offres/${offer2}/publier`, { form: new URLSearchParams([['_csrf', csrf], ...ids.map((i) => ['contacts', i])]) });
  r = await john.get(`/offres/${offer2}`);
  assert.match(r.text, /Your last lot was not picked up/);
  assert.doesNotMatch(r.text, /data-reserve="\d+"(?![^>]*disabled)/);
  r = await marie.get(`/offres/${offer2}`);
  assert.match(r.text, /id="cooldown"/);
  const l3 = /data-reserve="(\d+)"/.exec(r.text)[1];
  r = await marie.post(`/offres/${offer2}/lots/${l3}/reserver`, { json: {}, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.status, 409);
  assert.equal(r.json().reason, 'cooldown');
  // Admin lifts Marie's penalty → she can reserve
  r = await admin.get(`/admin/offres/${offer2}`);
  const penId = /<li><div class="grow"><strong>Marie Tremblay<\/strong>[\s\S]*?\/admin\/penalites\/(\d+)\/lever/.exec(r.text)[1];
  r = await admin.post(`/admin/penalites/${penId}/lever`, { form: { _csrf: csrf, back: '/admin' } });
  assert.equal(r.status, 303, r.text.slice(0, 300));
  r = await marie.post(`/offres/${offer2}/lots/${l3}/reserver`, { json: {}, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.json().ok, true, r.text);
  // There is no way back: a contact cannot cancel their own reservation.
  r = await marie.post(`/offres/${offer2}/lots/${l3}/annuler`, { json: {}, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.status, 404);

  // Offers list shows both
  r = await marie.get('/offres');
  assert.match(r.text, /Pains/); assert.match(r.text, /Plateaux de sushis/);

  // Marie opts out → cannot log in anymore
  r = await marie.post('/reglages/retrait', { form: { _csrf: mcsrf } });
  assert.equal(r.status, 200);
  r = await marie.get('/offres');
  assert.equal(r.status, 303);
  const again = client();
  r = await again.post('/connexion', { form: { phone: '(819) 555-0002' } });
  assert.match(r.text, /retiré de la liste/);

  // Join request flow
  const visitor = client();
  r = await visitor.post('/demande', { form: { first_name: 'Paul', organization: 'Assemblée', phone: '(819) 555-0004', lang: 'fr', message: 'Bonjour' } });
  assert.match(r.text, /Demande envoyée/);
  r = await admin.get('/admin/demandes');
  const reqId = /\/admin\/demandes\/(\d+)\/approuver/.exec(r.text)[1];
  r = await admin.post(`/admin/demandes/${reqId}/approuver`, { form: { _csrf: csrf } });
  assert.equal(r.status, 303);
  r = await admin.get('/admin/sms');
  assert.match(r.text, /Bienvenue/);
  // Paul can now log in
  const paul = client();
  const where = await loginByCode(paul, '(819) 555-0004');
  assert.equal(where, '/offres');

  // Language switch persists on the contact
  r = await paul.get('/offres?lang=en');
  assert.equal(r.status, 303);
  r = await paul.get('/offres');
  assert.match(r.text, /Current offers/);
});

test('test accounts: link-only sign-in, never texted', async () => {
  const admin = client();
  await loginByCode(admin, '(819) 555-0001');
  let r = await admin.get('/admin');
  const csrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];
  r = await admin.post('/admin/contacts', { form: { _csrf: csrf, first_name: 'Testeur', organization: 'Test', phone: '(819) 555-0100', lang: 'fr', no_sms: '1' } });
  const id = /\/admin\/contacts\/(\d+)/.exec(r.location)[1];
  // Phone login refused with a hint
  const t = client();
  r = await t.post('/connexion', { form: { phone: '(819) 555-0100' } });
  assert.match(r.text, /lien personnel/);
  assert.doesNotMatch(r.text, /name="code"/);
  // Any SMS to this contact is skipped, not sent
  r = await admin.post(`/admin/contacts/${id}/sms`, { form: { _csrf: csrf, kind: 'test' } });
  r = await admin.get('/admin/sms');
  assert.match(r.text, /Compte de test/);
  // Link works
  r = await admin.get(`/admin/contacts/${id}`);
  const token = /\/r\/([A-Za-z0-9]+)</.exec(r.text)[1];
  r = await t.get(`/r/${token}`);
  assert.equal(r.status, 303);
  r = await t.get('/offres');
  assert.equal(r.status, 200);
});

test('admin pages need admin role; link sessions need a fresh code for admin', async () => {
  const admin = client();
  await loginByCode(admin, '(819) 555-0001');
  let r = await admin.get('/admin/contacts');
  const davidId = /\/admin\/contacts\/(\d+)"[^>]*>\s*<strong>David/.exec(r.text)[1];
  r = await admin.get(`/admin/contacts/${davidId}`);
  const token = /\/r\/([A-Za-z0-9]+)</.exec(r.text)[1];
  // Via link: contact pages fine, admin requires verification
  const viaLink = client();
  await viaLink.get(`/r/${token}`);
  r = await viaLink.get('/offres');
  assert.equal(r.status, 200);
  r = await viaLink.get('/admin');
  assert.equal(r.status, 303);
  assert.match(r.location, /\/admin\/verifier/);
  // Non-admin is forbidden
  const paul = client();
  await loginByCode(paul, '(819) 555-0004');
  r = await paul.get('/admin');
  assert.equal(r.status, 403);
});

test('demonstration number: signs in with no code, looks at everything, changes nothing', async () => {
  // A fresh published offer, so there is certainly an available lot to try.
  const admin = await adminClient();
  let csrf = await admin.csrf('/admin');
  let r = await admin.post('/admin/offres', { form: { _csrf: csrf, title: 'Yogourts', lot_description: '12 yogourts', lot_count: '2', max_per_contact: '1' } });
  const offerId = /\/admin\/offres\/(\d+)\/confirmer/.exec(r.location)[1];
  r = await admin.get(r.location);
  // The demo account is not offered as a recipient: it can never receive a text.
  assert.doesNotMatch(r.text, /\(555\) 555-5555/);
  const ids = [...r.text.matchAll(/name="contacts" value="(\d+)"/g)].map((m) => m[1]);
  await admin.post(`/admin/offres/${offerId}/publier`, { form: new URLSearchParams([['_csrf', csrf], ...ids.map((i) => ['contacts', i])]) });

  // Straight in from the login screen — no code step, no text message.
  const demo = client();
  r = await demo.post('/connexion', { form: { phone: '(555) 555-5555' } });
  assert.equal(r.status, 303);
  assert.equal(r.location, '/offres');
  r = await demo.get('/offres');
  assert.equal(r.status, 200);
  assert.match(r.text, /démonstration/i);

  // It reads the offer and the conversation, with no control to write with.
  r = await demo.get(`/offres/${offerId}`);
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /id="chat-form"/);
  assert.doesNotMatch(r.text, /data-reserve=/);
  const lotId = /data-lot="(\d+)"/.exec(r.text)[1]; // lots are listed, just not reservable

  // Refused by the rules engine, not merely hidden in the page.
  const dCsrf = await demo.csrf(`/offres/${offerId}`);
  r = await demo.post(`/offres/${offerId}/lots/${lotId}/reserver`, { json: {}, headers: { 'X-CSRF': dCsrf } });
  assert.equal(r.status, 403);
  assert.equal(r.json().reason, 'demo');
  // The lot really is still free afterwards.
  r = await admin.get(`/admin/offres/${offerId}`);
  assert.doesNotMatch(r.text, /Démonstration/);

  // Writing in the chat is refused too.
  r = await demo.post(`/offres/${offerId}/messages`, { json: { body: 'coucou' }, headers: { 'X-CSRF': dCsrf } });
  assert.equal(r.status, 403);
  assert.equal(r.json().reason, 'demo');

  // It cannot retire itself and close the door on everyone.
  const meCsrf = await demo.csrf('/reglages');
  r = await demo.post('/reglages/retrait', { form: { _csrf: meCsrf } });
  assert.equal(r.status, 303);
  r = await demo.get('/offres');
  assert.equal(r.status, 200);

  // Never texted, whatever an admin asks for.
  r = await admin.get('/admin/contacts');
  const demoId = /\/admin\/contacts\/(\d+)"[^>]*>\s*<strong>Démonstration/.exec(r.text)[1];
  csrf = await admin.csrf('/admin');
  await admin.post(`/admin/contacts/${demoId}/sms`, { form: { _csrf: csrf, kind: 'test' } });
  r = await admin.get('/admin/sms');
  assert.match(r.text, /Compte de test/);
  assert.doesNotMatch(r.text, /\(555\) 555-5555[\s\S]{0,400}?(Envoyé|Livré)/);
});

test('French by default, whatever the browser asks for', async () => {
  // An English phone or laptop must still land on the French interface:
  // English is a choice the visitor makes, not a negotiation.
  const en = client();
  let r = await en.get('/connexion', { headers: { 'Accept-Language': 'en-CA,en;q=0.9' } });
  assert.match(r.text, /Connexion/);
  assert.match(r.text, /Numéro de cellulaire/);
  assert.doesNotMatch(r.text, /Phone number/);
  assert.match(r.text, /<html lang="fr"/);
  // The About page too, for a visitor with no cookie and no account.
  r = await en.get('/a-propos', { headers: { 'Accept-Language': 'en-US,en' } });
  assert.match(r.text, /<html lang="fr"/);
  // Asking for English explicitly still works, and sticks.
  r = await en.get('/connexion?lang=en');
  assert.equal(r.status, 303);
  r = await en.get('/connexion', { headers: { 'Accept-Language': 'fr-CA,fr' } });
  assert.match(r.text, /<html lang="en"/);
});

test('the login page has no header, but keeps a way into English', async () => {
  const c = client();
  let r = await c.get('/connexion');
  assert.doesNotMatch(r.text, /<header/);
  // The language link lives in the page instead, so a visitor can still switch.
  assert.match(r.text, /href="\/connexion\?lang=en"[^>]*>English</);
  // The code step is the same view and must stay bare too.
  r = await c.post('/connexion', { form: { phone: '(819) 555-0001' } });
  assert.match(r.text, /name="code"/);
  assert.doesNotMatch(r.text, /<header/);
  // Other visitor pages keep their header.
  r = await c.get('/a-propos');
  assert.match(r.text, /<header/);
});

test('an admin can erase an offer and everything attached to it', async () => {
  const admin = await adminClient();
  let csrf = await admin.csrf('/admin');
  let r = await admin.post('/admin/offres', { form: { _csrf: csrf, title: 'Pommes', lot_description: '5 pommes', lot_count: '2', max_per_contact: '1' } });
  const offerId = /\/admin\/offres\/(\d+)\/confirmer/.exec(r.location)[1];
  r = await admin.get(r.location);
  const ids = [...r.text.matchAll(/name="contacts" value="(\d+)"/g)].map((m) => m[1]);
  await admin.post(`/admin/offres/${offerId}/publier`, { form: new URLSearchParams([['_csrf', csrf], ...ids.map((i) => ['contacts', i])]) });
  await new Promise((res) => setTimeout(res, 200));

  // A reservation and a message, so there is something to clean up.
  r = await admin.get(`/offres/${offerId}`);
  const lotId = /data-reserve="(\d+)"/.exec(r.text)[1];
  const ocsrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];
  await admin.post(`/offres/${offerId}/lots/${lotId}/reserver`, { json: {}, headers: { 'X-CSRF': ocsrf } });
  await admin.post(`/offres/${offerId}/messages`, { json: { body: 'à supprimer' }, headers: { 'X-CSRF': ocsrf } });

  // A running offer must be closed first.
  csrf = await admin.csrf('/admin');
  r = await admin.post(`/admin/offres/${offerId}/supprimer`, { form: { _csrf: csrf } });
  assert.equal(r.status, 303);
  r = await admin.get(`/admin/offres/${offerId}`);
  assert.equal(r.status, 200, 'still there while it is running');

  await admin.post(`/admin/offres/${offerId}/fermer`, { form: { _csrf: csrf } });
  r = await admin.post(`/admin/offres/${offerId}/supprimer`, { form: { _csrf: csrf } });
  assert.equal(r.status, 303);
  assert.match(r.location, /\/admin\/offres$/);

  // Gone from both the admin and the contact side.
  r = await admin.get(`/admin/offres/${offerId}`);
  assert.equal(r.status, 404);
  r = await admin.get(`/offres/${offerId}`);
  assert.equal(r.status, 404);
  r = await admin.get('/admin/offres');
  assert.doesNotMatch(r.text, /Pommes/);
  // And its deliveries are out of the text log.
  r = await admin.get('/admin/sms');
  assert.doesNotMatch(r.text, /Pommes/);
});

test('the slideshow is served at /presentation, to anyone, with a policy that runs it', async () => {
  const visitor = client();
  const r = await visitor.get('/presentation');
  assert.equal(r.status, 200, 'no sign-in needed');
  assert.match(r.text, /Un outil pour annoncer/);
  assert.match(r.text, /Évangile de Jésus-Christ/);
  // The deck carries one inline script; the page's own policy must allow
  // exactly it, by hash, or the slideshow will not advance.
  const script = /<script>([\s\S]*?)<\/script>/.exec(r.text)[1];
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  const csp = r.headers?.csp ?? null;
  assert.ok(csp === null || csp.includes(`'sha256-${hash}'`));
  // The phones inside it are the real pages, inlined — not links to a server.
  assert.doesNotMatch(r.text, /src="\/static\//);
  // It must fit any screen: no fixed canvas, and it stacks on a tall one.
  assert.doesNotMatch(r.text, /width:1920px/);
  assert.match(r.text, /max-aspect-ratio/);
  // Scrolling is the navigation: the deck snaps one slide at a time.
  assert.match(r.text, /scroll-snap-type:y mandatory/);
  assert.match(r.text, /scroll-snap-align:start/);
  assert.match(r.text, /IntersectionObserver/);
  // A scroll that starts on a phone picture must reach the page, not the frame.
  assert.match(r.text, /iframe\{[^}]*pointer-events:none/);
  // The mark is the vector, inlined — the retired PNGs must not come back.
  assert.doesNotMatch(r.text, /image\/png/);
  assert.match(r.text, /data:image\/svg\+xml/);
  // The address is a setting: the deck writes it as a placeholder and the route
  // fills it in, so none may survive to the page.
  assert.doesNotMatch(r.text, /__ORIGIN__|__HOST__/);
  assert.match(r.text, /http:\/\/127\.0\.0\.1:\d+\/demande/);
});

test('the Twilio webhooks refuse an unsigned request instead of crashing', async () => {
  // They once answered 500: verify() built its URL from publicUrl() without
  // importing it, so the signature could never be checked and every webhook
  // Twilio sent — delivery receipts, STOP and START — failed silently.
  const anyone = client();
  for (const path of ['/twilio/status', '/twilio/inbound']) {
    const r = await anyone.post(path, { form: { MessageSid: 'SM0', MessageStatus: 'delivered' } });
    assert.equal(r.status, 403, `${path} must refuse, not crash`);
  }
});

test('the public address can be changed from Réglages, and links follow it', async () => {
  const admin = await adminClient();
  let csrf = await admin.csrf('/admin');
  let r = await admin.get('/admin/parametres');
  assert.match(r.text, /name="public_url"/);

  // A contact's personal link is built from the current address.
  r = await admin.get('/admin/contacts');
  const id = /\/admin\/contacts\/(\d+)/.exec(r.text)[1];
  r = await admin.get(`/admin/contacts/${id}`);
  const before = /(https?:\/\/[^/]+)\/r\//.exec(r.text)[1];

  const base = {
    pickup_name: 'Centre Espoir', pickup_address: '791 Maloney', pickup_details: '',
    sms_fr: '', sms_en: '',
  };
  const save = async (publicUrlValue) => {
    const c = await admin.csrf('/admin');
    return admin.post('/admin/parametres', { form: { ...base, _csrf: c, public_url: publicUrlValue } });
  };
  const linkOn = async () => (await admin.get(`/admin/contacts/${id}`)).text;

  // A trailing slash must be tolerated, and the links must follow.
  r = await save('https://jc.centreespoir.ca/');
  assert.equal(r.status, 303);
  let page = await linkOn();
  assert.ok(page.includes('https://jc.centreespoir.ca/r/'), 'links follow the new address');
  assert.ok(!page.includes(before + '/r/'), 'the old address is gone');

  // Something that is not an address is refused, and nothing changes.
  r = await save('pas une adresse');
  assert.equal(r.status, 303);
  page = await linkOn();
  assert.ok(page.includes('https://jc.centreespoir.ca/r/'), 'the bad value was not stored');

  // Emptying the field falls back to APP_URL from the environment.
  await save('');
  page = await linkOn();
  assert.ok(page.includes(before + '/r/'), 'back to the address from the environment');
});

test('a published offer can still be corrected, with the lot count frozen and the contacts told', async () => {
  const admin = await adminClient();
  let r = await admin.get('/admin');
  const csrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];

  r = await admin.post('/admin/offres', { form: { _csrf: csrf, title: 'Pains', lot_description: '2 sacs',
    lot_count: '3', max_per_contact: '1', pickup_name: 'Centre Espoir', pickup_address: '791 Maloney', pickup_from: '13:00', pickup_to: '15:00' } });
  const offerId = /\/admin\/offres\/(\d+)\//.exec(r.location)[1];
  const conf = await admin.get(`/admin/offres/${offerId}/confirmer`);
  const ids = [...conf.text.matchAll(/name="contacts" value="(\d+)"/g)].map((m) => m[1]);
  r = await admin.post(`/admin/offres/${offerId}/publier`, { form: { _csrf: csrf, contacts: ids[0] } });
  assert.equal(r.status, 303);

  // The edit form opens on a live offer, and refuses to let the count be typed.
  const form = await admin.get(`/admin/offres/${offerId}/modifier`);
  assert.equal(form.status, 200, 'a published offer is editable');
  assert.match(form.text, /name="lot_count"[^>]*disabled|disabled[^>]*name="lot_count"|value="3" disabled/,
    'the number of lots is not an editable field');

  // Move the pickup window and the address; try to shrink the lots at the same time.
  r = await admin.post(`/admin/offres/${offerId}`, { form: { _csrf: csrf, title: 'Pains', lot_description: '2 sacs',
    lot_count: '1', max_per_contact: '1', pickup_name: 'Centre Espoir', pickup_address: '12 rue Principale',
    pickup_from: '16:00', pickup_to: '18:00' } });
  assert.equal(r.status, 303);
  assert.equal(r.location, `/offres/${offerId}`, 'an edit lands back on the offer page');

  const page = await admin.get(`/offres/${offerId}`);
  assert.match(page.text, /12 rue Principale/, 'the new address is shown');
  assert.match(page.text, /16H00/, 'the new pickup window is shown');
  assert.equal((page.text.match(/data-lot="/g) || []).length, 3, 'still three lots, not one');
  assert.match(page.text, /Offre modifiée/, 'the change is announced in the chat');
  assert.match(page.text, /adresse/, 'the announcement names what changed');

  // An offer that has ended is left alone.
  await admin.post(`/admin/offres/${offerId}/fermer`, { form: { _csrf: csrf } });
  const closed = await admin.get(`/admin/offres/${offerId}/modifier`);
  assert.equal(closed.status, 303, 'an ended offer is not editable');
});

test('over HTTP: an admin reserves past the maximum, a contact is still stopped at it', async () => {
  const admin = await adminClient();
  let r = await admin.get('/admin');
  const csrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];

  r = await admin.post('/admin/offres', { form: { _csrf: csrf, title: 'Conserves', lot_description: '1 caisse',
    lot_count: '4', max_per_contact: '1', pickup_name: 'Centre Espoir', pickup_address: '791 Maloney' } });
  const id = /\/admin\/offres\/(\d+)\//.exec(r.location)[1];
  const conf = await admin.get(`/admin/offres/${id}/confirmer`);
  const ids = [...conf.text.matchAll(/name="contacts" value="(\d+)"/g)].map((m) => m[1]);
  await admin.post(`/admin/offres/${id}/publier`, { form: { _csrf: csrf, contacts: ids[0] } });

  const page = await admin.get(`/offres/${id}`);
  assert.match(page.text, /administrateur/, 'the page says the limits are not being applied');
  const lots = [...page.text.matchAll(/data-reserve="(\d+)"/g)].map((m) => m[1]);
  const take = (c, lot, tok) => c.post(`/offres/${id}/lots/${lot}/reserver`, { json: {}, headers: { 'X-CSRF': tok } });

  const tok = /name="csrf" content="([^"]+)"/.exec(page.text)[1];
  assert.match((await take(admin, lots[0], tok)).text, /"ok":true/);
  assert.match((await take(admin, lots[1], tok)).text, /"ok":true/, 'a second lot despite max_per_contact = 1');

  // The same endpoint, the same offer, an ordinary contact: one lot and no more.
  // A contact created for this test: the others have reserved earlier in this
  // file and would be inside their cooldown here, which would prove the wrong
  // thing. This one arrives by personal link, since login codes are
  // rate-limited per phone.
  let rr = await admin.post('/admin/contacts', { form: { _csrf: csrf, first_name: 'Lucie', last_name: 'Gagnon',
    organization: 'Maison du Partage', phone: '(819) 555-0077', lang: 'fr', role: 'user', status: 'active' } });
  const lucieId = /\/admin\/contacts\/(\d+)/.exec(rr.location) ? /\/admin\/contacts\/(\d+)/.exec(rr.location)[1] : null;
  const card = await admin.get(lucieId ? `/admin/contacts/${lucieId}` : '/admin/contacts');
  const link = /(\/r\/[A-Za-z0-9_-]+)/.exec(card.text)[1];
  const lucie = client();
  await lucie.get(link);

  // She was not a recipient of this offer, but the offer page is open to the
  // whole list — what matters is that the maximum is applied to her.
  const hers = await lucie.get(`/offres/${id}`);
  const herTok = /name="csrf" content="([^"]+)"/.exec(hers.text)[1];
  const herLots = [...hers.text.matchAll(/data-reserve="(\d+)"/g)].map((m) => m[1]);
  assert.ok(herLots.length >= 2, 'she can see free lots to reserve');
  assert.match((await take(lucie, herLots[0], herTok)).text, /"ok":true/);
  const second = await take(lucie, herLots[1], herTok);
  assert.equal(second.status, 409, 'the limit still applies to a contact');
  assert.doesNotMatch(second.text, /"ok":true/);
});
