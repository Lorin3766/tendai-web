// Serron — Structured Master Record (Human OS Storage)
// @owner: core
// @role: state
// Central StorageManager for versioned, validated health data. Local-first.

const MASTER_RECORD_KEY = 'TendAI_MasterRecord';
const LEGACY_KEYS = {
  PROFILE: 'tendai-profile-state',
  DAY: 'tendai-day-state',
  FEED: 'tendai-feed-state',
  TALK: 'tendai-talk-state',
  CHAT: 'tendai_chat_history',
  MESSAGE_QUEUE: 'tendai-message-queue'
};

/** Default Master Record schema */
const DEFAULT_SCHEMA = {
  System: {
    systemIntegrityScore: 0,
    integrityScore: 0, // Deprecated alias.
  },
  Registry: { name: null, age: null, gender: null, location: null, bio: null },
  Clinical: { diagnoses: [], allergies: [], surgeries: [], medications: [] },
  Lifestyle: { dietRules: [], habits: [], restrictions: [], activityLevel: null },
  Vitals: { currentWeight: null, height: null, lastBloodWork: {} },
  Signals: { eventLog: [] }
};

/** Learned context used to grow the profile-level System Integrity score. */
const SYSTEM_INTEGRITY_FIELDS = [
  'Registry.name', 'Registry.age', 'Registry.gender', 'Registry.location',
  'Clinical.allergies', 'Clinical.medications', 'Clinical.diagnoses',
  'Lifestyle.dietRules', 'Lifestyle.habits', 'Lifestyle.activityLevel',
  'Vitals.currentWeight', 'Vitals.height'
];

/** Signal type → Master Record folder mapping */
const SIGNAL_TO_FOLDER = {
  NUTRITION: 'Lifestyle.dietRules',
  DIET: 'Lifestyle.dietRules',
  HABIT: 'Lifestyle.habits',
  RESTRICTION: 'Lifestyle.restrictions',
  ACTIVITY: 'Lifestyle.activityLevel',
  ALLERGY: 'Clinical.allergies',
  MEDICATION: 'Clinical.medications',
  DIAGNOSIS: 'Clinical.diagnoses',
  SURGERY: 'Clinical.surgeries',
  VITAL: 'Signals.eventLog', // Vitals.lastBloodWork is object; use eventLog for timestamped entries
  DEFAULT: 'Signals.eventLog'
};

function getValueAtPath(obj, path) {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function setValueAtPath(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function isValidDate(val) {
  if (val == null) return true;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

function isValidNumber(val, min = 0, max = 500) {
  if (val == null) return true;
  const n = Number(val);
  return !isNaN(n) && n >= min && n <= max;
}

function dedupeArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return [...new Set(arr.map(String).filter(Boolean))];
}

export class StorageManager {
  constructor() {
    this._record = null;
    this._loaded = false;
  }

  /** Load Master Record from localStorage */
  load() {
    if (this._loaded) return this._record;
    try {
      const stored = localStorage.getItem(MASTER_RECORD_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this._record = this._mergeWithSchema(parsed);
      } else {
        this._record = JSON.parse(JSON.stringify(DEFAULT_SCHEMA));
        this._migrateFromLegacy();
      }
    } catch (_) {
      this._record = JSON.parse(JSON.stringify(DEFAULT_SCHEMA));
    }
    this._loaded = true;
    return this._record;
  }

  _mergeWithSchema(parsed) {
    const result = JSON.parse(JSON.stringify(DEFAULT_SCHEMA));
    for (const folder of Object.keys(DEFAULT_SCHEMA)) {
      if (parsed[folder] && typeof parsed[folder] === 'object') {
        if (Array.isArray(DEFAULT_SCHEMA[folder])) {
          result[folder] = Array.isArray(parsed[folder]) ? parsed[folder] : result[folder];
        } else {
          result[folder] = { ...result[folder], ...parsed[folder] };
        }
      }
    }
    return result;
  }

  /** Migrate existing localStorage data into Master Record */
  _migrateFromLegacy() {
    try {
      const profileRaw = localStorage.getItem(LEGACY_KEYS.PROFILE);
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        if (profile && typeof profile === 'object') {
          const body = profile.body || {};
          const health = profile.health || {};
          const lifestyle = profile.lifestyle || {};

          if (body.age != null) this._record.Registry.age = body.age;
          if (body.gender) this._record.Registry.gender = body.gender;
          if (profile.location) this._record.Registry.location = profile.location;
          if (body.weight != null) this._record.Vitals.currentWeight = body.weight;
          if (body.height != null) this._record.Vitals.height = body.height;

          if (health.allergiesDetails) {
            this._record.Clinical.allergies = health.allergiesDetails.split(/[,;]/).map(s => s.trim()).filter(Boolean);
          }
          if (health.medications) {
            this._record.Clinical.medications = [health.medications];
          }
          if (health.chronicDiseases && Array.isArray(health.chronicDiseases)) {
            this._record.Clinical.diagnoses = [...health.chronicDiseases];
          }
          if (lifestyle.dietType) {
            this._record.Lifestyle.dietRules = [lifestyle.dietType];
          }
          if (lifestyle.activeDays != null) {
            this._record.Lifestyle.activityLevel = String(lifestyle.activeDays);
          }
        }
      }
      this._save();
    } catch (_) {}
  }

  _save() {
    try {
      localStorage.setItem(MASTER_RECORD_KEY, JSON.stringify(this._record));
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Get full Master Record */
  getRecord() {
    if (!this._loaded) this.load();
    return this._record;
  }

  /** Get value at dot path (e.g. "Clinical.allergies") */
  get(path) {
    const record = this.getRecord();
    return getValueAtPath(record, path);
  }

  /**
   * Update record at path with validation.
   * @param {string} path - e.g. "Clinical.allergies", "Vitals.currentWeight"
   * @param {*} value - Value to set
   * @returns {boolean} Success
   */
  updateRecord(path, value) {
    const record = this.getRecord();
    const keys = path.split('.');
    const lastKey = keys[keys.length - 1];

    if (path.startsWith('Vitals.currentWeight') || path === 'Vitals.currentWeight') {
      if (!isValidNumber(value, 0, 1000)) return false;
    }
    if (path.startsWith('Vitals.height') || path === 'Vitals.height') {
      if (!isValidNumber(value, 0, 300)) return false;
    }
    if (path.includes('lastBloodWork') && typeof value === 'object') {
      for (const v of Object.values(value || {})) {
        if (typeof v === 'string' && !isValidDate(v)) return false;
      }
    }
    if (Array.isArray(value)) {
      value = dedupeArray(value);
    }

    setValueAtPath(record, path, value);
    return this._save();
  }

  /** Append to array at path (e.g. "Signals.eventLog") with dedupe */
  appendToArray(path, item) {
    const record = this.getRecord();
    const arr = getValueAtPath(record, path);
    if (!Array.isArray(arr)) return false;
    const next = dedupeArray([...arr, item]);
    setValueAtPath(record, path, next);
    return this._save();
  }

  /**
   * Route a signal to the correct folder.
   * @param {string} signalType - e.g. "NUTRITION", "ALLERGY"
   * @param {string} content - Text to store
   */
  routeSignal(signalType, content) {
    const upper = String(signalType || '').toUpperCase().trim();
    const folderPath = SIGNAL_TO_FOLDER[upper] || SIGNAL_TO_FOLDER.DEFAULT;
    const record = this.getRecord();

    if (folderPath === 'Signals.eventLog') {
      this.appendToArray('Signals.eventLog', {
        type: upper || 'UNKNOWN',
        content: String(content || '').trim(),
        timestamp: new Date().toISOString()
      });
      return;
    }

    const target = getValueAtPath(record, folderPath);
    if (Array.isArray(target)) {
      const item = String(content || '').trim();
      if (item) this.appendToArray(folderPath, item);
    } else if (target === null || typeof target === 'string') {
      this.updateRecord(folderPath, String(content || '').trim());
    }
  }

  /**
   * Calculate cumulative System Integrity (0–100).
   * Removing or correcting data cannot lower the highest learned-context score.
   */
  calculateSystemIntegrityScore() {
    const record = this.getRecord();
    let filled = 0;
    for (const path of SYSTEM_INTEGRITY_FIELDS) {
      const val = getValueAtPath(record, path);
      if (val != null && val !== '') {
        if (Array.isArray(val) && val.length > 0) filled++;
        else if (typeof val === 'object' && Object.keys(val).length > 0) filled++;
        else if (typeof val !== 'object') filled++;
      }
    }
    const total = SYSTEM_INTEGRITY_FIELDS.length;
    const learnedScore = total > 0 ? Math.round((filled / total) * 100) : 0;
    const previous = Number(
      record.System?.systemIntegrityScore ?? record.System?.integrityScore
    ) || 0;
    const score = Math.min(100, Math.max(previous, learnedScore));

    record.System = record.System || {};
    if (
      record.System.systemIntegrityScore !== score ||
      record.System.integrityScore !== score
    ) {
      record.System.systemIntegrityScore = score;
      record.System.integrityScore = score;
      this._save();
    }
    return score;
  }

  /** @deprecated Use calculateSystemIntegrityScore(). */
  calculateIntegrityScore() {
    return this.calculateSystemIntegrityScore();
  }

  /** Export all data for privacy compliance */
  exportData() {
    const record = this.getRecord();
    const legacy = {};
    for (const key of Object.values(LEGACY_KEYS)) {
      try {
        const val = localStorage.getItem(key);
        if (val) legacy[key] = JSON.parse(val);
      } catch (_) {}
    }
    return {
      masterRecord: record,
      legacy: legacy,
      exportedAt: new Date().toISOString()
    };
  }

  /** Wipe all TendAI data (privacy compliance) */
  wipeAllData() {
    try {
      localStorage.removeItem(MASTER_RECORD_KEY);
      for (const key of Object.values(LEGACY_KEYS)) {
        localStorage.removeItem(key);
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('tendai')) localStorage.removeItem(k);
      }
      this._record = JSON.parse(JSON.stringify(DEFAULT_SCHEMA));
      this._loaded = true;
      this._save();
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Sync from profileState (call when profile is saved) */
  syncFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return;
    const body = profile.body || {};
    const health = profile.health || {};
    const lifestyle = profile.lifestyle || {};
    this.load();
    if (body.name) this.updateRecord('Registry.name', body.name);
    // Prefer birthYear-derived age when available
    {
      const by = Number(body.birthYear);
      const yearNow = new Date().getFullYear();
      let age = null;
      if (Number.isFinite(by) && by >= 1900 && by <= yearNow) {
        const fromYear = yearNow - by;
        if (fromYear >= 1 && fromYear <= 120) age = fromYear;
      }
      if (age == null && body.age != null) {
        const n = Number(body.age);
        if (Number.isFinite(n) && n >= 1 && n <= 120) age = Math.round(n);
      }
      if (age != null) this.updateRecord('Registry.age', age);
    }
    if (body.gender) this.updateRecord('Registry.gender', body.gender);
    if (profile.location) this.updateRecord('Registry.location', profile.location);
    if (body.weight != null) this.updateRecord('Vitals.currentWeight', body.weight);
    if (body.height != null) this.updateRecord('Vitals.height', body.height);
    if (health.allergiesDetails) {
      const arr = health.allergiesDetails.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      if (arr.length) this.updateRecord('Clinical.allergies', arr);
    }
    if (health.medications) {
      this.updateRecord('Clinical.medications', [health.medications]);
    }
    if (lifestyle.dietType) {
      this.updateRecord('Lifestyle.dietRules', [lifestyle.dietType]);
    }
    if (lifestyle.activeDays != null) {
      this.updateRecord('Lifestyle.activityLevel', String(lifestyle.activeDays));
    }
  }
}

export const storageManager = new StorageManager();

// Data control — privacy compliance (call from Settings UI)
if (typeof window !== 'undefined') {
  window.exportTendAIData = () => storageManager.exportData();
  window.wipeTendAIAllData = () => storageManager.wipeAllData();
}
