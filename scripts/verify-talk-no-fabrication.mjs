/**
 * Verify Talk never claims invented gap data: 12-day gap, legacy placeholders + legacy chat line seeded.
 * Usage: SERRON_URL=http://127.0.0.1:50490 node scripts/verify-talk-no-fabrication.mjs
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

const LEGACY_TEXT =
  "Welcome back, Anton. I've noted a 12-day gap. I've filled it with your baseline protocol (lecithin/gelatin/10k steps). Let me know if we need to adjust anything.";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.addInitScript((legacyText) => {
  if (sessionStorage.getItem('__seeded') === '1') return;
  sessionStorage.setItem('__seeded', '1');
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
  const d = new Date();
  d.setDate(d.getDate() - 13);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('tendai_last_sync_date', key);
  localStorage.setItem(
    'tendai_sync_placeholders_v1',
    JSON.stringify([{ id: 'history-gap-x', dateKey: key, protocol: ['lecithin', 'gelatin', '10k steps'] }]),
  );
  localStorage.setItem(
    'tendai_chat_history',
    JSON.stringify([{ id: 'legacy-1', text: legacyText, type: 'ai', timestamp: Date.now() - 1000 }]),
  );
}, LEGACY_TEXT);

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
});

const feedStatus = await page.evaluate(() => ({
  value: document.getElementById('humanOsStatusValue')?.textContent?.trim() || '',
  subtext: document.getElementById('humanOsStatusSubtext')?.textContent?.trim() || '',
}));

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForSelector('.talk-view [data-drift-prompt]', { timeout: 20000 });
await page.waitForTimeout(2500);

const snap = await page.evaluate(() => {
  const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')].map(
    (b) => (b.querySelector('.message-text')?.textContent || '').trim(),
  );
  const gap = document.querySelector('.talk-view [data-drift-prompt]');
  const record = JSON.parse(localStorage.getItem('TendAI_MasterRecord') || '{}');
  const eventLog = record?.Signals?.eventLog || [];
  return {
    bots,
    gapText: gap?.querySelector('.message-text')?.textContent || '',
    gapButtons: [...(gap?.querySelectorAll('button') || [])].map((b) => b.textContent.trim()),
    placeholdersKey: localStorage.getItem('tendai_sync_placeholders_v1'),
    placeholderEvents: eventLog.filter((e) => e && e.type === 'HISTORY_SYNC_PLACEHOLDER').length,
  };
});

console.log('FEED STATUS:', JSON.stringify(feedStatus));
console.log('SNAPSHOT:', JSON.stringify(snap, null, 2));

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};
const allText = [...snap.bots, feedStatus.value, feedStatus.subtext].join(' \n ');
if (/filled|backfill|baseline protocol|lecithin|gelatin/i.test(allText)) fail('fabricated gap wording still visible');
if (/\bAnton\b/.test(allText)) fail('hardcoded name shown with no name in profile');
if (/Optimal/i.test(feedStatus.value)) fail('Feed claims Optimal during a data gap');
if (!/Nothing was logged for the last 12 days/.test(snap.gapText)) fail('gap message does not state missing data plainly');
if (snap.gapButtons.length !== 2) fail('expected accept/decline buttons on gap message');
if (snap.placeholdersKey !== null) fail('legacy placeholder storage not purged');
if (snap.placeholderEvents > 0) fail('placeholder events still in Master Record');

const outFile = path.join(outDir, 'talk-no-fabrication-gap-390.png');
await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: VW, height: VH } });
console.log('SCREENSHOT:', outFile);

await browser.close();
if (failed) process.exit(1);
console.log('PASS');
