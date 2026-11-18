/**
 * Task 14a — next-question + one-tap chips for Focus cards.
 * Chip saves use the same path as Talk: applyProfileTalkAnswer.
 * @owner: feed
 */

import {
  calibrationOpensSettings,
  focusAreasForField,
  nextUnansweredSignalForArea,
  noteSignalSaved,
  signalProgress,
} from '../profile/focus-area-signals.js';
import {
  applyProfileTalkAnswer,
  getClarifyTapOptions,
  getConversationalAsk,
  getProfileFieldSpec,
} from '../talk/profile-answer-parser.js';
import { assembleTalkPayoff } from '../talk/talk-payoff.js';
import { getFocusAreaById } from '../human-os/focus-areas.js';
import { profileState } from '../../state.js';

/**
 * @param {object} profile
 * @param {string} areaId
 * @returns {{
 *   section: string,
 *   field: string,
 *   path: string,
 *   ask: string,
 *   chips: Array<{ label: string, value: * }>,
 *   talkOnly: boolean,
 *   settingsCity: boolean,
 * } | null}
 */
export function nextCardQuestion(profile, areaId) {
  if (!areaId) return null;
  if (calibrationOpensSettings(areaId)) {
    return {
      section: 'location',
      field: 'location',
      path: 'location.location',
      ask: 'Add your city in Settings to personalize this',
      chips: [],
      talkOnly: false,
      settingsCity: true,
    };
  }
  const signal = nextUnansweredSignalForArea(profile, areaId);
  if (!signal) return null;
  const question = { sectionKey: signal.section, fieldKey: signal.field, path: `${signal.section}.${signal.field}` };
  const spec = getProfileFieldSpec(signal.section, signal.field);
  // Prefer a short card ask; fall back to Talk wording.
  const SHORT_ASK = {
    'lifestyle.sleepDuration': 'How long do you usually sleep?',
    'lifestyle.sleepQuality': 'How’s your sleep quality (1–5)?',
    'body.physicalActivity': 'How active is a typical week?',
    'lifestyle.dietType': 'What diet type is closest?',
    'lifestyle.eatingPattern': 'How regular is your eating?',
    'health.lastCheckup': 'When was your last checkup?',
    'mind.stressLevel': 'How stressed do you feel (1–5)?',
    'mind.anxietyFrequency': 'How often do you feel anxious?',
    'health.supplements': 'Do you take any supplements?',
    'goals.primaryGoals': 'What are your primary goals?',
    'health.smoking': 'Do you smoke?',
    'health.alcohol': 'How often do you drink alcohol?',
    'mind.mentalEnergy': 'How’s your mental energy (1–5)?',
    'mind.moodChanges': 'How stable is your mood?',
  };
  const ask =
    SHORT_ASK[question.path] ||
    getConversationalAsk(question) ||
    spec?.ask ||
    'Answer this in Talk';
  // 14c-3 / 14d-2: one-tap chips for single-choice and scale — render ALL options (no slice).
  // Multi needs Talk.
  const chipEligible = spec?.type === 'choice' || spec?.type === 'scale';
  let chips = chipEligible ? getClarifyTapOptions(question) : [];
  const talkOnly = !chipEligible || chips.length === 0;
  return {
    section: signal.section,
    field: signal.field,
    path: question.path,
    ask: String(ask).replace(/\s+/g, ' ').trim(),
    chips: talkOnly ? [] : chips,
    talkOnly,
    settingsCity: false,
  };
}

/**
 * Save a chip / Rather-not-say value through the Talk write path. No Gemini, no data-sent-log.
 * @returns {{ profile: object, payoff: ReturnType<typeof assembleTalkPayoff>, areaId: string }}
 */
export function saveCardTapAnswer(areaId, section, field, value, echoRaw) {
  const areas = focusAreasForField(section, field);
  applyProfileTalkAnswer(section, field, value);
  noteSignalSaved(section, field);
  const profile = profileState.get() || {};
  const nextSig = nextUnansweredSignalForArea(profile, areaId);
  const payoff = assembleTalkPayoff({
    echoRaw: echoRaw || String(value),
    value,
    profile,
    answeredPath: `${section}.${field}`,
    answeredFieldKey: field,
    nextQuestion: nextSig
      ? { path: `${nextSig.section}.${nextSig.field}`, sectionKey: nextSig.section, fieldKey: nextSig.field }
      : null,
    changedAreaIds: areas.length ? areas : [areaId],
    claimLine: areas
      .map((id) => getFocusAreaById(id)?.name || id)
      .map((name) => `Added to your ${name} card.`)
      .join(' '),
  });
  return { profile, payoff, areaId };
}

export function areaHasAnswers(profile, areaId) {
  return signalProgress(profile, areaId).n > 0;
}
