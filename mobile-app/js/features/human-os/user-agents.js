// Serron — User-defined Agents (Services tab) + blueprint instances
// @owner: human-os
// @role: storage

import { writeAgentInsight, renameAgentInsightKey, removeAgentInsightsForAgent } from './common-ledger.js';
import { getFocusAreaById, getFocusAreaByName } from './focus-areas.js';

const STORAGE_KEY = 'tendai_user_agents';
const FABRICATED_PROFILE_SCRUB_KEY = 'tendai_focus_profile_scrub_v1';

/**
 * Earlier "+ Add Focus" builds wrote invented fallback facts into every agent instruction
 * (name "Anton", "83 kg", "1996 subaortic stenosis"). Replace them with real profile data or
 * "not provided". Runs once per device.
 */
function scrubFabricatedProfileFacts() {
  try {
    if (localStorage.getItem(FABRICATED_PROFILE_SCRUB_KEY) === '1') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.length) {
      let realName = '';
      try {
        const profile = JSON.parse(localStorage.getItem('tendai-profile-state') || '{}');
        if (typeof profile?.body?.name === 'string') realName = profile.body.name.trim();
      } catch (_) {}
      let changed = false;
      const next = list.map((row) => {
        if (!row || typeof row.instruction !== 'string') return row;
        const scrubbed = row.instruction
          .replace(
            'USER PROFILE (inject into every reasoning turn; do not contradict without explicit user override):',
            'USER PROFILE (only what the user has provided; anything marked "not provided" is unknown and must not be invented):'
          )
          .replace(/^- Name: Anton[ \t]*$/m, `- Name: ${realName || 'not provided'}`)
          .replace(/^- Weight: 83 kg \(baseline on file[^\n]*$/m, '- Weight: not provided (unknown — do not assume a value).')
          .replace(
            /^- Cardiac history \(on file for agent safety\): 1996 subaortic stenosis[^\n]*$/m,
            '- Medical / cardiac context: none provided (unknown — do not assume any condition).'
          );
        if (scrubbed === row.instruction) return row;
        changed = true;
        return { ...row, instruction: scrubbed };
      });
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    localStorage.setItem(FABRICATED_PROFILE_SCRUB_KEY, '1');
  } catch (_) {}
}

if (typeof localStorage !== 'undefined') scrubFabricatedProfileFacts();

/** @typedef {'Active'|'Paused'|'Incomplete'} AgentLifecycleStatus */

const LEGACY_MODE_SUFFIX_RE = /_(MONITOR|ANALYZER|ASSISTANT|DATA\s*LOGGER)\b/i;

/**
 * Strip legacy "FOCUS_ANALYZER" display names created before mode was a separate field.
 * @param {object} row
 */
function repairLegacyConcatenatedName(row) {
  if (!row || typeof row !== 'object') return row;
  const raw = String(row.name || '').trim();
  if (!LEGACY_MODE_SUFFIX_RE.test(raw)) return row;

  const modeMatch = raw.match(LEGACY_MODE_SUFFIX_RE);
  const modeToken = modeMatch ? modeMatch[1] : '';
  const cleaned = raw.replace(LEGACY_MODE_SUFFIX_RE, '').replace(/\s*\(\d+\)\s*$/, '').trim();
  const fa =
    getFocusAreaById(row.trackingLifeAreaId) ||
    getFocusAreaByName(cleaned) ||
    getFocusAreaByName(raw);

  const nextName = fa?.name || cleaned || raw;
  const next = { ...row, name: nextName };
  if (!next.behaviorModeId && modeToken) {
    const modeMap = {
      MONITOR: 'watchdog',
      ANALYZER: 'analyst',
      ASSISTANT: 'advisor',
      'DATA LOGGER': 'archivist',
      DATALOGGER: 'archivist',
    };
    const key = String(modeToken).toUpperCase().replace(/\s+/g, ' ');
    const compact = key.replace(/\s+/g, '');
    next.behaviorModeId = modeMap[key] || modeMap[compact] || '';
  }
  if (!next.trackingLifeAreaId && fa?.id) {
    next.trackingLifeAreaId = fa.id;
  }
  if (raw !== nextName) {
    try {
      renameAgentInsightKey(raw, nextName);
    } catch (_) {}
  }
  return next;
}

/**
 * Clamp Focus Area maturity stage to 0–3.
 * 0 = profile/science only · 1 = passive data · 2 = trends · 3 = biomarkers/labs
 * @param {unknown} value
 * @returns {0|1|2|3}
 */
export function clampMaturityStage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return /** @type {0|1|2|3} */ (Math.max(0, Math.min(3, Math.round(n))));
}

/**
 * @param {object} row
 */
function normalizeAgentRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').trim();
  const name = String(row.name || '').trim() || 'Agent';
  if (!id) return null;
  const instruction = String(row.instruction || '').trim();
  const active = row.active !== false;
  const blueprintId = row.blueprintId != null ? String(row.blueprintId).trim() : '';

  const sensor_data =
    row.sensor_data && typeof row.sensor_data === 'object' && !Array.isArray(row.sensor_data)
      ? { ...row.sensor_data }
      : {};
  const custom_triggers =
    row.custom_triggers && typeof row.custom_triggers === 'object' && !Array.isArray(row.custom_triggers)
      ? { ...row.custom_triggers }
      : {};
  const trackingLifeAreaId = String(row.trackingLifeAreaId || '').trim().toLowerCase();
  const trackingGoalLabel = String(row.trackingGoalLabel || '').trim();
  const behaviorModeId = String(row.behaviorModeId || '').trim().toLowerCase();
  const agentConfigSignature = normalizeAgentConfigSignature(row.agentConfigSignature);
  // Focus Area maturity (0–3). Missing/legacy rows default to stage 0.
  const maturity_stage = clampMaturityStage(
    row.maturity_stage ?? row.maturityStage ?? 0
  );

  /** @type {AgentLifecycleStatus} */
  let agentStatus = 'Active';
  if (blueprintId) {
    if (row.agentStatus === 'Paused' || row.agentStatus === 'Incomplete' || row.agentStatus === 'Active') {
      agentStatus = row.agentStatus;
    } else {
      agentStatus = 'Incomplete';
    }
  } else if (row.agentStatus === 'Paused' || row.agentStatus === 'Incomplete') {
    agentStatus = row.agentStatus;
  } else if (!active) {
    agentStatus = 'Paused';
  }

  const base = {
    id,
    name,
    instruction,
    active: blueprintId ? agentStatus !== 'Paused' : active,
    createdAt: row.createdAt || new Date().toISOString(),
    maturity_stage,
  };
  if (trackingLifeAreaId) base.trackingLifeAreaId = trackingLifeAreaId;
  if (trackingGoalLabel) base.trackingGoalLabel = trackingGoalLabel;
  if (behaviorModeId) base.behaviorModeId = behaviorModeId;
  if (agentConfigSignature) base.agentConfigSignature = agentConfigSignature;
  if (blueprintId) {
    base.blueprintId = blueprintId;
    base.agentStatus = agentStatus;
    base.sensor_data = sensor_data;
    base.custom_triggers = custom_triggers;
  } else if (sensor_data && typeof sensor_data === 'object' && !Array.isArray(sensor_data) && Object.keys(sensor_data).length) {
    base.sensor_data = { ...sensor_data };
  }
  return base;
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeAgentConfigSignature(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9:_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * @param {{ sectorId?: string, functionId?: string }} params
 * @returns {string}
 */
export function buildAgentConfigSignature({ sectorId, functionId }) {
  const s = normalizeAgentConfigSignature(sectorId);
  const f = normalizeAgentConfigSignature(functionId);
  if (!s || !f) return '';
  return `${s}_${f}`;
}

/**
 * @returns {Array<{ id: string, name: string, instruction: string, active?: boolean, createdAt?: string, blueprintId?: string, agentStatus?: AgentLifecycleStatus, sensor_data?: object, custom_triggers?: object }>}
 */
export function getUserAgents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    let mutated = false;
    const list = a
      .map((row) => {
        const repaired = repairLegacyConcatenatedName(row);
        if (repaired && repaired !== row && repaired.name !== row.name) mutated = true;
        if (repaired && !row.behaviorModeId && repaired.behaviorModeId) mutated = true;
        if (row && row.maturity_stage == null && row.maturityStage == null) mutated = true;
        return normalizeAgentRow(repaired);
      })
      .filter(Boolean);
    if (mutated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (_) {}
    }
    return list;
  } catch (_) {
    return [];
  }
}

/** @param {Array<*>} agents */
export function setUserAgents(agents) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(agents) ? agents : []));
}

/**
 * @param {{ name: string, instruction: string, trackingLifeAreaId?: string, trackingGoalLabel?: string, behaviorModeId?: string, maturity_stage?: number, sensor_data?: object, agentConfigSignature?: string }} params
 * @returns {{ id: string, name: string, instruction: string, active: boolean, createdAt: string, maturity_stage: 0|1|2|3 }}
 */
export function addUserAgent({ name, instruction, trackingLifeAreaId, trackingGoalLabel, behaviorModeId, maturity_stage, sensor_data, agentConfigSignature }) {
  const list = getUserAgents();
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row = {
    id,
    name: String(name || '').trim() || 'Agent',
    instruction: String(instruction || '').trim(),
    active: true,
    createdAt: new Date().toISOString(),
    // New Focus Areas always start at stage 0 (profile/science only).
    maturity_stage: clampMaturityStage(maturity_stage ?? 0),
  };
  if (String(trackingLifeAreaId || '').trim()) {
    row.trackingLifeAreaId = String(trackingLifeAreaId).trim().toLowerCase();
  }
  if (String(trackingGoalLabel || '').trim()) {
    row.trackingGoalLabel = String(trackingGoalLabel).trim();
  }
  if (String(behaviorModeId || '').trim()) {
    row.behaviorModeId = String(behaviorModeId).trim().toLowerCase();
  }
  if (sensor_data && typeof sensor_data === 'object' && !Array.isArray(sensor_data)) {
    row.sensor_data = { ...sensor_data };
  }
  if (String(agentConfigSignature || '').trim()) {
    row.agentConfigSignature = normalizeAgentConfigSignature(agentConfigSignature);
  }
  list.push(normalizeAgentRow(row) || row);
  setUserAgents(list);
  return list[list.length - 1];
}

/**
 * Blueprint-backed instance (modular runtime).
 * @param {{
 *   blueprintId: string,
 *   name: string,
 *   instruction?: string,
 *   sensor_data?: object,
 *   custom_triggers?: object,
 *   agentStatus?: AgentLifecycleStatus,
 *   trackingLifeAreaId?: string,
 *   trackingGoalLabel?: string,
 *   behaviorModeId?: string,
 *   maturity_stage?: number,
 *   agentConfigSignature?: string
 * }} params
 */
export function addBlueprintUserAgent(params) {
  const list = getUserAgents();
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const blueprintId = String(params.blueprintId || '').trim();
  const name = String(params.name || '').trim() || 'Agent';
  const row = normalizeAgentRow({
    id,
    blueprintId,
    name,
    instruction: String(params.instruction || '').trim(),
    sensor_data: params.sensor_data && typeof params.sensor_data === 'object' ? params.sensor_data : {},
    custom_triggers:
      params.custom_triggers && typeof params.custom_triggers === 'object' ? params.custom_triggers : {},
    agentStatus: params.agentStatus || 'Incomplete',
    active: true,
    createdAt: new Date().toISOString(),
    trackingLifeAreaId: params.trackingLifeAreaId,
    trackingGoalLabel: params.trackingGoalLabel,
    behaviorModeId: params.behaviorModeId,
    maturity_stage: params.maturity_stage ?? 0,
    agentConfigSignature: params.agentConfigSignature,
  });
  list.push(row);
  setUserAgents(list);
  return row;
}

/**
 * Update a Focus Area's maturity stage (0–3).
 * @param {string} id
 * @param {number} stage
 * @returns {object|null}
 */
export function setUserAgentMaturityStage(id, stage) {
  const list = getUserAgents();
  const idx = list.findIndex((a) => a && String(a.id) === String(id));
  if (idx < 0) return null;
  const next = { ...list[idx], maturity_stage: clampMaturityStage(stage) };
  list[idx] = normalizeAgentRow(next) || next;
  setUserAgents(list);
  return list[idx];
}

/**
 * @param {string} signature
 * @returns {object|null}
 */
export function findUserAgentByConfigSignature(signature) {
  const wanted = normalizeAgentConfigSignature(signature);
  if (!wanted) return null;
  return (
    getUserAgents().find((a) => normalizeAgentConfigSignature(a?.agentConfigSignature) === wanted) || null
  );
}

/**
 * @param {string} focusAreaId
 * @returns {object|null}
 */
export function findUserAgentByFocusAreaId(focusAreaId) {
  const want = String(focusAreaId || '').trim().toLowerCase();
  if (!want) return null;
  return (
    getUserAgents().find((a) => a && String(a.trackingLifeAreaId || '').trim().toLowerCase() === want) ||
    null
  );
}

/**
 * @param {string} signature
 * @returns {boolean}
 */
export function hasUserAgentConfigSignature(signature) {
  return Boolean(findUserAgentByConfigSignature(signature));
}

/**
 * @param {string} displayName
 * @returns {object|null}
 */
export function findUserAgentByDisplayName(displayName) {
  const n = String(displayName || '').trim();
  if (!n) return null;
  return getUserAgents().find((a) => a && String(a.name).trim() === n) || null;
}

/**
 * @param {string} baseName
 * @returns {string}
 */
export function allocateUniqueAgentDisplayName(baseName) {
  const base = String(baseName || '').trim() || 'Agent';
  const taken = () => getUserAgents().some((a) => a && String(a.name).trim() === base);
  if (!taken()) return base;
  let i = 2;
  for (;;) {
    const candidate = `${base} (${i})`;
    if (!getUserAgents().some((a) => a && String(a.name).trim() === candidate)) return candidate;
    i += 1;
    if (i > 500) return `${base}-${Date.now()}`;
  }
}

/**
 * @param {string} displayName
 * @param {AgentLifecycleStatus} status
 */
export function setUserAgentStatusByDisplayName(displayName, status) {
  const n = String(displayName || '').trim();
  if (!n) return null;
  const list = getUserAgents();
  const idx = list.findIndex((a) => a && String(a.name).trim() === n);
  if (idx < 0) return null;
  const prev = list[idx];
  if (!prev.blueprintId) return null;
  const next = { ...prev, agentStatus: status, active: status !== 'Paused' };
  list[idx] = normalizeAgentRow(next) || next;
  setUserAgents(list);
  return list[idx];
}

/**
 * @param {string} id
 * @param {object} patch
 */
export function patchBlueprintUserAgent(id, patch) {
  const list = getUserAgents();
  const idx = list.findIndex((a) => a && String(a.id) === String(id));
  if (idx < 0) return null;
  const prev = list[idx];
  const merged = {
    ...prev,
    ...patch,
    sensor_data: {
      ...(prev.sensor_data && typeof prev.sensor_data === 'object' ? prev.sensor_data : {}),
      ...(patch.sensor_data && typeof patch.sensor_data === 'object' ? patch.sensor_data : {}),
    },
    custom_triggers: {
      ...(prev.custom_triggers && typeof prev.custom_triggers === 'object' ? prev.custom_triggers : {}),
      ...(patch.custom_triggers && typeof patch.custom_triggers === 'object' ? patch.custom_triggers : {}),
    },
  };
  list[idx] = normalizeAgentRow(merged) || merged;
  setUserAgents(list);
  return list[idx];
}

/**
 * @param {string} id
 * @returns {{ id: string, name: string, instruction: string, active?: boolean, createdAt?: string }|null}
 */
export function getUserAgentById(id) {
  const wanted = String(id || '');
  if (!wanted) return null;
  return getUserAgents().find((a) => a && String(a.id) === wanted) || null;
}

/**
 * Update agent; renames ledger key when display name changes (Feed re-zones via zoneFromAgentName).
 * @param {string} id
 * @param {{ name: string, instruction: string }} patch
 */
export function updateUserAgent(id, { name, instruction, sensor_data, custom_triggers, agentStatus }) {
  const list = getUserAgents();
  const idx = list.findIndex((a) => a && String(a.id) === String(id));
  if (idx < 0) return null;

  const prev = list[idx];
  const prevName = String(prev.name || '').trim();
  const nextName = name !== undefined ? String(name || '').trim() || 'Agent' : prevName;
  const nextInstruction = instruction !== undefined ? String(instruction || '').trim() : String(prev.instruction || '');

  if (prevName !== nextName) {
    renameAgentInsightKey(prevName, nextName);
  }

  const next = { ...prev, name: nextName, instruction: nextInstruction };
  if (prev.trackingLifeAreaId) next.trackingLifeAreaId = prev.trackingLifeAreaId;
  if (prev.trackingGoalLabel) next.trackingGoalLabel = prev.trackingGoalLabel;
  if (prev.behaviorModeId) next.behaviorModeId = prev.behaviorModeId;
  if (sensor_data && typeof sensor_data === 'object') {
    next.sensor_data = { ...(prev.sensor_data || {}), ...sensor_data };
  }
  if (custom_triggers && typeof custom_triggers === 'object') {
    next.custom_triggers = { ...(prev.custom_triggers || {}), ...custom_triggers };
  }
  if (agentStatus === 'Active' || agentStatus === 'Paused' || agentStatus === 'Incomplete') {
    next.agentStatus = agentStatus;
    next.active = agentStatus !== 'Paused';
  }
  list[idx] = normalizeAgentRow(next) || next;
  setUserAgents(list);
  return list[idx];
}

/**
 * Remove agent and strip its insights from common_ledger.
 * @param {string} id
 */
export function deleteUserAgent(id) {
  const list = getUserAgents();
  const agent = list.find((a) => a && String(a.id) === String(id));
  if (!agent) return false;

  const displayName = String(agent.name || '').trim();
  if (displayName) removeAgentInsightsForAgent(displayName);

  setUserAgents(list.filter((a) => a && String(a.id) !== String(id)));
  return true;
}

/** Agents call this to publish a short status into `common_ledger`. */
export function agentPublishInsight(agentName, status) {
  return writeAgentInsight(agentName, status);
}
