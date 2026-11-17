/**
 * Task 14c Step 0 — prove mixed-build upgrade scenario (old SW + new HTML/JS).
 * Does not fix anything; prints evidence and takes screenshots.
 *
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/verify-task14c-step0.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });
const profileDir = path.join(root, 'mobile-app', '_audit', 'pw-profile-14c-step0');
fs.rmSync(profileDir, { recursive: true, force: true });
fs.mkdirSync(profileDir, { recursive: true });

const oldCss = execSync('git show bdcc1cb:mobile-app/styles/components.css', {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
const oldSw = execSync('git show 5e15c87:mobile-app/service-worker.js', {
  cwd: root,
  encoding: 'utf8',
});
const currentCss = fs.readFileSync(path.join(root, 'mobile-app/styles/components.css'), 'utf8');
const currentSw = fs.readFileSync(path.join(root, 'mobile-app/service-worker.js'), 'utf8');

console.log('STEP0 evidence setup…');
console.log('  old SW CACHE_NAME:', (oldSw.match(/CACHE_NAME\s*=\s*['"]([^'"]+)/) || [])[1]);
console.log('  new SW CACHE_NAME:', (currentSw.match(/CACHE_NAME\s*=\s*['"]([^'"]+)/) || [])[1]);
console.log('  old CSS has .uac-chip:', /\.uac-chip\s*\{/.test(oldCss));
console.log('  new CSS has .uac-chip:', /\.uac-chip\s*\{/.test(currentCss));
console.log('  old CSS has .focus-area-glyph:', /\.focus-area-glyph\s*[,{]/.test(oldCss));
console.log('  new CSS has .focus-area-glyph:', /\.focus-area-glyph\s*[,{]/.test(currentCss));
console.log('  SW treats CSS as cache-first (isStaticAsset):', /isStaticAsset/.test(oldSw) && /caches\.match\(req\)/.test(oldSw));
console.log('  SW treats JS as network-first:', /isJsRequest/.test(oldSw) && /isHtmlRequest\(req\) \|\| isJsRequest/.test(oldSw));

async function seedOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition', 'longevity']));
    // Empty profile — founder never entered age
    localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {}, body: {} }));
  });
}

async function bootFeed(page) {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      const mod = await import('/js/features/settings/system-onboarding.js');
      mod.ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
  });
  await page.waitForTimeout(1000);
}

async function inspectFeed(page) {
  return page.evaluate(async () => {
    const chip = document.querySelector('.uac-chip');
    const glyph = document.querySelector('[data-focus-area-glyph]');
    const chipCs = chip ? getComputedStyle(chip) : null;
    const glyphCs = glyph ? getComputedStyle(glyph) : null;
    const sheets = [...document.styleSheets].map((s) => s.href || '(inline)');
    let cssRuleHit = false;
    try {
      for (const s of document.styleSheets) {
        const rules = s.cssRules || s.rules || [];
        for (const r of rules) {
          if (r.selectorText && /\.uac-chip\b/.test(r.selectorText)) cssRuleHit = true;
        }
      }
    } catch (_) {
      cssRuleHit = 'cross-origin-blocked';
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    const sw = regs[0]?.active?.scriptURL || regs[0]?.waiting?.scriptURL || null;
    // Which cache holds components.css?
    const cacheNames = await caches.keys();
    const cssSources = {};
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      const hit = keys.find((k) => /components\.css/.test(k.url));
      if (hit) {
        const res = await cache.match(hit);
        const text = res ? await res.text() : '';
        cssSources[name] = {
          url: hit.url,
          hasUacChip: /\.uac-chip\s*\{/.test(text),
          hasGlyph: /\.focus-area-glyph\s*[,{]/.test(text),
          bytes: text.length,
        };
      }
    }
    // Resource timing for components.css
    const perf = performance.getEntriesByType('resource').filter((e) => /components\.css/.test(e.name));
    const ageText = document.getElementById('profileAge')?.textContent?.trim() || '';
    return {
      chipBg: chipCs?.backgroundColor || null,
      chipColor: chipCs?.color || null,
      chipBorder: chipCs?.borderTopWidth || null,
      glyphDisplay: glyphCs?.display || null,
      glyphBg: glyphCs?.backgroundColor || null,
      glyphExists: !!glyph,
      chipExists: !!chip,
      cssRuleHit,
      sheets,
      sw,
      cacheNames,
      cssSources,
      perf: perf.map((e) => ({
        name: e.name,
        transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize,
        fromCacheGuess: e.transferSize === 0 && e.encodedBodySize > 0,
      })),
      ageText,
      longevityAsk:
        document
          .querySelector('.universal-agent-card[data-focus-area-id="longevity"] [data-uac-ask]')
          ?.textContent || '',
      longevityChips: [
        ...(document.querySelectorAll(
          '.universal-agent-card[data-focus-area-id="longevity"] [data-uac-chip]',
        ) || []),
      ].map((b) => b.textContent.trim()),
    };
  });
}

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 390, height: 844 },
  args: ['--disable-dev-shm-usage'],
});

const page = browser.pages()[0] || (await browser.newPage());
await page.route('**/api/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);

// ——— Phase A: install OLD SW and seed OLD CSS into its cache ———
let phase = 'A-old';
await page.route('**/service-worker.js', async (route) => {
  if (phase === 'A-old' || phase === 'B-mixed') {
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
await page.route('**/styles/components.css', async (route) => {
  if (phase === 'A-old') {
    await route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: oldCss,
      headers: { 'Cache-Control': 'no-store' },
    });
  } else if (phase === 'B-mixed') {
    // Simulate: network would return NEW css, but SW cache-first should still serve OLD from cache
    await route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: currentCss,
      headers: { 'Cache-Control': 'no-store', 'X-Step0': 'network-new-css' },
    });
  } else {
    await route.continue();
  }
});

await seedOnboarding(page);
await bootFeed(page);
// Wait for SW control
await page.waitForTimeout(1500);
const afterOld = await inspectFeed(page);
console.log('PHASE_A_OLD', JSON.stringify(afterOld, null, 2));
await page.screenshot({
  path: path.join(outDir, 'task14c-step0-upgraded-profile-feed-390.png'),
  clip: { x: 0, y: 0, width: 390, height: 844 },
});

// Keep a second "tab" open (founder scenario)
const page2 = await browser.newPage();
await page2.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(800);

// ——— Phase B: serve NEW CSS on network, but keep OLD SW controlling (no new SW yet) ———
phase = 'B-mixed';
// Soft reload main tab (like a real user after deploy, before new SW activates)
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(async () => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  try {
    const mod = await import('/js/features/settings/system-onboarding.js?' + Date.now());
    mod.ensureOnboardingFocusAreasInFeed?.();
  } catch (_) {}
  window.switchView?.('feed');
  window.renderAgentReportsSection?.();
});
await page.waitForTimeout(1200);
const afterMixed = await inspectFeed(page);
console.log('PHASE_B_MIXED', JSON.stringify(afterMixed, null, 2));
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: path.join(outDir, 'task14c-step0-mixed-feed-390.png'),
  clip: { x: 0, y: 0, width: 390, height: 844 },
});
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(400);
await page.screenshot({
  path: path.join(outDir, 'task14c-step0-mixed-feed-1280.png'),
  clip: { x: 0, y: 0, width: 1280, height: 800 },
});

// ——— Phase C: fresh context (no old SW) = clean current build ———
await browser.close();

const fresh = await chromium.launch({ headless: true });
const freshCtx = await fresh.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const freshPage = await freshCtx.newPage();
await freshPage.route('**/api/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);
await seedOnboarding(freshPage);
await bootFeed(freshPage);
const afterFresh = await inspectFeed(freshPage);
console.log('PHASE_C_FRESH', JSON.stringify(afterFresh, null, 2));
await freshPage.screenshot({
  path: path.join(outDir, 'task14c-step0-fresh-profile-feed-390.png'),
  clip: { x: 0, y: 0, width: 390, height: 844 },
});
await freshPage.setViewportSize({ width: 1280, height: 800 });
await freshPage.waitForTimeout(400);
await page2closeSafe();
async function page2closeSafe() {}
await freshPage.screenshot({
  path: path.join(outDir, 'task14c-step0-fresh-profile-feed-1280.png'),
  clip: { x: 0, y: 0, width: 1280, height: 800 },
});

// Age probe: empty body → should be em dash, not 43
console.log('AGE_EMPTY_PROFILE', afterFresh.ageText);

// Discuss LOCAL MODE path evidence (static)
const feedSrc = fs.readFileSync(path.join(root, 'mobile-app/js/features/feed/agent-reports-feed.js'), 'utf8');
const llmSrc = fs.readFileSync(path.join(root, 'mobile-app/js/features/talk/llm.js'), 'utf8');
console.log('LOCAL_MODE_FEED_GATE', /obriumServerStatus === 'Offline'/.test(feedSrc));
console.log('LOCAL_MODE_LLM_FN', /function localFallbackResponse/.test(llmSrc));
console.log(
  'LOCAL_MODE_ON_NETLIFY_NOTE',
  'Runs whenever window.obriumServerStatus==="Offline" OR relay fetch fails — not localhost-only today.',
);

await fresh.close();

const hypothesis =
  afterMixed.cssSources &&
  Object.values(afterMixed.cssSources).some((s) => s.hasUacChip === false) &&
  afterFresh.chipExists &&
  afterMixed.chipExists;
console.log(
  'HYPOTHESIS_MIXED_JS_NEW_CSS_OLD',
  hypothesis
    ? 'SUPPORTED — caches can hold pre-14a CSS while page JS renders .uac-chip nodes'
    : 'INCONCLUSIVE — see PHASE dumps',
);
console.log('OK step0');
