// On-device history of check-in fields the user actually entered. Nothing is sent.
// @owner: core
// @role: storage

import { addDays } from './local-metrics.js';

export const CHECKIN_HISTORY_KEY = 'tendai_checkin_history_v1';
const MAX_DAYS = 90;

function emptyState() {
  return { days: [] };
}

function hasValue(value) {
  return value != null && value !== '';
}

/** Only fields present on the day record. Nulls are untouched and are omitted. */
export function checkinHistoryEntry(day) {
  if (!day || typeof day.date !== 'string' || !day.date) return null;
  const entry = { date: day.date };
  if (hasValue(day.sleep?.hours)) entry.sleepHours = day.sleep.hours;
  if (hasValue(day.water?.current)) entry.water = day.water.current;
  if (hasValue(day.energy)) entry.energy = day.energy;
  if (hasValue(day.stressLevel)) entry.stress = day.stressLevel;
  return Object.keys(entry).length > 1 ? entry : null;
}

function readState() {
  if (typeof localStorage === 'undefined') return emptyState();
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKIN_HISTORY_KEY) || '');
    const days = Array.isArray(parsed?.days) ? parsed.days.filter((row) => row && row.date) : [];
    return { days };
  } catch (_) {
    return emptyState();
  }
}

function writeState(days, asOf) {
  if (typeof localStorage === 'undefined') return;
  const cutoff = addDays(asOf, -(MAX_DAYS - 1));
  const kept = days
    .filter((row) => row && row.date && (!cutoff || row.date >= cutoff))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const trimmed = kept.length > MAX_DAYS ? kept.slice(kept.length - MAX_DAYS) : kept;
  localStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify({ days: trimmed }));
}

/** Replace the row for this day with the fields actually stored. A day with none is dropped. */
export function recordCheckinHistory(day) {
  if (!day || typeof day.date !== 'string' || !day.date || typeof localStorage === 'undefined') return;
  const entry = checkinHistoryEntry(day);
  const days = readState().days.filter((row) => row.date !== day.date);
  if (entry) days.push(entry);
  writeState(days, day.date);
}

/**
 * Rename a legacy UTC-dated history row onto the local date.
 * If both rows exist, keep the local-dated one and drop the UTC duplicate.
 */
export function migrateCheckinHistoryDate(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate === toDate || typeof localStorage === 'undefined') return;
  const days = readState().days;
  const fromRow = days.find((row) => row.date === fromDate);
  if (!fromRow) return;
  const withoutFrom = days.filter((row) => row.date !== fromDate);
  if (withoutFrom.some((row) => row.date === toDate)) {
    writeState(withoutFrom, toDate);
    return;
  }
  writeState(
    withoutFrom.concat([{ ...fromRow, date: toDate }]),
    toDate,
  );
}

/**
 * First run only: copy today's already-stored day record.
 * Later saves go through recordCheckinHistory.
 */
export function seedCheckinHistory(day) {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(CHECKIN_HISTORY_KEY) != null) return;
  if (!checkinHistoryEntry(day)) {
    localStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify(emptyState()));
    return;
  }
  recordCheckinHistory(day);
}

export function getObriumCheckinHistory() {
  return readState().days;
}

if (typeof window !== 'undefined') {
  window.getObriumCheckinHistory = () => getObriumCheckinHistory();
}
