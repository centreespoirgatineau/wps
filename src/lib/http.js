// A very small HTTP toolkit on top of node:http — router, body parsing,
// cookies, static files. Enough for this application, no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message || http.STATUS_CODES[status] || 'Error');
    this.status = status;
    Object.assign(this, extra);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function compilePath(pattern) {
  const keys = [];
  const re = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '$' || m === '{' || m === '}' ? m : '\\' + m))
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp('^' + re + '/?$'), keys };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  if (opts.expires) s += `; Expires=${opts.expires.toUTCString()}`;
  s += `; Path=${opts.path || '/'}`;
  if (opts.httpOnly !== false) s += '; HttpOnly';
  if (opts.secure) s += '; Secure';
  s += `; SameSite=${opts.sameSite || 'Lax'}`;
  return s;
}

async function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export class App {
  constructor() {
    this.routes = [];
    this.middlewares = [];
    this.errorHandler = null;
  }

  use(fn) { this.middlewares.push(fn); return this; }
  onError(fn) { this.errorHandler = fn; return this; }

  route(method, pattern, ...handlers) {
    const { re, keys } = compilePath(pattern);
    this.routes.push({ method, re, keys, handlers, pattern });
    return this;
  }
  get(p, ...h) { return this.route('GET', p, ...h); }
  post(p, ...h) { return this.route('POST', p, ...h); }
  put(p, ...h) { return this.route('PUT', p, ...h); }
  delete(p, ...h) { return this.route('DELETE', p, ...h); }

  /** Serve files under `dir` for URLs starting with `prefix`. */
  static(prefix, dir, { maxAge = 3600 } = {}) {
    this.get(prefix + '/:file', async (ctx) => {
      const file = path.normalize(ctx.params.file).replace(/^(\.\.[/\\])+/, '');
      const full = path.join(dir, file);
      if (!full.startsWith(dir)) throw new HttpError(404);
      await sendFile(ctx, full, { maxAge });
    });
    return this;
  }

  listen(port, host, cb) {
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.keepAliveTimeout = 65_000;
    this.server.listen(port, host, cb);
    return this.server;
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const ctx = {
      req, res, url,
      method: req.method === 'HEAD' ? 'GET' : req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      params: {},
      cookies: parseCookies(req.headers.cookie),
      state: {},
      _cookies: [],
      _body: undefined,
      ip: '',
      // --- response helpers ---
      status(code) { res.statusCode = code; return ctx; },
      set(k, v) { res.setHeader(k, v); return ctx; },
      setCookie(name, value, opts) { ctx._cookies.push(serializeCookie(name, value, opts)); },
      clearCookie(name, opts = {}) { ctx._cookies.push(serializeCookie(name, '', { ...opts, maxAge: 0 })); },
      send(body, type = 'text/html; charset=utf-8') {
        if (ctx._cookies.length) res.setHeader('Set-Cookie', ctx._cookies);
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', type);
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
        res.setHeader('Content-Length', buf.length);
        res.end(req.method === 'HEAD' ? undefined : buf);
        ctx.done = true;
      },
      html(body) { ctx.send(body); },
      text(body) { ctx.send(body, 'text/plain; charset=utf-8'); },
      json(obj, code) { if (code) res.statusCode = code; ctx.send(JSON.stringify(obj), 'application/json; charset=utf-8'); },
      redirect(location, code = 303) {
        if (ctx._cookies.length) res.setHeader('Set-Cookie', ctx._cookies);
        res.statusCode = code; res.setHeader('Location', location); res.end(); ctx.done = true;
      },
      async body(limit = 1024 * 1024) {
        if (ctx._body !== undefined) return ctx._body;
        const raw = await readBody(req, limit);
        const type = (req.headers['content-type'] || '').split(';')[0].trim();
        if (type === 'application/x-www-form-urlencoded') {
          ctx._body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
          // Support repeated keys (checkbox lists): name[] or same name repeated
          const sp = new URLSearchParams(raw.toString('utf8'));
          for (const k of new Set(sp.keys())) {
            const all = sp.getAll(k);
            if (all.length > 1 || k.endsWith('[]')) ctx._body[k.replace(/\[\]$/, '')] = all;
          }
        } else if (type === 'application/json') {
          try { ctx._body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; }
          catch { throw new HttpError(400, 'Invalid JSON'); }
        } else {
          ctx._body = raw;
        }
        return ctx._body;
      },
    };
    const xff = req.headers['x-forwarded-for'];
    ctx.ip = (xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress) || '';

    try {
      for (const mw of this.middlewares) {
        await mw(ctx);
        if (ctx.done) return;
      }
      const match = this.match(ctx.method, ctx.path);
      if (!match) throw new HttpError(404);
      ctx.params = match.params;
      for (const h of match.route.handlers) {
        await h(ctx);
        if (ctx.done) return;
      }
      if (!ctx.done) throw new HttpError(404);
    } catch (err) {
      if (ctx.done || res.headersSent) { try { res.end(); } catch {} return; }
      if (this.errorHandler) {
        try { await this.errorHandler(err, ctx); if (ctx.done) return; } catch (e2) { err = e2; }
      }
      res.statusCode = err.status || 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(err.status ? err.message : 'Internal error');
    }
  }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method && r.method !== 'ALL') continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
      return { route: r, params };
    }
    return null;
  }
}

export async function sendFile(ctx, full, { maxAge = 3600, download = false } = {}) {
  let st;
  try { st = await fs.promises.stat(full); } catch { throw new HttpError(404); }
  if (!st.isFile()) throw new HttpError(404);
  const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
  if (ctx.req.headers['if-none-match'] === etag) { ctx.status(304); ctx.res.end(); ctx.done = true; return; }
  ctx.set('Content-Type', mimeFor(full));
  ctx.set('Content-Length', st.size);
  ctx.set('Cache-Control', `private, max-age=${maxAge}`);
  ctx.set('ETag', etag);
  if (download) ctx.set('Content-Disposition', 'attachment');
  if (ctx._cookies.length) ctx.set('Set-Cookie', ctx._cookies);
  ctx.done = true;
  if (ctx.req.method === 'HEAD') { ctx.res.end(); return; }
  await new Promise((resolve, reject) => {
    const s = fs.createReadStream(full);
    s.on('error', reject);
    ctx.res.on('finish', resolve);
    ctx.res.on('close', resolve);
    s.pipe(ctx.res);
  });
}
