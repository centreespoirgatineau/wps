// Time helpers. All timestamps are epoch milliseconds (UTC). Anything shown to
// a person or tied to "the day" uses the configured time zone (America/Toronto).

const fmtCache = new Map();
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Calendar parts of an instant in a time zone. */
export function zonedParts(ms, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (type !== 'literal') p[type] = Number(value);
  }
  if (p.hour === 24) p.hour = 0;
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Instant (ms) for a wall-clock time in a time zone. */
export function zonedToUtc({ y, m, d, h = 0, mi = 0, s = 0 }, tz) {
  let guess = Date.UTC(y, m - 1, d, h, mi, s);
  // Two passes handle DST transitions well enough for end-of-day use.
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    guess -= asUtc - Date.UTC(y, m - 1, d, h, mi, s);
  }
  return guess;
}

/** 23:59:59.999 local on the day containing `ms`. */
export function endOfDay(ms, tz) {
  const p = zonedParts(ms, tz);
  return zonedToUtc({ y: p.y, m: p.m, d: p.d, h: 23, mi: 59, s: 59 }, tz) + 999;
}

/** YYYY-MM-DD local date key. */
export function dateKey(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** "14H05" style used by the organisation for public texts. */
export function formatTimeH(ms, tz) {
  const p = zonedParts(ms, tz);
  return `${p.h}H${String(p.mi).padStart(2, '0')}`;
}

/** Human date, per language. */
export function formatDate(ms, tz, lang = 'fr', withTime = false) {
  const opts = { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' };
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hourCycle = 'h23'; }
  const s = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', opts).format(new Date(ms));
  return lang === 'fr' ? s.replace(/ (\d{2}) h (\d{2})/, ' $1H$2') : s;
}

/** "11 septembre à 15H13" — the chat byline. */
export function formatDateTimeLong(ms, tz, lang = 'fr') {
  const opts = { timeZone: tz, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const s = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', opts).format(new Date(ms));
  return lang === 'fr' ? s.replace(/(\d{1,2}) h (\d{2})/, '$1H$2') : s;
}

export function formatDateTimeShort(ms, tz, lang = 'fr') {
  const opts = { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const s = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', opts).format(new Date(ms));
  return lang === 'fr' ? s.replace(/(\d{2}) h (\d{2})/, '$1H$2') : s;
}

/** Turn "HH:MM" (from a time input) into "14H05" display; empty stays empty. */
export function hmToH(hm, lang = 'fr') {
  if (!hm) return '';
  const [h, m] = hm.split(':');
  return lang === 'fr' ? `${Number(h)}H${m}` : `${h}:${m}`;
}

export const now = () => Date.now();
