// Obrium — Data-sent log (foundation for the "My Data" transparency screen)
// @owner: talk
// @role: storage
// One entry per AI request: when it happened, why, and which categories of data left the device.
// Local-only Talk steps (proactive profile answers) are recorded with sentOffDevice: false.

const STORAGE_KEY = 'tendai_data_sent_log_v1';
const MAX_ENTRIES = 200;

/** Request types used in entries. */
export const DATA_SENT_REQUEST_TYPES = {
  TALK_MESSAGE: 'A: talk-message',
  PROFILE_GREETING: 'B: profile-greeting',
  BACKGROUND_BIOMETRIC_CHECK: 'C: background-biometric-check',
  PROFILE_ANSWER_LOCAL: 'profile-answer (on device)',
  FEED_ADVICE: 'feed-advice',
};

/** @type {Array<object> | null} */
let memory = null;

function load() {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    memory = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    memory = [];
  }
  return memory;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch (_) {}
}

/**
 * @param {{
 *   requestType: string,
 *   dataCategoriesIncluded: string[],
 *   trigger?: 'user' | 'automatic',
 *   destination?: string,
 *   sentOffDevice?: boolean,
 *   outcome?: string,
 * }} entry
 * @returns {object} the stored entry (outcome can be updated later via the returned id)
 */
export function recordDataSent(entry) {
  const list = load();
  const stored = {
    id: `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    requestType: String(entry.requestType || 'unknown'),
    trigger: entry.trigger === 'automatic' ? 'automatic' : 'user',
    sentOffDevice: entry.sentOffDevice !== false,
    destination: entry.destination || (entry.sentOffDevice === false ? 'stays on this device' : 'Obrium relay → Google Gemini'),
    dataCategoriesIncluded: Array.isArray(entry.dataCategoriesIncluded) ? entry.dataCategoriesIncluded.map(String) : [],
    ...(entry.outcome ? { outcome: String(entry.outcome) } : {}),
  };
  list.push(stored);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  persist();
  return stored;
}

/** Update the outcome of an entry (e.g. "sent", "failed: offline — nothing left the device"). */
export function updateDataSentOutcome(id, outcome) {
  const list = load();
  const row = list.find((e) => e.id === id);
  if (!row) return;
  row.outcome = String(outcome);
  if (/not sent|nothing left/i.test(row.outcome)) row.sentOffDevice = false;
  persist();
}

/** Newest last. Returns a copy. */
export function getDataSentLog() {
  return load().map((e) => ({ ...e, dataCategoriesIncluded: [...e.dataCategoriesIncluded] }));
}

export function clearDataSentLog() {
  memory = [];
  persist();
}

if (typeof window !== 'undefined') {
  window.getObriumDataSentLog = getDataSentLog;
}
