/**
 * Task 5c checkpoint: AI-processing consent step in first-launch onboarding.
 *  1. Fresh storage (390px): consent step appears once, after "Get Started"; full onboarding; relaunch -> nothing shown.
 *  2. Fresh storage, acknowledge, quit mid-onboarding, relaunch -> onboarding resumes without the consent step.
 *  3. Existing profile with onboarding complete -> never sees it.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task5c-consent.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = baseUrl;
const VW = 390;
const VH = 844;
fs.mkdirSync(outDir, { recursive: true });

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const browser = await chromium.launch({ headless: true });

async function newPage(seed) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('__s')) return;
    sessionStorage.setItem('__s', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v);
  }, seed);
  return page;
}

const consentVisible = (page) =>
  page.evaluate(() => /How Obrium uses AI/.test(document.querySelector('.system-onboarding-overlay')?.innerText || ''));
const onboardingTitle = (page) =>
  page.evaluate(() => document.querySelector('.system-onboarding-overlay .system-onboarding-title')?.textContent?.trim() || null);
async function launch(page) {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
}

// 1. Fresh install, full onboarding, relaunch
{
  const page = await newPage({});
  await launch(page);
  let consentSeen = 0;
  const t1 = await onboardingTitle(page);
  console.log('[fresh] first screen:', t1);
  if (await consentVisible(page)) fail('consent shown before Get Started');
  await page.click('[data-os-next]');
  await page.waitForTimeout(300);
  if (await consentVisible(page)) consentSeen++;
  const consent = await page.evaluate(() => ({
    text: document.querySelector('.system-onboarding-content')?.innerText?.replace(/\s+/g, ' ').trim(),
    link: document.querySelector('[data-os-privacy-link]')?.getAttribute('href'),
    googleTerms: document.querySelector('[data-os-google-terms-link]')?.getAttribute('href'),
    buttons: [...document.querySelectorAll('.system-onboarding-footer button')].map((b) => b.textContent.trim()),
  }));
  console.log('[fresh] consent step:', JSON.stringify(consent, null, 1));
  if (consent.link !== 'privacy-policy.html') fail('privacy link missing');
  if (!/Google may use this data to improve its AI models, and it may be reviewed by people at Google/.test(consent.text || '')) fail('free-tier sentence missing');
  if (consent.googleTerms !== 'https://ai.google.dev/gemini-api/terms') fail('Google terms link missing');
  if (JSON.stringify(consent.buttons) !== JSON.stringify(['I understand'])) fail('expected a single acknowledgment button');
  await page.screenshot({ path: path.join(outDir, 'task5c-consent-step-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });

  await page.click('[data-os-ack-ai]');
  await page.waitForTimeout(300);
  console.log('[fresh] after ack:', await onboardingTitle(page), '| stored ack:', await page.evaluate(() => localStorage.getItem('tendai_ai_consent_v1')));
  await page.click('[data-os-skip-health]');
  await page.waitForTimeout(200);
  if (await consentVisible(page)) consentSeen++;
  await page.fill('[data-os-birth-year]', '1990');
  await page.click('[data-os-next]');
  await page.waitForTimeout(200);
  await page.click('[data-os-skip-blood]');
  await page.waitForTimeout(200);
  await page.click('[data-os-allergies="no"]');
  await page.waitForTimeout(200);
  const focusState = () =>
    page.evaluate(() => ({
      subtitle: document.querySelector('.system-onboarding-subtitle')?.textContent?.trim(),
      count: document.querySelector('[data-os-focus-count]')?.textContent?.trim(),
      continueDisabled: !!document.querySelector('[data-os-finish]')?.disabled,
      selected: document.querySelectorAll('[data-os-focus-area].is-selected').length,
    }));
  const chips = page.locator('[data-os-focus-area]');
  const f0 = await focusState();
  console.log('[fresh] focus areas, none picked:', JSON.stringify(f0));
  if (f0.subtitle !== 'Pick 1 to 3 priorities to start. You can add more later.') fail(`focus subtitle: ${f0.subtitle}`);
  if (f0.count !== '0 of 3 selected') fail(`focus counter: ${f0.count}`);
  if (!f0.continueDisabled) fail('Continue enabled with 0 focus areas');
  await chips.nth(0).click();
  await page.waitForTimeout(100);
  const f1 = await focusState();
  console.log('[fresh] focus areas, 1 picked:', JSON.stringify(f1));
  if (f1.continueDisabled) fail('Continue still disabled with 1 focus area (minimum is 1)');
  if (f1.count !== '1 of 3 selected') fail(`focus counter after 1: ${f1.count}`);
  for (let i = 1; i < 4; i++) {
    await chips.nth(i).click();
    await page.waitForTimeout(100);
  }
  const f4 = await focusState();
  console.log('[fresh] focus areas, tried 4:', JSON.stringify(f4));
  if (f4.selected !== 3 || f4.count !== '3 of 3 selected') fail('more than 3 focus areas could be selected');
  if (f4.continueDisabled) fail('Continue disabled with 3 focus areas');
  await page.screenshot({ path: path.join(outDir, 'task-focus-areas-1to3-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });
  await page.click('[data-os-finish]');
  await page.waitForTimeout(1500);
  console.log('[fresh] onboarding complete:', await page.evaluate(() => localStorage.getItem('tendai_system_onboarding_v1')));
  if (consentSeen !== 1) fail(`consent step seen ${consentSeen} times during onboarding`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const relaunch = { overlay: await onboardingTitle(page), consent: await consentVisible(page) };
  console.log('[fresh] relaunch:', JSON.stringify(relaunch));
  if (relaunch.overlay || relaunch.consent) fail('onboarding/consent shown again after completion');
  await page.context().close();
}

// 2. Acknowledge, quit mid-onboarding, relaunch
{
  const page = await newPage({});
  await launch(page);
  await page.click('[data-os-next]');
  await page.waitForTimeout(200);
  await page.click('[data-os-ack-ai]');
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const first = await onboardingTitle(page);
  await page.click('[data-os-next]');
  await page.waitForTimeout(300);
  const second = await onboardingTitle(page);
  console.log('[mid-onboarding relaunch] screens:', first, '->', second);
  if (await consentVisible(page)) fail('consent re-shown after it was acknowledged');
  await page.context().close();
}

// 3. Existing user with onboarding complete
{
  const page = await newPage({
    tendai_system_onboarding_v1: '1',
    tendai_welcome_accepted: '1',
    tendai_quick_setup_v1: JSON.stringify({ completed: true, skipped: true }),
    'tendai-profile-state': JSON.stringify({ body: { birthYear: 1980 }, goals: { primaryGoals: ['better-sleep'] } }),
  });
  await launch(page);
  const r1 = { overlay: await onboardingTitle(page), consent: await consentVisible(page) };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const r2 = { overlay: await onboardingTitle(page), consent: await consentVisible(page) };
  console.log('[existing user] launch 1:', JSON.stringify(r1), '| launch 2:', JSON.stringify(r2), '| ack key:', await page.evaluate(() => localStorage.getItem('tendai_ai_consent_v1')));
  if (r1.overlay || r1.consent || r2.overlay || r2.consent) fail('existing onboarded user saw onboarding/consent');
  await page.context().close();
}

await browser.close();
if (failed) process.exit(1);
console.log('TASK5C_CHECKPOINT_OK');
