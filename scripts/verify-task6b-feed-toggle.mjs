/**
 * Task 6b checkpoint: "Generate advice on my Feed using AI" toggle.
 *  - ON (default): relay online -> one feed-advice request, card visible
 *  - OFF: card hidden at once; Feed open / relay online / direct call send nothing and log nothing
 *  - back ON (no reload): request resumes, card visible
 * Usage: SERRON_URL=http://127.0.0.1:50490 node scripts/verify-task6b-feed-toggle.mjs
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

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
let feedRequests = 0;
await page.route('**/api/**', (route) => {
  const url = route.request().url();
  if (/\/api\/feed-advice/.test(url)) {
    feedRequests++;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quickAdvice: 'Take a short walk after lunch.', nutritionInsight: 'Add a portion of vegetables to dinner.', tip: 'Pause for a few slow breaths.' }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
await page.addInitScript(() => {
  if (sessionStorage.getItem('__s')) return;
  sessionStorage.setItem('__s', '1');
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai-profile-state', JSON.stringify({ goals: { primaryGoals: ['better-sleep'] } }));
});

const state = () =>
  page.evaluate(() => ({
    hidden: document.getElementById('feedAdviceCard')?.hidden,
    logEntries: JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').filter((e) => e.requestType === 'feed-advice').length,
  }));

async function setToggle(on) {
  await page.evaluate(() => window.openSettingsModal && window.openSettingsModal());
  await page.waitForTimeout(400);
  const input = page.locator('#settingsAutoFeedAdvice');
  await input.scrollIntoViewIfNeeded();
  if ((await input.isChecked()) !== on) await page.locator('label[for="settingsAutoFeedAdvice"]').click();
  await page.waitForTimeout(600);
  if ((await input.isChecked()) !== on) fail(`toggle did not switch to ${on}`);
}
async function closeSettings() {
  await page.evaluate(() => window.closeSettingsModal && window.closeSettingsModal());
}
async function allTriggers() {
  await page.evaluate(async () => {
    const { publishBackendStatus } = await import('/js/core/backend-fetch.js');
    window.switchView && window.switchView('talk');
    window.switchView && window.switchView('feed');
    publishBackendStatus('Online');
    window.resetAIAdviceCache();
    await window.updateFeedWithAIAdvice();
  });
  await page.waitForTimeout(800);
}

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  const { NetworkController } = await import('/js/infrastructure/network-controller.js');
  const { publishBackendStatus } = await import('/js/core/backend-fetch.js');
  NetworkController.markReachable();
  publishBackendStatus('Online');
});
await page.waitForTimeout(1000);
const on1 = { requests: feedRequests, ...(await state()) };
console.log('[ON default] requests:', on1.requests, '| log entries:', on1.logEntries, '| card hidden:', on1.hidden);
if (!(on1.requests >= 1) || on1.hidden) fail('default ON did not show advice');

await setToggle(false);
const offImmediate = await state();
await closeSettings();
const beforeOff = { requests: feedRequests, log: offImmediate.logEntries };
await allTriggers();
const off = { requests: feedRequests - beforeOff.requests, ...(await state()) };
console.log('[OFF] card hidden right after toggle:', offImmediate.hidden, '| new requests after Feed open + relay online + direct call:', off.requests, '| new log entries:', off.logEntries - beforeOff.log, '| card hidden:', off.hidden);
if (!offImmediate.hidden || !off.hidden) fail('card visible while off');
if (off.requests !== 0) fail('request sent while off');
if (off.logEntries !== beforeOff.log) fail('log entry written while off');

await page.evaluate(() => window.openSettingsModal && window.openSettingsModal());
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('settingsAutoFeedAdvice')?.closest('.settings-field')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outDir, 'task6b-feed-toggle-off-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });

const beforeOn = feedRequests;
await setToggle(true);
await closeSettings();
await page.waitForTimeout(800);
const on2 = { requests: feedRequests - beforeOn, ...(await state()) };
console.log('[ON again, no reload] new requests:', on2.requests, '| card hidden:', on2.hidden);
if (on2.requests < 1 || on2.hidden) fail('advice did not resume after re-enabling');

await browser.close();
if (failed) process.exit(1);
console.log('TASK6B_CHECKPOINT_OK');
