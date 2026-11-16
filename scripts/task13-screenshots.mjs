/**
 * Task 13 checkpoint screenshots (not committed).
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/task13-screenshots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

async function prep(page, extraStorage) {
  await page.addInitScript((extra) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem(
      'tendai-profile-state',
      JSON.stringify({ lifestyle: { sleepDuration: '7-8h' } }),
    );
    for (const [k, v] of Object.entries(extra || {})) {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, extraStorage);
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ headless: true });

// 13a collapsed / expanded at 390
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await prep(page);
  const before = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav, .app-navbar, #bottomNav, nav.mobile-nav, .mobile-nav');
    const navTop = nav?.getBoundingClientRect()?.top ?? 844;
    return [...document.querySelectorAll('.universal-agent-card')].filter((c) => {
      const r = c.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= navTop - 2;
    }).length;
  });
  await page.screenshot({ path: path.join(outDir, 'task13-13a-collapsed-390.png'), fullPage: false });
  await page.click('.universal-agent-card [data-uac-expand-toggle]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, 'task13-13a-expanded-390.png'), fullPage: false });
  console.log('13a fullyVisible collapsed:', before);
  await context.close();
}

// 13b today states
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await prep(page);
  await page.evaluate(() => {
    const now = new Date();
    window.setObriumClockOverride?.(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0));
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'task13-13b-today-not-done-390.png'), fullPage: false });

  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem(
      'tendai_today_steps_v1',
      JSON.stringify([{ date, slot: 'morning', actionId: 'checkin-sleep', area: 'sleep', status: 'done' }]),
    );
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'task13-13b-today-done-390.png'), fullPage: false });

  await page.goto(baseUrl + '/?contentPreview=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    const now = new Date();
    window.setObriumClockOverride?.(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0));
    localStorage.removeItem('tendai_today_steps_v1');
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'task13-13b-today-action-390.png'), fullPage: false });
  await context.close();
}

// 13c bottom clearance at widths × modes
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
    await prep(page);
    await page.evaluate(() => {
      const list = document.querySelector('.agent-reports-list');
      if (list) list.scrollTop = list.scrollHeight;
      document.getElementById('feed-view')?.scrollTo?.(0, 99999);
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, `task13-13c-bottom-${mode}-${w}.png`),
      fullPage: false,
    });
    await context.close();
  }
}

await browser.close();
console.log('OK task13 screenshots →', outDir);
