/**
 * Verify Talk greeting fix: single proactive greeting, full question, no advice buttons.
 * Usage: SERRON_URL=http://127.0.0.1:50489 node scripts/verify-talk-greeting-fix.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = process.env.SERRON_URL || 'http://127.0.0.1:5500';
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
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
  localStorage.removeItem('tendai_chat_history');
  const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
  profile.body = profile.body || {};
  delete profile.body.sexAtBirth;
  localStorage.setItem('tendai-profile-state', JSON.stringify(profile));
});

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});

await page.waitForFunction(
  () => {
    const bots = document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)');
    if (bots.length !== 1) return false;
    const text = bots[0].querySelector('.message-text')?.textContent?.trim() || '';
    return text.length > 60 && /\?/.test(text);
  },
  { timeout: 45000 },
);

const snapshot = await page.evaluate(() => {
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const texts = bots.map((b) => (b.querySelector('.message-text')?.textContent || '').trim());
  const quickReplies = document.querySelectorAll('.talk-view .talk-quick-replies button').length;
  const welcomeHeaders = [...document.querySelectorAll('.talk-view .message-system-header')]
    .map((h) => h.textContent?.trim())
    .filter((t) => t === 'Welcome');
  return {
    botCount: bots.length,
    texts,
    quickReplies,
    welcomeHeaders: welcomeHeaders.length,
    promptPath: bots[0]?.getAttribute('data-profile-prompt-path') || null,
  };
});

console.log('SNAPSHOT:', JSON.stringify(snapshot, null, 2));

let failed = false;
if (snapshot.botCount !== 1) {
  console.error('FAIL: expected exactly 1 bot message, got', snapshot.botCount);
  failed = true;
}
if (snapshot.welcomeHeaders > 0) {
  console.error('FAIL: stale Welcome header still visible');
  failed = true;
}
if (/I'm online/i.test(snapshot.texts.join(' '))) {
  console.error('FAIL: passive onboarding welcome still visible');
  failed = true;
}
if (!snapshot.texts[0] || snapshot.texts[0].length < 80) {
  console.error('FAIL: greeting appears truncated:', snapshot.texts[0]);
  failed = true;
}
if (!/\?/.test(snapshot.texts[0] || '')) {
  console.error('FAIL: greeting missing complete question');
  failed = true;
}
if (snapshot.quickReplies > 0) {
  console.error('FAIL: advice quick-reply buttons present on profile prompt');
  failed = true;
}

const outFile = path.join(outDir, 'talk-greeting-fix-390.png');
await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(outFile);
console.log('SCREENSHOT:', outFile);

await browser.close();
if (failed) process.exit(1);
console.log('PASS');
