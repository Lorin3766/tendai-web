// TendAI Mobile — Persisted State (localStorage)
// @owner: storage
// @role: state
//
// This is the persisted store (profile, day, talk, feed, integrity). For UI/session state
// (activeView, plan, checkins, demo) use app-state.js as the primary store. See core/state-bridge.js.
// Master Record (StorageManager) syncs from profile on save.

// In-memory cache — loaded once per session, never re-read from localStorage after init
const __memory = {};
const __loaded = {};

const STATE_KEYS = {
  PROFILE: 'tendai-profile-state',
  DAY: 'tendai-day-state',
  FEED: 'tendai-feed-state',
  TALK: 'tendai-talk-state',
  INTEGRITY: 'tendai-integrity-state'
};

// Initial state structures
const initialState = {
  profile: {
    location: null, // {type: 'geo'|'manual', coords?: {lat, lon}, city?: string, zip?: string}
    body: {
      age: null,
      birthYear: null,
      gender: null,
      height: null,
      weight: null,
      goalFocus: null,
      intensity: null,
      targetWeight: null,
      bodyGoal: null
    },
    health: {
      hasChronicDiseases: false,
      chronicDiseases: [],
      chronicDiseasesOther: '',
      takesMedications: false,
      medications: '',
      hasAllergies: false,
      allergyTypes: {
        medication: false,
        food: false,
        other: false
      },
      allergiesDetails: '',
      knowsBloodType: false,
      bloodType: null,
      healthGoal: null
    },
    mind: {
      mood: null,
      stress: 3,
      focus: null,
      burnout: null,
      mindMainGoal: null
    },
    lifestyle: {
      smoking: null,
      alcohol: null,
      activeDays: null,
      stepCategory: null,
      sleepHours: null,
      stressLevel: 3,
      screenTime: null,
      mindGoal: null
    },
    /** Personal routines (vitamins, habits). Protocol Engine — see feed-updater renderProtocolCards */
    protocols: []
  },
  day: {
    date: new Date().toISOString().split('T')[0],
    sleep: {
      hours: null,
      target: 7.5,
      quality: null,
      sleepEndMinutes: null
    },
    water: {
      current: 0,
      target: 8
    },
    energy: null,
    moodToday: null,
    stressLevel: 3,
    activityToday: null,
    weather: {
      temperature: null,
      condition: null,
      feelsLike: null
    },
    pressure: null,
    advice: null,
    dailyFocus: null,
    morningCheckin: null, // {answered: boolean, value: string, timestamp: ISOString}
    eveningCheckin: null, // {answered: boolean, value: string, timestamp: ISOString}
    dailyAction: null // {dateKey: string, id: string, text: string, status: string, updatedAt: ISOString}
  },
  feed: {
    lastUpdate: null,
    quickAdvice: null,
    dayPulse: {
      sleep: null,
      energy: null
    }
  },
  talk: {
    history: [],
    lastMessage: null,
    lastReply: null
  }
};

const SYSTEM_INTEGRITY_MAX = 100;
/** `score` is a deprecated persisted alias retained for older builds. */
const initialIntegrityState = { systemIntegrityScore: 0, score: 0 };

/**
 * Load state from localStorage once, then use in-memory cache.
 * @param {string} stateKey - Key from STATE_KEYS
 * @returns {Object} State object
 */
function loadFromLocalStorage(stateKey) {
  if (__loaded[stateKey]) return __memory[stateKey];

  const initialStateKey = stateKey === STATE_KEYS.PROFILE ? 'profile' :
                          stateKey === STATE_KEYS.DAY ? 'day' :
                          stateKey === STATE_KEYS.FEED ? 'feed' :
                          stateKey === STATE_KEYS.TALK ? 'talk' :
                          stateKey === STATE_KEYS.INTEGRITY ? null : null;
  const initialIntegrity = stateKey === STATE_KEYS.INTEGRITY ? initialIntegrityState : null;

  try {
    const stored = localStorage.getItem(stateKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        let merged = parsed;
        if (stateKey === STATE_KEYS.INTEGRITY && initialIntegrity) {
          const migratedScore = Math.max(
            0,
            Math.min(
              SYSTEM_INTEGRITY_MAX,
              Number(parsed.systemIntegrityScore ?? parsed.score) || 0
            )
          );
          merged = {
            ...initialIntegrity,
            ...parsed,
            systemIntegrityScore: migratedScore,
            score: migratedScore,
          };
        } else if (initialStateKey && initialState[initialStateKey]) {
          merged = mergeState(initialState[initialStateKey], parsed);
        }
        __memory[stateKey] = merged;
        __loaded[stateKey] = true;
        if (stateKey === STATE_KEYS.PROFILE) {
          console.log('[STATE] loaded from localStorage', { key: stateKey });
        }
        return merged;
      } catch (parseError) {
        try {
          localStorage.removeItem(stateKey);
        } catch (_) {}
      }
    }
  } catch (_) {}

  let fallback = {};
  if (stateKey === STATE_KEYS.INTEGRITY && initialIntegrityState) {
    fallback = JSON.parse(JSON.stringify(initialIntegrityState));
  } else if (initialStateKey && initialState[initialStateKey]) {
    fallback = JSON.parse(JSON.stringify(initialState[initialStateKey]));
  }
  __memory[stateKey] = fallback;
  __loaded[stateKey] = true;
  return fallback;
}

/**
 * Age in whole years. Prefer birthYear (source of truth) over a stored age field.
 * @param {{ birthYear?: unknown, age?: unknown }|null|undefined} body
 * @returns {number|null}
 */
export function resolveAgeYears(body) {
  const b = body && typeof body === 'object' ? body : {};
  const by = Number(b.birthYear);
  const yearNow = new Date().getFullYear();
  if (Number.isFinite(by) && by >= 1900 && by <= yearNow) {
    const fromYear = yearNow - by;
    if (fromYear >= 1 && fromYear <= 120) return fromYear;
  }
  const n = Number(b.age);
  if (Number.isFinite(n) && n >= 1 && n <= 120) return Math.round(n);
  return null;
}

/**
 * Get state (from in-memory cache; load once on first access)
 * @param {string} stateKey - Key from STATE_KEYS
 * @returns {Object} State object
 */
export function getState(stateKey) {
  if (!__loaded[stateKey]) {
    return loadFromLocalStorage(stateKey);
  }
  return __memory[stateKey];
}

/**
 * Save state to localStorage and in-memory cache
 * @param {string} stateKey - Key from STATE_KEYS
 * @param {Object} state - State object to save
 */
export function saveState(stateKey, state) {
  try {
    __memory[stateKey] = state;
    __loaded[stateKey] = true;
    localStorage.setItem(stateKey, JSON.stringify(state));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Update specific field in state
 * @param {string} stateKey - Key from STATE_KEYS
 * @param {string|Array} path - Dot notation path or array of keys (e.g., 'body.age' or ['body', 'age'])
 * @param {*} value - Value to set
 */
export function updateState(stateKey, path, value) {
  const state = getState(stateKey);
  const keys = Array.isArray(path) ? path : path.split('.');
  
  let current = state;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
  saveState(stateKey, state);
  
  return state;
}

/**
 * Get specific field from state
 * @param {string} stateKey - Key from STATE_KEYS
 * @param {string|Array} path - Dot notation path or array of keys
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Value at path or default
 */
export function getStateField(stateKey, path, defaultValue = null) {
  const state = getState(stateKey);
  const keys = Array.isArray(path) ? path : path.split('.');
  
  let current = state;
  for (const key of keys) {
    if (current == null || typeof current !== 'object' || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }
  
  return current;
}

/**
 * Merge two state objects (deep merge)
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
export function mergeState(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeState(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Clear all states (useful for reset/logout)
 */
export function clearAllStates() {
  Object.values(STATE_KEYS).forEach(key => {
    delete __memory[key];
    delete __loaded[key];
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  });
}

/**
 * Clear specific state
 * @param {string} stateKey - Key from STATE_KEYS
 */
export function clearState(stateKey) {
  delete __memory[stateKey];
  delete __loaded[stateKey];
  try {
    localStorage.removeItem(stateKey);
  } catch (_) {}
}

// Convenience functions for each state
function notifyProfileSaved() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('obrium:profile-saved'));
  } catch (_) {}
}

export const profileState = {
  get: () => getState(STATE_KEYS.PROFILE),
  save: (state) => {
    const ok = saveState(STATE_KEYS.PROFILE, state);
    try {
      const sm = typeof window !== 'undefined' && window.__storageManager;
      if (ok && sm && typeof sm.syncFromProfile === 'function') sm.syncFromProfile(state);
    } catch (_) {}
    if (ok) notifyProfileSaved();
    return ok;
  },
  update: (path, value) => {
    const ok = updateState(STATE_KEYS.PROFILE, path, value);
    if (ok) notifyProfileSaved();
    return ok;
  },
  getField: (path, defaultValue) => getStateField(STATE_KEYS.PROFILE, path, defaultValue),
  clear: () => clearState(STATE_KEYS.PROFILE)
};

export const dayState = {
  get: () => getState(STATE_KEYS.DAY),
  save: (state) => saveState(STATE_KEYS.DAY, state),
  update: (path, value) => updateState(STATE_KEYS.DAY, path, value),
  getField: (path, defaultValue) => getStateField(STATE_KEYS.DAY, path, defaultValue),
  clear: () => clearState(STATE_KEYS.DAY),
  
  // Get today's date in YYYY-MM-DD format
  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  },
  
  // Load day state for today (with defaults if not exists)
  loadDayStateForToday() {
    const today = this.getTodayDate();
    const state = this.get();
    
    // If state date doesn't match today, reset to today with defaults
    if (state.date !== today) {
      const defaultState = {
        date: today,
        sleep: {
          hours: null,
          target: 7.5,
          quality: null,
          sleepEndMinutes: null
        },
        water: {
          current: 0,
          target: 8
        },
        energy: null,
        moodToday: null,
        stressLevel: 3,
        activityToday: null,
        weather: {
          temperature: null,
          condition: null,
          feelsLike: null
        },
        pressure: null,
        advice: null,
        dailyFocus: null
      };
      
      // Return default state for today (don't merge with old state)
      return defaultState;
    }
    
    return state;
  },
  
  // Save day state for today
  saveDayStateForToday(dayStateData) {
    const today = this.getTodayDate();
    const stateToSave = {
      ...dayStateData,
      date: today
    };
    this.save(stateToSave);
  }
};

export const feedState = {
  get: () => getState(STATE_KEYS.FEED),
  save: (state) => saveState(STATE_KEYS.FEED, state),
  update: (path, value) => updateState(STATE_KEYS.FEED, path, value),
  getField: (path, defaultValue) => getStateField(STATE_KEYS.FEED, path, defaultValue),
  clear: () => clearState(STATE_KEYS.FEED)
};

export const talkState = {
  get: () => getState(STATE_KEYS.TALK),
  save: (state) => saveState(STATE_KEYS.TALK, state),
  update: (path, value) => updateState(STATE_KEYS.TALK, path, value),
  getField: (path, defaultValue) => getStateField(STATE_KEYS.TALK, path, defaultValue),
  clear: () => clearState(STATE_KEYS.TALK)
};

/** System Integrity score (0–100). It is cumulative and never decreases. */
export const systemIntegrityState = {
  get() {
    const s = getState(STATE_KEYS.INTEGRITY);
    return Number(s?.systemIntegrityScore ?? s?.score) || 0;
  },
  save(state) {
    const current = this.get();
    const requested = Number(state?.systemIntegrityScore ?? state?.score) || 0;
    const next = Math.min(SYSTEM_INTEGRITY_MAX, Math.max(current, requested));
    return saveState(STATE_KEYS.INTEGRITY, {
      ...state,
      systemIntegrityScore: next,
      score: next,
    });
  },
  /** Add learned-context points; negative values cannot reduce System Integrity. */
  increaseSystemIntegrity(value) {
    const score = this.get();
    const increment = Math.max(0, Number(value) || 0);
    const next = Math.min(SYSTEM_INTEGRITY_MAX, score + increment);
    this.save({ systemIntegrityScore: next });
    if (typeof window.updateSystemIntegrityDisplay === 'function') {
      window.updateSystemIntegrityDisplay();
    }
    return next;
  },
  /** @deprecated Use increaseSystemIntegrity(). */
  increaseIntegrity(value) {
    return this.increaseSystemIntegrity(value);
  },
};

/** @deprecated Use systemIntegrityState. */
export const integrityState = systemIntegrityState;

// Deprecated constant alias retained during migration.
const INTEGRITY_MAX = SYSTEM_INTEGRITY_MAX;
export { STATE_KEYS, SYSTEM_INTEGRITY_MAX, INTEGRITY_MAX };

