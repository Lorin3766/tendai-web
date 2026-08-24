// Serron — Feed agent patch persistence (localStorage)
// @owner: feed
// @role: state

const STORAGE_KEY = 'tendai_feed_state';
const STATE_VERSION = 2;

function withSignalConfidenceAliases(payload) {
  const row = payload && typeof payload === 'object' ? { ...payload } : {};
  const confidence =
    row.signalConfidencePct ??
    row.signal_confidence_pct ??
    row.integrityPct ??
    row.integrity;
  if (confidence != null) {
    row.signalConfidencePct = confidence;
    row.integrityPct = confidence; // Deprecated alias.
  }
  return row;
}

/**
 * @returns {{ version: number, agents: Record<string, Record<string, unknown>> }}
 */
function emptyState() {
  return { version: STATE_VERSION, agents: {} };
}

export const FeedState = {
  /**
   * @returns {{ version: number, agents: Record<string, Record<string, unknown>> }}
   */
  load() {
    if (typeof localStorage === 'undefined') return emptyState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      if (!parsed.agents || typeof parsed.agents !== 'object') parsed.agents = {};
      Object.keys(parsed.agents).forEach((id) => {
        parsed.agents[id] = withSignalConfidenceAliases(parsed.agents[id]);
      });
      parsed.version = STATE_VERSION;
      return /** @type {{ version: number, agents: Record<string, Record<string, unknown>> }} */ (parsed);
    } catch (_) {
      return emptyState();
    }
  },

  /**
   * @param {{ version?: number, agents?: Record<string, Record<string, unknown>> }} stateObj
   */
  save(stateObj) {
    if (typeof localStorage === 'undefined') return;
    try {
      const next = stateObj && typeof stateObj === 'object' ? stateObj : emptyState();
      next.version = STATE_VERSION;
      if (!next.agents || typeof next.agents !== 'object') next.agents = {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('[FeedState] save failed', err);
    }
  },

  /**
   * @param {string} agentId
   * @param {Record<string, unknown>} payload
   * @returns {Record<string, unknown>|null}
   */
  upsertAgent(agentId, payload) {
    const id = String(agentId || '').trim();
    if (!id) return null;
    const state = FeedState.load();
    const prev =
      state.agents[id] && typeof state.agents[id] === 'object' ? state.agents[id] : {};
    const merged = {
      ...prev,
      ...withSignalConfidenceAliases(payload),
      agentId: id,
      updatedAt: new Date().toISOString(),
    };
    state.agents[id] = merged;
    FeedState.save(state);
    return merged;
  },

  /**
   * @param {string} agentId
   * @returns {Record<string, unknown>|null}
   */
  getAgent(agentId) {
    const id = String(agentId || '').trim();
    if (!id) return null;
    const row = FeedState.load().agents[id];
    return row && typeof row === 'object' ? row : null;
  },

  /**
   * @returns {string[]}
   */
  listAgentIds() {
    return Object.keys(FeedState.load().agents || {});
  },
};
