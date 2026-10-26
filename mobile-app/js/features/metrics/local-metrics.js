// On-device retention counts. Dates and tallies only. Nothing is sent.
// @owner: core
// @role: storage

import { localDateKey, obriumNow } from '../../core/obrium-clock.js';

export const LOCAL_METRICS_KEY = 'tendai_local_metrics_v1';
const MAX_DAYS = 400;

function emptyState() {
  return { firstOpen: null, days: {} };
}

function dayRecord(prev) {
  const row = prev && typeof prev === 'object' ? prev : {};
  return {
    opened: !!row.opened,
    completed: !!row.completed,
    talkSessions: Number(row.talkSessions) || 0,
  };
}

export function addDays(dateKey, offset) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function capDays(state, today) {
  const cutoff = addDays(today, -(MAX_DAYS - 1));
  const days = {};
  Object.keys(state.days || {}).forEach((key) => {
    if (cutoff && key < cutoff) return;
    days[key] = dayRecord(state.days[key]);
  });
  const keys = Object.keys(days).sort();
  if (keys.length > MAX_DAYS) {
    keys.slice(0, keys.length - MAX_DAYS).forEach((key) => {
      delete days[key];
    });
  }
  return { firstOpen: state.firstOpen || null, days };
}

export function loadLocalMetrics() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_METRICS_KEY) || '');
    if (!raw || typeof raw !== 'object') return emptyState();
    const days = {};
    if (raw.days && typeof raw.days === 'object') {
      Object.keys(raw.days).forEach((key) => {
        days[key] = dayRecord(raw.days[key]);
      });
    }
    return {
      firstOpen: typeof raw.firstOpen === 'string' ? raw.firstOpen : null,
      days,
    };
  } catch (_) {
    return emptyState();
  }
}

function saveLocalMetrics(state) {
  localStorage.setItem(LOCAL_METRICS_KEY, JSON.stringify(state));
  return state;
}

function withDay(state, dateKey, update) {
  const days = { ...(state.days || {}) };
  const row = dayRecord(days[dateKey]);
  update(row);
  days[dateKey] = row;
  return capDays({
    firstOpen: state.firstOpen || dateKey,
    days,
  }, dateKey);
}

export function recordAppOpen(state, dateKey) {
  return withDay(state || emptyState(), dateKey, (row) => {
    row.opened = true;
  });
}

export function recordCompletedStep(state, dateKey) {
  return withDay(state || emptyState(), dateKey, (row) => {
    row.completed = true;
  });
}

export function recordTalkSession(state, dateKey) {
  return withDay(state || emptyState(), dateKey, (row) => {
    row.opened = true;
    row.talkSessions += 1;
  });
}

function persist(update, dateKey) {
  if (typeof localStorage === 'undefined') return null;
  const today = dateKey || localDateKey(obriumNow());
  if (!today) return null;
  return saveLocalMetrics(update(loadLocalMetrics(), today));
}

export function persistAppOpen(dateKey) {
  return persist(recordAppOpen, dateKey);
}

export function persistCompletedStep(dateKey) {
  return persist(recordCompletedStep, dateKey);
}

export function persistTalkSession(dateKey) {
  return persist(recordTalkSession, dateKey);
}

/**
 * D1/D7/D30 are whether the app was opened on first+1/+7/+30.
 * Active days count opened days in the 7 and 30 local dates ending today.
 * stepShare is completed days divided by opened days. talkSessionsPerDay is the same denominator.
 */
export function summarizeLocalMetrics(state, today) {
  const source = state || emptyState();
  const days = source.days || {};
  const first = source.firstOpen || null;
  const openedOn = (key) => !!(key && days[key] && days[key].opened);
  const openedKeys = Object.keys(days).filter((key) => openedOn(key));
  const completed = openedKeys.filter((key) => days[key].completed).length;
  const sessions = openedKeys.reduce((sum, key) => sum + (Number(days[key].talkSessions) || 0), 0);
  const active = (span) => {
    let count = 0;
    for (let i = 0; i < span; i += 1) {
      if (openedOn(addDays(today, -i))) count += 1;
    }
    return count;
  };
  return {
    firstOpen: first,
    d1: !!(first && openedOn(addDays(first, 1))),
    d7: !!(first && openedOn(addDays(first, 7))),
    d30: !!(first && openedOn(addDays(first, 30))),
    activeDays7: today ? active(7) : 0,
    activeDays30: today ? active(30) : 0,
    stepShare: openedKeys.length ? completed / openedKeys.length : 0,
    talkSessionsPerDay: openedKeys.length ? sessions / openedKeys.length : 0,
  };
}

export function getObriumLocalMetrics(today = localDateKey(obriumNow())) {
  return summarizeLocalMetrics(loadLocalMetrics(), today);
}

if (typeof window !== 'undefined') {
  window.getObriumLocalMetrics = () => getObriumLocalMetrics();
}
