/**
 * Part 1 verification: getNextProfileQuestion() — data layer only.
 * Usage: node scripts/test-next-profile-question.mjs
 */
import {
  getProfileSchema,
  getProfileQuestionCatalog,
  getNextProfileQuestion,
} from '../mobile-app/js/features/profile/profile-schema.js';

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
}

function filledBody() {
  return {
    sexAtBirth: 'male',
    genderIdentity: 'man',
    age: 43,
    height: 180,
    weight: 82,
    bodyBuild: 'average',
    bloodType: 'O+',
    physicalActivity: 'moderate',
    regularDiscomfort: ['none'],
    goalsFocus: 'maintenance',
    goalsPriority: 4,
  };
}

function filledHealth() {
  return {
    healthConditions: ['none'],
    prescriptionMedications: 'no',
    supplements: ['none'],
    smoking: 'never',
    alcohol: 'rarely',
    lastCheckup: '6-12months',
    goalsFocus: 'energy',
    goalsPriority: 3,
    goalsConstraints: ['short-answers'],
  };
}

function filledMind() {
  return {
    stressLevel: 2,
    mentalEnergy: 2,
    anxietyFrequency: 'rarely',
    moodChanges: 'stable',
    wantToImproveFocus: 'yes',
    goalsFocus: 'focus',
    goalsPriority: 3,
  };
}

function filledLifestyle() {
  return {
    eatingPattern: 'regular',
    dietType: 'balanced',
    enoughProtein: 'yes',
    sugarSweets: 'moderate',
    lateEating: 'rarely',
    hydration: 'good',
    sleepDuration: '7-8h',
    sleepQuality: 4,
    goalsFocus: 'sleep',
    goalsPriority: 3,
  };
}

function filledGoals() {
  return {
    primaryGoals: ['energy', 'longevity'],
    motivationLevel: 4,
    wantFromTendAI: ['gentle-guidance'],
  };
}

function pathOf(q) {
  return q == null ? null : q.path;
}

function expectPath(name, profile, expected) {
  const q = getNextProfileQuestion(profile);
  const actual = pathOf(q);
  const passed = actual === expected;
  record(
    name,
    passed,
    passed
      ? actual === null
        ? 'null (profile complete)'
        : `${q.sectionLabel} / ${q.fieldLabel} (${actual})`
      : `expected ${expected}, got ${actual}`,
  );
}

const schema = getProfileSchema();
const catalog = getProfileQuestionCatalog();

let catalogOk = true;
const missing = [];
for (const section of catalog) {
  if (!schema[section.key]) {
    catalogOk = false;
    missing.push(section.key);
    continue;
  }
  for (const field of section.fields) {
    if (!Object.prototype.hasOwnProperty.call(schema[section.key], field.key)) {
      catalogOk = false;
      missing.push(`${section.key}.${field.key}`);
    }
  }
}
record(
  'Catalog keys exist on schema (no invented fields)',
  catalogOk,
  catalogOk
    ? catalog.map((s) => `${s.label}: ${s.fields.length}`).join(' | ')
    : `missing: ${missing.join(', ')}`,
);

record(
  'Section walk order',
  catalog.map((s) => s.key).join(',') === 'body,health,mind,lifestyle,goals',
  catalog.map((s) => s.label).join(' → '),
);

// --- required checkpoints ---
expectPath('All fields empty (fresh user)', {}, 'body.sexAtBirth');
expectPath('Empty object body/health/mind/lifestyle/goals', {
  body: {},
  health: {},
  mind: {},
  lifestyle: {},
  goals: {},
}, 'body.sexAtBirth');
expectPath('Omitted profile (undefined)', undefined, 'body.sexAtBirth');

expectPath('Partial: only sexAtBirth filled', {
  body: { sexAtBirth: 'female' },
}, 'body.genderIdentity');

expectPath('Partial: Body complete, rest empty', {
  body: filledBody(),
}, 'health.healthConditions');

expectPath('Partial: Body + Health complete', {
  body: filledBody(),
  health: filledHealth(),
}, 'mind.stressLevel');

expectPath('Partial: through Mind, Lifestyle next', {
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
}, 'lifestyle.eatingPattern');

expectPath('Partial: through Lifestyle, Goals next', {
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
  lifestyle: filledLifestyle(),
}, 'goals.primaryGoals');

expectPath('All fields filled (complete profile)', {
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
  lifestyle: filledLifestyle(),
  goals: filledGoals(),
}, null);

// --- extra edge cases ---
expectPath('Empty arrays do not count as answered', {
  body: { ...filledBody(), regularDiscomfort: [] },
}, 'body.regularDiscomfort');

expectPath('Placeholder string is unanswered', {
  body: { ...filledBody(), bloodType: 'Select...' },
}, 'body.bloodType');

expectPath('goalsPriority default 2 is unanswered', {
  body: { ...filledBody(), goalsPriority: 2 },
}, 'body.goalsPriority');

expectPath('stressLevel default 3 is unanswered', {
  body: filledBody(),
  health: filledHealth(),
  mind: { ...filledMind(), stressLevel: 3 },
}, 'mind.stressLevel');

expectPath('Whitespace-only string is unanswered', {
  body: { ...filledBody(), bodyBuild: '   ' },
}, 'body.bodyBuild');

expectPath('Does not skip ahead to a later hole', {
  body: { sexAtBirth: 'male', age: 43 },
}, 'body.genderIdentity');

expectPath('Last Goals field empty after everything else', {
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
  lifestyle: filledLifestyle(),
  goals: { ...filledGoals(), wantFromTendAI: [] },
}, 'goals.wantFromTendAI');

expectPath('Legacy-only body fields do not satisfy modal catalog', {
  body: { gender: 'male', goalFocus: 'weight-loss', intensity: 3 },
}, 'body.sexAtBirth');

const failed = results.filter((r) => !r.passed);
console.log('\n=== Part 1 — getNextProfileQuestion() verification ===\n');
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`      ${r.detail}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exit(1);
}
