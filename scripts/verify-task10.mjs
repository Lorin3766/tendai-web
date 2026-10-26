/**
 * Task 10 checks. 10a is the Today block. Later parts extend this file.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task10.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { validateLibrary } from '../mobile-app/js/features/feed/content-library.js';
import {
  selectTodayStep,
  resolveTodayDisplay,
  scheduledSlots,
} from '../mobile-app/js/features/feed/today-steps.js';
import { localDateKey, slotForTime, isClockOverrideAllowed } from '../mobile-app/js/core/obrium-clock.js';
import {
  followUpAcknowledgment,
  localDayOffset,
  noteProfileFactsSeen,
  selectDueFollowUp,
} from '../mobile-app/js/features/talk/follow-ups.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const schemaErrors = validateLibrary();
for (const err of schemaErrors) fail(err);
if (!schemaErrors.length) console.log('[10a] library valid');

const morning = new Date(2026, 9, 26, 9, 0, 0);
const evening = new Date(2026, 9, 26, 18, 30, 0);
const midday = new Date(2026, 9, 26, 13, 0, 0);
const nearEvening = new Date(2026, 9, 26, 15, 30, 0);
if (slotForTime(morning) !== 'morning') fail('morning slot');
if (slotForTime(evening) !== 'evening') fail('evening slot');
if (slotForTime(midday) !== 'morning') fail('early afternoon should stay with morning');
if (slotForTime(nearEvening) !== 'evening') fail('late afternoon should use evening');
if (scheduledSlots(morning, 1).join(',') !== 'morning') fail('one slot follows the clock');
if (scheduledSlots(morning, 2).join(',') !== 'morning,evening') fail('two slots');
if (localDateKey(new Date(2026, 2, 8, 1, 30)) !== '2026-03-08') fail('local date key');
if (isClockOverrideAllowed({ hostname: 'obrium.app' })) fail('clock override allowed off localhost');
if (!isClockOverrideAllowed({ hostname: '127.0.0.1' })) fail('clock override blocked on loopback');

const logged = { sleepHours: 7, energy: 'Good', stressLevel: 2 };
const areas = ['sleep', 'move'];
const day1 = selectTodayStep({
  areas,
  slot: 'morning',
  dateKey: '2026-10-26',
  history: [],
  day: logged,
  preview: true,
});
const day1Again = selectTodayStep({
  areas,
  slot: 'morning',
  dateKey: '2026-10-26',
  history: [],
  day: logged,
  preview: true,
});
console.log('[10a] day1', day1?.id, day1?.text);
if (!day1 || day1.kind !== 'action') fail('preview morning did not pick an action');
if (day1?.id !== day1Again?.id) fail('selection flickered');

const day2 = selectTodayStep({
  areas,
  slot: 'morning',
  dateKey: '2026-10-27',
  history: [{ date: '2026-10-26', slot: 'morning', actionId: day1.id, area: day1.area, status: 'done' }],
  day: logged,
  preview: true,
});
console.log('[10a] day2', day2?.id, day2?.area);
if (!day2 || day2.id === day1.id) fail('day 2 repeated day 1');

const eveningStep = selectTodayStep({
  areas,
  slot: 'evening',
  dateKey: '2026-10-26',
  history: [],
  day: logged,
  preview: true,
});
console.log('[10a] evening', eveningStep?.id);
if (!eveningStep || eveningStep.id === day1.id) fail('evening step matched the morning step');

const skipped = selectTodayStep({
  areas,
  slot: 'morning',
  dateKey: '2026-10-28',
  history: [
    { date: '2026-10-26', slot: 'morning', actionId: 'act-sleep-lights', area: 'sleep', status: 'skipped' },
    { date: '2026-10-27', slot: 'morning', actionId: 'act-sleep-lights', area: 'sleep', status: 'skipped' },
  ],
  day: logged,
  preview: true,
});
console.log('[10a] after two skips', skipped?.id, skipped?.area, skipped?.effort);
if (!skipped || skipped.area === 'sleep' || skipped.effort !== 'low') fail('two skips did not change area and lower effort');

const checkin = selectTodayStep({
  areas,
  slot: 'morning',
  dateKey: '2026-10-26',
  history: [],
  day: { sleepHours: null, energy: null, stressLevel: null },
  preview: false,
});
if (checkin?.id !== 'checkin-sleep') fail(`strict morning without sleep was ${checkin?.id}`);
const strictHidden = selectTodayStep({
  areas,
  slot: 'morning',
  dateKey: '2026-10-26',
  history: [],
  day: logged,
  preview: false,
});
if (strictHidden) fail('strict mode offered an unreviewed action');
const eveningCheckin = selectTodayStep({
  areas,
  slot: 'evening',
  dateKey: '2026-10-26',
  history: [],
  day: { sleepHours: 7, energy: null, stressLevel: null },
  preview: false,
});
if (eveningCheckin?.id !== 'checkin-day') fail('evening without energy/stress did not ask for the day');

const shown = resolveTodayDisplay({
  now: morning,
  slotsPerDay: 1,
  areas,
  history: [],
  day: { sleepHours: null },
  preview: false,
});
if (shown.mode !== 'offer' || shown.step.id !== 'checkin-sleep') fail('display did not offer the check-in');

const moveStep = {
  date: '2026-10-25',
  slot: 'morning',
  actionId: 'act-move-morning',
  area: 'move',
  status: 'done',
};
const followOpts = {
  today: '2026-10-26',
  steps: [moveStep],
  profile: { lifestyle: { sleepDuration: '7-8h' }, mind: { anxietyFrequency: 'often' } },
  areas: ['move', 'stress'],
  state: { answers: [], seen: [] },
  muted: [],
};
const sameDay = selectDueFollowUp({ ...followOpts, today: '2026-10-25' });
if (sameDay) fail('same-day action was followed up');
const nextDay = selectDueFollowUp(followOpts);
console.log('[10b] due', nextDay?.kind, nextDay?.text);
if (nextDay?.kind !== 'action' || !nextDay.text.includes('Try a short easy walk sometime this morning.')) {
  fail('next-day action follow-up missing');
}
if (!nextDay.chips.some((chip) => chip.label === 'Went well')) fail('action chips missing');
const old = selectDueFollowUp({ ...followOpts, today: '2026-11-02' });
if (old) fail('action older than 7 days was still due');
const checkinOnly = selectDueFollowUp({
  ...followOpts,
  steps: [{ date: '2026-10-25', slot: 'morning', actionId: 'checkin-sleep', area: 'sleep', status: 'done' }],
});
if (checkinOnly) fail('check-in step produced a follow-up');
const muted = selectDueFollowUp({ ...followOpts, muted: ['move'] });
if (muted) fail('muted area still produced an action follow-up');
const answered = selectDueFollowUp({
  ...followOpts,
  state: { answers: [{ ref: '2026-10-25|morning|act-move-morning' }], seen: [] },
});
if (answered) fail('answered action was still due');
const noted = noteProfileFactsSeen(
  followOpts.profile,
  '2026-10-25',
  { answers: [], seen: [] },
  ['sleep'],
);
const revisit = selectDueFollowUp({
  today: '2026-10-26',
  steps: [],
  profile: followOpts.profile,
  areas: ['sleep', 'stress'],
  state: noted.state,
  muted: [],
});
console.log('[10b] profile', revisit?.text);
if (revisit?.kind !== 'profile' || !/Anything changed\?$/.test(revisit.text) || /often/.test(revisit.text)) {
  fail(`profile revisit was ${revisit?.text}`);
}
const genericOnly = noteProfileFactsSeen(
  { mind: { anxietyFrequency: 'often' } },
  '2026-10-25',
  { answers: [], seen: [] },
  ['stress'],
);
if (genericOnly.changed) fail('generic echo was stored for a revisit');
if (localDayOffset('2026-10-25', '2026-10-26') !== 1) fail('day offset');
if (!followUpAcknowledgment('went-well').startsWith('Noted.')) fail('ack');
if (followUpAcknowledgment('later').includes('No rush')) console.log('[10b] snooze line ok');

if (process.env.OBRIUM_URL) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const apiHits = [];
  page.on('request', (req) => {
    if (/\/api\//.test(req.url())) apiHits.push(req.url());
  });
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
  });
  await page.goto(process.env.OBRIUM_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    const now = new Date();
    window.setObriumClockOverride?.(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0));
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(300);
  const strict = await page.evaluate(() => ({
    hidden: document.getElementById('todayBlock')?.hidden,
    text: document.getElementById('todayBlockText')?.textContent || '',
    buttons: [...document.querySelectorAll('#todayBlockActions button')].map((b) => b.textContent),
  }));
  console.log('[10a] strict', JSON.stringify(strict));
  if (strict.hidden || strict.text !== 'Log how you slept') fail(`strict check-in missing: ${strict.text}`);
  if (!strict.buttons.includes('Log sleep')) fail('strict check-in button missing');
  await page.screenshot({ path: path.join(outDir, 'task10-today-strict-390.png'), clip: { x: 0, y: 0, width: 390, height: 844 } });

  const before = apiHits.length;
  await page.click('#todayBlockActions .btn');
  await page.waitForTimeout(400);
  const focused = await page.evaluate(() => document.activeElement?.id || '');
  if (focused !== 'checkinSleep') fail(`check-in did not focus sleep (${focused})`);
  await page.fill('#checkinSleep', '7');
  await page.dispatchEvent('#checkinSleep', 'input');
  await page.click('#dayCheckinSave');
  await page.waitForTimeout(400);
  const afterCheckin = await page.evaluate(() => ({
    text: document.getElementById('todayBlockText')?.textContent || '',
    ack: document.getElementById('todayBlockAck')?.textContent || '',
    buttons: [...document.querySelectorAll('#todayBlockActions button')].map((b) => b.textContent),
    stored: JSON.parse(localStorage.getItem('tendai_today_steps_v1') || '[]'),
  }));
  console.log('[10a] after check-in', JSON.stringify(afterCheckin));
  if (afterCheckin.ack !== 'Logged.') fail(`check-in did not complete: ${afterCheckin.ack}`);
  if (afterCheckin.buttons.includes('Done')) fail('check-in offered a Done button');
  if (afterCheckin.stored[0]?.status !== 'done' || afterCheckin.stored[0]?.actionId !== 'checkin-sleep') {
    fail('check-in outcome was not stored');
  }

  await page.evaluate(() => localStorage.removeItem('tendai_today_steps_v1'));
  await page.goto(process.env.OBRIUM_URL + '/?contentPreview=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1600);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    const { dayState } = await import('/js/state.js');
    const today = dayState.loadDayStateForToday();
    today.sleep = { ...(today.sleep || {}), hours: 7 };
    today.energy = 'Good';
    today.stressLevel = 2;
    dayState.saveDayStateForToday(today);
    const now = new Date();
    window.setObriumClockOverride?.(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0));
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(300);
  const preview = await page.evaluate(() => ({
    hidden: document.getElementById('todayBlock')?.hidden,
    text: document.getElementById('todayBlockText')?.textContent || '',
    buttons: [...document.querySelectorAll('#todayBlockActions button')].map((b) => b.textContent),
  }));
  console.log('[10a] preview', JSON.stringify(preview));
  if (preview.hidden || !preview.buttons.includes('Done') || !preview.buttons.includes('Not today')) {
    fail(`preview action missing: ${JSON.stringify(preview)}`);
  }
  if (!/^Try /.test(preview.text)) fail('preview step is not a try phrasing');
  await page.screenshot({ path: path.join(outDir, 'task10-today-preview-390.png'), clip: { x: 0, y: 0, width: 390, height: 844 } });

  const tapsBefore = apiHits.length;
  await page.click('#todayBlockActions .btn.btn-initialize');
  await page.waitForTimeout(200);
  const rated = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.today-block__chip')].map((b) => b.textContent),
    ack: document.getElementById('todayBlockAck')?.textContent || '',
  }));
  if (!rated.chips.includes('1') || !rated.chips.includes('Skip')) fail('rating chips missing');
  await page.click('.today-block__chip');
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai_today_steps_v1') || '[]'));
  if (saved.at(-1)?.status !== 'done' || saved.at(-1)?.rating !== 1) fail(`rating not stored: ${JSON.stringify(saved.at(-1))}`);
  if (apiHits.length !== tapsBefore) fail(`Today taps sent ${apiHits.length - tapsBefore} API requests`);
  if (apiHits.length !== before && apiHits.slice(before).some((url) => /\/api\/talk/.test(url))) {
    fail('Talk request during Today');
  }
  console.log('[10a] api hits', apiHits.length);
  await browser.close();

  const browserB = await chromium.launch({ headless: true });
  const contextB = await browserB.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const pageB = await contextB.newPage();
  const talkHits = [];
  pageB.on('request', (req) => {
    if (/\/api\//.test(req.url())) talkHits.push(req.url());
  });
  await pageB.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reply: 'STUB' }),
  }));
  const completeProfile = {
    body: {
      sexAtBirth: 'male', genderIdentity: 'man', age: 43, height: 180, weight: 82,
      bodyBuild: 'average', bloodType: 'O+', physicalActivity: 'moderate',
      regularDiscomfort: ['none'], goalsFocus: 'maintenance', goalsPriority: 4,
    },
    health: {
      healthConditions: ['none'], prescriptionMedications: 'no', supplements: ['none'],
      smoking: 'never', alcohol: 'rarely', lastCheckup: '6-12months',
      goalsFocus: 'energy', goalsPriority: 3, goalsConstraints: ['short-answers'],
    },
    mind: {
      stressLevel: 2, mentalEnergy: 2, anxietyFrequency: 'rarely', moodChanges: 'stable',
      wantToImproveFocus: 'yes', goalsFocus: 'focus', goalsPriority: 3,
    },
    lifestyle: {
      eatingPattern: 'regular', dietType: 'balanced', enoughProtein: 'yes', sugarSweets: 'moderate',
      lateEating: 'rarely', hydration: 'good', sleepDuration: '7-8h', sleepQuality: 4,
      goalsFocus: 'sleep', goalsPriority: 3,
    },
    goals: { primaryGoals: ['energy'], motivationLevel: 4, wantFromTendAI: ['gentle-guidance'] },
  };
  await pageB.addInitScript((profile) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['move']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(profile));
  }, completeProfile);
  await pageB.goto(process.env.OBRIUM_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pageB.waitForTimeout(1600);
  await pageB.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('tendai_today_steps_v1', JSON.stringify([{
      date: key(yesterday), slot: 'morning', actionId: 'act-move-morning', area: 'move', status: 'done',
    }]));
    localStorage.removeItem('tendai_chat_history');
    window.setObriumClockOverride(today);
  });
  const openTalk = async () => {
    await pageB.evaluate(() => {
      if (typeof window.switchView === 'function') window.switchView('talk');
    });
    await pageB.waitForFunction(() => {
      const nodes = [...document.querySelectorAll('[data-follow-up-ref]')];
      const el = nodes[nodes.length - 1];
      const text = el?.querySelector('.message-text')?.textContent || '';
      const chip = el?.querySelector('[data-followup-choice="went-well"]');
      return text.includes('How did it go?') && chip && !chip.disabled;
    }, { timeout: 15000 });
  };
  await openTalk();
  const followText = await pageB.locator('[data-follow-up-ref] .message-text').last().innerText();
  console.log('[10b] talk', followText);
  if (!followText.includes('Try a short easy walk sometime this morning.')) fail('Talk follow-up text');
  await pageB.waitForTimeout(500);
  await pageB.screenshot({ path: path.join(outDir, 'task10-followup-390.png'), clip: { x: 0, y: 0, width: 390, height: 844 } });

  const logBeforeTyped = await pageB.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').map((row) => row.requestType));
  const hitsBeforeTyped = talkHits.length;
  await pageB.fill('#chatInput', 'I have a headache today');
  await pageB.click('#sendBtn');
  await pageB.waitForFunction(() => {
    const bots = [...document.querySelectorAll('.message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    return last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').includes('STUB');
  }, { timeout: 20000 });
  const afterTyped = await pageB.evaluate(() => ({
    answers: JSON.parse(localStorage.getItem('tendai_followups_v1') || '{"answers":[]}').answers.length,
    log: JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').map((row) => row.requestType),
  }));
  const newLog = afterTyped.log.slice(logBeforeTyped.length);
  const newHits = talkHits.slice(hitsBeforeTyped);
  if (afterTyped.answers !== 0) fail('typed reply was stored as a follow-up');
  if (!newLog.some((type) => String(type).includes('talk-message'))) fail(`typed reply log ${newLog.join(',')}`);
  if (!newHits.some((url) => /\/api\/talk/.test(url))) fail('typed reply did not use the Talk path');

  await pageB.locator('[data-followup-choice="later"]:not([disabled])').last().click();
  await pageB.waitForTimeout(200);
  const snoozed = await pageB.evaluate(() => ({
    text: [...document.querySelectorAll('.message.bot .message-text')].map((el) => el.textContent).join(' | '),
    session: sessionStorage.getItem('tendai_profile_questions_snoozed'),
    answers: JSON.parse(localStorage.getItem('tendai_followups_v1') || '{"answers":[]}').answers,
    followups: document.querySelectorAll('[data-follow-up-ref]').length,
  }));
  if (!snoozed.text.includes("No rush")) fail('snooze acknowledgment missing');
  if (snoozed.session !== '1') fail('snooze flag was not set');
  if (snoozed.answers.length) fail('snooze stored an answer');
  if (snoozed.followups !== 1) fail('snooze asked a second follow-up');

  await pageB.evaluate(() => window.switchView('feed'));
  await openTalk();
  await pageB.locator('[data-followup-choice="mute"]:not([disabled])').last().click();
  await pageB.waitForTimeout(200);
  const mutedUi = await pageB.evaluate(() => ({
    muted: JSON.parse(localStorage.getItem('tendai_followup_muted_areas_v1') || '[]'),
    ack: [...document.querySelectorAll('.message.bot .message-text')].pop()?.textContent || '',
  }));
  if (!mutedUi.muted.includes('move')) fail(`mute was not stored: ${mutedUi.muted}`);
  if (!mutedUi.ack.includes('Movement & Load')) fail(`mute ack: ${mutedUi.ack}`);
  const beforeQuiet = await pageB.locator('[data-follow-up-ref]').count();
  await pageB.evaluate(() => window.switchView('feed'));
  await pageB.evaluate(() => window.switchView('talk'));
  await pageB.waitForTimeout(500);
  const afterQuiet = await pageB.locator('[data-follow-up-ref]').count();
  if (afterQuiet !== beforeQuiet) fail('muted area asked again');

  await pageB.evaluate(() => window.openSettingsModal());
  await pageB.waitForTimeout(300);
  await pageB.click('[data-followup-unmute="move"]');
  await pageB.waitForTimeout(200);
  const unmuted = await pageB.evaluate(() => JSON.parse(localStorage.getItem('tendai_followup_muted_areas_v1') || '[]'));
  if (unmuted.includes('move')) fail('Settings did not turn the area back on');
  await pageB.evaluate(() => {
    document.querySelectorAll('.profile-modal-overlay').forEach((el) => el.classList.remove('is-active'));
    window.switchView('feed');
  });
  await openTalk();

  await pageB.evaluate(async () => {
    const talk = window.__obriumTalkComponent;
    if (talk) talk._proactiveAnswersThisSession = 2;
    const { profileState } = await import('/js/state.js');
    const profile = profileState.get();
    if (!profile.goals) profile.goals = {};
    profile.goals.wantFromTendAI = [];
    profileState.save(profile);
  });
  await pageB.waitForTimeout(400);
  const hitsBeforeChip = talkHits.length;
  const logBeforeChip = await pageB.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').length);
  const followupsBeforeChip = await pageB.locator('[data-follow-up-ref]').count();
  await pageB.locator('[data-followup-choice="went-well"]:not([disabled])').last().click();
  await pageB.waitForFunction(() => {
    const texts = [...document.querySelectorAll('.message.bot .message-text')].map((el) => el.textContent || '');
    return texts.some((text) => text.includes('Noted. Glad you gave it a try.'))
      && document.querySelector('.talk-pace-actions');
  }, { timeout: 15000 });
  const done = await pageB.evaluate(() => ({
    answers: JSON.parse(localStorage.getItem('tendai_followups_v1') || '{"answers":[]}').answers,
    followups: document.querySelectorAll('[data-follow-up-ref]').length,
    log: JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').length,
  }));
  console.log('[10b] saved', JSON.stringify(done.answers));
  if (done.answers.at(-1)?.answer !== 'went-well') fail('chip answer was not saved');
  if (done.followups !== followupsBeforeChip) fail('a second follow-up was asked in the same session');
  if (done.log !== logBeforeChip) fail('follow-up chip wrote a data-sent entry');
  if (talkHits.length !== hitsBeforeChip) fail('follow-up chip called the API');

  const contextQuiet = await browserB.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const pageQ = await contextQuiet.newPage();
  await pageQ.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ reply: 'STUB' }),
  }));
  await pageQ.addInitScript((profile) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['move']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(profile));
  }, completeProfile);
  await pageQ.goto(process.env.OBRIUM_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pageQ.waitForTimeout(1600);
  await pageQ.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    window.switchView('talk');
  });
  await pageQ.waitForTimeout(600);
  const quiet = await pageQ.evaluate(() => document.querySelectorAll('[data-follow-up-ref]').length);
  if (quiet !== 0) fail('Talk asked a follow-up when nothing was due');
  await pageQ.evaluate(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('tendai_today_steps_v1', JSON.stringify([{
      date: key(yesterday), slot: 'morning', actionId: 'act-move-morning', area: 'move', status: 'done',
    }]));
    localStorage.setItem('tendai_settings', JSON.stringify({ autoProfileQuestionsEnabled: false }));
    window.setObriumClockOverride(today);
    window.switchView('feed');
  });
  await pageQ.evaluate(() => window.switchView('talk'));
  await pageQ.waitForTimeout(500);
  const toggledOff = await pageQ.evaluate(() => document.querySelectorAll('[data-follow-up-ref]').length);
  if (toggledOff !== 0) fail('follow-up appeared while automatic questions are off');
  await browserB.close();
}

if (failed) process.exit(1);
console.log('TASK10_OK');
