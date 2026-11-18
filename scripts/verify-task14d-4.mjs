/**
 * Task 14d-4 — short payoff; filled+next-ask ≤ ~220 px at 390.
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { assembleTalkPayoff } from '../mobile-app/js/features/talk/talk-payoff.js';
import { nextCardQuestion } from '../mobile-app/js/features/feed/card-tap-answer.js';

const payoff = assembleTalkPayoff({
  echoRaw: '7–8h',
  value: '7-8h',
  profile: { lifestyle: { sleepDuration: '7-8h' } },
  answeredPath: 'lifestyle.sleepDuration',
  answeredFieldKey: 'sleepDuration',
  nextQuestion: { path: 'lifestyle.sleepQuality' },
  changedAreaIds: ['sleep'],
  claimLine: 'Added to your Sleep & Recovery card.',
});
assert.equal(payoff.lines.length, 1);
assert.match(payoff.lines[0], /^Saved: 7–8h\. I now know 1 thing about your Sleep\./);
assert.ok(!/Added to your|Based on/i.test(payoff.lines[0]));
assert.ok(/sleep|feel|Next/i.test(payoff.nextAskHint || ''), payoff.nextAskHint);

const nq = nextCardQuestion({ lifestyle: { sleepDuration: '7-8h' } }, 'sleep');
assert.ok(nq && /Next|feel|quality/i.test(nq.ask), nq?.ask);

const browser = await chromium.launch({ headless: true });
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
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1400);
await page.evaluate(async () => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.getElementById('centerBody')?.classList.add('view-feed');
  try {
    (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
  } catch (_) {}
  window.switchView?.('feed');
  window.renderAgentReportsSection?.();
});
await page.waitForTimeout(900);
await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-chip]');
await page.waitForTimeout(600);

const m = await page.evaluate(() => {
  const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
  return {
    h: Math.round(card.getBoundingClientRect().height),
    value: card.querySelector('[data-uac-value]')?.textContent || '',
    meta: card.querySelector('[data-uac-meta]')?.textContent || '',
    payoff: card.querySelector('[data-uac-payoff-inline]')?.textContent || '',
    ask: card.querySelector('[data-uac-ask]')?.textContent || '',
    chips: [...card.querySelectorAll('[data-uac-chip]')].map((b) => b.textContent.trim()),
  };
});
console.log('14d-4 HEIGHTS_FILLED_390', JSON.stringify(m));
assert.ok(m.h <= 220, `filled+ask ${m.h} > 220`);
assert.ok(/Saved:/.test(m.payoff) && /I now know/i.test(m.payoff), m.payoff);
assert.ok(/Based on 1 answer/i.test(m.meta), m.meta);
assert.ok(!/Based on 1 of your answers/i.test(m.payoff), m.payoff);
assert.ok(m.chips.length >= 4, `scale chips ${JSON.stringify(m.chips)}`);
assert.ok(/Next|feel/i.test(m.ask), m.ask);

await browser.close();
console.log('OK verify-task14d-4');
