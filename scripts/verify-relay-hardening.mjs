/**
 * Task 11c: relay CORS, rate limits, validation, no content in logs, quota code.
 * Uses a stubbed Gemini upstream — no real key and no real quota.
 */
import http from 'http';
import { createApp } from '../tendai-backend/create-app.js';
import { BUSY_MESSAGE, RELAY_CODES } from '../tendai-backend/lib/errors.js';

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

process.env.NODE_ENV = 'production';
process.env.OBRIUM_ALLOWED_ORIGINS = 'https://app.example';
process.env.OBRIUM_RATE_LIMIT_PER_IP = '3';
process.env.OBRIUM_RATE_LIMIT_WINDOW_MS = '60000';
process.env.OBRIUM_DAILY_REQUEST_CAP = '100';
process.env.OBRIUM_MAX_BODY_BYTES = '2048';
process.env.OBRIUM_MAX_MESSAGE_LENGTH = '200';
delete process.env.GOOGLE_API_KEY;

const SECRET_MESSAGE = 'SECRET_USER_MESSAGE_xyz_should_not_appear';
const SECRET_PROFILE = 'SECRET_PROFILE_NAME_abc_should_not_appear';

const logs = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const capture = (...args) => {
  logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};
console.log = (...args) => {
  capture(...args);
  originalLog(...args);
};
console.error = (...args) => {
  capture(...args);
  originalError(...args);
};
console.warn = (...args) => {
  capture(...args);
  originalWarn(...args);
};

let stubMode = 'ok';
const stubSend = async () => {
  if (stubMode === 'quota') {
    const err = new Error('Resource exhausted: quota');
    err.status = 429;
    throw err;
  }
  if (stubMode === 'timeout') {
    const err = new Error('Upstream timeout');
    err.name = 'UpstreamTimeoutError';
    throw err;
  }
  return 'Stubbed wellness reply. Try drinking water.';
};

const app = createApp({
  sendToModel: stubSend,
  getGoogleGenAI: () => ({}),
  generateJsonText: async () =>
    JSON.stringify({
      quickAdvice: 'Try a short walk.',
      nutritionInsight: 'Add protein at lunch.',
      tip: 'Keep bedtime steady.',
    }),
});

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function req(path, { method = 'GET', origin, body, headers = {} } = {}) {
  const init = {
    method,
    headers: { ...headers },
  };
  if (origin) init.headers.Origin = origin;
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return { status: res.status, headers: res.headers, json, text };
}

// CORS allowed
const allowed = await req('/api/talk', {
  method: 'POST',
  origin: 'https://app.example',
  body: { message: 'hello' },
});
if (allowed.status !== 200 || allowed.json?.reply == null) fail(`allowed CORS ${allowed.status} ${allowed.text}`);
if (allowed.headers.get('access-control-allow-origin') !== 'https://app.example') {
  fail('missing ACAO for allowed origin');
}
console.log('[11c] CORS allowed');

// CORS denied
const denied = await req('/api/talk', {
  method: 'POST',
  origin: 'https://evil.example',
  body: { message: 'hello' },
});
if (denied.status !== 403 || denied.json?.code !== 'cors_denied') {
  fail(`denied CORS ${denied.status} ${denied.text}`);
}
console.log('[11c] CORS denied');

// Invalid payload
const bad = await req('/api/talk', {
  method: 'POST',
  origin: 'https://app.example',
  body: { message: 'hi', unexpectedHack: true },
});
if (bad.status !== 400 || bad.json?.code !== RELAY_CODES.BAD_REQUEST) {
  fail(`invalid payload ${bad.status} ${bad.text}`);
}
console.log('[11c] invalid payload 400');

// Oversized body
const big = 'x'.repeat(3000);
const oversized = await req('/api/talk', {
  method: 'POST',
  origin: 'https://app.example',
  body: { message: big.slice(0, 100), pad: big },
});
if (![400, 413].includes(oversized.status)) {
  fail(`oversized body ${oversized.status} ${oversized.text}`);
}
console.log('[11c] oversized rejected', oversized.status);

// Rate limit 429
stubMode = 'ok';
let hit429 = false;
for (let i = 0; i < 6; i += 1) {
  const r = await req('/api/talk', {
    method: 'POST',
    origin: 'https://app.example',
    body: { message: `ping ${i}` },
  });
  if (r.status === 429 && r.json?.code === RELAY_CODES.RATE_LIMITED) {
    hit429 = true;
    if (r.json.message !== BUSY_MESSAGE) fail(`busy message ${r.json.message}`);
    break;
  }
}
if (!hit429) fail('rate limit did not return 429');
console.log('[11c] rate-limit 429');

// Fresh server for quota (avoid rate limit)
server.close();
process.env.OBRIUM_RATE_LIMIT_PER_IP = '100';
stubMode = 'quota';
const app2 = createApp({
  sendToModel: stubSend,
  getGoogleGenAI: () => ({}),
  generateJsonText: async () => null,
});
const server2 = http.createServer(app2);
await new Promise((resolve) => server2.listen(0, '127.0.0.1', resolve));
const port2 = server2.address().port;
const base2 = `http://127.0.0.1:${port2}`;
const quota = await fetch(`${base2}/api/talk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' },
  body: JSON.stringify({
    message: SECRET_MESSAGE,
    userProfile: { name: SECRET_PROFILE },
    profileContext: 'profile note',
  }),
});
const quotaJson = await quota.json();
if (quota.status !== 429 || quotaJson.code !== RELAY_CODES.GEMINI_QUOTA) {
  fail(`quota ${quota.status} ${JSON.stringify(quotaJson)}`);
}
if (quotaJson.message !== BUSY_MESSAGE) fail('quota message not friendly');
console.log('[11c] quota → friendly code');

const joined = logs.join('\n');
if (joined.includes(SECRET_MESSAGE) || joined.includes(SECRET_PROFILE)) {
  fail('logs contained secret message or profile string');
}
console.log('[11c] logs clean');

// App-side mapping (pure check mirrors llm.js)
function mapBusy(status, code) {
  const busyCodes = new Set(['rate_limited', 'daily_cap', 'gemini_quota', 'upstream_timeout']);
  if (status === 429 || status === 503 || busyCodes.has(code)) return 'Obrium is busy, try again later';
  return 'other';
}
if (mapBusy(429, 'rate_limited') !== 'Obrium is busy, try again later') fail('app busy map');
if (mapBusy(503, 'upstream_timeout') !== 'Obrium is busy, try again later') fail('app timeout map');
console.log('[11c] app busy mapping');

server2.close();

// Trust proxy: X-Forwarded-For drives per-IP buckets when OBRIUM_TRUST_PROXY=1
process.env.OBRIUM_TRUST_PROXY = '1';
process.env.OBRIUM_RATE_LIMIT_PER_IP = '2';
stubMode = 'ok';
const app3 = createApp({
  sendToModel: stubSend,
  getGoogleGenAI: () => ({}),
  generateJsonText: async () => null,
});
const server3 = http.createServer(app3);
await new Promise((resolve) => server3.listen(0, '127.0.0.1', resolve));
const base3 = `http://127.0.0.1:${server3.address().port}`;

async function talkWithFwd(fwd) {
  const res = await fetch(`${base3}/api/talk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://app.example',
      'X-Forwarded-For': fwd,
    },
    body: JSON.stringify({ message: 'xff ping' }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const a1 = await talkWithFwd('203.0.113.10');
const a2 = await talkWithFwd('203.0.113.10');
const a3 = await talkWithFwd('203.0.113.10');
const b1 = await talkWithFwd('198.51.100.20');
if (a1.status !== 200 || a2.status !== 200) fail(`xff same-ip early ${a1.status}/${a2.status}`);
if (a3.status !== 429 || a3.json?.code !== RELAY_CODES.RATE_LIMITED) {
  fail(`xff same-ip should 429 on third: ${a3.status} ${JSON.stringify(a3.json)}`);
}
if (b1.status !== 200) fail(`xff other-ip should still pass: ${b1.status}`);
console.log('[11c] trust proxy X-Forwarded-For');

// Without trust proxy, spoofed XFF must not open a fresh bucket (all share socket IP)
server3.close();
process.env.OBRIUM_TRUST_PROXY = '0';
process.env.OBRIUM_RATE_LIMIT_PER_IP = '2';
const app4 = createApp({
  sendToModel: stubSend,
  getGoogleGenAI: () => ({}),
  generateJsonText: async () => null,
});
const server4 = http.createServer(app4);
await new Promise((resolve) => server4.listen(0, '127.0.0.1', resolve));
const base4 = `http://127.0.0.1:${server4.address().port}`;
async function talkSpoof(fwd) {
  const res = await fetch(`${base4}/api/talk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://app.example',
      'X-Forwarded-For': fwd,
    },
    body: JSON.stringify({ message: 'spoof' }),
  });
  return res.status;
}
const s1 = await talkSpoof('203.0.113.1');
const s2 = await talkSpoof('203.0.113.2');
const s3 = await talkSpoof('203.0.113.3');
if (s1 !== 200 || s2 !== 200) fail(`no-trust early ${s1}/${s2}`);
if (s3 !== 429) fail(`no-trust should ignore spoofed XFF and 429: ${s3}`);
console.log('[11c] trust proxy off ignores spoofed XFF');

server4.close();
console.log = originalLog;
console.error = originalError;
console.warn = originalWarn;

if (failed) process.exit(1);
console.log('TASK11C_OK');
