/**
 * Task 12 screenshots: Talk payoff + Feed layout at 360/390/412, browser + standalone.
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/task12-screenshots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

const WIDTHS = [360, 390, 412];
const VH = 844;

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
  });
}

async function seedFresh(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
  });
}

async function answerTalk(page, text) {
  const input = page.locator('#chatInput, .talk-input, textarea, input[type="text"]').first();
  await input.fill(text);
  const send = page.locator('#sendBtn, .talk-send, button[aria-label*="Send"], button:has-text("Send")').first();
  if (await send.count()) await send.click();
  else await input.press('Enter');
  await page.waitForTimeout(900);
}

async function capture(page, name, w) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: VH } });
  console.log('shot', name);
  return file;
}

async function layoutCheck(page) {
  return page.evaluate(() => {
    const footer = document.querySelector('.app-footer');
    const nav = document.querySelector('.bottom-nav, .app-navbar, #bottomNav, nav.mobile-nav');
    const header = document.querySelector('.feed-section-title, .agent-feed-header, h3.card-title');
    const firstCard = document.querySelector('.universal-agent-card');
    const footerStyle = footer ? getComputedStyle(footer) : null;
    const footerVisible = footer && footerStyle && footerStyle.display !== 'none' && footerStyle.visibility !== 'hidden';
    let footerOverlapsNav = false;
    if (footerVisible && nav) {
      const fr = footer.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      footerOverlapsNav = fr.bottom > nr.top && fr.top < nr.bottom;
    }
    let headerOverlapsCard = false;
    if (header && firstCard) {
      const hr = header.getBoundingClientRect();
      const cr = firstCard.getBoundingClientRect();
      headerOverlapsCard = hr.bottom > cr.top + 2 && hr.top < cr.bottom;
    }
    const banned = /Human OS|Adaptive agent feed|Manual Baseline|Calibration:|Confirm — I want to prioritize/i;
    const bodyText = document.body?.innerText || '';
    return {
      footerVisible: !!footerVisible,
      footerOverlapsNav,
      headerOverlapsCard,
      bannedHits: banned.test(bodyText),
      knowledge: [...document.querySelectorAll('[data-uac-knowledge], .uac-knowledge')].map((el) => el.textContent.trim()).slice(0, 3),
      payoffSample: [...document.querySelectorAll('.message.bot .message-text')].slice(-3).map((el) => el.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const results = [];

// --- 390 Talk: answer 3 questions in a row (payoff) ---
{
  const context = await browser.newContext({
    viewport: { width: 390, height: VH },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'ok' }) }),
  );
  await seedFresh(page);
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  await page.evaluate(() => window.switchView?.('talk'));
  await page.waitForTimeout(1200);
  await capture(page, 'task12-talk-open-390.png', 390);

  // Three answers in a row: forgiving hours, then scale taps / prefer-not
  await answerTalk(page, '7 or 8');
  await page.waitForTimeout(800);
  const scaleTap = page.locator('.talk-clarify-option, .message-quick-reply, [data-profile-option]').filter({ hasText: /^4$/ }).first();
  if (await scaleTap.count()) await scaleTap.click();
  else await answerTalk(page, '4');
  await page.waitForTimeout(800);
  const prefer = page.locator('.talk-clarify-option, .message-quick-reply, [data-profile-option]').filter({ hasText: /rather not|prefer not|Skip/i }).first();
  if (await prefer.count()) await prefer.click();
  else await answerTalk(page, "I'd rather not say");
  await page.waitForTimeout(900);
  await capture(page, 'task12-talk-payoff-390.png', 390);
  const talkCheck = await layoutCheck(page);
  results.push({ view: 'talk-390', ...talkCheck });

  // Seed 7 days check-in history (storage shape used by getObriumCheckinHistory)
  const factual = await page.evaluate(async () => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: key, sleepHours: 6 + (i % 3) });
    }
    localStorage.setItem('tendai_checkin_history_v1', JSON.stringify({ days }));
    const mod = await import(new URL('./js/features/talk/talk-payoff.js', location.href).href);
    return mod.factualHistoryLine('sleepHours');
  });
  console.log('factualHistoryLine:', factual);
  if (!/You logged sleep on 7 of the last 7 days/.test(factual || '')) {
    console.warn('factual line unexpected:', factual);
  }

  await page.evaluate(() => window.switchView?.('feed'));
  await page.waitForTimeout(1200);
  await capture(page, 'task12-feed-after-answers-390.png', 390);
  results.push({ view: 'feed-390-after', ...(await layoutCheck(page)) });
  await context.close();
}

// Layout matrix: widths × display modes
for (const w of WIDTHS) {
  for (const mode of ['browser', 'standalone']) {
    const context = await browser.newContext({
      viewport: { width: w, height: VH },
      isMobile: true,
      hasTouch: true,
      ...(mode === 'standalone'
        ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
        : {}),
    });
    const page = await context.newPage();
    if (mode === 'standalone') {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          value: (q) => ({
            matches: String(q).includes('display-mode: standalone'),
            media: q,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          }),
        });
      });
    }
    await seedFresh(page);
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1400);
    await dismissOverlays(page);
    await page.evaluate(() => {
      localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
      window.switchView?.('feed');
      window.renderAgentReportsSection?.();
    });
    await page.waitForTimeout(900);
    const name = `task12-feed-${mode}-${w}.png`;
    await capture(page, name, w);
    const check = await layoutCheck(page);
    results.push({ view: name, ...check });
    if (check.footerVisible || check.footerOverlapsNav || check.bannedHits) {
      console.warn('LAYOUT ISSUE', name, check);
    }
    await context.close();
  }
}

await browser.close();
console.log('LAYOUT_RESULTS', JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.footerVisible || r.footerOverlapsNav || r.bannedHits);
if (bad.length) {
  console.error('FAIL layout/vocab', bad);
  process.exit(1);
}
console.log('OK task12-screenshots');
