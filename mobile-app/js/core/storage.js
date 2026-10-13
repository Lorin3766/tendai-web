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
  Mind: {},
  Sleep: {},
  Goals: {},
  Signals: { eventLog: [] }
};

/**
 * Every profile-schema field (profile-schema.js catalog) → its Master Record key.
 * [recordPath, profileSection, profileField]
 */
const PROFILE_FIELD_TO_RECORD = [
  ['Registry.sexAtBirth', 'body', 'sexAtBirth'],
  ['Registry.genderIdentity', 'body', 'genderIdentity'],
  ['Vitals.bodyBuild', 'body', 'bodyBuild'],
  ['Vitals.bloodType', 'body', 'bloodType'],
  ['Lifestyle.physicalActivity', 'body', 'physicalActivity'],
  ['Lifestyle.regularDiscomfort', 'body', 'regularDiscomfort'],
  ['Clinical.healthConditions', 'health', 'healthConditions'],
  ['Clinical.prescriptionMedications', 'health', 'prescriptionMedications'],
  ['Clinical.supplements', 'health', 'supplements'],
  ['Clinical.lastCheckup', 'health', 'lastCheckup'],
  ['Lifestyle.smoking', 'health', 'smoking'],
  ['Lifestyle.alcohol', 'health', 'alcohol'],
  ['Mind.stressLevel', 'mind', 'stressLevel'],
  ['Mind.mentalEnergy', 'mind', 'mentalEnergy'],
  ['Mind.anxietyFrequency', 'mind', 'anxietyFrequency'],
  ['Mind.moodChanges', 'mind', 'moodChanges'],
  ['Mind.wantToImproveFocus', 'mind', 'wantToImproveFocus'],
  ['Lifestyle.eatingPattern', 'lifestyle', 'eatingPattern'],
  ['Lifestyle.dietType', 'lifestyle', 'dietType'],
  ['Lifestyle.enoughProtein', 'lifestyle', 'enoughProtein'],
  ['Lifestyle.sugarSweets', 'lifestyle', 'sugarSweets'],
  ['Lifestyle.lateEating', 'lifestyle', 'lateEating'],
  ['Lifestyle.hydration', 'lifestyle', 'hydration'],
  ['Sleep.duration', 'lifestyle', 'sleepDuration'],
  ['Sleep.quality', 'lifestyle', 'sleepQuality'],
  ['Goals.primaryGoals', 'goals', 'primaryGoals'],
  ['Goals.motivationLevel', 'goals', 'motivationLevel'],
  ['Goals.wantFromObrium', 'goals', 'wantFromTendAI'],
  ['Goals.constraints', 'health', 'goalsConstraints'],
  ['Goals.notes', 'health', 'goalsNotes'],
];

/** Sections whose modal has a "Primary goal" + "Priority level" Goals tab. */
const SECTION_GOAL_KEYS = ['body', 'health', 'mind', 'lifestyle'];

/** Option values of the Lifestyle diet-type field (now stored at Lifestyle.dietType, not dietRules). */
const DIET_TYPE_OPTIONS = ['balanced', 'low-carb', 'high-protein', 'vegetarian', 'vegan', 'not-sure'];

const PROFILE_SYNC_VERSION = 2;

/** Schema defaults that are placeholders, not user answers (mirrors profile-schema isProfileFieldAnswered). */
function isProvidedProfileValue(value, key) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    return !(t === '' || t === 'select...' || t === 'not set' || t === '—' || t === '-');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    if ((key === 'stressLevel' || key === 'stress') && value === 3) return false;
    if (key === 'goalsPriority' && value === 2) return false;
    return true;
  }
  if (typeof value === 'boolean') return value === true;
  if (Array.isArray(value)) return value.some((v) => isProvidedProfileValue(v));
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function isEmptyRecordValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.filter((v) => !isEmptyRecordValue(v)).length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function splitList(text) {
  return String(text || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

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

/** Reset a schema field to its empty default, or delete a non-schema key entirely. */
function clearValueAtPath(obj, path) {
  const defaultValue = getValueAtPath(DEFAULT_SCHEMA, path);
  if (defaultValue !== undefined) {
    setValueAtPath(obj, path, JSON.parse(JSON.stringify(defaultValue)));
    return;
  }
  const keys = path.split('.');
  const parent = getValueAtPath(obj, keys.slice(0, -1).join('.'));
  if (parent && typeof parent === 'object') delete parent[keys[keys.length - 1]];
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
    this._deferSave = false;
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
            this._record.Lifestyle.dietType = lifestyle.dietType;
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
    if (this._deferSave) return true;
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

    // Cleared / deleted values are removed so they never reach the LLM payload.
    if (isEmptyRecordValue(value)) {
      clearValueAtPath(record, path);
      return this._save();
    }

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

  /**
   * Sync from profileState (call when profile is saved).
   * Every profile field is re-derived on each save: answered values are written,
   * cleared values are removed from the Master Record.
   */
  syncFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return;
    this._deferSave = true;
    try {
      this._syncFromProfileFields(profile);
    } finally {
      this._deferSave = false;
      this._save();
    }
  }

  /** Boot catch-up: profiles answered before the current sync version never reached the Master Record. */
  syncFromProfileIfStale(profile) {
    const record = this.getRecord();
    if (record.System?.profileSyncVersion === PROFILE_SYNC_VERSION) return;
    this.syncFromProfile(profile || {});
  }

  _syncFromProfileFields(profile) {
    const body = profile.body || {};
    const health = profile.health || {};
    const lifestyle = profile.lifestyle || {};
    const record = this.getRecord();
    record.System = record.System || {};
    const firstSyncOfThisVersion = record.System.profileSyncVersion !== PROFILE_SYNC_VERSION;

    const provided = (section, key) => {
      const value = (profile[section] || {})[key];
      return isProvidedProfileValue(value, key) ? value : null;
    };

    this.updateRecord('Registry.name', typeof body.name === 'string' ? body.name.trim() : null);

    // Prefer birthYear-derived age when available
    {
      const by = Number(body.birthYear);
      const yearNow = new Date().getFullYear();
      let age = null;
      if (Number.isFinite(by) && by >= 1900 && by <= yearNow) {
        const fromYear = yearNow - by;
        if (fromYear >= 1 && fromYear <= 120) age = fromYear;
      }
      if (age == null && body.age != null && body.age !== '') {
        const n = Number(body.age);
        if (Number.isFinite(n) && n >= 1 && n <= 120) age = Math.round(n);
      }
      this.updateRecord('Registry.age', age);
    }

    this.updateRecord('Registry.gender', provided('body', 'gender'));
    // Location is also written by the location service, so only overwrite when the profile has one.
    if (profile.location) this.updateRecord('Registry.location', profile.location);
    this.updateRecord('Vitals.currentWeight', provided('body', 'weight'));
    this.updateRecord('Vitals.height', provided('body', 'height'));

    for (const [recordPath, section, key] of PROFILE_FIELD_TO_RECORD) {
      this.updateRecord(recordPath, provided(section, key));
    }

    const sectionGoals = {};
    for (const section of SECTION_GOAL_KEYS) {
      const focus = provided(section, 'goalsFocus');
      if (!focus) continue;
      const priority = provided(section, 'goalsPriority');
      sectionGoals[section] = priority != null ? { focus, priority } : { focus };
    }
    this.updateRecord('Goals.sectionGoals', sectionGoals);

    // Lists shared with Talk signals: replace only the items that came from the profile.
    const allergiesFromProfile = health.hasAllergies === false ? [] : splitList(health.allergiesDetails);
    const medicationsFromProfile = splitList(health.medications);
    this._syncProfileOwnedItems('Clinical.allergies', allergiesFromProfile);
    this._syncProfileOwnedItems('Clinical.medications', medicationsFromProfile);

    if (firstSyncOfThisVersion) {
      // Diet type used to be copied into dietRules; it now lives at Lifestyle.dietType.
      const dietRules = this.get('Lifestyle.dietRules');
      if (Array.isArray(dietRules)) {
        this.updateRecord('Lifestyle.dietRules', dietRules.filter((r) => !DIET_TYPE_OPTIONS.includes(String(r))));
      }
      record.System.profileSyncVersion = PROFILE_SYNC_VERSION;
      this._save();
    }

    if (lifestyle.activeDays != null && lifestyle.activeDays !== '') {
      this.updateRecord('Lifestyle.activityLevel', String(lifestyle.activeDays));
    }
  }

  /**
   * Update a list that both the profile and Talk signals write to.
   * Items previously synced from the profile but no longer present are removed;
   * items logged from Talk are kept.
   */
  _syncProfileOwnedItems(path, nextItems) {
    const record = this.getRecord();
    record.System.profileOwned = record.System.profileOwned || {};
    const owned = record.System.profileOwned;
    const prevItems = Array.isArray(owned[path]) ? owned[path] : nextItems;
    const current = Array.isArray(this.get(path)) ? this.get(path) : [];
    const kept = current.filter((item) => !prevItems.includes(item));
    owned[path] = [...nextItems];
    this.updateRecord(path, [...kept, ...nextItems]);
  }
}

export const storageManager = new StorageManager();

// Data control — privacy compliance (call from Settings UI)
if (typeof window !== 'undefined') {
  window.exportObriumData = () => storageManager.exportData();
  window.wipeObriumAllData = () => storageManager.wipeAllData();
}
