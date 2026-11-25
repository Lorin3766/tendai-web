/**
 * Task 14b — Feed greeting by local time + one Today verb row (no "not done").
 */
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { feedGreetingFor } from '../mobile-app/js/features/feed/today-block.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

assert.equal(feedGreetingFor(new Date('2026-11-18T08:00:00')), 'Good morning.');
assert.equal(feedGreetingFor(new Date('2026-11-18T14:00:00')), 'Good afternoon.');
assert.equal(feedGreetingFor(new Date('2026-11-18T20:00:00')), 'Good evening.');
assert.ok(!/Guest/i.test(feedGreetingFor(new Date(), { displayName: 'Guest' })));
assert.match(feedGreetingFor(new Date('2026-11-18T08:00:00'), { preferredName: 'Alex' }), /Good morning, Alex/);

const browser = await chromium.launch({ headless: true });

async function boot(page, iso) {
  await page.addInitScript((clock) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {} }));
    window.__obriumClockOverride = clock;
  }, iso);
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.evaluate(async (clock) => {
    window.__obriumClockOverride = clock;
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    document.getElementById('centerBody')?.classList.add('view-feed');
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  }, iso);
  await page.waitForTimeout(800);
}

for (const [label, iso, expectGreet] of [
  ['0800', '2026-11-18T08:00:00', /Good morning/],
  ['1400', '2026-11-18T14:00:00', /Good afternoon/],
  ['2000', '2026-11-18T20:00:00', /Good evening/],
]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await boot(page, iso);
  const snap = await page.evaluate(() => {
    const root = document.getElementById('todayBlock');
    const greet = document.getElementById('todayGreeting')?.textContent || '';
    const text = document.getElementById('todayBlockText')?.textContent || '';
    const actions = [...document.querySelectorAll('#todayBlockActions button')].map((b) => b.textContent.trim());
    const body = (root?.innerText || '').replace(/\s+/g, ' ');
    const header = document.querySelector('.agent-reports-title')?.textContent || '';
    return { greet, text, actions, body, header, hidden: !!root?.hidden };
  });
  console.log('14b', label, JSON.stringify(snap));
  assert.equal(snap.hidden, false);
  assert.match(snap.greet, expectGreet);
  assert.ok(!/not done/i.test(snap.body), snap.body);
  assert.ok(!/Updated \d/i.test(snap.body));
  assert.ok(!/Guest/i.test(snap.greet));
  assert.match(snap.header, /Your focus areas/i);
  if (snap.text) {
    assert.ok(/Log how you slept|Log your day|Done today|Not today/i.test(snap.text), snap.text);
    if (/Log how you slept|Log your day/i.test(snap.text)) {
      assert.ok(snap.actions.some((a) => /^Log$/i.test(a)), JSON.stringify(snap.actions));
    }
  }
  await page.screenshot({
    path: path.join(outDir, `task14b-greeting-${label}-390.png`),
    clip: { x: 0, y: 0, width: 390, height: 844 },
    timeout: 8000,
  }).catch(() => {});
  await page.close();
}

// 14f: desktop Feed column fills free space between sidebars (not capped at 560)
// Measured: 1280→744, 1440→904, 1920→1384 (was 560 under 14b). Gaps to sidebars ≈ 8 px.
for (const [vw, expectCenter] of [
  [1280, 744],
  [1440, 904],
  [1920, 1384],
]) {
  const page = await browser.newPage({ viewport: { width: vw, height: 900 } });
  await boot(page, '2026-11-18T14:00:00');
  const snap = await page.evaluate(() => {
    const col = document.getElementById('col-center');
    const left = document.getElementById('col-left');
    const right = document.getElementById('col-right');
    const feed = document.getElementById('feed-view');
    const strip = document.querySelector('.agent-feed-add-strip');
    const card =
      document.querySelector('.universal-agent-card') ||
      document.querySelector('#feed-view .card-soft');
    const cr = col?.getBoundingClientRect();
    const lr = left?.getBoundingClientRect();
    const rr = right?.getBoundingClientRect();
    return {
      centerW: cr ? Math.round(cr.width) : 0,
      leftW: lr ? Math.round(lr.width) : 0,
      rightW: rr ? Math.round(rr.width) : 0,
      gapL: lr && cr ? Math.round(cr.left - lr.right) : null,
      gapR: rr && cr ? Math.round(rr.left - cr.right) : null,
      feedW: feed ? Math.round(feed.getBoundingClientRect().width) : 0,
      stripW: strip ? Math.round(strip.getBoundingClientRect().width) : 0,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
    };
  });
  console.log('14f desktop', vw, JSON.stringify(snap));
  assert.equal(snap.leftW, 260, `left sidebar ${snap.leftW}`);
  assert.equal(snap.rightW, 260, `right sidebar ${snap.rightW}`);
  assert.ok(
    Math.abs(snap.centerW - expectCenter) <= 4,
    `desktop ${vw} center ${snap.centerW} (expected ~${expectCenter}, was 560 before 14f)`,
  );
  assert.ok(snap.centerW > 560, `desktop ${vw} still capped at 560? ${snap.centerW}`);
  assert.ok(snap.gapL != null && snap.gapL <= 24 && snap.gapR <= 24, `side gaps ${snap.gapL}/${snap.gapR}`);
  assert.ok(Math.abs(snap.stripW - snap.centerW) <= 4, `strip ${snap.stripW} vs center ${snap.centerW}`);
  assert.ok(snap.cardW >= snap.feedW - 40, `card ${snap.cardW} should stretch with feed ${snap.feedW}`);
  if (vw === 1280) {
    await page.screenshot({
      path: path.join(outDir, 'task14b-desktop-1280.png'),
      timeout: 8000,
    }).catch(() => {});
  }
  await page.close();
}

// 14f: phone width unchanged (no desktop sidebars; same column size as before)
{
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await boot(page, '2026-11-18T14:00:00');
  const mobile = await page.evaluate(() => {
    const col = document.getElementById('col-center');
    const feed = document.getElementById('feed-view');
    const left = document.getElementById('col-left');
    const card =
      document.querySelector('.universal-agent-card') ||
      document.querySelector('#feed-view .card-soft');
    const cr = col?.getBoundingClientRect();
    const fr = feed?.getBoundingClientRect();
    const cardR = card?.getBoundingClientRect();
    return {
      centerW: cr ? Math.round(cr.width) : 0,
      feedW: fr ? Math.round(fr.width) : 0,
      leftDisplay: left ? getComputedStyle(left).display : '',
      // 16 px gutters: card inset from the column edges
      gutterL: cr && cardR ? Math.round(cardR.left - cr.left) : null,
      gutterR: cr && cardR ? Math.round(cr.right - cardR.right) : null,
    };
  });
  console.log('14f mobile 390', JSON.stringify(mobile));
  assert.equal(mobile.leftDisplay, 'none', 'desktop left sidebar must stay hidden at 390');
  assert.ok(mobile.centerW >= 350 && mobile.centerW <= 390, `mobile center ${mobile.centerW}`);
  assert.ok(mobile.gutterL === 16 && mobile.gutterR === 16, `mobile gutters ${mobile.gutterL}/${mobile.gutterR}`);
  await page.close();
}

await browser.close();
console.log('OK verify-task14b');
