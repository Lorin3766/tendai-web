import { relayConfig } from './config.js';
import { RELAY_CODES, sendRelayError } from './errors.js';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Strict talk/chat body shape. Reject unknown top-level keys that are not strings/objects/arrays of expected kinds.
 * Allowed: message (string), userProfile (object|null), profileContext (string), system_state (object),
 * and a few legacy aliases used by the app.
 */
export function validateTalkBody(body) {
  const cfg = relayConfig();
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'Body must be a JSON object' };
  }
  const allowed = new Set([
    'message',
    'userProfile',
    'profileContext',
    'system_state',
    'systemState',
    'history',
    'requestType',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: `Unexpected field: ${key}` };
    }
  }
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      code: RELAY_CODES.BAD_REQUEST,
      message: 'Message is required and must be a non-empty string',
    };
  }
  if (body.message.length > cfg.maxMessageLength) {
    return {
      ok: false,
      status: 400,
      code: RELAY_CODES.BAD_REQUEST,
      message: `Message is too long (max ${cfg.maxMessageLength} characters)`,
    };
  }
  if (body.userProfile != null && !isPlainObject(body.userProfile)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'userProfile must be an object' };
  }
  if (body.profileContext != null && typeof body.profileContext !== 'string') {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'profileContext must be a string' };
  }
  if (body.system_state != null && !isPlainObject(body.system_state)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'system_state must be an object' };
  }
  if (body.systemState != null && !isPlainObject(body.systemState)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'systemState must be an object' };
  }
  if (body.history != null && !Array.isArray(body.history)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'history must be an array' };
  }
  if (body.requestType != null && typeof body.requestType !== 'string') {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'requestType must be a string' };
  }
  return { ok: true };
}

export function validateFeedAdviceBody(body) {
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'Body must be a JSON object' };
  }
  const allowed = new Set(['profileState', 'dayState']);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: `Unexpected field: ${key}` };
    }
  }
  if (body.profileState != null && !isPlainObject(body.profileState)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'profileState must be an object' };
  }
  if (body.dayState != null && !isPlainObject(body.dayState)) {
    return { ok: false, status: 400, code: RELAY_CODES.BAD_REQUEST, message: 'dayState must be an object' };
  }
  return { ok: true };
}

export function rejectInvalid(res, result) {
  return sendRelayError(res, result.status || 400, result.code || RELAY_CODES.BAD_REQUEST, result.message);
}
