// Minimal EJS-style template engine.
//   <%= value %>  escaped output
//   <%- value %>  raw output
//   <% code %>    JavaScript
// Templates live in src/views/*.html. `include('name', extra)` renders another
// template with the same locals plus `extra`. Pages are wrapped in layout.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const viewsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'views');
const cache = new Map();
const DEV = process.env.NODE_ENV === 'development';

export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function compile(src, name) {
  let code = "let __out='';\n";
  const re = /<%([=-]?)([\s\S]*?)%>/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    code += `__out+=${JSON.stringify(src.slice(last, m.index))};\n`;
    const [, kind, inner] = m;
    if (kind === '' && inner.trimStart().startsWith('#')) { last = m.index + m[0].length; continue; } // comment
    if (kind === '=') code += `__out+=__esc(${inner});\n`;
    else if (kind === '-') code += `__out+=(${inner})??'';\n`;
    else code += inner + '\n';
    last = m.index + m[0].length;
  }
  code += `__out+=${JSON.stringify(src.slice(last))};\nreturn __out;`;
  try {
    // eslint-disable-next-line no-new-func
    return new Function('__locals', '__esc', 'include', `with(__locals){${code}}`);
  } catch (e) {
    throw new Error(`Template ${name}: ${e.message}`);
  }
}

function load(name) {
  if (!DEV && cache.has(name)) return cache.get(name);
  const file = path.join(viewsDir, name + '.html');
  const fn = compile(fs.readFileSync(file, 'utf8'), name);
  cache.set(name, fn);
  return fn;
}

// Missing locals read as undefined instead of throwing ReferenceError, while
// real globals (Math, JSON, encodeURIComponent…) stay reachable.
const RESERVED = new Set(['include', '__esc', '__out', '__locals']);
function scope(locals) {
  return new Proxy(locals, {
    has: (t, k) => typeof k === 'string' && !RESERVED.has(k) && (k in t || !(k in globalThis)),
    get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]),
  });
}

export function renderPartial(name, locals = {}) {
  const fn = load(name);
  const include = (n, extra = {}) => renderPartial(n, { ...locals, ...extra });
  return fn(scope(locals), escapeHtml, include);
}

/** Render a page inside the layout. */
export function render(name, locals = {}) {
  const body = renderPartial(name, locals);
  return renderPartial('layout', { ...locals, body });
}
