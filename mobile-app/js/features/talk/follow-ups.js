// On-device Talk follow-ups. No network. Missing text stays missing.
// @owner: talk
// @role: logic

import { signalsFor, statedValueEcho } from '../profile/focus-area-signals.js';
import { stepTextForRecord } from '../feed/today-steps.js';

export const FOLLOWUPS_KEY = 'tendai_followups_v1';
export const FOLLOWUP_MUTED_KEY = 'tendai_followup_muted_areas_v1';

const EMPTY = { answers: [], seen: [] };

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
  };
}

export function saveFollowups(state) {
  const next = {
    answers: Array.isArray(state?.answers) ? state.answers : [],
    seen: Array.isArray(state?.seen) ? state.seen : [],
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

export function actionRef(step) {
  return `${step.date}|${step.slot}|${step.actionId}`;
}

export function profileRef(path, stored) {
  return `${path}|${stored}`;
}

function answeredRefs(state) {
  return new Set((state?.answers || []).map((row) => row && row.ref).filter(Boolean));
}

function mentionFromEcho(echo) {
  return String(echo || '')
    .replace(/^You noted\s+/i, '')
    .replace(/\.$/, '')
    .trim();
}

/**
 * Remember value-echo facts the first day they are seen. Not due until a later day.
 * @returns {{ state: { answers: object[], seen: object[] }, changed: boolean }}
 */
export function noteProfileFactsSeen(profile, today, state, areas) {
  const next = {
    answers: [...(state?.answers || [])],
    seen: [...(state?.seen || [])],
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

const ACTION_CHIPS = [
  { id: 'went-well', label: 'Went well' },
  { id: 'not-really', label: 'Not really' },
  { id: 'not-yet', label: "Haven't tried yet" },
  { id: 'later', label: 'Another time' },
  { id: 'mute', label: "Don't ask about this" },
];

const PROFILE_CHIPS = [
  { id: 'same', label: 'About the same' },
  { id: 'changed', label: 'Something changed' },
  { id: 'skip', label: 'Rather not say' },
  { id: 'later', label: 'Another time' },
  { id: 'mute', label: "Don't ask about this" },
];

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
    const sentence = /[.?!]$/.test(actionText) ? actionText : `${actionText}.`;
    return {
      kind: 'action',
      ref: actionRef(step),
      area: step.area,
      text: `Last time you tried ${sentence} How did it go?`,
      chips: ACTION_CHIPS,
    };
  }
  return null;
}

function dueProfile(opts, muted, done) {
  const seen = opts.state?.seen || [];
  const candidates = [];
  for (const area of opts.areas || []) {
    if (muted.has(area)) continue;
    for (const signal of signalsFor(area)) {
      if (!signal || signal.echo !== 'value') continue;
      const stated = statedValueEcho(opts.profile, signal);
      if (!stated) continue;
      const path = `${signal.section}.${signal.field}`;
      const ref = profileRef(path, stated.stored);
      if (done.has(ref)) continue;
      const stamp = seen.find((row) => row.path === path && row.value === stated.stored);
      if (!stamp?.on) continue;
      const offset = localDayOffset(stamp.on, opts.today);
      if (offset == null || offset < 1) continue;
      const mention = mentionFromEcho(stated.echo);
      if (!mention) continue;
      candidates.push({
        kind: 'profile',
        ref,
        area,
        path,
        seenOn: stamp.on,
        text: `You mentioned ${mention}. Anything changed?`,
        chips: PROFILE_CHIPS,
      });
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

export function followUpAcknowledgment(choice, areaName) {
  const name = areaName || 'that area';
  if (choice === 'later') {
    return "No rush — I'll pick this up next time you open Talk. Ask me anything in the meantime.";
  }
  if (choice === 'mute') {
    return `I won't ask about ${name} follow-ups. You can turn that back on in Settings.`;
  }
  if (choice === 'went-well') return 'Noted. Glad you gave it a try.';
  if (choice === 'not-really') return 'Noted. That one can wait.';
  if (choice === 'not-yet') return 'Noted. Trying it later is fine.';
  if (choice === 'same') return "Noted. I'll leave that as it is.";
  if (choice === 'changed') return 'Noted. You can update it in your profile when you want.';
  if (choice === 'skip') return "All right. I won't follow up on that one.";
  return 'Noted.';
}
