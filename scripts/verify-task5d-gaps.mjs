/**
 * Task 5d checkpoint:
 *  1. Settings "Privacy Policy" / "Terms of Use" rows open the pages
 *  2. "Delete all local data" also clears the IndexedDB biometrics database
 *  3. Relay-status tooltip wording (online + offline)
 *  4. Privacy policy "Your Rights" names where each thing is cleared
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task5d-gaps.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const base = baseUrl;
const VW = 390;
const VH = 844;

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.addInitScript(() => {
  if (sessionStorage.getItem('__s')) return;
  sessionStorage.setItem('__s', '1');
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai-profile-state', JSON.stringify({ body: { birthYear: 1980 } }));
});

async function boot() {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  });
}

async function clickSettingsRow(id) {
  await page.evaluate(() => window.openSettingsModal && window.openSettingsModal());
  await page.waitForTimeout(400);
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  await page.click(`#${id}`);
}

// 1. Privacy Policy / Terms rows
await boot();
await clickSettingsRow('settingsPrivacyPolicy');
await page.waitForURL(/privacy-policy\.html/, { timeout: 5000 }).catch(() => {});
const privacyUrl = page.url();
const privacyH = await page.evaluate(() => document.querySelector('h2')?.textContent?.trim());
console.log('1. Privacy Policy row ->', privacyUrl.replace(base, ''), `(${privacyH})`);
if (!/privacy-policy\.html$/.test(privacyUrl)) fail('Privacy Policy row did not open the policy');

// 4. Your Rights text (on the page we just opened)
const rights = await page.evaluate(() => {
  const h = [...document.querySelectorAll('h3')].find((x) => x.textContent.trim() === 'Your Rights');
  const parts = [];
  for (let n = h?.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) parts.push(n.innerText.replace(/\s+/g, ' ').trim());
  return parts.join(' ');
});
console.log('4. Your Rights ->', rights);
if (/through the Profile section/.test(rights)) fail('old Your Rights wording still present');
for (const needle of [/Edit profile data/, /Clear chat/, /Clear these notes/, /Delete all local data/, /does not recall data already sent/]) {
  if (!needle.test(rights)) fail(`Your Rights missing ${needle}`);
}

await boot();
await clickSettingsRow('settingsTermsOfUse');
await page.waitForURL(/terms-of-use\.html/, { timeout: 5000 }).catch(() => {});
console.log('1. Terms of Use row  ->', page.url().replace(base, ''));
if (!/terms-of-use\.html$/.test(page.url())) fail('Terms of Use row did not open the terms');

// Edit profile data row (named in the policy) opens the profile editor
await boot();
await clickSettingsRow('settingsEditProfile');
await page.waitForTimeout(600);
const editOpen = await page.evaluate(() => ({
  settingsOpen: document.getElementById('settingsModalOverlay')?.classList.contains('is-active'),
  profileModal: [...document.querySelectorAll('.profile-modal-overlay.is-active')].map((o) => o.id).filter((id) => id !== 'settingsModalOverlay'),
}));
console.log('   Edit profile data row ->', JSON.stringify(editOpen));
if (editOpen.settingsOpen || !editOpen.profileModal.length) fail('Edit profile data row did not open the profile editor');

// 3. Tooltip wording
await boot();
const tooltips = await page.evaluate(async () => {
  const { publishBackendStatus } = await import('/js/core/backend-fetch.js');
  const el = document.getElementById('coreBackendStrip');
  publishBackendStatus('Online');
  const online = el.getAttribute('title');
  publishBackendStatus('Offline');
  const offline = el.getAttribute('title');
  return { online, offline };
});
console.log('3. Tooltip online  ->', tooltips.online);
console.log('3. Tooltip offline ->', tooltips.offline);
if (/remains private|maximum privacy/.test(tooltips.online + tooltips.offline)) fail('old tooltip wording still present');

// 2. Delete all local data clears IndexedDB
const todayLocal = await page.evaluate(() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
});
const before = await page.evaluate(async (d) => {
  const db = await import('/js/core/biometrics-db.js');
  await db.saveMetrics({ date: d, metrics: { steps: 4321, sleep: 6.2 } });
  localStorage.setItem('__task5d_marker', '1');
  return {
    record: await db.getMetricsByDate(d),
    dbs: (await indexedDB.databases()).map((x) => x.name),
    localKeys: Object.keys(localStorage).length,
  };
}, todayLocal);
console.log('2. Before delete: record', JSON.stringify(before.record), '| databases', JSON.stringify(before.dbs), '| localStorage keys', before.localKeys);
page.once('dialog', (d) => d.accept());
await clickSettingsRow('settingsDeleteData');
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500);
const after = await page.evaluate(async (d) => {
  const dbs = (await indexedDB.databases()).map((x) => x.name);
  let record = null;
  if (dbs.includes('tendai_local_db')) {
    const db = await import('/js/core/biometrics-db.js');
    record = await db.getMetricsByDate(d);
  }
  return { record, dbs, marker: localStorage.getItem('__task5d_marker') };
}, todayLocal);
// The app reopens an empty tendai_local_db on boot, so the database name can reappear; the record must not.
console.log('2. After delete:  record', JSON.stringify(after.record), '| databases', JSON.stringify(after.dbs), '| localStorage marker', after.marker);
if (after.record) fail('biometrics record survived Delete all local data');
if (after.marker) fail('localStorage not cleared');

await browser.close();
if (failed) process.exit(1);
console.log('TASK5D_CHECKPOINT_OK');
