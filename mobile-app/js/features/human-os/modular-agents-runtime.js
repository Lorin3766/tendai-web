// Serron — Modular blueprint agents: background ticks, bus publish, conditional feed writes
// @owner: human-os
// @role: effects

import { getSharedContextBus } from '../../core/shared-context-bus.js';
import { getUserAgents } from './user-agents.js';
import { getBlueprintByIdSync, loadBlueprints } from './blueprints-loader.js';
import {
  writeAgentInsight,
  removeAgentInsightsForAgent,
  getCommonLedger,
  LEDGER_SOURCE_ULTIMATE_CREATOR,
} from './common-ledger.js';
import { getUserLocation } from '../storage/location-service.js';
import { getHeartRateBpm } from '../storage/health-sync.js';
import { patchBlueprintUserAgent } from './user-agents.js';

const SOURCE = 'modular-blueprint';

/**
 * @param {object} agent
 * @param {object} blueprint
 * @returns {boolean}
 */
function weatherSensorsReady(agent, blueprint) {
  if (!agent?.sensor_data || typeof agent.sensor_data !== 'object') return false;
  const key = String(agent.sensor_data.openweather_api_key || '').trim();
  const locOk = agent.sensor_data.location_granted === true;
  return Boolean(key && locOk);
}

function cardioSensorsReady(agent) {
  return agent?.sensor_data?.health_connected === true;
}

function githubSensorsReady(agent) {
  return Boolean(String(agent?.sensor_data?.github_token || '').trim());
}

/**
 * @param {object} agent
 * @param {object} blueprint
 */
function recomputeIncompleteStatus(agent, blueprint) {
  const id = agent.blueprintId;
  if (id === 'weather_scout') return weatherSensorsReady(agent, blueprint) ? null : 'Incomplete';
  if (id === 'cardio_monitor') return cardioSensorsReady(agent) ? null : 'Incomplete';
  if (id === 'github_scout') return githubSensorsReady(agent) ? null : 'Incomplete';
  return 'Incomplete';
}

async function coordsForAgent() {
  const loc = await getUserLocation();
  if (!loc) return null;
  if (loc.type === 'geo' && loc.coords) {
    return { lat: loc.coords.lat, lon: loc.coords.lon };
  }
  if (loc.type === 'manual' && (loc.city || loc.zip)) {
    const q = encodeURIComponent(String(loc.zip || loc.city || '').trim());
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    return r ? { lat: r.latitude, lon: r.longitude } : null;
  }
  return null;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} apiKey
 */
async function fetchOpenWeatherCurrent(lat, lon, apiKey) {
  const u = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${encodeURIComponent(apiKey)}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`openweather ${res.status}`);
  const d = await res.json();
  const windMph = d.wind?.speed != null ? Math.round(Number(d.wind.speed)) : 0;
  const tempF = d.main?.temp != null ? Math.round(Number(d.main.temp)) : null;
  const condition = d.weather?.[0]?.main || 'Weather';
  const description = d.weather?.[0]?.description || '';
  return { windMph, tempF, condition, description, raw: d };
}

/**
 * @param {object} agent
 * @param {object} blueprint
 * @param {{ ignorePaused?: boolean }} [opts]
 */
async function tickWeatherScout(agent, blueprint, opts = {}) {
  const name = String(agent.name || 'Weather Scout').trim();
  const bus = getSharedContextBus();

  if (agent.agentStatus === 'Paused' && !opts.ignorePaused) return;
  if (!weatherSensorsReady(agent, blueprint)) {
    bus.publish('weather_scout', { agentId: agent.id, ready: false, updatedAt: new Date().toISOString() });
    removeAgentInsightsForAgent(name);
    return;
  }

  const apiKey = String(agent.sensor_data.openweather_api_key || '').trim();
  const coords = await coordsForAgent();
  if (!coords) {
    removeAgentInsightsForAgent(name);
    return;
  }

  let pack;
  try {
    pack = await fetchOpenWeatherCurrent(coords.lat, coords.lon, apiKey);
  } catch (_) {
    return;
  }

  bus.publish('weather_scout', {
    agentId: agent.id,
    ready: true,
    windMph: pack.windMph,
    tempF: pack.tempF,
    condition: pack.condition,
    uvIndex: null,
  });

  const triggers = agent.custom_triggers || {};
  const windGt = Number(triggers.wind_gt ?? blueprint?.trigger_logic_schema?.numeric?.find((n) => n.id === 'wind_gt')?.default ?? 25);
  const uvGt = Number(triggers.uv_gt ?? 7);
  const uv = null;
  const windFire = Number.isFinite(pack.windMph) && pack.windMph > windGt;
  const uvFire = uv != null && Number.isFinite(uv) && uv > uvGt;
  const fired = windFire || uvFire;

  if (!fired) {
    removeAgentInsightsForAgent(name);
    return;
  }

  const health = bus.getHealthSummaryForWeather();
  const healthAlert = bus.hasHealthAlertContext();
  let status = windFire
    ? `STRONG WIND: ${pack.windMph} mph (${pack.condition}). Limit exposure.`
    : `HIGH UV: index ${uv}. Reduce sun exposure.`;
  if (healthAlert && health.pulseBpm != null) {
    status += ` Health context: pulse ${health.pulseBpm} bpm — prioritize recovery over outdoor exertion.`;
  } else if (healthAlert) {
    status += ' Health context: elevated vitals on bus — prioritize recovery over outdoor exertion.';
  }
  const nl = String(triggers.naturalLanguage || agent.instruction || '').trim();
  if (nl) status += ` Note: ${nl}`;

  writeAgentInsight(name, status, {
    priority: windFire && pack.windMph > windGt + 10 ? 'critical' : 'normal',
    source: SOURCE,
  });
}

/**
 * @param {object} agent
 * @param {object} blueprint
 * @param {{ ignorePaused?: boolean }} [opts]
 */
function tickCardioMonitor(agent, blueprint, opts = {}) {
  const name = String(agent.name || 'Cardio Monitor').trim();
  const bus = getSharedContextBus();

  if (agent.agentStatus === 'Paused' && !opts.ignorePaused) return;
  if (!cardioSensorsReady(agent)) {
    bus.publish('cardio_monitor', { agentId: agent.id, ready: false });
    removeAgentInsightsForAgent(name);
    return;
  }

  const bpm = getHeartRateBpm();
  const pulseGt = Number(
    agent.custom_triggers?.pulse_gt ?? blueprint?.trigger_logic_schema?.numeric?.find((n) => n.id === 'pulse_gt')?.default ?? 100
  );
  const pulse = Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : null;
  const alert = pulse != null && pulse > pulseGt;
  bus.publish('cardio_monitor', {
    agentId: agent.id,
    ready: true,
    pulseBpm: pulse,
    alert,
    threshold: pulseGt,
  });

  if (!alert || pulse == null) {
    removeAgentInsightsForAgent(name);
    return;
  }

  let status = `Pulse elevated: ${pulse} bpm (threshold ${pulseGt}). Ease intensity and hydrate.`;
  const nl = String(agent.custom_triggers?.naturalLanguage || agent.instruction || '').trim();
  if (nl) status += ` ${nl}`;
  writeAgentInsight(name, status, { priority: 'critical', source: SOURCE });
}

/**
 * @param {object} agent
 * @param {object} blueprint
 * @param {{ ignorePaused?: boolean }} [opts]
 */
async function tickGithubScout(agent, blueprint, opts = {}) {
  const name = String(agent.name || 'GitHub Scout').trim();
  const bus = getSharedContextBus();

  if (agent.agentStatus === 'Paused' && !opts.ignorePaused) return;
  if (!githubSensorsReady(agent)) {
    bus.publish('github_scout', { agentId: agent.id, ready: false });
    removeAgentInsightsForAgent(name);
    return;
  }

  const token = String(agent.sensor_data.github_token || '').trim();
  const threshold = Number(
    agent.custom_triggers?.open_issues_gt ??
      blueprint?.trigger_logic_schema?.numeric?.find((n) => n.id === 'open_issues_gt')?.default ??
      10
  );

  try {
    const ur = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) throw new Error('github user');
    const uj = await ur.json();
    const login = String(uj.login || '').trim();
    if (!login) throw new Error('no login');

    const q = encodeURIComponent(`is:open is:issue assignee:${login}`);
    const ir = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=1`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    });
    if (!ir.ok) throw new Error('github search');
    const ij = await ir.json();
    const total = Number(ij.total_count) || 0;
    bus.publish('github_scout', { agentId: agent.id, ready: true, openAssigned: total });

    if (total <= threshold) {
      removeAgentInsightsForAgent(name);
      return;
    }

    let status = `Assigned open issues: ${total} (threshold ${threshold}). Triage or delegate.`;
    const nl = String(agent.custom_triggers?.naturalLanguage || agent.instruction || '').trim();
    if (nl) status += ` ${nl}`;
    writeAgentInsight(name, status, { priority: 'normal', source: SOURCE });
  } catch (_) {
    bus.publish('github_scout', { agentId: agent.id, ready: false, error: true });
  }
}

function syncIncompleteFlags() {
  const agents = getUserAgents();
  for (const agent of agents) {
    if (!agent.blueprintId) continue;
    if (agent.agentStatus === 'Paused') continue;
    const bp = getBlueprintByIdSync(agent.blueprintId);
    if (!bp) continue;
    const shouldIncomplete = recomputeIncompleteStatus(agent, bp) === 'Incomplete';
    if (shouldIncomplete && agent.agentStatus === 'Active') {
      patchBlueprintUserAgent(agent.id, { agentStatus: 'Incomplete' });
    } else if (!shouldIncomplete && agent.agentStatus === 'Incomplete') {
      patchBlueprintUserAgent(agent.id, { agentStatus: 'Active' });
    }
  }
}

export async function tickModularAgents() {
  await loadBlueprints();
  syncIncompleteFlags();

  let agents = getUserAgents();
  for (const agent of agents) {
    if (!agent.blueprintId) continue;
    if (agent.agentStatus === 'Incomplete') {
      const name = String(agent.name || '').trim();
      if (!name) continue;
      const ledger = getCommonLedger();
      const row = ledger.agent_insights.find((r) => r && String(r.agent).trim() === name);
      const src = String(row?.source || '');
      const st = String(row?.status || '');
      if (src === LEDGER_SOURCE_ULTIMATE_CREATOR || /\bSystem Handshake\b/i.test(st)) {
        continue;
      }
      removeAgentInsightsForAgent(name);
    }
  }

  agents = getUserAgents();
  const order = ['cardio_monitor', 'weather_scout', 'github_scout'];
  for (const blueprintId of order) {
    for (const agent of agents) {
      if (!agent?.blueprintId || agent.blueprintId !== blueprintId) continue;
      if (agent.agentStatus === 'Incomplete' || agent.agentStatus === 'Paused') continue;

      const bp = getBlueprintByIdSync(agent.blueprintId);
      if (!bp) continue;

      if (blueprintId === 'weather_scout') await tickWeatherScout(agent, bp, {});
      else if (blueprintId === 'cardio_monitor') tickCardioMonitor(agent, bp, {});
      else if (blueprintId === 'github_scout') await tickGithubScout(agent, bp, {});
    }
  }
}

/**
 * @param {string} displayName
 * @param {{ force?: boolean }} [opts] - force=true runs even when agent is Paused (feed REFRESH)
 */
export async function runModularAgentRefreshForDisplayName(displayName, opts = {}) {
  await loadBlueprints();
  const name = String(displayName || '').trim();
  const agent = getUserAgents().find((a) => a && String(a.name).trim() === name);
  if (!agent?.blueprintId) return;
  if (agent.agentStatus === 'Incomplete') return;
  if (agent.agentStatus === 'Paused' && !opts.force) return;
  const bp = getBlueprintByIdSync(agent.blueprintId);
  if (!bp) return;
  const ro = opts.force ? { ignorePaused: true } : {};
  if (agent.blueprintId === 'weather_scout') await tickWeatherScout(agent, bp, ro);
  else if (agent.blueprintId === 'cardio_monitor') tickCardioMonitor(agent, bp, ro);
  else if (agent.blueprintId === 'github_scout') await tickGithubScout(agent, bp, ro);
}

let _interval = null;

export function initModularAgentsRuntime() {
  if (typeof window === 'undefined') return;
  if (window.__serronModularAgentsInit) return;
  window.__serronModularAgentsInit = true;

  const go = () => {
    tickModularAgents().catch(() => {});
  };

  window.addEventListener('serron:boot-ready', () => {
    setTimeout(go, 1200);
  });

  if (window.SERRON_BOOT_READY) {
    setTimeout(go, 400);
  }

  if (_interval) clearInterval(_interval);
  _interval = window.setInterval(go, 5 * 60 * 1000);

  window.addEventListener('serron:common-ledger-updated', () => {
    /* feed refreshed elsewhere */
  });
}
