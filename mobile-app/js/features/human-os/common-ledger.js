// Serron — Common Ledger: shared agent insights for CEO / Feed synthesis
// @owner: human-os
// @role: storage

/** @type {string} Exact key requested for Human OS ledger */
export const COMMON_LEDGER_STORAGE_KEY = 'common_ledger';

/** Feed rows created by Ultimate Agent Creator (preserved while blueprint agents are Incomplete). */
export const LEDGER_SOURCE_ULTIMATE_CREATOR = 'ultimate-agent-creator';

function defaultLedger() {
  return {
    last_update: null,
    agent_insights: [],
  };
}

/** @param {object} row @param {string|null} [fallbackTs] */
function normalizeInsightRow(row, fallbackTs) {
  if (!row || typeof row !== 'object') return null;
  const agent = String(row.agent || '').trim();
  const status = String(row.status || '').trim();
  if (!agent || !status) return null;
  let priority = String(row.priority || 'normal').toLowerCase() === 'critical' ? 'critical' : 'normal';
  const stUp = status.toUpperCase();
  if (/\bCRITICAL\b/.test(stUp) || stUp.startsWith('CRITICAL')) priority = 'critical';
  const done = Boolean(row.done);
  const paused = Boolean(row.paused);
  const updatedAt = row.updatedAt || row.updated_at || fallbackTs || new Date(0).toISOString();
  const source = String(row.source || '').trim() || undefined;
  const o = { agent, status, priority, done, updatedAt, ...(source ? { source } : {}) };
  if (paused) o.paused = true;
  return o;
}

/**
 * @returns {{ last_update: string|null, agent_insights: Array<{ agent: string, status: string, priority?: string, done?: boolean, updatedAt?: string }> }}
 */
export function getCommonLedger() {
  try {
    const raw = localStorage.getItem(COMMON_LEDGER_STORAGE_KEY);
    if (!raw) return defaultLedger();
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return defaultLedger();
    if (!Array.isArray(o.agent_insights)) o.agent_insights = [];
    const lu = o.last_update || null;
    o.agent_insights = o.agent_insights.map((row) => normalizeInsightRow(row, lu)).filter(Boolean);
    return o;
  } catch (_) {
    return defaultLedger();
  }
}

/**
 * @param {{ last_update?: string|null, agent_insights?: Array<{ agent: string, status: string }> }} ledger
 */
export function setCommonLedger(ledger) {
  const next = {
    ...defaultLedger(),
    ...ledger,
    agent_insights: Array.isArray(ledger.agent_insights) ? ledger.agent_insights : [],
  };
  localStorage.setItem(COMMON_LEDGER_STORAGE_KEY, JSON.stringify(next));
  notifyLedgerChanged();
}

/**
 * Write or replace insight for an agent (one row per agent name).
 * @param {string} agent - Display name, e.g. "Weather"
 * @param {string} status - Short insight string
 * @param {{ priority?: 'critical'|'normal', done?: boolean, source?: string, paused?: boolean }} [options]
 */
export function writeAgentInsight(agent, status, options = {}) {
  const a = agent != null ? String(agent).trim() : '';
  const s = status != null ? String(status).trim() : '';
  if (!a || !s) return getCommonLedger();

  const priority = options.priority === 'critical' ? 'critical' : 'normal';
  const done = Boolean(options.done);
  const source = options.source != null ? String(options.source).trim() : '';
  const updatedAt = new Date().toISOString();

  const ledger = getCommonLedger();
  const prev = ledger.agent_insights.find((row) => row && String(row.agent).trim() === a);
  let paused = false;
  if (options.paused !== undefined) paused = Boolean(options.paused);
  else if (prev) paused = Boolean(prev.paused);

  const filtered = ledger.agent_insights.filter((row) => row && String(row.agent) !== a);
  const nextRow = { agent: a, status: s, priority, done, updatedAt, ...(source ? { source } : {}) };
  if (paused) nextRow.paused = true;
  filtered.push(nextRow);
  ledger.agent_insights = filtered;
  ledger.last_update = updatedAt;
  setCommonLedger(ledger);
  return ledger;
}

/**
 * Pause or resume feed card processing for an agent (persists on ledger row).
 * @param {string} agentName
 * @param {boolean} paused
 */
export function setAgentInsightPaused(agentName, paused) {
  const a = String(agentName || '').trim();
  if (!a) return getCommonLedger();
  const ledger = getCommonLedger();
  const row = ledger.agent_insights.find((r) => r && String(r.agent).trim() === a);
  if (!row) return ledger;
  const src = row.source != null ? String(row.source).trim() : '';
  const priority = row.priority === 'critical' ? 'critical' : 'normal';
  return writeAgentInsight(a, row.status, {
    priority,
    done: Boolean(row.done),
    ...(src ? { source: src } : {}),
    paused,
  });
}

/**
 * If an agent display name changes in Services, migrate ledger rows (re-zone on Feed via zoneFromAgentName).
 * Dedupes by agent name (last row wins if collision after rename).
 * @param {string} oldName
 * @param {string} newName
 */
export function renameAgentInsightKey(oldName, newName) {
  const o = String(oldName ?? '').trim();
  const n = String(newName ?? '').trim();
  if (!o || !n || o === n) return getCommonLedger();

  const ledger = getCommonLedger();
  const rows = Array.isArray(ledger.agent_insights) ? ledger.agent_insights : [];
  const remapped = rows
    .filter((row) => row && String(row.agent).trim())
    .map((row) => {
      const a = String(row.agent).trim();
      const nextAgent = a === o ? n : a;
      return { ...row, agent: nextAgent, status: row.status };
    });
  const byAgent = new Map();
  for (const row of remapped) {
    if (!row.agent) continue;
    const norm = normalizeInsightRow(row, ledger.last_update) || row;
    byAgent.set(String(row.agent).trim(), norm);
  }
  ledger.agent_insights = [...byAgent.values()].filter(Boolean);
  ledger.last_update = new Date().toISOString();
  setCommonLedger(ledger);
  return ledger;
}

/**
 * Remove ledger insights for a deleted agent (match display name).
 * @param {string} agentDisplayName
 */
export function removeAgentInsightsForAgent(agentDisplayName) {
  const a = String(agentDisplayName ?? '').trim();
  if (!a) return getCommonLedger();

  const ledger = getCommonLedger();
  ledger.agent_insights = ledger.agent_insights.filter((row) => !row || String(row.agent).trim() !== a);
  ledger.last_update = new Date().toISOString();
  setCommonLedger(ledger);
  return ledger;
}

function notifyLedgerChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('serron:common-ledger-updated'));
  } catch (_) {}
  try {
    if (typeof window.updateFeedUI === 'function') {
      void window.updateFeedUI();
    }
  } catch (_) {}
}
