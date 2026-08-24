// Serron — Dispatch System (Action → State → Effects → Render)
// @owner: core
// @role: action-routing
// Golden Rule: Все события проходят через dispatch(action)

const DEV = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location?.hostname || '');

// Action handlers registry
const actionHandlers = new Map();

// Effects registry (side effects after state update)
const effects = new Map();

// Action history (for debugging)
const actionHistory = [];
const MAX_ACTION_HISTORY = 100;

// Current correlation ID
let currentCorrelationId = null;

/**
 * Generate correlation ID
 */
function generateCorrelationId() {
  return `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Register action handler
 * @param {string} actionType - Action type (e.g., 'FEED_START_PLAN')
 * @param {Function} handler - (action, state) => newStatePatch
 */
export function registerActionHandler(actionType, handler) {
  if (actionHandlers.has(actionType)) {
    console.warn(`[DISPATCH] Action handler for ${actionType} already registered, overwriting`);
  }
  actionHandlers.set(actionType, handler);
  if (DEV) {
    console.log(`[DISPATCH] Registered handler for ${actionType}`);
  }
}

/**
 * Register effect (side effect after state update)
 * @param {string} actionType - Action type that triggers this effect
 * @param {Function} effect - (action, newState, oldState) => void
 */
export function registerEffect(actionType, effect) {
  if (!effects.has(actionType)) {
    effects.set(actionType, []);
  }
  effects.get(actionType).push(effect);
  if (DEV) {
    console.log(`[DISPATCH] Registered effect for ${actionType}`);
  }
}

/**
 * Dispatch action (main entry point)
 * @param {Object} action - { type: string, payload?: any, reason?: string }
 * @returns {Promise<void>}
 */
export async function dispatch(action) {
  if (!action || !action.type) {
    console.error('[DISPATCH] Invalid action:', action);
    return;
  }
  
  const correlationId = generateCorrelationId();
  currentCorrelationId = correlationId;
  // Store in window for render logs
  if (typeof window !== 'undefined') {
    window.__currentCorrelationId = correlationId;
  }
  
  const { type, payload = {}, reason = 'user-action' } = action;
  
  // Log action
  if (DEV) {
    const logEntry = {
      timestamp: Date.now(),
      correlationId,
      type,
      payload,
      reason
    };
    actionHistory.push(logEntry);
    if (actionHistory.length > MAX_ACTION_HISTORY) {
      actionHistory.shift();
    }
    console.log(`[ACTION] id=${correlationId} type=${type} reason=${reason}`, payload);
  } else {
    console.log(`[ACTION] type=${type}`, payload);
  }
  
  // Get handler
  const handler = actionHandlers.get(type);
  if (!handler) {
    console.warn(`[DISPATCH] No handler for action type: ${type}`);
    return;
  }
  
  // Get current state
  const { getState, updateState } = await import('./app-state.js');
  const oldState = getState();
  
  // Execute handler (should return state patch)
  let statePatch = {};
  try {
    statePatch = handler(payload, oldState) || {};
  } catch (err) {
    console.error(`[DISPATCH][ERROR] Handler failed for ${type}:`, err);
    return;
  }
  
  // Update state
  if (Object.keys(statePatch).length > 0) {
    updateState(statePatch, reason, correlationId);
  }
  
  // Get new state (after update)
  const newState = getState();
  
  // Execute effects
  const effectList = effects.get(type) || [];
  for (const effect of effectList) {
    try {
      await effect(payload, newState, oldState, correlationId);
    } catch (err) {
      console.error(`[DISPATCH][ERROR] Effect failed for ${type}:`, err);
    }
  }
  
  // Also check for wildcard effects (effects that listen to all actions)
  const wildcardEffects = effects.get('*') || [];
  for (const effect of wildcardEffects) {
    try {
      await effect(payload, newState, oldState, correlationId);
    } catch (err) {
      console.error(`[DISPATCH][ERROR] Wildcard effect failed:`, err);
    }
  }
  
  currentCorrelationId = null;
  // Clear window correlation ID after effects complete
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.__currentCorrelationId = null;
    }, 0);
  }
}

/**
 * Get current correlation ID
 */
export function getCurrentCorrelationId() {
  return currentCorrelationId;
}

/**
 * Get action history (DEV only)
 */
export function getActionHistory() {
  if (!DEV) return [];
  return [...actionHistory];
}

/**
 * Get registered action types
 */
export function getRegisteredActions() {
  return Array.from(actionHandlers.keys());
}
