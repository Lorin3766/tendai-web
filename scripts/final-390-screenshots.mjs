/**
 * Capture Talk / Profile / Services / wizard at literal 390px PNG width (DPR=1).
 * Usage: OBRIUM_URL=http://127.0.0.1:50489 node scripts/final-390-screenshots.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = baseUrl;
const VW = 390;
const VH = 844;

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

function assertWidth(file, expected = VW) {
  const png = PNG.sync.read(fs.readFileSync(file));
  console.log(`DIM ${path.basename(file)} => ${png.width}x${png.height}`);
  if (png.width !== expected) {
    throw new Error(`Expected width ${expected}, got ${png.width} for ${file}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1, // literal CSS pixels = PNG pixels
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
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
    localStorage.setItem(
      'tendai-collapse-mobile',
      JSON.stringify({ profileMenu: true, labs: true, onlineDoctor: false, miniPrograms: false, agents: false })
    );
  },
  { agents, ledger }
);

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  document
    .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
    .forEach((el) => el.remove());
});

async function shot(name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: VW, height: VH } });
  assertWidth(file);
  console.log('Wrote', file);
}

// --- Talk ---
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('talk');
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const tc = window.__obriumTalkComponent;
  if (tc && typeof tc.addMessageToChat === 'function') {
    tc.addMessageToChat('Hi — how should I think about recovery this week?', 'user');
    tc.addMessageToChat(
      'Keep recovery light: protect sleep windows and keep hard training off consecutive days.',
      'ai'
    );
  }
});
await page.waitForTimeout(400);
await page.fill('#chatInput', 'Thanks — remind me tonight');
await page.waitForTimeout(200);
await shot('talk-390.png');

// Empty input → Send must be neutral/disabled (no resting gold)
await page.fill('#chatInput', '');
await page.waitForTimeout(150);
await shot('talk-send-empty-390.png');
await page.fill('#chatInput', 'Thanks — remind me tonight');
await page.waitForTimeout(100);

// --- Profile (mobile profile panel / sections) ---
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('profile');
  if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
});
await page.waitForTimeout(500);
// Expand via real UI control
const expand = page.locator('[data-collapse-trigger="MOBILE_PROFILE_MENU"]').first();
if (await expand.count()) {
  const expanded = await expand.getAttribute('aria-expanded');
  if (expanded !== 'true') await expand.click();
}
await page.waitForTimeout(500);
const statusSample = await page.locator('#mobileProfileMenu [data-profile-status="body"]').first().textContent().catch(() => '');
console.log('profile body status label:', statusSample);
await page.locator('#mobileProfileMenu').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
await shot('profile-sidebar-390.png');

// --- Services ---
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('services');
  if (typeof window.renderServices === 'function') window.renderServices();
});
await page.waitForTimeout(500);
const labsToggle = page.locator('[data-collapse="MOBILE_LABS"], #mobileServicesView [data-collapse]').first();
if (await labsToggle.count()) {
  const labsExp = await labsToggle.getAttribute('aria-expanded');
  if (labsExp !== 'true') await labsToggle.click().catch(() => {});
}
await page.waitForTimeout(400);
await shot('services-390.png');

// --- Feed (for completeness) ---
await page.evaluate(() => {
  if (typeof window.switchView === 'function') window.switchView('feed');
  if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
});
await page.waitForTimeout(600);
await shot('feed-390.png');

// --- Wizard phases (overwrite with true 390px) ---
await page.locator('#agentFeedAddBtn, .agent-feed-add-panel').first().click({ timeout: 10000 });
await page.waitForSelector('.deploy-cyan .deploy-tile', { timeout: 15000 });
await page.locator('.deploy-cyan .deploy-tile').first().click();
await page.waitForTimeout(300);
await shot('wizard-phase00-390.png');

await page.locator('.modal-continue-btn').click();
await page.waitForSelector('.deploy-cyan .deploy-tile', { timeout: 10000 });
await page.locator('.deploy-cyan .deploy-tile').first().click();
await page.waitForTimeout(300);
await shot('wizard-phase01-390.png');

await page.locator('.modal-continue-btn').click();
await page.waitForSelector('.deploy-cyan .deploy-source-row, .deploy-cyan [data-source-id]', {
  timeout: 10000,
});
await page.waitForTimeout(350);
await shot('wizard-phase02-390.png');

await browser.close();
console.log('All PNGs are literal', VW + 'px wide (deviceScaleFactor=1).');
