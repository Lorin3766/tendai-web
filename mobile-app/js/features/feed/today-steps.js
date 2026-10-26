// Deterministic Today step. No network. Missing data stays missing.
// @owner: feed
// @role: logic

import { actionEntries, isContentPreviewEnabled } from './content-library.js';
import { localDateKey, slotForTime } from '../../core/obrium-clock.js';

export const TODAY_STEPS_KEY = 'tendai_today_steps_v1';
export const CONTACT_FREQUENCY_KEY = 'tendai_contact_frequency_v1';

const CHECKIN = {
  'checkin-sleep': { text: 'Log how you slept', area: 'sleep', focus: 'checkinSleep' },
  'checkin-day': { text: 'How was your day?', area: 'day', focus: 'checkinEnergy' },
};

function hashString(input) {
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function contactSlotsPerDay(read = () => {
  try {
    return localStorage.getItem(CONTACT_FREQUENCY_KEY);
  } catch (_) {
    return null;
  }
}) {
  return read() === '2' ? 2 : 1;
}

/** @param {Date} date @param {number} slotsPerDay */
export function scheduledSlots(date, slotsPerDay) {
  if (slotsPerDay >= 2) return ['morning', 'evening'];
  return [slotForTime(date)];
}

function slotOrder(slot) {
  return slot === 'evening' ? 1 : 0;
}

function priorSteps(history, dateKey, slot) {
  return (Array.isArray(history) ? history : [])
    .filter((row) => row && row.date && (row.date < dateKey || (row.date === dateKey && slotOrder(row.slot) < slotOrder(slot))))
    .sort((a, b) => (a.date === b.date ? slotOrder(a.slot) - slotOrder(b.slot) : a.date < b.date ? -1 : 1));
}

function checkinStep(slot, day) {
  const sleepMissing = day?.sleepHours == null || day?.sleepHours === '';
  const energyMissing = day?.energy == null || day?.energy === '';
  const stressMissing = day?.stressLevel == null || day?.stressLevel === '';
  if (slot === 'morning' && sleepMissing) {
    return { kind: 'checkin', id: 'checkin-sleep', ...CHECKIN['checkin-sleep'], slot, effort: 'low' };
  }
  if (slot === 'evening' && (energyMissing || stressMissing)) {
    const focus = energyMissing ? 'checkinEnergy' : 'checkinStress';
    return { kind: 'checkin', id: 'checkin-day', ...CHECKIN['checkin-day'], focus, slot, effort: 'low' };
  }
  return null;
}

function eligibleActions(areas, preview, entries) {
  const wanted = new Set(areas);
  return (entries || actionEntries()).filter((entry) => {
    if (!entry || entry.kind !== 'action') return false;
    if (!wanted.has(entry.focusArea)) return false;
    if (preview) return true;
    return entry.reviewed === true;
  });
}

function preferSlot(actions, slot) {
  const exact = actions.filter((entry) => entry.slot === slot);
  if (exact.length) return exact;
  return actions.filter((entry) => entry.slot === 'any');
}

/**
 * @param {{
 *   areas?: string[],
 *   slot: string,
 *   dateKey: string,
 *   history?: object[],
 *   day?: { sleepHours?: unknown, energy?: unknown, stressLevel?: unknown },
 *   preview?: boolean,
 *   entries?: object[],
 * }} opts
 */
export function selectTodayStep(opts) {
  const slot = opts.slot === 'evening' ? 'evening' : 'morning';
  const dateKey = String(opts.dateKey || '');
  const history = priorSteps(opts.history, dateKey, slot);
  const checkin = checkinStep(slot, opts.day || {});
  if (checkin) return checkin;

  let candidates = preferSlot(eligibleActions(opts.areas || [], !!opts.preview, opts.entries), slot);
  if (!candidates.length) return null;

  const last = history[history.length - 1];
  const lastTwo = history.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((row) => row.status === 'skipped')) {
    const skippedAreas = new Set(lastTwo.map((row) => row.area));
    const lowered = candidates.filter((entry) => entry.effort === 'low' && !skippedAreas.has(entry.focusArea));
    candidates = lowered;
  } else if (last && last.status === 'done') {
    const same = candidates.filter((entry) => entry.focusArea === last.area && entry.id !== last.actionId);
    const other = candidates.filter((entry) => entry.focusArea !== last.area);
    const branch = hashString(`${dateKey}|${slot}|${last.area || ''}`);
    if (same.length && other.length) candidates = branch % 2 === 0 ? same : other;
    else if (same.length) candidates = same;
    else if (other.length) candidates = other;
  }

  if (!candidates.length) return null;
  const ordered = [...candidates].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const areasKey = [...(opts.areas || [])].sort().join(',');
  const picked = ordered[hashString(`${dateKey}|${slot}|${areasKey}`) % ordered.length];
  return {
    kind: 'action',
    id: picked.id,
    area: picked.focusArea,
    text: picked.text,
    slot: picked.slot,
    effort: picked.effort,
  };
}

export function stepTextForRecord(record, entries) {
  if (!record) return '';
  if (record.actionId && CHECKIN[record.actionId]) return CHECKIN[record.actionId].text;
  const found = (entries || actionEntries()).find((entry) => entry.id === record.actionId);
  return found?.text || '';
}

/**
 * What the Today block should show for the active slot.
 * @returns {{ mode: 'hidden' } | { mode: 'offer', step: object } | { mode: 'recorded', record: object, step: object }}
 */
export function resolveTodayDisplay(opts) {
  const date = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const slotsPerDay = opts.slotsPerDay === 2 ? 2 : 1;
  const active = scheduledSlots(date, slotsPerDay)[slotsPerDay === 2 ? (slotForTime(date) === 'evening' ? 1 : 0) : 0];
  const dateKey = localDateKey(date);
  const existing = (opts.history || []).find((row) => row && row.date === dateKey && row.slot === active);
  if (existing) {
    const text = stepTextForRecord(existing, opts.entries);
    return {
      mode: 'recorded',
      record: existing,
      step: {
        kind: CHECKIN[existing.actionId] ? 'checkin' : 'action',
        id: existing.actionId,
        area: existing.area,
        text,
        slot: existing.slot,
        effort: existing.effort || 'low',
      },
    };
  }
  const preview =
    opts.preview != null ? !!opts.preview : isContentPreviewEnabled(opts.env);
  const step = selectTodayStep({
    areas: opts.areas || [],
    slot: active,
    dateKey,
    history: opts.history || [],
    day: opts.day,
    preview,
    entries: opts.entries,
  });
  if (!step) return { mode: 'hidden', slot: active, dateKey };
  return { mode: 'offer', step, slot: active, dateKey };
}

export function loadTodaySteps() {
  try {
    const raw = JSON.parse(localStorage.getItem(TODAY_STEPS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

export function saveTodayStep(record) {
  const rows = loadTodaySteps().filter((row) => !(row.date === record.date && row.slot === record.slot));
  const stored = {
    date: record.date,
    slot: record.slot,
    actionId: record.actionId,
    area: record.area,
    status: record.status,
  };
  if (record.rating != null) stored.rating = record.rating;
  rows.push(stored);
  localStorage.setItem(TODAY_STEPS_KEY, JSON.stringify(rows));
  return stored;
}

export function acknowledgment(record) {
  if (!record) return '';
  if (record.status === 'skipped') return 'Skipped. That is fine.';
  if (record.kind === 'checkin' || String(record.actionId || '').startsWith('checkin-')) return 'Logged.';
  if (record.rating != null) return 'Noted, including the rating you tapped.';
  return 'Noted. That is the step for this part of the day.';
}
