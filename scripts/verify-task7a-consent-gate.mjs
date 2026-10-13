/**
 * Task 7A checkpoint: no location/weather lookups (ipapi.co, Nominatim, Open-Meteo) before the AI consent step.
 *  1. Fresh storage (390px): zero requests to those hosts on launch, on the welcome screen and on the consent screen;
 *     requests start only after "I understand".
 *  2. Existing user who finished onboarding before the consent step existed (no consent key): lookups still run on launch.
 * Third-party responses are stubbed so the test never hits the real services.
 * Usage: SERRON_URL=http://127.0.0.1:50490 node scripts/verify-task7a-consent-gate.mjs
 */
import { chromium } from 'playwright';

const base = process.env.SERRON_URL || 'http://127.0.0.1:5500';
const HOSTS = /ipapi\.co|nominatim\.openstreetmap\.org|open-meteo\.com/;

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const browser = await chromium.launch({ headless: true });

async function newPage(seed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const log = [];
  page.on('request', (req) => {
    if (HOSTS.test(req.url())) log.push(new URL(req.url()).host);
  });
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('https://ipapi.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ latitude: 40.7, longitude: -74, city: 'Testville', country_name: 'Testland' }) }));
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: { city: 'Testville' } }) }));
  await page.route('https://*.open-meteo.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: 60, weather_code: 0, wind_speed_10m: 3 }, daily: {}, hourly: {}, results: [{ latitude: 40.7, longitude: -74 }] }) }));
  await page.addInitScript((s) => {
    if (localStorage.getItem('__seeded7a')) return;
    localStorage.clear();
    localStorage.setItem('__seeded7a', '1');
    for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v);
  }, seed);
  return { page, log };
}

const title = (page) =>
  page.evaluate(() => document.querySelector('.system-onboarding-overlay .system-onboarding-title')?.textContent?.trim() || null);
const summary = (log) => [...new Set(log)].join(', ') || 'none';

// 1. Fresh install
{
  const { page, log } = await newPage({});
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log(`[fresh] welcome screen "${await title(page)}" after 5s: ${log.length} lookup request(s) (${summary(log)})`);
  if (log.length) fail('lookups fired on the welcome screen before consent');

  await page.click('[data-os-next]');
  await page.waitForTimeout(3000);
  console.log(`[fresh] consent screen "${await title(page)}" after 3s: ${log.length} lookup request(s) (${summary(log)})`);
  if (log.length) fail('lookups fired on the consent screen before "I understand"');

  await page.evaluate(() => window.updateFeedUI?.());
  await page.waitForTimeout(2000);
  console.log(`[fresh] forced Feed refresh before consent: ${log.length} lookup request(s)`);
  if (log.length) fail('a Feed refresh before consent triggered lookups');

  await page.click('[data-os-ack-ai]');
  await page.waitForTimeout(4000);
  console.log(`[fresh] after "I understand": ${log.length} lookup request(s) (${summary(log)})`);
  if (!log.length) fail('lookups never started after consent');
  await page.context().close();
}

// 2. Existing onboarded user without the consent key
{
  const { page, log } = await newPage({
    tendai_system_onboarding_v1: '1',
    tendai_welcome_accepted: '1',
    tendai_quick_setup_v1: JSON.stringify({ completed: true, skipped: true }),
    'tendai-profile-state': JSON.stringify({ body: { birthYear: 1980 }, goals: { primaryGoals: ['better-sleep'] } }),
  });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  const weather = await page.evaluate(() => document.getElementById('dayHeaderWeatherNow')?.textContent?.trim());
  console.log(`[existing user] launch: ${log.length} lookup request(s) (${summary(log)}) | weather card: "${weather}"`);
  if (!log.length) fail('existing onboarded user lost location/weather lookups');
  await page.context().close();
}

await browser.close();
if (failed) process.exit(1);
console.log('TASK7A_CHECKPOINT_OK');
