// Serron — AppState (Primary store for UI/session)
// @owner: core
// @role: state
//
// PRIMARY store for: activeView, plan, talk mode, checkins, demo. Persisted data (profile, day,
// talk history, feed, integrity) lives in state.js; see core/state-bridge.js.
// Golden Rule: UI не имеет права менять себя "сбоку"
// UI меняется только как следствие Action → State → Render

const DEV = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location?.hostname || '');

// AppState structure (immutable updates)
let appState = {
  // View state
  activeView: 'feed', // 'feed' | 'talk' | 'services' | 'profile'
  previousView: null,
  
  // Plan state
  plan: {
    status: null, // 'active' | 'paused' | null
    data: null, // planData v1
    checkpoint: null,
    flow: {
      requestedFromFeed: false // Flag that plan start was requested from FEED
    }
  },
  
  // Feed state
  feed: {
    cards: [], // Array of card IDs that should be visible
    dismissed: {}, // { cardId: timestamp }
    lastUpdate: null
  },
  
  // Talk state
  talk: {
    mode: 'normal', // 'normal' | 'plan_build' | 'presence' | 'micro_prompt'
    plan: {
      step: 0 // 0 | 1 | 2 | 3 (Plan Builder steps)
    },
    seedType: 'talk', // 'talk' | 'plan' (which seed should be active)
    pendingPrompt: null, // null | { key: string, text: string }
    history: [],
    unreadCount: 0,
    pendingEvents: [], // TalkQueue events
    _needsReconcile: false // Internal flag for reconcile request
  },
  
  // Check-in state
  checkins: {
    morning: { dismissed: false, completed: false },
    evening: { dismissed: false, completed: false }
  },
  
  // UI state
  ui: {
    planManageOpen: false,
    todayStepMode: 'normal', // 'normal' | 'minimum'
    checkinOverlayOpen: false
  },

  // Developer Demo Mode: simulate live sensor data when ON
  demo: {
    isDemoMode: false
  }
};

// State subscribers (for reactive updates)
const subscribers = new Set();

// State history (for debugging)
const stateHistory = [];
const MAX_HISTORY = 50;

/**
 * Get current AppState (read-only)
 */
export function getState() {
  return { ...appState }; // Shallow copy for safety
}

/**
 * Get state slice (read-only)
 */
export function getStateSlice(path) {
  const parts = path.split('.');
  let value = appState;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

/**
 * Subscribe to state changes
 * @param {Function} callback - Called with (newState, oldState, patch)
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Update state (immutable)
 * @param {Object} patch - Partial state update
 * @param {string} reason - Why this update happened
 * @param {string} correlationId - Action correlation ID
 */
export function updateState(patch, reason = 'update', correlationId = null) {
  const oldState = { ...appState };
  
  // Deep merge patch into state
  appState = deepMerge(appState, patch);
  
  // Log state change
  if (DEV) {
    const logEntry = {
      timestamp: Date.now(),
      reason,
      correlationId,
      patch: Object.keys(patch),
      oldState: oldState,
      newState: appState
    };
    stateHistory.push(logEntry);
    if (stateHistory.length > MAX_HISTORY) {
      stateHistory.shift();
    }
    console.log(`[STATE] patch=${logEntry.patch.join(',')} reason=${reason}${correlationId ? ' id=' + correlationId : ''}`);
  }
  
  // Notify subscribers
  subscribers.forEach(callback => {
    try {
      callback(appState, oldState, patch);
    } catch (err) {
      console.error('[STATE][ERROR] subscriber failed:', err);
    }
  });
}

/**
 * Deep merge helper
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Get state history (DEV only)
 */
export function getStateHistory() {
  if (!DEV) return [];
  return [...stateHistory];
}

/**
 * Reset state (DEV only, for testing)
 */
export function resetState() {
  if (!DEV) {
    console.warn('[STATE] resetState is DEV-only');
    return;
  }
  appState = {
    activeView: 'feed',
    previousView: null,
    plan: { 
      status: null, 
      data: null, 
      checkpoint: null,
      flow: { requestedFromFeed: false }
    },
      feed: { 
        cards: [], 
        dismissed: { checkins: {} }, 
        lastUpdate: null,
        ui: { weatherDetailsOpen: false }
      },
    talk: {
      mode: 'normal',
      plan: { step: 0 },
      seedType: 'talk',
      pendingPrompt: null,
      history: [],
      unreadCount: 0,
      pendingEvents: [],
      _needsReconcile: false
    },
    checkins: {
      morning: { dismissed: false, completed: false },
      evening: { dismissed: false, completed: false }
    },
    ui: {
      planManageOpen: false,
      todayStepMode: 'normal',
      checkinOverlayOpen: false
    },
    demo: { isDemoMode: false }
  };
  stateHistory.length = 0;
  console.log('[STATE] reset');
}

// Initialize from localStorage on boot
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('tendai-app-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge saved state (careful merge, not full replace)
      appState = deepMerge(appState, parsed);
      if (DEV) {
        console.log('[STATE] restored from localStorage');
      }
    }
  } catch (err) {
    console.warn('[STATE] failed to restore from localStorage:', err);
  }
  
  // Auto-save state changes to localStorage (debounced)
  let saveTimeout = null;
  subscribe(() => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem('tendai-app-state', JSON.stringify(appState));
      } catch (err) {
        console.warn('[STATE] failed to save to localStorage:', err);
      }
    }, 500);
  });
}
