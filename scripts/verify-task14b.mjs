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
    assert.ok(/Log how you slept|Log your day|Today: done|Today: not today/i.test(snap.text), snap.text);
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

// Desktop width: Feed column ≤ ~560
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await boot(page, '2026-11-18T14:00:00');
  const w = await page.evaluate(() => {
    const col = document.getElementById('col-center');
    return col ? Math.round(col.getBoundingClientRect().width) : 0;
  });
  console.log('14b desktop center width', w);
  assert.ok(w > 0 && w <= 560, `desktop feed width ${w}`);
  await page.screenshot({
    path: path.join(outDir, 'task14b-desktop-1280.png'),
    timeout: 8000,
  }).catch(() => {});
  await page.close();
}

await browser.close();
console.log('OK verify-task14b');
