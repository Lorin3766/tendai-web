/**
 * Task 9.2 item 3: Skin calibration points at Settings, askable areas still point at Talk.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task9-2-calibration.mjs
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const {
  calibrationLine,
  calibrationOpensSettings,
  areaHasAskableSignal,
  nextFocusAreaSignal,
  SETTINGS_CITY_CALIBRATION,
} = await import('../mobile-app/js/features/profile/focus-area-signals.js');

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const ASKABLE = ['sleep', 'move', 'nutrition', 'labs', 'stress', 'longevity', 'cardio', 'mental'];
for (const id of ASKABLE) {
  if (!areaHasAskableSignal(id)) fail(`${id} has no askable signal`);
  if (calibrationOpensSettings(id)) fail(`${id} opened Settings`);
  const line = calibrationLine({}, id);
  if (!/answer a quick question in Talk/.test(line)) fail(`${id} lost the Talk calibration line: ${line}`);
}
const sleepPartial = calibrationLine({ lifestyle: { sleepDuration: '7-8h' } }, 'sleep');
if (!/one more answer sharpens this/.test(sleepPartial)) fail(`sleep partial line changed: ${sleepPartial}`);

if (areaHasAskableSignal('skin')) fail('skin was treated as askable');
if (!calibrationOpensSettings('skin')) fail('skin did not open Settings');
if (calibrationLine({}, 'skin') !== SETTINGS_CITY_CALIBRATION) {
  fail(`skin line: ${calibrationLine({}, 'skin')}`);
}
if (calibrationLine({ location: { type: 'manual', city: 'Boston' } }, 'skin') !== '') {
  fail('a typed city still showed a calibration line');
}
store.set('tendai_focus_areas_v1', JSON.stringify(['skin']));
if (nextFocusAreaSignal({}) != null) fail('skin produced a Talk question');
console.log('UNIT skin line:', calibrationLine({}, 'skin'));

if (process.env.OBRIUM_URL || process.env.TENDAI_URL || process.env.SERRON_URL) {
  const { chromium } = await import('playwright');
  const { baseUrl } = await import('./lib/base-url.mjs');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['skin', 'sleep']));
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
    const onboarding = await import('/js/features/settings/system-onboarding.js');
    onboarding.deployOnboardingFocusAreas(['skin', 'sleep']);
    if (typeof window.switchView === 'function') window.switchView('feed');
    if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
  });
  await page.waitForTimeout(800);

  const cards = await page.evaluate(() => {
    const read = (id) => {
      const card = document.querySelector(`.universal-agent-card[data-focus-area-id="${id}"]`);
      if (!card) return null;
      return {
        text: card.querySelector('[data-uac-calibration]')?.textContent || '',
        button: card.querySelector('[data-uac-calibration-talk], [data-uac-calibration-settings]')?.textContent || '',
        action: card.querySelector('[data-uac-calibration-talk], [data-uac-calibration-settings]')?.getAttribute('data-uac-action') || '',
      };
    };
    return { skin: read('skin'), sleep: read('sleep'), ids: [...document.querySelectorAll('[data-focus-area-id]')].map((el) => el.dataset.focusAreaId) };
  });
  console.log('CARDS', JSON.stringify(cards));
  if (pageErrors.length) fail(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
  if (!cards.skin) fail('skin card missing');
  else {
    if (cards.skin.text !== 'Add your city in Settings to calibrate this') fail(`skin text: ${cards.skin.text}`);
    if (cards.skin.button !== 'Add city in Settings') fail(`skin button: ${cards.skin.button}`);
    if (cards.skin.action !== 'settings-city') fail(`skin action: ${cards.skin.action}`);
    if (/Talk/i.test(cards.skin.text + cards.skin.button)) fail('skin still mentions Talk');
  }
  if (!cards.sleep) fail('sleep card missing');
  else {
    if (!/answer a quick question in Talk/.test(cards.sleep.text)) fail(`sleep text: ${cards.sleep.text}`);
    if (cards.sleep.button !== 'Open Talk') fail(`sleep button: ${cards.sleep.button}`);
    if (cards.sleep.action !== 'confidence-talk') fail(`sleep action: ${cards.sleep.action}`);
  }

  await page.locator('.universal-agent-card[data-focus-area-id="skin"] [data-uac-action="settings-city"]').click();
  await page.waitForTimeout(400);
  const settings = await page.evaluate(() => ({
    open: document.getElementById('settingsModalOverlay')?.classList.contains('is-active') === true,
    focused: document.activeElement?.id || '',
    city: !!document.getElementById('settingsLocationCity'),
  }));
  console.log('SETTINGS', JSON.stringify(settings));
  if (!settings.open) fail('Settings did not open');
  if (!settings.city) fail('city field missing');
  if (settings.focused !== 'settingsLocationCity') fail(`city field was not focused (${settings.focused})`);

  await browser.close();
}

if (failed) process.exit(1);
console.log('TASK9_2_CALIBRATION_OK');
