// Serron — Proactive Talk: parse a free-text reply into a profile-modal field value.
// Isolated from free-form chat. Simple matching only — ambiguous replies ask a follow-up.

import { profileState } from '../../state.js';
import { isProfileFieldAnswered } from '../profile/profile-schema.js';
import { feetInToCm, lbToKg } from '../storage/units.js';
import {
  hoursToSleepBucket,
  normalizeSleepDuration,
} from '../profile/sleep-duration.js';

export {
  SLEEP_DURATION_BUCKETS,
  hoursToSleepBucket,
  normalizeSleepDuration,
  sleepDurationDisplay,
} from '../profile/sleep-duration.js';

function opt(value, label, aliases = []) {
  return { value, label, aliases };
}

function choice(ask, options) {
  return { type: 'choice', ask, options };
}

function multi(ask, options) {
  return { type: 'multi', ask, options };
}

function ageField(ask) {
  return { type: 'age', ask, min: 18, max: 90 };
}

function heightField(ask) {
  return { type: 'height', ask, min: 140, max: 210 };
}

function weightField(ask) {
  return { type: 'weight', ask, min: 40, max: 150 };
}

function scaleField(ask, min, max, forbidden, words) {
  return { type: 'scale', ask, min, max, forbidden: forbidden || [], words: words || {} };
}

const YES_NO_PNTS = [
  opt('yes', 'Yes', ['yes', 'y', 'yeah', 'yep', 'i do', 'i am']),
  opt('no', 'No', ['no', 'n', 'nope', 'i don\'t', 'i do not', 'nah']),
  opt('prefer-not-say', 'Prefer not to say', ['prefer not to say', 'rather not', 'rather not say', 'skip', 'private']),
];

const YES_NO_NOT_SURE = [
  opt('yes', 'Yes', ['yes', 'y', 'yeah', 'yep']),
  opt('no', 'No', ['no', 'n', 'nope']),
  opt('not-sure', 'Not sure', ['not sure', 'unsure', 'don\'t know', 'dont know', 'idk', 'no idea']),
];

const RARE_SOME_OFTEN = [
  opt('rarely', 'Rarely', ['rarely', 'rare', 'almost never', 'seldom', 'not really']),
  opt('sometimes', 'Sometimes', ['sometimes', 'occasionally', 'now and then']),
  opt('often', 'Often', ['often', 'frequently', 'a lot', 'regularly']),
];

/** Field specs keyed by `sectionKey.fieldKey`. Values match profile-modals option values. */
const FIELD_SPECS = {
  'body.sexAtBirth': choice(
    'Were you recorded male or female at birth, or would you rather not say?',
    [
      opt('male', 'Male', ['male', 'man', 'boy', 'm', 'assigned male']),
      opt('female', 'Female', ['female', 'woman', 'girl', 'f', 'assigned female']),
      opt('prefer-not-say', 'Prefer not to say', ['prefer not to say', 'rather not', 'rather not say', 'skip', 'private']),
    ],
  ),
  'body.genderIdentity': choice(
    'How do you describe your gender identity?',
    [
      opt('man', 'Man', ['man', 'male', 'masculine']),
      opt('woman', 'Woman', ['woman', 'female', 'feminine']),
      opt('non-binary', 'Non-binary', ['non-binary', 'nonbinary', 'non binary', 'enby', 'nb']),
      opt('prefer-not-say', 'Prefer not to say', ['prefer not to say', 'rather not', 'rather not say', 'skip', 'private']),
    ],
  ),
  'body.age': ageField('How old are you?'),
  'body.height': heightField('About how tall are you?'),
  'body.weight': weightField('About how much do you weigh?'),
  'body.bodyBuild': choice(
    'How would you describe your body build?',
    [
      opt('lean', 'Lean', ['lean', 'slim', 'skinny', 'thin']),
      opt('average', 'Average', ['average', 'medium', 'normal', 'typical']),
      opt('stocky', 'Stocky', ['stocky', 'solid', 'sturdy', 'athletic']),
      opt('overweight', 'Overweight', ['overweight', 'heavy', 'larger']),
      opt('not-sure', 'Not sure', ['not sure', 'unsure', 'don\'t know', 'dont know', 'idk']),
    ],
  ),
  'body.bloodType': choice(
    'Do you know your blood type?',
    [
      opt('A+', 'A+', ['a+', 'a positive', 'a plus']),
      opt('A-', 'A-', ['a-', 'a negative', 'a minus']),
      opt('B+', 'B+', ['b+', 'b positive', 'b plus']),
      opt('B-', 'B-', ['b-', 'b negative', 'b minus']),
      opt('AB+', 'AB+', ['ab+', 'ab positive', 'ab plus']),
      opt('AB-', 'AB-', ['ab-', 'ab negative', 'ab minus']),
      opt('O+', 'O+', ['o+', 'o positive', 'o plus', 'type o+', 'type o positive']),
      opt('O-', 'O-', ['o-', 'o negative', 'o minus', 'type o-', 'type o negative']),
      opt('not-sure', 'Not sure', ['not sure', 'unsure', 'don\'t know', 'dont know', 'idk', 'no idea', 'unknown']),
    ],
  ),
  'body.physicalActivity': choice(
    'How active is a typical week for you?',
    [
      opt('sedentary', 'Sedentary', ['sedentary', 'inactive', 'desk', 'not active', 'hardly any']),
      opt('light', 'Light', ['light', 'lightly', 'a little', 'walks']),
      opt('moderate', 'Moderate', ['moderate', 'moderately', 'some exercise', 'few times']),
      opt('very-active', 'Very active', ['very active', 'very-active', 'athletic', 'train a lot', 'daily exercise']),
    ],
  ),
  'body.regularDiscomfort': multi(
    'Any regular aches or discomfort I should know about?',
    [
      opt('back', 'Back', ['back', 'spine', 'lower back']),
      opt('knees', 'Knees', ['knee', 'knees']),
      opt('neck', 'Neck', ['neck']),
      opt('shoulders', 'Shoulders', ['shoulder', 'shoulders']),
      opt('none', 'None', ['none', 'no', 'nothing', 'nope', 'no aches', 'no discomfort']),
    ],
  ),
  'body.goalsFocus': choice(
    'What body goal matters most right now?',
    [
      opt('weight-loss', 'Weight loss', ['weight loss', 'lose weight', 'fat loss']),
      opt('muscle-gain', 'Muscle gain', ['muscle', 'gain muscle', 'build muscle']),
      opt('strength', 'Strength improvement', ['strength', 'get stronger']),
      opt('endurance', 'Endurance', ['endurance', 'stamina', 'cardio']),
      opt('flexibility', 'Flexibility', ['flexibility', 'mobility', 'stretch']),
      opt('maintenance', 'Maintenance', ['maintenance', 'maintain', 'stay as i am', 'keep it']),
    ],
  ),
  'body.goalsPriority': scaleField(
    'On a 1–4 scale, how important is that body goal right now? 1 is low, 4 is top priority.',
    1,
    4,
    [2],
    { low: 1, high: 4, top: 4, 'top priority': 4, important: 4 },
  ),
  'health.healthConditions': multi(
    'Have you ever been told you have a heart condition, high blood pressure, high cholesterol, diabetes, or thyroid issues — or none of those?',
    [
      opt('heart', 'Heart condition', ['heart', 'cardiac']),
      opt('blood-pressure', 'High blood pressure', ['blood pressure', 'hypertension', 'high bp', 'bp']),
      opt('cholesterol', 'High cholesterol', ['cholesterol']),
      opt('diabetes', 'Diabetes', ['diabetes', 'diabetic']),
      opt('thyroid', 'Thyroid issues', ['thyroid']),
      opt('none', 'None', ['none', 'nothing', 'nope', 'no conditions']),
      opt('prefer-not-say', 'Prefer not to say', ['prefer not to say', 'rather not', 'skip', 'private']),
    ],
  ),
  'health.prescriptionMedications': choice(
    'Are you on any prescription medications, or would you rather not say?',
    YES_NO_PNTS,
  ),
  'health.supplements': multi(
    'Do you take any supplements — vitamins, omega-3, magnesium, protein — or none?',
    [
      opt('vitamins', 'Vitamins', ['vitamin', 'vitamins', 'multivitamin']),
      opt('omega3', 'Omega-3', ['omega', 'omega-3', 'omega 3', 'fish oil']),
      opt('magnesium', 'Magnesium', ['magnesium']),
      opt('protein', 'Protein', ['protein', 'whey', 'protein powder']),
      opt('none', 'None', ['none', 'nothing', 'nope', 'no supplements']),
    ],
  ),
  'health.smoking': choice(
    'Do you smoke — never, formerly, or currently?',
    [
      opt('never', 'Never', ['never', 'no', 'nope', 'i don\'t', 'non-smoker', 'nonsmoker']),
      opt('former', 'Former', ['former', 'used to', 'quit', 'ex-smoker', 'stopped']),
      opt('current', 'Current', ['current', 'yes', 'i smoke', 'smoker']),
    ],
  ),
  'health.alcohol': choice(
    'How often do you drink alcohol — rarely, 1–2 times a week, 3+ times a week, or rather not say?',
    [
      opt('rarely', 'Rarely', ['rarely', 'rare', 'almost never', 'seldom', 'socially']),
      opt('1-2x-week', '1–2× week', ['1-2', '1 to 2', 'once or twice', 'couple times', '1–2', 'once a week', 'twice a week']),
      opt('3+x-week', '3+× week', ['3+', '3 or more', 'three or more', 'often', 'most days', 'daily']),
      opt('prefer-not-say', 'Prefer not to say', ['prefer not to say', 'rather not', 'skip', 'private']),
    ],
  ),
  'health.lastCheckup': choice(
    'When was your last general checkup — within 6 months, 6–12 months, over a year ago, or never?',
    [
      opt('<6months', '<6 months', ['<6', 'less than 6', 'recent', 'few months', 'this year', 'recently']),
      opt('6-12months', '6–12 months', ['6-12', '6 to 12', 'about a year', 'last year']),
      opt('>1year', '>1 year', ['over a year', 'more than a year', 'years ago', '>1']),
      opt('never', 'Never', ['never', 'haven\'t', 'have not']),
    ],
  ),
  'health.goalsFocus': choice(
    'What do you want to improve first in your health?',
    [
      opt('cholesterol', 'Cholesterol / Lab results', ['cholesterol', 'labs', 'lab results']),
      opt('heart', 'Heart & blood pressure', ['heart', 'blood pressure', 'bp']),
      opt('energy', 'Energy & fatigue', ['energy', 'fatigue', 'tired']),
      opt('digestion', 'Digestion', ['digestion', 'gut', 'stomach']),
      opt('weight', 'Weight management', ['weight']),
      opt('sleep', 'Sleep quality', ['sleep']),
      opt('longevity', 'Longevity focus', ['longevity', 'long term', 'long-term']),
    ],
  ),
  'health.goalsPriority': scaleField(
    'On a 1–4 scale, how important is that health focus right now? 1 is low, 4 is top priority.',
    1,
    4,
    [2],
    { low: 1, high: 4, top: 4, 'top priority': 4 },
  ),
  'health.goalsConstraints': multi(
    'Anything I should keep in mind — short answers, evidence-based only, or avoid medical wording?',
    [
      opt('short-answers', 'I prefer short answers', ['short', 'brief', 'concise']),
      opt('evidence-based', 'I want evidence-based tips only', ['evidence', 'science', 'research']),
      opt('avoid-medical', 'Avoid medical wording (diagnose/treat)', ['avoid medical', 'no medical', 'don\'t diagnose', 'dont diagnose']),
    ],
  ),
  'mind.stressLevel': scaleField(
    'On a 1–5 scale, how stressed do you feel lately? 1 is very calm, 5 is very stressed.',
    1,
    5,
    [3],
    {
      'very calm': 1, calm: 1, relaxed: 1, peaceful: 1,
      'pretty calm': 2, 'fairly calm': 2, low: 2,
      'fairly stressed': 4, 'pretty stressed': 4, high: 4,
      'very stressed': 5, 'extremely stressed': 5, overwhelmed: 5,
    },
  ),
  'mind.mentalEnergy': scaleField(
    'On a 1–5 scale, how’s your mental energy? 1 is clear, 5 is exhausted.',
    1,
    5,
    [],
    {
      clear: 1, sharp: 1, focused: 1,
      good: 2, 'pretty clear': 2,
      ok: 3, okay: 3, medium: 3, average: 3,
      tired: 4, foggy: 4, low: 4,
      exhausted: 5, drained: 5, 'wiped out': 5,
    },
  ),
  'mind.anxietyFrequency': choice('How often do you feel anxious — rarely, sometimes, or often?', RARE_SOME_OFTEN),
  'mind.moodChanges': choice(
    'Are your mood changes usually stable, sometimes, or often?',
    [
      opt('stable', 'Stable', ['stable', 'steady', 'even', 'consistent']),
      opt('sometimes', 'Sometimes', ['sometimes', 'occasionally']),
      opt('often', 'Often', ['often', 'frequently', 'a lot', 'swings']),
    ],
  ),
  'mind.wantToImproveFocus': choice('Would you like to improve your focus?', YES_NO_NOT_SURE),
  'mind.goalsFocus': choice(
    'What mental aspect matters most right now?',
    [
      opt('stress', 'Stress management', ['stress']),
      opt('focus', 'Focus & concentration', ['focus', 'concentration']),
      opt('mood', 'Mood stability', ['mood']),
      opt('sleep', 'Sleep quality', ['sleep']),
      opt('anxiety', 'Anxiety reduction', ['anxiety']),
      opt('balance', 'Overall balance', ['balance', 'overall']),
    ],
  ),
  'mind.goalsPriority': scaleField(
    'On a 1–4 scale, how important is that mental focus right now? 1 is low, 4 is top priority.',
    1,
    4,
    [2],
    { low: 1, high: 4, top: 4, 'top priority': 4 },
  ),
  'lifestyle.eatingPattern': choice(
    'How would you describe your eating pattern — regular, irregular, often skipping meals, or not sure?',
    [
      opt('regular', 'Regular', ['regular', 'consistent', 'three meals', 'on a schedule']),
      opt('irregular', 'Irregular', ['irregular', 'inconsistent', 'varies']),
      opt('skipping', 'Skipping', ['skipping', 'skip meals', 'skip breakfast']),
      opt('not-sure', 'Not sure', ['not sure', 'unsure', 'idk']),
    ],
  ),
  'lifestyle.dietType': choice(
    'What diet type is closest — balanced, low-carb, high-protein, vegetarian, vegan, or not sure?',
    [
      opt('balanced', 'Balanced', ['balanced', 'normal', 'everything', 'omnivore']),
      opt('low-carb', 'Low-carb', ['low-carb', 'low carb', 'keto']),
      opt('high-protein', 'High-protein', ['high-protein', 'high protein']),
      opt('vegetarian', 'Vegetarian', ['vegetarian']),
      opt('vegan', 'Vegan', ['vegan']),
      opt('not-sure', 'Not sure', ['not sure', 'unsure', 'idk']),
    ],
  ),
  'lifestyle.enoughProtein': choice(
    'Do you think you get enough protein — yes, probably low, or not sure?',
    [
      opt('yes', 'Yes', ['yes', 'enough', 'plenty']),
      opt('probably-low', 'Probably low', ['probably low', 'low', 'not enough', 'too little']),
      opt('not-sure', 'Not sure', ['not sure', 'unsure', 'idk']),
    ],
  ),
  'lifestyle.sugarSweets': choice(
    'How often do you have sugar and sweets — rarely, moderately, or often?',
    [
      opt('rarely', 'Rarely', ['rarely', 'rare', 'almost never', 'seldom']),
      opt('moderate', 'Moderate', ['moderate', 'moderately', 'sometimes', 'average']),
      opt('often', 'Often', ['often', 'a lot', 'frequently', 'daily']),
    ],
  ),
  'lifestyle.lateEating': choice('How often do you eat late — rarely, sometimes, or often?', RARE_SOME_OFTEN),
  'lifestyle.hydration': choice(
    'How’s your hydration — low, medium, good, or not sure?',
    [
      opt('low', 'Low', ['low', 'not enough', 'dehydrated', 'barely']),
      opt('medium', 'Medium', ['medium', 'ok', 'okay', 'average']),
      opt('good', 'Good', ['good', 'plenty', 'well hydrated', 'lots of water']),
      opt('not-sure', 'Not sure', ['not sure', 'unsure', 'idk']),
    ],
  ),
  'lifestyle.sleepDuration': choice(
    'How many hours do you usually sleep — under 6, 6–7, 7–8, or 8+?',
    [
      opt('<6h', '<6h', ['<6', 'under 6', 'less than 6', '5 hours', 'five hours']),
      opt('6-7h', '6–7h', ['6-7', '6 to 7', 'six to seven', '6 hours', 'six hours']),
      opt('7-8h', '7–8h', ['7-8', '7 to 8', '7 or 8', 'seven to eight', 'seven or eight', '7 hours', 'seven hours']),
      opt('8h+', '8h+', ['8+', '8 plus', 'more than 8', 'over 8', '8 or more', '9 hours', 'eight hours', 'eight']),
      opt('prefer-not-say', 'Prefer not to say', ['prefer not to say', 'rather not', 'rather not say', 'skip', 'private']),
    ],
  ),
  'lifestyle.sleepQuality': scaleField(
    'On a 1–5 scale, how’s your sleep quality? 1 is poor, 5 is excellent.',
    1,
    5,
    [],
    {
      poor: 1, bad: 1, terrible: 1,
      'not great': 2, meh: 2,
      ok: 3, okay: 3, average: 3, fine: 3,
      good: 4, decent: 4,
      excellent: 5, great: 5, amazing: 5,
    },
  ),
  'lifestyle.goalsFocus': choice(
    'What lifestyle change matters most right now?',
    [
      opt('sleep', 'Sleep routine', ['sleep']),
      opt('activity', 'Physical activity', ['activity', 'exercise', 'movement']),
      opt('nutrition', 'Nutrition habits', ['nutrition', 'diet', 'eating']),
      opt('stress', 'Stress management', ['stress']),
      opt('balance', 'Work-life balance', ['balance', 'work-life', 'work life']),
    ],
  ),
  'lifestyle.goalsPriority': scaleField(
    'On a 1–4 scale, how important is that lifestyle change right now? 1 is low, 4 is top priority.',
    1,
    4,
    [2],
    { low: 1, high: 4, top: 4, 'top priority': 4 },
  ),
  'goals.primaryGoals': multi(
    'What are your primary goals — energy, heart health, stress reduction, longevity, better sleep, or weight balance?',
    [
      opt('energy', 'Energy', ['energy']),
      opt('heart-health', 'Heart health', ['heart']),
      opt('stress-reduction', 'Stress reduction', ['stress']),
      opt('longevity', 'Longevity', ['longevity', 'long term', 'long-term']),
      opt('better-sleep', 'Better sleep', ['sleep']),
      opt('weight-balance', 'Weight balance', ['weight']),
    ],
  ),
  'goals.motivationLevel': scaleField(
    'On a 1–5 scale, how motivated do you feel right now? 1 is low, 5 is high.',
    1,
    5,
    [],
    { low: 1, unmotivated: 1, medium: 3, average: 3, ok: 3, high: 5, very: 5, pumped: 5 },
  ),
  'goals.wantFromTendAI': multi(
    'What do you want from me — gentle guidance, daily reminders, understanding your body, long-term health, or light accountability?',
    [
      opt('gentle-guidance', 'Gentle guidance', ['gentle', 'guidance']),
      opt('daily-reminders', 'Daily reminders', ['reminders', 'nudge', 'nudges']),
      opt('understand-body', 'Understand my body', ['understand', 'body']),
      opt('long-term-health', 'Long-term health', ['long-term', 'long term', 'longevity']),
      opt('light-accountability', 'Light accountability', ['accountability', 'check in', 'check-in']),
    ],
  ),
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS = {
  zero: 0, oh: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const PREFER_NOT_RE = /\b(prefer not to say|rather not(?: say)?|i'?d rather not|skip(?: this)?|private)\b/i;

/** Numeric profile fields that use forgiving number / range parsing. */
export const FORGIVING_NUMERIC_FIELDS = [
  'body.age',
  'body.height',
  'body.weight',
  'body.goalsPriority',
  'health.goalsPriority',
  'mind.stressLevel',
  'mind.mentalEnergy',
  'mind.goalsPriority',
  'lifestyle.sleepDuration',
  'lifestyle.sleepQuality',
  'lifestyle.goalsPriority',
  'goals.motivationLevel',
];

/**
 * Session-only snooze so a failed clarify does not re-ask the same field this Talk session.
 * @type {Set<string>}
 */
const sessionSnoozedPaths = new Set();

export function snoozeProfileFieldForSession(path) {
  if (path) sessionSnoozedPaths.add(String(path));
}

export function isProfileFieldSnoozedForSession(path) {
  return path ? sessionSnoozedPaths.has(String(path)) : false;
}

export function clearSessionSnoozedProfileFields() {
  sessionSnoozedPaths.clear();
}

function wordToNumber(token) {
  const t = String(token || '').toLowerCase().replace(/[^a-z]/g, '');
  return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, t) ? NUMBER_WORDS[t] : null;
}

/**
 * Extract one or two numbers from free text (digits or common words).
 * Supports "7 or 8", "7-8", "7 to 8", "about 7", "around 7.5", "seven".
 * @returns {{ values: number[], rawEcho: string } | null}
 */
export function extractFlexibleNumbers(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const t = normalizeText(raw)
    .replace(/\b(about|around|approx(?:imately)?|roughly|nearly|almost|like)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const range = t.match(
    /(\d+(?:\.\d+)?)\s*(?:-|–|—|to|or|\/)\s*(\d+(?:\.\d+)?)/i,
  );
  if (range) {
    return {
      values: [parseFloat(range[1]), parseFloat(range[2])],
      rawEcho: raw,
    };
  }

  const wordRange = t.match(
    /\b([a-z]+)\s*(?:-|–|—|to|or)\s*([a-z]+)\b/i,
  );
  if (wordRange) {
    const a = wordToNumber(wordRange[1]);
    const b = wordToNumber(wordRange[2]);
    if (a != null && b != null) {
      return { values: [a, b], rawEcho: raw };
    }
  }

  const digit = t.match(/(\d+(?:\.\d+)?)/);
  if (digit) {
    return { values: [parseFloat(digit[1])], rawEcho: raw };
  }

  for (const token of t.split(/[^a-z]+/i)) {
    const n = wordToNumber(token);
    if (n != null) return { values: [n], rawEcho: raw };
  }
  return null;
}

function midpoint(values) {
  if (!values || !values.length) return null;
  if (values.length === 1) return values[0];
  return (values[0] + values[1]) / 2;
}

/**
 * Tap chips for a clarify turn. Values match stored profile-modal format.
 * @returns {Array<{ label: string, value: * }>}
 */
export function getClarifyTapOptions(question) {
  const spec = getProfileFieldSpec(question?.sectionKey, question?.fieldKey);
  if (!spec) return [];
  if (spec.type === 'choice' || spec.type === 'multi') {
    return (spec.options || [])
      .filter((o) => o.value !== 'prefer-not-say')
      .slice(0, 6)
      .map((o) => ({ label: o.label, value: o.value }));
  }
  if (spec.type === 'scale') {
    const out = [];
    for (let n = spec.min; n <= spec.max; n++) {
      if (spec.forbidden && spec.forbidden.includes(n)) continue;
      out.push({ label: String(n), value: n });
    }
    return out;
  }
  if (spec.type === 'age') {
    return [
      { label: '25', value: 25 },
      { label: '35', value: 35 },
      { label: '45', value: 45 },
      { label: '55', value: 55 },
    ];
  }
  return [];
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(text, phrase) {
  const p = String(phrase || '').toLowerCase().trim();
  if (!p) return false;
  if (/^[a-z]$/.test(p)) {
    return new RegExp(`(^|\\s)${p}(\\s|[.,!?]|$)`, 'i').test(text);
  }
  if (/^[abo]{1,2}[+-]$/i.test(p)) {
    const compact = text.replace(/\s+/g, '');
    return compact.includes(p.toLowerCase());
  }
  const escaped = escapeRegex(p).replace(/\\s\+/g, '\\s+').replace(/ /g, '\\s+');
  return new RegExp(`(^|[^a-z0-9+])${escaped}([^a-z0-9+]|$)`, 'i').test(text);
}

function optionMatches(text, option) {
  if (hasPhrase(text, option.value) || hasPhrase(text, option.label)) return true;
  return (option.aliases || []).some((alias) => hasPhrase(text, alias));
}

function matchedOptions(text, options) {
  const hits = [];
  for (const option of options) {
    if (optionMatches(text, option)) hits.push(option);
  }
  return hits;
}

function optionList(spec) {
  return (spec.options || []).map((o) => o.label).join(', ');
}

function clarifyChoice(spec) {
  return `I want to make sure I save this correctly. Could you pick one of: ${optionList(spec)}?`;
}

function clarifyMulti(spec) {
  return `I can save one or more of these: ${optionList(spec)}. Which apply?`;
}

function parseChoice(spec, text, fieldPath = '', rawText = '') {
  const hits = matchedOptions(text, spec.options);
  if (hits.length === 1) {
    return { ok: true, value: hits[0].value, echo: String(rawText || text).trim() };
  }
  // Forgiving hours for sleep duration (and any future hour-bucket choice).
  if (fieldPath === 'lifestyle.sleepDuration') {
    const extracted = extractFlexibleNumbers(rawText || text);
    if (extracted) {
      const mid = midpoint(extracted.values);
      const bucket = hoursToSleepBucket(mid);
      if (bucket) {
        if (mid < 3 || mid > 16) {
          return {
            ok: false,
            clarify: 'That sleep length looks off. About how many hours do you usually sleep — under 6, 6–7, 7–8, or 8+?',
            tapOptions: getClarifyTapOptions({ sectionKey: 'lifestyle', fieldKey: 'sleepDuration' }),
          };
        }
        return {
          ok: true,
          value: bucket,
          echo: extracted.rawEcho,
        };
      }
    }
  }
  return {
    ok: false,
    clarify: clarifyChoice(spec),
    tapOptions: (spec.options || []).slice(0, 6).map((o) => ({ label: o.label, value: o.value })),
  };
}

function parseMulti(spec, text) {
  let hits = matchedOptions(text, spec.options);
  if (hits.length === 0) {
    return { ok: false, clarify: clarifyMulti(spec) };
  }
  const exclusive = new Set(['none', 'prefer-not-say']);
  const specifics = hits.filter((h) => !exclusive.has(h.value));
  const exclusives = hits.filter((h) => exclusive.has(h.value));
  if (specifics.length > 0) {
    hits = specifics;
  } else if (exclusives.length === 1) {
    hits = exclusives;
  } else {
    return { ok: false, clarify: clarifyMulti(spec) };
  }
  const values = [...new Set(hits.map((h) => h.value))];
  return { ok: true, value: values };
}

function parseAge(spec, text, rawText = '') {
  const extracted = extractFlexibleNumbers(rawText || text);
  if (!extracted) {
    return {
      ok: false,
      clarify: `How old are you, as a number between ${spec.min} and ${spec.max}?`,
      tapOptions: getClarifyTapOptions({ sectionKey: 'body', fieldKey: 'age' }),
    };
  }
  const mid = Math.round(midpoint(extracted.values));
  if (mid >= spec.min && mid <= spec.max) {
    return { ok: true, value: mid, echo: extracted.rawEcho };
  }
  return {
    ok: false,
    clarify: `Could you tell me your age as a number between ${spec.min} and ${spec.max}?`,
    tapOptions: getClarifyTapOptions({ sectionKey: 'body', fieldKey: 'age' }),
  };
}

function parseHeight(spec, text) {
  const t = normalizeText(text);
  const ftIn = t.match(/(\d)\s*(?:'|’|ft|feet|foot)\s*(\d{1,2})/)
    || t.match(/(\d)\s*(\d{1,2})\s*(?:in|inch|"|”)/);
  if (ftIn) {
    const cm = feetInToCm(parseInt(ftIn[1], 10), parseInt(ftIn[2], 10));
    if (cm >= spec.min && cm <= spec.max) return { ok: true, value: cm };
  }
  const feetOnly = t.match(/^(\d(?:\.\d)?)\s*(?:'|’|ft|feet|foot)$/);
  if (feetOnly) {
    const cm = feetInToCm(parseFloat(feetOnly[1]), 0);
    if (cm >= spec.min && cm <= spec.max) return { ok: true, value: cm };
  }
  const cmMatch = t.match(/(\d{2,3}(?:\.\d)?)\s*(?:cm|centimet)/);
  if (cmMatch) {
    const cm = Math.round(parseFloat(cmMatch[1]));
    if (cm >= spec.min && cm <= spec.max) return { ok: true, value: cm };
  }
  const bare = t.match(/(\d{2,3}(?:\.\d)?)/);
  if (bare) {
    const n = parseFloat(bare[1]);
    if (n >= spec.min && n <= spec.max) return { ok: true, value: Math.round(n) };
    if (n >= 48 && n <= 84) {
      const cm = Math.round(n * 2.54);
      if (cm >= spec.min && cm <= spec.max) return { ok: true, value: cm };
    }
  }
  return {
    ok: false,
    clarify: 'About how tall are you? A number in cm (like 180) or feet and inches (like 5\'11") works.',
  };
}

function parseWeight(spec, text) {
  const t = normalizeText(text);
  const lbMatch = t.match(/(\d{2,3}(?:\.\d)?)\s*(?:lb|lbs|pounds?)/);
  if (lbMatch) {
    const kg = Math.round(lbToKg(parseFloat(lbMatch[1])) * 2) / 2;
    if (kg >= spec.min && kg <= spec.max) return { ok: true, value: kg };
  }
  const kgMatch = t.match(/(\d{2,3}(?:\.\d)?)\s*(?:kg|kilos?|kilograms?)/);
  if (kgMatch) {
    const kg = Math.round(parseFloat(kgMatch[1]) * 2) / 2;
    if (kg >= spec.min && kg <= spec.max) return { ok: true, value: kg };
  }
  const bare = t.match(/(\d{2,3}(?:\.\d)?)/);
  if (bare) {
    const n = parseFloat(bare[1]);
    if (n >= spec.min && n <= spec.max) return { ok: true, value: Math.round(n * 2) / 2 };
    if (n > spec.max && n <= 400) {
      const kg = Math.round(lbToKg(n) * 2) / 2;
      if (kg >= spec.min && kg <= spec.max) return { ok: true, value: kg };
    }
  }
  return {
    ok: false,
    clarify: 'About how much do you weigh? A number in kg (like 82) or lb (like 180 lb) works.',
  };
}

function parseScale(spec, fieldKey, text, rawText = '') {
  const t = normalizeText(text);
  const sortedWords = Object.keys(spec.words || {}).sort((a, b) => b.length - a.length);
  for (const word of sortedWords) {
    if (hasPhrase(t, word)) {
      const value = spec.words[word];
      if (spec.forbidden.includes(value)) {
        return forbiddenScaleClarify(spec, fieldKey);
      }
      if (value >= spec.min && value <= spec.max) {
        return { ok: true, value, echo: String(rawText || text).trim() };
      }
    }
  }
  const extracted = extractFlexibleNumbers(rawText || text);
  if (extracted) {
    const value = Math.round(midpoint(extracted.values));
    if (spec.forbidden.includes(value)) {
      return forbiddenScaleClarify(spec, fieldKey);
    }
    if (value >= spec.min && value <= spec.max) {
      return { ok: true, value, echo: extracted.rawEcho };
    }
  }
  return {
    ok: false,
    clarify: `Could you give me a number from ${spec.min} to ${spec.max}?`,
    tapOptions: getClarifyTapOptions({ sectionKey: '', fieldKey }),
  };
}

function forbiddenScaleClarify(spec, fieldKey) {
  let clarify = `Could you give me a number from ${spec.min} to ${spec.max}, other than ${spec.forbidden.join(', ')}?`;
  if (fieldKey === 'goalsPriority') {
    clarify = 'This scale treats 2 as unset, so I don’t want to guess. Is it closer to 1 (low) or 3–4 (higher priority)?';
  } else if (fieldKey === 'stressLevel') {
    clarify = '3 is the default on this scale, so I don’t want to guess. Are you closer to 2 (fairly calm) or 4 (fairly stressed)?';
  }
  return { ok: false, clarify };
}

export function getProfileFieldSpec(sectionKey, fieldKey) {
  return FIELD_SPECS[`${sectionKey}.${fieldKey}`] || null;
}

const QUESTION_START = /^(why|what|whats|what's|how|when|where|who|can|could|would|will|do|does|did|is|are|am|should)\b/i;

function isQuestionReply(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.includes('?')) return true;
  return QUESTION_START.test(raw);
}

function isVeryShortReply(text) {
  const raw = String(text || '').trim();
  const words = raw.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && raw.length <= 40;
}

function optionTokens(spec) {
  const tokens = [];
  for (const option of spec.options || []) {
    for (const raw of [option.value, option.label, ...(option.aliases || [])]) {
      const token = normalizeText(raw);
      if (token.length >= 3) tokens.push(token);
    }
  }
  return tokens;
}

function choiceLooksLikeAttempt(spec, text) {
  const normalized = normalizeText(text);
  if (extractFlexibleNumbers(text)) return true;
  const words = normalized.split(' ').filter((word) => word.length >= 3);
  for (const token of optionTokens(spec)) {
    if (normalized === token || normalized.startsWith(token)) return true;
    if (token.startsWith(normalized) && normalized.length >= 3) return true;
    for (const word of words) {
      if (token.startsWith(word) || word.startsWith(token)) return true;
    }
  }
  return false;
}

function numberFieldLooksLikeAttempt(spec, text) {
  const raw = String(text || '').trim();
  if (extractFlexibleNumbers(raw)) return true;
  if (/\d/.test(raw)) return true;
  if (spec.type === 'height' && /\b(cm|ft|feet|foot|inches|inch)\b/i.test(raw)) return true;
  if (spec.type === 'weight' && /\b(kg|kilos?|lb|lbs|pounds?)\b/i.test(raw)) return true;
  if (spec.type === 'scale') {
    const normalized = normalizeText(raw);
    return Object.keys(spec.words || {}).some((word) => {
      const token = normalizeText(word);
      return token.length >= 3 && (normalized === token || normalized.split(' ').includes(token));
    });
  }
  return false;
}

/**
 * A failed parse is an attempt only when the reply is not a question, is very short
 * (at most 4 words and 40 characters), and partly matches the pending field:
 * a digit or unit for a number field, or a 3+ character overlap with one option.
 * A successful parse is an answer, except sex at birth and gender identity:
 * a free sentence for those saves only at 6 words or fewer, or when it is clearly first-person.
 */
export function looksLikeProfileAnswerAttempt(question, text) {
  const raw = String(text || '').trim();
  if (!raw || isQuestionReply(raw) || !isVeryShortReply(raw)) return false;
  const spec = getProfileFieldSpec(question?.sectionKey, question?.fieldKey);
  if (!spec) return false;
  if (spec.type === 'choice' || spec.type === 'multi') return choiceLooksLikeAttempt(spec, raw);
  if (spec.type === 'age' || spec.type === 'height' || spec.type === 'weight' || spec.type === 'scale') {
    return numberFieldLooksLikeAttempt(spec, raw);
  }
  return false;
}

const IDENTITY_FIELDS = new Set(['body.sexAtBirth', 'body.genderIdentity']);

/** Third-person / relation words — never treat the sentence as the user's own identity. */
const IDENTITY_OTHER_MARKERS = /\b(my|his|her|she|he|they|wife|husband|friend|son|daughter|mother|father|mom|dad|brother|sister|partner)\b/i;

function identityReplyMaySave(text) {
  const raw = String(text || '').trim().replace(/[’‘]/g, "'");
  if (IDENTITY_OTHER_MARKERS.test(raw)) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 6) return true;
  return /^(i am|i'm)\b/i.test(raw);
}

/**
 * save: the reply parsed. clarify: it looks like an attempt but did not parse.
 * message: ordinary Talk input; do not force the pending question.
 * Sex at birth and gender identity never save a sentence about someone else
 * (relation / third-person markers), and longer sentences only when first-person.
 * @returns {{ kind: 'save', value: * } | { kind: 'clarify', clarify: string } | { kind: 'message' }}
 */
export function classifyProfileReply(question, text) {
  const parsed = parseProfileAnswer(question, text);
  const path = `${question?.sectionKey}.${question?.fieldKey}`;
  if (parsed.ok && IDENTITY_FIELDS.has(path) && !identityReplyMaySave(text)) {
    return { kind: 'message' };
  }
  if (parsed.ok) {
    return { kind: 'save', value: parsed.value, echo: parsed.echo || String(text || '').trim() };
  }
  // Digit / number-word attempts on numeric fields always clarify (even if slightly longer).
  const numericAttempt =
    FORGIVING_NUMERIC_FIELDS.includes(path) && !!extractFlexibleNumbers(text);
  // Very short opaque replies (e.g. "xyz") while a question is pending: one clarify, not a re-ask.
  const opaqueShort =
    isVeryShortReply(text) &&
    !isQuestionReply(text) &&
    String(text || '').trim().split(/\s+/).length <= 2;
  if (
    numericAttempt ||
    looksLikeProfileAnswerAttempt(question, text) ||
    PREFER_NOT_RE.test(String(text || '')) ||
    opaqueShort
  ) {
    return {
      kind: 'clarify',
      clarify: parsed.clarify,
      tapOptions: parsed.tapOptions || getClarifyTapOptions(question),
    };
  }
  return { kind: 'message' };
}

export function getConversationalAsk(question) {
  if (!question) return 'Could I ask one more detail?';
  const spec = getProfileFieldSpec(question.sectionKey, question.fieldKey);
  return spec?.ask || `Could I ask about your ${String(question.fieldLabel || 'next detail').toLowerCase()}?`;
}

/**
 * @param {{ sectionKey: string, fieldKey: string, fieldLabel?: string }} question
 * @param {string} text
 * @returns {{ ok: true, value: * } | { ok: false, clarify: string }}
 */
export function parseProfileAnswer(question, text) {
  if (!question || !question.sectionKey || !question.fieldKey) {
    return { ok: false, clarify: 'Could you say that another way?' };
  }
  const spec = getProfileFieldSpec(question.sectionKey, question.fieldKey);
  const raw = String(text || '').trim();
  if (!spec || !raw) {
    return { ok: false, clarify: getConversationalAsk(question) };
  }
  const path = `${question.sectionKey}.${question.fieldKey}`;
  const normalized = normalizeText(raw);

  if (PREFER_NOT_RE.test(raw)) {
    const pnts = (spec.options || []).find((o) => o.value === 'prefer-not-say');
    if (pnts) {
      return { ok: true, value: pnts.value, echo: raw };
    }
    // Field has no prefer-not-say option: still accept as a soft skip value when string answers are allowed.
    if (spec.type === 'choice') {
      return { ok: true, value: 'prefer-not-say', echo: raw };
    }
  }

  let result;
  switch (spec.type) {
    case 'choice':
      result = parseChoice(spec, normalized, path, raw);
      break;
    case 'multi':
      result = parseMulti(spec, normalized);
      break;
    case 'age':
      result = parseAge(spec, normalized, raw);
      break;
    case 'height':
      result = parseHeight(spec, raw);
      break;
    case 'weight':
      result = parseWeight(spec, raw);
      break;
    case 'scale':
      result = parseScale(spec, question.fieldKey, normalized, raw);
      break;
    default:
      result = { ok: false, clarify: getConversationalAsk(question) };
  }

  if (result.ok && !isProfileFieldAnswered(result.value, question.fieldKey)) {
    const fallback = forbiddenScaleClarify(spec, question.fieldKey);
    return {
      ok: false,
      clarify: fallback.clarify || getConversationalAsk(question),
      tapOptions: getClarifyTapOptions(question),
    };
  }
  if (result.ok && !result.echo) result.echo = raw;
  return result;
}

/**
 * Save a parsed value onto the same profile object the modals use, then refresh sidebar UI.
 * @param {string} sectionKey
 * @param {string} fieldKey
 * @param {*} value
 */
export function applyProfileTalkAnswer(sectionKey, fieldKey, value) {
  const profile = profileState.get() || {};
  if (!profile[sectionKey] || typeof profile[sectionKey] !== 'object') {
    profile[sectionKey] = {};
  }
  let stored = value;
  // Always write the canonical bucket string for sleep duration (never a midpoint number).
  if (sectionKey === 'lifestyle' && fieldKey === 'sleepDuration') {
    const normalized = normalizeSleepDuration(value);
    if (normalized) stored = normalized;
  }
  profile[sectionKey][fieldKey] = stored;
  profileState.save(profile);
  if (typeof window !== 'undefined') {
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
    if (typeof window.updateProfileCompletenessDisplay === 'function') {
      window.updateProfileCompletenessDisplay();
    }
  }
  return profile;
}
