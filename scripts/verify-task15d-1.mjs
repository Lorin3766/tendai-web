/**
 * Task 15d-1 — Talk follow-up templates: declined vs answered wording.
 * Renders every proactive template for every value-echo field type and
 * declined/answered state; forbids bad interpolations.
 */
import {
  FOCUS_AREA_SIGNALS,
  signalsFor,
} from '../mobile-app/js/features/profile/focus-area-signals.js';
import {
  PROACTIVE_FOLLOWUP_TEMPLATES,
  buildProfileFollowUp,
  displayFollowUpValue,
  fieldLabelForPath,
  noteProfileFactsSeen,
  selectDueFollowUp,
  PROFILE_ANSWERED_CHIPS,
  PROFILE_DECLINED_CHIPS,
} from '../mobile-app/js/features/talk/follow-ups.js';

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const FORBIDDEN = [/prefer not/i, /rather not say/i, /mentioned about/i, /\{\{/, /undefined/, /null/];

const SAMPLE_ANSWERED = {
  'lifestyle.sleepDuration': '7-8h',
  'lifestyle.sleepQuality': 4,
  'body.physicalActivity': 'moderate',
  'lifestyle.dietType': 'omnivore',
  'lifestyle.eatingPattern': 'regular',
  'health.lastCheckup': '6-12months',
  'mind.stressLevel': 3,
  'goals.primaryGoals': 'energy',
  'health.smoking': 'never',
  'health.alcohol': 'rarely',
};

const SAMPLE_DECLINED = {
  'lifestyle.sleepDuration': 'prefer-not-say',
  'lifestyle.sleepQuality': 'prefer-not-say',
  'body.physicalActivity': 'prefer-not-say',
  'lifestyle.dietType': 'prefer-not-say',
  'lifestyle.eatingPattern': 'prefer-not-say',
  'health.lastCheckup': 'prefer-not-say',
  'mind.stressLevel': 'prefer-not-say',
  'goals.primaryGoals': 'prefer-not-say',
  'health.smoking': 'prefer-not-say',
  'health.alcohol': 'prefer-not-say',
};

const valueEchoSignals = [];
for (const [area, signals] of Object.entries(FOCUS_AREA_SIGNALS)) {
  for (const signal of signals) {
    if (signal.echo === 'value') valueEchoSignals.push({ area, signal });
  }
}
if (!valueEchoSignals.length) fail('no value-echo signals');

console.log('Templates:');
for (const t of PROACTIVE_FOLLOWUP_TEMPLATES) {
  console.log(`  - ${t.id}: ${t.description}`);
}

// Action template with a sample sentence
{
  const text = PROACTIVE_FOLLOWUP_TEMPLATES.find((t) => t.id === 'action').build({
    actionText: 'Try a short easy walk sometime this morning',
  });
  if (!text.includes('Last time you tried') || !text.includes('How did it go?')) {
    fail(`action template bad: ${text}`);
  }
  for (const re of FORBIDDEN) {
    if (re.test(text)) fail(`action template matched ${re}: ${text}`);
  }
}

for (const { area, signal } of valueEchoSignals) {
  const path = `${signal.section}.${signal.field}`;
  const fieldLabel = fieldLabelForPath(path);
  if (!fieldLabel) fail(`missing field label for ${path}`);

  const answeredValue = SAMPLE_ANSWERED[path];
  if (answeredValue == null) fail(`no sample answered value for ${path}`);

  const answered = buildProfileFollowUp({
    signal,
    area,
    stated: { stored: answeredValue, echo: 'x' },
    seenOn: '2026-10-25',
  });
  if (!answered || answered.profileState !== 'answered') fail(`answered build failed for ${path}`);
  if (!answered.text.includes(fieldLabel)) fail(`answered text missing label for ${path}: ${answered.text}`);
  if (!/^Last time you said .+ for .+\. Anything changed\?$/.test(answered.text)) {
    fail(`answered wording for ${path}: ${answered.text}`);
  }
  const shown = displayFollowUpValue(signal, answeredValue);
  if (!shown || !answered.text.includes(shown)) fail(`answered text missing value for ${path}: ${answered.text}`);
  for (const re of FORBIDDEN) {
    if (re.test(answered.text)) fail(`answered ${path} matched ${re}: ${answered.text}`);
  }
  if (answered.chips.map((c) => c.id).join(',') !== PROFILE_ANSWERED_CHIPS.map((c) => c.id).join(',')) {
    fail(`answered chips for ${path}`);
  }

  const declinedValue = SAMPLE_DECLINED[path];
  const declined = buildProfileFollowUp({
    signal,
    area,
    stated: { stored: declinedValue, echo: 'x' },
    seenOn: '2026-10-25',
  });
  if (!declined || declined.profileState !== 'declined') fail(`declined build failed for ${path}`);
  if (declined.text !== `Want to answer the ${fieldLabel} question now?`) {
    fail(`declined wording for ${path}: ${declined.text}`);
  }
  for (const re of FORBIDDEN) {
    if (re.test(declined.text)) fail(`declined ${path} matched ${re}: ${declined.text}`);
  }
  // Declined value must never appear in the sentence
  if (/prefer|rather not/i.test(declined.text)) fail(`declined value leaked for ${path}`);
  if (declined.chips.map((c) => c.id).join(',') !== PROFILE_DECLINED_CHIPS.map((c) => c.id).join(',')) {
    fail(`declined chips for ${path}`);
  }
}

// End-to-end selectDueFollowUp: declined sleep must not say "mentioned" / "prefer not"
{
  const profile = { lifestyle: { sleepDuration: 'prefer-not-say' } };
  const noted = noteProfileFactsSeen(profile, '2026-10-25', { answers: [], seen: [], deferrals: [] }, ['sleep']);
  const due = selectDueFollowUp({
    today: '2026-10-26',
    steps: [],
    profile,
    areas: ['sleep'],
    state: noted.state,
    muted: [],
    declinedFields: [],
  });
  if (!due || due.profileState !== 'declined') fail(`declined sleep due was ${JSON.stringify(due)}`);
  if (!/^Want to answer the Sleep duration question now\?$/.test(due.text)) {
    fail(`declined sleep text: ${due.text}`);
  }
  for (const re of FORBIDDEN) {
    if (re.test(due.text)) fail(`declined sleep matched ${re}`);
  }
}

{
  const profile = { lifestyle: { sleepDuration: '7-8h' } };
  const noted = noteProfileFactsSeen(profile, '2026-10-25', { answers: [], seen: [], deferrals: [] }, ['sleep']);
  const due = selectDueFollowUp({
    today: '2026-10-26',
    steps: [],
    profile,
    areas: ['sleep'],
    state: noted.state,
    muted: [],
    declinedFields: [],
  });
  if (!due || due.profileState !== 'answered') fail(`answered sleep due was ${JSON.stringify(due)}`);
  if (due.text !== 'Last time you said 7 to 8 hours for Sleep duration. Anything changed?') {
    fail(`answered sleep text: ${due.text}`);
  }
  for (const re of FORBIDDEN) {
    if (re.test(due.text)) fail(`answered sleep matched ${re}`);
  }
}

// Permanent field decline skips the follow-up
{
  const profile = { lifestyle: { sleepDuration: '7-8h' } };
  const noted = noteProfileFactsSeen(profile, '2026-10-25', { answers: [], seen: [], deferrals: [] }, ['sleep']);
  const due = selectDueFollowUp({
    today: '2026-10-26',
    steps: [],
    profile,
    areas: ['sleep'],
    state: noted.state,
    muted: [],
    declinedFields: ['lifestyle.sleepDuration'],
  });
  if (due) fail('permanently declined field still due');
}

// Declined older than 7 days is not due
{
  const profile = { lifestyle: { sleepDuration: 'prefer-not-say' } };
  const noted = noteProfileFactsSeen(profile, '2026-10-01', { answers: [], seen: [], deferrals: [] }, ['sleep']);
  const due = selectDueFollowUp({
    today: '2026-10-26',
    steps: [],
    profile,
    areas: ['sleep'],
    state: noted.state,
    muted: [],
    declinedFields: [],
  });
  if (due) fail('declined follow-up outside 7-day window still due');
}

console.log(`OK verify-task15d-1 (${valueEchoSignals.length} value-echo fields × answered/declined)`);
