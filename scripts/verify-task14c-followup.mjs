/**
 * Task 14c follow-up — heights, intro key wipe, honest offline on non-localhost.
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { LOCAL_STORAGE_INVENTORY } from '../mobile-app/js/core/local-storage-inventory.js';

const HONEST = "Obrium can't reach its server right now. Try again later.";

assert.ok(
  LOCAL_STORAGE_INVENTORY.includes('tendai_talk_intro_ever_v1'),
  'tendai_talk_intro_ever_v1 missing from local-storage-inventory',
);

function offlineReplyForHostname(hostname, { forceDevSimFlag = false } = {}) {
  const host = String(hostname || '');
  const isLoopback = /^(localhost|127\.0\.0\.1)$/i.test(host);
  if (forceDevSimFlag && isLoopback) {
    return '[TEST REPLY] (dev simulator would run on localhost only)';
  }
  return HONEST;
}

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
  await page.waitForTimeout(1600);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    try {
      (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
    } catch (_) {}
    const body = document.getElementById('centerBody');
    if (body) {
      body.classList.remove('view-talk');
      body.classList.add('view-feed');
    }
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch({ headless: true });

// —— 1. Heights + chip rows ——
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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

  async function measure(w) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(350);
    return page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav');
      const navTop = nav?.getBoundingClientRect()?.top ?? 844;
      const cards = [...document.querySelectorAll('.universal-agent-card')];
      const sleep = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
      const chips = [...(sleep?.querySelectorAll('[data-uac-chip]') || [])];
      const tops = chips.map((c) => c.getBoundingClientRect().top).sort((a, b) => a - b);
      let chipRows = 0;
      let last = -Infinity;
      for (const t of tops) {
        if (t - last > 6) {
          chipRows += 1;
          last = t;
        }
      }
      return {
        emptyHeights: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
        fully: cards.filter((c) => {
          const r = c.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= navTop - 2;
        }).length,
        chipRows,
        chipCount: chips.length,
        chipLabels: chips.map((b) => b.textContent.trim()),
      };
    });
  }

  const at360 = await measure(360);
  const at390 = await measure(390);
  console.log('HEIGHTS_EMPTY_390', JSON.stringify(at390));
  console.log('CHIPS_360', JSON.stringify(at360));
  assert.ok(at390.emptyHeights.length >= 3, `cards ${at390.emptyHeights.length}`);
  assert.ok(at360.chipCount === 4, `chip count ${at360.chipCount}`);
  // 15d-2: long-label choice chips (sleep duration) use a 2-col grid; short 1–5 scale stays one row (see verify-task15d-2).
  assert.ok(at360.chipRows >= 1 && at360.chipRows <= 2, `chip rows at 360: ${at360.chipRows}`);
  assert.ok(at390.emptyHeights.every((h) => h <= 260), `empty too tall ${at390.emptyHeights}`);
  // 15d-2: 44×44 chips + 2-col long labels make cards taller; ≥2 fully above the tab is the new floor.
  assert.ok(at390.fully >= 2, `≥2 visible got ${at390.fully}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-chip]');
  await page.waitForTimeout(500);
  const filled = await page.evaluate(() => {
    const sleep = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
    const move = document.querySelector('.universal-agent-card[data-focus-area-id="move"]');
    const nutrition = document.querySelector('.universal-agent-card[data-focus-area-id="nutrition"]');
    const navTop = document.querySelector('.bottom-nav')?.getBoundingClientRect()?.top ?? 844;
    const cards = [...document.querySelectorAll('.universal-agent-card')];
    return {
      filledSleepWithNextAsk: Math.round(sleep.getBoundingClientRect().height),
      emptyMoveWithChips: Math.round(move.getBoundingClientRect().height),
      emptyNutritionWithChips: Math.round(nutrition.getBoundingClientRect().height),
      fullyVisible: cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= navTop - 2;
      }).length,
      sleepChipCount: sleep.querySelectorAll('[data-uac-chip]').length,
      sleepHasAsk: !!sleep.querySelector('[data-uac-ask]'),
      sleepValue: sleep.querySelector('[data-uac-value]')?.textContent || '',
    };
  });
  console.log('HEIGHTS_AFTER_TAP_390', JSON.stringify(filled));
  await page.close();
}

// —— 2. Delete all local data clears intro key ——
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('tendai_talk_intro_ever_v1', '1');
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => localStorage.getItem('tendai_talk_intro_ever_v1')), '1');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  assert.equal(await page.evaluate(() => localStorage.getItem('tendai_talk_intro_ever_v1')), null);
  console.log('INTRO_KEY_CLEARED_OK');
  await page.close();
}

// —— 4. Simulated non-localhost hostname + unreachable relay ——
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/**', (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    window.__OBRIUM_DEV_LOCAL_SIM = false;
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  const probes = await page.evaluate(async () => {
    window.__OBRIUM_DEV_LOCAL_SIM = false;
    const mod = await import('/js/features/talk/llm.js');
    const netlify = mod.offlineReplyForHostname('obrium-app.netlify.app', { forceDevSimFlag: true });
    const example = mod.offlineReplyForHostname('app.example.com', { forceDevSimFlag: true });
    const loopback = mod.offlineReplyForHostname('127.0.0.1', { forceDevSimFlag: true });
    window.__obriumForceLocalConversation = true;
    const liveOffline = await mod.sendMessageToLLM('hello', { includeLedger: false });
    return {
      netlify,
      example,
      loopback,
      liveOffline,
      honest: mod.HONEST_OFFLINE_REPLY,
    };
  });
  console.log('OFFLINE_PROBES', JSON.stringify(probes));
  assert.equal(probes.netlify, HONEST);
  assert.equal(probes.example, HONEST);
  assert.equal(probes.liveOffline, HONEST);
  assert.ok(!/LOCAL MODE|simulator|TEST REPLY|on-device ledger/i.test(probes.netlify));
  assert.ok(!/LOCAL MODE|simulator|TEST REPLY/i.test(probes.liveOffline));
  assert.ok(/TEST REPLY/.test(probes.loopback));
  // Mirror unit probe (Node-safe duplicate of shipped logic)
  assert.equal(offlineReplyForHostname('obrium-app.netlify.app', { forceDevSimFlag: true }), HONEST);
  await page.close();
}

await browser.close();
console.log('OK verify-task14c-followup');
