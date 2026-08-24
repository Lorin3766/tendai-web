// Serron — Effects Layer (Isolated Side Effects)
// @owner: core
// @role: effects
// Rule: Все побочные эффекты регистрируются здесь

const DEV = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location?.hostname || '');

// Effects registry
const effectsRegistry = new Map();

// Active effects (for cleanup)
const activeEffects = new Map();

// Effect history (for debugging)
const effectHistory = [];
const MAX_EFFECT_HISTORY = 100;

/**
 * Register effect
 * @param {string} id - Unique effect ID
 * @param {Object} config - { start: Function, stop?: Function, reason: string }
 */
export function registerEffect(id, config) {
  if (effectsRegistry.has(id)) {
    console.warn(`[EFFECTS] Effect ${id} already registered, overwriting`);
  }
  effectsRegistry.set(id, config);
  if (DEV) {
    console.log(`[EFFECTS] Registered: ${id} (${config.reason})`);
  }
}

/**
 * Start effect
 * @param {string} id - Effect ID
 * @param {any} params - Parameters for effect
 * @param {string} correlationId - Action correlation ID
 */
export function startEffect(id, params = {}, correlationId = null) {
  const effect = effectsRegistry.get(id);
  if (!effect) {
    console.warn(`[EFFECTS] Effect ${id} not found`);
    return null;
  }
  
  // Stop existing effect if running
  if (activeEffects.has(id)) {
    stopEffect(id);
  }
  
  // Log effect start
  if (DEV) {
    const logEntry = {
      timestamp: Date.now(),
      id,
      correlationId,
      reason: effect.reason,
      params
    };
    effectHistory.push(logEntry);
    if (effectHistory.length > MAX_EFFECT_HISTORY) {
      effectHistory.shift();
    }
    console.log(`[EFFECT] start id=${id} reason=${effect.reason}${correlationId ? ' correlation=' + correlationId : ''}`, params);
  } else {
    console.log(`[EFFECT] start id=${id}`, params);
  }
  
  // Start effect
  let result = null;
  try {
    result = effect.start(params, correlationId);
    activeEffects.set(id, { effect, result, startedAt: Date.now() });
  } catch (err) {
    console.error(`[EFFECT][ERROR] start failed for ${id}:`, err);
    if (DEV) {
      const errorEntry = {
        timestamp: Date.now(),
        id,
        correlationId,
        error: err.message,
        stack: err.stack
      };
      effectHistory.push(errorEntry);
    }
  }
  
  return result;
}

/**
 * Stop effect
 * @param {string} id - Effect ID
 */
export function stopEffect(id) {
  const active = activeEffects.get(id);
  if (!active) {
    return;
  }
  
  const { effect, result } = active;
  
  // Log effect stop
  if (DEV) {
    console.log(`[EFFECT] stop id=${id} reason=${effect.reason}`);
  }
  
  // Stop effect
  if (effect.stop) {
    try {
      effect.stop(result);
    } catch (err) {
      console.error(`[EFFECT][ERROR] stop failed for ${id}:`, err);
    }
  }
  
  activeEffects.delete(id);
}

/**
 * Stop all effects
 */
export function stopAllEffects() {
  const ids = Array.from(activeEffects.keys());
  ids.forEach(id => stopEffect(id));
}

/**
 * Get active effects
 */
export function getActiveEffects() {
  return Array.from(activeEffects.keys());
}

/**
 * Get effect history (DEV only)
 */
export function getEffectHistory() {
  if (!DEV) return [];
  return [...effectHistory];
}

// Built-in effects

/**
 * Interval effect
 */
export function createIntervalEffect(id, interval, callback, reason) {
  registerEffect(id, {
    reason,
    start: (params, correlationId) => {
      const ms = params.interval || interval;
      const handler = setInterval(() => {
        try {
          callback(params, correlationId);
        } catch (err) {
          console.error(`[EFFECT][ERROR] Interval callback failed for ${id}:`, err);
        }
      }, ms);
      return handler;
    },
    stop: (handler) => {
      if (handler) clearInterval(handler);
    }
  });
}

/**
 * Timeout effect
 */
export function createTimeoutEffect(id, delay, callback, reason) {
  registerEffect(id, {
    reason,
    start: (params, correlationId) => {
      const ms = params.delay || delay;
      const handler = setTimeout(() => {
        try {
          callback(params, correlationId);
        } catch (err) {
          console.error(`[EFFECT][ERROR] Timeout callback failed for ${id}:`, err);
        }
        activeEffects.delete(id);
      }, ms);
      return handler;
    },
    stop: (handler) => {
      if (handler) clearTimeout(handler);
    }
  });
}

/**
 * MutationObserver effect
 */
export function createObserverEffect(id, target, config, callback, reason) {
  registerEffect(id, {
    reason,
    start: (params, correlationId) => {
      const observer = new MutationObserver((mutations) => {
        try {
          callback(mutations, params, correlationId);
        } catch (err) {
          console.error(`[EFFECT][ERROR] Observer callback failed for ${id}:`, err);
        }
      });
      const targetEl = typeof target === 'function' ? target() : target;
      if (targetEl) {
        observer.observe(targetEl, config);
        if (DEV) {
          console.log(`[EFFECT] Observer started for ${id} on`, targetEl);
        }
      } else {
        console.warn(`[EFFECT] Observer target not found for ${id}`);
      }
      return observer;
    },
    stop: (observer) => {
      if (observer) observer.disconnect();
    }
  });
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    stopAllEffects();
  });
}
