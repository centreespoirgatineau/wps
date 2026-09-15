// Two audiences, one codebase. A brand is a thin overlay of strings on top of
// the reference dictionaries, and these tests guard the three ways that
// arrangement goes quietly wrong:
//
//   1. an overlay key that matches nothing in the reference — a typo that
//      silently changes nothing at all;
//   2. a new church-flavoured string added to fr.js and never overridden, so
//      the food banks are told about the gospel;
//   3. the opposite — someone strips the gospel out of the reference itself,
//      which is the whole point of the church platform.
//
// No server and no database: just the dictionaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fr from '../src/locales/fr.js';
import en from '../src/locales/en.js';
import sppFr from '../src/locales/spp.fr.js';
import sppEn from '../src/locales/spp.en.js';
import { donateUrl } from '../src/lib/site.js';

// Case-insensitive in JavaScript folds É to é properly, which grep does not.
const CHURCH = {
  fr: /jésus|évangile|église|ministère|paroisse|pasteur|chrétien/i,
  en: /jesus|gospel|church|ministr(y|ies)|parish|pastor|christian/i,
};

for (const [lang, base, overlay] of [['fr', fr, sppFr], ['en', en, sppEn]]) {
  test(`spp/${lang}: every overridden key exists in the reference dictionary`, () => {
    for (const key of Object.keys(overlay)) {
      assert.ok(key in base, `spp.${lang}.js overrides "${key}", which does not exist in ${lang}.js`);
    }
  });

  test(`spp/${lang}: the food banks are never told about the gospel`, () => {
    // Every reference string that speaks of the church network must be replaced.
    const missed = Object.keys(base).filter((k) => CHURCH[lang].test(base[k]) && !(k in overlay));
    assert.deepEqual(missed, [], `these ${lang} strings still name the church network for spp: ${missed.join(', ')}`);
    // And no replacement may reintroduce it.
    const leaked = Object.keys(overlay).filter((k) => CHURCH[lang].test(overlay[k]));
    assert.deepEqual(leaked, [], `spp.${lang}.js names the church network in: ${leaked.join(', ')}`);
  });

  test(`${lang}: the church platform still says why it exists`, () => {
    // The gospel is the reason the jc platform exists (CLAUDE.md §1). If this
    // fails, the reference wording was emptied out — restore it, do not delete
    // this test.
    assert.ok(Object.values(base).some((v) => CHURCH[lang].test(v)));
  });
}

test('the donation link is https, or nothing at all', () => {
  assert.equal(donateUrl(''), '');
  assert.equal(donateUrl('   '), '');
  assert.equal(donateUrl(null), '');
  assert.equal(donateUrl('https://www.zeffy.com/fr-CA/donation-form/abc'), 'https://www.zeffy.com/fr-CA/donation-form/abc');
  assert.equal(donateUrl('http://www.zeffy.com/x'), null, 'plain http is refused');
  assert.equal(donateUrl('javascript:alert(1)'), null, 'the whole list is shown this href');
  assert.equal(donateUrl('zeffy.com/x'), null, 'no scheme, no link');
});
