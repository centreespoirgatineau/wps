// A cross inside the "o" of Espoir, drawn the way the typeface draws.
//
//   node brand/build/make-croix.mjs
//
// The first attempt used one uniform thickness, which is why it read as a shape
// pasted into the letter. A serif does not work that way: its verticals are
// thick and its horizontals thin. This typeface already contains a cross — the
// letter "t" — so its stem and crossbar are measured and reused. The italic
// angle is the font's own, not a guess.
//
// The cross replaces the counter, the hole in the middle of the "o", and is
// knocked out by the fill rule. It is the letter's opening, not an object on
// top of it, so it follows the wordmark's colour everywhere.
import fs from 'node:fs';
import path from 'node:path';
import { readFont } from './ttf.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FONTS = path.resolve(here, '../fonts');
const OUT = path.resolve(here, '..');

const serif = readFont(path.join(FONTS, 'SourceSerif4_48pt-Medium.ttf'));
const sans = readFont(path.join(FONTS, 'SourceSans3-Semibold.ttf'));
const EM = serif.unitsPerEm;

// Measured off this very font, not chosen: see the header.
const STEM = 89.5;          // the "t" stem
const BAR = 31.0;           // the "t" crossbar
const SLANT = 12;           // the italic angle, degrees

const S = 100, LINE_SIZE = 0.34, NAME_TRACK = -0.012, GAP_WORDS = 0.22;
const INK = '#141413', TERRA = '#DA7757';
const r = (v, n = 2) => +v.toFixed(n);

// ---- geometry helpers -------------------------------------------------------
function flatten(pts) {
  const out = [];
  let i = pts.findIndex((p) => p.on), first;
  if (i === -1) { first = { x: (pts[0].x + pts.at(-1).x) / 2, y: (pts[0].y + pts.at(-1).y) / 2 }; i = 0; }
  else { first = pts[i]; i += 1; }
  let cur = first, c = null;
  out.push({ ...first });
  const quad = (p0, p1, p2) => {
    for (let t = 1; t <= 14; t++) { const u = t / 14, m = 1 - u;
      out.push({ x: m * m * p0.x + 2 * m * u * p1.x + u * u * p2.x, y: m * m * p0.y + 2 * m * u * p1.y + u * u * p2.y }); }
  };
  for (let n = 0; n < pts.length; n++) {
    const p = pts[(i + n) % pts.length];
    if (p.on) { if (c) quad(cur, c, p); else out.push({ ...p }); cur = p; c = null; }
    else if (c) { const m = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 }; quad(cur, c, m); cur = m; c = p; }
    else c = p;
  }
  if (c) quad(cur, c, first);
  return out;
}
const inPoly = (P, x, y) => {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i].y > y) !== (P[j].y > y) &&
        x < (P[j].x - P[i].x) * (y - P[i].y) / (P[j].y - P[i].y) + P[i].x) inside = !inside;
  }
  return inside;
};
const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
const areaOf = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a / 2);
};

/**
 * The cross, as a closed contour in font units.
 *   wide/tall  how far the arms reach, as a share of the counter
 *   barAt      crossbar height, 0 = bottom of the counter, 1 = top
 *   slant      degrees; the stem leans, the crossbar stays level, as in italic
 *   stem/bar   the two thicknesses
 */
function cross(cb, { wide, tall, barAt, slant = 0, bar = BAR, stem = STEM }) {
  const w = cb.w * wide, h = cb.h * tall;
  const x0 = cb.cx - w / 2, x1 = cb.cx + w / 2, y0 = cb.cy - h / 2, y1 = cb.cy + h / 2;
  const sx0 = cb.cx - stem / 2, sx1 = cb.cx + stem / 2;
  const by = y0 + h * barAt, by0 = by - bar / 2, by1 = by + bar / 2;
  const pts = [
    { x: sx0, y: y1 }, { x: sx1, y: y1 }, { x: sx1, y: by1 }, { x: x1, y: by1 },
    { x: x1, y: by0 }, { x: sx1, y: by0 }, { x: sx1, y: y0 }, { x: sx0, y: y0 },
    { x: sx0, y: by0 }, { x: x0, y: by0 }, { x: x0, y: by1 }, { x: sx0, y: by1 },
  ];
  const k = Math.tan(slant * Math.PI / 180);
  return pts.map((p) => ({ x: p.x + (p.y - cb.cy) * k, y: p.y, on: true }));
}

/**
 * Open the cross until it just touches the real counter, then stop a hair short.
 * Height and width are solved separately: on a slanted cross it is the stem tips
 * that run out of room first, and shrinking the crossbar to match would leave the
 * arms stranded in the middle of the letter.
 */
function fitted(counterPoly, cb, opts) {
  const fits = (o) => cross(cb, { ...opts, ...o }).every((p) => inPoly(counterPoly, p.x, p.y));
  const solve = (key, other, lo, hi) => {
    if (!fits({ ...other, [key]: lo })) return lo;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits({ ...other, [key]: m })) lo = m; else hi = m; }
    return lo;
  };
  const tall = solve('tall', { wide: 0.45 }, 0.45, 1.1) * 0.985;
  const wide = solve('wide', { tall }, 0.45, 1.1) * 0.985;
  return cross(cb, { ...opts, tall, wide });
}

// ---- setting the wordmark ---------------------------------------------------
function toPath(contours, size, x, baseline, upem) {
  const k = size / upem;
  const X = (v) => r(x + v * k, 3), Y = (v) => r(baseline - v * k, 3);
  let d = '';
  for (const pts of contours) {
    let i = pts.findIndex((p) => p.on), first;
    if (i === -1) { first = { x: (pts[0].x + pts.at(-1).x) / 2, y: (pts[0].y + pts.at(-1).y) / 2 }; i = 0; }
    else { first = pts[i]; i += 1; }
    d += `M${X(first.x)} ${Y(first.y)}`;
    let c = null;
    for (let n = 0; n < pts.length; n++) {
      const p = pts[(i + n) % pts.length];
      if (p.on) { d += c ? `Q${X(c.x)} ${Y(c.y)} ${X(p.x)} ${Y(p.y)}` : `L${X(p.x)} ${Y(p.y)}`; c = null; }
      else if (c) { const m = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 }; d += `Q${X(c.x)} ${Y(c.y)} ${X(m.x)} ${Y(m.y)}`; c = p; }
      else c = p;
    }
    d += c ? `Q${X(c.x)} ${Y(c.y)} ${X(first.x)} ${Y(first.y)}Z` : 'Z';
  }
  return d;
}

const NAME = 'Centre Espoir';
const baselineIn = (f, size, top, h) => top + (h - size * (f.ascender - f.descender)) / 2 + size * f.ascender;
const nameBaseline = baselineIn(serif, S, 0, S);
const lineBaseline = baselineIn(sans, LINE_SIZE * S, S + GAP_WORDS * S, LINE_SIZE * S);

function oContours(variant) {
  const raw = serif.contoursOf(serif.glyphFor(111));
  if (!variant) return raw;
  const sorted = [...raw].sort((a, b) => areaOf(b) - areaOf(a));
  const counterPoly = flatten(sorted[1]);
  return [sorted[0], fitted(counterPoly, bbox(counterPoly), variant)];
}

function setName(variant) {
  const k = S / serif.unitsPerEm;
  let pen = 0, d = '';
  const oIndex = NAME.lastIndexOf('o');
  [...NAME].forEach((ch, i) => {
    const gid = serif.glyphFor(ch.codePointAt(0));
    const contours = i === oIndex ? oContours(variant) : serif.contoursOf(gid);
    d += toPath(contours, S, pen, nameBaseline, serif.unitsPerEm);
    pen += serif.advanceOf(gid) * k;
    if (i < NAME.length - 1) pen += NAME_TRACK * S;
  });
  return { d, width: pen };
}

const plainWidth = setName(null).width;
const lineD = (() => {
  const k = (LINE_SIZE * S) / sans.unitsPerEm, text = 'BANQUE ALIMENTAIRE';
  const measure = (t) => { let p = 0; [...text].forEach((ch, i) => { p += sans.advanceOf(sans.glyphFor(ch.codePointAt(0))) * k; if (i < text.length - 1) p += t; }); return p; };
  const track = (plainWidth - measure(0)) / (text.length - 1);
  let pen = 0, d = '';
  [...text].forEach((ch, i) => {
    const gid = sans.glyphFor(ch.codePointAt(0));
    d += toPath(sans.contoursOf(gid), LINE_SIZE * S, pen, lineBaseline, sans.unitsPerEm);
    pen += sans.advanceOf(gid) * k;
    if (i < text.length - 1) pen += track;
  });
  return d;
})();
const H = (1 + GAP_WORDS + LINE_SIZE) * S;

// The lighter pairing keeps the typeface's ratio (2.9 : 1) but steps the whole
// cross down, because a stem drawn at the letter's own weight fills a counter
// far more than it fills open space — the "o" goes visibly darker than its
// neighbours, which is the opposite of subtle.
const LIGHT = { stem: 64, bar: 22 };

const VARIANTS = [
  { key: 'a', label: 'Droite, poids du « t »', opts: { barAt: 0.63, slant: 0 },
    note: 'Les épaisseurs relevées sur la police, telles quelles : montant 0,0895 em, traverse 0,031 em. Verticale grasse, horizontale fine, comme le reste du mot. C’est la plus juste typographiquement, et la plus lourde : le « o » se remarque.' },
  { key: 'b', label: 'Droite, allégée', opts: { barAt: 0.63, slant: 0, ...LIGHT },
    note: 'Le même rapport gras-fin, réduit d’un tiers. La croix se lit de près sans que la lettre s’assombrisse de loin. C’est celle que je retiendrais.' },
  { key: 'c', label: 'Italique, poids du « t »', opts: { barAt: 0.63, slant: SLANT },
    note: 'Inclinée à 12°, l’angle italique de Source Serif 4. La traverse reste horizontale, comme dans un vrai italique ; seuls les flancs du montant penchent.' },
  { key: 'd', label: 'Italique, allégée', opts: { barAt: 0.63, slant: SLANT, ...LIGHT },
    note: 'L’inclinaison et le trait allégé ensemble. La croix respire dans la rondeur de la lettre et donne un mouvement que la version droite n’a pas.' },
];

// ---- the sheet --------------------------------------------------------------
const word = (v) => { const n = setName(v); return `<svg viewBox="0 0 ${r(n.width)} ${r(H)}" fill="${INK}" fill-rule="evenodd"><path d="${n.d}"/><path d="${lineD}"/></svg>`; };
const justO = (v) => {
  const contours = oContours(v);
  const b = bbox(contours.flat()), k = S / EM;
  return `<svg viewBox="${r(b.x0 * k - 5)} ${r(nameBaseline - b.y1 * k - 5)} ${r(b.w * k + 10)} ${r(b.h * k + 10)}" fill="${INK}" fill-rule="evenodd"><path d="${toPath(contours, S, 0, nameBaseline, EM)}"/></svg>`;
};

const page = `<title>La croix dans le o</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
 :root{--bg:#FAF9F5;--surface:#fff;--soft:#F8EDE6;--ink:#141413;--ink-2:#5F5E5A;--ink-3:#8C8A84;
       --line:#E8E6DF;--terra:#DA7757;--terra-ink:#B4573A;
       --serif:"Source Serif 4",Georgia,serif;--sans:"Source Sans 3",system-ui,sans-serif;color-scheme:light}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.55 var(--sans);
      padding-block:0 72px;padding-inline:clamp(16px,4vw,48px);-webkit-font-smoothing:antialiased}
 .wrap{max-width:1020px;margin:0 auto}
 header{padding-block:clamp(36px,6vw,68px) 8px}
 .eyebrow{font:600 12px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--terra-ink)}
 h1{font:500 clamp(32px,5vw,50px)/1.05 var(--serif);letter-spacing:-.015em;margin:14px 0 12px;text-wrap:balance}
 h2{font:500 clamp(21px,3vw,28px)/1.15 var(--serif);margin:0 0 6px}
 .brief,.sub{color:var(--ink-2);max-width:66ch;margin:0 0 20px}
 section{margin-top:clamp(40px,6vw,72px)}
 .plate{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:clamp(24px,4vw,44px);display:grid;place-items:center}
 .row{display:grid;grid-template-columns:150px 1fr;gap:clamp(20px,4vw,44px);align-items:center;width:100%}
 @media(max-width:700px){.row{grid-template-columns:1fr;gap:18px}}
 .row svg{display:block;width:100%;height:auto}
 .cap{margin:14px 4px 0;color:var(--ink-2);font-size:14.5px;max-width:74ch}
 .cap b{color:var(--ink);font-weight:600;font-family:var(--serif);font-size:17px}
 .tiny{display:flex;gap:clamp(18px,4vw,40px);flex-wrap:wrap;align-items:flex-end;place-items:end}
 .tiny figure{margin:0;display:grid;gap:10px;justify-items:start}
 .tiny figcaption{font:500 11.5px/1 var(--sans);color:var(--ink-3);letter-spacing:.05em}
 .tiny svg{display:block;height:auto}
 table{width:100%;border-collapse:collapse;font-size:15px;margin-top:6px}
 th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
 th{font:600 11px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--terra-ink)}
 td:last-child{color:var(--ink-2)}
 .note{border-left:2px solid var(--terra);padding:2px 0 2px 18px;color:var(--ink-2);max-width:70ch;margin-top:26px}
 .note b{color:var(--ink);font-weight:600}
 footer{margin-top:clamp(40px,6vw,72px);color:var(--ink-3);font-size:13px;border-top:1px solid var(--line);padding-top:18px}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Centre Espoir de Gatineau</div>
  <h1>La croix dans le «&nbsp;o&nbsp;», deuxième essai</h1>
  <p class="brief">La première avait une seule épaisseur, d’où son air de forme collée dans la lettre. Un serif ne se dessine pas ainsi. Celle-ci reprend les épaisseurs du «&nbsp;t&nbsp;» de la police, qui est déjà une croix, et son angle italique.</p>
  <table>
    <tr><th>Mesuré sur la police</th><th></th></tr>
    <tr><td>Montant&nbsp;: <b>0,0895&nbsp;em</b></td><td>la tige du «&nbsp;t&nbsp;»</td></tr>
    <tr><td>Traverse&nbsp;: <b>0,031&nbsp;em</b></td><td>la barre du «&nbsp;t&nbsp;»</td></tr>
    <tr><td>Contraste&nbsp;: <b>2,9 : 1</b></td><td>le même que celui du «&nbsp;o&nbsp;»</td></tr>
    <tr><td>Inclinaison&nbsp;: <b>12°</b></td><td>l’angle italique de Source Serif 4</td></tr>
  </table>
</header>

${VARIANTS.map((v) => `
<section>
  <div class="plate">
    <div class="row"><div>${justO(v.opts)}</div><div>${word(v.opts)}</div></div>
  </div>
  <p class="cap"><b>${v.label}</b> — ${v.note}</p>
</section>`).join('')}

<section>
  <h2>À petite taille</h2>
  <p class="sub">C’est là que ça se tranche. À cette taille la croix doit encore se lire comme une croix, et le mot ne doit pas avoir un point noir au milieu.</p>
  <div class="plate tiny">
    ${VARIANTS.map((v) => `<figure><div style="width:200px">${word(v.opts)}</div><figcaption>${v.label}</figcaption></figure>`).join('')}
    <figure><div style="width:200px">${word(null)}</div><figcaption>sans croix</figcaption></figure>
  </div>
  <div class="note"><b>La croix s’ajuste toute seule.</b> Sa taille n’est pas choisie&nbsp;: le script la fait grandir jusqu’à ce qu’elle touche presque le contrepoinçon réel de la lettre, puis s’arrête. Elle ne peut donc jamais mordre dans le trait du «&nbsp;o&nbsp;», quelle que soit l’inclinaison.</div>
</section>

<footer>
  Source Serif 4 Medium, taille optique 48. La croix est une découpe dans la lettre&nbsp;: elle suit la couleur du mot, en encre comme en négatif, et reste une seule forme.
</footer>
</div>
`;

fs.writeFileSync(path.join(OUT, 'croix.html'), page);
console.log('written brand/croix.html');
for (const v of VARIANTS) {
  const c = oContours(v.opts)[1];
  const b = bbox(c);
  console.log(`  · ${v.key} ${v.label.padEnd(30)} croix ${b.w.toFixed(0)} x ${b.h.toFixed(0)} unités`);
}
