/**
 * Task 14d-1 — pinned opaque + Add Focus strip above tab bar.
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

async function bootFeed(page) {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.unregister()));
      const keys = (await caches?.keys?.()) || [];
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    document.getElementById('centerBody')?.classList.add('view-feed');
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(900);
}

const browser = await chromium.launch({ headless: true });
for (const width of [360, 390, 412]) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {} }));
  });
  await bootFeed(page);
  const m = await page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav');
    const strip = document.querySelector('.agent-feed-add-strip');
    const add = document.querySelector('#agentFeedAddBtn');
    const list = document.querySelector('.agent-reports-list');
    const navTop = nav?.getBoundingClientRect()?.top ?? 844;
    list && (list.scrollTop = list.scrollHeight);
    const cards = [...document.querySelectorAll('.universal-agent-card')];
    const last = cards[cards.length - 1];
    const stripR = strip?.getBoundingClientRect();
    const addR = add?.getBoundingClientRect();
    const stripCs = strip ? getComputedStyle(strip) : null;
    const mid = addR ? (addR.left + addR.right) / 2 : 0;
    const goldish = (bg) => /246,\s*195,\s*106/i.test(bg || '');
    const filled = [...document.querySelectorAll('button')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.bottom < 0 || r.top > 844) return false;
      return goldish(getComputedStyle(el).backgroundColor);
    });
    return {
      stripFixed: stripCs?.position === 'fixed',
      stripOpaque: stripCs && !/transparent|rgba\(0,\s*0,\s*0,\s*0\)/i.test(stripCs.backgroundColor),
      border: stripCs ? parseFloat(stripCs.borderTopWidth) : 0,
      addAboveNav: addR ? addR.bottom <= navTop - 2 : false,
      lastAboveStrip: last && stripR ? last.getBoundingClientRect().bottom <= stripR.top - 1 : false,
      centered: Math.abs(mid - window.innerWidth / 2) <= 40,
      filledLabels: filled.map((b) => b.textContent.trim().slice(0, 24)),
      stripH: stripR ? Math.round(stripR.height) : 0,
    };
  });
  console.log('14d-1', width, JSON.stringify(m));
  assert.ok(m.stripFixed, `${width} strip fixed`);
  assert.ok(m.stripOpaque, `${width} strip opaque`);
  assert.ok(m.border >= 1, `${width} strip border`);
  assert.ok(m.addAboveNav, `${width} above nav`);
  assert.ok(m.lastAboveStrip, `${width} last card above strip`);
  assert.ok(m.centered, `${width} centered`);
  assert.equal(m.filledLabels.length, 2, `${width} gold count ${JSON.stringify(m.filledLabels)}`);
  await context.close();
}
await browser.close();
console.log('OK verify-task14d-1');
