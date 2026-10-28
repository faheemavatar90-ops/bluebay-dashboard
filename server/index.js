import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize as pnorm } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { fetchZoho, zohoConfigured, normalize } from './zoho.js';
import { compute } from './metrics.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const TALLY_FILE = join(root, 'data', 'tally.json');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const safeEq = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

let cache = { at: 0, body: null };
let lastError = null;

async function loadSource() {
  const primary = process.env.PRIMARY_SOURCE || 'zoho';
  if (primary === 'tally') {
    if (!existsSync(TALLY_FILE)) throw new Error('No Tally data ingested yet');
    const t = JSON.parse(await readFile(TALLY_FILE, 'utf8'));
    return { source: 'tally', syncedAt: t.receivedAt, data: normalize(t.data) };
  }
  if (!zohoConfigured()) throw new Error('Zoho credentials not configured');
  return { source: 'zoho', syncedAt: new Date().toISOString(), data: await fetchZoho() };
}

async function summary() {
  const ttl = (+process.env.CACHE_TTL_SECONDS || 300) * 1000;
  if (cache.body && Date.now() - cache.at < ttl) return cache.body;
  try {
    const s = await loadSource();
    cache = { at: Date.now(), body: { live: true, source: s.source, syncedAt: s.syncedAt, currency: process.env.CURRENCY || 'SAR', ...compute(s.data) } };
    lastError = null;
  } catch (e) {
    lastError = e.message;
    if (!cache.body) return { live: false, error: e.message };
    return { ...cache.body, stale: true, error: e.message };
  }
  return cache.body;
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function authorized(req) {
  const want = process.env.DASHBOARD_AUTH;
  if (!want) return true;
  const h = req.headers.authorization || '';
  return h.startsWith('Basic ') && safeEq(Buffer.from(h.slice(6), 'base64').toString(), want);
}

async function readBody(req, limit = 20e6) {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > limit) throw new Error('body too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString();
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');

    if (url.pathname === '/api/tally/ingest' && req.method === 'POST') {
      const want = process.env.TALLY_INGEST_TOKEN;
      const got = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!want || !safeEq(got, want)) return send(res, 401, { error: 'unauthorized' });
      const data = JSON.parse(await readBody(req));
      await mkdir(join(root, 'data'), { recursive: true });
      await writeFile(TALLY_FILE, JSON.stringify({ receivedAt: new Date().toISOString(), data }));
      cache = { at: 0, body: null };
      return send(res, 200, { ok: true });
    }

    if (!authorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="BlueBay"' });
      return res.end();
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, source: process.env.PRIMARY_SOURCE || 'zoho', lastError });
    if (url.pathname === '/api/summary') return send(res, 200, await summary());

    const rel = url.pathname === '/' ? 'index.html' : pnorm(url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, 'public', rel);
    if (!file.startsWith(join(root, 'public')) || !existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 3000;
  server.listen(port, () => console.log(`BlueBay dashboard on :${port} (source: ${process.env.PRIMARY_SOURCE || 'zoho'})`));
}
