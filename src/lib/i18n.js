import fr from '../locales/fr.js';
import en from '../locales/en.js';

const dicts = { fr, en };
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
