// jc.centreespoir.ca, the church platform, was merged into spp on 2026-11-17
// (scripts/merge-jc-into-spp.js) and its address now reaches the spp app.
// Every old link is sent to the same thing on spp: an offer to its new number
// (the merge left that table in merged-from-jc.json), a personal link to the
// same person when their token came across, and anything else to the same path.
//
// 302, not 301: a browser keeps a 301 forever, and this is cheap to undo.
import fs from 'node:fs';
import path from 'node:path';
import { publicUrl } from './site.js';

/** Where an old jc path goes on spp. `tokenKnown` says whether a personal link survived the merge. */
export function legacyTarget(pathname, search, { offers, tokenKnown }) {
  let m;
  if ((m = /^\/o\/(\d+)\/([^/]+)\/?$/.exec(pathname))) {
    const id = offers[m[1]];
    if (tokenKnown(m[2])) return id ? `/o/${id}/${m[2]}` : `/r/${m[2]}`;
    return id ? `/offres/${id}` : '/offres';
  }
  if ((m = /^\/r\/([^/]+)\/?$/.exec(pathname))) return tokenKnown(m[1]) ? `/r/${m[1]}` : '/connexion';
  if ((m = /^\/(?:admin\/)?offres\/(\d+)(?:\/.*)?$/.exec(pathname))) {
    const id = offers[m[1]];
    return id ? `/offres/${id}` : '/offres';
  }
  return pathname + search;
}

export function legacyRedirect(db, { hosts, dataDir }) {
  let offers = {};
  try { offers = JSON.parse(fs.readFileSync(path.join(dataDir, 'merged-from-jc.json'), 'utf8')).offers || {}; }
  catch { /* no merge here: offers fall back to the list */ }
  const tokenKnown = (t) => Boolean(db.get(`SELECT 1 FROM contacts WHERE token = ? AND status != 'removed'`, t));
  return (ctx) => {
    const host = String(ctx.req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (!hosts.includes(host)) return;
    ctx.redirect(publicUrl() + legacyTarget(ctx.path, ctx.url.search, { offers, tokenKnown }), 302);
  };
}
