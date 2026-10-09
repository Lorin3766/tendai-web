// Serron — Proactive Talk: parse a free-text reply into a profile-modal field value.
// Isolated from free-form chat. Simple matching only — ambiguous replies ask a follow-up.

import { profileState } from '../../state.js';
import { isProfileFieldAnswered } from '../profile/profile-schema.js';
import { feetInToCm, lbToKg } from '../storage/units.js';

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
      opt('7-8h', '7–8h', ['7-8', '7 to 8', 'seven to eight', '7 hours', 'seven hours']),
      opt('8h+', '8h+', ['8+', '8 plus', 'more than 8', 'over 8', '8 or more', '9 hours']),
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

function parseChoice(spec, text) {
  const hits = matchedOptions(text, spec.options);
  if (hits.length === 1) {
    return { ok: true, value: hits[0].value };
  }
  return { ok: false, clarify: clarifyChoice(spec) };
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

function parseAge(spec, text) {
  const nums = String(text).match(/\d{1,3}/g);
  if (!nums) {
    return { ok: false, clarify: `How old are you, as a number between ${spec.min} and ${spec.max}?` };
  }
  const inRange = nums
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= spec.min && n <= spec.max);
  if (inRange.length === 1) {
    return { ok: true, value: inRange[0] };
  }
  return { ok: false, clarify: `Could you tell me your age as a number between ${spec.min} and ${spec.max}?` };
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

function parseScale(spec, fieldKey, text) {
  const t = normalizeText(text);
  const sortedWords = Object.keys(spec.words || {}).sort((a, b) => b.length - a.length);
  for (const word of sortedWords) {
    if (hasPhrase(t, word)) {
      const value = spec.words[word];
      if (spec.forbidden.includes(value)) {
        return forbiddenScaleClarify(spec, fieldKey);
      }
      if (value >= spec.min && value <= spec.max) {
        return { ok: true, value };
      }
    }
  }
  const nums = t.match(/\d+(?:\.\d+)?/g);
  if (nums && nums.length === 1) {
    const value = Math.round(parseFloat(nums[0]));
    if (spec.forbidden.includes(value)) {
      return forbiddenScaleClarify(spec, fieldKey);
    }
    if (value >= spec.min && value <= spec.max) {
      return { ok: true, value };
    }
  }
  return {
    ok: false,
    clarify: `Could you give me a number from ${spec.min} to ${spec.max}?`,
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
  const normalized = normalizeText(raw);

  let result;
  switch (spec.type) {
    case 'choice':
      result = parseChoice(spec, normalized);
      break;
    case 'multi':
      result = parseMulti(spec, normalized);
      break;
    case 'age':
      result = parseAge(spec, normalized);
      break;
    case 'height':
      result = parseHeight(spec, raw);
      break;
    case 'weight':
      result = parseWeight(spec, raw);
      break;
    case 'scale':
      result = parseScale(spec, question.fieldKey, normalized);
      break;
    default:
      result = { ok: false, clarify: getConversationalAsk(question) };
  }

  if (result.ok && !isProfileFieldAnswered(result.value, question.fieldKey)) {
    const fallback = forbiddenScaleClarify(spec, question.fieldKey);
    return {
      ok: false,
      clarify: fallback.clarify || getConversationalAsk(question),
    };
  }
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
  profile[sectionKey][fieldKey] = value;
  profileState.save(profile);
  if (typeof window !== 'undefined') {
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
    if (typeof window.updateProfileCompletenessDisplay === 'function') {
      window.updateProfileCompletenessDisplay();
    }
  }
  return profile;
}
