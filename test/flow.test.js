// End-to-end HTTP flow against a real server process (SMS in dry-run).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
    return { status: res.status, location: res.headers.get('location'), text, json: () => JSON.parse(text) };
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
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(t); resolve(); } });
  });
  // First admin via CLI
  await new Promise((resolve) => {
    const p = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'scripts/make-admin.js', '8195550001', 'David', 'Hatin', 'Centre Espoir', 'fr'],
      { env: { ...process.env, DATA_DIR: dataDir, APP_URL: BASE }, stdio: 'ignore' });
    p.on('exit', resolve);
  });
});

after(() => { proc?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function loginByCode(c, phone) {
  const r1 = await c.post('/connexion', { form: { phone } });
  assert.equal(r1.status, 200);
  const code = /dry-run code: <code>(\d{6})<\/code>/.exec(r1.text)?.[1];
  assert.ok(code, 'dev code shown');
  const r2 = await c.post('/connexion/code', { form: { phone, code } });
  assert.equal(r2.status, 303);
  return r2.location;
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
  assert.match(r.text, /Tableau de bord/);
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
  assert.match(r.text, /Surplus alimentaire aujourd(&#39;|')hui/);
  assert.match(r.text, /Food surplus today/);
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
  assert.match(r.text, /\(819\) 555-0002/);
  assert.match(r.text, /Reserve/); // English UI for John
  const jcsrf = /name="csrf" content="([^"]+)"/.exec(r.text)[1];
  const lot2 = /data-reserve="(\d+)"/.exec(r.text)[1];
  assert.notEqual(lot2, lotId);
  r = await john.post(`/offres/${offerId}/lots/${lot2}/reserver`, { json: {}, headers: { 'X-CSRF': jcsrf } });
  assert.equal(r.json().ok, true);
  // Taken lot cannot be reserved again by John (max) nor by anyone
  r = await john.post(`/offres/${offerId}/lots/${lotId}/reserver`, { json: {}, headers: { 'X-CSRF': jcsrf } });
  assert.equal(r.status, 409);

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
  // Marie cancels her own reservation
  r = await marie.post(`/offres/${offer2}/lots/${l3}/annuler`, { json: {}, headers: { 'X-CSRF': mcsrf } });
  assert.equal(r.json().ok, true);

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
