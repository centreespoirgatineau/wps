import fr from '../locales/fr.js';
import en from '../locales/en.js';
import sppFr from '../locales/spp.fr.js';
import sppEn from '../locales/spp.en.js';
import { config } from '../config.js';

// A brand overlays only the strings that differ for its audience; everything
// else falls through to the reference dictionaries above, so a wording fix is
// made once for both platforms.
const OVERLAYS = { spp: { fr: sppFr, en: sppEn } };
const over = OVERLAYS[config.brand] || {};
const dicts = { fr: { ...fr, ...(over.fr || {}) }, en: { ...en, ...(over.en || {}) } };
export const LANGS = ['fr', 'en'];

export function normalizeLang(l, dflt = 'fr') {
  l = String(l || '').toLowerCase().slice(0, 2);
  return LANGS.includes(l) ? l : dflt;
}

/** Build a translator for a language. t(key, {vars}) */
export function translator(lang) {
  const d = dicts[lang] || dicts.fr;
  const t = (key, vars) => {
    let s = d[key] ?? dicts.fr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v ?? '');
    return s;
  };
  t.lang = lang;
  return t;
}
