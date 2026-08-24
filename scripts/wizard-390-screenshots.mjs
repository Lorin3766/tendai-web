/**
 * Capture Add Focus wizard Phase 00/01/02 at exactly 390×844 (mobile).
 * Usage: SERRON_URL=http://127.0.0.1:50489 node scripts/wizard-390-screenshots.mjs
 */
import { chromium, devices } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = process.env.SERRON_URL || process.env.TENDAI_URL || 'http://127.0.0.1:5500';
const VW = 390;
const VH = 844;

fs.mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();
// Pre-seed only sleep so Phase 00 still has selectable tiles (move, nutrition, …)
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
];
const ledger = {
  last_update: now,
  agent_insights: [
    {
      agent: 'Sleep & Recovery',
      status: 'Sleep & Recovery is live. Building your baseline from profile and science.',
      priority: 'normal',
      done: false,
      updatedAt: now,
      source: 'ultimate-agent-creator',
    },
  ],
};

const browser = await chromium.launch({ headless: true });
const iphone = devices['iPhone 12'];
const context = await browser.newContext({
  ...iphone,
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.addInitScript(
  ({ agents, ledger }) => {
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_user_agents', JSON.stringify(agents));
    localStorage.setItem('common_ledger', JSON.stringify(ledger));
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep']));
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  },
  { agents, ledger }
);

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
  if (typeof window.switchView === 'function') window.switchView('feed');
  if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
  if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
});
await page.waitForTimeout(800);

const vp = page.viewportSize();
console.log('viewport', vp);

async function shot(name) {
  const file = path.join(outDir, name);
  // Full viewport clip — proves 390px width, not a wide desktop modal crop
  await page.screenshot({
    path: file,
    clip: { x: 0, y: 0, width: VW, height: VH },
  });
  const meta = await page.evaluate(() => {
    const modal = document.querySelector('.serron-modal-content.deploy-cyan, .tendai-modal-content.deploy-cyan');
    const btn = document.querySelector('.modal-continue-btn');
    const r = modal ? modal.getBoundingClientRect() : null;
    return {
      innerWidth: window.innerWidth,
      modalW: r ? Math.round(r.width) : null,
      btnDisabled: btn ? btn.disabled : null,
      btnText: btn ? btn.textContent.trim() : null,
      btnBg: btn ? getComputedStyle(btn).backgroundImage || getComputedStyle(btn).backgroundColor : null,
    };
  });
  console.log(name, meta);
  console.log('Wrote', file);
}

// Open wizard
await page.locator('#agentFeedAddBtn, .agent-feed-add-panel').first().click({ timeout: 10000 });
await page.waitForSelector('.deploy-cyan .deploy-tile', { timeout: 15000 });
await page.waitForTimeout(400);

// Phase 00 — select a tile so Continue is enabled + gold
await page.locator('.deploy-cyan .deploy-tile').first().click();
await page.waitForTimeout(300);
await shot('wizard-phase00-390.png');

// Phase 01
await page.locator('.modal-continue-btn').click();
await page.waitForSelector('.deploy-cyan [data-function-id], .deploy-cyan .deploy-tile', { timeout: 10000 });
await page.waitForTimeout(400);
await page.locator('.deploy-cyan .deploy-tile, .deploy-cyan [data-function-id]').first().click();
await page.waitForTimeout(300);
await shot('wizard-phase01-390.png');

// Phase 02
await page.locator('.modal-continue-btn').click();
await page.waitForSelector('.deploy-cyan .deploy-source-row, .deploy-cyan [data-source-id]', { timeout: 10000 });
await page.waitForTimeout(400);
// Default source should already be selected; ensure continue enabled
const needSelect = await page.evaluate(() => {
  const btn = document.querySelector('.modal-continue-btn');
  return btn && btn.disabled;
});
if (needSelect) {
  await page.locator('.deploy-cyan .deploy-source-row, .deploy-cyan [data-source-id]').first().click();
  await page.waitForTimeout(250);
}
await shot('wizard-phase02-390.png');

await browser.close();
console.log('Done — all three phases at', VW + 'px');
