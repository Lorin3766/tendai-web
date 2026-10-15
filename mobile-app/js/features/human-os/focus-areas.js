// Serron — Focus Areas (user-facing name for agent life sectors)
// @owner: human-os
// @role: state
//
// TECH DEBT: the internal data model still uses `agent` / `sector` identifiers
// (user-agents.js, ultimate-agent-creator-modal.js, common-ledger, feed cards).
// "Focus Area" is currently a user-facing label only. A full rename of the
// persisted model would break existing localStorage records and signatures,
// so it is deferred. New code should read/write focus areas through this module.

const FOCUS_AREAS_KEY = 'tendai_focus_areas_v1';

export const FOCUS_AREAS_MIN = 1;
export const FOCUS_AREAS_MAX = 3;

/**
 * Starter Focus Area catalog (exactly 9).
 * `init` maps each area onto the existing internal agent domains/types.
 */
export const STARTER_FOCUS_AREAS = [
  {
    id: 'sleep',
    name: 'Sleep & Recovery',
    desc: 'Sleep duration, quality, and daily readiness.',
    iconKey: 'sleep',
    init: { domainId: 'health', typeId: 'sleep', goalLabel: 'Improve sleep quality and consistency' },
  },
  {
    id: 'move',
    name: 'Movement & Load',
    desc: 'Steps, training load, and physical exertion.',
    iconKey: 'move',
    init: { domainId: 'routine', typeId: 'planner', goalLabel: 'Balance movement and training load' },
  },
  {
    id: 'nutrition',
    name: 'Nutrition & Metabolism',
    desc: 'Meals, hydration, and metabolic patterns.',
    iconKey: 'nutrition',
    init: { domainId: 'routine', typeId: 'habits', goalLabel: 'Support nutrition and metabolic health' },
  },
  {
    id: 'labs',
    name: 'Labs & Biomarkers',
    desc: 'Blood work and biomarker trends over time.',
    iconKey: 'blood',
    init: { domainId: 'health', typeId: 'vitals', goalLabel: 'Track labs and biomarker trends' },
  },
  {
    id: 'stress',
    name: 'Stress & Nervous System',
    desc: 'Stress load, HRV, and nervous system recovery.',
    iconKey: 'brain',
    init: { domainId: 'health', typeId: 'recovery', goalLabel: 'Manage stress and nervous system load' },
  },
  {
    id: 'longevity',
    name: 'Longevity Protocols',
    desc: 'Long-horizon habits and healthspan protocols.',
    iconKey: 'lung',
    init: { domainId: 'routine', typeId: 'planner', goalLabel: 'Maintain longevity protocols' },
  },
  {
    id: 'skin',
    name: 'Skin & Environment',
    desc: 'Skin condition and environmental exposure.',
    iconKey: 'eyes',
    init: { domainId: 'health', typeId: 'vitals', goalLabel: 'Watch skin health and environment' },
  },
  {
    id: 'cardio',
    name: 'Cardiovascular Health',
    desc: 'Heart rate, HRV, and cardiovascular fitness.',
    iconKey: 'heart',
    init: { domainId: 'health', typeId: 'cardio', goalLabel: 'Support cardiovascular health' },
  },
  {
    id: 'mental',
    name: 'Mental Health & Psychology',
    desc: 'Mood, cognitive load, and psychological wellbeing.',
    iconKey: 'brain',
    init: { domainId: 'routine', typeId: 'focus', goalLabel: 'Support mental health and clarity' },
  },
];

/**
 * Focus Area ids chosen at first setup. Empty array = never chosen.
 * @returns {string[]}
 */
export function getSelectedFocusAreaIds() {
  try {
    const raw = localStorage.getItem(FOCUS_AREAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(STARTER_FOCUS_AREAS.map((a) => a.id));
    return parsed.map(String).filter((id) => valid.has(id));
  } catch (_) {
    return [];
  }
}

/**
 * @param {string[]} ids
 */
export function saveSelectedFocusAreaIds(ids) {
  try {
    const valid = new Set(STARTER_FOCUS_AREAS.map((a) => a.id));
    const clean = [...new Set((ids || []).map(String))].filter((id) => valid.has(id));
    localStorage.setItem(FOCUS_AREAS_KEY, JSON.stringify(clean));
    return clean;
  } catch (_) {
    return [];
  }
}

/**
 * @param {string} id
 * @returns {(typeof STARTER_FOCUS_AREAS)[number]|null}
 */
export function getFocusAreaById(id) {
  const want = String(id || '').trim().toLowerCase();
  if (!want) return null;
  return STARTER_FOCUS_AREAS.find((a) => a.id === want) || null;
}

/**
 * @param {string} name
 * @returns {(typeof STARTER_FOCUS_AREAS)[number]|null}
 */
export function getFocusAreaByName(name) {
  const want = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/, '');
  if (!want) return null;
  return (
    STARTER_FOCUS_AREAS.find((a) => a.name.toLowerCase() === want) ||
    STARTER_FOCUS_AREAS.find((a) => want.startsWith(a.name.toLowerCase())) ||
    null
  );
}

/**
 * Map Focus Area id → Feed track id used by existing card chrome.
 * Some starter ids (cardio, stress, …) are newer than TRACK_SPECS keys.
 * @type {Record<string, string>}
 */
export const FOCUS_AREA_TRACK_IDS = {
  sleep: 'sleep',
  move: 'move',
  nutrition: 'nutrition',
  labs: 'labs',
  stress: 'brain',
  longevity: 'energy',
  skin: 'eyes',
  cardio: 'heart',
  mental: 'brain',
};

/**
 * @param {string} focusAreaId
 * @returns {string|null}
 */
export function resolveFocusAreaTrackId(focusAreaId) {
  const id = String(focusAreaId || '').trim().toLowerCase();
  if (!id) return null;
  return FOCUS_AREA_TRACK_IDS[id] || null;
}

/**
 * Behavior modes shown during Focus Area creation.
 * Internal `id` / short `name` stay stable for signatures; `userLabel` is UI-only.
 */
export const FOCUS_AREA_BEHAVIOR_MODES = [
  {
    id: 'watchdog',
    name: 'Monitor',
    userLabel: "Just watch, tell me only if something's off",
  },
  {
    id: 'analyst',
    name: 'Analyzer',
    userLabel: 'Look for connections with other topics',
  },
  {
    id: 'advisor',
    name: 'Assistant',
    userLabel: 'You can suggest and remind me proactively',
  },
  {
    id: 'archivist',
    name: 'Data Logger',
    userLabel: "I'll log data myself, just save it",
  },
];

/**
 * @param {string} modeIdOrName
 * @returns {string}
 */
export function getBehaviorModeUserLabel(modeIdOrName) {
  const raw = String(modeIdOrName || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const hit = FOCUS_AREA_BEHAVIOR_MODES.find(
    (m) => m.id === lower || m.name.toLowerCase() === lower
  );
  return hit ? hit.userLabel : raw;
}

/**
 * Focus Area maturity stages (0–3).
 * Content selection by stage is Task 4 — these labels are for UI indicators only.
 */
export const MATURITY_STAGE_LABELS = {
  0: 'Baseline',
  1: 'Passive data',
  2: 'Trends',
  3: 'Biomarkers',
};

/**
 * @param {unknown} stage
 * @returns {{ stage: 0|1|2|3, label: string }}
 */
export function resolveMaturityStage(stage) {
  const n = Number(stage);
  const s = /** @type {0|1|2|3} */ (
    Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0
  );
  return { stage: s, label: MATURITY_STAGE_LABELS[s] };
}
