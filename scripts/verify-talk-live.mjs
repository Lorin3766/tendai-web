/**
 * One-shot: load Talk, clear sticky offline, send a specific message, print reply + LOCAL badge.
 * Usage: SERRON_URL=http://127.0.0.1:50489 node scripts/verify-talk-live.mjs
 */
import { chromium } from 'playwright';

const base = process.env.SERRON_URL || process.env.TENDAI_URL || 'http://127.0.0.1:5500';
const TEST_MSG = 'I have a headache today';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const talkPosts = [];
page.on('response', async (res) => {
  if (!/\/api\/talk/i.test(res.url())) return;
  let body = '';
  try {
    body = await res.text();
  } catch (_) {}
  talkPosts.push({ status: res.status(), url: res.url(), body: body.slice(0, 500) });
});

await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  window.DEBUG_NETWORK = true;
});

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
  window.__obriumForceLocalConversation = false;
  if (window.NetworkController) window.NetworkController.isBackendReachable = true;
});

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForTimeout(500);

const badgeBefore = await page.locator('#talkRuntimeIndicator').textContent().catch(() => '');
console.log('BADGE_BEFORE:', JSON.stringify(badgeBefore || ''));

await page.fill('#chatInput', TEST_MSG);
await page.waitForTimeout(200);
await page.click('#sendBtn');

const botReply = page.locator('.talk-view .message.bot .message-text').last();
await botReply.waitFor({ state: 'visible', timeout: 45000 });
await page.waitForTimeout(800);

const replyText = ((await botReply.textContent()) || '').trim();
const badgeAfter = await page.locator('#talkRuntimeIndicator').textContent().catch(() => '');
const forceLocal = await page.evaluate(() => window.__obriumForceLocalConversation === true);
const coreText = await page.locator('[data-obrium-core-status] .sidebar-core-status__text').first().textContent().catch(() => '');

console.log('USER_MSG:', TEST_MSG);
console.log('REPLY:', replyText);
console.log('BADGE_AFTER:', JSON.stringify(badgeAfter || ''));
console.log('FORCE_LOCAL:', forceLocal);
console.log('CORE_STATUS:', JSON.stringify(coreText || ''));
console.log('TALK_POSTS:', JSON.stringify(talkPosts, null, 2));
console.log('IS_LOCAL_TEMPLATE:', /\[LOCAL MODE\]|I've analyzed your local data/i.test(replyText));
console.log('MENTIONS_HEADACHE:', /headache/i.test(replyText));

await browser.close();
if (/\[LOCAL MODE\]|I've analyzed your local data/i.test(replyText)) {
  process.exit(2);
}
