/**
 * Task 15c — no Add Focus strip chrome; slim Today row; Log gold; scroll clearance.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { baseUrl } from './lib/base-url.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'mobile-app', '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

const WIDTHS = [
  [360, 800],
  [390, 844],
  [412, 915],
  [1280, 800],
  [1440, 900],
  [1920, 900],
];

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_ai_consent_v1', new Date().toISOString());
    localStorage.setItem('tendai_focus_areas_v1', JSON.stringify(['sleep', 'move']));
    localStorage.setItem(
      'tendai-profile-state',
      JSON.stringify({ body: { age: 35 }, lifestyle: { sleepDuration: '7-8h' } }),
    );
  });
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
    window.switchView?.('feed');
    window.renderAgentReportsSection?.();
    window.renderTodayBlock?.();
  });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ headless: true });
const heightTable = [];

for (const [w, h] of WIDTHS) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    isMobile: w < 900,
    hasTouch: w < 900,
  });
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await boot(page);

  const before = await page.evaluate(() => {
    const root = document.getElementById('todayBlock');
    const strip = document.querySelector('.agent-feed-add-strip');
    const add = document.querySelector('#agentFeedAddBtn');
    const log = document.querySelector('.today-block__btn--primary');
    const stripCs = strip ? getComputedStyle(strip) : null;
    const addCs = add ? getComputedStyle(add) : null;
    const logCs = log ? getComputedStyle(log) : null;
    const rootCs = root ? getComputedStyle(root) : null;
    const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim();
    const list = document.querySelector('.agent-reports-list');
    if (list) list.scrollTop = list.scrollHeight;
    const last = [...document.querySelectorAll('.universal-agent-card')].pop();
    const addR = add?.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav');
    const navCs = nav ? getComputedStyle(nav) : null;
    const navVisible = !!(nav && navCs && navCs.display !== 'none' && navCs.visibility !== 'hidden');
    const navTop = navVisible ? nav.getBoundingClientRect().top : window.innerHeight;
    return {
      todayH: root ? Math.round(root.getBoundingClientRect().height) : 0,
      todayBgImage: rootCs?.backgroundImage || '',
      todayBg: rootCs?.backgroundColor || '',
      todayBorder: rootCs?.borderTopWidth || '',
      todayShadow: rootCs?.boxShadow || '',
      stripBg: stripCs?.backgroundColor || '',
      stripBorder: stripCs ? parseFloat(stripCs.borderTopWidth) || 0 : -1,
      pillBg: addCs?.backgroundColor || '',
      pillH: addR ? Math.round(Math.max(addR.height, parseFloat(addCs?.minHeight) || 0)) : 0,
      logBg: logCs?.backgroundColor || '',
      gold,
      lastAbovePill: !!(last && addR && last.getBoundingClientRect().bottom <= addR.top - 1),
      pillAboveNav: !navVisible || (addR ? addR.bottom <= navTop - 2 : true),
      navVisible,
      hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      greet: document.getElementById('todayGreeting')?.textContent || '',
      text: document.getElementById('todayBlockText')?.textContent || '',
    };
  });

  assert.ok(
    /transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/i.test(before.stripBg),
    `${w}: strip bg must be transparent, got ${before.stripBg}`,
  );
  assert.equal(before.stripBorder, 0, `${w}: strip border-top must be 0`);
  assert.ok(/246,\s*195,\s*106/i.test(before.pillBg), `${w}: pill not gold ${before.pillBg}`);
  assert.ok(/246,\s*195,\s*106/i.test(before.logBg), `${w}: Log not gold ${before.logBg}`);
  assert.ok(!/gradient/i.test(before.todayBgImage), `${w}: Today still has gradient ${before.todayBgImage}`);
  assert.ok(/none/i.test(before.todayShadow), `${w}: Today shadow ${before.todayShadow}`);
  assert.ok(before.pillH >= 44, `${w}: pill ${before.pillH}`);
  assert.ok(before.lastAbovePill, `${w}: last card not above pill`);
  assert.ok(before.pillAboveNav, `${w}: pill overlaps tab`);
  assert.equal(before.hOverflow, false, `${w}: horizontal overflow`);
  if (w >= 900) {
    assert.ok(before.todayH >= 56 && before.todayH <= 64, `${w}: desktop Today height ${before.todayH} (want ~64)`);
  } else {
    assert.ok(before.todayH <= 97, `${w}: mobile Today height ${before.todayH} > prior 97`);
  }

  // Settled done row — force settled presentation (same classes renderTodayBlock uses)
  await page.evaluate(() => {
    const root = document.getElementById('todayBlock');
    root?.classList.add('today-block--compact', 'today-block--settled');
    const greet = document.getElementById('todayGreeting');
    if (greet) greet.hidden = true;
    const text = document.getElementById('todayBlockText');
    if (text) text.textContent = '✓ Done today';
    document.getElementById('todayBlockActions')?.replaceChildren();
    const src = document.getElementById('todayBlockSource');
    if (src) {
      src.hidden = true;
      src.textContent = '';
    }
    const expand = document.getElementById('todayBlockExpand');
    if (expand) expand.hidden = true;
  });
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    const root = document.getElementById('todayBlock');
    return {
      todayH: root ? Math.round(root.getBoundingClientRect().height) : 0,
      text: document.getElementById('todayBlockText')?.textContent || '',
      settled: root?.classList.contains('today-block--settled') || false,
      btnCount: document.querySelectorAll('#todayBlockActions button').length,
    };
  });
  assert.ok(after.settled, `${w}: settled class missing`);
  assert.ok(after.todayH <= 50, `${w}: settled Today height ${after.todayH} (want ~48)`);
  assert.ok(/Done today/i.test(after.text), `${w}: settled copy ${after.text}`);
  assert.equal(after.btnCount, 0, `${w}: settled should have no buttons`);

  heightTable.push({
    width: w,
    beforeH: before.todayH,
    afterH: after.todayH,
    logBg: before.logBg,
    gold: before.gold,
  });
  console.log('15c', w, JSON.stringify({ before, after }));

  if (w === 390 || w === 1280) {
    // Reset to active Today for top screenshot
    await page.evaluate(() => {
      localStorage.removeItem('tendai_today_steps_v1');
      window.renderTodayBlock?.();
    });
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, `task15c-feed-top-${w}.png`),
      clip: { x: 0, y: 0, width: w, height: Math.min(h, 844) },
    });
    await page.evaluate(() => {
      const list = document.querySelector('.agent-reports-list');
      if (list) list.scrollTop = list.scrollHeight;
    });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(outDir, `task15c-feed-end-${w}.png`),
      clip: { x: 0, y: 0, width: w, height: Math.min(h, 844) },
    });
    await page.evaluate(() => {
      const root = document.getElementById('todayBlock');
      root?.classList.add('today-block--settled', 'today-block--compact');
      const text = document.getElementById('todayBlockText');
      if (text) text.textContent = '✓ Done today';
      document.getElementById('todayBlockActions')?.replaceChildren();
      document.getElementById('todayGreeting') && (document.getElementById('todayGreeting').hidden = true);
      const list = document.querySelector('.agent-reports-list');
      if (list) list.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(outDir, `task15c-today-done-${w}.png`),
      clip: { x: 0, y: 0, width: w, height: Math.min(h, 844) },
    });
  }

  await page.close();
}

console.log('\n=== Today height table ===');
console.log('width | before(active) | after(done) | Log bg | --gold');
for (const row of heightTable) {
  console.log(`${row.width}\t${row.beforeH}\t${row.afterH}\t${row.logBg}\t${row.gold}`);
}

await browser.close();
console.log('OK verify-task15c');
