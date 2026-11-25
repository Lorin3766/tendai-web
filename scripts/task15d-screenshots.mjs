/**
 * Task 15d screenshots at 390 and 1280 → mobile-app/_audit/accent-review/task15d-*
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

async function boot(page, seed) {
  await page.addInitScript((s) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(s.areas || ['sleep', 'move']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(s.profile || {}));
    if (s.followups) localStorage.setItem('tendai_followups_v1', JSON.stringify(s.followups));
    if (s.intro) localStorage.setItem('tendai_talk_intro_ever_v1', '1');
  }, seed);
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  });
}

async function shot(page, name, w, h) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(name);
}

const browser = await chromium.launch({ headless: true });

for (const w of [390, 1280]) {
  const h = w >= 1280 ? 800 : 844;
  const mobile = w < 900;

  // Feed with Tip
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await boot(page, {
      profile: { lifestyle: { sleepDuration: '7-8h', sleepQuality: 4 } },
      areas: ['sleep', 'move'],
    });
    await page.evaluate(async () => {
      try {
        (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
      } catch (_) {}
      window.switchView?.('feed');
      window.renderAgentReportsSection?.();
    });
    await page.waitForTimeout(800);
    await shot(page, `task15d-feed-tip-${w}.png`, w, h);
    await ctx.close();
  }

  // Talk follow-up declined
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await boot(page, {
      intro: true,
      areas: ['sleep'],
      profile: { lifestyle: { sleepDuration: 'prefer-not-say' } },
      followups: {
        answers: [],
        seen: [{ path: 'lifestyle.sleepDuration', value: 'prefer-not-say', on: '2026-11-24' }],
        deferrals: [],
      },
    });
    await page.evaluate(() => {
      localStorage.setItem('tendai_talk_intro_ever_v1', '1');
      window.switchView?.('talk');
    });
    await page.waitForTimeout(1500);
    await shot(page, `task15d-talk-followup-declined-${w}.png`, w, h);
    await ctx.close();
  }

  // Talk follow-up answered
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await boot(page, {
      intro: true,
      areas: ['sleep'],
      profile: { lifestyle: { sleepDuration: '7-8h' } },
      followups: {
        answers: [],
        seen: [{ path: 'lifestyle.sleepDuration', value: '7-8h', on: '2026-11-24' }],
        deferrals: [],
      },
    });
    await page.evaluate(() => {
      localStorage.setItem('tendai_talk_intro_ever_v1', '1');
      window.switchView?.('talk');
    });
    await page.waitForTimeout(1500);
    await shot(page, `task15d-talk-followup-answered-${w}.png`, w, h);
    await ctx.close();
  }

  // Services
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await boot(page, { areas: ['sleep'], profile: {} });
    await page.evaluate(() => {
      window.renderServices?.();
      if (window.innerWidth < 900) window.switchView?.('services');
    });
    await page.waitForTimeout(600);
    await shot(page, `task15d-services-${w}.png`, w, h);
    await ctx.close();
  }

  // Profile
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await boot(page, {
      areas: ['sleep'],
      profile: { lifestyle: { sleepQuality: 4 }, body: {} },
    });
    await page.evaluate(() => {
      window.updateProfileUI?.();
      window.updateProfileCompletenessDisplay?.();
      if (window.innerWidth < 900) window.switchView?.('profile');
    });
    await page.waitForTimeout(600);
    await shot(page, `task15d-profile-${w}.png`, w, h);
    await ctx.close();
  }
}

await browser.close();
console.log('OK task15d-screenshots');
