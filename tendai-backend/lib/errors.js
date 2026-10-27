/** Machine-readable relay error codes. Never put message or reply text in logs. */

export const RELAY_CODES = {
  RATE_LIMITED: 'rate_limited',
  DAILY_CAP: 'daily_cap',
  GEMINI_QUOTA: 'gemini_quota',
  UPSTREAM_TIMEOUT: 'upstream_timeout',
  NOT_CONFIGURED: 'not_configured',
  BAD_REQUEST: 'bad_request',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
};

export const BUSY_MESSAGE = 'Obrium is busy, try again later';

export function sendRelayError(res, status, code, message) {
  return res.status(status).json({
    error: status === 429 ? 'Too many requests' : status === 503 ? 'Service unavailable' : 'Error',
    code,
    message: message || BUSY_MESSAGE,
  });
}

export function logRelay(event, fields = {}) {
  const safe = { event, ...fields, ts: new Date().toISOString() };
  // Field names, status codes, durations only — never message/profile/reply content.
  console.log(JSON.stringify(safe));
}
