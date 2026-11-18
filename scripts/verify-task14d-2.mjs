/**
 * Task 14d-2 — every scale/choice field renders ALL options at 360 px (no slice).
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import {
  getClarifyTapOptions,
  listProfileFieldSpecs,
} from '../mobile-app/js/features/talk/profile-answer-parser.js';
import { nextCardQuestion } from '../mobile-app/js/features/feed/card-tap-answer.js';

const ALL = listProfileFieldSpecs();
const scaleAndChoice = Object.entries(ALL)
  .filter(([, spec]) => spec?.type === 'scale' || spec?.type === 'choice')
  .map(([path, spec]) => {
    const [section, field] = path.split('.');
    return { section, field, path, spec };
  });
assert.ok(scaleAndChoice.length >= 3, `expected scale/choice fields, got ${scaleAndChoice.length}`);

for (const { section, field, path, spec } of scaleAndChoice) {
  const question = { sectionKey: section, fieldKey: field, path };
  const taps = getClarifyTapOptions(question);
  if (spec.type === 'scale') {
    const expected = [];
    for (let n = spec.min; n <= spec.max; n++) {
      if (spec.forbidden?.includes(n)) continue;
      expected.push(String(n));
    }
    assert.deepEqual(
      taps.map((t) => String(t.label)),
      expected,
      `${path} scale chips truncated: ${JSON.stringify(taps.map((t) => t.label))}`,
    );
  } else {
    const expected = (spec.options || [])
      .filter((o) => o.value !== 'prefer-not-say')
      .map((o) => String(o.label));
    assert.equal(
      taps.length,
      expected.length,
      `${path} choice count ${taps.length} !== ${expected.length}`,
    );
    for (const label of expected) {
      assert.ok(
        taps.some((t) => String(t.label) === label),
        `${path} missing choice ${label}`,
      );
    }
  }
}

const sleepQ = getClarifyTapOptions({
  sectionKey: 'lifestyle',
  fieldKey: 'sleepQuality',
  path: 'lifestyle.sleepQuality',
});
assert.deepEqual(
  sleepQ.map((t) => String(t.label)),
  ['1', '2', '3', '4', '5'],
  `sleepQuality chips ${JSON.stringify(sleepQ.map((t) => t.label))}`,
);

const profile = { lifestyle: { sleepDuration: '7-8h' } };
const nq = nextCardQuestion(profile, 'sleep');
assert.ok(nq, 'next question for sleep');
assert.equal(nq.field, 'sleepQuality', `field ${nq.field}`);
assert.deepEqual(
  nq.chips.map((c) => String(c.label)),
  ['1', '2', '3', '4', '5'],
  `card chips ${JSON.stringify(nq.chips.map((c) => c.label))}`,
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
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
await page.waitForTimeout(1000);

const live = await page.evaluate(() => {
  const card = document.querySelector('.universal-agent-card[data-focus-area-id="sleep"]');
  const ask = card?.querySelector('[data-uac-ask]')?.textContent || '';
  const chips = [...(card?.querySelectorAll('[data-uac-chip]') || [])].map((b) => b.textContent.trim());
  return { ask, chips };
});
console.log('14d-2 live360', JSON.stringify(live));
assert.ok(/quality|1.?5/i.test(live.ask), `ask ${live.ask}`);
assert.deepEqual(live.chips, ['1', '2', '3', '4', '5'], `live chips ${JSON.stringify(live.chips)}`);

await browser.close();
console.log('OK verify-task14d-2', `checked ${scaleAndChoice.length} scale/choice fields`);
