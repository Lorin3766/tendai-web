/**
 * Part 2 checkpoint: greeting + first question once, then reopen identical.
 * PNGs are literal 390px wide (deviceScaleFactor=1).
 * Usage: OBRIUM_URL=http://127.0.0.1:50489 node scripts/verify-talk-greeting-checkpoint.mjs
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

const firstBot = page.locator('.talk-view .message.bot:not(.typing-indicator) .message-text').last();
await firstBot.waitFor({ state: 'visible', timeout: 45000 });
await page.waitForTimeout(4000);
const openText = ((await firstBot.textContent()) || '').trim();
const openPath = await page.locator('.talk-view .message.bot:not(.typing-indicator)').last().getAttribute('data-profile-prompt-path');
const openCount = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();

console.log('OPEN_COUNT:', openCount);
console.log('OPEN_PATH:', openPath);
console.log('OPEN_TEXT:', openText);
console.log('OPEN_HAS_TENDAI:', /TendAI/i.test(openText));

const openFile = path.join(outDir, 'talk-greeting-open-390.png');
await page.screenshot({ path: openFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(openFile);

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('feed');
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForTimeout(1500);

const reopenText = ((await page.locator('.talk-view .message.bot:not(.typing-indicator) .message-text').last().textContent()) || '').trim();
const reopenPath = await page.locator('.talk-view .message.bot:not(.typing-indicator)').last().getAttribute('data-profile-prompt-path');
const reopenCount = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();

console.log('REOPEN_COUNT:', reopenCount);
console.log('REOPEN_PATH:', reopenPath);
console.log('REOPEN_TEXT:', reopenText);
console.log('REOPEN_IDENTICAL:', reopenText === openText && reopenCount === openCount && reopenPath === openPath);

const reopenFile = path.join(outDir, 'talk-greeting-reopen-390.png');
await page.screenshot({ path: reopenFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(reopenFile);

await browser.close();

if (/TendAI/i.test(openText) || openPath !== 'body.sexAtBirth' || openCount !== 1) process.exit(2);
if (reopenText !== openText || reopenCount !== openCount) process.exit(3);
