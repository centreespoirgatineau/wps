// The social preview card: what someone sees when the address is sent by text,
// WhatsApp or e-mail. 1200x630 PNG, because no messaging app renders an SVG.
//
//   node presentation/build/make-og.mjs src/public/mark.svg src/public/og.png
//
// It draws the card below in headless Edge/Chrome and screenshots it. Rerun it
// whenever the mark or the wording changes; the PNG is committed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [markPath, outPath] = process.argv.slice(2);
if (!markPath || !outPath) throw new Error('usage: make-og.mjs <mark.svg> <out.png>');
const mark = fs.readFileSync(markPath).toString('base64');

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
  .foot { margin-top: 30px; display: flex; align-items: center; gap: 12px; font-size: 20px; color: #8C8A84; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #D97757; }
  .mark { position: relative; z-index: 1; width: 320px; height: 320px; display: block; justify-self: center; }
</style>
<div class="text">
  <div class="eyebrow">Centre Espoir de Gatineau</div>
  <h1>Les surplus alimentaires,<br>redistribu&eacute;s le jour m&ecirc;me.</h1>
  <p>Un r&eacute;seau d&rsquo;&eacute;glises et de minist&egrave;res qui nourrissent leur quartier et annoncent l&rsquo;&Eacute;vangile de J&eacute;sus-Christ.</p>
  <div class="foot"><span class="dot"></span> Un texto, un lot r&eacute;serv&eacute;, ramass&eacute; avant la fin de la journ&eacute;e.</div>
</div>
<img class="mark" src="data:image/svg+xml;base64,${mark}" alt="">
`;

const tmp = path.join(os.tmpdir(), `wps-og-${process.pid}.html`);
fs.writeFileSync(tmp, html);

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
];
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) throw new Error('no Chrome/Edge found to render the card');

const shot = path.join(os.tmpdir(), `wps-og-${process.pid}.png`);
execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1200,630', '--force-device-scale-factor=1',
  '--virtual-time-budget=8000',
  `--screenshot=${shot}`, `file://${tmp.split('\\').join('/')}`,
], { stdio: 'inherit' });

fs.copyFileSync(shot, outPath);
fs.rmSync(tmp, { force: true }); fs.rmSync(shot, { force: true });
console.log('written', outPath, (fs.statSync(outPath).size / 1024).toFixed(0) + ' KB');
