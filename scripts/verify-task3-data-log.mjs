/**
 * Task 3 checkpoint: trimmed Talk payloads + data-sent log.
 *  - B (profile greeting on Talk open), local profile answers, A (user message), C (background biometric check)
 *  - each produces a log entry with accurate categories; payload no longer carries the full ledger or Feed snippets.
 * Usage: OBRIUM_URL=http://127.0.0.1:50490 node scripts/verify-task3-data-log.mjs
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

const now = Date.now();
const LEDGER = {
  last_update: new Date(now).toISOString(),
  agent_insights: Array.from({ length: 12 }, (_, i) => ({
    agent: `Agent ${i + 1}`,
    status: `Status text for agent ${i + 1}`,
    priority: i === 0 ? 'critical' : 'normal',
    done: false,
    updatedAt: new Date(now - i * 60000).toISOString(),
    source: 'seed',
  })),
};
const LONG_TALK_PROMPT =
  'Good morning. How did you sleep last night? Tap to log your sleep so your Feed can adapt the plan for today, including recovery and training load guidance.';
const QUEUE = [
  { id: 'feed-a', type: 'feed', subtype: 'daily-action', text: 'FEED_SNIPPET_SHOULD_NOT_BE_SENT: drink water', timestamp: new Date(now - 5000).toISOString(), status: 'unread', dateKey: 'x' },
  { id: 'talk-a', type: 'talk', subtype: 'morning', text: LONG_TALK_PROMPT, timestamp: new Date(now - 4000).toISOString(), status: 'unread', dateKey: 'x' },
  { id: 'talk-old', type: 'talk', subtype: 'old', text: 'OLD_TALK_PROMPT_SHOULD_NOT_BE_SENT', timestamp: new Date(now - 3 * 86400000).toISOString(), status: 'unread', dateKey: 'y' },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await context.newPage();
const consoleTraces = [];
page.on('console', (m) => {
  if (/\[Obrium\] Background check/.test(m.text())) consoleTraces.push(m.text());
});

const requests = [];
await page.route('**/api/**', async (route) => {
  const req = route.request();
  const url = req.url();
  if (/\/api\/talk/.test(url) && req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    requests.push({ url, body });
    const isBackground = /^SYSTEM PROMPT: Analyze these new biometrics/.test(body.message || '');
    const reply = isBackground
      ? 'Sleep of 5.1h is a critical deficit. Prioritise rest today.'
      : body.system_state && body.system_state.common_ledger_recent === undefined && /opened Talk/.test(body.message || '')
        ? "I'm Obrium, your personal companion. I get to know you so your Feed fits. Were you recorded male or female at birth?"
        : 'Noted.';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply }) });
  }
  if (/\/api\/health/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await page.addInitScript(
  ({ ledger, queue }) => {
    if (sessionStorage.getItem('__seeded') === '1') return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('tendai_system_onboarding_v1', '1');
    localStorage.setItem('tendai_quick_setup_v1', JSON.stringify({ completed: true, skipped: true }));
    localStorage.setItem('tendai_welcome_accepted', '1');
    localStorage.setItem(
      'tendai-profile-state',
      JSON.stringify({
        health: { healthConditions: ['blood-pressure'], supplements: ['magnesium'] },
        mind: { stressLevel: 4, anxietyFrequency: 'sometimes' },
        goals: { primaryGoals: ['better-sleep'] },
      }),
    );
    localStorage.setItem('common_ledger', JSON.stringify(ledger));
    localStorage.setItem('tendai_user_memory_v1', JSON.stringify({ insights: ['Likes clean data', 'Prefers walking in the evening'] }));
    localStorage.setItem('tendai-message-queue', JSON.stringify(queue));
  },
  { ledger: LEDGER, queue: QUEUE },
);

let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};

async function waitBotIdle() {
  await page.waitForFunction(() => {
    const typing = document.querySelector('.talk-view .typing-indicator');
    const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
    const last = bots[bots.length - 1];
    return !typing && last && !last.classList.contains('message-typing') && (last.querySelector('.message-text')?.textContent || '').trim().length > 0;
  }, { timeout: 45000 });
}

async function sendTalk(text) {
  const before = await page.locator('.talk-view .message.bot:not(.typing-indicator)').count();
  await page.fill('#chatInput', text);
  await page.waitForTimeout(150);
  await page.click('#sendBtn');
  await page.waitForFunction(
    (prev) => {
      const typing = document.querySelector('.talk-view .typing-indicator');
      const bots = [...document.querySelectorAll('.talk-view .message.bot:not(.typing-indicator)')];
      const last = bots[bots.length - 1];
      return (
        !typing &&
        bots.length > prev &&
        last &&
        !last.classList.contains('message-typing') &&
        (last.querySelector('.message-text')?.textContent || '').trim().length > 0
      );
    },
    before,
    { timeout: 45000 },
  );
  await page.waitForTimeout(250);
}

const getLog = () => page.evaluate(() => JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]'));

await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  document.querySelectorAll('.system-onboarding-overlay, .welcome-modal-overlay').forEach((el) => el.remove());
  document.querySelectorAll('.profile-modal-overlay.is-active').forEach((el) => el.classList.remove('is-active'));
  localStorage.removeItem('tendai_chat_history');
  // Start the log clean so only this run's interactions are shown.
  localStorage.removeItem('tendai_data_sent_log_v1');
});
await page.evaluate(async () => {
  const mod = await import('/js/features/talk/data-sent-log.js');
  mod.clearDataSentLog();
});

// B: profile greeting on Talk open
await page.evaluate(() => window.switchView && window.switchView('talk'));
await waitBotIdle();
await page.waitForTimeout(400);
const reqB = requests.find((r) => /opened Talk/.test(r.body.message || ''));
if (!reqB) fail('no greeting (B) request captured');
else if (reqB.body.system_state?.common_ledger_recent || reqB.body.system_state?.common_ledger) fail('greeting (B) still carries the ledger');

// Local profile answers (no network)
const beforeLocal = requests.length;
await sendTalk('Male');
await sendTalk('Man');
await sendTalk('43');
if (requests.length !== beforeLocal) fail('proactive profile answers made a network request');
const stop = page.locator('.talk-pace-later').last();
if (await stop.count()) {
  await stop.click();
  await page.waitForTimeout(700);
} else {
  const bots = await page.evaluate(() =>
    [...document.querySelectorAll('.talk-view .message')].slice(-6).map((m) => `${m.className}: ${(m.querySelector('.message-text')?.textContent || '').slice(0, 90)}`),
  );
  console.log('LAST MESSAGES:', JSON.stringify(bots, null, 1));
  fail('pace prompt missing');
}

// A: standard user message
await sendTalk('How should I plan my training this week?');
const reqA = requests.find((r) => r.body.message === 'How should I plan my training this week?');
if (!reqA) fail('no user message (A) request captured');
const st = reqA?.body.system_state || {};
const ctxA = reqA?.body.profileContext || '';
console.log('A system_state keys:', Object.keys(st).join(', '));
console.log('A ledger rows:', JSON.stringify(st.common_ledger_recent));
console.log('A profileContext tail:', ctxA.slice(ctxA.indexOf('\n\n') + 2));
if (st.common_ledger) fail('full common_ledger still sent');
if (!Array.isArray(st.common_ledger_recent) || st.common_ledger_recent.length !== 5) fail('expected 5 recent ledger rows');
if (st.common_ledger_recent?.some((r) => 'source' in r)) fail('ledger rows not slimmed');
if (JSON.stringify(st.user_memory?.insights) !== JSON.stringify(['Likes clean data', 'Prefers walking in the evening'])) fail('user_memory not intact');
if (/FEED_SNIPPET_SHOULD_NOT_BE_SENT/.test(ctxA)) fail('Feed notification snippet still sent');
if (/OLD_TALK_PROMPT_SHOULD_NOT_BE_SENT/.test(ctxA)) fail('stale Talk prompt still sent');
const promptMatch = ctxA.match(/Recent Obrium prompts \(1\): ([^\n]*)/);
if (!promptMatch || promptMatch[1].length > 125) fail('recent Talk prompt missing or not shortened');
if (!/Sex at birth: male/.test(ctxA) || !/Health conditions: blood pressure/.test(ctxA)) fail('profile context lost');

// C: background biometric check
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('biometricsUpdated', { detail: { date: '2026-10-06', steps: 3200, sleep: 5.1 } }));
});
await page.waitForFunction(() => {
  const log = JSON.parse(localStorage.getItem('tendai_data_sent_log_v1') || '[]');
  return log.some((e) => /^C:/.test(e.requestType) && e.outcome);
}, { timeout: 20000 });
const reqC = requests.find((r) => /^SYSTEM PROMPT: Analyze/.test(r.body.message || ''));
if (!reqC) fail('no background (C) request captured');
if (reqC && (reqC.body.userProfile || reqC.body.system_state)) fail('background check sent more than biometrics');
if (!consoleTraces.length) fail('no console trace for background check');

const log = await getLog();
console.log('\nDATA-SENT LOG:\n' + JSON.stringify(log, null, 2));
console.log('CONSOLE TRACE:', consoleTraces[0] || '(none)');

const byType = (prefix) => log.filter((e) => e.requestType.startsWith(prefix));
const [eB] = byType('B:');
const eLocal = byType('profile-answer');
const [eA] = byType('A:');
const [eC] = byType('C:');
if (!eB || eB.outcome !== 'sent' || !eB.dataCategoriesIncluded.some((c) => /profile question being asked: Your Body · Sex at birth/i.test(c))) fail('B log entry wrong');
if (eB && eB.dataCategoriesIncluded.some((c) => /^ledger/.test(c))) fail('B log entry claims a ledger');
if (eLocal.length !== 3 || eLocal.some((e) => e.sentOffDevice !== false)) fail('expected 3 on-device profile-answer entries');
if (!eA || eA.outcome !== 'sent') fail('A log entry missing/outcome wrong');
const catsA = eA ? eA.dataCategoriesIncluded.join(' | ') : '';
for (const needle of [/message text \(40 chars\)/, /profile: age, (location, )?goals/, /ledger: 5 items/, /user_memory: 2 items \(Likes clean data; Prefers walking in the evening\)/, /health: Health conditions, Supplements/, /mind: Stress level, Anxiety/, /body: Sex at birth, Gender identity/, /recent app prompts/]) {
  if (!needle.test(catsA)) fail(`A categories missing ${needle}`);
}
if (!eC || eC.trigger !== 'automatic' || eC.outcome !== 'sent — result: warning returned' || !/biometrics \(raw values\): date, steps, sleep/.test(eC.dataCategoriesIncluded.join(' '))) fail('C log entry wrong');
if (log.some((e) => !/^\d{4}-\d{2}-\d{2}T/.test(e.timestamp))) fail('timestamp not ISO');

await page.screenshot({ path: path.join(outDir, 'task3-talk-after-checks-390.png'), clip: { x: 0, y: 0, width: VW, height: VH } });
await browser.close();
if (failed) process.exit(1);
console.log('TASK3_CHECKPOINT_OK');
