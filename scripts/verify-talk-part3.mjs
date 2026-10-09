/**
 * Part 3 checkpoint: answer 2–3 Talk questions, confirm save + sidebar + next question.
 * Usage: SERRON_URL=http://127.0.0.1:50489 node scripts/verify-talk-part3.mjs
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
  await page.waitForTimeout(150);
  await page.click('#sendBtn');
  await page.waitForFunction((prev) => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    const ready = last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
    return !typing && bots.length > prev && ready;
  }, before, { timeout: 45000 });
  await page.waitForTimeout(250);
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
await page.waitForTimeout(400);

const shot = async (name) => {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: VW, height: VH } });
  assertWidth(file);
  return file;
};

const snapshot = async (label) => {
  const data = await page.evaluate(() => {
    const last = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].pop();
    const bodyStatus = document.querySelector('#mobileProfileMenu [data-profile-status="body"]')
      || document.querySelector('[data-profile-status="body"]');
    return {
      path: last?.getAttribute('data-profile-prompt-path') || null,
      text: (last?.querySelector('.message-text')?.textContent || '').trim(),
      tendai: /TendAI/i.test(last?.innerText || ''),
      profile: JSON.parse(localStorage.getItem('tendai-profile-state') || '{}'),
      bodyStatus: bodyStatus?.textContent || '',
      integrity: (document.getElementById('profileCompletenessMobile')?.textContent || '').trim(),
    };
  });
  console.log(`SNAP ${label}:`, JSON.stringify({
    path: data.path,
    text: data.text.slice(0, 140),
    tendai: data.tendai,
    sex: data.profile?.body?.sexAtBirth,
    gender: data.profile?.body?.genderIdentity,
    age: data.profile?.body?.age,
    bodyStatus: data.bodyStatus,
    integrity: data.integrity,
  }));
  return data;
};

await snapshot('open');
await shot('talk-part3-open-390.png');

await sendTalk(page, 'Male');
const after1 = await snapshot('after-sex');
await shot('talk-part3-after-sex-390.png');

await sendTalk(page, 'Man');
const after2 = await snapshot('after-gender');
await shot('talk-part3-after-gender-390.png');

await sendTalk(page, '43');
const after3 = await snapshot('after-age');
await shot('talk-part3-after-age-390.png');

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('profile');
});
await page.waitForTimeout(600);
const profileHit = page.locator('#mobileProfileCard .profile-card-expand-hit');
if (await profileHit.count()) {
  await profileHit.first().click();
  await page.waitForTimeout(400);
}
await shot('talk-part3-profile-sidebar-390.png');

const sidebar = await page.evaluate(() => ({
  body: document.querySelector('#mobileProfileMenu [data-profile-status="body"]')?.textContent || '',
  integrity: (document.getElementById('profileCompletenessMobile')?.textContent || '').trim(),
}));
console.log('SIDEBAR', sidebar);

await page.evaluate(() => {
  if (typeof window.openProfileModal === 'function') window.openProfileModal('body');
});
await page.waitForTimeout(700);
const modal = await page.evaluate(() => {
  const sex = document.querySelector('input[name="bodySexAtBirth"]:checked')?.value || null;
  const gender = document.querySelector('input[name="bodyGenderIdentity"]:checked')?.value || null;
  const age = document.getElementById('bodyAge')?.value || null;
  return { sex, gender, age, title: document.getElementById('profileModalTitle')?.textContent || '' };
});
console.log('MODAL', modal);
await shot('talk-part3-body-modal-390.png');

await browser.close();

const ok =
  after1.profile?.body?.sexAtBirth === 'male' &&
  after2.profile?.body?.genderIdentity === 'man' &&
  after3.profile?.body?.age === 43 &&
  after1.path === 'body.genderIdentity' &&
  after2.path === 'body.age' &&
  !after3.path && /keep going/i.test(after3.text) &&
  !after1.tendai && !after2.tendai && !after3.tendai &&
  modal.sex === 'male' &&
  modal.gender === 'man' &&
  Number(modal.age) === 43 &&
  /in progress/i.test(sidebar.body);

if (!ok) {
  console.error('PART3_CHECKPOINT_FAILED');
  process.exit(2);
}
console.log('PART3_CHECKPOINT_OK');
