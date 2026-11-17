/**
 * Task 14c-7 — render check at 390 and 1280 for key Feed/Talk states.
 * Saves baselines under mobile-app/_audit/baselines/ and compares on re-run.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const baseDir = path.join(root, 'mobile-app', '_audit', 'baselines');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(baseDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

async function seed(page, extra = {}) {
  await page.addInitScript((x) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move', 'nutrition']));
    localStorage.setItem('tendai-profile-state', JSON.stringify(x.profile || { lifestyle: {} }));
    if (x.introEver) localStorage.setItem('tendai_talk_intro_ever_v1', '1');
  }, extra);
}

async function boot(page, view = 'feed') {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1400);
  await page.evaluate(async (v) => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    const body = document.getElementById('centerBody');
    if (body) {
      body.classList.remove('view-feed', 'view-talk');
      body.classList.add(v === 'talk' ? 'view-talk' : 'view-feed');
    }
    window.switchView?.(v);
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  }, view);
  await page.waitForTimeout(900);
}

function layoutAssert(info, label) {
  assert.equal(info.hOverflow, false, `${label}: horizontal overflow`);
  assert.equal(info.widerThanViewport, false, `${label}: element wider than viewport`);
  assert.ok(info.overlapCount === 0, `${label}: overlapping siblings ${info.overlapCount}`);
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    // Prefer the active pane; ignore 1–4px chrome/scrollbar noise on #col-center
    const rootEl =
      document.querySelector('#centerBody.view-talk .talk-view') ||
      document.querySelector('#centerBody.view-feed .feed-view') ||
      document.querySelector('#centerBody') ||
      document.body;
    const hOverflow = rootEl.scrollWidth > rootEl.clientWidth + 8;
    const nodes = [...document.querySelectorAll('.universal-agent-card, .today-block, .talk-view, .feed-view, .uac-chip, .agent-feed-add-panel, .message')];
    let widerThanViewport = false;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2) widerThanViewport = true;
    }
    let overlapCount = 0;
    const cards = [...document.querySelectorAll('.universal-agent-card')];
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i].getBoundingClientRect();
        const b = cards[j].getBoundingClientRect();
        const overlap = !(a.bottom <= b.top + 1 || b.bottom <= a.top + 1 || a.right <= b.left + 1 || b.right <= a.left + 1);
        if (overlap) overlapCount += 1;
      }
    }
    const chip = document.querySelector('.uac-chip');
    const chipCs = chip ? getComputedStyle(chip) : null;
    const feedVisible = !!document.querySelector('#centerBody.view-feed');
    const talkVisible = !!document.querySelector('#centerBody.view-talk');
    const feedAndTalk =
      feedVisible &&
      talkVisible &&
      (() => {
        const f = document.querySelector('.feed-view');
        const t = document.querySelector('.talk-view');
        if (!f || !t) return false;
        const fr = f.getBoundingClientRect();
        const tr = t.getBoundingClientRect();
        const fShown = fr.width > 40 && getComputedStyle(f).display !== 'none';
        const tShown = tr.width > 40 && getComputedStyle(t).display !== 'none';
        return fShown && tShown;
      })();
    return {
      hOverflow,
      widerThanViewport,
      overlapCount,
      chipWhiteDefault: chipCs?.backgroundColor === 'rgb(240, 240, 240)',
      feedAndTalkBothVisible: feedAndTalk,
      vw,
    };
  });
}

async function shot(page, name, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(300);
  const file = path.join(baseDir, `${name}-${w}.png`);
  const review = path.join(outDir, `task14c-${name}-${w}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: Math.min(h, 900) } }).catch(() => {});
  fs.copyFileSync(file, review);
  return file;
}

const browser = await chromium.launch({ headless: true });
const diffs = [];

async function runState(name, setup) {
  for (const w of [390, 1280]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: w === 390 ? 844 : 800 },
      isMobile: w < 900,
      hasTouch: w < 900,
    });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await setup(page, w);
    const info = await measure(page);
    console.log(`render ${name}@${w}`, JSON.stringify(info));
    layoutAssert(info, `${name}@${w}`);
    assert.equal(info.chipWhiteDefault, false, `${name}@${w} white chips`);
    assert.equal(info.feedAndTalkBothVisible, false, `${name}@${w} Feed+Talk both visible`);
    const file = await shot(page, name, w, w === 390 ? 844 : 800);
    const metaPath = file.replace(/\.png$/, '.json');
    const meta = { name, w, info, bytes: fs.statSync(file).size };
    if (fs.existsSync(metaPath)) {
      const prev = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const delta = Math.abs(meta.bytes - prev.bytes);
      if (delta > Math.max(2500, prev.bytes * 0.08)) {
        diffs.push({ name, w, delta, prev: prev.bytes, next: meta.bytes });
      }
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    await ctx.close();
  }
}

await runState('feed-empty', async (page) => {
  await seed(page);
  await boot(page, 'feed');
});

await runState('feed-after-tap', async (page) => {
  await seed(page);
  await boot(page, 'feed');
  await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-chip]');
  await page.waitForTimeout(500);
});

await runState('talk-pending', async (page) => {
  await seed(page, { introEver: true });
  await boot(page, 'talk');
  await page.waitForTimeout(1200);
});

await runState('talk-after-error', async (page) => {
  await seed(page, { introEver: true });
  await boot(page, 'talk');
  await page.evaluate(() => {
    const tc = window.__obriumTalkComponent;
    if (!tc) return;
    const el = tc.addMessageToChat("Obrium can't reach its server right now. Try again later.", 'ai');
    if (el) el.setAttribute('data-talk-error', '1');
  });
  await page.waitForTimeout(400);
});

await browser.close();
if (diffs.length) {
  console.log('BASELINE_DIFFS', JSON.stringify(diffs, null, 2));
} else {
  console.log('BASELINE_DIFFS none (first run or stable)');
}
console.log('OK verify-task14c-render');
