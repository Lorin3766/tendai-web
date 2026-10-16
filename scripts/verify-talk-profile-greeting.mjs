/**
 * Verify Talk incomplete-profile greeting + first question.
 * Usage: OBRIUM_URL=http://127.0.0.1:50489 node scripts/verify-talk-profile-greeting.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const base = baseUrl;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
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
});

const next = await page.evaluate(() => {
  const fn = window.getNextProfileQuestion;
  const profile = window.profileState && typeof window.profileState.get === 'function'
    ? window.profileState.get()
    : {};
  return fn ? fn(profile) : null;
});
console.log('RESOLVER:', JSON.stringify(next));

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});

const firstBot = page.locator('.talk-view .message.bot:not(.typing-indicator) .message-text').last();
await firstBot.waitFor({ state: 'visible', timeout: 45000 });
await page.waitForTimeout(4000);
const firstText = ((await firstBot.textContent()) || '').trim();
const firstPath = await page.locator('.talk-view .message.bot:not(.typing-indicator)').last().getAttribute('data-profile-prompt-path');
const typingLeft = await page.locator('.message-typing').count();
console.log('OPEN1_TYPING:', typingLeft);
console.log('OPEN1_LEN:', firstText.length);

console.log('OPEN1_TEXT:', firstText);
console.log('OPEN1_PATH:', firstPath);
console.log('OPEN1_LOCAL:', /\[LOCAL MODE\]|Identity: TendAI/i.test(firstText));
console.log('OPEN1_ASKS_SEX:', /sex at birth|male or female|recorded male|assigned at birth/i.test(firstText));

await page.fill('#chatInput', 'Male');
await page.click('#sendBtn');
await page.waitForFunction(() => {
  const bots = document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)');
  const btn = document.querySelector('#sendBtn');
  return bots.length >= 2 && btn && btn.textContent === 'Send';
}, { timeout: 45000 });
await page.waitForTimeout(800);

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('feed');
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});

await page.waitForFunction(() => {
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const last = bots[bots.length - 1];
  return last && last.getAttribute('data-profile-prompt-path') === 'body.genderIdentity';
}, { timeout: 45000 });
await page.waitForTimeout(1500);
const bots = page.locator('.talk-view .message.bot:not(.typing-indicator) .message-text');
const count = await bots.count();
const lastText = ((await bots.nth(count - 1).textContent()) || '').trim();
const lastPath = await page.locator('.talk-view .message.bot:not(.typing-indicator)').last().getAttribute('data-profile-prompt-path');
console.log('REOPEN_BOT_COUNT:', count);
console.log('REOPEN_LAST_TEXT:', lastText);
console.log('REOPEN_LAST_PATH:', lastPath);
console.log('REOPEN_SAME_FIELD:', lastPath === 'body.genderIdentity');

await browser.close();
if (firstPath !== 'body.sexAtBirth' || /\[LOCAL MODE\]|Identity: TendAI/i.test(firstText)) {
  process.exit(2);
}
if (lastPath !== 'body.genderIdentity') {
  process.exit(3);
}
