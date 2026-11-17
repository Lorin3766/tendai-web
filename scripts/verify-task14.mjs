/**
 * Task 14a — flat Feed, area colors, tap-to-answer cards (+ follow-up wrap).
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
const textContrast = [
  { role: 'primary', color: TOKENS.fg, surface: TOKENS.surface, size: '15–16px card ask / value', min: 7 },
  { role: 'secondary', color: TOKENS.fgSoft, surface: TOKENS.surface, size: '14px rather / payoff / soft meta', min: 4.5 },
  { role: 'muted', color: TOKENS.fgMuted, surface: TOKENS.surface, size: '13px Add Focus / muted labels', min: 4.5 },
].map((row) => ({
  ...row,
  ratio: Number(contrastRatio(row.color, row.surface).toFixed(2)),
}));
for (const row of textContrast) {
  assert.ok(row.ratio >= row.min, `${row.role} ${row.ratio} < ${row.min}`);
}
console.log('TEXT_CONTRAST', JSON.stringify(textContrast, null, 2));

console.log('14a area colors…');
const areaTable = [];
for (const [id, { hex, label }] of Object.entries(FOCUS_AREA_COLORS)) {
  const ratio = contrastRatio(hex, AREA_SURFACE);
  assert.ok(ratio >= 3, `${id} ${hex} ratio ${ratio}`);
  areaTable.push({ id, hex, label, ratio: Number(ratio.toFixed(2)) });
}
assert.equal(new Set(areaTable.map((r) => r.hex)).size, areaTable.length);
console.log('COLOR_TABLE', JSON.stringify(areaTable));

const GLOW_REMOVED = [
  '--glow-gold: none',
  '--gold-glow: transparent (incl. weather-mood overrides)',
  '--gold-aura: transparent',
  '--shadow-gold-glow: none',
  '--obrium-aura-sand-matte: transparent',
  '--obrium-glow-primary: none',
  '--obrium-glow-accent: none',
  '--obrium-aura-cyan-row: none',
  '--obrium-aura-cyan-check: none',
  '--obrium-aura-sector-ring: none',
  '--obrium-aura-sector-label: none',
  '--obrium-aura-deploy-btn: none',
  '--obrium-aura-hardware-gold: none (default; graphite keeps flat dark inset only)',
  '--obrium-filter-calendar-svg: none',
  '--obrium-filter-calendar-hover: none',
  '--obrium-filter-labs-marker: none',
  '--obrium-filter-agent-sparkline: none',
  '--obrium-filter-agent-icon-null: none',
  '--obrium-filter-agent-icon-active: none',
  '--obrium-filter-sensor-value: none',
  '--obrium-filter-phai-icon-selected: saturate only (no glow)',
  '--obrium-filter-phai-text-selected: none',
  '--obrium-filter-phai-option-body: none',
  '--obrium-filter-feed-card-line: none',
  '--gold-gradient: flat #f6c36a (no gradient fill)',
  '--agent-card-bg: flat #1c1a17 (no linear-gradient)',
  '.uac-compact / chips / Today primary: box-shadow none, no gold glow',
  '.agent-feed-add-panel: transparent outline, box-shadow none',
];
console.log('GLOW_REMOVED', JSON.stringify(GLOW_REMOVED, null, 2));

console.log('14a glow lint…');
const cssFiles = [
  'mobile-app/styles/theme.css',
  'mobile-app/styles/components.css',
];
for (const rel of cssFiles) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const feedish =
    src.match(
      /\.uac-compact[\s\S]{0,2500}|\.today-block__btn--primary[\s\S]{0,400}|\.agent-feed-add-panel[\s\S]{0,800}/g,
    ) || [];
  for (const chunk of feedish) {
    if (/linear-gradient|radial-gradient/i.test(chunk) && !/\/\*/.test(chunk.slice(0, 40))) {
      if (/background:[^;]*gradient/i.test(chunk)) {
        throw new Error(`${rel} still has gradient fill in Feed/card CSS`);
      }
    }
    if (/box-shadow:[^;]*0\s+0\s+\d+px[^;]*246,\s*195,\s*106/i.test(chunk)) {
      throw new Error(`${rel} still has gold glow box-shadow on Feed/card`);
    }
  }
  // Chip row must wrap (no horizontal scroll)
  if (rel.endsWith('components.css')) {
    assert.ok(
      /\.uac-compact__chips\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/s.test(src) ||
        /\.uac-compact__chips\s*\{[^}]*flex-wrap:\s*wrap/s.test(src),
      'chips must wrap (grid 2-col or flex-wrap)',
    );
    assert.ok(!/\.uac-compact__chips\s*\{[^}]*overflow-x:\s*auto/s.test(src), 'chips must not overflow-x auto');
  }
}
console.log('14a glow lint PASS');
assert.ok(BANNED_USER_VOCAB.includes('On track'));
assert.ok(!findBannedVocab('Based on 1 answer').length);

const sw = fs.readFileSync(path.join(root, 'mobile-app/service-worker.js'), 'utf8');
const cacheMatch = sw.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
assert.ok(cacheMatch);
const cacheName = cacheMatch[1];
const about = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8');
assert.ok(about.includes(cacheName));

async function bootFeed(page) {
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
}

const browser = await chromium.launch({ headless: true });
const apiHits = [];

// —— 360 px: chips wrap, Rather not say visible, no horizontal scroll ——
{
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
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
  await bootFeed(page);

  const wrap = await page.evaluate(() => {
    const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
    const chipsEl = card?.querySelector('[data-uac-chips]');
    const chips = [...(card?.querySelectorAll('[data-uac-chip]') || [])];
    const rather = card?.querySelector('[data-uac-rather]');
    const chipRects = chips.map((b) => b.getBoundingClientRect());
    const ratherRect = rather?.getBoundingClientRect();
    const rows = new Set(chipRects.map((r) => Math.round(r.top)));
    const overflowX = chipsEl ? chipsEl.scrollWidth > chipsEl.clientWidth + 1 : false;
    const inView = (r) => r && r.left >= 0 && r.right <= 360 + 1 && r.width > 0 && r.height > 0;
    return {
      chipCount: chips.length,
      chipLabels: chips.map((b) => b.textContent.trim()),
      rows: rows.size,
      overflowX,
      chipsFullyVisible: chipRects.every(inView),
      ratherVisible: !!rather && inView(ratherRect) && /Rather not say/i.test(rather.textContent || ''),
      ratherText: rather?.textContent?.trim() || '',
    };
  });
  console.log('14a wrap360', JSON.stringify(wrap));
  assert.ok(wrap.chipCount >= 2 && wrap.chipCount <= 4, `chip count ${wrap.chipCount}`);
  assert.ok(wrap.rows >= 2 || wrap.chipCount <= 2, `expected wrap onto 2nd line, rows=${wrap.rows}`);
  assert.equal(wrap.overflowX, false, 'horizontal scroll on chips');
  assert.ok(wrap.chipsFullyVisible, 'chips clipped at 360');
  assert.ok(wrap.ratherVisible, `Rather not say not fully visible: ${wrap.ratherText}`);

  // Rather not say → same declined value as Talk
  await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-rather]');
  await page.waitForTimeout(400);
  const declined = await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
    const cards = [...document.querySelectorAll('.universal-agent-card')];
    const askCards = cards.filter((c) => c.querySelector('[data-uac-ask]'));
    const ratherOnAsks = askCards.every((c) => {
      const ask = c.querySelector('[data-uac-ask]');
      const settings = c.querySelector('[data-uac-calibration-settings]');
      if (settings) return true; // Settings-city has Open Settings, not a Talk field
      return !!c.querySelector('[data-uac-rather]');
    });
    return {
      sleepDuration: profile?.lifestyle?.sleepDuration || null,
      ratherOnAsks,
      askCount: askCards.length,
    };
  });
  console.log('14a rather', JSON.stringify(declined));
  assert.equal(declined.sleepDuration, 'prefer-not-say');
  assert.ok(declined.ratherOnAsks, 'Rather not say missing on a non-settings ask card');

  await page.screenshot({
    path: path.join(outDir, 'task14-14a-wrap-360.png'),
    clip: { x: 0, y: 0, width: 360, height: 800 },
    timeout: 8000,
  }).catch(() => {});
  await context.close();
}

// —— 390 px: heights, gold CTA, Add Focus outline, tab clearance, chip tap ——
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
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
  await bootFeed(page);

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
    const add = document.querySelector('.agent-feed-add-panel');
    const addCs = add ? getComputedStyle(add) : null;
    const primary = document.querySelector('.today-block__btn--primary');
    const primaryCs = primary ? getComputedStyle(primary) : null;
    const goldish = (bg) => /246,\s*195,\s*106|#f6c36a/i.test(bg || '');
    const isTransparentBg = (bg) =>
      !bg ||
      bg === 'transparent' ||
      /rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/i.test(bg);
    const filledGold = [...document.querySelectorAll('button, a, .btn')].filter((el) => {
      if (el.closest('#obriumReloadBar')) return false; // upgrade bar is not Feed chrome
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      if (r.bottom < 0 || r.top > 844) return false;
      const cs = getComputedStyle(el);
      return goldish(cs.backgroundColor);
    });
    const list = document.querySelector('.agent-reports-list');
    let lastClears = false;
    if (list && add && nav) {
      const before = list.scrollTop;
      list.scrollTop = list.scrollHeight;
      const addBottom = add.getBoundingClientRect().bottom;
      lastClears = addBottom <= navTop - 2;
      list.scrollTop = before;
    }
    const chip = card?.querySelector('[data-uac-chip]');
    const chipCs = chip ? getComputedStyle(chip) : null;
    const rather = card?.querySelector('[data-uac-rather]');
    const ratherCs = rather ? getComputedStyle(rather) : null;
    const glyph = card?.querySelector('[data-focus-area-glyph="sleep"]');
    const glyphCs = glyph ? getComputedStyle(glyph) : null;
    const askCs = card?.querySelector('[data-uac-ask]')
      ? getComputedStyle(card.querySelector('[data-uac-ask]'))
      : null;
    const areaToken = glyph ? getComputedStyle(glyph).getPropertyValue('--area-color').trim() : '';
    return {
      ask: card?.querySelector('[data-uac-ask]')?.textContent || '',
      chips: [...(card?.querySelectorAll('[data-uac-chip]') || [])].map((b) => b.textContent.trim()),
      rather: !!rather,
      hasNotAnswered: /Not answered yet/i.test(document.body.innerText || ''),
      hasSelfReported: /self-reported/i.test(document.body.innerText || ''),
      hasUpdated: /Updated \d/i.test(document.body.innerText || ''),
      heights,
      fully,
      glyph: !!glyph,
      // Computed styles — must fail on founder stale-CSS screenshot (white chips / no glyph fill)
      chipBg: chipCs?.backgroundColor || '',
      chipColor: chipCs?.color || '',
      chipFontPx: chipCs ? parseFloat(chipCs.fontSize) : 0,
      chipMinH: chip ? chip.getBoundingClientRect().height : 0,
      chipWhiteDefault:
        chipCs?.backgroundColor === 'rgb(240, 240, 240)' && chipCs?.color === 'rgb(0, 0, 0)',
      ratherBg: ratherCs?.backgroundColor || '',
      ratherDecoration: ratherCs?.textDecorationLine || ratherCs?.textDecoration || '',
      glyphBg: glyphCs?.backgroundColor || '',
      glyphRadius: glyphCs?.borderRadius || '',
      areaToken,
      askColor: askCs?.color || '',
      askFontPx: askCs ? parseFloat(askCs.fontSize) : 0,
      addBg: addCs?.backgroundColor || '',
      addBorder: addCs?.borderTopWidth || '',
      addOutlined: isTransparentBg(addCs?.backgroundColor) && parseFloat(addCs?.borderTopWidth || '0') >= 1,
      primaryBg: primaryCs?.backgroundColor || '',
      primaryIsGold: goldish(primaryCs?.backgroundColor || ''),
      filledGoldCount: filledGold.length,
      filledGoldLabels: filledGold.map((el) => (el.textContent || '').trim().slice(0, 40)),
      lastClears,
      navTop,
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
  assert.equal(empty.chipWhiteDefault, false, 'chip looks like browser default white (stale CSS)');
  assert.ok(
    empty.chipBg === 'rgba(0, 0, 0, 0)' || /rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/i.test(empty.chipBg),
    `chip bg should be transparent outline, got ${empty.chipBg}`,
  );
  assert.ok(empty.chipFontPx >= 14, `chip font ${empty.chipFontPx}`);
  assert.ok(empty.chipMinH >= 44, `chip height ${empty.chipMinH}`);
  assert.ok(/underline/i.test(empty.ratherDecoration), 'Rather not say should be text link, not a box');
  assert.ok(empty.glyphBg && empty.glyphBg !== 'rgba(0, 0, 0, 0)', `glyph circle missing fill: ${empty.glyphBg}`);
  assert.ok(/50%|999px|16px/.test(empty.glyphRadius), `glyph not circular: ${empty.glyphRadius}`);
  assert.ok(/#?8[Bb]9[Cc][Ff][Ff]|139,\s*156,\s*255/i.test(empty.areaToken) || empty.areaToken === '#8B9CFF', `sleep area token ${empty.areaToken}`);
  assert.ok(empty.askFontPx >= 15, `ask size ${empty.askFontPx}`);
  assert.ok(/247,\s*243,\s*238|#f7f3ee/i.test(empty.askColor) || /f7f3ee/i.test(empty.askColor), `ask color ${empty.askColor}`);
  // Wrap adds a second chip row — allow taller empty cards than the single-row 140–170 budget
  assert.ok(empty.heights.every((h) => h >= 130 && h <= 260), `heights ${empty.heights}`);
  assert.ok(empty.fully >= 2, `need ≥2 cards visible above tab, got ${empty.fully}`);
  assert.ok(empty.addOutlined, `Add Focus should be outlined, got bg=${empty.addBg} border=${empty.addBorder}`);
  assert.ok(empty.primaryIsGold, `Today primary not gold: ${empty.primaryBg}`);
  assert.ok(
    empty.filledGoldCount === 1,
    `expected one filled gold button, got ${empty.filledGoldCount}: ${JSON.stringify(empty.filledGoldLabels)}`,
  );
  assert.ok(empty.lastClears, 'last card / Add Focus does not clear tab bar when scrolled to end');

  const logBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]').length);
  const apiBefore = apiHits.length;
  // Reset sleep so chip tap can write a real value (rather already used in other context)
  await page.evaluate(() => {
    localStorage.setItem('tendai-profile-state', JSON.stringify({ lifestyle: {} }));
  });
  await page.evaluate(async () => {
    try {
      const mod = await import('/js/features/settings/system-onboarding.js');
      mod.ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    window.renderAgentReportsSection?.();
  });
  await page.waitForTimeout(800);
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
    };
  });
  console.log('14a afterTap', JSON.stringify(afterTap));
  assert.ok(afterTap.sleepDuration, 'canonical sleepDuration missing');
  assert.ok(/Based on 1 answer/i.test(afterTap.meta));
  assert.ok(afterTap.value);
  assert.ok(afterTap.payoff);
  assert.equal(afterTap.logLen, logBefore, 'chip wrote data-sent-log');
  assert.equal(apiHits.length, apiBefore, 'chip triggered API');
  assert.ok(
    ['<6h', '6-7h', '7-8h', '8h+', 'prefer-not-say'].includes(afterTap.sleepDuration),
  );

  await page.screenshot({
    path: path.join(outDir, 'task14-14a-after-tap-390.png'),
    clip: { x: 0, y: 0, width: 390, height: 844 },
    timeout: 8000,
  }).catch(() => {});
  await context.close();
}

await browser.close();
console.log('OK verify-task14a', cacheName);
