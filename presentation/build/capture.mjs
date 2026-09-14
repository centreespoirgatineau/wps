// Capture the real pages of the demonstration instance as self-contained HTML,
// ready to drop into the slideshow inside a phone frame. Vector, not pixels, so
// it stays sharp at 1920x1080.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8100';
const OUT = process.argv[2];
const SRC = new URL('../../src/', import.meta.url).pathname.replace(/^\//, '');

const css = fs.readFileSync(path.join(SRC, 'public/app.css'), 'utf8');
const mark = fs.readFileSync(process.argv[3]).toString('base64');

// One session as Daniel Mercier (Église Nouvelle Vie de Gatineau).
let cookie = '';
{
  const r = await fetch(`${BASE}/r/demo00000000`, { redirect: 'manual' });
  cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
}

async function page(url, { signedIn = true } = {}) {
  const r = await fetch(BASE + url, { headers: signedIn ? { Cookie: cookie } : {}, redirect: 'manual' });
  let html = await r.text();
  html = html
    .replace(/<link rel="stylesheet" href="\/static\/app\.css[^>]*>/, `<style>${css}</style>`)
    .replace(/<link rel="icon"[^>]*>/, '')
    .replace(/<script src="\/static\/app\.js[^>]*><\/script>/, '')
    .replace(/src="\/static\/mark\.svg[^"]*"/g, `src="data:image/svg+xml;base64,${mark}"`)
    // The pages are decoration here: nothing should be clickable or scrollable.
    .replace('</head>', '<style>html{overflow:hidden}a{pointer-events:none}</style></head>');
  return html;
}

const pages = {
  list: await page('/offres'),
  offer: await page('/offres/1'),
  about: await page('/a-propos'),
  login: await page('/connexion', { signedIn: false }),
};

for (const [k, v] of Object.entries(pages)) {
  if (/<title>/.test(v) === false) throw new Error(`page ${k} looks wrong`);
  console.log(k.padEnd(6), (v.length / 1024).toFixed(0) + ' KB', /<title>([^<]*)/.exec(v)[1]);
}
fs.writeFileSync(OUT, JSON.stringify(pages));
console.log('written', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
