/**
 * Task 15d-4 — Profile header: no Guest/dash/default age; known-fact counts.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { countKnownProfileFacts, BANNED_USER_VOCAB } from '../mobile-app/js/features/talk/talk-payoff.js';
import { isDeclinedProfileValue } from '../mobile-app/js/features/profile/profile-schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

for (const w of ['Guest', 'System Integrity', 'Not started', 'In progress']) {
  assert.ok(BANNED_USER_VOCAB.includes(w), `banned vocab missing ${w}`);
}

const html = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
assert.equal(/\bGuest\b/.test(html), false, 'index.html still has Guest');
assert.equal(/System Integrity/.test(html), false, 'index.html still has System Integrity');

// Unit: declined excluded from known count
{
  const n0 = countKnownProfileFacts({});
  assert.equal(n0, 0);
  const nDeclined = countKnownProfileFacts({
    lifestyle: { sleepDuration: 'prefer-not-say', sleepQuality: 4 },
  });
  assert.equal(nDeclined, 1, `declined must not count, got ${nDeclined}`);
  assert.ok(isDeclinedProfileValue('prefer-not-say'));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.route('**/api/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
  localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep']));
  // No name, no age — and a declined + real answer to exercise counts
  localStorage.setItem(
    'tendai-profile-state',
    JSON.stringify({
      lifestyle: { sleepDuration: 'prefer-not-say', sleepQuality: 4 },
      body: {},
    }),
  );
});
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1400);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  window.switchView?.('profile');
  window.updateProfileUI?.();
  window.updateProfileCompletenessDisplay?.();
});
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const name = document.getElementById('mobileProfileName')?.childNodes?.[0]?.textContent?.trim() || '';
  const avatar = document.getElementById('mobileProfileAvatar')?.textContent?.trim() || '';
  const ageMeta = document.querySelector('#mobileProfileHeader .profile-meta');
  const age = document.getElementById('mobileProfileAge')?.textContent || '';
  const readout = document.getElementById('profileCompletenessMobile')?.textContent || '';
  const statuses = [...document.querySelectorAll('#mobileProfileMenu [data-profile-status]')].map((el) => ({
    key: el.getAttribute('data-profile-status'),
    text: el.textContent.trim(),
  }));
  const bodyText = document.getElementById('profile-view')?.innerText || '';
  return {
    name,
    avatar,
    ageHidden: !!ageMeta?.hidden,
    age,
    readout,
    statuses,
    hasGuest: /\bGuest\b/.test(bodyText),
    hasDashAge: /—|–/.test(age),
    has43: /43\s*yrs/i.test(bodyText),
    hasSystemIntegrity: /System Integrity/i.test(bodyText),
    hasNotStarted: /Not started/i.test(bodyText),
    hasInProgress: /In progress/i.test(bodyText),
    neutral: document.getElementById('mobileProfileAvatar')?.classList.contains('profile-avatar--neutral'),
  };
});

assert.equal(info.hasGuest, false, 'Guest visible');
assert.ok(/Your profile/i.test(info.name), `name was ${info.name}`);
assert.equal(info.avatar === 'G', false, 'avatar letter G');
assert.ok(info.neutral, 'neutral avatar class');
assert.equal(info.ageHidden, true, 'age meta should be hidden');
assert.equal(info.hasDashAge, false);
assert.equal(info.has43, false);
assert.equal(info.hasSystemIntegrity, false);
assert.equal(info.hasNotStarted, false);
assert.equal(info.hasInProgress, false);
assert.ok(/Obrium knows 1 thing about you/.test(info.readout), `readout ${info.readout}`);
const lifestyle = info.statuses.find((s) => s.key === 'lifestyle');
assert.ok(lifestyle && lifestyle.text === '1 of 10', `lifestyle status ${lifestyle?.text}`);

console.log('15d-4', JSON.stringify(info));
await browser.close();
console.log('OK verify-task15d-4');
