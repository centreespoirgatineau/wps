// Explore a cross inside the "o" of Espoir.
//
//   node brand/build/make-croix.mjs
//
// The "o" has two contours: the outer letterform and the counter, the hole in
// the middle. Drop the counter, put a cross in its place, and let the fill rule
// knock it out — so the cross is not drawn on top of the letter, it *is* the
// letter's opening. Nothing is added to the wordmark; something is only shaped
// differently.
import fs from 'node:fs';
import path from 'node:path';
import { readFont } from './ttf.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FONTS = path.resolve(here, '../fonts');
const OUT = path.resolve(here, '..');

// Medium 500 — the weight David is drawing with, at the nearest optical size
// available as a fixed cut.
const serif = readFont(path.join(FONTS, 'SourceSerif4_48pt-Medium.ttf'));
const sans = readFont(path.join(FONTS, 'SourceSans3-Semibold.ttf'));

const S = 100, LINE_SIZE = 0.34, NAME_TRACK = -0.012, GAP_WORDS = 0.22;
const INK = '#141413', TERRA = '#DA7757';
const r = (v, n = 2) => +v.toFixed(n);

const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};
const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};

/** Contours as SVG path data, in font units flipped to SVG's y-down. */
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

/**
 * A Latin cross as a closed contour, in font units, fitted to the counter.
 *   arm      thickness of both strokes, as a fraction of the counter's width
 *   barY     where the crossbar sits, 0 = bottom of the counter, 1 = top
 *   fill     how much of the counter the cross spans
 */
function crossContour(cb, { arm, barY, fill }) {
  const w = cb.w * fill, h = cb.h * fill;
  const x0 = cb.cx - w / 2, x1 = cb.cx + w / 2;
  const y0 = cb.cy - h / 2, y1 = cb.cy + h / 2;
  const t = cb.w * arm;                       // stroke thickness
  const sx0 = cb.cx - t / 2, sx1 = cb.cx + t / 2;
  const by = y0 + h * barY, by0 = by - t / 2, by1 = by + t / 2;
  // Clockwise, so it winds against the outer contour and reads as a hole.
  return [
    { x: sx0, y: y1 }, { x: sx1, y: y1 }, { x: sx1, y: by1 }, { x: x1, y: by1 },
    { x: x1, y: by0 }, { x: sx1, y: by0 }, { x: sx1, y: y0 }, { x: sx0, y: y0 },
    { x: sx0, y: by0 }, { x: x0, y: by0 }, { x: x0, y: by1 }, { x: sx0, y: by1 },
  ].map((p) => ({ ...p, on: true }));
}

// ---- set "Centre Espoir", swapping the o's counter for a cross -------------
const NAME = 'Centre Espoir';
const baselineIn = (f, size, top, h) => top + (h - size * (f.ascender - f.descender)) / 2 + size * f.ascender;
const nameBaseline = baselineIn(serif, S, 0, S);
const lineBaseline = baselineIn(sans, LINE_SIZE * S, S + GAP_WORDS * S, LINE_SIZE * S);

function setName(variant) {
  const k = S / serif.unitsPerEm;
  let pen = 0, d = '', oIndex = NAME.lastIndexOf('o');
  [...NAME].forEach((ch, i) => {
    const gid = serif.glyphFor(ch.codePointAt(0));
    let contours = serif.contoursOf(gid);
    if (i === oIndex && variant) {
      // The counter is the contour with the smaller enclosed area.
      const sorted = [...contours].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
      const outer = sorted[0], counter = sorted[1];
      contours = [outer, crossContour(bbox(counter), variant)];
    }
    d += toPath(contours, S, pen, nameBaseline, serif.unitsPerEm);
    pen += serif.advanceOf(gid) * k;
    if (i < NAME.length - 1) pen += NAME_TRACK * S;
  });
  return { d, width: pen };
}

function setLine(nameWidth) {
  const k = (LINE_SIZE * S) / sans.unitsPerEm;
  const text = 'BANQUE ALIMENTAIRE';
  const measure = (track) => {
    let pen = 0;
    [...text].forEach((ch, i) => { pen += sans.advanceOf(sans.glyphFor(ch.codePointAt(0))) * k; if (i < text.length - 1) pen += track; });
    return pen;
  };
  const track = (nameWidth - measure(0)) / (text.length - 1);
  let pen = 0, d = '';
  [...text].forEach((ch, i) => {
    const gid = sans.glyphFor(ch.codePointAt(0));
    d += toPath(sans.contoursOf(gid), LINE_SIZE * S, pen, lineBaseline, sans.unitsPerEm);
    pen += sans.advanceOf(gid) * k;
    if (i < text.length - 1) pen += track;
  });
  return d;
}

const VARIANTS = [
  { key: 'a', label: 'Croix latine', arm: 0.30, barY: 0.66, fill: 0.86,
    note: 'La proportion classique : montant plus long que la traverse, traverse dans le tiers supérieur. C’est celle qui se lit le plus vite comme une croix.' },
  { key: 'b', label: 'Croix fine', arm: 0.22, barY: 0.66, fill: 0.92,
    note: 'Les mêmes proportions, les branches plus minces. Le « o » garde davantage de blanc, donc le mot reste plus léger. La plus discrète des quatre.' },
  { key: 'c', label: 'Croix grecque', arm: 0.28, barY: 0.50, fill: 0.80,
    note: 'Branches égales, traverse au centre. Se lit d’abord comme une forme, ensuite comme une croix. La moins appuyée.' },
  { key: 'd', label: 'Croix haute', arm: 0.26, barY: 0.72, fill: 0.94,
    note: 'Traverse plus haute et branches touchant presque le bord du contrepoinçon. La plus affirmée, et la plus risquée aux petites tailles.' },
];

const plain = setName(null);
const lineD = setLine(plain.width);
const H = (1 + GAP_WORDS + LINE_SIZE) * S;

const word = (variant) => {
  const n = setName(variant);
  return `<svg viewBox="0 0 ${r(n.width)} ${r(H)}" fill="${INK}" fill-rule="evenodd"><path d="${n.d}"/><path d="${lineD}"/></svg>`;
};
const justO = (variant) => {
  const gid = serif.glyphFor(111);
  let contours = serif.contoursOf(gid);
  if (variant) {
    const sorted = [...contours].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    contours = [sorted[0], crossContour(bbox(sorted[1]), variant)];
  }
  const b = bbox(contours.flat());
  const k = S / serif.unitsPerEm;
  const d = toPath(contours, S, 0, nameBaseline, serif.unitsPerEm);
  return `<svg viewBox="${r(b.x0 * k - 4)} ${r(nameBaseline - b.y1 * k - 4)} ${r(b.w * k + 8)} ${r(b.h * k + 8)}" fill="${INK}" fill-rule="evenodd"><path d="${d}"/></svg>`;
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
 .brief,.sub{color:var(--ink-2);max-width:64ch;margin:0 0 20px}
 section{margin-top:clamp(40px,6vw,72px)}
 .plate{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:clamp(24px,4vw,44px);
        display:grid;place-items:center}
 .row{display:grid;grid-template-columns:150px 1fr;gap:clamp(20px,4vw,44px);align-items:center}
 @media(max-width:700px){.row{grid-template-columns:1fr;gap:18px}}
 .row svg{display:block;width:100%;height:auto}
 .row .o svg{width:120px}
 .cap{margin:14px 4px 0;color:var(--ink-2);font-size:14.5px;max-width:72ch}
 .cap b{color:var(--ink);font-weight:600;font-family:var(--serif);font-size:17px}
 .tiny{display:flex;gap:clamp(18px,4vw,44px);flex-wrap:wrap;align-items:flex-end}
 .tiny figure{margin:0;display:grid;gap:10px;justify-items:start}
 .tiny figcaption{font:500 11.5px/1 var(--sans);color:var(--ink-3);letter-spacing:.05em}
 .tiny svg{display:block;height:auto}
 .note{border-left:2px solid var(--terra);padding:2px 0 2px 18px;color:var(--ink-2);max-width:70ch;margin-top:26px}
 .note b{color:var(--ink);font-weight:600}
 footer{margin-top:clamp(40px,6vw,72px);color:var(--ink-3);font-size:13px;border-top:1px solid var(--line);padding-top:18px}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Centre Espoir de Gatineau</div>
  <h1>La croix dans le «&nbsp;o&nbsp;»</h1>
  <p class="brief">Le contrepoinçon du «&nbsp;o&nbsp;» — le trou au milieu de la lettre — devient une croix. Rien n’est ajouté au mot&nbsp;: c’est l’ouverture de la lettre qui change de forme. Quatre dosages, du plus discret au plus affirmé.</p>
</header>

${VARIANTS.map((v) => `
<section>
  <div class="plate">
    <div class="row">
      <div class="o">${justO(v)}</div>
      <div>${word(v)}</div>
    </div>
  </div>
  <p class="cap"><b>${v.label}</b> — ${v.note}</p>
</section>`).join('')}

<section>
  <h2>À petite taille</h2>
  <p class="sub">C’est là que ça se décide. Une croix trop fine se bouche à l’impression&nbsp;; trop épaisse, elle alourdit le mot. Voici les quatre à la taille d’une signature de courriel et d’une carte d’affaires.</p>
  <div class="plate tiny">
    ${VARIANTS.map((v) => `<figure><div style="width:190px">${word(v)}</div><figcaption>${v.label}</figcaption></figure>`).join('')}
  </div>
  <div class="note"><b>Sans croix, pour comparer&nbsp;:</b> <span style="display:inline-block;width:190px;vertical-align:middle">${word(null)}</span></div>
</section>

<footer>
  Composé en Source Serif 4 Medium, taille optique 48. La croix est une découpe dans la lettre, pas un élément posé dessus&nbsp;: elle suit donc la couleur du mot, en encre comme en négatif.
</footer>
</div>
`;

fs.writeFileSync(path.join(OUT, 'croix.html'), page);
console.log('written brand/croix.html');
for (const v of VARIANTS) console.log('  ·', v.key, v.label);
