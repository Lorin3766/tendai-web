/**
 * Task 14d-3 — declined answers are stored but are not knowledge.
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { assembleTalkPayoff } from '../mobile-app/js/features/talk/talk-payoff.js';
import {
  compactAreaMetaLine,
  compactAreaValueHeadline,
  signalProgress,
  stageFloorFromSignals,
} from '../mobile-app/js/features/profile/focus-area-signals.js';
// —— Unit: payoff for decline ——
const declinedPayoff = assembleTalkPayoff({
  echoRaw: 'Rather not say',
  value: 'prefer-not-say',
  profile: { lifestyle: { sleepDuration: 'prefer-not-say' } },
  answeredPath: 'lifestyle.sleepDuration',
  answeredFieldKey: 'sleepDuration',
  nextQuestion: { path: 'lifestyle.sleepQuality', sectionKey: 'lifestyle', fieldKey: 'sleepQuality' },
  changedAreaIds: ['sleep'],
  claimLine: 'Added to your Sleep & Recovery card.',
});
assert.equal(declinedPayoff.declined, true);
assert.deepEqual(declinedPayoff.lines, ['Okay, skipped.']);
assert.equal(declinedPayoff.sourceLine, '');
const blob = declinedPayoff.lines.join(' ');
assert.ok(!/I know|Added to your|You said|Rather not say|that sleep/i.test(blob), blob);

// Real answer still gets knowledge lines
const real = assembleTalkPayoff({
  echoRaw: '<6h',
  value: '<6h',
  profile: { lifestyle: { sleepDuration: '<6h' } },
  answeredPath: 'lifestyle.sleepDuration',
  answeredFieldKey: 'sleepDuration',
  nextQuestion: { path: 'lifestyle.sleepQuality' },
  changedAreaIds: ['sleep'],
  claimLine: 'Added to your Sleep & Recovery card.',
});
assert.equal(real.declined, false);
assert.ok(real.lines.some((l) => /Saved:/i.test(l)), real.lines.join(' | '));
assert.ok(real.lines.some((l) => /I now know 1 thing/i.test(l)), real.lines.join(' | '));

// Progress / stage ignore declines
const declinedProfile = { lifestyle: { sleepDuration: 'prefer-not-say' } };
assert.equal(signalProgress(declinedProfile, 'sleep').n, 0);
assert.equal(stageFloorFromSignals(declinedProfile, 'sleep'), 0);
assert.equal(compactAreaValueHeadline(declinedProfile, 'sleep'), '');
assert.equal(compactAreaMetaLine(declinedProfile, 'sleep'), '');

const knownProfile = { lifestyle: { sleepDuration: '7-8h' } };
assert.equal(signalProgress(knownProfile, 'sleep').n, 1);
assert.equal(stageFloorFromSignals(knownProfile, 'sleep'), 1);

// —— Browser: Feed rather path ——
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
await page.click('.universal-agent-card[data-focus-area-id="sleep"] [data-uac-rather]');
await page.waitForTimeout(600);

const live = await page.evaluate(() => {
  const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
  const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
  return {
    stored: profile?.lifestyle?.sleepDuration || null,
    value: card?.querySelector('[data-uac-value]')?.textContent || '',
    meta: card?.querySelector('[data-uac-meta]')?.textContent || '',
    payoff: card?.querySelector('[data-uac-payoff-inline]')?.textContent || '',
    ask: card?.querySelector('[data-uac-ask]')?.textContent || '',
    body: (card?.innerText || '').replace(/\s+/g, ' '),
  };
});
console.log('14d-3 live', JSON.stringify(live));
assert.equal(live.stored, 'prefer-not-say', 'decline must still be stored');
assert.ok(/Okay, skipped/i.test(live.payoff), `payoff ${live.payoff}`);
assert.ok(!/I know|Added to your|You said|Rather not say/i.test(live.payoff), live.payoff);
assert.ok(!/Prefer not to say/i.test(live.value), `value headline ${live.value}`);
assert.ok(!/Based on \d+ answer/i.test(live.meta), `meta ${live.meta}`);
assert.ok(/quality|1.?5/i.test(live.ask), `next ask should advance: ${live.ask}`);
assert.ok(!/that sleep/i.test(live.body), live.body);

await browser.close();
console.log('OK verify-task14d-3');
