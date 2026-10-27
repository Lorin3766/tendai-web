/**
 * Task 11a: local day dates, missing stress, identity markers, legacy cleanup.
 * Usage: TZ=America/New_York OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task11a.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  localDateKey,
  migrateStoredDayDate,
  setObriumClockOverride,
  utcDateKey,
} from '../mobile-app/js/core/obrium-clock.js';
import { classifyProfileReply } from '../mobile-app/js/features/talk/profile-answer-parser.js';
import {
  CHECKIN_HISTORY_KEY,
  getObriumCheckinHistory,
} from '../mobile-app/js/features/metrics/checkin-history.js';
import { dayState, profileState } from '../mobile-app/js/state.js';
import { generateAdvice } from '../mobile-app/js/features/talk/messageParser.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

process.env.TZ = process.env.TZ || 'America/New_York';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
globalThis.location = { hostname: '127.0.0.1' };
globalThis.window = { location: globalThis.location };

const evening = new Date('2026-10-26T21:00:00-04:00');
const late = new Date('2026-10-26T23:59:00-04:00');
const morning = new Date('2026-10-26T08:00:00-04:00');
const dusk = new Date('2026-10-26T19:30:00-04:00');

for (const [label, when] of [
  ['08:00', morning],
  ['19:30', dusk],
  ['21:00', evening],
  ['23:59', late],
]) {
  const local = localDateKey(when);
  const utc = utcDateKey(when);
  if (local !== '2026-10-26') fail(`${label} local date ${local}`);
  if ((label === '08:00' || label === '19:30') && utc !== '2026-10-26') fail(`${label} UTC ${utc}`);
  if ((label === '21:00' || label === '23:59') && utc !== '2026-10-27') fail(`${label} UTC ${utc}`);
  const kept = migrateStoredDayDate(utc !== local ? utc : local, when);
  if (kept.date !== '2026-10-26') fail(`${label} migrate → ${kept.date}`);
  if (utc !== local && !kept.migrated) fail(`${label} should migrate`);
  if (utc === local && kept.migrated) fail(`${label} should not migrate`);
}

// Full dayState + history: seed legacy UTC key after the UTC rollover, then load.
setObriumClockOverride(evening);
store.set(
  'tendai-day-state',
  JSON.stringify({
    date: utcDateKey(evening),
    sleep: { hours: 7.5, target: 7.5 },
    water: { current: null, target: 8 },
    energy: null,
    stressLevel: null,
  }),
);
store.set(
  CHECKIN_HISTORY_KEY,
  JSON.stringify({ days: [{ date: utcDateKey(evening), sleepHours: 7.5 }] }),
);
dayState.invalidateCache();
const migratedDay = dayState.loadDayStateForToday();
if (migratedDay.date !== '2026-10-26' || migratedDay.sleep?.hours !== 7.5) {
  fail(`day migrate ${JSON.stringify(migratedDay)}`);
}
if (JSON.parse(store.get('tendai-day-state')).date !== '2026-10-26') {
  fail('day store not rewritten to local date');
}
const histAfter = getObriumCheckinHistory();
if (!histAfter.some((row) => row.date === '2026-10-26' && row.sleepHours === 7.5)) {
  fail(`history after migrate ${JSON.stringify(histAfter)}`);
}
if (histAfter.some((row) => row.date === '2026-10-27')) fail('UTC history row left behind');

// Same local day survives 08:00 → 23:59 through save/load.
setObriumClockOverride(morning);
dayState.invalidateCache();
dayState.saveDayStateForToday({
  sleep: { hours: 6, target: 7.5 },
  water: { current: null, target: 8 },
  energy: null,
  stressLevel: null,
});
for (const [label, when] of [
  ['19:30', dusk],
  ['21:00', evening],
  ['23:59', late],
]) {
  setObriumClockOverride(when);
  dayState.invalidateCache();
  const loaded = dayState.loadDayStateForToday();
  if (loaded.date !== '2026-10-26' || loaded.sleep?.hours !== 6) {
    fail(`${label} lost day record ${JSON.stringify(loaded)}`);
  }
}
dayState.saveDayStateForToday({
  ...dayState.loadDayStateForToday(),
  energy: 'Normal',
  stressLevel: 2,
});
const histLocal = getObriumCheckinHistory().find((row) => row.date === '2026-10-26');
if (!histLocal || histLocal.energy !== 'Normal' || histLocal.stress !== 2) {
  fail(`history fields ${JSON.stringify(histLocal)}`);
}
console.log('[11a] local day + history');

const sex = { sectionKey: 'body', fieldKey: 'sexAtBirth', fieldLabel: 'Sex at birth' };
const gender = { sectionKey: 'body', fieldKey: 'genderIdentity', fieldLabel: 'Gender identity' };
for (const [q, text, kind] of [
  [sex, 'my wife is female', 'message'],
  [sex, 'female', 'save'],
  [sex, 'I am female', 'save'],
  [gender, "I'm a woman", 'save'],
  [gender, 'his friend is a man', 'message'],
  [sex, "I'd rather not say", 'save'],
]) {
  const result = classifyProfileReply(q, text);
  if (result.kind !== kind) fail(`identity "${text}" → ${JSON.stringify(result)}`);
}
console.log('[11a] identity markers');

profileState.save({ mind: {}, lifestyle: {} });
dayState.save({ date: '2026-10-26' });
const adviceMissing = generateAdvice();
if (/stress/i.test(adviceMissing)) fail(`missing stress mentioned: ${adviceMissing}`);
profileState.save({ mind: { stressLevel: 4 }, lifestyle: {} });
const adviceHigh = generateAdvice();
if (!/stress/i.test(adviceHigh)) fail(`logged stress omitted: ${adviceHigh}`);
console.log('[11a] stress advice ok');

for (const rel of [
  'mobile-app/js/morning-checkin.js',
  'mobile-app/js/evening-checkin.js',
  'mobile-app/js/daily-action.js',
]) {
  if (fs.existsSync(path.join(root, rel))) fail(`legacy file still present: ${rel}`);
}
console.log('[11a] legacy copies removed');

if (!process.env.OBRIUM_URL) {
  if (failed) process.exit(1);
  console.log('TASK11A_OK (unit only)');
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  timezoneId: 'America/New_York',
});
const page = await context.newPage();
await page.route('**/api/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
  localStorage.setItem('tendai_contact_frequency_v1', '2');
});
await page.goto(process.env.OBRIUM_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1600);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
});

const stateHref = new URL('./js/state.js', process.env.OBRIUM_URL + '/').href;

const survive = await page.evaluate(async (stateHref) => {
  const mod = await import(stateHref);
  const now = new Date();
  const at = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  const out = [];
  window.setObriumClockOverride(at(8, 0));
  mod.dayState.saveDayStateForToday({
    sleep: { hours: 7.5, target: 7.5 },
    water: { current: null, target: 8 },
    energy: null,
    stressLevel: null,
  });
  for (const [label, h, m] of [
    ['08:00', 8, 0],
    ['19:30', 19, 30],
    ['21:00', 21, 0],
    ['23:59', 23, 59],
  ]) {
    window.setObriumClockOverride(at(h, m));
    mod.dayState.invalidateCache();
    const day = mod.dayState.loadDayStateForToday();
    const history = JSON.parse(localStorage.getItem('tendai_checkin_history_v1') || '{"days":[]}').days;
    out.push({
      label,
      date: day.date,
      sleep: day.sleep?.hours,
      localKey: mod.dayState.getTodayDate(),
      historyDates: history.map((row) => row.date),
      utcKey: at(h, m).toISOString().split('T')[0],
    });
  }
  return out;
}, stateHref);

console.log('[11a] browser survive', JSON.stringify(survive));
for (const row of survive) {
  if (row.date !== row.localKey) fail(`${row.label} date ${row.date} ≠ ${row.localKey}`);
  if (row.sleep !== 7.5) fail(`${row.label} lost sleep`);
  if (!row.historyDates.includes(row.localKey)) fail(`${row.label} history missing local date`);
  if (row.utcKey !== row.localKey && row.historyDates.includes(row.utcKey) && !row.historyDates.includes(row.localKey)) {
    fail(`${row.label} history still on UTC only`);
  }
}

// Legacy UTC seed at 21:00
const legacy = await page.evaluate(async (stateHref) => {
  const mod = await import(stateHref);
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0);
  window.setObriumClockOverride(local);
  const localKey = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  const utcKey = local.toISOString().split('T')[0];
  localStorage.setItem(
    'tendai-day-state',
    JSON.stringify({
      date: utcKey,
      sleep: { hours: 8, target: 7.5 },
      water: { current: null, target: 8 },
      energy: null,
      stressLevel: null,
    }),
  );
  localStorage.setItem(
    'tendai_checkin_history_v1',
    JSON.stringify({ days: [{ date: utcKey, sleepHours: 8 }] }),
  );
  mod.dayState.invalidateCache();
  const day = mod.dayState.loadDayStateForToday();
  const history = JSON.parse(localStorage.getItem('tendai_checkin_history_v1') || '{"days":[]}').days;
  return { localKey, utcKey, dayDate: day.date, sleep: day.sleep?.hours, history };
}, stateHref);
console.log('[11a] browser legacy', JSON.stringify(legacy));
if (legacy.utcKey === legacy.localKey) {
  console.log('[11a] note: UTC and local match at this instant; migration branch untested in browser this run');
} else {
  if (legacy.dayDate !== legacy.localKey || legacy.sleep !== 8) fail(`legacy migrate ${JSON.stringify(legacy)}`);
  if (!legacy.history.some((row) => row.date === legacy.localKey)) fail('legacy history not moved');
}

// Evening check-in completes the evening step at 21:00
await page.evaluate(async (stateHref) => {
  const mod = await import(stateHref);
  const now = new Date();
  window.setObriumClockOverride(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0));
  localStorage.removeItem('tendai_today_steps_v1');
  mod.dayState.saveDayStateForToday({
    sleep: { hours: 7.5, target: 7.5 },
    water: { current: null, target: 8 },
    energy: null,
    stressLevel: null,
  });
  window.renderTodayBlock?.();
}, stateHref);
await page.waitForTimeout(400);
const eveningOffer = await page.evaluate(() => ({
  text: document.getElementById('todayBlockText')?.textContent || '',
  hidden: document.getElementById('todayBlock')?.hidden,
  buttons: [...document.querySelectorAll('#todayBlockActions button')].map((b) => b.textContent),
}));
console.log('[11a] evening offer', JSON.stringify(eveningOffer));
if (eveningOffer.hidden || !/How was your day/i.test(eveningOffer.text)) {
  fail(`evening check-in missing: ${eveningOffer.text}`);
}
await page.click('#todayBlockActions .btn');
await page.waitForTimeout(400);
await page.selectOption('#checkinEnergy', 'Normal');
await page.dispatchEvent('#checkinEnergy', 'change');
await page.click('#dayCheckinSave');
await page.waitForTimeout(500);
const afterEvening = await page.evaluate(() => ({
  ack: document.getElementById('todayBlockAck')?.textContent || '',
  steps: JSON.parse(localStorage.getItem('tendai_today_steps_v1') || '[]'),
  day: JSON.parse(localStorage.getItem('tendai-day-state') || 'null'),
  history: JSON.parse(localStorage.getItem('tendai_checkin_history_v1') || '{"days":[]}').days,
}));
console.log('[11a] after evening', JSON.stringify(afterEvening));
if (afterEvening.ack !== 'Logged.') fail(`evening not completed: ${afterEvening.ack}`);
if (afterEvening.steps[0]?.actionId !== 'checkin-day' || afterEvening.steps[0]?.status !== 'done') {
  fail(`evening outcome ${JSON.stringify(afterEvening.steps)}`);
}
const localToday = afterEvening.day?.date;
if (!localToday || !afterEvening.history.some((row) => row.date === localToday && row.energy === 'Normal')) {
  fail(`evening history ${JSON.stringify(afterEvening.history)}`);
}

await browser.close();
if (failed) process.exit(1);
console.log('TASK11A_OK');
