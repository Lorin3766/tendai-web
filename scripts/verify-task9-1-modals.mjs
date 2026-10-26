/**
 * Task 9.1 item 2: opening and saving each profile modal must not throw.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task9-1-modals.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('tendai_system_onboarding_v1', '1');
  localStorage.setItem('tendai_welcome_accepted', '1');
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
});
await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

for (const section of ['body', 'health', 'mind', 'lifestyle', 'goals']) {
  errors.length = 0;
  await page.evaluate((name) => window.openProfileModal?.(name), section);
  await page.waitForTimeout(200);
  await page.click('.profile-modal-save');
  await page.waitForTimeout(250);
  if (errors.length) {
    console.error('FAIL:', section, errors.join(' | '));
    await browser.close();
    process.exit(1);
  }
  console.log('[9.1] modal ok', section);
}
await page.evaluate(() => window.openSettingsModal?.());
await page.waitForTimeout(200);
await page.evaluate(() => window.closeProfileModal?.());
if (errors.length) {
  console.error('FAIL: settings', errors.join(' | '));
  await browser.close();
  process.exit(1);
}
console.log('[9.1] settings modal ok');
await browser.close();
console.log('TASK9_1_MODALS_OK');
