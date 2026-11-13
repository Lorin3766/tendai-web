/**
 * Checkpoint for fresh lean onboarding → Talk (390px):
 *  1. No "Welcome back / missed days" banner on a freshly onboarded profile;
 *     correct singular/plural when a real gap exists; Delete all data leaves no gap-tracking state.
 *  2. After lean 3-step onboarding (Welcome → AI consent → Focus Areas), Talk asks the
 *     same field the sidebar "Next step" names (getNextProfileQuestion).
 *  3. Profile saves move both Talk resolver and sidebar to the next field.
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/verify-onboarding-sync-fixes.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const VW = 390;
const VH = 844;
const EXPECTED_AGE = new Date().getFullYear() - 1983;

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};
const dateKey = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const browser = await chromium.launch({ headless: true });

async function newPage(seed) {
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.addInitScript((s) => {
    if (window.name === '__seededSync') return;
    window.name = '__seededSync';
    localStorage.clear();
    for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v);
  }, seed);
  page.on('dialog', (d) => d.accept());
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  return page;
}

/** Lean 3-step: Welcome → AI consent → Focus Areas (no health/birth-year/blood/allergies steps). */
async function completeLeanOnboarding(page) {
  await page.waitForSelector('.system-onboarding-overlay [data-os-next], [data-os-next]', {
    timeout: 20000,
    state: 'visible',
  });
  await page.click('[data-os-next]');
  await page.waitForTimeout(300);
  const ack = page.locator('[data-os-ack-ai]');
  if (await ack.count()) {
    await ack.click();
    await page.waitForTimeout(300);
  }
  await page.waitForSelector('[data-os-focus-area]', { timeout: 10000, state: 'visible' });
  await page.locator('[data-os-focus-area]').nth(0).click();
  await page.waitForTimeout(100);
  await page.locator('[data-os-focus-area]').nth(1).click();
  await page.waitForTimeout(100);
  await page.click('[data-os-finish]');
  await page.waitForTimeout(3000);
}

const nextStep = (page) =>
  page.evaluate(() => ({
    mobile: document.getElementById('nextStepMobile')?.textContent?.trim() || '',
    desktop: document.getElementById('nextStepDesktop')?.textContent?.trim() || '',
  }));
const driftPrompt = (page) =>
  page.evaluate(
    () => document.querySelector('[data-drift-prompt]')?.innerText?.replace(/\s+/g, ' ').trim() || null,
  );
const talkQuestionPath = (page) =>
  page.evaluate(async () => {
    const { getNextProfileQuestion } = await import('/js/features/profile/profile-schema.js');
    const { profileState } = await import('/js/state.js');
    return getNextProfileQuestion(profileState.get())?.path || null;
  });
const lastBotText = (page) =>
  page.evaluate(() => {
    const bots = [
      ...document.querySelectorAll('.talk-view .message.bot .message-text, #chatLog .message.bot .message-text'),
    ];
    return bots.length ? bots[bots.length - 1].innerText.replace(/\s+/g, ' ').trim() : '';
  });

// 1 + 2 + 3: fresh lean onboarding (stale last-sync must not invent a gap)
{
  const page = await newPage({ tendai_last_sync_date: dateKey(3) });
  await completeLeanOnboarding(page);

  const sync = await page.evaluate(() => ({
    ...window.__obriumHistorySync,
    last: localStorage.getItem('tendai_last_sync_date'),
    on: localStorage.getItem('tendai_onboarding_completed_on'),
  }));
  const prompt = await driftPrompt(page);
  const step = await nextStep(page);
  const qPath = await talkQuestionPath(page);
  const talkText = await lastBotText(page);
  console.log('[fresh] after onboarding: history sync', JSON.stringify(sync));
  console.log('[fresh] drift banner:', prompt || 'none');
  console.log(
    '[fresh] Talk asks:',
    JSON.stringify(talkText.slice(0, 140)),
    '| resolver path:',
    qPath,
    '| sidebar:',
    JSON.stringify(step.mobile),
  );
  if (prompt) fail('missed-days banner shown on a freshly onboarded profile');
  if (sync.gapDays) fail(`gapDays ${sync.gapDays} on a fresh profile`);
  if (qPath !== 'lifestyle.sleepDuration') fail(`resolver expected lifestyle.sleepDuration, got ${qPath}`);
  if (step.mobile !== 'Add your sleep duration' || step.desktop !== 'Add your sleep duration') {
    fail(`sidebar not aligned with Talk: ${JSON.stringify(step)}`);
  }
  if (!/how many hours do you usually sleep/i.test(talkText)) {
    fail('Talk is not asking the sleep-duration question');
  }
  await page.screenshot({
    path: path.join(outDir, 'sync-fix-fresh-talk-390.png'),
    clip: { x: 0, y: 0, width: VW, height: VH },
  });

  // A profile save (as Talk does after an answer) moves both to the next field.
  await page.evaluate(async () => {
    const { profileState } = await import('/js/state.js');
    const p = profileState.get();
    p.lifestyle = { ...(p.lifestyle || {}), sleepDuration: '7-8h' };
    profileState.save(p);
  });
  await page.waitForTimeout(300);
  const step2 = await nextStep(page);
  const qPath2 = await talkQuestionPath(page);
  console.log('[fresh] after one sleep signal: resolver', qPath2, '| sidebar', JSON.stringify(step2.mobile));
  // Two Focus Areas (sleep + move): after sleepDuration, next askable signal is physical activity.
  if (qPath2 !== 'body.physicalActivity' || step2.mobile !== 'Add your physical activity') {
    fail(`sidebar not aligned after sleep signal: path=${qPath2} step=${step2.mobile}`);
  }

  await page.evaluate(() => {
    window.setProfileQuestionsSnoozed?.(true);
  });
  await page.waitForTimeout(200);
  const snoozed = await page.evaluate(() => ({
    snoozed: window.areProfileQuestionsSnoozed?.() === true,
    step: document.getElementById('nextStepMobile')?.textContent?.trim() || '',
    resolver: window.getNextStep?.()?.action || null,
  }));
  console.log('[fresh] after Another-time snooze:', JSON.stringify(snoozed));
  if (!snoozed.snoozed) fail('snooze flag not set');
  if (snoozed.step === 'Add your gender identity' || snoozed.resolver?.startsWith('profile_')) {
    fail('sidebar still stuck on a profile question while snoozed');
  }
  const allowed = ['settings_location', 'feed_checkin', 'feed_action', 'calendar_event', null];
  if (!allowed.includes(snoozed.resolver)) fail(`unexpected snoozed next-step action: ${snoozed.resolver}`);

  await page.evaluate(() => window.setProfileQuestionsSnoozed?.(false));
  await page.waitForTimeout(200);
  const unsnoozed = await nextStep(page);
  console.log('[fresh] after clearing snooze:', JSON.stringify(unsnoozed.mobile));
  if (unsnoozed.mobile !== 'Add your physical activity') {
    fail(`sidebar did not return to the profile question after snooze cleared: ${unsnoozed.mobile}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.switchView?.('talk'));
  await page.waitForTimeout(1500);
  const prompt2 = await driftPrompt(page);
  console.log('[fresh] same-day relaunch drift banner:', prompt2 || 'none');
  if (prompt2) fail('missed-days banner after same-day relaunch');
  await page.context().close();
}

// 1b: real gaps on an established profile — grammar
for (const [missing, expected] of [
  [
    1,
    'Nothing was logged for the last 1 day, so that day is empty in your history. Want to tell me roughly how it went, or start fresh from today?',
  ],
  [
    3,
    'Nothing was logged for the last 3 days, so those days are empty in your history. Want to tell me roughly how they went, or start fresh from today?',
  ],
]) {
  const page = await newPage({
    tendai_system_onboarding_v1: '1',
    tendai_welcome_accepted: '1',
    tendai_ai_consent_v1: new Date().toISOString(),
    tendai_quick_setup_v1: JSON.stringify({ completed: true, skipped: true }),
    tendai_onboarding_completed_on: dateKey(20),
    tendai_last_sync_date: dateKey(missing + 1),
    'tendai-profile-state': JSON.stringify({ body: { birthYear: 1983, age: EXPECTED_AGE } }),
  });
  await page.evaluate(() => window.switchView?.('talk'));
  await page.waitForTimeout(1500);
  const prompt = await driftPrompt(page);
  console.log(`[established, ${missing} missed] banner:`, prompt || 'none');
  if (!prompt || !prompt.includes(expected)) fail(`banner wording for ${missing} missed day(s)`);
  if (missing === 1) {
    await page.screenshot({
      path: path.join(outDir, 'sync-fix-gap-1-day-390.png'),
      clip: { x: 0, y: 0, width: VW, height: VH },
    });
  }
  await page.context().close();
}

// 1c: Delete all data leaves no gap-tracking state
{
  const page = await newPage({
    tendai_system_onboarding_v1: '1',
    tendai_welcome_accepted: '1',
    tendai_quick_setup_v1: JSON.stringify({ completed: true, skipped: true }),
    tendai_onboarding_completed_on: dateKey(20),
    tendai_last_sync_date: dateKey(2),
  });
  await page.evaluate(async () => {
    const { saveMetrics } = await import('/js/core/biometrics-db.js');
    await saveMetrics({
      date: new Date().toISOString().slice(0, 10),
      metrics: { steps: 1000, sleep: 7 },
    });
  });
  await page.evaluate(() => window.openSettingsModal?.());
  await page.waitForTimeout(500);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
    page.evaluate(() => document.getElementById('settingsDeleteData')?.click()),
  ]);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(async () => ({
    keys: Object.keys(localStorage).filter((k) =>
      /sync_date|onboarding_completed_on|history_gap|sync_placeholders/.test(k),
    ),
    sessionGapKeys: Object.keys(sessionStorage).filter((k) => /history_gap/.test(k)),
    gap: window.__obriumHistorySync,
    dbs: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : 'n/a',
    metrics: await import('/js/core/biometrics-db.js')
      .then((m) => m.getMetricsByDate(new Date().toISOString().slice(0, 10)))
      .catch(() => null),
    onboardingShown: !!document.querySelector('.system-onboarding-overlay'),
  }));
  console.log('[delete] after reload:', JSON.stringify(after));
  if (after.keys.length || after.sessionGapKeys.length) fail('gap-tracking keys survived Delete all data');
  if (after.gap?.gapDays) fail('gap detected right after Delete all data');
  if (after.metrics) fail('IndexedDB metrics survived Delete all data');
  if (!after.onboardingShown) fail('fresh onboarding not shown after Delete all data');
  await page.context().close();
}

await browser.close();
if (failed) process.exit(1);
console.log('ONBOARDING_SYNC_FIXES_OK');
