/**
 * Task 15d-2 — Feed scale/choice chips ≥44×44 with ≥8px gaps.
 * Measures at 360, 390, 412 and desktop; reports the smallest chip.
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

async function seed(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    // sleepDuration answered → next ask is sleepQuality (1–5 scale)
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem(
      'tendai-profile-state',
      JSON.stringify({ lifestyle: { sleepDuration: '7-8h' } }),
    );
  });
}

async function bootFeed(page) {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    const body = document.getElementById('centerBody');
    if (body) {
      body.classList.remove('view-talk');
      body.classList.add('view-feed');
    }
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
  });
  await page.waitForTimeout(800);
}

async function measure(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
    const chips = [...(card?.querySelectorAll('[data-uac-chip]') || [])];
    const row = card?.querySelector('[data-uac-chips]');
    const sizes = chips.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, label: el.textContent.trim() };
    });
    const gap = row ? parseFloat(getComputedStyle(row).gap) || parseFloat(getComputedStyle(row).rowGap) || 0 : 0;
    const rowTop = chips.length ? Math.min(...chips.map((c) => c.getBoundingClientRect().top)) : 0;
    const sameRow = chips.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 2).length;
    const hOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    return {
      count: chips.length,
      sizes,
      gap,
      sameRow,
      grid: row?.classList.contains('uac-compact__chips--grid') || false,
      hOverflow,
      vw: window.innerWidth,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 360, height: 800, isMobile: true },
  { width: 390, height: 844, isMobile: true },
  { width: 412, height: 915, isMobile: true },
  { width: 1280, height: 800, isMobile: false },
  { width: 1440, height: 900, isMobile: false },
  { width: 1920, height: 1080, isMobile: false },
];

let smallest = { w: Infinity, h: Infinity, where: '', label: '' };

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await seed(page);
  await bootFeed(page);
  const info = await measure(page);
  assert.equal(info.count, 5, `${vp.width}: expected 5 scale chips, got ${info.count}`);
  assert.equal(info.hOverflow, false, `${vp.width}: horizontal overflow`);
  assert.ok(info.gap >= 8, `${vp.width}: gap ${info.gap} < 8`);
  if (vp.width === 360) {
    assert.ok(info.sameRow === 5, `360: five scale chips must fit one row, sameRow=${info.sameRow}`);
    assert.equal(info.grid, false, '360: short 1-5 chips must not use 2-col grid');
  }
  for (const s of info.sizes) {
    assert.ok(s.w >= 44, `${vp.width}: chip "${s.label}" width ${s.w} < 44`);
    assert.ok(s.h >= 44, `${vp.width}: chip "${s.label}" height ${s.h} < 44`);
    if (s.w < smallest.w || s.h < smallest.h) {
      smallest = { w: Math.min(smallest.w, s.w), h: Math.min(smallest.h, s.h), where: String(vp.width), label: s.label };
    }
  }
  console.log(
    `15d-2 ${vp.width}: chips=${info.count} gap=${info.gap} sameRow=${info.sameRow} min=${Math.min(...info.sizes.map((s) => s.w))}×${Math.min(...info.sizes.map((s) => s.h))}`,
  );
  await context.close();
}

// Long-label choice chips → 2-column grid (move / physical activity)
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['move']));
    localStorage.setItem('tendai-profile-state', JSON.stringify({ body: {} }));
  });
  await bootFeed(page);
  const gridInfo = await page.evaluate(() => {
    const card = document.querySelector('.universal-agent-card[data-focus-area-id="move"]');
    const row = card?.querySelector('[data-uac-chips]');
    const chips = [...(card?.querySelectorAll('[data-uac-chip]') || [])];
    const sizes = chips.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), label: el.textContent.trim() };
    });
    return {
      grid: row?.classList.contains('uac-compact__chips--grid') || false,
      sizes,
      labels: sizes.map((s) => s.label),
    };
  });
  assert.ok(gridInfo.grid, `move chips should use 2-col grid, labels=${JSON.stringify(gridInfo.labels)}`);
  for (const s of gridInfo.sizes) {
    assert.ok(s.w >= 44 && s.h >= 44, `grid chip ${s.label} ${s.w}×${s.h}`);
  }
  console.log(`15d-2 move grid: ${gridInfo.labels.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log(`OK verify-task15d-2 smallest chip ≈ ${smallest.w}×${smallest.h}px at ${smallest.where}px ("${smallest.label}")`);
