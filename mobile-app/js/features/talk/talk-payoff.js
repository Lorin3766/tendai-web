// Obrium — deterministic Talk payoff (1 question = 1 payoff). No LLM. No judgments.
// @owner: talk

import { getEntries, shortSourceLabel } from '../feed/content-library.js';
import { FOCUS_AREA_SIGNALS, focusAreasForField, signalProgress } from '../profile/focus-area-signals.js';
import { getFocusAreaById } from '../human-os/focus-areas.js';
import { getObriumCheckinHistory } from '../metrics/checkin-history.js';
import { getProfileQuestionCatalog, isDeclinedProfileValue } from '../profile/profile-schema.js';

/** User-visible vocabulary that must never appear after Task 12b. */
export const BANNED_USER_VOCAB = [
  'Human OS',
  'Confirm — I want to prioritize',
  'Adaptive agent feed',
  'Manual Baseline',
  'Calibration',
  'Stage 0',
  'Stage 1',
  'Stage 2',
  'Stage 3',
  'On track',
  'AGT-',
];

const JUDGMENT_RE = /\b(normal|abnormal|low|high|good|bad|poor|excellent|healthy|unhealthy|optimal|worse|better)\b/i;
const CAUSAL_RE = /\b(cause|caused|because your|the reason is|due to your)\b/i;

/**
 * Neutral “why next” lines keyed by answeredPath → nextPath.
 * Phrased as a question or soft intent — never a claim about the user.
 */
export const WHY_NEXT_TEMPLATES = {
  'lifestyle.sleepDuration→lifestyle.sleepQuality':
    'How does that sleep usually feel?',
  'lifestyle.sleepDuration→body.physicalActivity':
    'Next I’d like to see how your energy looks during the day — how active is a typical week?',
  'lifestyle.sleepQuality→lifestyle.goalsFocus':
    'Next I’d like to see which lifestyle change you care about most right now.',
  'lifestyle.sleepQuality→body.physicalActivity':
    'Next I’d like to see how your energy looks during the day — how active is a typical week?',
  'body.physicalActivity→body.sexAtBirth':
    'Next I’d like to know a few basics about your body — starting with sex at birth.',
  'body.physicalActivity→body.regularDiscomfort':
    'Next I’d like to know about any regular aches or discomfort.',
  'body.sexAtBirth→body.genderIdentity':
    'Next I’d like to know how you describe your gender identity.',
  'body.genderIdentity→body.age':
    'Next I’d like to know how old you are.',
  'body.age→body.height':
    'Next I’d like to know about how tall you are.',
  'body.height→body.weight':
    'Next I’d like to know about how much you weigh.',
  'body.weight→body.bodyBuild':
    'Next I’d like to hear how you would describe your body build.',
  'body.bodyBuild→body.bloodType':
    'Next I’d like to know whether you know your blood type.',
  'body.bloodType→body.physicalActivity':
    'Next I’d like to hear how active a typical week is for you.',
  'body.physicalActivity→body.regularDiscomfort':
    'Next I’d like to know about any regular aches or discomfort.',
  'body.regularDiscomfort→body.goalsFocus':
    'Next I’d like to see which body goal matters most right now.',
  'body.goalsFocus→body.goalsPriority':
    'Next I’d like to know how important that body goal feels on a 1–4 scale.',
  'body.goalsPriority→health.healthConditions':
    'Next I’d like to know about any health conditions you manage.',
  'health.healthConditions→health.prescriptionMedications':
    'Next I’d like to know whether you take any prescription medications.',
  'health.prescriptionMedications→health.supplements':
    'Next I’d like to hear about any supplements you take.',
  'health.supplements→health.smoking':
    'Next I’d like to know about smoking — never, formerly, or currently?',
  'health.smoking→health.alcohol':
    'Next I’d like to hear how often you drink alcohol.',
  'health.alcohol→health.lastCheckup':
    'Next I’d like to know when your last general checkup was.',
  'health.lastCheckup→health.goalsFocus':
    'Next I’d like to see what you want to improve first in your health.',
  'health.goalsFocus→health.goalsPriority':
    'Next I’d like to know how important that health focus feels on a 1–4 scale.',
  'health.goalsPriority→health.goalsConstraints':
    'Next I’d like to know anything I should keep in mind when I answer.',
  'health.goalsConstraints→mind.stressLevel':
    'Next I’d like to hear how stressed you usually feel on a typical day.',
  'mind.stressLevel→mind.mentalEnergy':
    'Next I’d like to hear how your mental energy usually feels.',
  'mind.mentalEnergy→mind.anxietyFrequency':
    'Next I’d like to know how often you feel anxious.',
  'mind.anxietyFrequency→mind.moodChanges':
    'Next I’d like to hear how your mood usually shifts.',
  'mind.moodChanges→mind.wantToImproveFocus':
    'Next I’d like to know whether focus is something you want to improve.',
  'mind.wantToImproveFocus→mind.goalsFocus':
    'Next I’d like to see which mental aspect matters most right now.',
  'mind.goalsFocus→mind.goalsPriority':
    'Next I’d like to know how important that mental focus feels on a 1–4 scale.',
  'mind.goalsPriority→lifestyle.eatingPattern':
    'Next I’d like to hear how your usual eating pattern looks.',
  'lifestyle.eatingPattern→lifestyle.dietType':
    'Next I’d like to hear which diet type is closest for you.',
  'lifestyle.dietType→lifestyle.enoughProtein':
    'Next I’d like to know whether you feel you get enough protein.',
  'lifestyle.enoughProtein→lifestyle.sugarSweets':
    'Next I’d like to hear how often you have sugar and sweets.',
  'lifestyle.sugarSweets→lifestyle.lateEating':
    'Next I’d like to know how often you eat late.',
  'lifestyle.lateEating→lifestyle.hydration':
    'Next I’d like to hear how your hydration usually looks.',
  'lifestyle.hydration→lifestyle.sleepDuration':
    'Next I’d like to know how many hours you usually sleep.',
  'lifestyle.goalsFocus→lifestyle.goalsPriority':
    'Next I’d like to know how important that lifestyle change feels on a 1–4 scale.',
  'lifestyle.goalsPriority→goals.primaryGoals':
    'Next I’d like to see which goals matter most to you right now.',
  'goals.primaryGoals→goals.motivationLevel':
    'Next I’d like to hear how motivated you feel on a 1–5 scale.',
  'goals.motivationLevel→goals.wantFromTendAI':
    'Next I’d like to know what you want from me day to day.',
};

/**
 * No template → omit the why-next line (never invent camelCase field names).
 * Kept as a no-op helper so older imports do not break.
 */
export function whyNextFallback(_nextQuestion) {
  return '';
}

export function whyNextLine(answeredPath, nextQuestion) {
  if (!nextQuestion?.path || !answeredPath) return '';
  const key = `${answeredPath}→${nextQuestion.path}`;
  return WHY_NEXT_TEMPLATES[key] || '';
}

export function countKnownForArea(profile, areaId) {
  return signalProgress(profile, areaId).n;
}

function shortAreaName(areaId) {
  const full = getFocusAreaById(areaId)?.name || areaId;
  // "Sleep & Recovery" → "Sleep" for compact payoff copy
  return String(full).split(/\s*&\s*/)[0].trim() || full;
}

export function memoryLinkLine(profile, areaIds) {
  const bits = [];
  for (const id of areaIds || []) {
    const n = countKnownForArea(profile, id);
    const name = shortAreaName(id);
    if (n <= 0) continue;
    // 14d-4: short “I now know” (not “With this I know”).
    bits.push(
      n === 1
        ? `I now know 1 thing about your ${name}.`
        : `I now know ${n} things about your ${name}.`,
    );
  }
  if (!bits.length) return '';
  return bits.join(' ');
}

export function sourceLineForAnswers(n) {
  const count = Math.max(0, Number(n) || 0);
  if (count <= 0) return '';
  return count === 1 ? 'Based on 1 of your answers' : `Based on ${count} of your answers`;
}

export function libraryLineForField(profile, areaId, fieldKey) {
  try {
    const entry = getEntries({ focusArea: areaId, field: fieldKey, profile });
    const text = entry && String(entry.text || '').trim();
    if (!text) return '';
    if (JUDGMENT_RE.test(text) || CAUSAL_RE.test(text)) return '';
    const short = shortSourceLabel(entry.sourceLabel || '');
    if (!short) return '';
    return text;
  } catch (_) {
    return '';
  }
}

/**
 * One factual line from ≥3 days of check-in history for a field. Counts/comparisons only.
 * @param {'sleepHours'|'energy'|'stress'|'water'} field
 */
export function factualHistoryLine(field = 'sleepHours') {
  const days = getObriumCheckinHistory() || [];
  const last7 = days.slice(-7).filter((d) => d && d[field] != null && d[field] !== '');
  if (last7.length < 3) return '';
  if (field === 'sleepHours') {
    const nums = last7.map((d) => Number(d.sleepHours)).filter((n) => Number.isFinite(n));
    if (nums.length < 3) return '';
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return `You logged sleep on ${nums.length} of the last 7 days; between ${min} and ${max} hours.`;
  }
  if (field === 'energy') {
    return `You logged energy on ${last7.length} of the last 7 days.`;
  }
  if (field === 'stress') {
    const nums = last7.map((d) => Number(d.stress)).filter((n) => Number.isFinite(n));
    if (nums.length < 3) return '';
    return `You logged stress on ${nums.length} of the last 7 days; values between ${Math.min(...nums)} and ${Math.max(...nums)}.`;
  }
  if (field === 'water') {
    const nums = last7.map((d) => Number(d.water)).filter((n) => Number.isFinite(n));
    if (nums.length < 3) return '';
    return `You logged water on ${nums.length} of the last 7 days; between ${Math.min(...nums)} and ${Math.max(...nums)} glasses.`;
  }
  return '';
}

/**
 * Check-in submit recap: what was entered + yesterday’s same field if any. No judgment.
 */
export function checkinRecapLine(todayEntry, yesterdayEntry) {
  const bits = [];
  if (todayEntry?.sleepHours != null) bits.push(`sleep ${todayEntry.sleepHours} h`);
  if (todayEntry?.water != null) bits.push(`water ${todayEntry.water}`);
  if (todayEntry?.energy != null) bits.push(`energy ${todayEntry.energy}`);
  if (todayEntry?.stress != null) bits.push(`stress ${todayEntry.stress}`);
  if (!bits.length) return '';
  let line = `Saved: ${bits.join(', ')}.`;
  if (yesterdayEntry?.sleepHours != null && todayEntry?.sleepHours != null) {
    line += ` Yesterday ${yesterdayEntry.sleepHours} h, today ${todayEntry.sleepHours} h.`;
  } else if (yesterdayEntry?.energy != null && todayEntry?.energy != null) {
    line += ` Yesterday energy ${yesterdayEntry.energy}, today ${todayEntry.energy}.`;
  } else if (yesterdayEntry?.stress != null && todayEntry?.stress != null) {
    line += ` Yesterday stress ${yesterdayEntry.stress}, today ${todayEntry.stress}.`;
  }
  return line;
}

/**
 * Assemble payoff parts for a saved Talk/Feed answer. Missing parts stay empty (ok).
 * 14d-3: declined answers → one short "Okay, skipped." line (no knowledge claims).
 * @returns {{ lines: string[], sourceLine: string, changedAreaIds: string[], declined: boolean }}
 */
export function assembleTalkPayoff({
  echoRaw,
  profile,
  answeredPath,
  answeredFieldKey,
  nextQuestion,
  changedAreaIds = [],
  claimLine = '',
  value = undefined,
}) {
  const declined =
    isDeclinedProfileValue(value) ||
    isDeclinedProfileValue(echoRaw) ||
    /^(rather not say|prefer not to say)$/i.test(String(echoRaw || '').trim());

  if (declined) {
    // Stored so we do not ask again — but never "I know N", "Added", or echo of the decline.
    return {
      lines: ['Okay, skipped.'],
      sourceLine: '',
      nextAskHint: '',
      changedAreaIds: [],
      declined: true,
    };
  }

  // 14d-4: one short Saved + know line. Why-next becomes the next ask label (nextAskHint).
  // "Based on N answers" stays on the card meta line — not in this paragraph.
  // Drop claimLine ("Added to your card") and library/history from the inline reaction.
  void claimLine;
  void answeredFieldKey;
  const saved = echoRaw ? `Saved: ${String(echoRaw).trim()}.` : '';
  const areaIds =
    changedAreaIds.length
      ? changedAreaIds
      : focusAreasForField(
          String(answeredPath || '').split('.')[0],
          String(answeredPath || '').split('.')[1],
        );
  const memory = memoryLinkLine(profile, areaIds);
  const line1 = [saved, memory].filter(Boolean).join(' ');
  const why = whyNextLine(answeredPath, nextQuestion);
  return {
    lines: line1 ? [line1] : [],
    sourceLine: '',
    nextAskHint: why || '',
    changedAreaIds: areaIds,
    declined: false,
  };
}

export function feedCardKnowledgeLine(profile, areaId) {
  const name = getFocusAreaById(areaId)?.name || areaId;
  const n = countKnownForArea(profile, areaId);
  if (n <= 0) return `Tell me about your ${name} in Talk`;
  return n === 1 ? `I know 1 thing about your ${name}` : `I know ${n} things about your ${name}`;
}

/** Lint helper: returns banned phrases found in a string. */
export function findBannedVocab(text) {
  const s = String(text || '');
  return BANNED_USER_VOCAB.filter((w) => s.includes(w));
}

/** Build why-next coverage table for every askable field (for reports / tests). */
export function whyNextCoverageTable() {
  const catalog = getProfileQuestionCatalog();
  const paths = [];
  for (const section of catalog) {
    for (const field of section.fields) {
      paths.push(`${section.key}.${field.key}`);
    }
  }
  const rows = [];
  for (let i = 0; i < paths.length; i++) {
    const answered = paths[i];
    const next = paths[i + 1] || null;
    const key = next ? `${answered}→${next}` : null;
    rows.push({
      answered,
      next,
      template: key && WHY_NEXT_TEMPLATES[key] ? WHY_NEXT_TEMPLATES[key] : '',
      hasSpecific: !!(key && WHY_NEXT_TEMPLATES[key]),
    });
  }
  return rows;
}

export function payoffHasJudgmentOrCause(text) {
  return JUDGMENT_RE.test(String(text || '')) || CAUSAL_RE.test(String(text || ''));
}
