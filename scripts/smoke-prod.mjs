/**
 * Production smoke test. Does not deploy anything.
 * Usage: node scripts/smoke-prod.mjs <frontend-url> <relay-url> [--chat]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const frontend = (process.argv[2] || '').replace(/\/$/, '');
const relay = (process.argv[3] || '').replace(/\/$/, '');
const doChat = process.argv.includes('--chat');

if (!frontend || !relay) {
  console.error('Usage: node scripts/smoke-prod.mjs <frontend-url> <relay-url> [--chat]');
  process.exit(2);
}

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};
const ok = (msg) => console.log('OK:', msg);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const headersFile = fs.readFileSync(path.join(root, 'mobile-app', '_headers'), 'utf8');

async function get(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { res, text, json };
}

// Health
const health = await get(`${relay}/health`);
if (health.res.status !== 200 || health.json?.service !== 'tendai-backend') {
  fail(`health ${health.res.status} ${health.text}`);
} else ok('relay /health');

const apiHealth = await get(`${relay}/api/health`);
if (apiHealth.res.status !== 200 || !apiHealth.json?.api) fail(`api health ${apiHealth.res.status}`);
else ok('relay /api/health');

// CORS allowed vs random
const allowed = await get(`${relay}/api/talk`, {
  method: 'OPTIONS',
  headers: {
    Origin: frontend,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
});
const acao = allowed.res.headers.get('access-control-allow-origin');
if (allowed.res.status >= 400) fail(`CORS preflight from frontend origin ${allowed.res.status}`);
else if (acao && acao !== frontend && acao !== '*') fail(`CORS ACAO ${acao}`);
else ok(`CORS preflight from ${frontend} → ${allowed.res.status}`);

const denied = await get(`${relay}/api/talk`, {
  method: 'POST',
  headers: {
    Origin: 'https://smoke-random-origin.example',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ message: 'smoke' }),
});
if (denied.res.status === 200) fail('random origin was allowed to talk');
else ok(`CORS/deny random origin → ${denied.res.status}`);

// Front-end assets
const index = await get(`${frontend}/`);
if (index.res.status !== 200 || !/noindex/i.test(index.text)) fail('frontend missing noindex');
else ok('frontend noindex');

const manifest = await get(`${frontend}/manifest.json`);
if (manifest.res.status !== 200 || manifest.json?.name !== 'Obrium') fail('manifest');
else ok('manifest');

const sw = await get(`${frontend}/service-worker.js`);
if (sw.res.status !== 200 || !/obrium-shell-v/i.test(sw.text)) fail('service worker');
else ok('service worker');

const offline = await get(`${frontend}/offline.html`);
if (offline.res.status !== 200) fail('offline.html');
else ok('offline.html');

// Security headers file present in repo (hosts that support _headers apply them at the edge)
if (!/Content-Security-Policy:/i.test(headersFile) || !/X-Robots-Tag:\s*noindex/i.test(headersFile)) {
  fail('_headers incomplete in repo');
} else ok('_headers file in repo');

// Hosted response headers when the platform injects them
const robots = index.res.headers.get('x-robots-tag') || '';
if (robots && !/noindex/i.test(robots)) fail(`X-Robots-Tag ${robots}`);
if (robots) ok(`X-Robots-Tag: ${robots}`);
else console.log('NOTE: X-Robots-Tag not on response (http-server / host may not apply _headers)');

if (doChat) {
  const chat = await get(`${relay}/api/talk`, {
    method: 'POST',
    headers: {
      Origin: frontend.startsWith('http') ? frontend : 'http://127.0.0.1:50490',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: 'Say hello in one short wellness sentence.' }),
  });
  if (chat.res.status !== 200 || typeof chat.json?.reply !== 'string' || !chat.json.reply.trim()) {
    fail(`chat ${chat.res.status} ${chat.text.slice(0, 200)}`);
  } else {
    ok(`chat reply (${chat.json.reply.length} chars)`);
  }
} else {
  console.log('NOTE: skipped live chat (pass --chat to spend quota)');
}

if (failed) process.exit(1);
console.log('SMOKE_OK');
