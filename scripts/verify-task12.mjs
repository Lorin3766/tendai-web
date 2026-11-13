/**
 * Task 12 — Talk reacts + payoff + vocabulary lint (no Gemini).
 * Usage: node scripts/verify-task12.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseProfileAnswer,
  classifyProfileReply,
  extractFlexibleNumbers,
  FORGIVING_NUMERIC_FIELDS,
  snoozeProfileFieldForSession,
  isProfileFieldSnoozedForSession,
  clearSessionSnoozedProfileFields,
  getClarifyTapOptions,
  normalizeSleepDuration,
  sleepDurationDisplay,
} from '../mobile-app/js/features/talk/profile-answer-parser.js';
import {
  assembleTalkPayoff,
  findBannedVocab,
  BANNED_USER_VOCAB,
  whyNextCoverageTable,
  whyNextLine,
  payoffHasJudgmentOrCause,
  factualHistoryLine,
  checkinRecapLine,
  feedCardKnowledgeLine,
  memoryLinkLine,
} from '../mobile-app/js/features/talk/talk-payoff.js';
import { calibrationLine, payoffEcho } from '../mobile-app/js/features/profile/focus-area-signals.js';
import { dataCollectionModePillLabel } from '../mobile-app/js/features/settings/data-collection-mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const sleepQ = {
  sectionKey: 'lifestyle',
  fieldKey: 'sleepDuration',
  path: 'lifestyle.sleepDuration',
  fieldLabel: 'Sleep duration',
  sectionLabel: 'Lifestyle & Habits',
};

console.log('12a forgiving parse…');
for (const [t, expect] of [
  ['7 or 8', '7-8h'],
  ['7-8', '7-8h'],
  ['about 7', '7-8h'],
  ['seven', '7-8h'],
  ['7 to 8', '7-8h'],
]) {
  const r = parseProfileAnswer(sleepQ, t);
  assert.equal(r.ok, true, `parse ${t}`);
  assert.equal(r.value, expect, `value ${t}`);
  assert.equal(typeof r.value, 'string', `bucket string ${t}`);
  assert.equal(classifyProfileReply(sleepQ, t).kind, 'save');
}
// ONE storage format: typed + taps both → '7-8h' (never midpoint number / bare "7-8")
assert.equal(parseProfileAnswer(sleepQ, '7 or 8').value, '7-8h');
assert.equal(getClarifyTapOptions(sleepQ).find((t) => t.value === '7-8h')?.value, '7-8h');
assert.equal(normalizeSleepDuration(7.5), '7-8h');
assert.equal(normalizeSleepDuration('7-8'), '7-8h');
assert.equal(normalizeSleepDuration('7-8h'), '7-8h');
assert.equal(sleepDurationDisplay(7.5), '7 to 8 hours');
assert.equal(sleepDurationDisplay('7-8'), '7 to 8 hours');
assert.ok(/7 to 8 hours/.test(payoffEcho({ lifestyle: { sleepDuration: 7.5 } }, 'sleep')));
assert.ok(/7 to 8 hours/.test(payoffEcho({ lifestyle: { sleepDuration: '7-8' } }, 'sleep')));
assert.ok(/7 to 8 hours/.test(payoffEcho({ lifestyle: { sleepDuration: '7-8h' } }, 'sleep')));
assert.equal(classifyProfileReply(sleepQ, "I'd rather not say").kind, 'save');
assert.equal(classifyProfileReply(sleepQ, 'I have a headache today').kind, 'message');
assert.equal(classifyProfileReply(sleepQ, 'xyz').kind, 'clarify');
assert.ok(FORGIVING_NUMERIC_FIELDS.includes('lifestyle.sleepDuration'));
assert.ok(extractFlexibleNumbers('around 7.5')?.values?.[0] === 7.5);

const taps = getClarifyTapOptions(sleepQ);
assert.ok(taps.some((t) => t.value === '7-8h'));
console.log('  tap→stored map sample:', taps.map((t) => `${t.label}=${t.value}`).join(', '));
console.log('  forgiving fields:', FORGIVING_NUMERIC_FIELDS.join(', '));

clearSessionSnoozedProfileFields();
snoozeProfileFieldForSession(sleepQ.path);
assert.equal(isProfileFieldSnoozedForSession(sleepQ.path), true);
clearSessionSnoozedProfileFields();

// Nonsense twice → clarify then (caller) snooze; second classify still clarify until snoozed
assert.equal(classifyProfileReply(sleepQ, 'asdfgh').kind, 'clarify');
assert.equal(classifyProfileReply(sleepQ, 'qwerty').kind, 'clarify');

console.log('12b payoff assembly…');
const fakeProfile = {
  lifestyle: { sleepDuration: '7-8h' },
};
const payoff = assembleTalkPayoff({
  echoRaw: '7 or 8',
  profile: fakeProfile,
  answeredPath: 'lifestyle.sleepDuration',
  answeredFieldKey: 'sleepDuration',
  nextQuestion: {
    path: 'lifestyle.sleepQuality',
    fieldKey: 'sleepQuality',
    fieldLabel: 'Sleep quality',
  },
  changedAreaIds: ['sleep'],
  claimLine: 'Added to your Sleep & Recovery card.',
});
assert.ok(payoff.lines.some((l) => /You said/.test(l)), 'echo');
assert.ok(payoff.lines.some((l) => /Added to your/.test(l)), 'claim');
assert.ok(payoff.lines.some((l) => /With this I know/.test(l)), 'memory');
assert.ok(payoff.lines.some((l) => /Next/.test(l)), 'why-next');
for (const line of payoff.lines) {
  assert.equal(payoffHasJudgmentOrCause(line), false, `no judgment: ${line}`);
  assert.deepEqual(findBannedVocab(line), [], `no banned vocab: ${line}`);
}

const knowledge = feedCardKnowledgeLine(fakeProfile, 'sleep');
assert.ok(/I know 1 thing about your/.test(knowledge), knowledge);

const cal = calibrationLine(fakeProfile, 'sleep');
assert.deepEqual(findBannedVocab(cal), []);
assert.equal(/Calibration|signals|Stage |Baseline|Human OS/i.test(cal), false, cal);

const pill = dataCollectionModePillLabel(false);
assert.deepEqual(findBannedVocab(pill), []);
assert.equal(/Baseline|Manual Baseline/i.test(pill), false, pill);

const mem = memoryLinkLine(fakeProfile, ['sleep']);
assert.ok(/With this I know 1 thing/.test(mem));

const recap = checkinRecapLine(
  { sleepHours: 7 },
  { sleepHours: 6 },
);
assert.ok(/Saved:/.test(recap));
assert.ok(/Yesterday 6 h, today 7 h/.test(recap));
assert.equal(factualHistoryLine('sleepHours'), ''); // <3 days → empty

// ≥3 days → factual counts only
{
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ date: key, sleepHours: 6 + (i % 3) });
  }
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k === 'tendai_checkin_history_v1' ? JSON.stringify({ days }) : null),
    setItem() {},
    removeItem() {},
  };
  const line = factualHistoryLine('sleepHours');
  assert.ok(/You logged sleep on 7 of the last 7 days; between \d+ and \d+ hours\./.test(line), line);
  assert.equal(payoffHasJudgmentOrCause(line), false);
  globalThis.localStorage = prev;
}

const whyTable = whyNextCoverageTable();
assert.ok(whyTable.length > 20, 'why-next coverage');
console.log(`  why-next rows: ${whyTable.length}; specific: ${whyTable.filter((r) => r.hasSpecific).length}`);
// No template → omit (never camelCase field names like fooBarBaz)
assert.equal(
  whyNextLine('goals.wantFromTendAI', { path: 'body.sexAtBirth', fieldLabel: 'sexAtBirth' }),
  '',
);
assert.equal(whyNextLine('no.such', { path: 'body.fooBarBaz', fieldLabel: 'fooBarBaz' }), '');
const missingTemplates = whyTable.filter((r) => r.next && !r.hasSpecific);
for (const row of missingTemplates) {
  assert.equal(row.template, '', `fallback must be empty for ${row.answered}→${row.next}`);
}
console.log(`  why-next omitted (no template): ${missingTemplates.length}`);

console.log('12b vocabulary lint (UI string literals)…');
/** Extract JS string/template literals (best-effort; skips comments). */
function extractLiterals(src) {
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out = [];
  const re = /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g;
  let m;
  while ((m = re.exec(withoutComments))) {
    out.push(m[0].slice(1, -1));
  }
  return out;
}

const scanJs = [
  'mobile-app/components/talk.js',
  'mobile-app/js/features/feed/universal-agent-card.js',
  'mobile-app/js/features/feed/agent-reports-feed.js',
  'mobile-app/js/features/profile/focus-area-signals.js',
  'mobile-app/js/features/settings/data-collection-mode.js',
];
for (const rel of scanJs) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const lit of extractLiterals(src)) {
    // Skip LLM system-prompt constants (not user-visible UI).
    if (/wearable sensors|health-stack|Talk-first \/ Manual tracking/i.test(lit)) continue;
    const hits = findBannedVocab(lit);
    if (hits.length) {
      throw new Error(`${rel} user-visible literal still has banned vocab [${hits.join(', ')}]: ${lit.slice(0, 120)}`);
    }
    if (lit.trim() === 'Baseline' || /Manual Baseline/.test(lit)) {
      throw new Error(`${rel} still has Baseline in UI literal: ${lit.slice(0, 120)}`);
    }
  }
}
// HTML: strip comments, then fail if banned phrases remain in markup text.
const htmlRaw = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8');
const htmlNoComments = htmlRaw.replace(/<!--[\s\S]*?-->/g, '');
for (const banned of BANNED_USER_VOCAB) {
  if (htmlNoComments.includes(banned)) {
    throw new Error(`index.html still has banned vocab: ${banned}`);
  }
}
assert.equal(/Adaptive agent feed|Manual Baseline|Human OS|Calibration:\s*\d/i.test(htmlNoComments), false);

console.log('12a opening singleton key present…');
const talkSrc = fs.readFileSync(path.join(root, 'mobile-app/components/talk.js'), 'utf8');
assert.ok(/OPENING_SHOWN_SESSION_KEY|openingShown|sessionStorage/.test(talkSrc), 'opening session guard');
assert.equal(talkSrc.includes('Confirm — I want to prioritize this in my Human OS today'), false);

console.log('12a/12b Gemini: no new fetch paths from payoff/parser…');
const parserSrc = fs.readFileSync(
  path.join(root, 'mobile-app/js/features/talk/profile-answer-parser.js'),
  'utf8',
);
const payoffSrc = fs.readFileSync(
  path.join(root, 'mobile-app/js/features/talk/talk-payoff.js'),
  'utf8',
);
assert.equal(/fetch\(|sendMessageToLLM|gemini/i.test(parserSrc), false);
assert.equal(/fetch\(|sendMessageToLLM|gemini/i.test(payoffSrc), false);

console.log('12c layout: mobile footer hidden + About links + bottom padding…');
const css = fs.readFileSync(path.join(root, 'mobile-app/styles/components.css'), 'utf8');
assert.ok(/app-footer--desktop-only/.test(css) || /\.app-footer[\s\S]*display:\s*none/.test(css));
assert.ok(/88px \+ env\(safe-area-inset-bottom/.test(css));
const html = fs.readFileSync(path.join(root, 'mobile-app/index.html'), 'utf8');
assert.ok(/settings-about-links/.test(html));
assert.ok(/app-footer--desktop-only/.test(html));
assert.ok(/Contact details will appear here/.test(html), 'email placeholder SKIP kept honest');

console.log('OK verify-task12');
