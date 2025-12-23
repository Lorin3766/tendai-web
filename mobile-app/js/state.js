// TendAI Mobile — Centralized State Management
// @owner: storage
// @role: state

const STATE_KEYS = {
  PROFILE: 'tendai-profile-state',
  DAY: 'tendai-day-state',
  FEED: 'tendai-feed-state',
  TALK: 'tendai-talk-state'
};

// Initial state structures
const initialState = {
  profile: {
    location: null, // {type: 'geo'|'manual', coords?: {lat, lon}, city?: string, zip?: string}
    body: {
      age: null,
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
    }
  },
  day: {
    date: new Date().toISOString().split('T')[0],
    sleep: {
      hours: null,
      target: 7.5,
      quality: null
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

/**
 * Get state from localStorage or return initial state
 * @param {string} stateKey - Key from STATE_KEYS
 * @returns {Object} State object
 */
export function getState(stateKey) {
  try {
    const stored = localStorage.getItem(stateKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with initial state to ensure all fields exist
        // Map stateKey to initialState key
        const initialStateKey = stateKey === STATE_KEYS.PROFILE ? 'profile' :
                                stateKey === STATE_KEYS.DAY ? 'day' :
                                stateKey === STATE_KEYS.FEED ? 'feed' :
                                stateKey === STATE_KEYS.TALK ? 'talk' : null;
        let merged = parsed;
        if (initialStateKey && initialState[initialStateKey]) {
          merged = mergeState(initialState[initialStateKey], parsed);
        }
        // Diagnostic log for profile state
        if (stateKey === STATE_KEYS.PROFILE) {
          console.log('[STATE] loaded from localStorage', {
            key: stateKey,
            data: merged
          });
        }
        return merged;
      } catch (parseError) {
        // If JSON.parse fails, clear corrupted data and return initial state
        try {
          localStorage.removeItem(stateKey);
        } catch (clearError) {
          // Could not clear corrupted state
        }
      }
    }
  } catch (error) {
    // Error loading state
  }
  
  // Return deep copy of initial state safely
  try {
    // Map stateKey to initialState key
    const initialStateKey = stateKey === STATE_KEYS.PROFILE ? 'profile' :
                            stateKey === STATE_KEYS.DAY ? 'day' :
                            stateKey === STATE_KEYS.FEED ? 'feed' :
                            stateKey === STATE_KEYS.TALK ? 'talk' : null;
    if (initialStateKey && initialState[initialStateKey]) {
      return JSON.parse(JSON.stringify(initialState[initialStateKey]));
    }
  } catch (copyError) {
    // Error copying initial state
  }
  
  // Fallback: return empty object if everything fails
  return {};
}

/**
 * Save state to localStorage
 * @param {string} stateKey - Key from STATE_KEYS
 * @param {Object} state - State object to save
 */
export function saveState(stateKey, state) {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(stateKey, serialized);
    // Diagnostic log for profile state
    if (stateKey === STATE_KEYS.PROFILE) {
      console.log('[STATE] saved to localStorage', {
        key: stateKey,
        data: state
      });
    }
    return true;
  } catch (error) {
    console.error('[STATE] Error saving state', stateKey, error);
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
    localStorage.removeItem(key);
  });
}

/**
 * Clear specific state
 * @param {string} stateKey - Key from STATE_KEYS
 */
export function clearState(stateKey) {
  localStorage.removeItem(stateKey);
}

// Convenience functions for each state
export const profileState = {
  get: () => getState(STATE_KEYS.PROFILE),
  save: (state) => saveState(STATE_KEYS.PROFILE, state),
  update: (path, value) => updateState(STATE_KEYS.PROFILE, path, value),
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
          quality: null
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

// Export STATE_KEYS for reference
export { STATE_KEYS };

