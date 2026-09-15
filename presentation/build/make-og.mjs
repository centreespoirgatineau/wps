// The social preview card: what someone sees when the address is sent by text,
// WhatsApp or e-mail. 1200x630 PNG, because no messaging app renders an SVG.
//
//   node presentation/build/make-og.mjs src/public/mark.svg src/public/og.png [brand]
//
// One card per audience: the church card names Jesus Christ, the food-bank card
// must not. `brand` picks the wording below; it defaults to jc.
//
// It draws the card below in headless Edge/Chrome and screenshots it. Rerun it
// whenever the mark or the wording changes; the PNG is committed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [markPath, outPath, brand = 'jc'] = process.argv.slice(2);
if (!markPath || !outPath) throw new Error('usage: make-og.mjs <mark.svg> <out.png> [brand]');
const mark = fs.readFileSync(markPath).toString('base64');

const COPY = {
  jc: {
    h1: 'Un outil pour annoncer<br>l&rsquo;&Eacute;vangile de J&eacute;sus-Christ.',
    p: 'Les surplus alimentaires du Centre Espoir de Gatineau, redistribu&eacute;s le jour m&ecirc;me\n       par les &eacute;glises de l&rsquo;Outaouais.',
  },
  spp: {
    h1: 'Les surplus alimentaires,<br>redistribu&eacute;s le jour m&ecirc;me.',
    p: 'Le Centre Espoir de Gatineau les confie aux banques alimentaires et aux organismes\n       communautaires de l&rsquo;Outaouais.',
  },
}[brand];
if (!COPY) throw new Error(`no card wording for brand "${brand}"`);

const html = `<!doctype html>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: #FAF9F5; color: #141413;
    font: 400 16px/1.5 "Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif;
    display: grid; grid-template-columns: 1fr 320px; align-items: center; gap: 44px;
    padding: 68px 64px; position: relative; overflow: hidden;
  }
  /* A wash of the accent behind the mark, so the card is not a flat rectangle. */
  body::after {
    content: ''; position: absolute; right: -180px; top: -180px; width: 720px; height: 720px;
    border-radius: 50%; background: radial-gradient(circle, #F8EDE6 0%, rgba(248,237,230,0) 68%);
  }
  .text { position: relative; z-index: 1; }
  .eyebrow {
    font-size: 21px; font-weight: 600; letter-spacing: .13em; text-transform: uppercase; color: #B4573A;
    display: flex; align-items: center; gap: 14px;
  }
  .eyebrow::after { content: ''; height: 1px; flex: 1; background: #E8E6DF; }
  h1 {
    font-family: "Source Serif 4", Georgia, serif; font-weight: 500;
    font-size: 54px; line-height: 1.12; letter-spacing: -0.02em; margin: 24px 0 20px;
  }
  p { font-size: 24px; line-height: 1.45; color: #5F5E5A; max-width: 640px; }
  /* A call to action, so the card reads as something to open rather than a poster. */
  .cta {
    margin-top: 32px; display: inline-flex; align-items: center; gap: 12px;
    background: #D97757; color: #fff; border-radius: 999px; padding: 15px 30px;
    font-size: 21px; font-weight: 600; letter-spacing: .01em;
  }
  .mark { position: relative; z-index: 1; width: 320px; height: 320px; display: block; justify-self: center; }
</style>
<div class="text">
  <div class="eyebrow">Centre Espoir de Gatineau</div>
  <h1>${COPY.h1}</h1>
  <p>${COPY.p}</p>
  <div class="cta">Rejoindre la liste <span>&rarr;</span></div>
</div>
<img class="mark" src="data:image/svg+xml;base64,${mark}" alt="">
`;

const tmp = path.join(os.tmpdir(), `wps-og-${process.pid}.html`);
fs.writeFileSync(tmp, html);

// Chrome first: Edge's --headless=new stopped writing the file at some point in
// 2026 — it still exits 0 and produces nothing, so every candidate is tried and
// the first one that actually leaves a PNG behind wins.
const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].filter((p) => fs.existsSync(p));
if (!candidates.length) throw new Error('no Chrome/Edge found to render the card');

const url = `file://${tmp.split('\\').join('/')}`;
const shot = path.join(os.tmpdir(), `wps-og-${process.pid}.png`);
// Its own profile directory, or a browser already open on this machine holds
// the default one and the headless copy quietly declines to do anything.
const profile = path.join(os.tmpdir(), `wps-og-profile-${process.pid}`);
let drawn = null;
for (const browser of candidates) {
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--window-size=1200,630', '--force-device-scale-factor=1',
      '--virtual-time-budget=8000',
      `--user-data-dir=${profile}`, `--screenshot=${shot}`, url,
    ], { stdio: 'inherit' });
  } catch { /* try the next one */ }
  if (fs.existsSync(shot)) { drawn = browser; break; }
}
if (!drawn) throw new Error(`none of these could draw the card: ${candidates.join(', ')}`);

fs.copyFileSync(shot, outPath);
fs.rmSync(tmp, { force: true }); fs.rmSync(shot, { force: true });
fs.rmSync(profile, { recursive: true, force: true });
console.log('written', outPath, (fs.statSync(outPath).size / 1024).toFixed(0) + ' KB');
