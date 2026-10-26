/**
 * Task 9.1 item 1: a lifestyle-modal save must not store an untouched slider default.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task9-1-defaults.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const posts = [];
await page.route('**/api/**', async (route) => {
  const req = route.request();
  if (/\/api\/talk/.test(req.url()) && req.method() === 'POST') {
    posts.push(JSON.parse(req.postData() || '{}'));
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'ok' }) });
});
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep']));
  localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
});
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => window.openProfileModal?.('lifestyle'));
await page.waitForSelector('input[name="lifestyleSleepDuration"]', { timeout: 10000 });
await page.click('input[name="lifestyleSleepDuration"][value="7-8h"]');
await page.click('.profile-modal-save');
await page.waitForTimeout(400);
for (const section of ['body', 'mind', 'goals', 'health']) {
  await page.evaluate((name) => window.openProfileModal?.(name), section);
  await page.waitForTimeout(300);
  await page.click('.profile-modal-save');
  await page.waitForTimeout(250);
}

const saved = await page.evaluate(async () => {
  const { profileState } = await import('/js/state.js');
  const { calibrationLine } = await import('/js/features/profile/focus-area-signals.js');
  const { sendMessageToLLM } = await import('/js/features/talk/llm.js');
  const profile = profileState.get();
  const record = JSON.parse(localStorage.getItem('TendAI_MasterRecord') || '{}');
  await sendMessageToLLM('Say hello only.');
  return {
    duration: profile.lifestyle?.sleepDuration ?? null,
    quality: profile.lifestyle?.sleepQuality ?? null,
    priority: profile.lifestyle?.goalsPriority ?? null,
    age: profile.body?.age ?? null,
    height: profile.body?.height ?? null,
    weight: profile.body?.weight ?? null,
    stress: profile.mind?.stressLevel ?? null,
    energy: profile.mind?.mentalEnergy ?? null,
    motivation: profile.goals?.motivationLevel ?? null,
    calibration: calibrationLine(profile, 'sleep'),
    masterQuality: record.Sleep?.quality ?? null,
  };
});
const payload = JSON.stringify(posts[0] || {});
console.log('[9.1] saved', JSON.stringify(saved));
console.log('[9.1] payload has sleep quality', /sleep quality/i.test(payload) || /"quality"\s*:\s*3/.test(payload));

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};
if (saved.duration !== '7-8h') fail(`duration not saved (${saved.duration})`);
if (saved.quality != null) fail(`untouched sleep quality was stored (${saved.quality})`);
if (saved.priority != null) fail(`untouched lifestyle priority was stored (${saved.priority})`);
if (!/1 of 2/.test(saved.calibration)) fail(`calibration ${saved.calibration}`);
if (saved.masterQuality != null) fail(`master record Sleep.quality is ${saved.masterQuality}`);
if (/sleep quality/i.test(payload)) fail('Talk payload contains sleep quality');
await browser.close();
if (failed) process.exit(1);
console.log('TASK9_1_DEFAULTS_OK');
