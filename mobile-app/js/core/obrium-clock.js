// Local clock for day boundaries. Tests may override it only on loopback.
// @owner: core
// @role: time

function loopbackHost(env) {
  const hostname =
    env && env.hostname != null
      ? String(env.hostname)
      : typeof location !== 'undefined'
        ? location.hostname
        : '';
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** @param {{ hostname?: string }} [env] */
export function isClockOverrideAllowed(env) {
  return loopbackHost(env);
}

/**
 * @param {Date|string|number|null} value
 * @param {{ hostname?: string }} [env]
 * @returns {boolean} true when the override was stored
 */
export function setObriumClockOverride(value, env) {
  if (!isClockOverrideAllowed(env)) return false;
  if (typeof window === 'undefined') return false;
  if (value == null) {
    delete window.__obriumClockOverride;
    return true;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  window.__obriumClockOverride = date.toISOString();
  return true;
}

/** @param {{ hostname?: string }} [env] */
export function obriumNow(env) {
  if (isClockOverrideAllowed(env) && typeof window !== 'undefined' && window.__obriumClockOverride) {
    const date = new Date(window.__obriumClockOverride);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

/** Local calendar date. Survives DST because it uses local year/month/day, not UTC. */
export function localDateKey(date = obriumNow()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC calendar date (legacy day-record key). Prefer localDateKey for new writes. */
export function utcDateKey(date = obriumNow()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/**
 * Map a stored day-record date onto the local calendar.
 * Legacy records used UTC. If the stored key equals UTC "today" while the local
 * calendar day differs, keep that record as local today (no duplicate, no drop).
 * @returns {{ date: string|null, migrated: boolean }} null date means not today — reset.
 */
export function migrateStoredDayDate(storedDate, now = obriumNow()) {
  const localToday = localDateKey(now);
  if (!storedDate || typeof storedDate !== 'string') {
    return { date: null, migrated: false };
  }
  if (storedDate === localToday) return { date: localToday, migrated: false };
  const utcToday = utcDateKey(now);
  if (storedDate === utcToday && utcToday !== localToday) {
    return { date: localToday, migrated: true };
  }
  return { date: null, migrated: false };
}

/**
 * morning before 12:00, evening from 17:00, otherwise whichever boundary is nearer.
 * @returns {'morning'|'evening'}
 */
export function slotForTime(date = obriumNow()) {
  const d = date instanceof Date ? date : new Date(date);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < 12 * 60) return 'morning';
  if (minutes >= 17 * 60) return 'evening';
  const fromMorning = minutes - 12 * 60;
  const toEvening = 17 * 60 - minutes;
  return fromMorning <= toEvening ? 'morning' : 'evening';
}

if (typeof window !== 'undefined') {
  window.setObriumClockOverride = setObriumClockOverride;
  window.obriumNow = obriumNow;
}
