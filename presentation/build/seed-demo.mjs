// Build a believable, entirely fictional dataset for the presentation.
// Nothing here touches the live database: it writes to its own DATA_DIR.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEMO = process.argv[2];
process.env.DATA_DIR = DEMO;
process.env.TIMEZONE = 'America/Toronto';

const { openDb } = await import(new URL('../../src/lib/db.js', import.meta.url).href);
const { endOfDay } = await import(new URL('../../src/lib/time.js', import.meta.url).href);

fs.mkdirSync(path.join(DEMO, 'uploads'), { recursive: true });
const db = openDb(path.join(DEMO, 'wps.sqlite'));
const now = Date.now();
const H = 3600000, D = 86400000;

db.run('DELETE FROM messages'); db.run('DELETE FROM lots'); db.run('DELETE FROM penalties');
db.run('DELETE FROM offer_photos'); db.run('DELETE FROM offers'); db.run('DELETE FROM contacts');
db.run('DELETE FROM sms_log'); db.run('DELETE FROM sessions');

db.setSetting('pickup_name', 'Centre Espoir de Gatineau');
db.setSetting('pickup_address', '791 boulevard Maloney Est, Gatineau, QC J8P 1H8');

// Fictional churches and ministries — names invented for the demonstration.
const PEOPLE = [
  ['Daniel', 'Mercier', 'Église Nouvelle Vie de Gatineau', '+18195550110'],
  ['Sarah', 'Nadeau', 'Ministère La Moisson', '+18195550111'],
  ['Emmanuel', 'Kabeya', 'Église Pentecôte de l’Outaouais', '+18195550112'],
  ['Josée', 'Lavoie', 'Centre chrétien Le Rocher', '+18195550113'],
  ['Micheline', 'Joseph', 'Église Bethesda', '+18195550114'],
  ['Marc', 'Bélanger', 'Assemblée chrétienne de Buckingham', '+18195550115'],
  ['Ruth', 'Étienne', 'Mission Vie Abondante', '+18195550116'],
  ['Jean-Philippe', 'Roy', 'Ministère Shalom', '+18195550117'],
  ['Nathalie', 'Ouellet', 'Église La Bonne Nouvelle', '+18195550118'],
  ['Samuel', 'Fortin', 'Communauté chrétienne d’Aylmer', '+18195550119'],
  ['Claire', 'Dubé', 'Église réformée Saint-Jean', '+18195550120'],
  ['Paul', 'Tremblay', 'Église baptiste évangélique de Hull', '+18195550121'],
];

const contacts = PEOPLE.map(([first, last, org, phone], i) => {
  const { lastInsertRowid } = db.run(
    `INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'fr', 'user', 'active', ?, ?, ?)`,
    first, last, org, phone, 'demo' + String(i).padStart(8, '0'), now - 60 * D, now - 60 * D);
  return db.get('SELECT * FROM contacts WHERE id = ?', lastInsertRowid);
});
// The administrator, so the offers have an author.
db.run(`INSERT INTO contacts(first_name, last_name, organization, phone, lang, role, status, token, created_at, updated_at)
        VALUES ('David', 'Hatin', 'Centre Espoir de Gatineau', '+18192085721', 'fr', 'admin', 'active', 'demoadminxx', ?, ?)`,
  now - 90 * D, now - 90 * D);

const byOrg = (needle) => contacts.find((c) => c.organization.includes(needle));

function makeOffer({ title, lotDescription, lots, max = 1, daysAgo, publishedHour, status, reservations = [], noShows = [] }) {
  const day = now - daysAgo * D;
  const published = daysAgo === 0 ? now - publishedHour * H : day;
  const expires = endOfDay(published, 'America/Toronto');
  const { lastInsertRowid } = db.run(
    `INSERT INTO offers(title, description, lot_description, lot_count, max_per_contact, pickup_name, pickup_address, pickup_to,
       status, created_by, created_at, published_at, expires_at, ended_at)
     VALUES (?, '', ?, ?, ?, 'Centre Espoir de Gatineau', '791 boulevard Maloney Est, Gatineau, QC J8P 1H8', '17:00', ?, 1, ?, ?, ?, ?)`,
    title, lotDescription, lots, max, status, published - H, published, expires,
    status === 'active' ? null : expires);
  const offerId = Number(lastInsertRowid);
  for (let n = 1; n <= lots; n++) {
    db.run(`INSERT INTO lots(offer_id, number, status) VALUES (?, ?, 'available')`, offerId, n);
  }
  const rows = db.all('SELECT * FROM lots WHERE offer_id = ? ORDER BY number', offerId);
  reservations.forEach((org, i) => {
    const c = byOrg(org);
    const lot = rows[i];
    const st = noShows.includes(org) ? 'no_show' : (status === 'active' ? 'reserved' : 'picked_up');
    db.run('UPDATE lots SET status = ?, reserved_by = ?, reserved_at = ? WHERE id = ?',
      st, c.id, published + (i + 1) * 7 * 60000, lot.id);
  });
  return offerId;
}

// ---- Today: the live offer -------------------------------------------------
const live = makeOffer({
  title: 'Plateaux de sushis et salades',
  lotDescription: '6 plateaux de sushis + 4 salades repas',
  lots: 8, max: 1, daysAgo: 0, publishedHour: 2, status: 'active',
  // The viewer (Nouvelle Vie) deliberately has NOT reserved yet, so the slides
  // can show real « Réserver » buttons next to lots already taken by others.
  reservations: ['La Moisson', 'Pentecôte', 'Le Rocher', 'Bethesda', 'Shalom'],
});

const chat = [
  ['La Moisson', 'Bonjour à tous ! Je passe vers 14H avec la camionnette.'],
  ['Pentecôte', 'Parfait. Est-ce que quelqu’un peut prendre mon lot ? Je suis pris jusqu’à 16H.'],
  ['La Moisson', 'Oui, je peux le prendre et te le laisser au presbytère en revenant.'],
  ['Pentecôte', 'Merci beaucoup, ça me sauve la journée.'],
  ['Bethesda', 'Nous servons un repas ce soir à 17H30, les salades vont être parfaites.'],
  ['Nouvelle Vie', 'Je serai sur place à 13H30 si quelqu’un veut partager le transport.'],
];
let t = now - 100 * 60000;
for (const [org, body] of chat) {
  db.run('INSERT INTO messages(offer_id, contact_id, body, created_at) VALUES (?, ?, ?, ?)',
    live, byOrg(org).id, body, (t += 14 * 60000));
}

// ---- Past offers -----------------------------------------------------------
makeOffer({ title: 'Pains et viennoiseries', lotDescription: '20 pains + viennoiseries assorties',
  lots: 12, max: 2, daysAgo: 4, status: 'expired',
  reservations: ['Bethesda', 'Shalom', 'Buckingham', 'Bonne Nouvelle', 'Aylmer', 'Vie Abondante', 'Saint-Jean', 'Hull'] });

makeOffer({ title: 'Fruits et légumes frais', lotDescription: 'Caisse de 15 kg, fruits et légumes mélangés',
  lots: 10, max: 1, daysAgo: 9, status: 'expired',
  reservations: ['Nouvelle Vie', 'La Moisson', 'Le Rocher', 'Shalom', 'Bethesda', 'Aylmer', 'Hull'] });

makeOffer({ title: 'Produits laitiers', lotDescription: '8 L de lait, yogourts et fromages',
  lots: 6, max: 1, daysAgo: 16, status: 'expired',
  reservations: ['Buckingham', 'Bonne Nouvelle', 'Vie Abondante', 'Saint-Jean'] });

// A delivery log for the live offer, so it looks like the texts went out.
for (const c of contacts) {
  db.run(`INSERT INTO sms_log(contact_id, offer_id, to_phone, kind, body, status, created_at, updated_at)
          VALUES (?, ?, ?, 'offer', ?, 'delivered', ?, ?)`,
    c.id, live, c.phone,
    `Bonjour ${c.first_name} (${c.organization}). Surplus alimentaire aujourd'hui au Centre Espoir : Plateaux de sushis et salades, 8 lot(s). Réserver : https://wps.davidhatin.com/o/${live}/${c.token}`,
    now - 2 * H, now - 2 * H);
}

const viewer = byOrg('Nouvelle Vie');
console.log(JSON.stringify({
  liveOffer: live,
  viewerToken: viewer.token,
  viewerName: `${viewer.first_name} ${viewer.last_name}`,
  contacts: contacts.length,
  offers: db.get('SELECT COUNT(*) n FROM offers').n,
}, null, 2));
