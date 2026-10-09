/**
 * Task 5b checkpoint: Feed advice card with real Gemini text.
 * Test profile: birth year, goal, diet, a name (must NOT be sent); today: steps + sleep + energy logged, water missing.
 *  - relay offline: no request, no log entry, card hidden
 *  - relay comes online: one request, card shows Gemini text (not the defaults), no truncation,
 *    log lists exactly the fields that were sent
 * Requires tendai-backend on :3001 with GOOGLE_API_KEY.
 * Usage: SERRON_URL=http://127.0.0.1:50490 node scripts/verify-task5b-feed-advice.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = process.env.SERRON_URL || 'http://127.0.0.1:5500';
const VW = 390;
const VH = 844;
fs.mkdirSync(outDir, { recursive: true });

const DEFAULTS = ['Aim for 7–8h sleep tonight.', 'Add protein to breakfast for a steadier morning.'];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();

const feedRequests = [];
const feedResponses = [];
page.on('request', (req) => {
  if (/\/api\/feed-advice/.test(req.url()) && req.method() === 'POST') feedRequests.push(JSON.parse(req.postData() || '{}'));
});
page.on('response', async (res) => {
  if (/\/api\/feed-advice/.test(res.url()) && res.request().method() === 'POST') {
    try {
      feedResponses.push(await res.json());
    } catch (_) {}
  }
});

await page.addInitScript(() => {
  if (sessionStorage.getItem('__s')) return;
  sessionStorage.setItem('__s', '1');
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem(
    'tendai-profile-state',
    JSON.stringify({
      body: { name: 'Feedtest', birthYear: 1985 },
      goals: { primaryGoals: ['better-sleep'] },
      lifestyle: { dietType: 'vegetarian' },
    }),
  );
  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(
    'tendai-day-state',
    JSON.stringify({ date: today, sleep: { hours: 6.5, target: 7.5 }, water: { current: 0, target: 8 }, energy: 'Good', stressLevel: 3 }),
  );
});

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const db = await import('/js/core/biometrics-db.js');
  await db.saveMetrics({ date: local, metrics: { steps: 6400, sleep: 0 } });
  const log = await import('/js/features/talk/data-sent-log.js');
  log.clearDataSentLog();
});

// Relay offline (default boot state): skipped silently
const beforeOffline = feedRequests.length;
await page.evaluate(async () => {
  window.resetAIAdviceCache();
  await window.updateFeedWithAIAdvice();
});
const offline = await page.evaluate(() => ({
  hidden: document.getElementById('feedAdviceCard')?.hidden,
  log: JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').filter((e) => e.requestType === 'feed-advice'),
}));
console.log('[relay offline] requests:', feedRequests.length - beforeOffline, '| log entries:', offline.log.length, '| card hidden:', offline.hidden);
if (feedRequests.length !== beforeOffline) fail('request sent while relay offline');
if (offline.log.length) fail('log entry written for a request that was never sent');
if (!offline.hidden) fail('card visible without advice');

// Relay comes online -> the deferred Feed request runs
await page.evaluate(async () => {
  const { NetworkController } = await import('/js/infrastructure/network-controller.js');
  const { publishBackendStatus } = await import('/js/core/backend-fetch.js');
  NetworkController.markReachable();
  publishBackendStatus('Online');
});
await page.waitForFunction(() => document.getElementById('feedAdviceCard') && !document.getElementById('feedAdviceCard').hidden, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(300);

const shown = await page.evaluate(() => ({
  hidden: document.getElementById('feedAdviceCard')?.hidden,
  quick: document.getElementById('quickAdviceText')?.textContent || '',
  nutrition: document.getElementById('feedNutritionText')?.textContent || '',
  source: document.getElementById('feedAdviceSource')?.textContent || '',
  log: JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').filter((e) => e.requestType === 'feed-advice'),
}));
const body = feedRequests[feedRequests.length - 1];
const reply = feedResponses[feedResponses.length - 1];
console.log('\nREQUEST BODY:', JSON.stringify(body));
console.log('GEMINI REPLY:', JSON.stringify(reply));
console.log('CARD:', JSON.stringify({ quick: shown.quick, nutrition: shown.nutrition, source: shown.source }));
console.log('LOG ENTRY:', JSON.stringify(shown.log, null, 1));

if (!body) fail('no request after relay came online');
else {
  const p = body.profileState || {};
  const d = body.dayState || {};
  if (p.name || p.location || JSON.stringify(body).includes('Feedtest')) fail('name/location sent');
  if (p.age == null || !p.goals || !p.diet) fail('provided profile fields missing');
  if (d.stepsToday !== 6400 || d.sleepLastNight !== 6.5 || d.moodToday !== 'Good') fail('logged day values missing');
  if ('hydrationLogged' in d) fail('hydration sent although nothing was logged');
}
if (!reply || reply.fallback) fail(`backend returned fallback (${reply && reply.reason})`);
if (shown.hidden) fail('card not shown');
if (DEFAULTS.includes(shown.quick) || DEFAULTS.includes(shown.nutrition)) fail('card shows default texts');
for (const t of [shown.quick, shown.nutrition]) {
  if (!/[.!?)]$/.test(t.trim()) || t.endsWith('...')) fail(`advice looks cut off: "${t}"`);
}
if (/water|hydrat|glass/i.test(shown.quick + shown.nutrition) && /\b\d+\s*(glasses|cups)\b/i.test(shown.quick + shown.nutrition)) {
  fail('advice cites a water amount that was never logged');
}

const entry = shown.log[0];
if (shown.log.length !== 1 || !entry) fail('expected exactly one feed-advice log entry');
else {
  const cats = entry.dataCategoriesIncluded.join(' | ');
  const sentProfile = Object.keys(body?.profileState || {}).join(', ');
  const sentDay = Object.entries(body?.dayState || {}).map(([k, v]) => `${k} ${v}`).join(', ');
  if (cats !== `profile: ${sentProfile} | today: ${sentDay}`) fail(`log categories do not match payload: ${cats}`);
  if (entry.outcome !== 'sent — advice shown in Feed') fail(`unexpected outcome ${entry.outcome}`);
}

await page.evaluate(() => document.getElementById('feedAdviceCard')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'task5b-feed-advice-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });

await browser.close();
if (failed) process.exit(1);
console.log('TASK5B_CHECKPOINT_OK');
