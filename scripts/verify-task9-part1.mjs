/**
 * Task 9 Part 1 checks. 9b is always run; 9a/9c sections are added in later commits.
 * Usage: node scripts/verify-task9-part1.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getLibraryEntries,
  getEntries,
  isContentPreviewEnabled,
  validateLibrary,
} from '../mobile-app/js/features/feed/content-library.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const FORBIDDEN = [
  /diagnos/i,
  /\bcure\b/i,
  /\btreat/i,
  /prevent\w*\s+disease/i,
  /\bdose\b/i,
  /\bdosage\b/i,
  /\bmedication\b/i,
];

const entries = getLibraryEntries();
const schemaErrors = validateLibrary(entries);
for (const err of schemaErrors) fail(err);
console.log(`[9b] ${entries.length} entries, schema errors: ${schemaErrors.length}`);

const texts = entries.map((e) => e.text.trim());
if (new Set(texts).size !== texts.length) fail('duplicate entry text');
for (const e of entries) {
  for (const re of FORBIDDEN) {
    if (re.test(e.text)) fail(`${e.id} forbidden: ${re}`);
  }
  if (e.reviewed !== false || e.sourceVerified !== false) fail(`${e.id} shipped reviewed or source-verified`);
}

const profile = { body: { name: 'Ada', birthYear: 1983 } };
const strict = getEntries({ focusArea: 'sleep', profile }, { hostname: '127.0.0.1', search: '' });
console.log('[9b] strict mode:', strict);
if (strict !== null) fail('strict mode returned an unreviewed entry');

const prodPreview = getEntries(
  { focusArea: 'sleep', profile },
  { hostname: 'obrium.app', search: '?contentPreview=1' },
);
if (prodPreview !== null) fail('preview enabled off localhost');
if (isContentPreviewEnabled({ hostname: 'localhost', search: '?contentPreview=1' }) !== true) {
  fail('localhost preview guard');
}
if (isContentPreviewEnabled({ hostname: '127.0.0.1', search: '?contentPreview=0' }) !== false) {
  fail('preview flag must be exactly 1');
}

const day = new Date(2026, 9, 16);
const a = getEntries({ focusArea: 'sleep', profile, now: day }, { hostname: 'localhost', search: '?contentPreview=1' });
const b = getEntries({ focusArea: 'sleep', profile, now: day }, { hostname: 'localhost', search: '?contentPreview=1' });
const other = getEntries(
  { focusArea: 'sleep', profile: { body: { name: 'Other', birthYear: 1999 } }, now: day },
  { hostname: 'localhost', search: '?contentPreview=1' },
);
console.log('[9b] preview fact:', a?.id, 'stable', a?.id === b?.id);
if (!a || a.id !== b.id) fail('fact not stable for the same profile and date');
if (!a.text || a.text.length > 220) fail('preview fact missing or too long');
if (other && other.focusArea !== 'sleep') fail('wrong area');

const raw = readFileSync(path.join(root, 'mobile-app/js/features/feed/content-library.json'), 'utf8');
if (!raw.includes('"reviewed": false')) fail('library JSON missing reviewed false');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { getNextProfileQuestion } = await import('../mobile-app/js/features/profile/profile-schema.js');
const { signalProgress, calibrationLine, displayMaturityStage, FOCUS_AREA_SIGNALS } = await import(
  '../mobile-app/js/features/profile/focus-area-signals.js'
);
store.set('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
const fresh = {};
const q = getNextProfileQuestion(fresh);
console.log('[9a] priority question', q?.path);
if (q?.path !== 'lifestyle.sleepDuration') fail(`priority question ${q?.path}`);
const sleep = signalProgress(fresh, 'sleep');
if (sleep.n !== 0 || sleep.m !== 2) fail(`sleep progress ${sleep.n}/${sleep.m}`);
if (!/^Calibration: 0 of 2 signals/.test(calibrationLine(fresh, 'sleep'))) fail('calibration text');
if (displayMaturityStage(0, fresh, 'sleep') !== 0) fail('stage floor 0');
if (displayMaturityStage(2, fresh, 'sleep') !== 2) fail('stored stage 2 must win');
const withSleep = { lifestyle: { sleepDuration: '7-8h' } };
if (displayMaturityStage(0, withSleep, 'sleep') !== 1) fail('one signal should floor stage at 1');
if (getNextProfileQuestion(withSleep)?.path !== 'body.physicalActivity') fail('next area after sleep has a signal');
if (!FOCUS_AREA_SIGNALS.mental.every((s) => s.echo === 'generic')) fail('mental fields must be generic echo');
if (getNextProfileQuestion(withSleep) && calibrationLine(withSleep, 'sleep').includes('one more answer')) {
  console.log('[9a] calibration after one signal:', calibrationLine(withSleep, 'sleep'));
}

if (process.env.OBRIUM_URL || process.env.TENDAI_URL || process.env.SERRON_URL) {
  const { chromium } = await import('playwright');
  const { baseUrl } = await import('./lib/base-url.mjs');
  const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const apiHits = [];
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('request', (req) => {
    if (/\/api\//.test(req.url())) apiHits.push(req.url());
  });
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto(baseUrl + '/?contentPreview=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.click('[data-os-next]');
  await page.click('[data-os-ack-ai]');
  await page.click('[data-os-skip-health]');
  await page.fill('[data-os-birth-year]', '1983');
  await page.click('[data-os-next]');
  await page.click('[data-os-skip-blood]');
  await page.click('[data-os-allergies="no"]');
  await page.locator('[data-os-focus-area]').nth(0).click();
  await page.locator('[data-os-focus-area]').nth(1).click();
  await page.click('[data-os-finish]');
  await page.waitForTimeout(2500);
  const talkText = await page.evaluate(() => {
    const bots = [...document.querySelectorAll('.talk-view .message.bot .message-text, #chatLog .message.bot .message-text')];
    return bots.length ? bots[bots.length - 1].innerText.replace(/\s+/g, ' ').trim() : '';
  });
  const sidebar = await page.evaluate(() => document.getElementById('nextStepMobile')?.textContent?.trim() || '');
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]'));
  console.log('[9a] first Talk:', talkText.slice(0, 220));
  console.log('[9a] sidebar:', sidebar, '| api hits:', apiHits.length, '| log types:', log.map((e) => e.requestType));
  if (!/how many hours do you usually sleep/i.test(talkText)) fail('preview Talk did not ask sleep duration');
  if (sidebar !== 'Add your sleep duration') fail(`sidebar ${sidebar}`);
  if (apiHits.length) fail('profile opening sent an API request');
  if (log.some((e) => String(e.requestType || '').startsWith('B:'))) fail('profile opening wrote a B log entry');
  await page.screenshot({ path: path.join(outDir, 'task9-talk-first-390.png'), clip: { x: 0, y: 0, width: 390, height: 844 } });
  await page.evaluate(() => window.switchView?.('feed'));
  await page.waitForTimeout(1500);
  const feed = await page.evaluate(() => {
    const text = document.getElementById('feed-view')?.innerText || '';
    return {
      around: /around age/i.test(text),
      offline: /Sensor offline/i.test(text),
      cards: document.querySelectorAll('.universal-agent-card').length,
      cal: document.querySelector('[data-uac-calibration]')?.textContent || '',
      facts: [...document.querySelectorAll('[data-uac-content-slot]')].map((el) => el.textContent.trim().slice(0, 90)),
      feedLen: (document.getElementById('feed-view')?.innerHTML || '').length,
    };
  });
  console.log('[9a] feed', JSON.stringify(feed), 'errors', pageErrors.slice(0, 3));
  if (feed.around) fail('rendered Feed still says around age');
  if (feed.offline) fail('Stage 0 card shows Sensor offline');
  if (!/Calibration: 0 of/.test(feed.cal)) fail('calibration line missing on Feed');
  await page.screenshot({ path: path.join(outDir, 'task9-feed-preview-390.png'), clip: { x: 0, y: 0, width: 390, height: 844 } });
  await browser.close();
}

if (failed) process.exit(1);
console.log('TASK9_PART1_OK');
