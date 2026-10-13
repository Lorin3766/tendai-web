/**
 * Part 4 checkpoint: after 3 answers, pause; Continue resumes; Another time backs off.
 * Usage: OBRIUM_URL=http://127.0.0.1:50489 node scripts/verify-talk-part4.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = baseUrl;
const VW = 390;
const VH = 844;
fs.mkdirSync(outDir, { recursive: true });

function assertWidth(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  console.log(`DIM ${path.basename(file)} => ${png.width}x${png.height}`);
  if (png.width !== VW) throw new Error(`Expected width ${VW}, got ${png.width}`);
}

async function waitBotIdle(page) {
  await page.waitForFunction(() => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    return !typing && last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
  }, { timeout: 45000 });
}

async function sendTalk(page, text) {
  const before = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
  await page.fill('#chatInput', text);
  await page.waitForTimeout(150);
  await page.click('#sendBtn');
  await page.waitForFunction((prev) => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    const ready = last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
    return !typing && bots.length > prev && ready;
  }, before, { timeout: 45000 });
  await page.waitForTimeout(200);
}

async function lastBot(page) {
  return page.evaluate(() => {
    const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
    return {
      path: last?.getAttribute('data-profile-prompt-path') || null,
      pace: last?.getAttribute('data-talk-pace-prompt') === '1',
      text: (last?.querySelector('.message-text')?.textContent || '').trim(),
      hasContinue: Boolean(last?.querySelector('.talk-pace-continue')),
      hasLater: Boolean(last?.querySelector('.talk-pace-later')),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
});

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
  localStorage.removeItem('tendai_chat_history');
});
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await waitBotIdle(page);

const shot = async (name) => {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: VW, height: VH } });
  assertWidth(file);
};

await sendTalk(page, 'Male');
await sendTalk(page, 'Man');
await sendTalk(page, '43');
await page.waitForSelector('.talk-pace-continue', { timeout: 10000 });
const pause1 = await lastBot(page);
console.log('PAUSE1', pause1);
await shot('talk-part4-pause-1-390.png');

const continueStyle = await page.evaluate(() => {
  const btn = document.querySelector('.talk-pace-continue');
  const cs = btn ? getComputedStyle(btn) : null;
  return cs ? { bg: cs.backgroundImage || cs.backgroundColor, color: cs.color } : null;
});
console.log('CONTINUE_STYLE', continueStyle);

const beforeContinue = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await page.click('.talk-pace-continue');
await page.waitForFunction((prev) => {
  const typing = document.querySelector('.talk-view .typing-indicator');
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const last = bots[bots.length - 1];
  return !typing && bots.length > prev && last && !last.classList.contains('message-typing') && last.getAttribute('data-profile-prompt-path');
}, beforeContinue, { timeout: 20000 });
const afterContinue = await lastBot(page);
console.log('AFTER_CONTINUE', afterContinue);
await shot('talk-part4-after-continue-390.png');

await sendTalk(page, '180');
await sendTalk(page, '82');
await sendTalk(page, 'average');
await page.waitForSelector('.talk-pace-continue', { timeout: 10000 });
const pause2 = await lastBot(page);
console.log('PAUSE2', pause2);
await shot('talk-part4-pause-2-390.png');

const beforeStop = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await page.locator('.talk-pace-later').last().click();
await page.waitForFunction((prev) => {
  const typing = document.querySelector('.talk-view .typing-indicator');
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const last = bots[bots.length - 1];
  return !typing && bots.length > prev && last && !last.classList.contains('message-typing');
}, beforeStop, { timeout: 20000 });
const afterStop = await lastBot(page);
console.log('AFTER_STOP', afterStop);
await shot('talk-part4-after-stop-390.png');

const beforeFree = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await page.fill('#chatInput', 'hello');
await page.click('#sendBtn');
await page.waitForFunction((prev) => {
  const typing = document.querySelector('.talk-view .typing-indicator');
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const last = bots[bots.length - 1];
  return !typing && bots.length > prev && last && !last.classList.contains('message-typing');
}, beforeFree, { timeout: 45000 });
const afterFree = await lastBot(page);
console.log('AFTER_FREEFORM', afterFree);
await shot('talk-part4-freeform-390.png');

await browser.close();

const ok =
  pause1.pace && pause1.hasContinue && pause1.hasLater && !pause1.path &&
  afterContinue.path === 'body.height' &&
  pause2.pace && pause2.hasContinue && pause2.hasLater &&
  !afterStop.path && /next time|no rush|another time|ask me anything/i.test(afterStop.text) &&
  !afterFree.path && !afterFree.pace;

if (!ok) {
  console.error('PART4_CHECKPOINT_FAILED');
  process.exit(2);
}
console.log('PART4_CHECKPOINT_OK');
