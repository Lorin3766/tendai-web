/**
 * Task 13 — Compact Feed on mobile.
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/verify-task13.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { BANNED_USER_VOCAB, findBannedVocab } from '../mobile-app/js/features/talk/talk-payoff.js';
import { deriveStatusPillLabel } from '../mobile-app/js/features/feed/universal-agent-card.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

console.log('13 vocab…');
assert.ok(BANNED_USER_VOCAB.includes('On track'));
assert.ok(BANNED_USER_VOCAB.includes('AGT-'));
assert.equal(deriveStatusPillLabel('optimal', 'CONDITION: OPTIMAL'), 'Update');
assert.equal(findBannedVocab('On track').includes('On track'), true);

const sw = fs.readFileSync(path.join(root, 'mobile-app/service-worker.js'), 'utf8');
const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
assert.ok(cacheMatch, 'SW cache name');
const cacheName = cacheMatch[1];
const about = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8');
assert.ok(about.includes(cacheName) || about.includes('settingsBuildCache'), 'About build line');

const browser = await chromium.launch({ headless: true });
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
  localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
  localStorage.setItem(
    'tendai-profile-state',
    JSON.stringify({ lifestyle: { sleepDuration: '7-8h' } }),
  );
});
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1800);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  window.switchView?.('feed');
  window.renderAgentReportsSection?.();
  window.renderTodayBlock?.();
});
await page.waitForTimeout(1200);

const metrics = await page.evaluate(() => {
  const nav = document.querySelector('.bottom-nav, .app-navbar, #bottomNav, nav.mobile-nav, .mobile-nav');
  const navTop = nav?.getBoundingClientRect()?.top ?? 844;
  const today = document.getElementById('todayBlock');
  const cards = [...document.querySelectorAll('.universal-agent-card')];
  const addBtn = document.querySelector('#agentFeedAddBtn, .agent-feed-add-panel');
  const fully = cards.filter((c) => {
    const r = c.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= navTop - 2 && r.height > 0;
  });
  const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
  const feed = document.getElementById('feed-view') || document.body;
  const isVisible = (b) => {
    const r = b.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(b);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    if (b.closest('[hidden], .hidden, [aria-hidden="true"]')) return false;
    return true;
  };
  const filledGold = [...feed.querySelectorAll('button')].filter((b) => {
    if (!isVisible(b)) return false;
    // Outlined pills must never count as the filled primary.
    if (b.classList.contains('uac-compact__talk') || b.classList.contains('agent-feed-add-panel')) {
      return false;
    }
    if (b.classList.contains('today-block__btn--primary')) return true;
    const s = getComputedStyle(b);
    const bg = `${s.backgroundImage} ${s.backgroundColor}`;
    return /linear-gradient/i.test(s.backgroundImage) && /f6c36a|fce3b6|246,\s*195,\s*106|252,\s*227,\s*182/i.test(bg);
  });
  const body = document.body.innerText || '';
  return {
    cardCount: cards.length,
    fullyVisible: fully.length,
    heights,
    todayH: today && !today.hidden ? Math.round(today.getBoundingClientRect().height) : 0,
    todayText: today?.innerText?.replace(/\s+/g, ' ').trim() || '',
    hasOnTrack: /On track/.test(body),
    hasAgt: /AGT-\d+/i.test(body),
    filledGold: filledGold.map((b) => b.textContent.trim()).slice(0, 5),
    filledCount: filledGold.length,
    expand: cards[0]?.querySelector('[data-uac-expand-toggle]')?.getAttribute('aria-expanded'),
    value: cards[0]?.querySelector('[data-uac-value]')?.textContent || '',
    meta: cards[0]?.querySelector('[data-uac-meta]')?.textContent || '',
    talkOutlined: (() => {
      const t = cards[0]?.querySelector('.uac-compact__talk');
      if (!t) return false;
      const s = getComputedStyle(t);
      return s.backgroundImage === 'none' || s.backgroundImage === 'initial';
    })(),
  };
});

console.log('13 metrics', JSON.stringify(metrics));
assert.equal(metrics.hasOnTrack, false, 'On track visible');
assert.equal(metrics.hasAgt, false, 'AGT code visible');
// Task 14a: empty/simple cards ~140–170; filled+next-question chips may reach ~220.
// 14c: empty cards ~255–270 with chip wrap; filled+next-ask can reach ~360. Was ≤230 pre-14a.
assert.ok(metrics.heights.every((h) => h >= 130 && h <= 380), `card heights ${metrics.heights}`);
// 14c chip-wrap cards are taller; ≥3 fully above the tab is no longer reliable at 844px.
assert.ok(metrics.fullyVisible >= 2, `need ≥2 cards visible, got ${metrics.fullyVisible}`);
assert.ok(metrics.todayH > 0 && metrics.todayH <= 72, `today height ${metrics.todayH}`);
assert.ok(/7 to 8 hours|7-8/i.test(metrics.value), `value ${metrics.value}`);
assert.ok(/Based on 1 answer/i.test(metrics.meta), `meta ${metrics.meta}`);
assert.equal(metrics.expand, 'false');
assert.equal(metrics.filledCount, 1, `filled gold buttons: ${JSON.stringify(metrics.filledGold)}`);
assert.ok(
  metrics.filledGold.some((t) => /Do it|Log sleep|Done/i.test(t)),
  `Today primary missing among ${JSON.stringify(metrics.filledGold)}`,
);

// Expand / collapse
await page.click('.universal-agent-card [data-uac-expand-toggle]');
await page.waitForTimeout(300);
const exp = await page.evaluate(() => {
  const c = document.querySelector('.universal-agent-card');
  return {
    aria: c?.querySelector('[data-uac-expand-toggle]')?.getAttribute('aria-expanded'),
    open: c?.classList.contains('heart-agent-module-card--expanded'),
    discuss: !!c?.querySelector('[data-uac-action="discuss"]'),
  };
});
assert.equal(exp.aria, 'true');
assert.equal(exp.open, true);
assert.equal(exp.discuss, true);

async function shot(name) {
  try {
    await page.evaluate(() => {
      try {
        // Avoid Playwright hanging forever on webfonts during CI-like runs.
        Object.defineProperty(document, 'fonts', {
          configurable: true,
          value: { ready: Promise.resolve(), status: 'loaded', check: () => true },
        });
      } catch (_) {}
    });
    await page.screenshot({
      path: path.join(outDir, name),
      clip: { x: 0, y: 0, width: 390, height: 844 },
      timeout: 8000,
    });
  } catch (err) {
    console.warn('screenshot skipped', name, String(err.message || err).slice(0, 120));
  }
}

await shot('task13-feed-expanded-390.png');

await page.click('.universal-agent-card [data-uac-expand-toggle]');
await page.waitForTimeout(200);
await shot('task13-feed-collapsed-390.png');

// Scroll Add Focus into view — last element must clear the tab bar
await page.evaluate(() => {
  const add = document.querySelector('#agentFeedAddBtn');
  const list = document.querySelector('.agent-reports-list');
  if (list) list.scrollTop = list.scrollHeight;
  add?.scrollIntoView({ block: 'end', inline: 'nearest' });
  document.querySelector('.feed-view')?.scrollTo?.(0, 99999);
});
await page.waitForTimeout(500);
const bottom = await page.evaluate(() => {
  const nav = document.querySelector('.bottom-nav, .app-navbar, #bottomNav, nav.mobile-nav, .mobile-nav');
  const add = document.querySelector('#agentFeedAddBtn');
  const navTop = nav?.getBoundingClientRect()?.top ?? 844;
  const addR = add?.getBoundingClientRect();
  return {
    navTop: Math.round(navTop),
    addBottom: addR ? Math.round(addR.bottom) : null,
    clear: addR ? addR.bottom <= navTop - 2 : false,
  };
});
console.log('13 bottom', bottom);
assert.ok(bottom.clear, `Add Focus overlaps tab bar: ${JSON.stringify(bottom)}`);

await shot('task13-feed-bottom-390.png');

await browser.close();
console.log('OK verify-task13', cacheName);
