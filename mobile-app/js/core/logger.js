// Serron — Logging System (Action Trace Standard)
// @owner: core
// @role: logging
// Format: [CATEGORY] message correlation=...

const DEV = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location?.hostname || '');

// Current correlation ID (from dispatch)
let currentCorrelationId = null;

// Log levels
const LEVELS = {
  ACTION: 'ACTION',
  STATE: 'STATE',
  EFFECT: 'EFFECT',
  RENDER: 'RENDER',
  GUARD: 'GUARD',
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO'
};

/**
 * Set current correlation ID
 */
export function setCorrelationId(id) {
  currentCorrelationId = id;
}

/**
 * Get current correlation ID
 */
export function getCorrelationId() {
  return currentCorrelationId;
}

/**
 * Log action
 */
export function logAction(type, payload = {}, reason = 'user-action') {
  const id = currentCorrelationId || `act_${Date.now()}`;
  console.log(`[ACTION] id=${id} type=${type} reason=${reason}`, payload);
  return id;
}

/**
 * Log state change
 */
export function logState(patch, reason = 'update', correlationId = null) {
  const id = correlationId || currentCorrelationId;
  const patchKeys = Array.isArray(patch) ? patch : Object.keys(patch);
  console.log(`[STATE] patch=${patchKeys.join(',')} reason=${reason}${id ? ' id=' + id : ''}`);
}

/**
 * Log effect
 */
export function logEffect(phase, id, reason = '', correlationId = null) {
  const cid = correlationId || currentCorrelationId;
  console.log(`[EFFECT] ${phase} id=${id} reason=${reason}${cid ? ' correlation=' + cid : ''}`);
}

/**
 * Log render
 */
export function logRender(phase, component, reason = '', correlationId = null) {
  const cid = correlationId || currentCorrelationId;
  console.log(`[RENDER] ${phase} component=${component} reason=${reason}${cid ? ' correlation=' + cid : ''}`);
}

/**
 * Log guard warning
 */
export function logGuard(warning, details = {}) {
  console.warn(`[GUARD][WARN] ${warning}`, details);
}

/**
 * Log error
 */
export function logError(context, error, details = {}) {
  console.error(`[ERROR] context=${context}`, error, details);
}

/**
 * Log info
 */
export function logInfo(message, details = {}) {
  console.log(`[INFO] ${message}`, details);
}

/**
 * Create logger with context
 */
export function createLogger(context) {
  return {
    action: (type, payload, reason) => logAction(type, payload, reason),
    state: (patch, reason, correlationId) => logState(patch, reason, correlationId),
    effect: (phase, id, reason, correlationId) => logEffect(phase, id, reason, correlationId),
    render: (phase, component, reason, correlationId) => logRender(phase, component, reason, correlationId),
    guard: (warning, details) => logGuard(warning, details),
    error: (error, details) => logError(context, error, details),
    info: (message, details) => logInfo(message, details)
  };
}
