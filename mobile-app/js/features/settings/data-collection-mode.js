// Obrium — Talk-first / Manual tracking is the default data collection mode.
// @owner: settings
// Wearables are optional (Settings only); never urged from Talk or Feed.

import { profileState } from '../../state.js';

export const DATA_COLLECTION_MANUAL = 'manual_talk';
export const DATA_COLLECTION_WEARABLE = 'wearable_hybrid';

/** Shared system instruction for every focus agent + Talk CEO prompt. */
export const TALK_FIRST_MANUAL_INSTRUCTION =
  'The user operates in Talk-first / Manual tracking mode without wearable sensors. Baseline metrics and evaluations must be derived strictly from conversation, text inputs, and daily check-ins. If sensor data is offline, never request, urge, or remind the user to connect external devices. Acknowledge qualitative and subjective self-reports as valid calibration signals.';

export const WEARABLE_HYBRID_INSTRUCTION =
  'The user may have optional wearable / health-stack data. Use sensor readings when present. Never request, urge, or remind the user to connect or re-connect devices. Self-reports and Talk check-ins remain valid calibration signals.';

/** Phrases that must not be sent to the model as operational context. */
const SENSOR_NAG_RE =
  /sensor\s*link|awaiting[_\s-]*sensor|compatible\s+sensor|link\s+a\s+(device|sensor|wearable)|connect\s+(your|a)\s+(device|wearable|sensor|health)|sensor\s*offline|no\s+data\s+yet[^\n.]{0,80}connect|AWAITING_SENSOR|NO_DATA_SOURCE|LINK\s*SENSOR|awaiting\s+stabilized\s+biosignals|connect\s+a\s+wearable/i;

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function isSensorNagText(text) {
  return SENSOR_NAG_RE.test(String(text || ''));
}

/**
 * @returns {'manual_talk'|'wearable_hybrid'}
 */
export function getDataCollectionMode() {
  try {
    const p = profileState.get();
    const mode = p && p.dataCollectionMode;
    if (mode === DATA_COLLECTION_WEARABLE) return DATA_COLLECTION_WEARABLE;
    return DATA_COLLECTION_MANUAL;
  } catch (_) {
    return DATA_COLLECTION_MANUAL;
  }
}

export function isManualTalkMode() {
  return getDataCollectionMode() === DATA_COLLECTION_MANUAL;
}

/**
 * Idempotent migration: ensure dataCollectionMode + sensors exist without wiping other fields.
 * Safe to run every launch.
 * @returns {boolean} true if profile was updated
 */
export function ensureDataCollectionMode() {
  try {
    const profile = profileState.get() || {};
    let changed = false;
    if (profile.dataCollectionMode !== DATA_COLLECTION_MANUAL && profile.dataCollectionMode !== DATA_COLLECTION_WEARABLE) {
      profile.dataCollectionMode = DATA_COLLECTION_MANUAL;
      changed = true;
    }
    const sensors =
      profile.sensors && typeof profile.sensors === 'object' && !Array.isArray(profile.sensors)
        ? { ...profile.sensors }
        : {};
    if (typeof sensors.wearablesConnected !== 'boolean') {
      sensors.wearablesConnected = false;
      changed = true;
    }
    if (typeof sensors.allowWearablesPrompt !== 'boolean') {
      sensors.allowWearablesPrompt = false;
      changed = true;
    }
    if (changed) {
      profile.sensors = sensors;
      profileState.save(profile);
    }
    return changed;
  } catch (_) {
    return false;
  }
}

/**
 * Switch to wearable_hybrid only after the user connects health sources (Settings / HealthSync).
 * Never call from Talk or automatic prompts.
 */
export function markWearablesConnected() {
  try {
    const profile = profileState.get() || {};
    profile.dataCollectionMode = DATA_COLLECTION_WEARABLE;
    profile.sensors = {
      ...(profile.sensors && typeof profile.sensors === 'object' ? profile.sensors : {}),
      wearablesConnected: true,
      allowWearablesPrompt: false,
    };
    profileState.save(profile);
  } catch (_) {}
}

/**
 * Mode-aware instruction snippet for prompts / agent missions.
 * @returns {string}
 */
export function focusAgentModeInstruction() {
  return getDataCollectionMode() === DATA_COLLECTION_WEARABLE
    ? WEARABLE_HYBRID_INSTRUCTION
    : TALK_FIRST_MANUAL_INSTRUCTION;
}

/**
 * Feed badge: neutral Manual Baseline unless wearables are live.
 * @param {boolean} signalActive
 * @returns {string}
 */
export function dataCollectionModePillLabel(signalActive) {
  if (getDataCollectionMode() === DATA_COLLECTION_WEARABLE && signalActive) {
    return 'Wearable linked';
  }
  return 'Manual Baseline';
}

/**
 * Drop sensor-nag strings from text sent to the model (does not delete stored user data).
 * @param {unknown} text
 * @returns {string}
 */
export function scrubSensorNagFromContext(text) {
  const s = String(text || '');
  if (!s) return '';
  if (!isSensorNagText(s)) return s;
  return '';
}
