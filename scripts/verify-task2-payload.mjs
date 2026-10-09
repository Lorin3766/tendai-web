/**
 * Task 2 checkpoint: real profile data reaches the Talk LLM payload.
 *  1. Proactive answers (sex at birth via Talk, health conditions, Mind) appear in POST /api/talk.
 *  2. Removing a value (Health modal untick, cleared allergy/medication) drops it from the payload.
 *  3. userProfile.goals = Goals & Intent; diet and habits sent separately.
 * Also: boot catch-up sync for older profiles, Focus Area fabricated-fact scrub.
 * Usage: SERRON_URL=http://127.0.0.1:50490 node scripts/verify-task2-payload.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = process.env.SERRON_URL || 'http://127.0.0.1:5500';
const VW = 390;
const VH = 844;
fs.mkdirSync(outDir, { recursive: true });

const SEED_PROFILE = {
  health: {
    healthConditions: ['heart', 'blood-pressure'],
    supplements: ['magnesium', 'omega3'],
    smoking: 'former',
    alcohol: '1-2x-week',
    hasAllergies: true,
    allergiesDetails: 'peanuts',
    medications: 'metoprolol 25mg',
  },
  mind: { stressLevel: 4, mentalEnergy: 2, anxietyFrequency: 'sometimes', moodChanges: 'stable', wantToImproveFocus: 'yes' },
  lifestyle: { dietType: 'high-protein', eatingPattern: 'regular', sleepDuration: '6-7h', sleepQuality: 3 },
  goals: { primaryGoals: ['heart-health', 'better-sleep'], motivationLevel: 4, wantFromTendAI: ['understand-body'] },
};

const SEED_RECORD = {
  Clinical: { allergies: ['shellfish'], medications: [], diagnoses: [], surgeries: [] },
  Lifestyle: { dietRules: ['high-protein', 'no sugar after 6pm'], habits: ['cold shower daily'], restrictions: [] },
};

const LEGACY_INSTRUCTION = [
  'USER PROFILE (inject into every reasoning turn; do not contradict without explicit user override):',
  '- Name: Anton',
  '- Weight: 83 kg (baseline on file — update Profile for live sync).',
  '- Cardiac history (on file for agent safety): 1996 subaortic stenosis — prioritize conservative exertion guidance unless Profile is updated.',
  '',
  'Track sleep consistency.',
].join('\n');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const talkBodies = [];
await page.route('**/api/**', async (route) => {
  const url = route.request().url();
  if (/\/api\/talk/.test(url) && route.request().method() === 'POST') {
    try {
      talkBodies.push(JSON.parse(route.request().postData() || '{}'));
    } catch (_) {}
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Noted.' }) });
  }
  if (/\/api\/health/.test(url)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await page.addInitScript(
  ({ profile, record, instruction }) => {
    if (sessionStorage.getItem('__seeded') === '1') return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai-profile-state', JSON.stringify(profile));
    localStorage.setItem('TendAI_MasterRecord', JSON.stringify(record));
    localStorage.setItem(
      'tendai_user_agents',
      JSON.stringify([{ id: 'legacy-agent-1', name: 'Sleep', instruction, active: true, createdAt: new Date().toISOString() }]),
    );
  },
  { profile: SEED_PROFILE, record: SEED_RECORD, instruction: LEGACY_INSTRUCTION },
);

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

async function sendTalk(text) {
  const before = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
  await page.fill('#chatInput', text);
  await page.waitForTimeout(150);
  await page.click('#sendBtn');
  await page.waitForFunction(
    (prev) => {
      const typing = document.querySelector('.talk-view .typing-indicator');
      const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
      const last = bots[bots.length - 1];
      const ready = last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
      return !typing && bots.length > prev && ready;
    },
    before,
    { timeout: 45000 },
  );
  await page.waitForTimeout(250);
}

async function freeformPayload(text) {
  const start = talkBodies.length;
  await sendTalk(text);
  const hit = talkBodies.slice(start).find((b) => b.message === text);
  if (!hit) throw new Error(`No /api/talk POST captured for "${text}"`);
  return hit;
}

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
  localStorage.removeItem('tendai_chat_history');
});

// Boot catch-up + Focus Area scrub
const boot = await page.evaluate(() => ({
  record: JSON.parse(localStorage.getItem('TendAI_MasterRecord') || '{}'),
  agents: JSON.parse(localStorage.getItem('tendai_user_agents') || '[]'),
  scrubFlag: localStorage.getItem('tendai_focus_profile_scrub_v1'),
}));
const instr = boot.agents[0]?.instruction || '';
console.log('SCRUBBED INSTRUCTION:\n' + instr);
if (/Anton|83 kg|subaortic|1996/.test(instr)) fail('Focus Area instruction still contains fabricated facts');
if (!/Track sleep consistency\./.test(instr)) fail('scrub damaged the user-written part of the instruction');
if (boot.scrubFlag !== '1') fail('scrub once-flag not set');
const r0 = boot.record;
console.log('BOOT RECORD:', JSON.stringify({ Clinical: r0.Clinical, Mind: r0.Mind, Goals: r0.Goals, Lifestyle: r0.Lifestyle }, null, 1));
if (JSON.stringify(r0.Clinical?.healthConditions) !== JSON.stringify(['heart', 'blood-pressure'])) fail('boot catch-up: healthConditions missing');
if (r0.Mind?.stressLevel !== 4) fail('boot catch-up: Mind.stressLevel missing');
if (JSON.stringify(r0.Clinical?.allergies) !== JSON.stringify(['shellfish', 'peanuts'])) fail('boot catch-up: allergies not merged with Talk-logged item');
if ((r0.Lifestyle?.dietRules || []).includes('high-protein')) fail('diet type still duplicated in dietRules');

// 1. Proactive answers via Talk
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForFunction(() => {
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const last = bots[bots.length - 1];
  return last && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
}, { timeout: 45000 });
await page.waitForTimeout(500);

await sendTalk('Male');
await sendTalk('Man');
await sendTalk('43');
const paceStop = page.locator('.talk-pace-later').last();
if (await paceStop.count()) {
  await paceStop.click();
  await page.waitForTimeout(800);
} else {
  fail('3-answer pause (continue/stop) did not appear');
}

const p1 = await freeformPayload('How should I plan my week?');
console.log('PAYLOAD 1 userProfile:', JSON.stringify(p1.userProfile));
console.log('PAYLOAD 1 profileContext:\n' + p1.profileContext);
const ctx1 = p1.profileContext || '';
if (!/Sex at birth: male/i.test(ctx1)) fail('sex at birth (Talk answer) not in payload');
if (!/Gender identity: man/i.test(ctx1)) fail('gender identity not in payload');
if (p1.userProfile?.age !== 43) fail('age (Talk answer) not in userProfile');
if (!/Health conditions: .*heart.*blood pressure/i.test(ctx1)) fail('health conditions not in payload');
if (!/Supplements: .*magnesium/i.test(ctx1)) fail('supplements not in payload');
if (!/Stress level: 4/i.test(ctx1)) fail('Mind stress level not in payload');
if (!/Mental energy: 2/i.test(ctx1)) fail('Mind mental energy not in payload');
if (!/Anxiety: sometimes|Anxiety frequency: sometimes/i.test(ctx1)) fail('Mind anxiety not in payload');
if (!/Allergies: .*peanuts/i.test(ctx1)) fail('profile allergy not in payload');
if (!/metoprolol/i.test(ctx1)) fail('profile medication not in payload');

// 3. Goals vs diet vs habits
const up = p1.userProfile || {};
const goalsText = JSON.stringify(up.goals || []);
if (!/heart health/i.test(goalsText) || !/better sleep/i.test(goalsText)) fail('userProfile.goals missing Goals & Intent answers');
if (/protein|sugar|shower|smok|regular/i.test(goalsText)) fail('userProfile.goals still contains diet/habits');
if (!/high protein/i.test(JSON.stringify(up.diet || []))) fail('diet type not in userProfile.diet');
if (!/no sugar after 6pm/i.test(JSON.stringify(up.diet || []))) fail('diet rule not in userProfile.diet');
if (!/former/i.test(JSON.stringify(up.habits || [])) || !/cold shower/i.test(JSON.stringify(up.habits || []))) fail('habits not in userProfile.habits');
if (!/understand body/i.test(JSON.stringify(up.wantFromObrium || []))) fail('wantFromObrium missing');
if (up.motivationLevel !== 4) fail('motivationLevel missing');

// 2a. Untick health conditions + supplements in the Health modal
await page.evaluate(() => window.openProfileModal && window.openProfileModal('health'));
await page.waitForSelector('input[name="healthConditions"]', { state: 'attached', timeout: 10000 });
const modalBefore = await page.evaluate(() => ({
  conditions: [...document.querySelectorAll('input[name="healthConditions"]:checked')].map((i) => i.value),
  supplements: [...document.querySelectorAll('input[name="healthSupplements"]:checked')].map((i) => i.value),
}));
console.log('MODAL BEFORE:', JSON.stringify(modalBefore));
await page.evaluate(() => {
  for (const input of document.querySelectorAll('input[name="healthConditions"], input[name="healthSupplements"]')) {
    if (input.checked) {
      input.checked = false;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});
await page.screenshot({ path: path.join(outDir, 'task2-health-modal-cleared-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });
await page.evaluate(() => document.querySelector('.profile-modal-save')?.click());
await page.waitForTimeout(800);

// 2b. Clear allergy + medication (no modal UI for these; same profileState.save path the modal uses)
await page.evaluate(async () => {
  const { profileState } = await import('/js/state.js');
  const p = JSON.parse(JSON.stringify(profileState.get()));
  p.health.hasAllergies = false;
  p.health.allergiesDetails = '';
  p.health.medications = '';
  profileState.save(p);
});
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForTimeout(500);

const p2 = await freeformPayload('Anything to watch this week?');
console.log('PAYLOAD 2 profileContext:\n' + p2.profileContext);
const ctx2 = p2.profileContext || '';
const rec2 = await page.evaluate(() => JSON.parse(localStorage.getItem('TendAI_MasterRecord') || '{}'));
console.log('RECORD AFTER CLEAR Clinical:', JSON.stringify(rec2.Clinical));
if (/Health conditions:/i.test(ctx2)) fail('health conditions still in payload after untick');
if (/Supplements:/i.test(ctx2)) fail('supplements still in payload after untick');
if (/peanuts/i.test(ctx2)) fail('cleared allergy still in payload');
if (/metoprolol/i.test(ctx2)) fail('cleared medication still in payload');
if (!/shellfish/i.test(ctx2)) fail('Talk-logged allergy was wrongly removed');
if (rec2.Clinical?.healthConditions != null) fail('Clinical.healthConditions key not cleared');
if (!/Sex at birth: male/i.test(ctx2)) fail('unrelated fields lost after clearing');

await page.screenshot({ path: path.join(outDir, 'task2-talk-after-clear-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });
await browser.close();
if (failed) process.exit(1);
console.log('TASK2_CHECKPOINT_OK');
