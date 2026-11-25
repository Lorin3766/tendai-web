/**
 * Task 15d-3 — Services: no Online doctor; one border per flat row.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';
import { BANNED_USER_VOCAB } from '../mobile-app/js/features/talk/talk-payoff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

assert.ok(BANNED_USER_VOCAB.includes('Online doctor'), 'vocab lint must ban Online doctor');

const html = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
assert.equal(/Online doctor/i.test(html), false, 'index.html still shows Online doctor');
assert.equal(/onlineDoctorCard|MOBILE_ONLINE_DOCTOR|RIGHT_ONLINE_DOCTOR/.test(html), false);

const browser = await chromium.launch({ headless: true });

async function check(vp) {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
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
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    if (vpMobile()) {
      window.switchView?.('services');
    }
    window.renderServices?.();
    function vpMobile() {
      return window.innerWidth < 900;
    }
  });
  await page.waitForTimeout(500);

  const info = await page.evaluate((mobile) => {
    if (mobile) {
      const body = document.getElementById('centerBody');
      body?.classList.remove('view-feed', 'view-talk', 'view-profile');
      body?.classList.add('view-services');
      document.getElementById('services-view')?.classList.remove('hidden');
      window.switchView?.('services');
    }
    const root = mobile
      ? document.querySelector('#servicesFlatList') || document.querySelector('.services-view .services-flat-list')
      : document.querySelector('#servicesFlatListDesktop') || document.querySelector('#col-right .services-flat-list');
    const rows = [...(root?.querySelectorAll('.service-flat-row') || [])];
    const text = (mobile ? document.querySelector('.services-view') : document.querySelector('#col-right'))?.innerText || '';
    const borders = rows.map((row) => {
      const cs = getComputedStyle(row);
      return {
        name: row.querySelector('.service-flat-row__name')?.textContent || '',
        soon: row.classList.contains('service-flat-row--soon'),
        borderPx: parseFloat(cs.borderTopWidth) || 0,
        nestedCard: !!row.closest('.card-soft') && row.parentElement?.classList.contains('services-flat-list') === false,
        tag: row.tagName,
      };
    });
    return {
      text,
      names: borders.map((b) => b.name),
      borders,
      hasOnlineDoctor: /Online doctor/i.test(text),
      hasChevron: /▼/.test(text),
      rowCount: rows.length,
    };
  }, vp.mobile);

  assert.equal(info.hasOnlineDoctor, false, `${vp.w}: Online doctor still visible`);
  assert.ok(info.names.includes('Labs'), `${vp.w}: Labs missing`);
  assert.ok(info.names.includes('Programs'), `${vp.w}: Programs missing`);
  assert.ok(info.names.includes('Focus Areas'), `${vp.w}: Focus Areas missing`);
  assert.equal(info.rowCount, 3, `${vp.w}: expected 3 rows, got ${info.rowCount}`);
  const labs = info.borders.find((b) => b.name === 'Labs');
  assert.ok(labs?.soon, `${vp.w}: Labs should be Coming soon`);
  for (const b of info.borders) {
    assert.ok(b.borderPx >= 0.5 && b.borderPx <= 1.5, `${vp.w}: ${b.name} border ${b.borderPx}`);
  }
  assert.equal(info.hasChevron, false, `${vp.w}: dropdown chevron still present`);
  console.log(`15d-3 ${vp.w}:`, info.names.join(', '), labs.soon ? '(Labs soon)' : '');
  await context.close();
}

await check({ w: 390, h: 844, mobile: true });
await check({ w: 1280, h: 800, mobile: false });
await browser.close();
console.log('OK verify-task15d-3');
