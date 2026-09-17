// A cross inside the "o" of Espoir, taken from the typeface rather than drawn.
//
//   node brand/build/make-croix.mjs
//
// Three attempts got here. The first used one uniform thickness and read as a
// shape pasted into the letter. The second took the stem and crossbar weights
// off the "t" — right weights, but still a geometric construction. This one
// drops the construction and uses the italic letters themselves: Source Serif 4
// Italic draws a "t" with a calligraphic head, a curved foot and a real
// crossbar, which is the shape David pointed at (he sent the italic "f" of this
// same family).
//
// The cross is a knockout: it is the letter's opening, not an object on top of
// it, so the whole logo stays one colour and works in negative. It is cut with
// an SVG mask rather than a fill rule, because the italic "t" draws its
// crossbar as a *separate contour overlapping the stem* — under `evenodd` the
// crossing would come back as a black notch, and under `nonzero` with reversed
// windings it would too. Inside a mask both contours simply paint black and
// union correctly. (In Illustrator: Pathfinder → Unite on the t's two parts,
// then Minus Front against the "o".)
import fs from 'node:fs';
import path from 'node:path';
import { readFont } from './ttf.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FONTS = path.resolve(here, '../fonts');
const OUT = path.resolve(here, '..');

const serif = readFont(path.join(FONTS, 'SourceSerif4_48pt-Medium.ttf'));
const italic = readFont(path.join(FONTS, 'SourceSerif4-Italic.ttf'));
const sans = readFont(path.join(FONTS, 'SourceSans3-Semibold.ttf'));
const EM = serif.unitsPerEm;

// Measured off the upright font, and kept for the geometric variant that stays
// in the line-up for comparison: the "t" stem and the "t" crossbar.
const STEM = 89.5, BAR = 31.0, SLANT = 12;

const S = 100, LINE_SIZE = 0.34, NAME_TRACK = -0.012, GAP_WORDS = 0.22;
const r = (v, n = 2) => +v.toFixed(n);

// ---- geometry ---------------------------------------------------------------
function flatten(pts, steps = 8) {
  const out = [];
  let i = pts.findIndex((p) => p.on), first;
  if (i === -1) { first = { x: (pts[0].x + pts.at(-1).x) / 2, y: (pts[0].y + pts.at(-1).y) / 2 }; i = 0; }
  else { first = pts[i]; i += 1; }
  let cur = first, c = null;
  out.push({ ...first });
  const quad = (p0, p1, p2) => {
    for (let t = 1; t <= steps; t++) { const u = t / steps, m = 1 - u;
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
// Affine transforms map quadratic control points correctly, so the curves
// survive: nothing is flattened except for the fit test.
const shearAbout = (contours, deg, ox, oy) => {
  const t = Math.tan(deg * Math.PI / 180);
  return contours.map((c) => c.map((p) => ({ x: p.x + (p.y - oy) * t, y: p.y, on: p.on })));
};

/**
 * Clip a contour to y >= cut (Sutherland–Hodgman against one horizontal line).
 *
 * This is how a "t" becomes a cross. What makes a t read as a letter rather
 * than a symbol is its foot: the stem does not stop, it turns and sweeps
 * right. Cut that off and the calligraphy stays — the slanted stem, the
 * tapering, the crossbar sitting slightly off level — while the letter's tell
 * is gone. The contour has to be flattened first, so the result is a polygon
 * rather than curves; at logo size the difference is invisible, and this is a
 * proposal to redraw in Illustrator, not the final artwork.
 */
function clipAbove(contours, cut) {
  const out = [];
  for (const c of contours) {
    const P = flatten(c, 16);
    if (P.every((p) => p.y >= cut)) { out.push(P.map((p) => ({ ...p, on: true }))); continue; }
    // Start walking from a point below the line, so the first run is a whole one.
    const s0 = P.findIndex((p) => p.y < cut);
    const at = (i) => P[(s0 + i) % P.length];
    const cross = (a, b) => ({ x: a.x + (b.x - a.x) * ((cut - a.y) / (b.y - a.y)), y: cut, on: true });
    let run = null;
    for (let i = 0; i < P.length; i++) {
      const a = at(i), b = at(i + 1);
      if (a.y < cut && b.y >= cut) run = [cross(a, b)];              // entering
      else if (a.y >= cut && b.y >= cut) run.push({ ...a, on: true });
      else if (a.y >= cut && b.y < cut) {                            // leaving
        run.push({ ...a, on: true }, cross(a, b));
        if (run.length > 2) out.push(run);
        run = null;
      }
    }
  }
  // A curl cut in half leaves a splinter behind: the tip of the foot rises back
  // above the line and survives as its own little piece, which reads as a stray
  // comma inside the letter. Anything much smaller than the crossbar is not
  // part of the cross.
  const big = Math.max(...out.map(areaOf));
  return out.filter((c) => areaOf(c) > big * 0.12);
}

// ---- the two kinds of cross -------------------------------------------------
/** Drawn: the geometric cross, kept so the imported letters can be judged against it. */
function drawnCross(cb, { wide, tall, barAt, slant = 0, bar = BAR, stem = STEM }) {
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
  return [pts.map((p) => ({ x: p.x + (p.y - cb.cy) * k, y: p.y, on: true }))];
}

function fitDrawn(counter, cb, opts) {
  const fits = (o) => drawnCross(cb, { ...opts, ...o })[0].every((p) => inPoly(counter, p.x, p.y));
  const solve = (key, other, lo, hi) => {
    if (!fits({ ...other, [key]: lo })) return lo;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits({ ...other, [key]: m })) lo = m; else hi = m; }
    return lo;
  };
  const tall = solve('tall', { wide: 0.45 }, 0.45, 1.1) * 0.985;
  const wide = solve('wide', { tall }, 0.45, 1.1) * 0.985;
  return drawnCross(cb, { ...opts, tall, wide });
}

/**
 * Imported: a glyph from the italic, scaled into the counter.
 *
 * The scale is not chosen. It grows until the letter touches the counter's real
 * outline, then stops a hair short — and because a "t" is much taller than it is
 * wide while a counter is nearly round, the position is solved too: at each
 * scale a small grid of offsets is tried, so the letter can sit where it
 * actually fits rather than being shrunk to suit a centre that was assumed.
 */
function fitGlyph(counter, cb, { char, shear = 0, foot }) {
  let raw = italic.contoursOf(italic.glyphFor(char.codePointAt(0)));
  if (foot !== undefined) {
    const g = bbox(raw.flat());
    raw = clipAbove(raw, g.y0 + g.h * foot);
  }
  const gb0 = bbox(raw.flat());
  const base = shear ? shearAbout(raw, shear, gb0.cx, gb0.cy) : raw;
  const bb = bbox(base.flat());

  const place = (k, dx, dy) => base.map((c) => c.map((p) => ({
    x: cb.cx + (p.x - bb.cx) * k + dx, y: cb.cy + (p.y - bb.cy) * k + dy, on: p.on })));
  const fits = (k, dx, dy) =>
    place(k, dx, dy).every((c) => flatten(c, 6).every((p) => inPoly(counter, p.x, p.y)));

  const GRID = 7, SPAN = 0.24;
  const offsets = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const dx = (i / (GRID - 1) - 0.5) * SPAN * cb.w, dy = (j / (GRID - 1) - 0.5) * SPAN * cb.h;
    offsets.push({ dx, dy, d: Math.hypot(dx / cb.w, dy / cb.h) });
  }
  offsets.sort((a, b) => a.d - b.d);           // prefer the most centred placement
  const anyFits = (k) => offsets.find((o) => fits(k, o.dx, o.dy));

  let lo = (cb.h / bb.h) * 0.45, hi = (cb.h / bb.h) * 1.25;
  if (!anyFits(lo)) return place(lo, 0, 0);
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (anyFits(m)) lo = m; else hi = m; }
  const k = lo * 0.99, at = anyFits(k) || { dx: 0, dy: 0 };
  return place(k, at.dx, at.dy);
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
const O_AT = NAME.lastIndexOf('o');
const baselineIn = (f, size, top, h) => top + (h - size * (f.ascender - f.descender)) / 2 + size * f.ascender;
const nameBaseline = baselineIn(serif, S, 0, S);
const lineBaseline = baselineIn(sans, LINE_SIZE * S, S + GAP_WORDS * S, LINE_SIZE * S);
const WIDTH = (() => { const k = S / EM; let p = 0;
  [...NAME].forEach((ch, i) => { p += serif.advanceOf(serif.glyphFor(ch.codePointAt(0))) * k;
    if (i < NAME.length - 1) p += NAME_TRACK * S; }); return p; })();
const HEIGHT = (1 + GAP_WORDS + LINE_SIZE) * S;

// the descriptor, tracked out to the width of the name
const lineD = (() => {
  const k = (LINE_SIZE * S) / sans.unitsPerEm, text = 'BANQUE ALIMENTAIRE';
  const measure = (t) => { let p = 0; [...text].forEach((ch, i) => { p += sans.advanceOf(sans.glyphFor(ch.codePointAt(0))) * k; if (i < text.length - 1) p += t; }); return p; };
  const track = (WIDTH - measure(0)) / (text.length - 1);
  let pen = 0, d = '';
  [...text].forEach((ch, i) => {
    const gid = sans.glyphFor(ch.codePointAt(0));
    d += toPath(sans.contoursOf(gid), LINE_SIZE * S, pen, lineBaseline, sans.unitsPerEm);
    pen += sans.advanceOf(gid) * k;
    if (i < text.length - 1) pen += track;
  });
  return d;
})();

const memo = new Map();
/** → { outer, cross } in font units: the "o" ring, and what to cut out of it. */
function oParts(variant) {
  const key = JSON.stringify(variant);
  if (memo.has(key)) return memo.get(key);
  const sorted = [...serif.contoursOf(serif.glyphFor(111))].sort((a, b) => areaOf(b) - areaOf(a));
  const counter = flatten(sorted[1]);
  const cb = bbox(counter);
  const cross = variant.char ? fitGlyph(counter, cb, variant) : fitDrawn(counter, cb, variant);
  const out = { outer: [sorted[0]], cross };
  memo.set(key, out);
  return out;
}

let uid = 0;
const maskOf = (cutD, x, y, w, h) => {
  const id = `cut${uid++}`;
  return { id, def: `<mask id="${id}" maskUnits="userSpaceOnUse" x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}">`
    + `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="#fff"/>`
    + `<path d="${cutD}" fill="#000"/></mask>` };
};

/** The wordmark: one path for the letters, the "o" masked by the cross. */
function wordSvg(variant) {
  const k = S / EM;
  let pen = 0, rest = '', oPath = '', cutD = '';
  [...NAME].forEach((ch, i) => {
    const gid = serif.glyphFor(ch.codePointAt(0));
    if (variant && i === O_AT) {
      const { outer, cross } = oParts(variant);
      oPath = toPath(outer, S, pen, nameBaseline, EM);
      cutD = toPath(cross, S, pen, nameBaseline, EM);
    } else {
      rest += toPath(serif.contoursOf(gid), S, pen, nameBaseline, EM);
    }
    pen += serif.advanceOf(gid) * k;
    if (i < NAME.length - 1) pen += NAME_TRACK * S;
  });
  const m = cutD ? maskOf(cutD, -10, -10, WIDTH + 20, HEIGHT + 20) : null;
  return `<svg viewBox="0 0 ${r(WIDTH)} ${r(HEIGHT)}" fill="currentColor">${m ? m.def : ''}`
    + `<path d="${rest}"/>`
    + (oPath ? `<path d="${oPath}" mask="url(#${m.id})"/>` : '')
    + `<path d="${lineD}"/></svg>`;
}

/** The "o" alone, blown up. */
function oSvg(variant) {
  const { outer, cross } = oParts(variant);
  const b = bbox([...outer, ...cross].flat()), k = S / EM, pad = 6;
  const x = b.x0 * k - pad, y = nameBaseline - b.y1 * k - pad, w = b.w * k + pad * 2, h = b.h * k + pad * 2;
  const m = maskOf(toPath(cross, S, 0, nameBaseline, EM), x, y, w, h);
  return `<svg viewBox="${r(x)} ${r(y)} ${r(w)} ${r(h)}" fill="currentColor">${m.def}`
    + `<path d="${toPath(outer, S, 0, nameBaseline, EM)}" mask="url(#${m.id})"/></svg>`;
}

const VARIANTS = [
  { key: 'a', label: 'Le « t » italique, tel quel', v: { char: 't' },
    note: 'La lettre elle-même, prise dans Source Serif 4 Italique et mise à l’échelle du contrepoinçon. C’est faisable, et le voici — mais il faut le dire : ça se lit comme un « t » dans le « o », pas comme une croix. C’est le pied qui tourne et la tête en biais qui font lire une lettre.' },
  { key: 'b', label: 'Le « t » italique, pied coupé', v: { char: 't', foot: 0.20 },
    note: 'Le même « t », la boucle du pied retirée. Il ne reste que la main de la police : le fût penché, l’épaisseur qui varie, la traverse légèrement de travers. Rien n’a été dessiné, et cette fois ça se lit comme une croix. C’est celle que je retiendrais.' },
  { key: 'c', label: 'Le « f » italique', v: { char: 'f' },
    note: 'La forme envoyée, telle qu’elle existe déjà dans la famille : c’est le « f » de Source Serif 4 Italique. Superbe lettre, mais la boucle du haut l’emporte sur la croix ; dans le « o » on lit une signature plutôt qu’un symbole.' },
  { key: 'd', label: 'La croix construite, pour comparer', v: { barAt: 0.63, slant: SLANT, stem: 64, bar: 22 },
    note: 'Celle de l’essai précédent : construite et non importée, aux épaisseurs du « t » réduites d’un tiers. Plus nette comme symbole, mais chaque trait y est d’épaisseur constante — ce qu’aucune lettre du mot n’est.' },
];

// ---- the sheet --------------------------------------------------------------
const page = `<title>La croix dans le o</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
 :root{--bg:#FAF9F5;--surface:#fff;--ink:#141413;--ink-2:#5F5E5A;--ink-3:#8C8A84;
       --line:#E8E6DF;--terra:#DA7757;--terra-ink:#B4573A;
       --serif:"Source Serif 4",Georgia,serif;--sans:"Source Sans 3",system-ui,sans-serif;color-scheme:light}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.55 var(--sans);
      padding-block:0 72px;padding-inline:clamp(16px,4vw,48px);-webkit-font-smoothing:antialiased;text-wrap:pretty}
 .wrap{max-width:1020px;margin:0 auto}
 header{padding-block:clamp(36px,6vw,68px) 8px}
 .eyebrow{font:600 12px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--terra-ink)}
 h1{font:500 clamp(32px,5vw,50px)/1.05 var(--serif);letter-spacing:-.015em;margin:14px 0 12px;text-wrap:balance}
 h2{font:500 clamp(21px,3vw,28px)/1.15 var(--serif);margin:0 0 6px}
 .brief,.sub{color:var(--ink-2);max-width:66ch;margin:0 0 20px}
 section{margin-top:clamp(40px,6vw,72px)}
 .plate{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:clamp(24px,4vw,44px);display:grid;place-items:center}
 .row{display:grid;grid-template-columns:130px 1fr;gap:clamp(20px,4vw,44px);align-items:center;width:100%}
 @media(max-width:700px){.row{grid-template-columns:1fr;gap:18px}}
 .row svg{display:block;width:100%;height:auto}
 .cap{margin:14px 4px 0;color:var(--ink-2);font-size:14.5px;max-width:74ch}
 .cap b{color:var(--ink);font-weight:600;font-family:var(--serif);font-size:17px}
 .tiny{display:flex;gap:clamp(18px,4vw,40px);flex-wrap:wrap;align-items:flex-end}
 .tiny figure{margin:0;display:grid;gap:10px;justify-items:start}
 .tiny figcaption{font:500 11.5px/1 var(--sans);color:var(--ink-3);letter-spacing:.05em}
 .tiny svg{display:block;width:200px;height:auto}
 .neg{background:var(--ink);color:var(--bg);border-color:var(--ink)}
 table{width:100%;border-collapse:collapse;font-size:15px;margin-top:6px}
 td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
 td:last-child{color:var(--ink-2)}
 .note{border-left:2px solid var(--terra);padding:2px 0 2px 18px;color:var(--ink-2);max-width:70ch;margin-top:26px}
 .note b{color:var(--ink);font-weight:600}
 footer{margin-top:clamp(40px,6vw,72px);color:var(--ink-3);font-size:13px;border-top:1px solid var(--line);padding-top:18px}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Centre Espoir de Gatineau</div>
  <h1>La croix dans le «&nbsp;o&nbsp;», prise dans la police</h1>
  <p class="brief">La forme envoy&eacute;e est le «&nbsp;f&nbsp;» italique &mdash; celui de Source Serif&nbsp;4, la police du projet. La m&ecirc;me main a dessin&eacute; le «&nbsp;t&nbsp;»&nbsp;: t&ecirc;te attaqu&eacute;e en biais, pied qui tourne, traverse pos&eacute;e de travers. Il n&rsquo;y a donc rien &agrave; transformer, seulement la lettre &agrave; prendre.</p>
  <table>
    <tr><td>Source Serif&nbsp;4 Italique</td><td>la m&ecirc;me famille, la m&ecirc;me licence, ajout&eacute;e au d&eacute;p&ocirc;t</td></tr>
    <tr><td>Inclinaison&nbsp;: <b>12&deg;</b></td><td>celle de la fonte, pas une estimation</td></tr>
    <tr><td>&Eacute;chelle et position</td><td>calcul&eacute;es jusqu&rsquo;au contact du contrepoin&ccedil;on</td></tr>
  </table>
</header>

${VARIANTS.map((v) => `
<section>
  <div class="plate">
    <div class="row"><div>${oSvg(v.v)}</div><div>${wordSvg(v.v)}</div></div>
  </div>
  <p class="cap"><b>${v.label}</b> &mdash; ${v.note}</p>
</section>`).join('')}

<section>
  <h2>&Agrave; petite taille, et en n&eacute;gatif</h2>
  <p class="sub">C&rsquo;est l&agrave; que &ccedil;a se tranche&nbsp;: la croix doit encore se lire, et le mot ne doit pas avoir un point noir au milieu. En n&eacute;gatif la d&eacute;coupe s&rsquo;inverse d&rsquo;elle-m&ecirc;me, ce qui montre qu&rsquo;il s&rsquo;agit bien d&rsquo;une seule forme et non d&rsquo;un dessin pos&eacute; dessus.</p>
  <div class="plate tiny">
    ${VARIANTS.map((v) => `<figure>${wordSvg(v.v)}<figcaption>${v.label}</figcaption></figure>`).join('')}
    <figure>${wordSvg(null)}<figcaption>sans croix</figcaption></figure>
  </div>
  <div class="plate tiny neg" style="margin-top:18px">
    ${VARIANTS.map((v) => `<figure>${wordSvg(v.v)}<figcaption style="color:#8C8A84">${v.label}</figcaption></figure>`).join('')}
  </div>
  <div class="note"><b>La d&eacute;coupe est calcul&eacute;e, pas plac&eacute;e &agrave; l&rsquo;&oelig;il.</b> La lettre grandit et se d&eacute;place jusqu&rsquo;&agrave; toucher le contour r&eacute;el du contrepoin&ccedil;on, puis s&rsquo;arr&ecirc;te juste avant. Elle ne peut donc pas mordre dans le trait du «&nbsp;o&nbsp;», quelle que soit l&rsquo;inclinaison.</div>
</section>

<footer>
  Nom&nbsp;: Source Serif&nbsp;4, taille optique 48, Medium. Descripteur&nbsp;: Source Sans&nbsp;3 Semibold. Croix&nbsp;: Source Serif&nbsp;4 Italique. La croix est une d&eacute;coupe dans la lettre&nbsp;: une seule forme, une seule couleur.
</footer>
</div>
`;

fs.writeFileSync(path.join(OUT, 'croix.html'), page);
console.log('written brand/croix.html');
for (const v of VARIANTS) {
  const b = bbox(oParts(v.v).cross.flat());
  console.log(`  · ${v.key} ${v.label.padEnd(36)} ${b.w.toFixed(0)} x ${b.h.toFixed(0)} unités`);
}
