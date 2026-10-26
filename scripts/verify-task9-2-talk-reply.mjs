/**
 * Task 9.2 item 2: a real Talk message is not captured as a profile answer.
 * The two freeform cases POST /api/talk. This script fulfills those locally and counts them.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task9-2-talk-reply.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const base = baseUrl;
const STUB = 'I can stay with how you are feeling today. I cannot diagnose or treat a symptom.';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const talkPosts = [];

await page.route('**/api/talk', (route) => {
  talkPosts.push(route.request().postData() || '');
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reply: STUB }),
  });
});

await page.addInitScript(() => {
  if (sessionStorage.getItem('__boot')) return;
  sessionStorage.setItem('__boot', '1');
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
});

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

let started = false;
async function boot(profile) {
  if (!started) {
    started = true;
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    await page.evaluate((nextProfile) => {
      localStorage.clear();
      localStorage.setItem('tendai_system_onboarding_v1', '1');
      localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
      localStorage.setItem('tendai_welcome_accepted', '1');
      if (nextProfile) localStorage.setItem('tendai-profile-state', JSON.stringify(nextProfile));
    }, profile || null);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
    if (typeof window.switchView === 'function') window.switchView('talk');
  });
}

async function waitForPrompt(pattern) {
  await page.waitForFunction(
    (source) => {
      const nodes = [...document.querySelectorAll('.talk-view .message.bot .message-text')];
      const last = nodes.length ? nodes[nodes.length - 1].textContent || '' : '';
      return new RegExp(source, 'i').test(last);
    },
    pattern,
    { timeout: 15000 },
  );
}

async function send(text) {
  const before = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
  const postsBefore = talkPosts.length;
  await page.fill('#chatInput', text);
  await page.click('#sendBtn');
  await page.waitForFunction(
    (n) => {
      const nodes = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
      if (nodes.length <= n) return false;
      return !nodes[nodes.length - 1].classList.contains('message-typing');
    },
    before,
    { timeout: 20000 },
  );
  return talkPosts.length - postsBefore;
}

async function snapshot() {
  return page.evaluate(() => {
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator) .message-text')].map((el) =>
      (el.textContent || '').replace(/\s+/g, ' ').trim(),
    );
    const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
    return { bots, sex: profile.body?.sexAtBirth ?? null, age: profile.body?.age ?? null };
  });
}

await boot(null);
await waitForPrompt('male or female');
let posts = await send('male');
let snap = await snapshot();
console.log('MALE posts', posts, 'sex', snap.sex, 'last', snap.bots[snap.bots.length - 1]);
if (posts !== 0) fail(`male made ${posts} Talk requests`);
if (snap.sex !== 'male') fail(`male was not saved (${snap.sex})`);
if (/pick one of/i.test(snap.bots[snap.bots.length - 1])) fail('male got a clarifier');

await boot(null);
await waitForPrompt('male or female');
posts = await send("I'd rather not say");
snap = await snapshot();
console.log('RATHER NOT posts', posts, 'sex', snap.sex, 'last', snap.bots[snap.bots.length - 1]);
if (posts !== 0) fail(`rather-not made ${posts} Talk requests`);
if (snap.sex !== 'prefer-not-say') fail(`rather-not was not saved (${snap.sex})`);

await boot(null);
await waitForPrompt('male or female');
const openingCount = (await snapshot()).bots.filter((text) => /male or female/i.test(text)).length;
posts = await send('I have a headache today');
snap = await snapshot();
const sexAsks = snap.bots.filter((text) => /male or female/i.test(text)).length;
console.log('HEADACHE posts', posts, 'sex', snap.sex, 'asks', sexAsks, 'last', snap.bots[snap.bots.length - 1]);
if (posts !== 1) fail(`headache made ${posts} Talk requests`);
if (snap.sex != null) fail('headache saved a sex answer');
if (snap.bots[snap.bots.length - 1] !== STUB) fail('headache did not get the normal reply');
if (sexAsks !== openingCount) fail('headache repeated the pending question');
if (/pick one of/i.test(snap.bots.join(' '))) fail('headache was clarified as a form answer');

await boot(null);
await waitForPrompt('male or female');
posts = await send('why do you ask?');
snap = await snapshot();
console.log('WHY posts', posts, 'sex', snap.sex, 'last', snap.bots[snap.bots.length - 1]);
if (posts !== 1) fail(`why made ${posts} Talk requests`);
if (snap.sex != null) fail('why saved a sex answer');
if (snap.bots[snap.bots.length - 1] !== STUB) fail('why did not get the normal reply');
if (/pick one of/i.test(snap.bots[snap.bots.length - 1])) fail('why repeated the question');

await boot({ body: { sexAtBirth: 'male', genderIdentity: 'man' } });
await waitForPrompt('how old are you');
posts = await send('43');
snap = await snapshot();
console.log('AGE posts', posts, 'age', snap.age, 'last', snap.bots[snap.bots.length - 1]);
if (posts !== 0) fail(`age made ${posts} Talk requests`);
if (snap.age !== 43) fail(`age was not saved (${snap.age})`);

console.log('TALK_POSTS_TOTAL', talkPosts.length);
await browser.close();
if (failed) process.exit(1);
console.log('TASK9_2_TALK_REPLY_OK');
