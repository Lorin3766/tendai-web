/**
 * Combined Parts 2–5 flow at 390px. Fresh profile.
 * Usage: SERRON_URL=http://127.0.0.1:50489 node scripts/verify-talk-final-flow.mjs
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

const produced = [];

function assertWidth(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  console.log(`DIM ${path.basename(file)} => ${png.width}x${png.height}`);
  if (png.width !== VW) throw new Error(`Expected width ${VW}, got ${png.width}`);
}

const CANNED = {
  'body.bloodType': 'O+',
  'body.physicalActivity': 'moderate',
  'body.regularDiscomfort': ['none'],
  'body.goalsFocus': 'maintenance',
  'body.goalsPriority': 4,
  'health.healthConditions': ['none'],
  'health.prescriptionMedications': 'no',
  'health.supplements': ['none'],
  'health.smoking': 'never',
  'health.alcohol': 'rarely',
  'health.lastCheckup': '6-12months',
  'health.goalsFocus': 'energy',
  'health.goalsPriority': 3,
  'health.goalsConstraints': ['short-answers'],
  'mind.stressLevel': 2,
  'mind.mentalEnergy': 2,
  'mind.anxietyFrequency': 'rarely',
  'mind.moodChanges': 'stable',
  'mind.wantToImproveFocus': 'yes',
  'mind.goalsFocus': 'focus',
  'mind.goalsPriority': 3,
  'lifestyle.eatingPattern': 'regular',
  'lifestyle.dietType': 'balanced',
  'lifestyle.enoughProtein': 'yes',
  'lifestyle.sugarSweets': 'moderate',
  'lifestyle.lateEating': 'rarely',
  'lifestyle.hydration': 'good',
  'lifestyle.sleepDuration': '7-8h',
  'lifestyle.sleepQuality': 4,
  'lifestyle.goalsFocus': 'sleep',
  'lifestyle.goalsPriority': 3,
  'goals.primaryGoals': ['energy', 'longevity'],
  'goals.motivationLevel': 4,
  'goals.wantFromTendAI': ['gentle-guidance'],
};

async function waitBotIdle(page) {
  await page.waitForFunction(() => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    return !typing && last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
  }, { timeout: 45000 });
}

async function sendTalk(page, text) {
  const before = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
  await page.fill('#chatInput', text);
  await page.waitForTimeout(120);
  await page.click('#sendBtn');
  await page.waitForFunction((prev) => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    const ready = last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
    return !typing && bots.length > prev && ready;
  }, before, { timeout: 45000 });
  await page.waitForTimeout(150);
}

async function lastBot(page) {
  return page.evaluate(() => {
    const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
    const bodyStatus = document.querySelector('#mobileProfileMenu [data-profile-status="body"]')?.textContent || '';
    const integrity = (document.getElementById('profileCompletenessMobile')?.textContent || '').trim();
    const tendai = /TendAI/i.test(document.querySelector('.talk-view')?.innerText || '');
    return {
      path: last?.getAttribute('data-profile-prompt-path') || null,
      pace: last?.getAttribute('data-talk-pace-prompt') === '1',
      text: (last?.querySelector('.message-text')?.textContent || '').trim(),
      hasContinue: Boolean(last?.querySelector('.talk-pace-continue')),
      hasLater: Boolean(last?.querySelector('.talk-pace-later')),
      bodyStatus,
      integrity,
      tendai,
      profile: JSON.parse(localStorage.getItem('tendai-profile-state') || '{}'),
    };
  });
}

async function waitNewBot(page, prevCount, extraCheck) {
  await page.waitForFunction((args) => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    const ready = last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
    if (typing || bots.length <= args.prev || !ready) return false;
    if (args.needPath && !last.getAttribute('data-profile-prompt-path')) return false;
    return true;
  }, { prev: prevCount, needPath: Boolean(extraCheck) }, { timeout: 20000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
});

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
  localStorage.removeItem('tendai_chat_history');
});

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await waitBotIdle(page);

const shot = async (name) => {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: VW, height: VH } });
  assertWidth(file);
  produced.push(name);
  return file;
};

const open = await lastBot(page);
console.log('OPEN', { path: open.path, tendai: open.tendai, text: open.text.slice(0, 120) });
await shot('talk-final-1-open-390.png');

await sendTalk(page, 'Male');
const q1 = await lastBot(page);
console.log('AFTER_Q1', { path: q1.path, sex: q1.profile?.body?.sexAtBirth, bodyStatus: q1.bodyStatus, integrity: q1.integrity });
await shot('talk-final-2-after-q1-390.png');

await sendTalk(page, 'Man');
const q2 = await lastBot(page);
console.log('AFTER_Q2', { path: q2.path, gender: q2.profile?.body?.genderIdentity, bodyStatus: q2.bodyStatus, integrity: q2.integrity });
await shot('talk-final-3-after-q2-390.png');

await sendTalk(page, '43');
await page.waitForSelector('.talk-pace-continue', { timeout: 10000 });
const pause1 = await lastBot(page);
console.log('PAUSE1', { pace: pause1.pace, hasContinue: pause1.hasContinue, hasLater: pause1.hasLater, age: pause1.profile?.body?.age, bodyStatus: pause1.bodyStatus, integrity: pause1.integrity });
await shot('talk-final-4-pause-1-390.png');

const beforeContinue = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await page.locator('.talk-pace-continue').last().click();
await waitNewBot(page, beforeContinue, true);
const afterContinue = await lastBot(page);
console.log('CONTINUE', { path: afterContinue.path, text: afterContinue.text });
await shot('talk-final-5-after-continue-390.png');

await sendTalk(page, '180');
await sendTalk(page, '82');
await sendTalk(page, 'average');
await page.waitForSelector('.talk-pace-continue', { timeout: 10000 });
const pause2 = await lastBot(page);
console.log('PAUSE2', { pace: pause2.pace, height: pause2.profile?.body?.height, weight: pause2.profile?.body?.weight, build: pause2.profile?.body?.bodyBuild });
await shot('talk-final-6-pause-2-390.png');

const beforeStop = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await page.locator('.talk-pace-later').last().click();
await waitNewBot(page, beforeStop, false);
const afterStop = await lastBot(page);
console.log('STOP', { path: afterStop.path, text: afterStop.text });
await shot('talk-final-7-after-stop-390.png');

const beforeFree = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
await page.fill('#chatInput', 'hello');
await page.click('#sendBtn');
await waitNewBot(page, beforeFree, false);
const freeform = await lastBot(page);
console.log('FREEFORM', { path: freeform.path, pace: freeform.pace, text: freeform.text.slice(0, 140) });
await shot('talk-final-8-freeform-390.png');

const fillResult = await page.evaluate(async (canned) => {
  const { getNextProfileQuestion } = await import('/js/features/profile/profile-schema.js');
  const { applyProfileTalkAnswer } = await import('/js/features/talk/profile-answer-parser.js');
  const filled = [];
  for (let i = 0; i < 80; i++) {
    const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
    const next = getNextProfileQuestion(profile);
    if (!next) break;
    const value = canned[next.path];
    if (value === undefined) return { error: `no canned value for ${next.path}`, filled };
    applyProfileTalkAnswer(next.sectionKey, next.fieldKey, value);
    filled.push(next.path);
  }
  if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
  if (typeof window.updateProfileCompletenessDisplay === 'function') window.updateProfileCompletenessDisplay();
  const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
  return {
    filled,
    next: getNextProfileQuestion(profile),
    statuses: {
      body: document.querySelector('#mobileProfileMenu [data-profile-status="body"]')?.textContent || '',
      health: document.querySelector('#mobileProfileMenu [data-profile-status="health"]')?.textContent || '',
      mind: document.querySelector('#mobileProfileMenu [data-profile-status="mind"]')?.textContent || '',
      lifestyle: document.querySelector('#mobileProfileMenu [data-profile-status="lifestyle"]')?.textContent || '',
      goals: document.querySelector('#mobileProfileMenu [data-profile-status="goals"]')?.textContent || '',
    },
  };
}, CANNED);
console.log('FILL_REMAINING', fillResult);

await page.evaluate(() => {
  const talk = window.__obriumTalkComponent;
  talk.conversationArea.innerHTML = '';
  talk.saveChatHistory();
  talk.loadChatHistory();
});
await page.waitForTimeout(400);

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('profile');
});
await page.waitForTimeout(500);
const hit = page.locator('#mobileProfileCard .profile-card-expand-hit');
if (await hit.count()) {
  await hit.first().click();
  await page.waitForTimeout(400);
}
const sidebar = await page.evaluate(() => {
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
console.log('SIDEBAR_COMPLETE', sidebar);
await shot('talk-final-9-profile-complete-390.png');

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForTimeout(1200);
const passive = await lastBot(page);
const botCount = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
const header = await page.locator('.talk-view .message-system-header').first().textContent().catch(() => '');
console.log('PASSIVE_REOPEN', { path: passive.path, header, count: botCount, tendai: passive.tendai, text: passive.text.slice(0, 120) });
await shot('talk-final-10-passive-reopen-390.png');

const inputBorder = await page.evaluate(() => {
  const pill = document.querySelector('.talk-view .talk-input-pill');
  return pill ? getComputedStyle(pill).border : null;
});
console.log('INPUT_BORDER', inputBorder);

await browser.close();

const ok =
  open.path === 'body.sexAtBirth' && /Serron, your personal companion/i.test(open.text) && !open.tendai &&
  q1.path === 'body.genderIdentity' && q1.profile?.body?.sexAtBirth === 'male' && /in progress/i.test(q1.bodyStatus) &&
  q2.path === 'body.age' && q2.profile?.body?.genderIdentity === 'man' &&
  pause1.pace && pause1.hasContinue && pause1.hasLater && pause1.profile?.body?.age === 43 &&
  afterContinue.path === 'body.height' &&
  pause2.pace &&
  !afterStop.path && /no rush|next time|ask me anything/i.test(afterStop.text) &&
  !freeform.path && !freeform.pace &&
  fillResult.next == null && !fillResult.error &&
  sidebar.body === 'Complete' && sidebar.health === 'Complete' && sidebar.mind === 'Complete' &&
  sidebar.lifestyle === 'Complete' && sidebar.goals === 'Complete' &&
  !passive.path && /Welcome/i.test(header) && /Serron v1\.0/i.test(passive.text) && !passive.tendai &&
  /rgba\(255, 248, 235, 0\.28\)/.test(inputBorder || '');

console.log('PRODUCED', produced.join('\n'));
if (!ok) {
  console.error('FINAL_FLOW_FAILED');
  process.exit(2);
}
console.log('FINAL_FLOW_OK');
