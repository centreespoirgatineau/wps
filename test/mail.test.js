// The wording of the internal notices. Pure composition, no network: the
// transport in mail.js is one fetch and is exercised by hand, but what the
// Centre actually reads is worth pinning down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/wps-test-data';
process.env.TIMEZONE = 'America/Toronto';
process.env.APP_URL = 'https://spp.centreespoir.ca';

const { reservationEmail } = await import('../src/lib/mailer.js');

const contact = { first_name: 'Marie', last_name: 'Tremblay', organization: 'Moisson Outaouais', phone: '+18195550002' };
const offer = { id: 12, title: 'Plateaux de sushis', lot_description: '2 plateaux de 24 morceaux', lot_count: 5 };
const lot = { number: 3 };

test('the notice says who, how many, and which offer', () => {
  const { subject, text } = reservationEmail({ contact, offer, lot, held: 2 });
  assert.match(subject, /Plateaux de sushis/);
  assert.match(text, /Moisson Outaouais/, 'the organisation');
  assert.match(text, /Marie Tremblay/, 'the person');
  assert.match(text, /\(819\) 555-0002/, 'the phone, in the house format');
  assert.match(text, /n° 3 sur 5/, 'which lot of how many');
  assert.match(text, /détient maintenant 2 lots/, 'how many they now hold');
  assert.match(text, /\/offres\/12/, 'a link to the offer');
});

test('a single lot is not written "1 lots"', () => {
  const { text } = reservationEmail({ contact, offer, lot, held: 1 });
  assert.match(text, /détient maintenant 1 lot sur/);
  assert.doesNotMatch(text, /1 lots/);
});

test('both platforms write to the same inbox, so each names itself', () => {
  // Subject *and* body: a subject line alone is what gets skimmed.
  const { subject, text } = reservationEmail({ contact, offer, lot, held: 1 });
  assert.match(subject, /spp\.centreespoir\.ca/);
  assert.match(text, /sur spp\.centreespoir\.ca/);
});

test('an administrator override says so, because the rules were not applied', () => {
  const plain = reservationEmail({ contact, offer, lot, held: 1 });
  assert.doesNotMatch(plain.text, /dérogation/);
  const forced = reservationEmail({ contact, offer, lot, held: 1, override: true });
  assert.match(forced.text, /dérogation/);
  assert.match(forced.text, /administrateur/);
});

test('a contact with no organisation still produces a readable notice', () => {
  const { text } = reservationEmail({ contact: { ...contact, organization: '' }, offer, lot, held: 1 });
  assert.match(text, /Organisme : —/);
});
