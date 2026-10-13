/**
 * Task 4 checkpoint (privacy gaps), 390px:
 *  4a/4b: Privacy Policy names Google Gemini, lists data categories, discloses automatic analysis;
 *         Settings info text says the same. Also reports what the first-launch screen shows.
 *  4c:    Settings shows "Notes Obrium has inferred about you" with real stored user_memory notes.
 *  4d:    Feed advice with sleep/mood missing sends no placeholder values (real backend + Gemini when running).
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task4-privacy.mjs
 * Requires tendai-backend running on :3001 for the live 4d advice check.
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

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const browser = await chromium.launch({ headless: true });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  return ctx.newPage();
};

// 4a/4b — Privacy Policy page
{
  const page = await newPage();
  await page.goto(base + '/privacy-policy.html', { waitUntil: 'domcontentloaded' });
  const text = await page.evaluate(() => document.querySelector('.legal-content')?.innerText || '');
  console.log('PRIVACY POLICY TEXT:\n' + text + '\n');
  if (!/Google's Gemini API/.test(text)) fail('policy does not name Google Gemini');
  for (const needle of [/Conversation text/, /Profile:/, /Health and wellbeing answers/, /Biometrics and daily context/, /notes Obrium has inferred/]) {
    if (!needle.test(text)) fail(`policy missing category ${needle}`);
  }
  if (!/Automatic Analysis/.test(text) || !/without you sending a message/.test(text)) fail('automatic analysis not disclosed');
  if (!/When you open Talk while profile questions are still unanswered/.test(text)) fail('greeting request not disclosed');
  if (!/sends only those values \(date, steps, sleep\)/.test(text)) fail('background biometric check not disclosed');
  if (/may show an alert/.test(text)) fail('policy claims behavior that does not happen');
  if (!/Feed advice<\/strong> is a separate, smaller request|Feed advice is a separate, smaller request/.test(text)) fail('Feed advice request not disclosed');
  if (/may be sent to our servers/.test(text)) fail('old vague "our servers" wording still present');
  await page.screenshot({ path: path.join(outDir, 'task4-privacy-policy-390.png'), fullPage: true });
  await page.context().close();
}

// First launch on a fresh device: which screen appears, and does it carry any privacy text?
{
  const page = await newPage();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__s')) return;
    sessionStorage.setItem('__s', '1');
    localStorage.clear();
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const first = await page.evaluate(() => ({
    welcomeModal: !!document.getElementById('welcomeModalOverlay'),
    onboardingText: document.querySelector('.system-onboarding-overlay')?.innerText?.replace(/\s+/g, ' ').trim() || '',
  }));
  console.log('FIRST LAUNCH:', JSON.stringify(first));
  await page.screenshot({ path: path.join(outDir, 'task4-first-launch-390.png') });
  await page.context().close();
}

// 4c + Settings text + 4d
const page = await newPage();
const feedRequests = [];
page.on('request', (req) => {
  if (/\/api\/feed-advice/.test(req.url()) && req.method() === 'POST') feedRequests.push(JSON.parse(req.postData() || '{}'));
});
const feedResponses = [];
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
    'tendai_user_memory_v1',
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      insights: ['Responds quickly to red alerts', 'Likes clean data', 'Prefers walking in the evening'],
    }),
  );
  // Day state for today with water logged but sleep and energy/mood deliberately missing.
  const d = new Date();
  const today = d.toISOString().split('T')[0];
  localStorage.setItem(
    'tendai-day-state',
    JSON.stringify({ date: today, sleep: { hours: null, target: 7.5 }, water: { current: 3, target: 8 }, energy: null, stressLevel: 3 }),
  );
});
await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
});

await page.evaluate(() => window.openSettingsModal && window.openSettingsModal());
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('settingsInferredNotes')?.scrollIntoView({ block: 'center' }));
await page.click('#settingsInferredNotes');
await page.waitForTimeout(300);
const notes = await page.evaluate(() => ({
  label: document.querySelector('#settingsInferredNotes .settings-row-label')?.textContent || '',
  hint: document.querySelector('#settingsInferredNotes .settings-row-hint')?.textContent || '',
  items: [...document.querySelectorAll('#settingsInferredNotesPanel li')].map((li) => li.textContent),
  expanded: document.getElementById('settingsInferredNotes')?.getAttribute('aria-expanded'),
  settingsInfo:
    document.getElementById('settingsPrivacyPolicy')?.closest('.settings-section')?.querySelector('.settings-info-text')?.textContent?.trim() || '',
}));
console.log('INFERRED NOTES VIEW:', JSON.stringify(notes, null, 1));
if (notes.label !== 'Notes Obrium has inferred about you') fail('notes row label wrong');
if (JSON.stringify(notes.items) !== JSON.stringify(['Responds quickly to red alerts', 'Likes clean data', 'Prefers walking in the evening'])) fail('notes list does not match stored user_memory');
if (!/Google's Gemini API/.test(notes.settingsInfo)) fail('Settings info text does not name Gemini');
await page.screenshot({ path: path.join(outDir, 'task4-inferred-notes-390.png') });

// 4d — Feed advice with sleep + mood missing
await page.evaluate(async () => {
  const { NetworkController } = await import('/js/infrastructure/network-controller.js');
  NetworkController.markReachable();
  const mod = await import('/js/features/talk/data-sent-log.js');
  mod.clearDataSentLog();
  if (window.resetAIAdviceCache) window.resetAIAdviceCache();
});
await page.evaluate(() => window.updateFeedWithAIAdvice && window.updateFeedWithAIAdvice());
await page.waitForFunction(() => {
  const log = JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]');
  return log.some((e) => e.requestType === 'feed-advice' && e.outcome);
}, { timeout: 30000 });
await page.waitForTimeout(500);
const feedLog = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').filter((e) => e.requestType === 'feed-advice'));
console.log('FEED REQUEST BODY:', JSON.stringify(feedRequests[0]));
console.log('FEED LOG ENTRY:', JSON.stringify(feedLog[0], null, 1));
console.log('FEED ADVICE REPLY:', JSON.stringify(feedResponses[0]));
const body = feedRequests[0];
if (!body) fail('no feed-advice request sent');
else {
  const json = JSON.stringify(body);
  if (/7\.2|"Good"|sleepLastNight|moodToday/.test(json)) fail('placeholder sleep/mood still in payload');
  if (body.dayState?.hydrationLogged !== 3) fail('real logged water value missing');
  if (Object.keys(body.profileState || {}).length) fail('profileState not empty');
}
const reply = feedResponses[0];
if (reply) {
  const adviceText = [reply.quickAdvice, reply.nutritionInsight, reply.tip].join(' ');
  if (/\b\d+(\.\d+)?\s*(h|hours?)\b.*(you|your|last night)|you slept|your sleep of|7\.2/i.test(adviceText)) fail('advice references fabricated sleep numbers');
  if (/\byour mood\b|feeling good today/i.test(adviceText)) fail('advice references a mood the user never gave');
}

await browser.close();
if (failed) process.exit(1);
console.log('TASK4_CHECKPOINT_OK');
