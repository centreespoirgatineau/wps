// A very small TrueType reader: enough to turn a string into SVG path data.
//
// Only what a logo needs — `glyf` outlines, the `cmap` that maps characters to
// them, and the `hmtx` advances that space them. No dependencies, because the
// rest of this project has none either.
//
// TrueType curves are quadratic B-splines: a contour is a ring of points, each
// flagged on-curve or off-curve, and two consecutive off-curve points imply an
// on-curve point exactly between them. That implied-midpoint rule is the only
// subtle part of the conversion below.
import fs from 'node:fs';

const u8 = (b, o) => b[o];
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const i16 = (b, o) => { const v = u16(b, o); return v & 0x8000 ? v - 0x10000 : v; };
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

export function readFont(path) {
  const b = fs.readFileSync(path);
  if (u32(b, 0) !== 0x00010000) throw new Error(`${path}: not a TrueType outline font`);

  const tables = {};
  const count = u16(b, 4);
  for (let i = 0; i < count; i++) {
    const p = 12 + i * 16;
    tables[String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])] = { off: u32(b, p + 8), len: u32(b, p + 12) };
  }
  for (const t of ['head', 'maxp', 'cmap', 'loca', 'glyf', 'hhea', 'hmtx']) {
    if (!tables[t]) throw new Error(`${path}: missing ${t} table`);
  }

  const unitsPerEm = u16(b, tables.head.off + 18);
  const longLoca = i16(b, tables.head.off + 50) === 1;
  const numGlyphs = u16(b, tables.maxp.off + 4);
  const numHMetrics = u16(b, tables.hhea.off + 34);
  // The browser lays a line out from these, so the logo must too if it is to
  // reproduce the spacing that was approved on screen.
  const ascender = i16(b, tables.hhea.off + 4) / unitsPerEm;
  const descender = i16(b, tables.hhea.off + 6) / unitsPerEm;   // negative

  // ---- cmap: the Unicode subtable, format 4 or 12 --------------------------
  const cmapOff = tables.cmap.off;
  let sub = 0, subFormat = 0;
  for (let i = 0, n = u16(b, cmapOff + 2); i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const platform = u16(b, rec), encoding = u16(b, rec + 2);
    const isUnicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!isUnicode) continue;
    const off = cmapOff + u32(b, rec + 4);
    const fmt = u16(b, off);
    // Prefer format 12 when both are offered; either is fine for Latin.
    if (fmt === 12 || (fmt === 4 && subFormat !== 12)) { sub = off; subFormat = fmt; }
  }
  if (!sub) throw new Error(`${path}: no usable Unicode cmap`);

  const glyphFor = (cp) => {
    if (subFormat === 12) {
      for (let i = 0, n = u32(b, sub + 12); i < n; i++) {
        const g = sub + 16 + i * 12;
        if (cp >= u32(b, g) && cp <= u32(b, g + 4)) return u32(b, g + 8) + (cp - u32(b, g));
      }
      return 0;
    }
    const segX2 = u16(b, sub + 6);
    const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2; s += 2) {
      if (cp > u16(b, ends + s)) continue;
      const start = u16(b, starts + s);
      if (cp < start) return 0;
      const rangeOff = u16(b, ranges + s);
      if (rangeOff === 0) return (cp + i16(b, deltas + s)) & 0xFFFF;
      const gi = u16(b, ranges + s + rangeOff + (cp - start) * 2);
      return gi === 0 ? 0 : (gi + i16(b, deltas + s)) & 0xFFFF;
    }
    return 0;
  };

  const advanceOf = (gid) => {
    const i = Math.min(gid, numHMetrics - 1);
    return u16(b, tables.hmtx.off + i * 4);
  };

  const locaAt = (i) => longLoca
    ? u32(b, tables.loca.off + i * 4)
    : u16(b, tables.loca.off + i * 2) * 2;

  // ---- one glyph's contours, in font units, y still pointing up ------------
  function contoursOf(gid, depth = 0) {
    if (gid >= numGlyphs || depth > 4) return [];
    const from = locaAt(gid), to = locaAt(gid + 1);
    if (to <= from) return [];                 // an empty glyph, e.g. the space
    const g = tables.glyf.off + from;
    const nContours = i16(b, g);

    if (nContours < 0) return compositeOf(g, depth);

    const endPts = [];
    for (let i = 0; i < nContours; i++) endPts.push(u16(b, g + 10 + i * 2));
    const nPts = endPts[nContours - 1] + 1;
    let p = g + 10 + nContours * 2;
    p += 2 + u16(b, p);                        // skip the hinting instructions

    const flags = new Uint8Array(nPts);
    for (let i = 0; i < nPts;) {
      const f = u8(b, p++); flags[i++] = f;
      if (f & 8) { let r = u8(b, p++); while (r-- > 0 && i < nPts) flags[i++] = f; }
    }
    const readCoords = (shortBit, sameBit) => {
      const out = new Int16Array(nPts);
      let v = 0;
      for (let i = 0; i < nPts; i++) {
        const f = flags[i];
        if (f & shortBit) { const d = u8(b, p++); v += (f & sameBit) ? d : -d; }
        else if (!(f & sameBit)) { v += i16(b, p); p += 2; }
        out[i] = v;
      }
      return out;
    };
    const xs = readCoords(2, 16), ys = readCoords(4, 32);

    const contours = [];
    let start = 0;
    for (const end of endPts) {
      const pts = [];
      for (let i = start; i <= end; i++) pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 });
      if (pts.length) contours.push(pts);
      start = end + 1;
    }
    return contours;
  }

  // A composite glyph is other glyphs placed by offset — accented letters and
  // the like. Only the translation case is handled; that is all these fonts use
  // for Latin, and a scaled component would be visibly wrong rather than silent.
  function compositeOf(g, depth) {
    let p = g + 10, out = [];
    for (;;) {
      const flags = u16(b, p), gi = u16(b, p + 2); p += 4;
      let dx = 0, dy = 0;
      if (flags & 1) { dx = i16(b, p); dy = i16(b, p + 2); p += 4; }
      else { dx = (u8(b, p) << 24 >> 24); dy = (u8(b, p + 1) << 24 >> 24); p += 2; }
      if (flags & 8) p += 2;
      else if (flags & 0x40) p += 4;
      else if (flags & 0x80) p += 8;
      if (!(flags & 2)) throw new Error('composite glyph positioned by point matching, unsupported');
      for (const c of contoursOf(gi, depth + 1)) out.push(c.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })));
      if (!(flags & 0x20)) break;
    }
    return out;
  }

  return { unitsPerEm, glyphFor, advanceOf, contoursOf, numGlyphs, ascender, descender };
}

/**
 * SVG path data for one glyph, already flipped so y grows downward like SVG's,
 * scaled to `size`, and shifted to (x, baselineY).
 */
export function glyphPath(font, gid, size, x, baselineY, round = 3) {
  const k = size / font.unitsPerEm;
  const X = (v) => +(x + v * k).toFixed(round);
  const Y = (v) => +(baselineY - v * k).toFixed(round);
  let d = '';

  for (const pts of font.contoursOf(gid)) {
    // Start on a real on-curve point; if the contour begins off-curve, use the
    // midpoint between the last and first points, which is on-curve by the
    // quadratic rule.
    let startIdx = pts.findIndex((p) => p.on);
    let first;
    if (startIdx === -1) {
      first = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
      startIdx = 0;
    } else {
      first = pts[startIdx];
      startIdx += 1;
    }
    d += `M${X(first.x)} ${Y(first.y)}`;

    let ctrl = null;
    for (let n = 0; n < pts.length; n++) {
      const p = pts[(startIdx + n) % pts.length];
      if (p.on) {
        d += ctrl ? `Q${X(ctrl.x)} ${Y(ctrl.y)} ${X(p.x)} ${Y(p.y)}` : `L${X(p.x)} ${Y(p.y)}`;
        ctrl = null;
      } else if (ctrl) {
        const mid = { x: (ctrl.x + p.x) / 2, y: (ctrl.y + p.y) / 2 };   // the implied on-curve point
        d += `Q${X(ctrl.x)} ${Y(ctrl.y)} ${X(mid.x)} ${Y(mid.y)}`;
        ctrl = p;
      } else ctrl = p;
    }
    d += ctrl ? `Q${X(ctrl.x)} ${Y(ctrl.y)} ${X(first.x)} ${Y(first.y)}Z` : 'Z';
  }
  return d;
}
