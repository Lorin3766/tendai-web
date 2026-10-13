/**
 * Task 6c checkpoint: background health-check warning reaches the user.
 *  - new biometrics -> background check returns a warning -> next Talk open shows the "Worth a look" block + Talk badge
 *  - it survives a relaunch until acknowledged
 *  - after "Got it" it does not reappear (same view, relaunch)
 *  - the check's prompt asks for non-alarming, non-diagnostic wording
 * Usage: SERRON_URL=http://127.0.0.1:50490 node scripts/verify-task6c-health-warning.mjs
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

const WARNING = 'You logged about 4.5 hours of sleep last night, which is well under your usual target. It may be worth taking it easier today and aiming for an earlier night.';

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
let analysisPrompt = '';
await page.route('**/api/**', (route) => {
  const req = route.request();
  if (/\/api\/talk/.test(req.url()) && req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    if (/^SYSTEM PROMPT: Analyze/.test(body.message || '')) {
      analysisPrompt = body.message;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: WARNING }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Noted.' }) });
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
  // Profile complete enough that the greeting does not cover the view; greeting toggle off to isolate this check.
  localStorage.setItem('tendai_settings', JSON.stringify({ autoProfileQuestionsEnabled: false }));
});

const view = () =>
  page.evaluate(() => {
    const block = document.getElementById('system-advisory-block');
    const r = block?.getBoundingClientRect();
    const badge = [...document.querySelectorAll('#tab-talk .badge-count, [data-screen="talk"] .badge-count')].some(
      (b) => getComputedStyle(b).display !== 'none',
    );
    return {
      blockVisible: !!block && getComputedStyle(block).display !== 'none' && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
      header: document.querySelector('#system-advisory-block .system-advisory-header')?.textContent?.trim(),
      text: document.getElementById('systemAdvisoryText')?.textContent?.trim(),
      badge,
      stored: !!localStorage.getItem('tendai_active_advisory'),
    };
  });

async function boot() {
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove()));
}

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await boot();

// Background check fires while the user is on Feed
await page.evaluate(async () => {
  const { NetworkController } = await import('/js/infrastructure/network-controller.js');
  NetworkController.markReachable();
  window.switchView && window.switchView('feed');
  window.dispatchEvent(new CustomEvent('biometricsUpdated', { detail: { date: '2026-10-13', steps: 2100, sleep: 4.5 } }));
});
await page.waitForFunction(() => !!localStorage.getItem('tendai_active_advisory'), { timeout: 15000 }).catch(() => {});
const onFeed = await view();
console.log('[on Feed after check] Talk badge visible:', onFeed.badge, '| stored:', onFeed.stored);
if (!onFeed.badge) fail('no Talk badge while on Feed');

// Next Talk open
await page.evaluate(() => window.switchView && window.switchView('talk'));
await page.waitForTimeout(800);
const onTalk = await view();
console.log('[Talk opened] block visible:', onTalk.blockVisible, '| header:', onTalk.header, '| text:', onTalk.text);
if (!onTalk.blockVisible) fail('warning not visible when Talk opened');
if (onTalk.text !== WARNING) fail('warning text not shown as returned');
await page.screenshot({ path: path.join(outDir, 'task6c-health-warning-talk-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });

console.log('[Talk opened] marked seen (stored key cleared):', !onTalk.stored, '| badge cleared:', !onTalk.badge);
if (onTalk.stored) fail('warning not marked seen after being shown');

// Relaunch without tapping Got it: shown once already, so it does not come back
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await page.evaluate(() => window.switchView && window.switchView('talk'));
await page.waitForTimeout(800);
const relaunch1 = await view();
console.log('[relaunch after it was shown] block visible:', relaunch1.blockVisible, '| badge:', relaunch1.badge);
if (relaunch1.blockVisible || relaunch1.badge) fail('warning reappeared after being seen');

// A second, new warning: Got it path
await page.evaluate(async () => {
  const { NetworkController } = await import('/js/infrastructure/network-controller.js');
  NetworkController.markReachable();
  window.switchView && window.switchView('feed');
  window.dispatchEvent(new CustomEvent('biometricsUpdated', { detail: { date: '2026-10-13', steps: 1800, sleep: 4.5 } }));
});
await page.waitForFunction(() => !!localStorage.getItem('tendai_active_advisory'), { timeout: 15000 }).catch(() => {});
await page.evaluate(() => window.switchView && window.switchView('talk'));
await page.waitForTimeout(800);
const second = await view();
console.log('[second warning, Talk opened] block visible:', second.blockVisible);
if (!second.blockVisible) fail('second warning not shown');
await page.click('#systemAdvisoryAckBtn');
await page.waitForTimeout(500);
const acked = await view();
const inChat = await page.evaluate((w) => [...document.querySelectorAll('.talk-view .message')].some((m) => m.textContent.includes(w)), WARNING);
console.log('[after Got it] block visible:', acked.blockVisible, '| kept in chat:', inChat);
if (acked.blockVisible) fail('warning still shown after Got it');

await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await page.evaluate(() => window.switchView && window.switchView('talk'));
await page.waitForTimeout(800);
const relaunch2 = await view();
console.log('[relaunch after Got it] block visible:', relaunch2.blockVisible, '| badge:', relaunch2.badge);
if (relaunch2.blockVisible || relaunch2.badge) fail('warning reappeared after Got it');

console.log('\nANALYSIS PROMPT:', analysisPrompt);
if (/hardware-grade|cognitive\/systemic risks|critical deficit/i.test(analysisPrompt)) fail('analysis prompt still asks for alarming wording');

await browser.close();
if (failed) process.exit(1);
console.log('TASK6C_CHECKPOINT_OK');
