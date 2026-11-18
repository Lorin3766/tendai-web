/**
 * Task 14d-5 — Talk Message field has one outline (no nested card border).
 */
import assert from 'assert';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

async function probe(width) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    document.body.classList.add('talk-view-active');
    document.getElementById('centerBody')?.classList.add('view-talk');
    window.switchView?.('talk');
  });
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const pill = document.querySelector('.talk-input-pill');
    const card = document.querySelector('.conversation-card');
    const row = document.querySelector('.ai-input-row');
    const ta = document.querySelector('#chatInput');
    const pillCs = getComputedStyle(pill);
    const cardCs = getComputedStyle(card);
    const rowCs = getComputedStyle(row);
    const taCs = getComputedStyle(ta);
    const parseBorder = (cs) => {
      const w = parseFloat(cs.borderTopWidth) || 0;
      const style = cs.borderTopStyle;
      return style === 'none' || w === 0 ? 0 : w;
    };
    return {
      pillBorder: parseBorder(pillCs),
      pillRadius: parseFloat(pillCs.borderRadius) || 0,
      cardBorder: parseBorder(cardCs),
      rowBorderTop: parseBorder(rowCs),
      taBorder: parseBorder(taCs),
    };
  });
  await browser.close();
  return m;
}

for (const width of [360, 390, 412]) {
  const m = await probe(width);
  console.log('14d-5', width, JSON.stringify(m));
  assert.ok(m.pillBorder >= 1, `${width} pill needs one outline`);
  assert.ok(m.pillRadius >= 8, `${width} pill rounded`);
  assert.equal(m.cardBorder, 0, `${width} conversation-card must not add a second outline`);
  assert.equal(m.rowBorderTop, 0, `${width} ai-input-row must not add a second outline`);
  assert.equal(m.taBorder, 0, `${width} textarea must not have its own border`);
}

console.log('OK verify-task14d-5');
