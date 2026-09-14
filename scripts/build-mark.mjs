// Rebuild the interface mark and the favicon from the master artwork.
//
//   node scripts/build-mark.mjs
//
// assets/logo-source.svg is an SVG wrapper around two embedded PNGs — a colour
// image and a greyscale mask the SVG turns into alpha. This reads both, makes a
// real RGBA image, trims the transparent margin, and writes:
//
//   src/public/mark.png   the logo used in the header and on the hero pages
//   src/public/icon.png   the browser-tab icon, on the app's rounded background
//
// Pure node: zlib does the PNG compression, everything else is here. Nothing
// runs at boot or at request time — this is a one-off, run it when the logo
// changes and commit the two PNGs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'assets/logo-source.svg');
const MARK_HEIGHT = 192;   // twice the 96px the hero shows, so it stays sharp
const ICON_SIZE = 192;     // browser-tab icon
const ICON_PAD = 0.10;     // breathing room inside the rounded square
const ICON_BG = [0xFA, 0xF9, 0xF5];          // --bg
const ICON_RADIUS = 0.229;                   // matches the previous icon

const crc32 = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
})();

function decodePng(buf) {
  let p = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`unsupported PNG (bitDepth ${bitDepth}, interlace ${interlace})`);
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!bpp) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[q++];
    const line = raw.subarray(q, q + stride); q += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}

function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Box filter, on premultiplied alpha so transparent pixels don't bleed colour. */
function resize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * sh / dh, sy1 = (dy + 1) * sh / dh;
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * sw / dw, sx1 = (dx + 1) * sw / dw;
      let r = 0, g = 0, b = 0, a = 0, total = 0;
      for (let y = Math.floor(sy0); y < Math.min(sh, Math.ceil(sy1)); y++) {
        const fy = Math.min(sy1, y + 1) - Math.max(sy0, y);
        if (fy <= 0) continue;
        for (let x = Math.floor(sx0); x < Math.min(sw, Math.ceil(sx1)); x++) {
          const fx = Math.min(sx1, x + 1) - Math.max(sx0, x);
          if (fx <= 0) continue;
          const weight = fx * fy, i = (y * sw + x) * 4, alpha = src[i + 3] / 255;
          r += src[i] * alpha * weight; g += src[i + 1] * alpha * weight; b += src[i + 2] * alpha * weight;
          a += src[i + 3] * weight; total += weight;
        }
      }
      const i = (dy * dw + dx) * 4, avg = a / total;
      const un = avg > 0.5 ? total * (avg / 255) : 0;
      out[i] = un ? Math.round(r / un) : 0;
      out[i + 1] = un ? Math.round(g / un) : 0;
      out[i + 2] = un ? Math.round(b / un) : 0;
      out[i + 3] = Math.round(avg);
    }
  }
  return out;
}

// --- read the two PNGs out of the SVG -------------------------------------
const svg = fs.readFileSync(SOURCE, 'utf8');
const embedded = [...svg.matchAll(/href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)]
  .map((m) => decodePng(Buffer.from(m[1], 'base64')));
if (embedded.length !== 2) throw new Error(`expected 2 embedded PNGs, found ${embedded.length}`);
// The mask is the greyscale one (1 byte per pixel), the artwork is the RGB one.
const mask = embedded.find((i) => i.bpp === 1);
const colour = embedded.find((i) => i.bpp === 3);
if (!mask || !colour) throw new Error('expected one greyscale mask and one RGB image');
if (mask.w !== colour.w || mask.h !== colour.h) throw new Error('mask and image differ in size');

const W = colour.w, H = colour.h;
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0, n = W * H; i < n; i++) {
  rgba[i * 4] = colour.data[i * 3];
  rgba[i * 4 + 1] = colour.data[i * 3 + 1];
  rgba[i * 4 + 2] = colour.data[i * 3 + 2];
  rgba[i * 4 + 3] = mask.data[i];   // the SVG turns the mask's luminance into alpha
}

// --- trim the transparent margin ------------------------------------------
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (rgba[(y * W + x) * 4 + 3] > 2) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const crop = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) rgba.copy(crop, y * cw * 4, ((y + y0) * W + x0) * 4, ((y + y0) * W + x0 + cw) * 4);

// --- mark.png --------------------------------------------------------------
const mw = Math.round(MARK_HEIGHT * cw / ch);
const mark = encodePng(mw, MARK_HEIGHT, resize(crop, cw, ch, mw, MARK_HEIGHT));
fs.writeFileSync(path.join(root, 'src/public/mark.png'), mark);

// --- icon.png: the logo on a rounded square -------------------------------
const S = ICON_SIZE, R = Math.round(S * ICON_RADIUS);
const scale = Math.min(S * (1 - 2 * ICON_PAD) / cw, S * (1 - 2 * ICON_PAD) / ch);
const lw = Math.round(cw * scale), lh = Math.round(ch * scale);
const ox = Math.round((S - lw) / 2), oy = Math.round((S - lh) / 2);
const logo = resize(crop, cw, ch, lw, lh);
const icon = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const cx = Math.min(Math.max(x, R), S - 1 - R), cy = Math.min(Math.max(y, R), S - 1 - R);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > R * R) continue;   // outside the rounded corner
    const i = (y * S + x) * 4;
    icon[i] = ICON_BG[0]; icon[i + 1] = ICON_BG[1]; icon[i + 2] = ICON_BG[2]; icon[i + 3] = 255;
  }
}
for (let y = 0; y < lh; y++) {
  for (let x = 0; x < lw; x++) {
    const si = (y * lw + x) * 4, di = ((y + oy) * S + (x + ox)) * 4, a = logo[si + 3] / 255;
    if (a <= 0) continue;
    icon[di] = Math.round(logo[si] * a + icon[di] * (1 - a));
    icon[di + 1] = Math.round(logo[si + 1] * a + icon[di + 1] * (1 - a));
    icon[di + 2] = Math.round(logo[si + 2] * a + icon[di + 2] * (1 - a));
    icon[di + 3] = Math.max(icon[di + 3], Math.round(a * 255));
  }
}
fs.writeFileSync(path.join(root, 'src/public/icon.png'), encodePng(S, S, icon));

console.log(`artwork ${W}x${H} → trimmed ${cw}x${ch}`);
console.log(`src/public/mark.png  ${mw}x${MARK_HEIGHT}  ${(mark.length / 1024).toFixed(1)} KB`);
console.log(`src/public/icon.png  ${S}x${S}  ${(fs.statSync(path.join(root, 'src/public/icon.png')).size / 1024).toFixed(1)} KB`);
console.log('Remember: the mark is also sized in app.css (.mark / .mark.small).');
