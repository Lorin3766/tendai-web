// Serron — Global data dispatcher: TALK → parse → match FEED agent → sensor_data (CustomEvents)
// @owner: feed
// @role: workflow

import { getCommonLedger } from '../human-os/common-ledger.js';
import {
  getUserAgents,
  patchBlueprintUserAgent,
  updateUserAgent,
  findUserAgentByDisplayName,
} from '../human-os/user-agents.js';
import { resolveAgentTrackId } from './agent-reports-feed.js';

const DEMO = 'demo';

/**
 * @param {string} text
 * @returns {Array<{ patch: Record<string, unknown>, tracks: string[] }>}
 */
function extractTelemetryPatches(text) {
  const raw = String(text || '');
  const t = raw.trim();
  if (!t) return [];

  /** @type {Array<{ patch: Record<string, unknown>, tracks: string[] }>} */
  const out = [];

  const w = t.match(/(?:^|\b)(?:weight|weigh|mass)\s*[:\s]*(\d+(?:\.\d+)?)\s*(?:kg|kgs)?\b/i);
  if (w) {
    const kg = parseFloat(w[1]);
    if (Number.isFinite(kg) && kg > 1 && kg < 500) {
      out.push({ patch: { body_weight_kg: kg }, tracks: ['nutrition'] });
    }
  }

  const bp =
    t.match(/\b(?:blood\s*pressure|bp)\s*[:\s]*(\d{2,3})\s*\/\s*(\d{2,3})\b/i) ||
    t.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mmhg|mm\s*hg|blood\s*pressure|bp)\b/i);
  if (bp) {
    const sys = parseInt(bp[1], 10);
    const dia = parseInt(bp[2], 10);
    if (sys >= 60 && sys <= 250 && dia >= 40 && dia <= 180) {
      out.push({ patch: { blood_pressure_mmhg: `${sys}/${dia}` }, tracks: ['heart'] });
    }
  }

  const stepsM =
    t.match(/\b(\d{1,7})\s*(?:steps?|k\s*steps)\b/i) || t.match(/\b(\d{1,7})\s+steps?\b/i);
  if (stepsM) {
    const n = parseInt(stepsM[1], 10);
    if (n >= 0 && n <= 200000) {
      out.push({ patch: { steps_total: n }, tracks: ['activity', 'heart'] });
    }
  }

  const hrvM = t.match(/\bhrv\s*[:\s]*(\d{1,5})\s*(?:ms)?\b/i);
  if (hrvM) {
    const ms = parseInt(hrvM[1], 10);
    if (ms > 0 && ms < 5000) {
      out.push({ patch: { hrv_ms: ms }, tracks: ['heart', 'activity'] });
    }
  }

  const calM = t.match(/\b(?:active\s*)?(?:cal|calories|cals)\s*[:\s]*(\d{2,5})\b/i);
  if (calM) {
    const c = parseInt(calM[1], 10);
    if (c > 0 && c < 20000) {
      out.push({ patch: { active_cal_kcal: c }, tracks: ['activity', 'heart'] });
    }
  }

  const sleepH =
    t.match(/(?:slept|sleep|got)\s+(\d+(?:\.\d+)?)\s*(?:hours?|h)\b/i) ||
    t.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|h)\s+(?:of\s+)?sleep\b/i);
  if (sleepH) {
    const h = parseFloat(sleepH[1]);
    if (h >= 0 && h <= 24) {
      out.push({ patch: { sleep_hours_total: h }, tracks: ['sleep', 'energy'] });
    }
  }

  const glucoseM = t.match(/\bglucose\s*[:\s]*(\d{2,4})\b/i);
  if (glucoseM) {
    const g = parseInt(glucoseM[1], 10);
    if (g > 20 && g < 600) {
      out.push({ patch: { glucose_mgdl: g }, tracks: ['nutrition', 'labs'] });
    }
  }

  const protM = t.match(/\bprotein\s*[:\s]*(\d{1,3})\s*(?:g|grams?)?\b/i);
  if (protM) {
    const g = parseInt(protM[1], 10);
    if (g > 0 && g < 400) {
      out.push({ patch: { protein_g: g }, tracks: ['nutrition'] });
    }
  }

  const hydM = t.match(/\b(?:hydration|water)\s*[:\s]*(\d{2,5})\s*(?:ml|mL)?\b/i);
  if (hydM) {
    const ml = parseInt(hydM[1], 10);
    if (ml > 0 && ml < 20000) {
      out.push({ patch: { hydration_ml: ml }, tracks: ['nutrition'] });
    }
  }

  return out;
}

/**
 * @param {string} t
 * @returns {string|null}
 */
function parseAtAgentMention(t) {
  const m = String(t || '').trim().match(/^@([^\s,]+(?:\s+[^\s,]+)*?)(?:[,:]|\s+|$)/);
  if (!m) return null;
  const raw = String(m[1] || '').trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, ' ');
}

/**
 * @param {Set<string>} feedNames
 * @param {string[]} preferredTracks
 * @param {string|null} mention
 * @returns {object|null}
 */
function pickAgentForTelemetry(feedNames, preferredTracks, mention) {
  const agents = getUserAgents().filter((a) => a && a.active !== false);
  const tracks = new Set(preferredTracks.map((x) => String(x || '').toLowerCase()));
  const primary = String(preferredTracks[0] || '').toLowerCase();

  const eligible = agents.filter((a) => feedNames.has(String(a.name || '').trim()));
  if (!eligible.length) return null;

  if (mention) {
    const exact = eligible.find((a) => String(a.name || '').trim().toLowerCase() === mention.toLowerCase());
    if (exact) return exact;
    const partial = eligible.find((a) => String(a.name || '').toLowerCase().includes(mention.toLowerCase()));
    if (partial) return partial;
  }

  let best = null;
  let bestScore = -1;
  for (const a of eligible) {
    const name = String(a.name || '').trim();
    const tid = resolveAgentTrackId(name);
    let score = 0;
    if (tracks.has(tid)) score += 8;
    if (primary && tid === primary) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  if (best && bestScore > 0) return best;
  if (eligible.length === 1) return eligible[0];
  return null;
}

function feedAgentDisplayNames() {
  const ledger = getCommonLedger();
  const rows = Array.isArray(ledger.agent_insights) ? ledger.agent_insights : /** @type {any[]} */ ([]);
  /** @type {Set<string>} */
  const set = new Set();
  for (const r of rows) {
    if (!r) continue;
    if (String(r.source || '').toLowerCase() === DEMO) continue;
    const ag = String(r.agent || '').trim();
    if (ag) set.add(ag);
  }
  return set;
}

/**
 * @param {string} text
 */
export function dispatchTalkTelemetry(text) {
  const items = extractTelemetryPatches(text);
  if (!items.length) return;

  const feedNames = feedAgentDisplayNames();
  const mention = parseAtAgentMention(text);

  for (const { patch, tracks } of items) {
    const agent = pickAgentForTelemetry(feedNames, tracks, mention);
    if (!agent?.id) continue;

    const prev = findUserAgentByDisplayName(String(agent.name || ''));
    if (!prev) continue;

    if (prev.blueprintId) {
      patchBlueprintUserAgent(prev.id, { sensor_data: patch });
    } else {
      const mergedSd = {
        ...(prev.sensor_data && typeof prev.sensor_data === 'object' ? prev.sensor_data : {}),
        ...patch,
      };
      updateUserAgent(prev.id, { sensor_data: mergedSd });
    }

    try {
      window.dispatchEvent(
        new CustomEvent('serron:agent-sensor-updated', {
          detail: { agentName: String(prev.name || '').trim(), patch },
        })
      );
    } catch (_) {}
  }

  if (items.length) {
    try {
      window.dispatchEvent(
        new CustomEvent('serron:telemetry-ingested', {
          detail: { source: 'talk', count: items.length },
        })
      );
    } catch (_) {}
  }
}

export function initDataDispatcher() {
  if (typeof window === 'undefined') return;
  if (window.__serronDataDispatcherInit) return;
  window.__serronDataDispatcherInit = true;

  window.addEventListener('serron:talk-user-submit', (ev) => {
    const text = ev && /** @type {CustomEvent} */ (ev).detail && /** @type {any} */ (ev.detail).text;
    if (text) dispatchTalkTelemetry(String(text));
  });
}
