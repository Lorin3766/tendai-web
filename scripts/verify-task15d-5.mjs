/**
 * Task 15d-5 — TIP label on library lines (neutral muted, contrast, heights).
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

function relLuminance(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  const toLin = (c) => {
    const s = Number(c) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [toLin(m[1]), toLin(m[2]), toLin(m[3])];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  if (L1 == null || L2 == null) return 0;
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function seedAndBoot(
  page,
  // Both sleep signals answered → no next-ask chips; collapsed library + TIP visible.
  profile = { lifestyle: { sleepDuration: '7-8h', sleepQuality: 4 } },
) {
  await page.addInitScript((p) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(p));
  }, profile);
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
  });
  await page.waitForTimeout(900);
}

async function measure(page) {
  return page.evaluate(() => {
    const sleep = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
    const tip = sleep?.querySelector('[data-uac-tip-label]');
    const tipCs = tip ? getComputedStyle(tip) : null;
    const card = sleep;
    const cardCs = card ? getComputedStyle(card) : null;
    const ask = sleep?.querySelector('[data-uac-ask]');
    const askTip = ask?.closest('.uac-compact__ask')?.querySelector('[data-uac-tip-label]');
    const today = document.querySelector('.today-block');
    const todayTip = today?.querySelector('[data-uac-tip-label], .uac-compact__tip-label');
    const add = document.querySelector('.agent-feed-add-panel');
    const list = document.querySelector('.agent-reports-list');
    let lastClears = false;
    if (list && add) {
      const before = list.scrollTop;
      list.scrollTop = list.scrollHeight;
      const cards = [...document.querySelectorAll('.universal-agent-card')];
      const last = cards[cards.length - 1];
      lastClears = last ? last.getBoundingClientRect().bottom <= add.getBoundingClientRect().top - 2 : false;
      list.scrollTop = before;
    }
    // Expand sleep card if possible
    const toggle = sleep?.querySelector('[data-uac-expand-toggle]');
    return {
      tipText: tip?.textContent?.trim() || '',
      tipFontPx: tipCs ? parseFloat(tipCs.fontSize) : 0,
      tipColor: tipCs?.color || '',
      tipLetter: tipCs?.letterSpacing || '',
      cardBg: cardCs?.backgroundColor || '',
      cardH: card ? Math.round(card.getBoundingClientRect().height) : 0,
      askHasTip: !!askTip,
      todayHasTip: !!todayTip,
      lastClears,
      hasToggle: !!toggle,
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const heights = {};

for (const w of [360, 390, 412, 1280]) {
  const context = await browser.newContext({
    viewport: { width: w, height: w >= 1280 ? 800 : 844 },
    isMobile: w < 900,
    hasTouch: w < 900,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await seedAndBoot(page);
  const info = await measure(page);
  assert.equal(info.tipText, 'TIP', `${w}: missing TIP label`);
  assert.ok(info.tipFontPx >= 14, `${w}: tip font ${info.tipFontPx}`);
  assert.ok(parseFloat(info.tipLetter) > 0 || /em|px/.test(info.tipLetter), `${w}: letter-spacing ${info.tipLetter}`);
  const ratio = contrastRatio(info.tipColor, info.cardBg);
  assert.ok(ratio >= 4.5, `${w}: tip contrast ${ratio.toFixed(2)} (${info.tipColor} on ${info.cardBg})`);
  assert.equal(info.askHasTip, false, `${w}: TIP on question`);
  assert.equal(info.todayHasTip, false, `${w}: TIP on Today`);
  assert.equal(info.hOverflow, false, `${w}: overflow`);
  assert.ok(info.lastClears, `${w}: last card must clear Add Focus`);
  heights[w] = info.cardH;
  console.log(`15d-5 ${w}: tip ok contrast=${ratio.toFixed(2)} cardH=${info.cardH}`);

  if (info.hasToggle) {
    await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-expand-toggle]');
    await page.waitForTimeout(300);
    const expandedTip = await page.evaluate(() => {
      const panel = document.querySelector(
        '.universal-agent-card[data-focus-area-id="sleep"] [data-uac-expand-panel]',
      );
      const tip = panel?.querySelector('[data-uac-tip-label]');
      return tip?.textContent?.trim() || '';
    });
    assert.equal(expandedTip, 'TIP', `${w}: expanded missing TIP`);
  }

  if (w === 390 || w === 1280) {
    await page.screenshot({
      path: path.join(outDir, `task15d-feed-tip-${w}.png`),
      clip: { x: 0, y: 0, width: w, height: Math.min(844, w >= 1280 ? 800 : 844) },
    });
  }
  await context.close();
}

await browser.close();
console.log('HEIGHTS', JSON.stringify(heights));
console.log('OK verify-task15d-5');
