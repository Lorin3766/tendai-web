/**
 * Task 13 Step 0 — measure Feed layout at phone widths.
 * Usage: OBRIUM_URL=http://127.0.0.1:5500 node scripts/task13-step0-measure.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const WIDTHS = [360, 390, 412];
const VH = 844;

const browser = await chromium.launch({ headless: true });

for (const mode of ['browser', 'standalone']) {
  for (const w of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: w, height: VH },
      isMobile: true,
      hasTouch: true,
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
            dispatchEvent() {
              return false;
            },
          }),
        });
      });
    }
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
    });
    await page.waitForTimeout(1000);

    const m = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav, .app-navbar, #bottomNav, nav.mobile-nav, .mobile-nav');
      const today = document.querySelector('.today-block, #todayBlock, [data-today-block]');
      const cards = [...document.querySelectorAll('.universal-agent-card')];
      const addBtn = document.querySelector('.agent-feed-add-panel, #agentFeedAddBtn, .add-agent-button');
      const navTop = nav?.getBoundingClientRect()?.top ?? VH;
      const fullyVisible = cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= navTop - 4;
      }).length;
      const card0 = cards[0]?.getBoundingClientRect();
      const todayR = today?.getBoundingClientRect();
      const last = cards[cards.length - 1]?.getBoundingClientRect();
      const addR = addBtn?.getBoundingClientRect();
      const strings = cards[0]
        ? [...cards[0].querySelectorAll('h3, span, p, button, time, .heart-agent-module__agent-code')]
            .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
        : [];
      return {
        fullyVisible,
        cardH: card0 ? Math.round(card0.height) : null,
        todayH: todayR ? Math.round(todayR.height) : null,
        lastBottom: last ? Math.round(last.bottom) : null,
        addBottom: addR ? Math.round(addR.bottom) : null,
        navTop: Math.round(navTop),
        lastClippedByAdd: !!(last && addR && last.bottom > addR.top && last.top < addR.bottom),
        lastClippedByNav: !!(last && last.bottom > navTop),
        addClippedByNav: !!(addR && addR.bottom > navTop),
        cardCount: cards.length,
        strings,
        todayText: today?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 120) || '',
      };
    });
    console.log(JSON.stringify({ mode, w, ...m }));
    await context.close();
  }
}

await browser.close();
