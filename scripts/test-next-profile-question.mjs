/**
 * Dev-only checks for getNextProfileQuestion() — no UI.
 * Usage: node scripts/test-next-profile-question.mjs
 */
import {
  getProfileSchema,
  getProfileQuestionCatalog,
  getNextProfileQuestion,
} from '../mobile-app/js/features/profile/profile-schema.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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
  return q ? q.path : null;
}

const schema = getProfileSchema();
const catalog = getProfileQuestionCatalog();

for (const section of catalog) {
  assert(schema[section.key], `schema missing section ${section.key}`);
  for (const field of section.fields) {
    assert(
      Object.prototype.hasOwnProperty.call(schema[section.key], field.key),
      `schema missing ${section.key}.${field.key}`,
    );
  }
}

const fresh = getNextProfileQuestion({});
assert(pathOf(fresh) === 'body.sexAtBirth', `fresh expected body.sexAtBirth, got ${pathOf(fresh)}`);
assert(fresh.sectionLabel === 'Your Body', `fresh sectionLabel ${fresh.sectionLabel}`);
assert(fresh.fieldLabel === 'Sex at birth', `fresh fieldLabel ${fresh.fieldLabel}`);

const bodyPartial = getNextProfileQuestion({
  body: { sexAtBirth: 'female' },
});
assert(
  pathOf(bodyPartial) === 'body.genderIdentity',
  `partial body expected genderIdentity, got ${pathOf(bodyPartial)}`,
);

const mid = getNextProfileQuestion({ body: filledBody() });
assert(
  pathOf(mid) === 'health.healthConditions',
  `mid expected health.healthConditions, got ${pathOf(mid)}`,
);
assert(mid.sectionLabel === 'Your Health', `mid sectionLabel ${mid.sectionLabel}`);

const midMind = getNextProfileQuestion({
  body: filledBody(),
  health: filledHealth(),
});
assert(pathOf(midMind) === 'mind.stressLevel', `mid-mind expected mind.stressLevel, got ${pathOf(midMind)}`);

const complete = getNextProfileQuestion({
  body: filledBody(),
  health: filledHealth(),
  mind: filledMind(),
  lifestyle: filledLifestyle(),
  goals: filledGoals(),
});
assert(complete === null, `complete expected null, got ${JSON.stringify(complete)}`);

console.log('OK  fresh       →', `${fresh.sectionLabel} / ${fresh.fieldLabel} (${fresh.path})`);
console.log('OK  mid-profile →', `${mid.sectionLabel} / ${mid.fieldLabel} (${mid.path})`);
console.log('OK  complete    →', complete);
console.log('OK  extra walks →', `${bodyPartial.path}, ${midMind.path}`);
console.log(
  'Catalog counts:',
  catalog.map((s) => `${s.label}: ${s.fields.length}`).join(' | '),
);
