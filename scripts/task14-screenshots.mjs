/**
 * Task 14a checkpoint screenshots (not committed).
 * OBRIUM_URL=http://127.0.0.1:63880 node scripts/task14-screenshots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

async function boot(page, profile = {}) {
  await page.addInitScript((p) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(p));
  }, profile);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      const mod = await import('/js/features/settings/system-onboarding.js');
      mod.ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(900);
}

async function shot(page, name, w = 390) {
  await page.screenshot({
    path: path.join(outDir, name),
    clip: { x: 0, y: 0, width: w, height: 844 },
    timeout: 8000,
  }).catch((e) => console.warn('shot skip', name, e.message));
}

const browser = await chromium.launch({ headless: true });

for (const mode of ['browser', 'standalone']) {
  for (const w of [360, 390, 412]) {
    const context = await browser.newContext({
      viewport: { width: w, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    if (mode === 'standalone') {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: (q) => ({
            matches: String(q).includes('display-mode: standalone'),
            media: q,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false;
            },
          }),
        });
      });
    }
    await boot(page, { lifestyle: {} });
    await shot(page, `task14-14a-empty-${mode}-${w}.png`, w);
    await context.close();
  }
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await boot(page, { lifestyle: {} });
  await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-chip]');
  await page.waitForTimeout(400);
  await shot(page, 'task14-14a-after-one-tap-390.png');
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await boot(page, {
    lifestyle: { sleepDuration: '7-8h', dietType: 'balanced' },
    body: { physicalActivity: 'moderate' },
  });
  await shot(page, 'task14-14a-three-answered-390.png');
  await page.click('.universal-agent-card [data-uac-expand-toggle]');
  await page.waitForTimeout(250);
  await shot(page, 'task14-14a-expanded-390.png');
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  // Advance to Focus Areas if welcome/consent present
  for (let i = 0; i < 3; i++) {
    const next = page.locator('[data-os-next], [data-os-ack-ai]').first();
    if (await next.count()) {
      await next.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  await shot(page, 'task14-14a-onboarding-picker-390.png');
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await boot(page, { lifestyle: { sleepDuration: '7-8h' } });
  await page.click('#agentFeedAddBtn');
  await page.waitForTimeout(600);
  await shot(page, 'task14-14a-add-focus-picker-390.png');
  await context.close();
}

await browser.close();
console.log('OK task14 screenshots');
