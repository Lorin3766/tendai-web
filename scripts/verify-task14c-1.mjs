/**
 * Task 14c-1 — build id consistency + upgrade cannot mix old CSS with new JS.
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/verify-task14c-1.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

const buildIdJs = fs.readFileSync(path.join(root, 'mobile-app/js/build-id.js'), 'utf8');
const BUILD_ID = (buildIdJs.match(/BUILD_ID\s*=\s*['"]([^'"]+)/) || [])[1];
assert.ok(BUILD_ID, 'BUILD_ID missing');

const sw = fs.readFileSync(path.join(root, 'mobile-app/service-worker.js'), 'utf8');
assert.ok(sw.includes(`CACHE_NAME = '${BUILD_ID}'`), 'SW CACHE_NAME must equal BUILD_ID');
assert.ok(/isCssRequest/.test(sw), 'SW must network-first CSS');
assert.ok(/isHtmlRequest\(req\) \|\| isJsRequest\(url\) \|\| isCssRequest\(url\)/.test(sw), 'HTML/JS/CSS network-first');

const html = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8');
assert.ok(html.includes(`content="${BUILD_ID}"`), 'meta build id');
assert.ok(html.includes(`components.css?b=${BUILD_ID}`), 'CSS busted with build id');
assert.ok(html.includes(`bootstrap.js?b=${BUILD_ID}`), 'JS busted with build id');
assert.ok(html.includes('settingsBuildSelfCheck'), 'About self-check');
assert.ok(html.includes('New version available'), 'reload bar copy');

const oldCss = execSync('git show bdcc1cb:mobile-app/styles/components.css', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
assert.ok(!/\.uac-chip\s*\{/.test(oldCss));

const browser = await chromium.launch({ headless: true });

// Fresh: chips must be styled (not browser white)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {} }));
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1600);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.__obriumRunBuildSelfCheck?.();
  });
  await page.waitForTimeout(1000);
  const fresh = await page.evaluate((expected) => {
    const chip = document.querySelector('.uac-chip');
    const cs = chip ? getComputedStyle(chip) : null;
    const meta = document.querySelector('meta[name="obrium-build"]')?.getAttribute('content');
    const self = document.getElementById('settingsBuildSelfCheck')?.textContent?.trim();
    return {
      chipBg: cs?.backgroundColor || null,
      chipColor: cs?.color || null,
      meta,
      jsId: window.__OBRIUM_BUILD_ID || null,
      self,
      whiteDefault: cs?.backgroundColor === 'rgb(240, 240, 240)' && cs?.color === 'rgb(0, 0, 0)',
      expected,
    };
  }, BUILD_ID);
  console.log('14c-1 fresh', JSON.stringify(fresh));
  assert.equal(fresh.meta, BUILD_ID);
  assert.equal(fresh.jsId, BUILD_ID);
  assert.equal(fresh.whiteDefault, false, 'fresh build must not render browser-default white chips');
  assert.ok(fresh.chipBg && fresh.chipBg !== 'rgb(240, 240, 240)');
  await page.screenshot({
    path: path.join(outDir, 'task14c-1-fresh-feed-390.png'),
    clip: { x: 0, y: 0, width: 390, height: 844 },
  }).catch(() => {});
  await ctx.close();
}

// Upgrade scenario: old SW (cache-first CSS) + new HTML/JS must end consistent after reload bar / new SW
{
  const profileDir = path.join(root, 'mobile-app', '_audit', 'pw-profile-14c-1');
  fs.rmSync(profileDir, { recursive: true, force: true });
  const oldSw = execSync('git show 5e15c87:mobile-app/service-worker.js', { cwd: root, encoding: 'utf8' });
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 390, height: 844 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  let serveOld = true;
  await page.route('**/service-worker.js**', async (route) => {
    if (serveOld) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: oldSw,
        headers: { 'Cache-Control': 'no-store' },
      });
    } else {
      await route.continue();
    }
  });
  await page.route('**/styles/components.css**', async (route) => {
    if (serveOld) {
      await route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: oldCss,
        headers: { 'Cache-Control': 'no-store' },
      });
    } else {
      await route.continue();
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {} }));
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const mixed = await page.evaluate(() => {
    const chip = document.querySelector('.uac-chip') || null;
    // Force render if needed
    return {
      chipBg: chip ? getComputedStyle(chip).backgroundColor : null,
    };
  });
  // Ensure feed rendered
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
  });
  await page.waitForTimeout(1000);
  const beforeUpgrade = await page.evaluate(async () => {
    const chip = document.querySelector('.uac-chip');
    const cs = chip ? getComputedStyle(chip) : null;
    return {
      chipBg: cs?.backgroundColor || null,
      whiteDefault: cs?.backgroundColor === 'rgb(240, 240, 240)',
      caches: await caches.keys(),
    };
  });
  console.log('14c-1 beforeUpgrade', JSON.stringify(beforeUpgrade));
  assert.equal(beforeUpgrade.whiteDefault, true, 'precondition: old CSS must produce white chips');

  // Flip to current files + new SW; keep a second tab open
  serveOld = false;
  const tab2 = await ctx.newPage();
  await tab2.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.__obriumRunBuildSelfCheck?.();
  });
  await page.waitForTimeout(1200);

  // Click reload bar if present (new version available)
  const bar = page.locator('#obriumReloadBarBtn');
  if (await bar.count()) {
    await bar.click();
    await page.waitForTimeout(2000);
    await page.evaluate(async () => {
      document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
      try {
        (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
      } catch (_) {}
      window.switchView?.('feed');
      window.renderAgentReportsSection?.();
    });
    await page.waitForTimeout(1000);
  }

  const after = await page.evaluate((expected) => {
    const chip = document.querySelector('.uac-chip');
    const cs = chip ? getComputedStyle(chip) : null;
    const cssHref = document.querySelector('link[href*="components.css"]')?.getAttribute('href') || '';
    return {
      chipBg: cs?.backgroundColor || null,
      whiteDefault: cs?.backgroundColor === 'rgb(240, 240, 240)',
      cssHref,
      meta: document.querySelector('meta[name="obrium-build"]')?.getAttribute('content'),
      jsId: window.__OBRIUM_BUILD_ID,
      caches: null,
    };
  }, BUILD_ID);
  after.caches = await page.evaluate(() => caches.keys());
  console.log('14c-1 afterUpgrade', JSON.stringify(after));
  assert.equal(after.meta, BUILD_ID);
  assert.ok(String(after.cssHref).includes(BUILD_ID), `css href missing build id: ${after.cssHref}`);
  assert.equal(after.whiteDefault, false, 'after upgrade chips must not stay browser-default white');
  assert.ok(after.caches.includes(BUILD_ID), `cache must include ${BUILD_ID}, got ${after.caches}`);

  await page.screenshot({
    path: path.join(outDir, 'task14c-1-upgraded-feed-390.png'),
    clip: { x: 0, y: 0, width: 390, height: 844 },
  }).catch(() => {});
  await tab2.close();
  await ctx.close();
}

await browser.close();
console.log('OK verify-task14c-1', BUILD_ID);
