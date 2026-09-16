// Build the Centre Espoir logo files.
//
//   node brand/build/make-logo.mjs
//
// The wordmark is set in outlines, not in text: the letters become paths, so the
// files open correctly on a machine that has never heard of Source Serif, and
// the shape is frozen for good. That last part matters more than it sounds —
// Source Serif 4 carries an optical-size axis, so a live-text logo quietly
// redraws itself at every size. Here it is pinned to the Display master, the
// one a browser reaches for at logotype sizes.
//
// Everything is derived, nothing is eyeballed: the tracking under the name is
// solved so the descriptor measures exactly the width of the name, and the two
// baselines sit where the browser put them, from the fonts' own vertical
// metrics. Fonts are fetched at build time into build/work/ and never committed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFont, glyphPath } from './ttf.mjs';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const WORK = path.join(here, 'work');
const OUT = path.resolve(here, '..');
const MARK_SVG = path.resolve(here, '../../src/public/mark.svg');

// ---------------------------------------------------------------- the design
const NAME = 'Centre Espoir';
const LINE = 'BANQUE ALIMENTAIRE';   // set in capitals, as the approved lockup is

const INK = '#141413';        // the platforms' near-black
const TERRA = '#DA7757';      // the mark's own colour, unchanged since the SVG David sent
const CREAM = '#FAF9F5';      // the platforms' ground, for reversing out

const S = 100;                // the name's size; every other measure is a ratio of it
const LINE_SIZE = 0.34;       // descriptor, relative to the name
const NAME_TRACK = -0.012;    // the name's own slight negative tracking
const GAP_WORDS = 0.22;       // between the name's box and the descriptor's
const MARK_H_ROW = 2.05;      // mark height, icon beside the words
const MARK_H_STACK = 2.40;    // mark height, icon above the words
const GAP_ROW = 0.55;         // between mark and words, side by side
const GAP_STACK = 0.50;       // between mark and words, stacked

const serif = readFont(path.join(WORK, 'SourceSerif4Display-Regular.ttf'));
const sans = readFont(path.join(WORK, 'SourceSans3-Semibold.ttf'));

// ------------------------------------------------------------- setting a run
/** Lay a string out glyph by glyph and report its paths and its ink bounds. */
function setRun(font, text, size, track, baseline) {
  const k = size / font.unitsPerEm;
  let pen = 0;
  const parts = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;

  [...text].forEach((ch, i) => {
    const gid = font.glyphFor(ch.codePointAt(0));
    if (!gid && ch !== ' ') throw new Error(`no glyph for "${ch}"`);
    for (const c of font.contoursOf(gid)) {
      for (const p of c) {
        x0 = Math.min(x0, pen + p.x * k); x1 = Math.max(x1, pen + p.x * k);
        y0 = Math.min(y0, baseline - p.y * k); y1 = Math.max(y1, baseline - p.y * k);
      }
    }
    const d = glyphPath(font, gid, size, pen, baseline);
    if (d) parts.push(d);
    pen += font.advanceOf(gid) * k;
    if (i < text.length - 1) pen += track;
  });

  return { d: parts.join(''), x0, x1, y0, y1, width: x1 - x0 };
}

/** Where a browser puts the baseline inside a line box of the given height. */
const baselineIn = (font, size, boxTop, boxHeight) =>
  boxTop + (boxHeight - size * (font.ascender - font.descender)) / 2 + size * font.ascender;

// The name first, because the descriptor is tracked out to match its width.
const nameBaseline = baselineIn(serif, S, 0, S);
const name = setRun(serif, NAME, S, NAME_TRACK * S, nameBaseline);

const lineBaseline = baselineIn(sans, LINE_SIZE * S, S + GAP_WORDS * S, LINE_SIZE * S);
const probe = setRun(sans, LINE, LINE_SIZE * S, 0, lineBaseline);
const TRACK = (name.width - probe.width) / ([...LINE].length - 1);
const line = setRun(sans, LINE, LINE_SIZE * S, TRACK, lineBaseline);

// ------------------------------------------------------------------ the mark
const markSrc = fs.readFileSync(MARK_SVG, 'utf8');
const markBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(markSrc);
const MARK_W = Number(markBox[1]), MARK_H = Number(markBox[2]);
const markPaths = [...markSrc.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);

const mark = (height, x, y) => {
  const k = height / MARK_H;
  const g = markPaths.map((d) => `<path d="${d}"/>`).join('');
  return { svg: `<g transform="translate(${r(x)} ${r(y)}) scale(${r(k, 6)})">${g}</g>`,
           w: MARK_W * k, h: height };
};

const r = (v, n = 3) => +v.toFixed(n);

// ----------------------------------------------------------------- lockups
function lockup(kind) {
  const stacked = kind === 'stacked';
  const mh = (stacked ? MARK_H_STACK : MARK_H_ROW) * S;
  const mw = mh * (MARK_W / MARK_H);
  const wordsW = name.width;
  const wordsTop = 0, wordsBot = (1 + GAP_WORDS + LINE_SIZE) * S;

  let markX, markY, wordsX, wordsY, W, H;
  if (stacked) {
    W = Math.max(mw, wordsW);
    markX = (W - mw) / 2; markY = 0;
    wordsX = (W - wordsW) / 2; wordsY = mh + GAP_STACK * S;
    H = wordsY + wordsBot;
  } else {
    W = mw + GAP_ROW * S + wordsW;
    markX = 0; markY = (wordsBot - mh) / 2;          // the icon centres on the words
    wordsX = mw + GAP_ROW * S; wordsY = 0;
    H = Math.max(mh + markY, wordsBot);
    if (markY < 0) { markY = 0; wordsY = -((wordsBot - mh) / 2); H = mh; }
  }

  // Shift so the artwork starts at 0,0 — a tight viewBox, nothing to trim.
  const textDX = wordsX - name.x0, textDY = wordsY;
  const m = mark(mh, markX, markY);
  const top = Math.min(markY, wordsY + name.y0);
  const bottom = Math.max(markY + mh, wordsY + line.y1);

  return {
    width: r(W), height: r(bottom - top),
    markSvg: mark(mh, markX, markY - top).svg,
    nameD: shift(name.d, textDX, textDY - top),
    lineD: shift(line.d, textDX + (name.x0 - line.x0), textDY - top),
  };
}

/** Move a path by translating it, so the file needs no nested transforms. */
function shift(d, dx, dy) {
  return d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${r(+x + dx)} ${r(+y + dy)}`);
}

function svg({ width, height, markSvg, nameD, lineD }, markFill, textFill, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">
  <title>${title}</title>
  <g fill="${markFill}">${markSvg}</g>
  <g fill="${textFill}">
    <path d="${nameD}"/>
    <path d="${lineD}"/>
  </g>
</svg>
`;
}

const row = lockup('row'), stack = lockup('stacked');
const files = [];
for (const [key, geo] of [['horizontal', row], ['vertical', stack]]) {
  files.push([`logo-${key}.svg`, svg(geo, TERRA, INK, `Centre Espoir, banque alimentaire`)]);
  files.push([`logo-${key}-encre.svg`, svg(geo, INK, INK, `Centre Espoir, banque alimentaire`)]);
  files.push([`logo-${key}-creme.svg`, svg(geo, CREAM, CREAM, `Centre Espoir, banque alimentaire`)]);
}
files.push(['logo-symbole.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_W} ${MARK_H}" width="${r(MARK_W)}" height="${r(MARK_H)}" role="img" aria-label="Centre Espoir">
  <title>Centre Espoir</title>
  <g fill="${TERRA}">${markPaths.map((d) => `<path d="${d}"/>`).join('')}</g>
</svg>
`]);

fs.mkdirSync(OUT, { recursive: true });
for (const [n, body] of files) fs.writeFileSync(path.join(OUT, n), body);

console.log(`name   ${r(name.width)} wide`);
console.log(`line   ${r(line.width)} wide   (tracking solved to ${r(TRACK / (LINE_SIZE * S), 4)} em)`);
console.log(`match  ${r(Math.abs(name.width - line.width), 4)} units apart`);
console.log(`horizontal ${row.width} x ${row.height} · vertical ${stack.width} x ${stack.height}`);
for (const [n] of files) console.log('  ·', n);

// ------------------------------------------------------------- review sheet
// Built from the same geometry as the files, so the sheet can never show one
// thing and the SVG another.
const sym = (geo, id) => `<symbol id="${id}" viewBox="0 0 ${geo.width} ${geo.height}">
  <g fill="var(--m)">${geo.markSvg}</g>
  <g fill="var(--t)"><path d="${geo.nameD}"/><path d="${geo.lineD}"/></g>
</symbol>`;

const use = (id, w, m, t) =>
  `<svg class="lk" style="--m:${m};--t:${t};width:${w}" viewBox="0 0 ${id === 'row' ? row.width + ' ' + row.height : stack.width + ' ' + stack.height}"><use href="#${id}"/></svg>`;

const CLEAR = r(LINE_SIZE * S);   // the descriptor's own size, all round
const sheet = `<title>Logo Centre Espoir</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { --bg:#FAF9F5; --surface:#fff; --soft:#F8EDE6; --ink:#141413; --ink-2:#5F5E5A;
          --ink-3:#8C8A84; --line:#E8E6DF; --terra:#DA7757; --terra-ink:#B4573A;
          --serif:"Source Serif 4",Georgia,serif; --sans:"Source Sans 3","Segoe UI",system-ui,sans-serif;
          color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:400 16px/1.55 var(--sans);
         padding-block:0 72px; padding-inline:clamp(16px,4vw,48px); -webkit-font-smoothing:antialiased; }
  .wrap { max-width:1080px; margin:0 auto; }
  header { padding-block:clamp(36px,6vw,72px) 8px; }
  .eyebrow { font:600 12px/1 var(--sans); letter-spacing:.16em; text-transform:uppercase; color:var(--terra-ink); }
  h1 { font:500 clamp(34px,5vw,52px)/1.05 var(--serif); letter-spacing:-.015em; margin:14px 0 12px; text-wrap:balance; }
  h2 { font:500 clamp(22px,3vw,30px)/1.15 var(--serif); margin:0 0 6px; text-wrap:balance; }
  .brief,.sub { color:var(--ink-2); max-width:64ch; margin:0 0 22px; }
  section { margin-top:clamp(44px,7vw,80px); }
  .plate { background:var(--surface); border:1px solid var(--line); border-radius:18px;
           display:grid; place-items:center; padding:clamp(28px,5vw,60px); }
  .plate.soft { background:var(--soft); border-color:transparent; }
  .plate.terra { background:var(--terra); border-color:transparent; }
  .plate.ink { background:var(--ink); border-color:transparent; }
  .lk { display:block; height:auto; max-width:100%; }
  .two { display:grid; grid-template-columns:1.4fr 1fr; gap:14px; align-items:stretch; }
  .three { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  @media (max-width:820px){ .two,.three{ grid-template-columns:1fr; } }
  .cap { color:var(--ink-2); font-size:14.5px; margin:12px 4px 0; }
  .cap b { color:var(--ink); font-weight:600; }
  .ladder { display:flex; flex-wrap:wrap; align-items:flex-end; gap:clamp(22px,4vw,52px); }
  .ladder figure { margin:0; display:grid; gap:12px; justify-items:start; }
  .ladder figcaption { font:500 12px/1 var(--sans); color:var(--ink-3); letter-spacing:.05em; }
  table { width:100%; border-collapse:collapse; font-size:15px; }
  th,td { text-align:left; padding:11px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font:600 11px/1 var(--sans); letter-spacing:.12em; text-transform:uppercase; color:var(--terra-ink); }
  td code { font:500 13.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--ink); }
  td:last-child { color:var(--ink-2); }
  .note { border-left:2px solid var(--terra); padding:2px 0 2px 18px; color:var(--ink-2); max-width:70ch; margin-top:26px; }
  .note b { color:var(--ink); font-weight:600; }
  footer { margin-top:clamp(44px,7vw,80px); color:var(--ink-3); font-size:13px; border-top:1px solid var(--line); padding-top:18px; }
</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">${sym(row, 'row')}${sym(stack, 'stack')}</svg>

<div class="wrap">
<header>
  <div class="eyebrow">Centre Espoir de Gatineau</div>
  <h1>Le logo</h1>
  <p class="brief">Les fichiers définitifs. Le texte est en tracés, pas en caractères&nbsp;: ils s\u2019ouvrent correctement sur un poste qui n\u2019a jamais eu Source Serif, et la forme est figée pour de bon.</p>
</header>

<section style="margin-top:32px">
  <div class="plate" style="min-height:clamp(240px,34vw,380px)">${use('row', 'min(760px,100%)', TERRA, INK)}</div>
</section>

<section>
  <h2>Les deux verrouillages</h2>
  <p class="sub">Le symbole à gauche pour un en-tête, une signature, un bandeau. Empilé pour un carré, une affiche, un autocollant.</p>
  <div class="two">
    <div class="plate">${use('row', 'min(560px,100%)', TERRA, INK)}</div>
    <div class="plate">${use('stack', 'min(260px,100%)', TERRA, INK)}</div>
  </div>
  <p class="cap"><b>Une seule proportion.</b> Tout le verrouillage se calcule à partir du corps du nom&nbsp;: le symbole, l\u2019écart, le descripteur. Rien à réajuster d\u2019une taille à l\u2019autre.</p>
</section>

<section>
  <h2>Les couleurs</h2>
  <p class="sub">Trois versions suffisent. Le symbole garde la terracotta&nbsp;; en une seule couleur ou en négatif, tout prend la même teinte.</p>
  <div class="three">
    <div class="plate">${use('row', '100%', INK, INK)}</div>
    <div class="plate terra">${use('row', '100%', CREAM, CREAM)}</div>
    <div class="plate ink">${use('row', '100%', CREAM, CREAM)}</div>
  </div>
  <p class="cap"><b>Encre</b> pour un fax, une gravure, un tampon. <b>Crème</b> dès que le fond est foncé ou terracotta&nbsp;: le phare devient le fond, ce qui est exactement ce que le dessin permet.</p>
</section>

<section>
  <h2>Zone de protection et taille minimale</h2>
  <p class="sub">Gardez tout autour une marge au moins égale à la hauteur de «&nbsp;Banque alimentaire&nbsp;». Aucun texte, aucun bord, aucune image dans cette zone.</p>
  <div class="two">
    <div class="plate">
      <svg class="lk" style="--m:${TERRA};--t:${INK};width:min(560px,100%)"
           viewBox="${-CLEAR} ${-CLEAR} ${r(row.width + CLEAR * 2)} ${r(row.height + CLEAR * 2)}">
        <rect x="${-CLEAR}" y="${-CLEAR}" width="${r(row.width + CLEAR * 2)}" height="${r(row.height + CLEAR * 2)}"
              fill="none" stroke="${TERRA}" stroke-width="2" stroke-dasharray="10 8" opacity=".55"/>
        <use href="#row"/>
      </svg>
    </div>
    <div class="plate ladder">
      <figure>${use('row', '220px', TERRA, INK)}<figcaption>En-tête · 220 px</figcaption></figure>
      <figure>${use('row', '120px', TERRA, INK)}<figcaption>Minimum · 120 px</figcaption></figure>
    </div>
  </div>
  <p class="cap">Sous <b>120 px de large</b> (environ 32 mm à l\u2019impression), «&nbsp;Banque alimentaire&nbsp;» devient illisible. Plus petit que ça, employez le symbole seul.</p>
</section>

<section>
  <h2>Les fichiers</h2>
  <table>
    <tr><th>Fichier</th><th>Pour quoi</th></tr>
    <tr><td><code>logo-horizontal.svg</code></td><td>Le verrouillage principal. Vectoriel, texte en tracés, se redimensionne sans limite.</td></tr>
    <tr><td><code>logo-vertical.svg</code></td><td>La version empilée, même chose.</td></tr>
    <tr><td><code>logo-*-encre.svg</code></td><td>Une seule couleur, pour la gravure, le tampon, le noir et blanc.</td></tr>
    <tr><td><code>logo-*-creme.svg</code></td><td>En négatif, pour un fond foncé ou terracotta.</td></tr>
    <tr><td><code>logo-symbole.svg</code></td><td>Le phare seul&nbsp;: icône, favicon, photo de profil.</td></tr>
    <tr><td><code>logo-horizontal.png</code><br><code>logo-vertical.png</code></td><td>2400 et 1600 px de large, fond transparent. Pour Canva, Word, les réseaux sociaux.</td></tr>
    <tr><td><code>logo-*-creme.png</code></td><td>Les mêmes en négatif, fond transparent.</td></tr>
  </table>
  <div class="note"><b>Pour l\u2019imprimeur&nbsp;:</b> donnez-lui le SVG. Le texte y est déjà en tracés, donc aucune police à fournir et aucune substitution possible. S\u2019il demande un EPS ou un PDF, n\u2019importe quel logiciel de mise en page convertit le SVG sans rien perdre.</div>
</section>

<footer>
  Le phare vient du fichier que vous avez fourni, inchangé. Le nom est composé en Source Serif 4 Display, le descripteur en Source Sans 3 Semibold, les deux sous licence libre.
</footer>
</div>
`;
fs.writeFileSync(path.join(OUT, 'apercu.html'), sheet);
console.log('  · apercu.html');

// --------------------------------------------------------------------- PNG
// Chrome draws them; Edge stopped writing screenshot files in 2026 (see
// presentation/build/make-og.mjs, same story).
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].filter((p) => fs.existsSync(p));

if (!browsers.length) {
  console.log('\nno Chrome found — SVGs written, PNGs skipped');
} else {
  const profile = path.join(os.tmpdir(), `ce-logo-${process.pid}`);
  for (const [name_, geo, fillMark, fillText, wide] of [
    ['logo-horizontal', row, TERRA, INK, 2400],
    ['logo-vertical', stack, TERRA, INK, 1600],
    ['logo-horizontal-creme', row, CREAM, CREAM, 2400],
    ['logo-vertical-creme', stack, CREAM, CREAM, 1600],
  ]) {
    const h = Math.round(wide * (geo.height / geo.width));
    const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}
      svg{display:block;width:${wide}px;height:${h}px}</style>${svg(geo, fillMark, fillText, 'Centre Espoir')}`;
    const tmp = path.join(os.tmpdir(), `ce-logo-${process.pid}.html`);
    const shot = path.join(os.tmpdir(), `ce-logo-${process.pid}.png`);
    fs.writeFileSync(tmp, page);
    let drawn = false;
    for (const b of browsers) {
      try {
        execFileSync(b, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
          `--window-size=${wide},${h}`, '--force-device-scale-factor=1', '--virtual-time-budget=6000',
          '--default-background-color=00000000', `--user-data-dir=${profile}`,
          `--screenshot=${shot}`, `file://${tmp.split('\\').join('/')}`], { stdio: 'ignore' });
      } catch { /* try the next */ }
      if (fs.existsSync(shot)) { drawn = true; break; }
    }
    if (!drawn) { console.log(`  ! ${name_}.png could not be drawn`); continue; }
    fs.copyFileSync(shot, path.join(OUT, `${name_}.png`));
    fs.rmSync(shot, { force: true }); fs.rmSync(tmp, { force: true });
    console.log(`  · ${name_}.png  ${wide}x${h}`);
  }
  fs.rmSync(profile, { recursive: true, force: true });
}
