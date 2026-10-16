// Focus Area → profile signals. One config for Feed calibration, stage floor, and Talk's next question.
// @owner: profile
// @role: config

import { isProfileFieldAnswered } from './profile-schema.js';
import { getFocusAreaById, getSelectedFocusAreaIds } from '../human-os/focus-areas.js';

/**
 * Least sensitive first. `echo` is how Feed may repeat the answer (9c).
 * `location` is stored on the profile but is not a Talk catalog question.
 * Movement uses body.physicalActivity: lifestyle.activeDays is not in the ask catalog.
 * Skin has no catalog field; location is the only existing signal.
 * Cardiovascular uses smoking and alcohol (self-reported). physicalActivity stays on Movement
 * so one answer updates one card.
 */
export const FOCUS_AREA_SIGNALS = {
  sleep: [
    { section: 'lifestyle', field: 'sleepDuration', echo: 'value' },
    { section: 'lifestyle', field: 'sleepQuality', echo: 'value' },
  ],
  move: [{ section: 'body', field: 'physicalActivity', echo: 'value' }],
  nutrition: [
    { section: 'lifestyle', field: 'dietType', echo: 'value' },
    { section: 'lifestyle', field: 'eatingPattern', echo: 'value' },
  ],
  labs: [{ section: 'health', field: 'lastCheckup', echo: 'value' }],
  stress: [
    { section: 'mind', field: 'stressLevel', echo: 'value' },
    { section: 'mind', field: 'anxietyFrequency', echo: 'generic' },
  ],
  longevity: [
    { section: 'health', field: 'supplements', echo: 'generic' },
    { section: 'goals', field: 'primaryGoals', echo: 'value' },
  ],
  skin: [{ section: 'location', field: 'location', echo: 'generic' }],
  cardio: [
    { section: 'health', field: 'smoking', echo: 'value' },
    { section: 'health', field: 'alcohol', echo: 'value' },
  ],
  mental: [
    { section: 'mind', field: 'mentalEnergy', echo: 'generic' },
    { section: 'mind', field: 'moodChanges', echo: 'generic' },
  ],
};

export function signalsFor(areaId) {
  return FOCUS_AREA_SIGNALS[areaId] || [];
}

export function isSignalAnswered(profile, signal) {
  if (!signal || !profile) return false;
  if (signal.section === 'location') {
    const loc = profile.location;
    return !!(loc && (loc.city || loc.zip || loc.coords));
  }
  const section = profile[signal.section];
  const value = section && typeof section === 'object' ? section[signal.field] : undefined;
  return isProfileFieldAnswered(value, signal.field);
}

export function signalProgress(profile, areaId) {
  const signals = signalsFor(areaId);
  const n = signals.filter((signal) => isSignalAnswered(profile, signal)).length;
  return { n, m: signals.length };
}

/** Floor only: at least one mapped signal → stage 1. Callers take the higher of this and stored stage. */
export function stageFloorFromSignals(profile, areaId) {
  if (!areaId || !FOCUS_AREA_SIGNALS[areaId]) return 0;
  return signalProgress(profile, areaId).n >= 1 ? 1 : 0;
}

export function displayMaturityStage(stored, profile, areaId) {
  const floor = stageFloorFromSignals(profile, areaId);
  const n = Math.max(Number(stored) || 0, floor);
  return Math.max(0, Math.min(3, Math.round(n)));
}

export function calibrationLine(profile, areaId) {
  const { n, m } = signalProgress(profile, areaId);
  if (!m || n >= m) return '';
  if (n >= 1) return `Calibration: ${n} of ${m} signals — one more answer sharpens this.`;
  return `Calibration: ${n} of ${m} signals — answer a quick question in Talk to personalize this.`;
}

/**
 * First unanswered askable signal while any selected Focus Area still has zero signals.
 * @returns {{ section: string, field: string, echo: string, focusArea: string } | null}
 */
export function nextFocusAreaSignal(profile) {
  let ids = [];
  try {
    ids = getSelectedFocusAreaIds();
  } catch (_) {
    ids = [];
  }
  if (!ids.length) return null;
  const incomplete = ids.some((id) => signalProgress(profile, id).n < 1 && signalsFor(id).some((s) => s.section !== 'location'));
  if (!incomplete) return null;
  for (const id of ids) {
    if (signalProgress(profile, id).n >= 1) continue;
    for (const signal of signalsFor(id)) {
      if (signal.section === 'location') continue;
      if (!isSignalAnswered(profile, signal)) return { ...signal, focusArea: id };
    }
  }
  return null;
}

const SLEEP_HOURS = {
  '<6h': 'under 6 hours',
  '6-7h': '6 to 7 hours',
  '7-8h': '7 to 8 hours',
  '8h+': '8 or more hours',
};

function readSignalValue(profile, signal) {
  const section = profile?.[signal.section];
  return section && typeof section === 'object' ? section[signal.field] : undefined;
}

function formatValueEcho(signal, value) {
  const path = `${signal.section}.${signal.field}`;
  const shown = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value ?? '').trim();
  if (path === 'lifestyle.sleepDuration') return `You noted about ${SLEEP_HOURS[shown] || shown} of sleep.`;
  if (path === 'lifestyle.sleepQuality') return `You noted sleep quality at ${shown} on a 1 to 5 scale.`;
  if (path === 'body.physicalActivity') return `You noted your activity level: ${shown}.`;
  if (path === 'lifestyle.dietType') return `You noted your diet: ${shown}.`;
  if (path === 'lifestyle.eatingPattern') return `You noted your eating pattern: ${shown}.`;
  if (path === 'health.lastCheckup') return `You noted your last checkup: ${shown}.`;
  if (path === 'mind.stressLevel') return `You noted a stress level of ${shown}.`;
  if (path === 'goals.primaryGoals') return `You noted your goal: ${shown}.`;
  if (path === 'health.smoking') return `You noted smoking: ${shown}.`;
  if (path === 'health.alcohol') return `You noted alcohol: ${shown}.`;
  return `You noted ${shown}.`;
}

const lastTouched = new Map();

/** Remember which mapped field just changed so the card echoes that answer. Not persisted. */
export function noteSignalSaved(section, field) {
  const path = `${section}.${field}`;
  for (const area of focusAreasForField(section, field)) lastTouched.set(area, path);
}

/** Last answered signal, preferring the field just saved. Null when none are answered. */
export function payoffDetail(profile, areaId) {
  const answered = signalsFor(areaId).filter((signal) => isSignalAnswered(profile, signal));
  if (!answered.length) return null;
  const touched = lastTouched.get(areaId);
  const signal = answered.find((s) => `${s.section}.${s.field}` === touched) || answered[answered.length - 1];
  const name = getFocusAreaById(areaId)?.name || areaId;
  const echo = signal.echo === 'generic'
    ? `Your ${name} card now reflects your answer.`
    : formatValueEcho(signal, readSignalValue(profile, signal));
  return { echo, field: signal.field, section: signal.section };
}

export function payoffEcho(profile, areaId) {
  return payoffDetail(profile, areaId)?.echo || '';
}

/** Stage, calibration, and payoff. Callers compare this to decide whether Feed actually changed. */
export function visibleCardSnapshot(profile, areaId, storedStage = 0) {
  return [
    displayMaturityStage(storedStage, profile, areaId),
    calibrationLine(profile, areaId),
    payoffEcho(profile, areaId),
  ].join('|');
}

/** Focus areas whose visible card should change when this profile path is saved. */
export function focusAreasForField(section, field) {
  const path = `${section}.${field}`;
  const hits = [];
  for (const [area, signals] of Object.entries(FOCUS_AREA_SIGNALS)) {
    if (signals.some((s) => `${s.section}.${s.field}` === path || (s.section === section && s.field === field))) {
      hits.push(area);
    }
  }
  return hits;
}
