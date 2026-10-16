/**
 * Task 5a checkpoint: Settings toggles for automatic requests.
 *  - greeting toggle OFF  -> opening Talk sends no B request and writes no B log entry
 *  - health-check toggle OFF -> biometricsUpdated sends no C request and writes no C log entry
 *  - both back ON (no reload) -> B and C return
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task5a-auto-toggles.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = baseUrl;
const VW = 390;
const VH = 844;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();

const requests = [];
await page.route('**/api/**', async (route) => {
  const req = route.request();
  const url = req.url();
  if (/\/api\/talk/.test(url) && req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    requests.push(body);
    const isBackground = /^SYSTEM PROMPT: Analyze these new biometrics/.test(body.message || '');
    const reply = isBackground
      ? 'Sleep of 5.1h is a critical deficit. Prioritise rest today.'
      : "I'm Obrium, your personal companion. I get to know you so your Feed fits. Were you recorded male or female at birth?";
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply }) });
  }
  if (/\/api\/health/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await page.addInitScript(() => {
  if (sessionStorage.getItem('__seeded') === '1') return;
  sessionStorage.setItem('__seeded', '1');
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai-profile-state', JSON.stringify({ goals: { primaryGoals: ['better-sleep'] } }));
});

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const getLog = () => page.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]'));
const types = (log) => log.map((e) => e.requestType);
const isB = (b) => /opened Talk/.test(b.message || '');
const isC = (b) => /^SYSTEM PROMPT: Analyze/.test(b.message || '');

async function setToggle(id, on) {
  await page.evaluate(() => window.openSettingsModal && window.openSettingsModal());
  await page.waitForTimeout(400);
  const input = page.locator(`#${id}`);
  await input.scrollIntoViewIfNeeded();
  if ((await input.isChecked()) !== on) await page.locator(`label[for="${id}"]`).click();
  await page.waitForTimeout(150);
  if ((await input.isChecked()) !== on) fail(`${id} did not switch to ${on}`);
}

async function closeSettings() {
  await page.evaluate(() => {
    document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
    document.body.style.overflow = '';
  });
}

async function openTalkFresh() {
  await page.evaluate(() => window.switchView && window.switchView('feed'));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.querySelectorAll('.talk-view .message').forEach((m) => m.remove());
    window.switchView && window.switchView('talk');
  });
  await page.waitForTimeout(3000);
}

async function fireBiometrics() {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('biometricsUpdated', { detail: { date: '2026-10-06', steps: 3200, sleep: 5.1 } }));
  });
  await page.waitForTimeout(3000);
}

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
  localStorage.removeItem('tendai_chat_history');
  localStorage.removeItem('tendai_data_sent_log_v1');
});

const defaults = await page.evaluate(() => ({
  profile: document.getElementById('settingsAutoProfileQuestions')?.checked,
  health: document.getElementById('settingsAutoHealthChecks')?.checked,
}));
console.log('Defaults:', JSON.stringify(defaults));
if (!defaults.profile || !defaults.health) fail('toggles should default ON');

// --- OFF ---
await setToggle('settingsAutoProfileQuestions', false);
await setToggle('settingsAutoHealthChecks', false);
await page.evaluate(() => document.querySelector('#settingsAutoProfileQuestions')?.closest('.settings-section')?.scrollIntoView());
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outDir, 'task5a-toggles-off-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });
await closeSettings();
console.log('Stored settings:', await page.evaluate(() => localStorage.getItem('tendai_settings')));

await openTalkFresh();
await fireBiometrics();
const offLog = await getLog();
const offBots = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
console.log('\n[OFF] requests sent:', requests.length, '| log types:', JSON.stringify(types(offLog)), '| bot messages in Talk:', offBots);
if (requests.some(isB) || offLog.some((e) => e.requestType.startsWith('B:'))) fail('B still sent while greeting toggle off');
if (requests.some(isC) || offLog.some((e) => e.requestType.startsWith('C:'))) fail('C still sent while health-check toggle off');
if (offBots !== 0) fail('Talk greeted on its own while toggle off');

// --- back ON, no reload ---
await setToggle('settingsAutoProfileQuestions', true);
await setToggle('settingsAutoHealthChecks', true);
await closeSettings();
await openTalkFresh();
await fireBiometrics();
const onLog = await getLog();
console.log('[ON, no reload] log entries:');
for (const e of onLog) console.log(`  ${e.requestType} | ${e.trigger} | ${e.outcome} | ${e.dataCategoriesIncluded.join('; ')}`);
const cLogged = onLog.some((e) => e.requestType.startsWith('C:'));
if (!cLogged) fail('C did not return after re-enabling');
if (requests.length && !requests.some(isC)) fail('a talk post was captured that was not the health check');
const onBots = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
if (requests.some(isB) || onLog.some((e) => e.requestType.startsWith('B:'))) fail('scripted profile opening still sent a Gemini request');
if (!onBots) fail('Talk did not ask a profile question after re-enabling');

await browser.close();
if (failed) process.exit(1);
console.log('TASK5A_CHECKPOINT_OK');
