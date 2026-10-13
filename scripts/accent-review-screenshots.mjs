/**
 * Capture Feed + Focus Area picker screenshots at ~390px for accent review.
 * Usage: node scripts/accent-review-screenshots.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = process.env.SERRON_URL || process.env.TENDAI_URL || 'http://127.0.0.1:5500';

fs.mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();
const agents = [
  {
    id: 'ua-sleep-shot',
    name: 'Sleep & Recovery',
    instruction: 'Focus Area: Sleep & Recovery.',
    active: true,
    createdAt: now,
    maturity_stage: 0,
    trackingLifeAreaId: 'sleep',
    trackingGoalLabel: 'Sleep quality',
    behaviorModeId: 'watchdog',
    sensor_data: { signalConfidencePct: 28, signal_confidence_pct: 28 },
  },
  {
    id: 'ua-move-shot',
    name: 'Movement & Load',
    instruction: 'Focus Area: Movement & Load.',
    active: true,
    createdAt: now,
    maturity_stage: 0,
    trackingLifeAreaId: 'move',
    trackingGoalLabel: 'Movement load',
    behaviorModeId: 'watchdog',
    sensor_data: { signalConfidencePct: 22, signal_confidence_pct: 22 },
  },
];

const ledger = {
  last_update: now,
  agent_insights: agents.map((a) => ({
    agent: a.name,
    status: `${a.name} is live. Building your baseline from profile and science.`,
    priority: 'normal',
    done: false,
    updatedAt: now,
    source: 'ultimate-agent-creator',
  })),
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE', msg.text());
});

await page.addInitScript(
  ({ agents, ledger }) => {
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_user_agents', JSON.stringify(agents));
    localStorage.setItem('common_ledger', JSON.stringify(ledger));
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  },
  { agents, ledger }
);

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

// Dismiss overlays that block Feed
await page.evaluate(() => {
  document
    .querySelectorAll(
      '.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay, .obrium-modal-overlay'
    )
    .forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
});

await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('feed');
});
await page.waitForTimeout(500);

// Force feed refresh if available
await page.evaluate(() => {
  if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
  if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
});
await page.waitForTimeout(1000);

const debug = await page.evaluate(() => {
  return {
    view: document.getElementById('feed-view')?.className || null,
    cards: document.querySelectorAll('.agent-report-card, .universal-agent-card').length,
    addBtn: !!document.getElementById('agentFeedAddBtn'),
    section: !!document.querySelector('.agent-reports-section'),
    overlays: document.querySelectorAll('.profile-modal-overlay, .obrium-modal-overlay').length,
    bodyText: (document.body?.innerText || '').slice(0, 240),
  };
});
console.log('DEBUG', JSON.stringify(debug, null, 2));

await page.screenshot({
  path: path.join(outDir, 'debug-state.png'),
  fullPage: false,
});

if (debug.cards < 1) {
  // Try clicking Feed tab
  const feedTab = page.locator('#tab-feed, [data-view="feed"], button:has-text("Feed")').first();
  if (await feedTab.count()) {
    await feedTab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

await page.waitForSelector('.universal-agent-card, .heart-agent-module-card, .agent-report-card, #agentFeedAddBtn', {
  timeout: 20000,
});
await page.waitForTimeout(600);

const feedPath = path.join(outDir, 'feed-390.png');
await page.screenshot({ path: feedPath, fullPage: false });
console.log('Wrote', feedPath);

const addBtn = page.locator('#agentFeedAddBtn, .agent-feed-add-panel').first();
await addBtn.scrollIntoViewIfNeeded();
await addBtn.click({ timeout: 10000 });
await page.waitForSelector('.deploy-cyan .deploy-tile', { timeout: 15000 });
await page.waitForTimeout(400);

const tile = page.locator('.deploy-cyan .deploy-tile').first();
await tile.click();
await page.waitForTimeout(350);

const pickerPath = path.join(outDir, 'focus-picker-390.png');
await page.locator('.obrium-modal-content.deploy-cyan').screenshot({ path: pickerPath });
console.log('Wrote', pickerPath);

await browser.close();
console.log('Done.');
