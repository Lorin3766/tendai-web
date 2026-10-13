/**
 * Task 7 C3 checkpoint: renamed config names with legacy fallback.
 *  1. Scripts: OBRIUM_URL only / SERRON_URL only / TENDAI_URL only / both -> correct base URL, warning only on fallback.
 *  2. Browser: window.OBRIUM_BACKEND_URL only / window.SERRON_BACKEND_URL only / both -> relay URL, relay detection,
 *     bearer header and a real request to the override; legacy name warns exactly once.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task7c3-env-fallback.mjs
 */
import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
import { baseUrl } from './lib/base-url.mjs';

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

// 1. Node env var used by the test scripts
const probe = "import('./scripts/lib/base-url.mjs').then((m) => console.log('BASE=' + m.baseUrl))";
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(OBRIUM|SERRON|TENDAI)_URL$/.test(k)));
for (const [label, extra, expected, warns] of [
  ['OBRIUM_URL only', { OBRIUM_URL: 'http://new.test' }, 'http://new.test', false],
  ['SERRON_URL only', { SERRON_URL: 'http://old.test' }, 'http://old.test', true],
  ['TENDAI_URL only', { TENDAI_URL: 'http://older.test' }, 'http://older.test', true],
  ['both set', { OBRIUM_URL: 'http://new.test', SERRON_URL: 'http://old.test' }, 'http://new.test', false],
]) {
  const r = spawnSync(process.execPath, ['-e', probe], { env: { ...clean, ...extra }, encoding: 'utf8' });
  const got = (r.stdout.match(/BASE=(.*)/) || [])[1];
  const warned = /deprecated/.test(r.stderr);
  console.log(`[scripts] ${label}: base=${got} warning=${warned ? JSON.stringify(r.stderr.trim()) : 'none'}`);
  if (got !== expected) fail(`${label}: expected ${expected}`);
  if (warned !== warns) fail(`${label}: warning expected=${warns}`);
}

// 2. Browser runtime overrides
const browser = await chromium.launch({ headless: true });
for (const [label, cfg, warns] of [
  ['window.OBRIUM_BACKEND_URL only', { OBRIUM_BACKEND_URL: 'http://127.0.0.1:3999', OBRIUM_BACKEND_BEARER: 'new-token' }, false],
  ['window.SERRON_BACKEND_URL only', { SERRON_BACKEND_URL: 'http://127.0.0.1:3999', SERRON_BACKEND_BEARER: 'old-token' }, true],
  ['both set', { OBRIUM_BACKEND_URL: 'http://127.0.0.1:3999', SERRON_BACKEND_URL: 'http://127.0.0.1:3888' }, false],
]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning' && /deprecated/.test(m.text())) warnings.push(m.text()); });
  const hits = [];
  await page.route('http://127.0.0.1:3999/**', (route) => {
    hits.push({ url: route.request().url(), auth: route.request().headers().authorization ? 'present' : 'none' });
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  });
  await page.addInitScript((c) => {
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    Object.assign(window, c);
  }, cfg);
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const llm = await import('/js/features/talk/llm.js');
    const { NetworkController } = await import('/js/infrastructure/network-controller.js');
    const url = llm.getBackendURL();
    const headers = llm.buildBackendHeaders();
    llm.getBackendURL();
    llm.buildBackendHeaders();
    const res = await fetch(url + '/api/health', { headers });
    return { url, isRelay: NetworkController._isRelayUrl(url + '/api/talk'), bearer: headers.Authorization ? 'present' : 'none', status: res.status };
  });
  console.log(`[browser] ${label}: relay=${r.url} isRelay=${r.isRelay} bearer=${r.bearer} request->${hits.length ? hits[0].url : 'none'} (${r.status}) warnings=${warnings.length ? JSON.stringify(warnings) : 'none'}`);
  if (r.url !== 'http://127.0.0.1:3999' || !r.isRelay || !hits.length) fail(`${label}: override not used`);
  if (cfg.OBRIUM_BACKEND_BEARER || cfg.SERRON_BACKEND_BEARER) {
    if (r.bearer !== 'present' || hits[0]?.auth !== 'present') fail(`${label}: bearer not sent`);
  }
  if (warns ? warnings.length < 1 : warnings.length) fail(`${label}: unexpected warning count ${warnings.length}`);
  if (new Set(warnings).size !== warnings.length) fail(`${label}: a legacy warning repeated`);
  await page.close();
}
await browser.close();
if (failed) process.exit(1);
console.log('TASK7C3_CHECKPOINT_OK');
