// On-device Talk follow-ups. No network. Missing text stays missing.
// @owner: talk
// @role: logic

import { signalsFor, statedValueEcho } from '../profile/focus-area-signals.js';
import { isDeclinedProfileValue, getProfileQuestionCatalog } from '../profile/profile-schema.js';
import { sleepDurationDisplay } from '../profile/sleep-duration.js';
import { stepTextForRecord } from '../feed/today-steps.js';

export const FOLLOWUPS_KEY = 'tendai_followups_v1';
export const FOLLOWUP_MUTED_KEY = 'tendai_followup_muted_areas_v1';
/** Permanent per-field "Don't ask again" for profile follow-ups. */
export const FOLLOWUP_DECLINED_FIELDS_KEY = 'tendai_followup_declined_fields_v1';

const EMPTY = { answers: [], seen: [], deferrals: [] };

/**
 * Proactive Talk templates that interpolate a stored value and/or field label.
 * Action follow-ups interpolate Today action text (not a profile field).
 */
export const PROACTIVE_FOLLOWUP_TEMPLATES = [
  {
    id: 'action',
    description: 'Today action revisit',
    build: ({ actionText }) => {
      const sentence = /[.?!]$/.test(actionText) ? actionText : `${actionText}.`;
      return `Last time you tried ${sentence} How did it go?`;
    },
  },
  {
    id: 'profile-answered',
    description: 'Profile field with a real prior answer',
    build: ({ value, fieldLabel }) =>
      `Last time you said ${value} for ${fieldLabel}. Anything changed?`,
  },
  {
    id: 'profile-declined',
    description: 'Profile field the user previously declined',
    build: ({ fieldLabel }) => `Want to answer the ${fieldLabel} question now?`,
  },
];

export function localDayOffset(fromKey, toKey) {
  const a = new Date(`${fromKey}T12:00:00`);
  const b = new Date(`${toKey}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function readJson(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '');
    return raw == null ? fallback : raw;
  } catch (_) {
    return fallback;
  }
}

export function loadFollowups() {
  const raw = readJson(FOLLOWUPS_KEY, EMPTY);
  return {
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    seen: Array.isArray(raw.seen) ? raw.seen : [],
    deferrals: Array.isArray(raw.deferrals) ? raw.deferrals : [],
  };
}

export function saveFollowups(state) {
  const next = {
    answers: Array.isArray(state?.answers) ? state.answers : [],
    seen: Array.isArray(state?.seen) ? state.seen : [],
    deferrals: Array.isArray(state?.deferrals) ? state.deferrals : [],
  };
  localStorage.setItem(FOLLOWUPS_KEY, JSON.stringify(next));
  return next;
}

export function loadMutedAreas() {
  const raw = readJson(FOLLOWUP_MUTED_KEY, []);
  return Array.isArray(raw) ? raw.map((id) => String(id)) : [];
}

export function setAreaMuted(area, muted) {
  const id = String(area || '').trim();
  if (!id) return loadMutedAreas();
  const next = loadMutedAreas().filter((item) => item !== id);
  if (muted) next.push(id);
  localStorage.setItem(FOLLOWUP_MUTED_KEY, JSON.stringify(next));
  return next;
}

export function loadDeclinedFollowUpFields() {
  const raw = readJson(FOLLOWUP_DECLINED_FIELDS_KEY, []);
  return Array.isArray(raw) ? raw.map((id) => String(id)) : [];
}

export function setFieldFollowUpDeclined(path, declined = true) {
  const id = String(path || '').trim();
  if (!id) return loadDeclinedFollowUpFields();
  const next = loadDeclinedFollowUpFields().filter((item) => item !== id);
  if (declined) next.push(id);
  localStorage.setItem(FOLLOWUP_DECLINED_FIELDS_KEY, JSON.stringify(next));
  return next;
}

export function actionRef(step) {
  return `${step.date}|${step.slot}|${step.actionId}`;
}

export function profileRef(path, stored) {
  return `${path}|${stored}`;
}

function answeredRefs(state) {
  return new Set((state?.answers || []).map((row) => row && row.ref).filter(Boolean));
}

export function fieldLabelForPath(path) {
  const [sectionKey, fieldKey] = String(path || '').split('.');
  if (!sectionKey || !fieldKey) return fieldKey || 'question';
  const section = getProfileQuestionCatalog().find((entry) => entry.key === sectionKey);
  const field = section?.fields.find((entry) => entry.key === fieldKey);
  return field?.label || fieldKey;
}

/** Human phrase for an answered follow-up. Empty for declined / missing. */
export function displayFollowUpValue(signal, value) {
  if (value == null || isDeclinedProfileValue(value)) return '';
  const path = `${signal.section}.${signal.field}`;
  if (path === 'lifestyle.sleepDuration') {
    const phrase = sleepDurationDisplay(value);
    if (!phrase || isDeclinedProfileValue(phrase) || /prefer not|rather not/i.test(phrase)) return '';
    return phrase;
  }
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const raw = String(value).trim();
  if (!raw || isDeclinedProfileValue(raw)) return '';
  return raw.replace(/-/g, ' ');
}

export const ACTION_CHIPS = [
  { id: 'went-well', label: 'Went well' },
  { id: 'not-really', label: 'Not really' },
  { id: 'not-yet', label: "Haven't tried yet" },
  { id: 'later', label: 'Another time' },
  { id: 'mute', label: "Don't ask about this" },
];

export const PROFILE_ANSWERED_CHIPS = [
  { id: 'same', label: 'About the same' },
  { id: 'changed', label: 'Something changed' },
  { id: 'later', label: 'Not now' },
  { id: 'mute-field', label: "Don't ask again" },
];

export const PROFILE_DECLINED_CHIPS = [
  { id: 'answer-now', label: 'Answer now' },
  { id: 'later', label: 'Not now' },
  { id: 'mute-field', label: "Don't ask again" },
];

/**
 * Build the profile follow-up payload for one signal + stored value.
 * Declined answers never appear as values in the sentence.
 */
export function buildProfileFollowUp({ signal, area, stated, seenOn }) {
  const path = `${signal.section}.${signal.field}`;
  const fieldLabel = fieldLabelForPath(path);
  const declined = isDeclinedProfileValue(stated.stored);
  if (declined) {
    return {
      kind: 'profile',
      profileState: 'declined',
      ref: profileRef(path, stated.stored),
      area,
      path,
      seenOn,
      text: PROACTIVE_FOLLOWUP_TEMPLATES.find((t) => t.id === 'profile-declined').build({ fieldLabel }),
      chips: PROFILE_DECLINED_CHIPS,
    };
  }
  const value = displayFollowUpValue(signal, stated.stored);
  if (!value) return null;
  return {
    kind: 'profile',
    profileState: 'answered',
    ref: profileRef(path, stated.stored),
    area,
    path,
    seenOn,
    text: PROACTIVE_FOLLOWUP_TEMPLATES.find((t) => t.id === 'profile-answered').build({ value, fieldLabel }),
    chips: PROFILE_ANSWERED_CHIPS,
  };
}

/**
 * Remember value-echo facts the first day they are seen. Not due until a later day.
 * @returns {{ state: { answers: object[], seen: object[] }, changed: boolean }}
 */
export function noteProfileFactsSeen(profile, today, state, areas) {
  const next = {
    answers: [...(state?.answers || [])],
    seen: [...(state?.seen || [])],
    deferrals: [...(state?.deferrals || [])],
  };
  let changed = false;
  const known = new Set(next.seen.map((row) => `${row.path}|${row.value}`));
  for (const area of areas || []) {
    for (const signal of signalsFor(area)) {
      if (!signal || signal.echo !== 'value') continue;
      const stated = statedValueEcho(profile, signal);
      if (!stated) continue;
      const path = `${signal.section}.${signal.field}`;
      const key = `${path}|${stated.stored}`;
      if (known.has(key)) continue;
      known.add(key);
      next.seen.push({ path, value: stated.stored, on: today });
      changed = true;
    }
  }
  return { state: next, changed };
}

function dueAction(opts, muted, done) {
  const steps = (opts.steps || [])
    .filter((step) => step && (step.status === 'done' || step.status === 'skipped'))
    .filter((step) => step.actionId && !String(step.actionId).startsWith('checkin-'))
    .filter((step) => !muted.has(step.area))
    .filter((step) => !done.has(actionRef(step)))
    .filter((step) => {
      const offset = localDayOffset(step.date, opts.today);
      return offset != null && offset >= 1 && offset <= 7;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const rank = (slot) => (slot === 'evening' ? 1 : 0);
      return rank(b.slot) - rank(a.slot);
    });
  for (const step of steps) {
    const text = opts.textForStep ? opts.textForStep(step) : stepTextForRecord(step);
    const actionText = String(text || '').trim();
    if (!actionText) continue;
    return {
      kind: 'action',
      ref: actionRef(step),
      area: step.area,
      text: PROACTIVE_FOLLOWUP_TEMPLATES.find((t) => t.id === 'action').build({ actionText }),
      chips: ACTION_CHIPS,
    };
  }
  return null;
}

function dueProfile(opts, muted, done) {
  const seen = opts.state?.seen || [];
  const declinedFields = new Set(opts.declinedFields || loadDeclinedFollowUpFields());
  const candidates = [];
  for (const area of opts.areas || []) {
    if (muted.has(area)) continue;
    for (const signal of signalsFor(area)) {
      if (!signal || signal.echo !== 'value') continue;
      const stated = statedValueEcho(opts.profile, signal);
      if (!stated) continue;
      const path = `${signal.section}.${signal.field}`;
      if (declinedFields.has(path)) continue;
      const ref = profileRef(path, stated.stored);
      if (done.has(ref)) continue;
      const stamp = seen.find((row) => row.path === path && row.value === stated.stored);
      if (!stamp?.on) continue;
      const offset = localDayOffset(stamp.on, opts.today);
      if (offset == null || offset < 1) continue;
      const declined = isDeclinedProfileValue(stated.stored);
      // Declined follow-ups: at most once per 7-day window after the decline was noted.
      if (declined && offset > 7) continue;
      const built = buildProfileFollowUp({ signal, area, stated, seenOn: stamp.on });
      if (built) candidates.push(built);
    }
  }
  candidates.sort((a, b) => (a.seenOn === b.seenOn ? a.path.localeCompare(b.path) : a.seenOn < b.seenOn ? -1 : 1));
  return candidates[0] || null;
}

/** One follow-up, or null. Actions from the last 7 days win over a profile revisit. */
export function selectDueFollowUp(opts) {
  const muted = new Set(opts.muted || []);
  const done = answeredRefs(opts.state);
  return dueAction(opts, muted, done) || dueProfile(opts, muted, done);
}

export function saveFollowUpAnswer(state, due, answer, today) {
  const next = {
    answers: [...(state?.answers || [])].filter((row) => row.ref !== due.ref),
    seen: [...(state?.seen || [])],
    deferrals: [...(state?.deferrals || [])],
  };
  next.answers.push({
    ref: due.ref,
    kind: due.kind,
    area: due.area,
    answer,
    on: today,
  });
  return next;
}

/** Count an "Another time" / "Not now". The second one expires the item with answer code "deferred". */
export function noteFollowUpDeferred(state, due, today) {
  const deferrals = [...(state?.deferrals || [])];
  const index = deferrals.findIndex((row) => row && row.ref === due.ref);
  const count = (index >= 0 ? Number(deferrals[index].count) || 0 : 0) + 1;
  const row = { ref: due.ref, count };
  if (index >= 0) deferrals[index] = row;
  else deferrals.push(row);
  const next = {
    answers: [...(state?.answers || [])],
    seen: [...(state?.seen || [])],
    deferrals,
  };
  if (count < 2) return { state: next, expired: false };
  return { state: saveFollowUpAnswer(next, due, 'deferred', today), expired: true };
}

export function followUpAcknowledgment(choice, areaName) {
  const name = areaName || 'that area';
  if (choice === 'later') {
    return "No rush — I'll pick this up next time you open Talk. Ask me anything in the meantime.";
  }
  if (choice === 'mute') {
    return `I won't ask about ${name} follow-ups. You can turn that back on in Settings.`;
  }
  if (choice === 'mute-field') {
    return "Got it — I won't ask about that again.";
  }
  if (choice === 'went-well') return 'Noted. Glad you gave it a try.';
  if (choice === 'not-really') return 'Noted. That one can wait.';
  if (choice === 'not-yet') return 'Noted. Trying it later is fine.';
  if (choice === 'same') return "Noted. I'll leave that as it is.";
  if (choice === 'changed' || choice === 'answer-now') return 'Okay — here is that question again.';
  if (choice === 'skip') return "All right. I won't follow up on that one.";
  return 'Noted.';
}
