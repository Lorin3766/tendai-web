/**
 * Task 14d report screenshots at 390 px.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

async function bootFeed(page, profile) {
  await page.addInitScript((p) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(p || { lifestyle: {} }));
  }, profile);
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    document.getElementById('centerBody')?.classList.add('view-feed');
    document.body.classList.remove('talk-view-active');
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(900);
}

async function shot(page, name) {
  const dest = path.join(outDir, name);
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: 390, height: 844 }, timeout: 8000 });
  console.log('shot', name);
}

const browser = await chromium.launch({ headless: true });

// Feed empty
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootFeed(page, { lifestyle: {} });
  await shot(page, 'task14d-feed-empty-390.png');
  await page.close();
}

// After one tap
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootFeed(page, { lifestyle: {} });
  await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-chip]');
  await page.waitForTimeout(500);
  await shot(page, 'task14d-after-tap-390.png');
  await page.close();
}

// After declined
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootFeed(page, { lifestyle: {} });
  await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-rather]');
  await page.waitForTimeout(500);
  await shot(page, 'task14d-declined-390.png');
  await page.close();
}

// Scale question with all options
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootFeed(page, { lifestyle: { sleepDuration: '7-8h' } });
  await shot(page, 'task14d-scale-all-options-390.png');
  await page.close();
}

// Bottom pinned Add Focus
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootFeed(page, { lifestyle: {} });
  await page.evaluate(() => {
    document.querySelector('.agent-reports-list')?.scrollTo?.(0, 99999);
    document.querySelector('.feed-view')?.scrollTo?.(0, 99999);
  });
  await page.waitForTimeout(300);
  await shot(page, 'task14d-add-focus-pinned-390.png');
  await page.close();
}

// Talk input
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootFeed(page, { lifestyle: {} });
  await page.evaluate(() => {
    document.body.classList.add('talk-view-active');
    document.getElementById('centerBody')?.classList.add('view-talk');
    window.switchView?.('talk');
  });
  await page.waitForTimeout(700);
  await shot(page, 'task14d-talk-input-390.png');
  await page.close();
}

await browser.close();
console.log('OK task14d-screenshots');
