// Serron — Signal journal (sleep, future: steps/food). Silent storage, no summaries.
// @owner: storage
// @role: state

const STORAGE_KEY = 'tendai-signal-journal';

function loadJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function saveJournal(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (_e) {}
}

/**
 * Add a signal. Same day re-selection: last wins, history kept.
 * @param {{ date: string, type: string, source: string, payload: object, created_at: string }} entry
 */
export function addSignal(entry) {
  const created_at = (entry.created_at && new Date(entry.created_at).toISOString()) || new Date().toISOString();
  const record = {
    date: entry.date,
    type: entry.type,
    source: entry.source,
    payload: entry.payload || {},
    created_at
  };
  const journal = loadJournal();
  journal.push(record);
  saveJournal(journal);
}

/**
 * Get signals (optional filter by type and/or date).
 * @param {{ type?: string, date?: string }} opts
 * @returns {Array}
 */
export function getSignals(opts = {}) {
  let list = loadJournal();
  if (opts.type) list = list.filter((e) => e.type === opts.type);
  if (opts.date) list = list.filter((e) => e.date === opts.date);
  return list;
}

/**
 * Active sleep for a date: last sleep signal for that date (from any source).
 * @param {string} date YYYY-MM-DD
 * @returns {object|null} payload { quality, duration } or null
 */
export function getActiveSleepForDate(date) {
  const sleepSignals = getSignals({ type: 'sleep', date });
  if (sleepSignals.length === 0) return null;
  const last = sleepSignals[sleepSignals.length - 1];
  return last.payload || null;
}
