/**
 * Task 14c-3 — chips only for choice/scale; multi → Answer in Talk.
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { FOCUS_AREA_SIGNALS } from '../mobile-app/js/features/profile/focus-area-signals.js';
import { getProfileFieldSpec } from '../mobile-app/js/features/talk/profile-answer-parser.js';
import { nextCardQuestion } from '../mobile-app/js/features/feed/card-tap-answer.js';

const withChips = [];
const withoutChips = [];
for (const [areaId, signals] of Object.entries(FOCUS_AREA_SIGNALS)) {
  for (const sig of signals) {
    const path = `${sig.section}.${sig.field}`;
    if (sig.section === 'location') {
      withoutChips.push({ path, areaId, reason: 'settings-city' });
      continue;
    }
    const spec = getProfileFieldSpec(sig.section, sig.field);
    const q = nextCardQuestion({ lifestyle: {}, body: {}, health: {}, mind: {}, goals: {} }, areaId);
    // nextCardQuestion returns the first unanswered for the area — probe by clearing others is hard;
    // classify by spec type instead.
    if (spec?.type === 'choice' || spec?.type === 'scale') {
      withChips.push({ path, areaId, type: spec.type });
    } else {
      withoutChips.push({ path, areaId, type: spec?.type || 'none', reason: 'not-choice-or-scale' });
    }
  }
}
console.log('FIELDS_WITH_CHIPS', JSON.stringify(withChips, null, 2));
console.log('FIELDS_WITHOUT_CHIPS', JSON.stringify(withoutChips, null, 2));
assert.ok(withChips.some((f) => f.path === 'lifestyle.sleepDuration'));
assert.ok(withoutChips.some((f) => f.path === 'health.supplements'));
assert.ok(withoutChips.some((f) => f.path === 'goals.primaryGoals'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
  localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['longevity']));
  localStorage.setItem('tendai-profile-state', JSON.stringify({ health: {}, goals: {} }));
});
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1600);
await page.evaluate(async () => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  try {
    (await import('/js/features/settings/system-onboarding.js')).ensureOnboardingFocusAreasInFeed?.();
  } catch (_) {}
  window.switchView?.('feed');
  window.renderAgentReportsSection?.();
});
await page.waitForTimeout(1000);
const lon = await page.evaluate(() => {
  const card = document.querySelector('.universal-agent-card[data-focus-area-id="longevity"]');
  return {
    ask: card?.querySelector('[data-uac-ask]')?.textContent || '',
    chips: [...(card?.querySelectorAll('[data-uac-chip]') || [])].map((b) => b.textContent.trim()),
    talkBtn:
      card?.querySelector('[data-uac-ask-block] [data-uac-action="confidence-talk"]')?.textContent?.trim() ||
      '',
    rather: !!card?.querySelector('[data-uac-rather]'),
  };
});
console.log('14c-3 longevity', JSON.stringify(lon));
assert.ok(/supplements/i.test(lon.ask));
assert.equal(lon.chips.length, 0, 'multi must not show one-tap chips');
assert.ok(/Answer in Talk/i.test(lon.talkBtn));
assert.equal(lon.rather, true);

await browser.close();
console.log('OK verify-task14c-3');
