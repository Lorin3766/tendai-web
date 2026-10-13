/**
 * Verify Task 1: Obrium branding, honest booking copy, real/placeholder profile name.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-obrium-task1.mjs
 */
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'mobile-app', '_audit', 'accent-review');
const base = baseUrl;
fs.mkdirSync(outDir, { recursive: true });

const OLD = /tend\s?ai|serron|seregin/i;
let failed = false;
const fail = (m) => { console.error('FAIL:', m); failed = true; };

const browser = await chromium.launch({ headless: true });

async function freshPage(viewport, seedName) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript((name) => {
    if (sessionStorage.getItem('__seeded') === '1') return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    if (name) localStorage.setItem('tendai-profile-state', JSON.stringify({ body: { name } }));
  }, seedName || null);
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    document
      .querySelectorAll('.profile-modal-overlay, .system-onboarding-overlay, .welcome-modal-overlay')
      .forEach((el) => el.remove());
  });
  return { context, page };
}

// 1) Desktop, no name: Guest placeholder + branding
{
  const { context, page } = await freshPage({ width: 1280, height: 900 });
  const info = await page.evaluate(() => ({
    title: document.title,
    brand: document.querySelector('.brand-title')?.textContent?.trim(),
    name: document.getElementById('profileName')?.childNodes[0]?.textContent?.trim(),
    avatar: document.getElementById('profileAvatar')?.textContent?.trim(),
    hasDot: !!document.querySelector('#profileName [data-obrium-core-status]'),
    visibleText: document.body.innerText,
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
  }));
  console.log('DESKTOP:', JSON.stringify({ ...info, visibleText: undefined }));
  if (info.title !== 'Obrium') fail(`title is "${info.title}"`);
  if (info.brand !== 'Obrium') fail(`brand is "${info.brand}"`);
  if (info.name !== 'Guest' || info.avatar !== 'G') fail('expected Guest placeholder');
  if (!info.hasDot) fail('status dot span missing from desktop name');
  if (/\bAnton\b/.test(info.visibleText)) fail('"Anton" visible with no profile name');
  const oldHit = info.visibleText.match(new RegExp(`.{0,40}(${OLD.source}).{0,40}`, 'i'));
  if (oldHit) fail(`old brand name visible in page text: "${oldHit[0]}"`);
  const manifest = await (await page.request.get(base + '/manifest.json')).json();
  if (manifest.name !== 'Obrium' || manifest.short_name !== 'Obrium') fail('manifest not Obrium');
  await page.screenshot({ path: path.join(outDir, 'obrium-desktop-guest.png') });
  await context.close();
}

// 2) Mobile with a real name: name shown, dot preserved
{
  const { context, page } = await freshPage({ width: 390, height: 844 }, 'Maria');
  const info = await page.evaluate(() => ({
    desk: document.getElementById('profileName')?.childNodes[0]?.textContent?.trim(),
    mobile: document.getElementById('mobileProfileName')?.childNodes[0]?.textContent?.trim(),
    mobileAvatar: document.getElementById('mobileProfileAvatar')?.textContent?.trim(),
    mobileDot: !!document.querySelector('#mobileProfileName [data-obrium-core-status]'),
  }));
  console.log('MOBILE NAMED:', JSON.stringify(info));
  if (info.desk !== 'Maria' || info.mobile !== 'Maria' || info.mobileAvatar !== 'M') fail('real name not rendered');
  if (!info.mobileDot) fail('status dot span wiped from mobile name');

  // Talk: typing indicator / greeting / Labs + Doctor flows
  await page.evaluate(() => window.switchView && window.switchView('talk'));
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const mod = await import('./js/features/talk/ecosystem-bridge.js');
    const tc = window.__obriumTalkComponent;
    mod.startSecureMedicalChannel(tc);
    mod.openLabsReportModal('blood-test', 'Blood test');
    document.getElementById('labsChoiceOnlineMD')?.click();
    mod.openLabsReportModal('blood-test', 'Blood test');
    document.getElementById('labsChoiceHomeLab')?.click();
  });
  await page.waitForTimeout(800);
  const talkText = await page.evaluate(() => document.getElementById('chatLog')?.innerText || '');
  console.log('TALK TEXT:\n' + talkText);
  if (OLD.test(talkText)) fail('old brand name in Talk');
  if (/Connecting to a certified specialist|will reach out|(?<!nobody )will contact you/i.test(talkText)) fail('dishonest booking copy still present');
  if (!/no request was sent and nobody will contact you/i.test(talkText)) fail('honest booking copy missing');
  await page.screenshot({ path: path.join(outDir, 'obrium-talk-booking-390.png') });
  await context.close();
}

await browser.close();
if (failed) process.exit(1);
console.log('PASS');
