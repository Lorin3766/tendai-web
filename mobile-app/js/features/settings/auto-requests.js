/**
 * User switches for requests Obrium sends to the AI without a user message.
 * Stored inside the existing `tendai_settings` object; read at call time so
 * changes apply without a reload. Missing value = ON.
 */

const SETTINGS_KEY = 'tendai_settings';

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** Profile greeting (request B) when Talk opens. */
export function isAutoProfileQuestionsEnabled() {
  return readSettings().autoProfileQuestionsEnabled !== false;
}

/** Feed advice card (POST /api/feed-advice). */
export function isAutoFeedAdviceEnabled() {
  return readSettings().autoFeedAdviceEnabled !== false;
}

/** Background biometric check (request C) on `biometricsUpdated`. */
export function isAutoHealthChecksEnabled() {
  return readSettings().autoHealthChecksEnabled !== false;
}
