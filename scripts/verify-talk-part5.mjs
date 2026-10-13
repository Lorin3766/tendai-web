/**
 * Part 5 checkpoint: complete profile → passive welcome; last field auto-stops questions.
 * Usage: SERRON_URL=http://127.0.0.1:50489 node scripts/verify-talk-part5.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = process.env.SERRON_URL || 'http://127.0.0.1:5500';
const VW = 390;
const VH = 844;
fs.mkdirSync(outDir, { recursive: true });

function assertWidth(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  console.log(`DIM ${path.basename(file)} => ${png.width}x${png.height}`);
  if (png.width !== VW) throw new Error(`Expected width ${VW}, got ${png.width}`);
}

function filledBody() {
  return {
    sexAtBirth: 'male',
    genderIdentity: 'man',
    age: 43,
    height: 180,
    weight: 82,
    bodyBuild: 'average',
    bloodType: 'O+',
    physicalActivity: 'moderate',
    regularDiscomfort: ['none'],
    goalsFocus: 'maintenance',
    goalsPriority: 4,
  };
}
function filledHealth() {
  return {
    healthConditions: ['none'],
    prescriptionMedications: 'no',
    supplements: ['none'],
    smoking: 'never',
    alcohol: 'rarely',
    lastCheckup: '6-12months',
    goalsFocus: 'energy',
    goalsPriority: 3,
    goalsConstraints: ['short-answers'],
  };
}
function filledMind() {
  return {
    stressLevel: 2,
    mentalEnergy: 2,
    anxietyFrequency: 'rarely',
    moodChanges: 'stable',
    wantToImproveFocus: 'yes',
    goalsFocus: 'focus',
    goalsPriority: 3,
  };
}
function filledLifestyle() {
  return {
    eatingPattern: 'regular',
    dietType: 'balanced',
    enoughProtein: 'yes',
    sugarSweets: 'moderate',
    lateEating: 'rarely',
    hydration: 'good',
    sleepDuration: '7-8h',
    sleepQuality: 4,
    goalsFocus: 'sleep',
    goalsPriority: 3,
  };
}
function filledGoalsMinusLast() {
  return {
    primaryGoals: ['energy', 'longevity'],
    motivationLevel: 4,
    wantFromTendAI: [],
  };
}
function filledGoals() {
  return {
    primaryGoals: ['energy', 'longevity'],
    motivationLevel: 4,
    wantFromTendAI: ['gentle-guidance'],
  };
}

async function waitBotIdle(page) {
  await page.waitForFunction(() => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    return !typing && last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
  }, { timeout: 45000 });
}

async function boot(page, profile) {
  await page.addInitScript((profileData) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai-profile-state', JSON.stringify(profileData));
  }, profile);
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    document
      .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
      .forEach((el) => el.remove());
    localStorage.removeItem('tendai_chat_history');
  });
}

const browser = await chromium.launch({ headless: true });

// --- A: last remaining field answered in Talk → completion, then Welcome on empty history ---
const contextA = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const pageA = await contextA.newPage();
await boot(pageA, {
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
  lifestyle: filledLifestyle(),
  goals: filledGoalsMinusLast(),
});

const nextOnBoot = await pageA.evaluate(() => window.getNextProfileQuestion
  ? window.getNextProfileQuestion(JSON.parse(localStorage.getItem('tendai-profile-state') || '{}'))
  : null);
console.log('NEXT_ON_ALMOST_COMPLETE', nextOnBoot?.path || nextOnBoot);

await pageA.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await waitBotIdle(pageA);
const lastFieldAsk = await pageA.evaluate(() => {
  const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
  return {
    path: last?.getAttribute('data-profile-prompt-path') || null,
    text: (last?.querySelector('.message-text')?.textContent || '').trim(),
  };
});
console.log('LAST_FIELD_ASK', lastFieldAsk);

const before = await pageA.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await pageA.fill('#chatInput', 'gentle guidance');
await pageA.click('#sendBtn');
await pageA.waitForFunction((prev) => {
  const typing = document.querySelector('.talk-view .typing-indicator');
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
  const last = bots[bots.length - 1];
  return !typing && bots.length > prev && last && !last.classList.contains('message-typing');
}, before, { timeout: 20000 });

const afterLast = await pageA.evaluate(() => {
  const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
  const next = window.getNextProfileQuestion
    ? window.getNextProfileQuestion(JSON.parse(localStorage.getItem('tendai-profile-state') || '{}'))
    : 'no-fn';
  return {
    path: last?.getAttribute('data-profile-prompt-path') || null,
    text: (last?.querySelector('.message-text')?.textContent || '').trim(),
    next,
    want: JSON.parse(localStorage.getItem('tendai-profile-state') || '{}')?.goals?.wantFromTendAI,
  };
});
console.log('AFTER_LAST_FIELD', afterLast);
const lastFile = path.join(outDir, 'talk-part5-last-field-done-390.png');
await pageA.screenshot({ path: lastFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(lastFile);

await pageA.evaluate(() => {
  const talk = window.__obriumTalkComponent;
  talk.conversationArea.innerHTML = '';
  talk.saveChatHistory();
  talk.loadChatHistory();
});
await pageA.waitForTimeout(400);
const welcomeAfterClear = await pageA.evaluate(() => {
  const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
  return {
    path: last?.getAttribute('data-profile-prompt-path') || null,
    text: (last?.querySelector('.message-text')?.textContent || '').trim(),
    header: last?.querySelector('.message-system-header')?.textContent || '',
    count: document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)').length,
  };
});
console.log('WELCOME_AFTER_CLEAR', welcomeAfterClear);
const welcomeFile = path.join(outDir, 'talk-part5-welcome-after-complete-390.png');
await pageA.screenshot({ path: welcomeFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(welcomeFile);

await pageA.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('feed');
});
await pageA.waitForTimeout(300);
await pageA.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await pageA.waitForTimeout(1200);
const reopen = await pageA.evaluate(() => {
  const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
  return {
    path: last?.getAttribute('data-profile-prompt-path') || null,
    text: (last?.querySelector('.message-text')?.textContent || '').trim(),
    count: document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)').length,
    tendai: /TendAI/i.test(document.querySelector('.talk-view')?.innerText || ''),
  };
});
console.log('REOPEN_COMPLETE', reopen);
await contextA.close();

// --- B: fully complete from first open → passive welcome, no question ---
const contextB = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const pageB = await contextB.newPage();
await boot(pageB, {
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
  lifestyle: filledLifestyle(),
  goals: filledGoals(),
});
await pageB.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await pageB.waitForTimeout(1500);
const freshComplete = await pageB.evaluate(() => {
  const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
  const next = window.getNextProfileQuestion
    ? window.getNextProfileQuestion(JSON.parse(localStorage.getItem('tendai-profile-state') || '{}'))
    : 'no-fn';
  return {
    path: last?.getAttribute('data-profile-prompt-path') || null,
    text: (last?.querySelector('.message-text')?.textContent || '').trim(),
    header: last?.querySelector('.message-system-header')?.textContent || '',
    next,
    tendai: /TendAI/i.test(document.querySelector('.talk-view')?.innerText || ''),
  };
});
console.log('FRESH_COMPLETE', freshComplete);
const freshFile = path.join(outDir, 'talk-part5-fresh-complete-passive-390.png');
await pageB.screenshot({ path: freshFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(freshFile);

await pageB.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('profile');
});
await pageB.waitForTimeout(500);
const hit = pageB.locator('#mobileProfileCard .profile-card-expand-hit');
if (await hit.count()) {
  await hit.first().click();
  await pageB.waitForTimeout(400);
}
const statuses = await pageB.evaluate(() => {
  const grab = (k) => document.querySelector(`#mobileProfileMenu [data-profile-status="${k}"]`)?.textContent || '';
  return {
    body: grab('body'),
    health: grab('health'),
    mind: grab('mind'),
    lifestyle: grab('lifestyle'),
    goals: grab('goals'),
    integrity: (document.getElementById('profileCompletenessMobile')?.textContent || '').trim(),
  };
});
console.log('COMPLETE_SIDEBAR', statuses);
const sideFile = path.join(outDir, 'talk-part5-all-sections-complete-390.png');
await pageB.screenshot({ path: sideFile, clip: { x: 0, y: 0, width: VW, height: VH } });
assertWidth(sideFile);

await browser.close();

const ok =
  lastFieldAsk.path === 'goals.wantFromTendAI' &&
  !afterLast.path &&
  /everything I needed|ask me anything/i.test(afterLast.text) &&
  afterLast.next == null &&
  Array.isArray(afterLast.want) && afterLast.want.includes('gentle-guidance') &&
  /Welcome/i.test(welcomeAfterClear.header) &&
  /Obrium v1\.0/i.test(welcomeAfterClear.text) &&
  !welcomeAfterClear.path &&
  !reopen.path && reopen.count === welcomeAfterClear.count && !reopen.tendai &&
  !freshComplete.path && freshComplete.next == null && /Welcome/i.test(freshComplete.header) && !freshComplete.tendai &&
  statuses.body === 'Complete' &&
  statuses.health === 'Complete' &&
  statuses.mind === 'Complete' &&
  statuses.lifestyle === 'Complete' &&
  statuses.goals === 'Complete';

if (!ok) {
  console.error('PART5_CHECKPOINT_FAILED');
  process.exit(2);
}
console.log('PART5_CHECKPOINT_OK');
