/**
 * Task 14a — flat Feed, area colors, tap-to-answer cards.
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/verify-task14.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import {
  AREA_SURFACE,
  FOCUS_AREA_COLORS,
  contrastRatio,
} from '../mobile-app/js/features/human-os/focus-area-visuals.js';
import { BANNED_USER_VOCAB, findBannedVocab } from '../mobile-app/js/features/talk/talk-payoff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

console.log('14a tokens…');
const TOKENS = {
  fg: '#f7f3ee',
  fgSoft: '#e6dfd6',
  fgMuted: '#c9c2b8',
  surface: AREA_SURFACE,
  gold: '#f6c36a',
};
assert.ok(contrastRatio(TOKENS.fg, TOKENS.surface) >= 7, `main text ${contrastRatio(TOKENS.fg, TOKENS.surface)}`);
assert.ok(contrastRatio(TOKENS.fgSoft, TOKENS.surface) >= 4.5, `soft text`);
assert.ok(contrastRatio(TOKENS.fgMuted, TOKENS.surface) >= 4.5, `muted text`);

console.log('14a area colors…');
const areaTable = [];
for (const [id, { hex, label }] of Object.entries(FOCUS_AREA_COLORS)) {
  const ratio = contrastRatio(hex, AREA_SURFACE);
  assert.ok(ratio >= 3, `${id} ${hex} ratio ${ratio}`);
  areaTable.push({ id, hex, label, ratio: Number(ratio.toFixed(2)) });
}
// Distinctness: no two identical hex
assert.equal(new Set(areaTable.map((r) => r.hex)).size, areaTable.length);
console.log('COLOR_TABLE', JSON.stringify(areaTable));

console.log('14a glow lint…');
const cssFiles = [
  'mobile-app/styles/theme.css',
  'mobile-app/styles/components.css',
];
for (const rel of cssFiles) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  // Feed / card / button regions: fail on gold/colored glow or gradients in Task 14 selectors
  const feedish = src.match(/\.uac-compact[\s\S]{0,2500}|\.today-block__btn--primary[\s\S]{0,400}|\.agent-feed-add-panel[\s\S]{0,800}/g) || [];
  for (const chunk of feedish) {
    if (/linear-gradient|radial-gradient/i.test(chunk) && !/\/\*/.test(chunk.slice(0, 40))) {
      // Allow comments mentioning gradient
      if (/background:[^;]*gradient/i.test(chunk)) {
        throw new Error(`${rel} still has gradient fill in Feed/card CSS`);
      }
    }
    if (/box-shadow:[^;]*0\s+0\s+\d+px[^;]*246,\s*195,\s*106/i.test(chunk)) {
      throw new Error(`${rel} still has gold glow box-shadow on Feed/card`);
    }
  }
}
assert.ok(BANNED_USER_VOCAB.includes('On track'));
assert.ok(!findBannedVocab('Based on 1 answer').length);

const sw = fs.readFileSync(path.join(root, 'mobile-app/service-worker.js'), 'utf8');
const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
assert.ok(cacheMatch);
const cacheName = cacheMatch[1];
const about = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8');
assert.ok(about.includes(cacheName));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const apiHits = [];
page.on('request', (req) => {
  if (/\/api\//.test(req.url())) apiHits.push(req.url());
});
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
  localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {} }));
});
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1600);
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
await page.waitForTimeout(1200);

const empty = await page.evaluate(() => {
  const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
  const nav = document.querySelector('.bottom-nav, .app-navbar, #bottomNav, nav.mobile-nav, .mobile-nav');
  const navTop = nav?.getBoundingClientRect()?.top ?? 844;
  const cards = [...document.querySelectorAll('.universal-agent-card')];
  const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
  const fully = cards.filter((c) => {
    const r = c.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= navTop - 2;
  }).length;
  return {
    ask: card?.querySelector('[data-uac-ask]')?.textContent || '',
    chips: [...(card?.querySelectorAll('[data-uac-chip]') || [])].map((b) => b.textContent.trim()),
    rather: !!card?.querySelector('[data-uac-rather]'),
    hasNotAnswered: /Not answered yet/i.test(document.body.innerText || ''),
    hasSelfReported: /self-reported/i.test(document.body.innerText || ''),
    hasUpdated: /Updated \d/i.test(document.body.innerText || ''),
    heights,
    fully,
    glyph: !!card?.querySelector('[data-focus-area-glyph="sleep"]'),
  };
});
console.log('14a empty', JSON.stringify(empty));
assert.ok(/sleep/i.test(empty.ask), `ask ${empty.ask}`);
assert.ok(empty.chips.length >= 2 && empty.chips.length <= 4);
assert.equal(empty.rather, true);
assert.equal(empty.hasNotAnswered, false);
assert.equal(empty.hasSelfReported, false);
assert.equal(empty.hasUpdated, false);
assert.ok(empty.glyph);
assert.ok(empty.heights.every((h) => h >= 130 && h <= 180), `heights ${empty.heights}`);
assert.ok(empty.fully >= 3, `need ≥3 cards visible, got ${empty.fully}`);

const logBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').length);
const apiBefore = apiHits.length;
await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-chip]');
await page.waitForTimeout(500);

const afterTap = await page.evaluate(() => {
  const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
  const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
  return {
    value: card?.querySelector('[data-uac-value]')?.textContent || '',
    meta: card?.querySelector('[data-uac-meta]')?.textContent || '',
    payoff: card?.querySelector('[data-uac-payoff-inline]')?.textContent || '',
    sleepDuration: profile?.lifestyle?.sleepDuration || null,
    logLen: JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').length,
    sidebar: document.getElementById('profileNextStep')?.textContent || document.querySelector('[data-next-step]')?.textContent || '',
  };
});
console.log('14a afterTap', JSON.stringify(afterTap));
assert.ok(afterTap.sleepDuration, 'canonical sleepDuration missing');
assert.ok(/Based on 1 answer/i.test(afterTap.meta));
assert.ok(afterTap.value);
assert.ok(afterTap.payoff);
assert.equal(afterTap.logLen, logBefore, 'chip wrote data-sent-log');
assert.equal(apiHits.length, apiBefore, 'chip triggered API');

// Same value via Talk path check: normalize already applied
assert.ok(['<6h', '6-7h', '7-8h', '8h+'].includes(afterTap.sleepDuration) || afterTap.sleepDuration === 'prefer-not-say');

await page.screenshot({
  path: path.join(outDir, 'task14-14a-after-tap-390.png'),
  clip: { x: 0, y: 0, width: 390, height: 844 },
  timeout: 8000,
}).catch(() => {});

await browser.close();
console.log('OK verify-task14a', cacheName);
