/**
 * Task 9.2 item 1: daily check-in stores a field only after that control is touched.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task9-2-checkin.mjs
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
const adviceBodies = [];

await page.route('**/api/feed-advice', (route) => {
  try {
    adviceBodies.push(JSON.parse(route.request().postData() || '{}'));
  } catch (_) {
    adviceBodies.push({});
  }
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      quickAdvice: 'A quiet evening helps.',
      nutritionInsight: 'A regular meal keeps the day steady.',
    }),
  });
});

await page.addInitScript(() => {
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

const FORBIDDEN_DAY_KEYS = ['sleepLastNight', 'hydrationLogged', 'moodToday', 'stressLevel', 'stepsToday', 'energy'];

function assertPayloadEmpty(label, body) {
  const day = body?.dayState || {};
  const present = FORBIDDEN_DAY_KEYS.filter((key) => key in day);
  if (present.length) fail(`${label} payload included ${present.join(', ')}: ${JSON.stringify(day)}`);
  else console.log(label, 'payload dayState', JSON.stringify(day));
}

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1800);
await page.evaluate(async () => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
  const { NetworkController } = await import('/js/infrastructure/network-controller.js');
  NetworkController.markReachable();
});

const controls = await page.evaluate(() => {
  const form = document.getElementById('dayCheckinForm');
  return {
    ids: [...form.querySelectorAll('input, select')].map((el) => el.id),
    text: form.innerText,
  };
});
console.log('CHECKIN CONTROLS:', controls.ids.join(', '));
if (controls.ids.sort().join(',') !== 'checkinEnergy,checkinSleep,checkinStress,checkinWater') {
  fail(`unexpected check-in controls: ${controls.ids.join(', ')}`);
}
if (/\b(mood|steps)\b/i.test(controls.text)) fail('check-in form has a mood or steps control');

await page.evaluate(() => window.openDayCheckin());
await page.waitForTimeout(200);
const before = await page.evaluate(() => ({
  water: document.getElementById('checkinWater').value,
  sleep: document.getElementById('checkinSleep').value,
  energy: document.getElementById('checkinEnergy').value,
  stress: document.getElementById('checkinStress').value,
  touched: document.getElementById('checkinStress').dataset.userTouched || '',
}));
console.log('UNTOUCHED OPEN:', JSON.stringify(before));
if (before.water !== '') fail('water opened with a stored-looking value');
if (before.sleep !== '') fail('sleep opened with a value');
if (before.energy !== '') fail('energy opened with a value');
if (before.stress !== '3') fail('stress thumb is not on the display default');
if (before.touched) fail('opening the slider marked it touched');

adviceBodies.length = 0;
await page.click('#dayCheckinSave');
await page.waitForTimeout(900);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai-day-state') || 'null'));
console.log('UNTOUCHED SAVE:', JSON.stringify({
  sleep: saved?.sleep?.hours ?? null,
  water: saved?.water?.current ?? null,
  energy: saved?.energy ?? null,
  stress: saved?.stressLevel ?? null,
}));
if (!saved) fail('check-in did not save a day record');
if (saved.sleep?.hours != null) fail('untouched sleep was stored');
if (saved.water?.current != null) fail(`untouched water was stored as ${saved.water.current}`);
if (saved.energy != null) fail('untouched energy was stored');
if (saved.stressLevel != null) fail(`untouched stress was stored as ${saved.stressLevel}`);
if (!adviceBodies.length) fail('untouched submit did not build a Feed advice payload');
else assertPayloadEmpty('untouched', adviceBodies[adviceBodies.length - 1]);

await page.evaluate(() => window.openDayCheckin());
await page.waitForTimeout(200);
adviceBodies.length = 0;
await page.click('.slider-btn-plus[data-slider-id="checkinStress"]');
await page.click('#dayCheckinSave');
await page.waitForTimeout(900);
const stressed = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai-day-state') || 'null'));
console.log('STRESS ONLY:', JSON.stringify({
  sleep: stressed?.sleep?.hours ?? null,
  water: stressed?.water?.current ?? null,
  energy: stressed?.energy ?? null,
  stress: stressed?.stressLevel ?? null,
}));
if (stressed?.stressLevel !== 4) fail(`expected stored stress 4, got ${stressed?.stressLevel}`);
if (stressed.sleep?.hours != null) fail('sleep stored when only stress was touched');
if (stressed.water?.current != null) fail('water stored when only stress was touched');
if (stressed.energy != null) fail('energy stored when only stress was touched');
if (!adviceBodies.length) fail('stress-only submit did not build a Feed advice payload');
else assertPayloadEmpty('stress-only', adviceBodies[adviceBodies.length - 1]);

await browser.close();
if (failed) process.exit(1);
console.log('TASK9_2_CHECKIN_OK');
