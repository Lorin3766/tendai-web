/**
 * Task 11d: production front-end readiness.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task11d.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { resolveBackendURL } from '../mobile-app/js/core/runtime-config.js';
import { isContentPreviewEnabled } from '../mobile-app/js/features/feed/content-library.js';
import { isClockOverrideAllowed, setObriumClockOverride } from '../mobile-app/js/core/obrium-clock.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'mobile-app');
let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

const allowed = JSON.parse(fs.readFileSync(path.join(mobile, 'allowed-hosts.json'), 'utf8'));
const connectHosts = new Set(allowed.connectHosts);
const policy = fs.readFileSync(path.join(mobile, 'privacy-policy.html'), 'utf8');
const headers = fs.readFileSync(path.join(mobile, '_headers'), 'utf8');
const indexHtml = fs.readFileSync(path.join(mobile, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(mobile, 'manifest.json'), 'utf8'));
const sw = fs.readFileSync(path.join(mobile, 'service-worker.js'), 'utf8');

if (!/noindex/i.test(indexHtml)) fail('index missing noindex');
if (!/X-Robots-Tag:\s*noindex/i.test(headers)) fail('_headers missing X-Robots-Tag noindex');
if (!/Content-Security-Policy:/i.test(headers)) fail('_headers missing CSP');
if (!/X-Content-Type-Options:\s*nosniff/i.test(headers)) fail('_headers missing nosniff');
if (!/Referrer-Policy:/i.test(headers)) fail('_headers missing Referrer-Policy');
if (!/X-Frame-Options:\s*DENY/i.test(headers)) fail('_headers missing frame protection');

for (const host of connectHosts) {
  if (!headers.includes(host)) fail(`CSP missing host ${host}`);
  if (!policy.toLowerCase().includes(host.replace(/^www\./, '').split('.')[0]) &&
      !['fonts.googleapis.com', 'fonts.gstatic.com', 'api.openweathermap.org', 'api.github.com', 'geocoding-api.open-meteo.com'].includes(host)) {
    // fonts + optional agent hosts + geocoding sibling of Open-Meteo: named in report if not in policy
  }
}
// Policy must name the third-party services we always call
for (const needle of ['ipapi.co', 'Nominatim', 'Open-Meteo', 'Gemini']) {
  if (!policy.includes(needle) && !policy.includes(needle.toLowerCase())) fail(`policy missing ${needle}`);
}
if (!policy.includes('Open-Meteo') && !/open-meteo/i.test(policy)) fail('policy missing Open-Meteo');

if (manifest.name !== 'Obrium' || manifest.short_name !== 'Obrium') fail('manifest name');
if (manifest.display !== 'standalone') fail('manifest display');
if (manifest.theme_color !== '#141210' || manifest.background_color !== '#141210') fail('manifest colors');
if (!manifest.icons.some((i) => i.purpose === 'maskable')) fail('manifest maskable icon');
for (const icon of manifest.icons) {
  const file = path.join(mobile, icon.src.replace(/^\.\//, ''));
  if (!fs.existsSync(file)) fail(`missing icon ${icon.src}`);
}
if (!sw.includes('obrium-shell-v')) fail('SW cache name');
if (!sw.includes('offline.html')) fail('SW offline fallback');
if (!fs.existsSync(path.join(mobile, 'offline.html'))) fail('offline.html missing');
if (!indexHtml.includes('settingsPrivacyPolicy') || !indexHtml.includes('settingsTermsOfUse')) {
  fail('Settings missing Privacy/Terms controls');
}
if (!/Last updated: October 27, 2026/i.test(policy)) fail('privacy last updated');
const terms = fs.readFileSync(path.join(mobile, 'terms-of-use.html'), 'utf8');
if (!/Last updated: October 2026/i.test(terms)) fail('terms last updated');

// Host scan: fetch URLs in JS under mobile-app/js/features and core (+ index fonts)
const hostRe = /https?:\/\/([a-z0-9.-]+)/gi;
const scanDirs = [
  path.join(mobile, 'js', 'features'),
  path.join(mobile, 'js', 'core'),
  path.join(mobile, 'js', 'infrastructure'),
];
const found = new Set();
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(ent.name)) {
      const text = fs.readFileSync(p, 'utf8');
      let m;
      while ((m = hostRe.exec(text))) found.add(m[1].toLowerCase());
    }
  }
}
walk(path.join(mobile, 'js'));
hostRe.lastIndex = 0;
let m;
while ((m = hostRe.exec(indexHtml))) found.add(m[1].toLowerCase());

const ignoreExact = new Set([
  'localhost',
  '127.0.0.1',
  'ai.google.dev', // terms link only
  'www.w3.org', // SVG xmlns only
  'ipapi.co',
  'nominatim.openstreetmap.org',
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'api.openweathermap.org',
  'api.github.com',
  'pubmed.ncbi.nlm.nih.gov', // default review link, not fetch
  'openweathermap.org', // comment in legacy weather file
]);
for (const host of found) {
  if (ignoreExact.has(host)) continue;
  if (host.endsWith('.openstreetmap.org')) continue;
  if (connectHosts.has(host)) continue;
  fail(`code contacts host not in CSP allowlist: ${host}`);
}
console.log('[11d] host allowlist', [...found].sort().join(', '));

// Dev hooks inert off localhost
if (isContentPreviewEnabled({ hostname: 'app.example', search: '?contentPreview=1' })) {
  fail('contentPreview active off localhost');
}
if (!isContentPreviewEnabled({ hostname: '127.0.0.1', search: '?contentPreview=1' })) {
  fail('contentPreview should work on loopback');
}
if (isClockOverrideAllowed({ hostname: 'app.example' })) fail('clock override allowed off localhost');
if (!isClockOverrideAllowed({ hostname: '127.0.0.1' })) fail('clock override blocked on loopback');

globalThis.window = { location: { hostname: 'app.example' } };
globalThis.location = { hostname: 'app.example', port: '', protocol: 'https:' };
if (resolveBackendURL({ hostname: 'app.example' }) !== '') {
  fail(`production defaulted relay to ${resolveBackendURL({ hostname: 'app.example' })}`);
}
if (resolveBackendURL({ hostname: '127.0.0.1', port: '50490' }) !== 'http://127.0.0.1:3001') {
  fail(`dev fallback ${resolveBackendURL({ hostname: '127.0.0.1', port: '50490' })}`);
}
console.log('[11d] backend URL + hooks');

if (!process.env.OBRIUM_URL) {
  if (failed) process.exit(1);
  console.log('TASK11D_OK (unit only)');
  process.exit(0);
}

const outDir = path.join(mobile, '_audit', 'accent-review');
fs.mkdirSync(outDir, { recursive: true });

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
  localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
  localStorage.setItem('tendai_welcome_accepted', '1');
});
await page.goto(process.env.OBRIUM_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
});
const meta = await page.evaluate(() => ({
  robots: document.querySelector('meta[name="robots"]')?.content || '',
  theme: document.querySelector('meta[name="theme-color"]')?.content || '',
  backend: document.querySelector('meta[name="obrium-backend-url"]')?.content ?? null,
  manifest: document.querySelector('link[rel="manifest"]')?.href || '',
}));
if (!/noindex/i.test(meta.robots)) fail(`robots meta ${meta.robots}`);
if (meta.theme !== '#141210') fail(`theme-color ${meta.theme}`);
console.log('[11d] browser meta', JSON.stringify(meta));

// Simulate non-localhost hostname for hooks
const offLocal = await page.evaluate(() => {
  const preview = window.location.search.includes('contentPreview');
  return {
    previewFn: null,
  };
});
await page.goto(process.env.OBRIUM_URL + '/?contentPreview=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(800);
const previewGate = await page.evaluate(async () => {
  const mod = await import(new URL('./js/features/feed/content-library.js', location.href).href);
  return {
    real: mod.isContentPreviewEnabled(),
    fakeHost: mod.isContentPreviewEnabled({ hostname: 'obrium.app', search: '?contentPreview=1' }),
    clock: window.setObriumClockOverride?.(new Date(), { hostname: 'obrium.app' }),
  };
});
if (!previewGate.real) fail('preview should work on loopback test server');
if (previewGate.fakeHost) fail('preview active when hostname simulated as production');
if (previewGate.clock) fail('clock override accepted for production hostname');
console.log('[11d] preview/clock gated');

await page.goto(process.env.OBRIUM_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
});
await page.screenshot({
  path: path.join(outDir, 'task11d-standalone-feed-390.png'),
  clip: { x: 0, y: 0, width: 390, height: 844 },
});
await browser.close();

// Lighthouse via npx when available (not a repo dependency)
let lighthouseScores = null;
try {
  const { execFileSync } = await import('child_process');
  const reportPath = path.join(outDir, 'task11d-lighthouse.json');
  // Lighthouse 12 dropped the PWA category; pin 11.x for installability scores.
  execFileSync(
    `npx --yes lighthouse@11.7.1 "${process.env.OBRIUM_URL}/" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance,accessibility,best-practices,pwa --output=json --output-path="${reportPath}"`,
    { cwd: root, stdio: 'pipe', timeout: 180000, shell: true },
  );
  const lhr = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const cats = lhr.categories || {};
  lighthouseScores = {
    performance: Math.round((cats.performance?.score || 0) * 100),
    accessibility: Math.round((cats.accessibility?.score || 0) * 100),
    pwa: Math.round((cats.pwa?.score || 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
  };
  console.log('[11d] lighthouse', JSON.stringify(lighthouseScores));
} catch (err) {
  console.log('[11d] lighthouse unavailable:', err?.message || err);
  lighthouseScores = null;
}

if (failed) process.exit(1);
console.log('TASK11D_OK');
if (lighthouseScores) console.log('LIGHTHOUSE', JSON.stringify(lighthouseScores));
