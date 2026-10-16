// Serron — Agent Reports: common_ledger feed as full panel cards (no synthetic / demo rows)
// @owner: feed
// @role: ui

import {
  getCommonLedger,
  writeAgentInsight,
  setAgentInsightPaused,
  removeAgentInsightsForAgent,
} from '../human-os/common-ledger.js';
import { rememberFastAlertResponse } from '../talk/user-memory.js';
import { profileState } from '../../state.js';
import { getState } from '../../core/app-state.js';
import { displayMaturityStage, calibrationLine, payoffDetail, noteSignalSaved, FOCUS_AREA_SIGNALS } from '../profile/focus-area-signals.js';
import { getMetricsByDate } from '../../core/biometrics-db.js';
import {
  openUltimateAgentCreatorModal,
  openUltimateAgentCreatorModalAfterPurge,
} from '../human-os/ultimate-agent-creator-modal.js';
import {
  findUserAgentByDisplayName,
  getUserAgentById,
  deleteUserAgent,
  setUserAgentStatusByDisplayName,
  clampMaturityStage,
} from '../human-os/user-agents.js';
import {
  getFocusAreaById,
  getFocusAreaByName,
  resolveFocusAreaTrackId,
  getBehaviorModeUserLabel,
} from '../human-os/focus-areas.js';
import { tickModularAgents } from '../human-os/modular-agents-runtime.js';
import { addMessage } from '../storage/message-queue.js';
import {
  createUniversalAgentCard,
  UNIVERSAL_AGENT_SEARCHING,
} from './universal-agent-card.js';
import { FeedState } from './feed-agent-state.js';
import {
  resolveFeedContentSlot,
  buildSignalConfidenceNudge,
} from './feed-content-slot.js';
import { getEntries } from './content-library.js';

/** @typedef {{ zone: string, zoneKey: string, icon: string }} AgentZone */

/** Life-area track: classic vitals + PHAI deployment sectors (modal `trackingLifeAreaId`). */
/** @typedef {'heart'|'sleep'|'nutrition'|'energy'|'labs'|'activity'|'brain'|'eyes'|'lung'|'blood'|'move'|'general'} AgentLifeTrackId */

const ZONE_SORT = { health: 0, schedule: 1, nutrition: 2, general: 3, environmental: 4 };

const ACCENT_ORANGE = '#FF8C00';
const ACCENT_BLUE = '#00BFFF';
const ACCENT_GREEN = '#2ECC71';

const ICON_HEART = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

const ICON_BOLT = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>`;

const ICON_MOON = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/><path fill="currentColor" opacity="0.35" d="M4 18c0-4 3-7 7-7v2c-2.8 0-5 2.2-5 5H4z"/></svg>`;

const ICON_BARS = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M4 14h4v6H4v-6zm6-10h4v16h-4V4zm6 6h4v10h-4V10z"/></svg>`;

const ICON_LEAF = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M17 8C8 10 6 20 6 20s4-2 8-4c0-3 1-6 3-8zm-1-5c2 0 4 2 4 4 0 1.5-.6 2.9-1.6 4C14 6 10 6 7 8c2-4 6-5 9-5z"/></svg>`;

const ICON_FLASK = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M9 3h6v1h-1.2L18 15a3 3 0 0 1-6 0l-1.8-11H10V3H9zm3 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM6 20h12v2H6v-2z"/></svg>`;

const ICON_BRAIN = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 4C9.5 4 7.5 6 7.5 8.5c0 1.1.4 2.1 1.2 2.9-.5.6-.8 1.3-.8 2.1 0 1.66 1.34 3 3 3h.2c.5 1.38 1.8 2.4 3.2 2.4s2.7-1.02 3.2-2.4h.2c1.66 0 3-1.34 3-3 0-.8-.3-1.5-.8-2.1.8-.8 1.2-1.8 1.2-2.9 0-2.5-2-4.5-4.5-4.5zm0 2c1.38 0 2.5 1.12 2.5 2.5 0 .9-.4 1.7-1 2.2V16h-3v-5.3c-.6-.5-1-1.3-1-2.2C9.5 7.12 10.62 6 12 6z"/></svg>`;

const ICON_EYES = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="8.2" cy="12" r="2.35" fill="currentColor"/><circle cx="15.8" cy="12" r="2.35" fill="currentColor"/></svg>`;

const ICON_LUNG = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M11 2h2v7.2c.8.2 1.5.7 2 1.4l1.8-2.3c1.2-1.5 3.5-1.8 5-.7 1.4 1.1 1.8 3.2.9 4.9l-1.7 3.2a5.2 5.2 0 0 1-4.6 2.8H14v-6.8c0-1-.8-1.8-1.8-1.8H12c-1 0-1.8.8-1.8 1.8v6.8H7.6A5.2 5.2 0 0 1 3 15.7L1.3 12.5c-.9-1.7-.5-3.8.9-4.9 1.5-1.1 3.8-.8 5 .7L9 10.6c.5-.7 1.2-1.2 2-1.4V2Z"/></svg>`;

const ICON_DROP = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2.5c-.3 0-.6.2-.8.5-1.3 2-3.9 6-3.9 8.6 0 2.5 2 4.4 4.7 4.4s4.7-1.9 4.7-4.4c0-2.6-2.6-6.6-3.9-8.6-.2-.3-.5-.5-.8-.5z"/></svg>`;

const ICON_MOVE = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="15" cy="7" r="2" fill="currentColor"/><path fill="currentColor" d="M9 19l1.5-4.5-2-1.5-2 2-1.5-1.5 3-2.5c.7-.5 1.7-.5 2.4 0l1.6 1 1.8-1.2 1 1.5-2.2 1.5c-.6.4-1.4.4-2 0l-.2-.2L9.5 19H9zm7-.5-2-3 1-1 2 3-1 1z"/></svg>`;

const ICON_GRID = `<svg class="agent-report-track-icon" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>`;

const METRICS_MOVEMENT = [
  { k: 'STEPS', v: 'NULL' },
  { k: 'HRV', v: 'NULL' },
  { k: 'ACTIVE CALS', v: 'NULL' },
];
const METRICS_REST = [
  { k: 'DEEP SLEEP', v: 'NULL' },
  { k: 'EFFICIENCY', v: 'NULL' },
  { k: 'REM', v: 'NULL' },
];
const METRICS_BIO = [
  { k: 'GLUCOSE', v: 'NULL' },
  { k: 'PROTEIN', v: 'NULL' },
  { k: 'HYDRATION', v: 'NULL' },
];

/** Deployment modal sectors → analytics schema (labels only until sensor_data fills). */
const METRICS_BRAIN = [
  { k: 'FOCUS DEPTH', v: 'NULL' },
  { k: 'COGNITIVE LOAD', v: 'NULL' },
  { k: 'WINDOW QUALITY', v: 'NULL' },
  { k: 'CONTEXT SYNC', v: 'NULL' },
];
const METRICS_EYES = [
  { k: 'SCREEN LOAD', v: 'NULL' },
  { k: 'BLINK RHYTHM', v: 'NULL' },
  { k: 'STRAIN INDEX', v: 'NULL' },
  { k: 'VISUAL RECOVERY', v: 'NULL' },
];
const METRICS_LUNG = [
  { k: 'RESP CONTEXT', v: 'NULL' },
  { k: 'O2 INDEX', v: 'NULL' },
  { k: 'LOAD SIGNAL', v: 'NULL' },
  { k: 'SYNC STATE', v: 'NULL' },
];
const METRICS_BLOOD = [
  { k: 'CIRCULATION', v: 'NULL' },
  { k: 'MARKER A', v: 'NULL' },
  { k: 'MARKER B', v: 'NULL' },
  { k: 'STREAM', v: 'NULL' },
];
const METRICS_MOVE = [
  { k: 'SESSION LOAD', v: 'NULL' },
  { k: 'DAILY MOTION', v: 'NULL' },
  { k: 'CONSISTENCY', v: 'NULL' },
  { k: 'TARGET', v: 'NULL' },
];
const METRICS_GENERAL = [
  { k: 'CHANNEL A', v: 'NULL' },
  { k: 'CHANNEL B', v: 'NULL' },
  { k: 'CHANNEL C', v: 'NULL' },
  { k: 'STATUS', v: 'NULL' },
];

const ACCENT_PURPLE = '#9B87F5';
const ACCENT_CYAN = '#22D3EE';
const ACCENT_ROSE = '#F87171';

/** @type {Record<AgentLifeTrackId, { brand: string, accent: string, iconSvg: string, metrics: Array<{ k: string, v: string }> }>} */
const TRACK_SPECS = {
  heart: { brand: 'HEART AGENT', accent: ACCENT_ORANGE, iconSvg: ICON_HEART, metrics: METRICS_MOVEMENT },
  activity: { brand: 'ACTIVITY AGENT', accent: ACCENT_ORANGE, iconSvg: ICON_BOLT, metrics: METRICS_MOVEMENT },
  sleep: { brand: 'SLEEP AGENT', accent: ACCENT_BLUE, iconSvg: ICON_MOON, metrics: METRICS_REST },
  energy: { brand: 'ENERGY AGENT', accent: ACCENT_BLUE, iconSvg: ICON_BARS, metrics: METRICS_REST },
  nutrition: { brand: 'NUTRITION AGENT', accent: ACCENT_GREEN, iconSvg: ICON_LEAF, metrics: METRICS_BIO },
  labs: { brand: 'LABS AGENT', accent: ACCENT_GREEN, iconSvg: ICON_FLASK, metrics: METRICS_BIO },
  brain: { brand: 'BRAIN AGENT', accent: ACCENT_PURPLE, iconSvg: ICON_BRAIN, metrics: METRICS_BRAIN },
  eyes: { brand: 'EYES AGENT', accent: ACCENT_CYAN, iconSvg: ICON_EYES, metrics: METRICS_EYES },
  lung: { brand: 'LUNG AGENT', accent: ACCENT_CYAN, iconSvg: ICON_LUNG, metrics: METRICS_LUNG },
  blood: { brand: 'BLOOD AGENT', accent: ACCENT_ROSE, iconSvg: ICON_DROP, metrics: METRICS_BLOOD },
  move: { brand: 'MOVE AGENT', accent: ACCENT_ORANGE, iconSvg: ICON_MOVE, metrics: METRICS_MOVE },
  general: { brand: 'AGENT', accent: '#9CA3AF', iconSvg: ICON_GRID, metrics: METRICS_GENERAL },
};

/**
 * @param {string} name
 * @returns {AgentLifeTrackId|null}
 */
function parseStandardAgentTitle(name) {
  const m = String(name || '').trim().match(/^([a-z]+)\s+agent(?:\s*\(\d+\))?$/i);
  if (!m) return null;
  const w = m[1].toLowerCase();
  return w in TRACK_SPECS ? /** @type {AgentLifeTrackId} */ (w) : null;
}

/**
 * @param {string} displayName
 * @returns {AgentLifeTrackId}
 */
function inferAgentLifeTrack(displayName) {
  const raw = String(displayName || '').trim();
  const u = raw.toUpperCase();
  if (u.startsWith('BRAIN')) return 'brain';
  if (u.startsWith('EYES')) return 'eyes';
  if (u.startsWith('LUNG')) return 'lung';
  if (u.startsWith('BLOOD')) return 'blood';
  if (u.startsWith('MOVE')) return 'move';
  if (u.startsWith('SLEEP')) return 'sleep';
  if (u.startsWith('NUTRITION')) return 'nutrition';
  const n = raw.toLowerCase();
  if (/(lab\b|biomarker|blood test|hba1c|specimen|pathology|marker trend)/i.test(n)) return 'labs';
  if (/(nutrition|meal|food|glucose|diet|hydrat|protein|fasting|vitamin|supplement)/i.test(n)) return 'nutrition';
  if (/(sleep|insomnia|\brem\b|deep sleep|circadian|bedtime|\bnap\b|dream)/i.test(n)) return 'sleep';
  if (/\bbrain\b|cognitive|mental stamina/i.test(n)) return 'brain';
  if (/(energy|focus|readiness|strain|capacity|caffeine)/i.test(n)) return 'energy';
  if (/(step|workout|run\b|walk|whoop|training|10k|cardio|move\b|activity)/i.test(n)) return 'activity';
  if (/(heart|hrv|pulse|bpm|vitals)/i.test(n)) return 'heart';
  const zk = zoneFromAgentName(displayName).zoneKey;
  if (zk === 'nutrition') return 'nutrition';
  if (zk === 'schedule') return 'energy';
  if (zk === 'environmental') return 'activity';
  return 'general';
}

/**
 * Resolve wizard / ledger agent → life-area track (for naming, color, telemetry).
 * @param {string} displayName
 * @returns {AgentLifeTrackId}
 */
export function resolveAgentTrackId(displayName) {
  const ua = findUserAgentByDisplayName(displayName);
  const stored = String(ua?.trackingLifeAreaId || '').trim().toLowerCase();
  const fromFocus = resolveFocusAreaTrackId(stored);
  if (fromFocus && TRACK_SPECS[/** @type {AgentLifeTrackId} */ (fromFocus)]) {
    return /** @type {AgentLifeTrackId} */ (fromFocus);
  }
  if (stored && TRACK_SPECS[/** @type {AgentLifeTrackId} */ (stored)]) {
    return /** @type {AgentLifeTrackId} */ (stored);
  }
  const byName = getFocusAreaByName(displayName);
  if (byName) {
    const mapped = resolveFocusAreaTrackId(byName.id);
    if (mapped && TRACK_SPECS[/** @type {AgentLifeTrackId} */ (mapped)]) {
      return /** @type {AgentLifeTrackId} */ (mapped);
    }
  }
  const fromTitle = parseStandardAgentTitle(displayName);
  if (fromTitle) return fromTitle;
  return inferAgentLifeTrack(displayName);
}

/** Keys that configure pipelines but are not user / device telemetry samples. */
const SENSOR_SIGNAL_IGNORE_KEYS = new Set([
  'source_mode',
  'domain',
  'health_stack',
  'openweather_api_key',
  'github_token',
]);

/**
 * @param {string} key
 * @param {unknown} v
 */
function sensorValueIsLiveTelemetry(key, v) {
  if (SENSOR_SIGNAL_IGNORE_KEYS.has(key)) return false;
  if (v == null) return false;
  if (typeof v === 'boolean') return v === true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'object') return Object.keys(v).length > 0;
  const s = String(v).trim();
  if (!s) return false;
  if (/^(false|no|off|null|undefined)$/i.test(s)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} sd
 */
function sensorDataHasLiveTelemetry(sd) {
  if (!sd || typeof sd !== 'object') return false;
  return Object.keys(sd).some((k) => sensorValueIsLiveTelemetry(k, sd[k]));
}

/**
 * @param {Array<{ k: string, v: string }>} rows
 * @param {string} label
 * @param {string|null|undefined} displayValue
 */
function applyTelemetryRowValue(rows, label, displayValue) {
  const v = displayValue != null ? String(displayValue).trim() : '';
  if (!v) return;
  const row = rows.find((r) => r.k === label);
  if (row) row.v = v;
}

/**
 * @param {string} trackId
 * @param {Array<{ k: string, v: string }>} templateRows
 * @param {Record<string, unknown>} sensorData
 */
function mergeMetricsWithSensor(trackId, templateRows, sensorData) {
  const sd = sensorData && typeof sensorData === 'object' && !Array.isArray(sensorData) ? sensorData : {};
  const rows = templateRows.map((r) => ({ ...r }));
  const n = (x) => {
    if (x == null) return null;
    const num = typeof x === 'number' ? x : parseFloat(String(x));
    return Number.isFinite(num) ? num : null;
  };

  if (trackId === 'heart' || trackId === 'activity') {
    const st = n(sd.steps_total);
    if (st != null) applyTelemetryRowValue(rows, 'STEPS', String(Math.round(st)));
    const hrv = n(sd.hrv_ms);
    const bp = String(sd.blood_pressure_mmhg || '').trim();
    if (hrv != null) applyTelemetryRowValue(rows, 'HRV', `${Math.round(hrv)} ms`);
    else if (bp) applyTelemetryRowValue(rows, 'HRV', bp);
    const cals = n(sd.active_cal_kcal);
    if (cals != null) applyTelemetryRowValue(rows, 'ACTIVE CALS', String(Math.round(cals)));
  } else if (trackId === 'sleep' || trackId === 'energy') {
    const deep = n(sd.deep_sleep_h);
    const tot = n(sd.sleep_hours_total);
    if (deep != null) applyTelemetryRowValue(rows, 'DEEP SLEEP', `${deep} h`);
    else if (tot != null) applyTelemetryRowValue(rows, 'DEEP SLEEP', `${tot} h`);
    const eff = n(sd.sleep_efficiency_pct);
    if (eff != null) applyTelemetryRowValue(rows, 'EFFICIENCY', `${Math.round(eff)}%`);
    const rem = n(sd.rem_sleep_h);
    if (rem != null) applyTelemetryRowValue(rows, 'REM', `${rem} h`);
  } else if (trackId === 'nutrition' || trackId === 'labs') {
    const gl = n(sd.glucose_mgdl);
    if (gl != null) applyTelemetryRowValue(rows, 'GLUCOSE', String(Math.round(gl)));
    else {
      const kg = n(sd.body_weight_kg);
      if (kg != null) {
        const ix = rows.findIndex((r) => r.k === 'GLUCOSE');
        if (ix >= 0) {
          rows[ix] = { k: 'BODY MASS', v: `${kg} kg` };
        }
      }
    }
    const pr = n(sd.protein_g);
    if (pr != null) applyTelemetryRowValue(rows, 'PROTEIN', `${pr} g`);
    const ml = n(sd.hydration_ml);
    if (ml != null) applyTelemetryRowValue(rows, 'HYDRATION', `${Math.round(ml)} ml`);
  }
  return rows;
}

function buildCollapsedMetricsSummary(signal) {
  return signal.active ? 'SIGNAL: ACTIVE' : 'STATUS: STANDBY';
}

/**
 * @param {Array<unknown>} values
 */
function pickFirstNonEmpty(values) {
  for (const v of values) {
    const s = String(v == null ? '' : v).trim();
    if (s) return s;
  }
  return '';
}

/**
 * @param {string} status
 * @param {{ active: boolean }} signal
 * @param {Array<{ k: string, v: string }>} metrics
 * @param {Record<string, unknown>} row
 */
function buildLogicCopy(status, signal, _metrics, row) {
  const explicit = pickFirstNonEmpty([row.logic, row.reasoning, row.rationale, row.analysis]);
  const token = (value, fallback) => {
    const src = String(value || '').trim() || fallback;
    return src
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || fallback;
  };
  const hhmmss = (() => {
    try {
      const d = row.updatedAt ? new Date(String(row.updatedAt)) : new Date();
      if (Number.isNaN(d.getTime())) return '00:00:00';
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      return '00:00:00';
    }
  })();
  const lowSignal = !signal.active || /no data yet|no data|connect your device|connect a device/i.test(String(status || ''));
  if (lowSignal) {
    return `${hhmmss} > SYS_EVENT: NO_DATA_SOURCE_DETECTED\n${hhmmss} > ACTION: AWAITING_SENSOR_LINK`;
  }
  if (explicit) {
    return `${hhmmss} > SYS_EVENT: ${token(status, 'STATUS_UPDATE')}\n${hhmmss} > ACTION: ${token(explicit, 'MONITORING_STREAM')}`;
  }
  return `${hhmmss} > SYS_EVENT: ${token(status, 'STATUS_UPDATE')}\n${hhmmss} > ACTION: MONITORING_STREAM_INTEGRITY`;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} trackId
 */
function buildScienceMeta(row, trackId) {
  const scienceText = pickFirstNonEmpty([row.science, row.protocol, row.study, row.research]);
  const reviewHref = pickFirstNonEmpty([row.reviewUrl, row.studyUrl, row.referenceUrl, row.link]) || 'https://pubmed.ncbi.nlm.nih.gov/';
  const protocolTag =
    {
      heart: 'Cardiovascular baseline protocol',
      activity: 'Movement load protocol',
      sleep: 'Circadian restoration protocol',
      energy: 'Readiness and recovery protocol',
      nutrition: 'Metabolic stability protocol',
      labs: 'Biomarker trend protocol',
      brain: 'Cognitive load and focus protocol',
      eyes: 'Visual strain and screen hygiene protocol',
      lung: 'Respiratory context protocol',
      blood: 'Circulatory marker protocol',
      move: 'Daily motion protocol',
      general: 'General observation protocol',
    }[trackId] || 'Longevity protocol';
  return {
    scienceText,
    reviewHref,
    protocolTag,
  };
}

/**
 * @param {string} displayName
 * @param {boolean} [cardPaused] — ledger card paused (process halted in UI)
 * @returns {{ active: boolean }}
 */
function computeSignalState(displayName, cardPaused) {
  const ua = findUserAgentByDisplayName(displayName);
  if (!ua) return { active: false };
  if (cardPaused || ua.agentStatus === 'Paused') return { active: false };
  const sd = ua.sensor_data && typeof ua.sensor_data === 'object' && !Array.isArray(ua.sensor_data) ? ua.sensor_data : {};
  return { active: sensorDataHasLiveTelemetry(sd) };
}

const NEW_MAX_MS = 24 * 60 * 60 * 1000;

let _prevAgentCardKeys = new Set();
/** @type {null | Record<string, unknown>} */
let _latestBiometricsPayload = null;

/** @type {null | (() => void)} */
let _closeOpenAgentCardMenu = null;

function closeAnyOpenAgentCardMenu() {
  if (typeof _closeOpenAgentCardMenu === 'function') {
    _closeOpenAgentCardMenu();
  }
  _closeOpenAgentCardMenu = null;
}

let _agentCardMenuDocListenersBound = false;

function ensureAgentCardMenuGlobalClose() {
  if (_agentCardMenuDocListenersBound) return;
  _agentCardMenuDocListenersBound = true;
  document.addEventListener(
    'click',
    (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.agent-card-menu-anchor')) return;
      closeAnyOpenAgentCardMenu();
    },
    true
  );
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Escape') closeAnyOpenAgentCardMenu();
    },
    true
  );
}

/**
 * Map agent display name → Human OS zone + icon (keyword rules).
 * @param {string} name
 * @returns {AgentZone}
 */
export function zoneFromAgentName(name) {
  const n = String(name || '').toLowerCase();
  if (/(health|recovery|sleep|heart|pulse|hrv|bpm|strain|vital|medical|whoop)/i.test(n)) {
    return { zone: 'Health', zoneKey: 'health', icon: '❤️' };
  }
  if (/(biohack|nutrition|food|meal|supplement|protocol|oat|vitamin|diet|gut)/i.test(n)) {
    return { zone: 'Nutrition', zoneKey: 'nutrition', icon: '🥗' };
  }
  if (/(weather|scout|uv|wind|thermal|outdoor|environment|smog|aqi)/i.test(n)) {
    return { zone: 'Environmental', zoneKey: 'environmental', icon: '🌤️' };
  }
  if (/(schedule|calendar|agenda|meeting|planner|clock)/i.test(n)) {
    return { zone: 'Schedule', zoneKey: 'schedule', icon: '📅' };
  }
  return { zone: 'General', zoneKey: 'general', icon: '🤖' };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isDemoSourceRow(row) {
  return String(row?.source || '').toLowerCase() === 'demo';
}

/** Ledger rows shown in feed (excludes demo / mock injection). */
function filterRealInsightRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => r && String(r.agent).trim() && String(r.status).trim() && !isDemoSourceRow(r)
  );
}

/**
 * One Feed card per Focus Area. Older deploys could write multiple ledger
 * rows that all resolve to the same track (e.g. two "Nutrition" cards).
 * @param {Array<object>} rows
 */
function dedupeInsightsByFocusArea(rows) {
  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const row of rows) {
    const agent = String(row?.agent || '').trim();
    if (!agent) continue;
    const ua = findUserAgentByDisplayName(agent);
    const focusId = String(ua?.trackingLifeAreaId || '').trim().toLowerCase();
    const trackId = resolveAgentTrackId(agent);
    const key = focusId || `track:${trackId}` || `agent:${agent.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const prevTs = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
    const nextTs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    if (nextTs >= prevTs) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

/** @param {{ priority?: string, status?: string }} row */
export function isCriticalInsight(row) {
  if (!row) return false;
  if (String(row.priority).toLowerCase() === 'critical') return true;
  const st = String(row.status || '').toUpperCase();
  return /\bCRITICAL\b/.test(st) || st.startsWith('CRITICAL') || /\bSTRONG\s+WIND\b/.test(st);
}

/** @param {{ done?: boolean, status?: string }} row */
function isSuccessInsight(row) {
  if (!row) return false;
  if (row.done) return true;
  const st = String(row.status || '').toLowerCase();
  return /\boptimal\b/.test(st) || /\bsuccess\b/.test(st);
}

function sortFeedRows(rows) {
  return [...rows].sort((a, b) => {
    const ca = isCriticalInsight(a) ? 0 : 1;
    const cb = isCriticalInsight(b) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    const za = zoneFromAgentName(a.agent).zoneKey;
    const zb = zoneFromAgentName(b.agent).zoneKey;
    return (ZONE_SORT[za] ?? 99) - (ZONE_SORT[zb] ?? 99);
  });
}

function insightCardKey(row) {
  const agent = String(row.agent || '').trim();
  const status = String(row.status || '').trim();
  const crit = isCriticalInsight(row) ? 'critical' : 'normal';
  return `${agent}\u001f${status}\u001f${crit}`;
}

function formatPanelTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (_) {
    return '—';
  }
}

/**
 * Priority label: CRITICAL | ROUTINE | DONE | NEW
 * @param {{ done?: boolean, status?: string, updatedAt?: string }} row
 */
function priorityLabelForRow(row) {
  if (row.done) return { text: 'DONE', mod: 'done' };
  if (isCriticalInsight(row)) return { text: 'CRITICAL', mod: 'critical' };
  if (isSuccessInsight(row)) return { text: 'DONE', mod: 'done' };
  const t = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  if (t && Date.now() - t < NEW_MAX_MS) return { text: 'NEW', mod: 'new' };
  return { text: 'ROUTINE', mod: 'routine' };
}

function secondaryActionForRow(row) {
  if (isCriticalInsight(row)) return { kind: 'remind', label: 'REMIND' };
  if (row.done || isSuccessInsight(row)) return { kind: 'remind', label: 'REMIND' };
  const pr = priorityLabelForRow(row);
  if (pr.mod === 'new') return { kind: 'confirm', label: 'CONFIRM' };
  return { kind: 'remind', label: 'REMIND' };
}

async function refreshAfterAgentModal() {
  try {
    await tickModularAgents();
  } catch (_) {}
  if (typeof window.renderServices === 'function') window.renderServices();
  if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
  if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
}

function openTalkDiscussAgent(agentName, row, cardContext = {}) {
  const name = String(agentName || '').trim() || 'Agent';
  const prompt = `@${name}, tell me more about your latest report.`;
  const contextId = `ctx_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
  const normalizedContext = cardContext && typeof cardContext === 'object' ? cardContext : {};
  if (typeof window !== 'undefined') {
    const discussPayload = {
      context_id: contextId,
      agent: name,
      status: String((row && row.status) || ''),
      priority: isCriticalInsight(row) ? 'critical' : 'normal',
      updatedAt: (row && row.updatedAt) || new Date().toISOString(),
      track_id: String(normalizedContext.trackId || ''),
      insight_summary: String(normalizedContext.summaryLine || ''),
      logic: String(normalizedContext.logicText || ''),
      science: String(normalizedContext.scienceText || ''),
      review_url: String(normalizedContext.reviewHref || ''),
      metrics: Array.isArray(normalizedContext.metrics)
        ? normalizedContext.metrics.map((m) => ({
            k: String(m?.k || ''),
            v: String(m?.v || ''),
          }))
        : [],
    };
    window.__obriumDiscussContext = discussPayload;
    if (typeof window.__obriumPrimeDiscussContext === 'function') {
      window.__obriumPrimeDiscussContext(discussPayload);
    }
    if (window.obriumServerStatus === 'Offline') {
      window.__obriumForceLocalConversation = true;
    }
  }
  if (isCriticalInsight(row)) {
    rememberFastAlertResponse();
  }
  if (typeof window.switchView === 'function') {
    window.switchView('talk');
  }
  const go = () => {
    const tc = window.__obriumTalkComponent;
    if (!tc || !tc.chatInput) return;
    if (window.obriumServerStatus === 'Offline' && typeof tc.addSystemMessage === 'function') {
      tc.addSystemMessage(
        '[ LOCAL MODE ]',
        `Running local conversation simulator for ${name}. I will reason from your on-device ledger.`,
        false,
        false
      );
    }
    tc.chatInput.value = prompt;
    tc.autoResizeTextarea && tc.autoResizeTextarea();
    if (typeof tc.sendMessage === 'function') tc.sendMessage();
  };
  setTimeout(go, 280);
}

function removeLegacyMissionControl(feedView) {
  feedView.querySelector('#feedMissionControl')?.remove();
}

/** Legacy hook (system integrity strip removed from UI). Kept for call sites. */
export function updateSystemIntegrityDots() {}

function asNumU(...values) {
  for (const v of values) {
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sanitizeMetricCell(v) {
  const s = String(v ?? '').trim();
  if (!s || /^null$/i.test(s) || /^\[----\]$|^n\/a$|^na$/i.test(s)) return UNIVERSAL_AGENT_SEARCHING;
  return s;
}

/** Human-readable collapsed card titles — aligned with STARTER_FOCUS_AREAS. */
const TRACK_DISPLAY_TITLES = {
  sleep: 'Sleep & Recovery',
  energy: 'Longevity Protocols',
  heart: 'Cardiovascular Health',
  activity: 'Movement & Load',
  move: 'Movement & Load',
  nutrition: 'Nutrition & Metabolism',
  labs: 'Labs & Biomarkers',
  brain: 'Stress & Nervous System',
  eyes: 'Skin & Environment',
  lung: 'Longevity Protocols',
  blood: 'Labs & Biomarkers',
  general: 'System Channel',
};

/**
 * Prefer the Focus Area catalog name over legacy track titles.
 * @param {string} displayName
 * @param {AgentLifeTrackId} trackId
 * @param {object|null|undefined} uaRow
 */
function resolveFocusAreaCardTitle(displayName, trackId, uaRow) {
  const byId = getFocusAreaById(uaRow?.trackingLifeAreaId);
  if (byId?.name) return byId.name;
  const byName = getFocusAreaByName(displayName);
  if (byName?.name) return byName.name;
  // Strip legacy "NAME_ANALYZER" / "NAME_MONITOR" suffixes from older deploys.
  const cleaned = String(displayName || '')
    .replace(/_(MONITOR|ANALYZER|ASSISTANT|DATA\s*LOGGER)\b/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  const byCleaned = getFocusAreaByName(cleaned);
  if (byCleaned?.name) return byCleaned.name;
  return (
    TRACK_DISPLAY_TITLES[/** @type {keyof typeof TRACK_DISPLAY_TITLES} */ (trackId)] ||
    cleaned ||
    'System Channel'
  );
}

/**
 * @param {string} fullCode e.g. AGT-01-SLEEP
 */
function shortAgentCode(fullCode) {
  const m = String(fullCode || '').match(/^(AGT-\d+)/i);
  if (m) return m[1].toUpperCase();
  const parts = String(fullCode || '').split('-').filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}`.toUpperCase() : String(fullCode || 'AGT').slice(0, 10);
}

const TRACK_UNIVERSAL_META = {
  heart: {
    code: 'AGT-04-HEART',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 21.1l-1.2-1.1C6.1 15.9 3 13.1 3 9.6A4.6 4.6 0 0 1 7.6 5c1.7 0 3.3.8 4.4 2.1A5.7 5.7 0 0 1 16.4 5 4.6 4.6 0 0 1 21 9.6c0 3.5-3.1 6.3-7.8 10.4L12 21.1z"/></svg>',
  },
  sleep: {
    code: 'AGT-01-SLEEP',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  },
  nutrition: {
    code: 'AGT-02-NUTRITION',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M17 8C8 10 6 20 6 20s4-2 8-4c0-3 1-6 3-8zm-1-5c2 0 4 2 4 4 0 1.5-.6 2.9-1.6 4C14 6 10 6 7 8c2-4 6-5 9-5z"/></svg>',
  },
  activity: {
    code: 'AGT-03-ACTIVITY',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>',
  },
  energy: {
    code: 'AGT-05-ENERGY',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M4 14h4v6H4v-6zm6-10h4v16h-4V4zm6 6h4v10h-4V10z"/></svg>',
  },
  labs: {
    code: 'AGT-06-LABS',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M9 3h6v1h-1.2L18 15a3 3 0 0 1-6 0l-1.8-11H10V3H9zm3 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM6 20h12v2H6v-2z"/></svg>',
  },
  brain: {
    code: 'AGT-02-BRAIN',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 4C9.5 4 7.5 6 7.5 8.5c0 1.1.4 2.1 1.2 2.9-.5.6-.8 1.3-.8 2.1 0 1.66 1.34 3 3 3h.2c.5 1.38 1.8 2.4 3.2 2.4s2.7-1.02 3.2-2.4h.2c1.66 0 3-1.34 3-3 0-.8-.3-1.5-.8-2.1.8-.8 1.2-1.8 1.2-2.9 0-2.5-2-4.5-4.5-4.5zm0 2c1.38 0 2.5 1.12 2.5 2.5 0 .9-.4 1.7-1 2.2V16h-3v-5.3c-.6-.5-1-1.3-1-2.2C9.5 7.12 10.62 6 12 6z"/></svg>',
  },
  eyes: {
    code: 'AGT-08-EYES',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="8.2" cy="12" r="2.35" fill="currentColor"/><circle cx="15.8" cy="12" r="2.35" fill="currentColor"/></svg>',
  },
  lung: {
    code: 'AGT-09-LUNG',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M11 2h2v7.2c.8.2 1.5.7 2 1.4l1.8-2.3c1.2-1.5 3.5-1.8 5-.7 1.4 1.1 1.8 3.2.9 4.9l-1.7 3.2a5.2 5.2 0 0 1-4.6 2.8H14v-6.8c0-1-.8-1.8-1.8-1.8H12c-1 0-1.8.8-1.8 1.8v6.8H7.6A5.2 5.2 0 0 1 3 15.7L1.3 12.5c-.9-1.7-.5-3.8.9-4.9 1.5-1.1 3.8-.8 5 .7L9 10.6c.5-.7 1.2-1.2 2-1.4V2Z"/></svg>',
  },
  blood: {
    code: 'AGT-10-BLOOD',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12 2.5c-.3 0-.6.2-.8.5-1.3 2-3.9 6-3.9 8.6 0 2.5 2 4.4 4.7 4.4s4.7-1.9 4.7-4.4c0-2.6-2.6-6.6-3.9-8.6-.2-.3-.5-.5-.8-.5z"/></svg>',
  },
  move: {
    code: 'AGT-11-MOVE',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="15" cy="7" r="2" fill="currentColor"/><path fill="currentColor" d="M9 19l1.5-4.5-2-1.5-2 2-1.5-1.5 3-2.5c.7-.5 1.7-.5 2.4 0l1.6 1 1.8-1.2 1 1.5-2.2 1.5c-.6.4-1.4.4-2 0l-.2-.2L9.5 19H9zm7-.5-2-3 1-1 2 3-1 1z"/></svg>',
  },
  general: {
    code: 'AGT-00-GENERAL',
    icon: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>',
  },
};

/**
 * Technical data-quality score: coverage + recency + consistency/agreement.
 * This score does not describe whether the user's health is good or bad.
 */
function computeSignalConfidence(sd, expectedKeys = []) {
  if (!sd || typeof sd !== 'object') return 0;

  const telemetryKeys = Object.keys(sd).filter((key) =>
    sensorValueIsLiveTelemetry(key, sd[key])
  );
  const present = expectedKeys.filter((key) =>
    sensorValueIsLiveTelemetry(key, sd[key])
  ).length;
  const coverage = expectedKeys.length
    ? Math.min(50, (present / expectedKeys.length) * 50)
    : Math.min(50, (telemetryKeys.length / 4) * 50);

  const timestamp = pickFirstNonEmpty([
    sd.last_updated_at,
    sd.updated_at,
    sd.measured_at,
    sd.timestamp,
  ]);
  let recency = telemetryKeys.length ? 10 : 0;
  if (timestamp) {
    const ageMs = Date.now() - new Date(String(timestamp)).getTime();
    if (Number.isFinite(ageMs)) {
      if (ageMs <= 24 * 60 * 60 * 1000) recency = 25;
      else if (ageMs <= 7 * 24 * 60 * 60 * 1000) recency = 18;
      else if (ageMs <= 30 * 24 * 60 * 60 * 1000) recency = 10;
      else recency = 3;
    }
  }

  const contradictionCount =
    asNumU(sd.source_contradictions, sd.contradiction_count) ??
    (sd.has_contradictions === true ? 1 : 0);
  const consistencyPct = asNumU(
    sd.consistency_score_pct,
    sd.source_agreement_pct
  );
  const consistencyBase =
    consistencyPct != null
      ? Math.max(0, Math.min(25, (consistencyPct / 100) * 25))
      : telemetryKeys.length
        ? 20
        : 0;
  const consistency = Math.max(0, consistencyBase - contradictionCount * 8);

  return Math.round(Math.max(0, Math.min(100, coverage + recency + consistency)));
}

function heartVerdictState(hrv, baseline, restingHr) {
  if (hrv == null && restingHr == null) {
    return {
      text: UNIVERSAL_AGENT_SEARCHING,
      tone: /** @type {'searching'} */ ('searching'),
      insight: 'Awaiting stabilized biosignals before issuing a verdict.',
    };
  }
  if (hrv != null && baseline != null && hrv < baseline * 0.85) {
    return {
      text: 'CONDITION: RECOVERY REQUIRED',
      tone: /** @type {'alert'} */ ('alert'),
      insight: 'HRV is materially below baseline. Shift workload toward recovery.',
    };
  }
  return {
    text: 'CONDITION: OPTIMAL',
    tone: /** @type {'optimal'} */ ('optimal'),
    insight: 'Your resting heart rate is optimal. Workload is aligned for recovery.',
  };
}

function computeHeartSignalConfidence(sd) {
  const normalized = {
    ...sd,
    hrv_value: asNumU(sd.hrv_ms, sd.hrv),
    resting_hr_value: asNumU(
      sd.resting_hr_bpm,
      sd.resting_hr,
      sd.heart_rate_bpm
    ),
    steps_value: asNumU(sd.steps_total, sd.daily_steps),
    recovery_value: asNumU(
      sd.recovery_score_pct,
      sd.recovery_pct,
      sd.recovery,
      sd.sleep_efficiency_pct
    ),
  };
  return computeSignalConfidence(normalized, [
    'hrv_value',
    'resting_hr_value',
    'steps_value',
    'recovery_value',
  ]);
}

function universalCardToneExtras(zoneKey, critical, success, pr, row) {
  const extra = [];
  if (critical) extra.push('agent-report-card--critical');
  else if (pr.mod === 'new' && !row.done && !success) extra.push('agent-report-card--new');
  else if (pr.mod === 'done' || success) extra.push('agent-report-card--done');
  else extra.push(`agent-report-card--zone-${zoneKey}`);
  return extra;
}

/**
 * @param {{
 *   agent: string,
 *   row: Record<string, unknown>,
 *   trackId: string,
 *   uaRow: object|null|undefined,
 *   agentPaused: boolean,
 *   timeStr: string,
 *   timeIso: string,
 *   zoneKey: string,
 *   critical: boolean,
 *   success: boolean,
 *   pr: { mod: string, text: string },
 *   secondary: { kind: string, label: string },
 *   status: string,
 * }} p
 */
function buildUniversalCardProps(p) {
  const {
    agent,
    row,
    trackId,
    uaRow,
    agentPaused,
    timeStr,
    timeIso,
    zoneKey,
    critical,
    success,
    pr,
    secondary,
    status,
  } = p;
  const baseSd = uaRow?.sensor_data && typeof uaRow.sensor_data === 'object' ? uaRow.sensor_data : {};
  // Merge any FeedState live reading for this track (e.g. steps logged via Talk)
  // so Signal Confidence is computed from real values after a full card re-render.
  const liveSd = readFeedStateSensorOverlay(trackId, agent);
  const sd = { ...baseSd, ...liveSd };
  const prof = TRACK_SPECS[/** @type {keyof typeof TRACK_SPECS} */ (trackId)] || TRACK_SPECS.general;
  const signal = computeSignalState(agent, agentPaused);
  const meta =
    TRACK_UNIVERSAL_META[/** @type {keyof typeof TRACK_UNIVERSAL_META} */ (trackId)] || TRACK_UNIVERSAL_META.general;
  const phaseRaw = pickFirstNonEmpty([row.operational_phase, row.phase, row.ops_phase, 'OPERATIONAL']);
  const phase =
    String(phaseRaw || 'OPERATIONAL')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .slice(0, 28) || 'OPERATIONAL';
  const agentCode = shortAgentCode(meta.code);
  const agentTitle = resolveFocusAreaCardTitle(agent, trackId, uaRow);
  const expandedSecondary =
    secondary.kind === 'confirm'
      ? { kind: /** @type {'confirm'} */ ('confirm'), label: '[ CONFIRM ]' }
      : { kind: /** @type {'adjust'} */ ('adjust'), label: '[ ADJUST PROTOCOL ]' };
  const extraCardClasses = universalCardToneExtras(zoneKey, critical, success, pr, row);
  const storedStage = clampMaturityStage(uaRow?.maturity_stage ?? uaRow?.maturityStage ?? 0);
  const focusAreaId = String(uaRow?.trackingLifeAreaId || '').trim() || null;
  const profileNow = profileState.get();
  const maturityStage = displayMaturityStage(storedStage, profileNow, focusAreaId);
  const calibrationText = calibrationLine(profileNow, focusAreaId);
  const payoff = payoffDetail(profileNow, focusAreaId);
  const payoffContextEntry = payoff
    ? getEntries({ focusArea: focusAreaId, field: payoff.field, profile: profileNow })
    : null;
  const payoffEchoText = payoff?.echo || '';
  const payoffContext = payoffContextEntry?.text || '';

  /**
   * Single-slot content: Personal Insight (if eligible) else Grounded Science.
   * Never empty / never "upload a document" prompts.
   */
  function resolveSlotContent(sensorData, ledgerStatus) {
    return resolveFeedContentSlot({
      maturityStage,
      focusAreaId,
      trackId,
      displayName: agent,
      sensorData,
      ledgerStatus,
    });
  }

  if (trackId === 'heart') {
    const hrv = asNumU(sd.hrv_ms, sd.hrv, sd.hrv_today_ms);
    const baseline = asNumU(sd.hrv_baseline_ms, sd.baseline_hrv_ms, sd.hrv_baseline, sd.hrv_baseline_today_ms);
    const restingHr = asNumU(sd.resting_hr_bpm, sd.resting_hr, sd.heart_rate_bpm);
    const v = heartVerdictState(hrv, baseline, restingHr);
    const signalConfidencePct =
      asNumU(
        sd.signal_confidence_pct,
        sd.signalConfidencePct,
        sd.signal_integrity_pct,
        row.signalConfidencePct,
        row.signal_confidence_pct,
        row.integrity
      ) ?? computeHeartSignalConfidence(sd);
    const signalActive =
      !agentPaused &&
      (hrv != null ||
        restingHr != null ||
        asNumU(sd.steps_total, sd.daily_steps) != null ||
        asNumU(sd.recovery_score_pct, sd.recovery_pct) != null);
    const contentSlot = resolveSlotContent(sd, pickFirstNonEmpty([status, v.insight]));
    const confidenceNudge = buildSignalConfidenceNudge(signalConfidencePct);
    // Stage 0 / grounded science: never leave the card in SEARCHING/AWAITING empty state.
    let verdictText = v.text;
    let verdictTone = v.tone;
    if (contentSlot.kind === 'grounded_science' && (verdictTone === 'searching' || maturityStage === 0)) {
      verdictText = contentSlot.noFact ? 'BASELINE' : 'GROUNDED SCIENCE';
      verdictTone = 'optimal';
    } else if (contentSlot.kind === 'personal_insight' && verdictTone === 'searching') {
      verdictText = 'PERSONAL INSIGHT';
      verdictTone = critical ? 'alert' : 'optimal';
    }
    return {
      trackId,
      agentName: agent,
      agentCode,
      agentTitle,
      identityIconSvg: meta.icon,
      verdictText,
      verdictTone,
      signalActive,
      signalConfidencePct,
      integrityPct: signalConfidencePct, // Deprecated alias.
      maturityStage,
      calibrationText,
      focusAreaId,
      storedStage,
      payoffEchoText,
      payoffContext,
      timeStr,
      timeIso,
      agentPaused,
      insightText: contentSlot.body,
      contentSlot,
      confidenceNudge,
      systemLogText: `SYS LOG: stack online; channel ${signalActive ? 'nominal' : 'probing'}; kernel ${agentPaused ? 'paused' : 'run'}.`,
      sensorData: sd,
      expandedSecondary,
      extraCardClasses,
    };
  }

  const merged = uaRow?.sensor_data ? mergeMetricsWithSensor(trackId, prof.metrics, uaRow.sensor_data) : prof.metrics;
  const hasData =
    sensorDataHasLiveTelemetry(sd) || merged.some((r) => sanitizeMetricCell(r.v) !== UNIVERSAL_AGENT_SEARCHING);

  let verdictText;
  let verdictTone;
  if (critical) {
    verdictText = 'CONDITION: INTERVENTION REQUIRED';
    verdictTone = 'alert';
  } else if (!hasData) {
    // Do not render empty / searching copy — slot resolver supplies Grounded Science.
    verdictText = 'GROUNDED SCIENCE';
    verdictTone = 'optimal';
  } else {
    verdictText = 'CONDITION: OPTIMAL';
    verdictTone = 'optimal';
  }

  const signalConfidencePct =
    asNumU(
      sd.signal_confidence_pct,
      sd.signalConfidencePct,
      sd.signal_integrity_pct,
      row.signalConfidencePct,
      row.signal_confidence_pct,
      row.integrity
    ) ?? computeSignalConfidence(sd);
  const signalActive = !agentPaused && (signal.active || critical);
  const contentSlot = resolveSlotContent(sd, status);
  const confidenceNudge = buildSignalConfidenceNudge(signalConfidencePct);
  if (contentSlot.kind === 'personal_insight') {
    verdictText = critical ? 'CONDITION: INTERVENTION REQUIRED' : 'PERSONAL INSIGHT';
    verdictTone = critical ? 'alert' : 'optimal';
  } else if (contentSlot.kind === 'grounded_science') {
    verdictText = contentSlot.noFact ? 'BASELINE' : 'GROUNDED SCIENCE';
    verdictTone = critical ? 'alert' : 'optimal';
  }

  return {
    trackId,
    agentName: agent,
    agentCode,
    agentTitle,
    identityIconSvg: meta.icon,
    verdictText,
    verdictTone,
    signalActive,
    signalConfidencePct,
    integrityPct: signalConfidencePct, // Deprecated alias.
    maturityStage,
    calibrationText,
    focusAreaId,
    storedStage,
    payoffEchoText,
    payoffContext,
    timeStr,
    timeIso,
    agentPaused,
    insightText: contentSlot.body,
    contentSlot,
    confidenceNudge,
    systemLogText: `SYS LOG: runtime synchronized; observer ${signal.active ? 'locked' : 'scanning'}; module ${agentPaused ? 'halt' : 'live'}.`,
    sensorData: sd,
    expandedSecondary,
    extraCardClasses,
  };
}

/**
 * @param {HTMLElement} el
 * @param {{
 *   agent: string,
 *   row: Record<string, unknown>,
 *   trackId: string,
 *   secondary: { kind: string, label: string },
 *   status: string,
 *   metricsLive: Array<{ k: string, v: string }>,
 *   summaryLine: string,
 *   logicText: string,
 *   scienceMeta: { scienceText: string, reviewHref: string, protocolTag: string },
 * }} ctx
 */
function wireUniversalAgentCard(el, ctx) {
  const { agent, row, trackId, secondary, status, metricsLive, summaryLine, logicText, scienceMeta } = ctx;
  const discussContext = {
    trackId,
    summaryLine,
    logicText,
    scienceText: scienceMeta.scienceText,
    reviewHref: scienceMeta.reviewHref,
    metrics: (metricsLive || []).slice(0, 3).map((m) => ({ k: String(m?.k || ''), v: String(m?.v || '') })),
  };

  el.querySelectorAll('[data-uac-action="discuss"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openTalkDiscussAgent(agent, row, discussContext);
    });
  });

  el.querySelectorAll('[data-uac-action="confidence-talk"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openTalkDiscussAgent(agent, row, {
        ...discussContext,
        summaryLine: 'Signal Confidence is low — helping add context for this Focus Area.',
      });
    });
  });

  el.querySelectorAll('[data-uac-action="remind"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      addMessage({
        type: 'feed',
        subtype: 'agent-reminder',
        text: `Follow up with ${agent}: ${status}`,
      });
      if (typeof window.updateUnreadBadges === 'function') window.updateUnreadBadges();
    });
  });

  el.querySelector('[data-uac-action="adjust"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof window.switchView === 'function') window.switchView('talk');
    setTimeout(() => {
      const tc = window.__obriumTalkComponent;
      if (!tc?.chatInput) return;
      tc.chatInput.value = `@${agent}, adjust my protocol based on the latest ${trackId} telemetry.`;
      tc.autoResizeTextarea && tc.autoResizeTextarea();
    }, 240);
  });

  el.querySelector('[data-uac-action="confirm"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    writeAgentInsight(agent, status, { done: true });
    renderAgentReportsSection();
    updateSystemIntegrityDots();
  });
}

/**
 * @param {HTMLElement} grid
 * @param {object} row
 * @param {Set<string>} prevKeys
 */
function renderAgentPanelCard(grid, row, prevKeys) {
  const agent = String(row.agent).trim();
  const status = String(row.status).trim();
  const { zoneKey } = zoneFromAgentName(agent);
  const critical = isCriticalInsight(row);
  const success = !critical && isSuccessInsight(row);
  const pr = priorityLabelForRow(row);
  const secondary = secondaryActionForRow(row);
  const timeStr = formatPanelTime(row.updatedAt);
  const timeIso = row.updatedAt ? String(row.updatedAt) : '';

  const trackId = resolveAgentTrackId(agent);
  const uaRow = findUserAgentByDisplayName(agent);
  const agentPaused = Boolean(row.paused || uaRow?.agentStatus === 'Paused' || uaRow?.active === false);
  const prof = TRACK_SPECS[/** @type {keyof typeof TRACK_SPECS} */ (trackId)] || TRACK_SPECS.general;
  const signal = computeSignalState(agent, agentPaused);
  const metricsLive = uaRow?.sensor_data
    ? mergeMetricsWithSensor(trackId, prof.metrics, uaRow.sensor_data)
    : prof.metrics;
  const summaryLine = buildCollapsedMetricsSummary(signal);
  const logicText = buildLogicCopy(status, signal, metricsLive, row);
  const scienceMeta = buildScienceMeta(row, trackId);

  const props = buildUniversalCardProps({
    agent,
    row,
    trackId,
    uaRow,
    agentPaused,
    timeStr,
    timeIso,
    zoneKey,
    critical,
    success,
    pr,
    secondary,
    status,
  });
  const el = createUniversalAgentCard(props);
  wireUniversalAgentCard(el, {
    agent,
    row,
    trackId,
    secondary,
    status,
    metricsLive,
    summaryLine,
    logicText,
    scienceMeta,
  });
  el.style.setProperty('--agent-accent', prof.accent);

  const key = insightCardKey(row);
  if (!prevKeys.has(key)) {
    el.classList.add('agent-report-card--enter');
    el.addEventListener('animationend', () => el.classList.remove('agent-report-card--enter'), { once: true });
  }

  if (uaRow?.id) {
    el.dataset.agentId = String(uaRow.id);
  }

  bindAgentCardControlMenu(el, agent);
  grid.appendChild(el);
}

/**
 * Feed card [ ··· ] menu: pause-start toggle and delete.
 *
 * @param {HTMLElement} cardEl
 * @param {string} agent
 */
function bindAgentCardControlMenu(cardEl, agent) {
  ensureAgentCardMenuGlobalClose();

  const trigger = cardEl.querySelector('.agent-card-menu-trigger');
  const menu = cardEl.querySelector('.agent-card-menu');
  if (!trigger || !menu) return;

  const statusBtn = menu.querySelector('[data-agent-menu="status"]');
  const statusText = statusBtn?.querySelector('.agent-card-menu__text--status');

  function readStandby() {
    const ledger = getCommonLedger();
    const r = ledger.agent_insights.find((x) => x && String(x.agent).trim() === agent);
    if (r?.paused) return true;
    const ua = findUserAgentByDisplayName(agent);
    return Boolean(ua && (ua.agentStatus === 'Paused' || ua.active === false));
  }

  function syncStatusMenuLabels() {
    const standby = readStandby();
    if (statusText) statusText.textContent = standby ? 'Start focus area' : 'Pause focus area';
  }

  function setOpen(open) {
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.classList.toggle('is-open', open);
    menu.hidden = !open;
    if (open) syncStatusMenuLabels();
  }

  function close() {
    setOpen(false);
    if (_closeOpenAgentCardMenu === close) _closeOpenAgentCardMenu = null;
  }

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const willOpen = !menu.classList.contains('is-open');
    closeAnyOpenAgentCardMenu();
    if (willOpen) {
      _closeOpenAgentCardMenu = close;
      setOpen(true);
    }
  });

  menu.addEventListener('click', (e) => e.stopPropagation());

  menu.querySelector('[data-agent-menu="delete"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!window.confirm(`Delete "${agent}" from your feed?`)) return;
    closeAnyOpenAgentCardMenu();
    cardEl.classList.add('agent-report-card--dismissing');
    let completed = false;
    const done = () => {
      if (completed) return;
      completed = true;
      removeAgentInsightsForAgent(agent);
      const ua = findUserAgentByDisplayName(agent);
      if (ua?.id) deleteUserAgent(ua.id);
      renderAgentReportsSection();
      updateSystemIntegrityDots();
      if (typeof window.renderServices === 'function') window.renderServices();
    };
    cardEl.addEventListener('animationend', () => done(), { once: true });
    setTimeout(done, 480);
  });

  statusBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const nextStandby = !readStandby();
    setAgentInsightPaused(agent, nextStandby);
    setUserAgentStatusByDisplayName(agent, nextStandby ? 'Paused' : 'Active');
    closeAnyOpenAgentCardMenu();
    renderAgentReportsSection();
    updateSystemIntegrityDots();
    if (typeof window.renderServices === 'function') window.renderServices();
  });
}

function installDelegatedAddAgentListener() {
  if (typeof document === 'undefined') return;
  if (window.__obriumDelegatedAddAgentBound) return;
  window.__obriumDelegatedAddAgentBound = true;

  // Expose for manual console testing / emergency fallback checks.
  window.openUltimateAgentCreatorModalAfterPurge = openUltimateAgentCreatorModalAfterPurge;

  function launchAgentDeployFlow() {
    console.log('>>> DELEGATED ACTION DETECTED: Deploy Agent');
    if (typeof window.openUltimateAgentCreatorModalAfterPurge === 'function') {
      console.log('>>> Launching Modal...');
      window.openUltimateAgentCreatorModalAfterPurge(refreshAfterAgentModal);
      return;
    }
    console.error('>>> ERROR: openUltimateAgentCreatorModalAfterPurge is NOT defined or NOT imported!');
    // Fallback to stable public entry.
    if (typeof openUltimateAgentCreatorModal === 'function') {
      openUltimateAgentCreatorModal(refreshAfterAgentModal);
    }
  }

  document.addEventListener('click', function(event) {
    const deployBtn = event.target.closest
      ? event.target.closest('.agent-feed-add-panel, .add-agent-button')
      : null;
    if (!deployBtn) return;
    event.preventDefault();
    launchAgentDeployFlow();
  });
}

/**
 * Adaptive agent feed: ledger rows as full panel cards; Add Agent is an end-of-list placeholder panel.
 */
export function renderAgentReportsSection() {
  const feedView = document.getElementById('feed-view');
  if (!feedView) return;

  removeLegacyMissionControl(feedView);
  feedView.querySelector('#protocolEngineSection')?.remove();

  const prevKeys = _prevAgentCardKeys;
  const nextKeys = new Set();

  const ledger = getCommonLedger();
  const raw = dedupeInsightsByFocusArea(filterRealInsightRows(ledger.agent_insights));
  raw.forEach((r) => nextKeys.add(insightCardKey(r)));

  const sorted = sortFeedRows(raw);
  const isDemoMode = getState().demo?.isDemoMode === true;

  let section = feedView.querySelector('#agentReportsSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'agentReportsSection';
    section.className = 'agent-reports-section agent-reports-section--cyber';
    section.setAttribute('aria-label', 'Adaptive agent feed');
    const stack = feedView.querySelector('#feedCoreStack');
    if (stack && stack.parentNode === feedView) {
      feedView.insertBefore(section, stack.nextSibling);
    } else {
      feedView.appendChild(section);
    }
  }

  section.innerHTML = `
    <div class="agent-reports-panel">
      <div class="agent-reports-header agent-reports-header--cyber">
        <h3 class="agent-reports-title agent-reports-title--cyber">Adaptive agent feed</h3>
        <span class="agent-reports-updated" data-ledger-updated></span>
      </div>
      <div class="agent-reports-list" id="agentReportsList">
        <div class="agent-reports-grid agent-reports-grid--panels" id="agentReportsGrid"></div>
      </div>
      <button type="button" class="agent-feed-add-panel add-agent-button" id="agentFeedAddBtn" aria-label="Add new focus area">
        <span class="agent-feed-add-panel__label">+ Add Focus</span>
      </button>
    </div>
  `;

  const grid = section.querySelector('#agentReportsGrid');
  if (grid) {
    sorted.forEach((row) => renderAgentPanelCard(grid, row, prevKeys));
  }

  const updatedEl = section.querySelector('[data-ledger-updated]');
  if (updatedEl && ledger.last_update) {
    try {
      const d = new Date(ledger.last_update);
      updatedEl.textContent = `Updated ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (_) {
      updatedEl.textContent = '';
    }
  }
  if (isDemoMode && updatedEl) {
    updatedEl.textContent = (updatedEl.textContent ? `${updatedEl.textContent} · ` : '') + 'DEMO';
  }

  _prevAgentCardKeys = nextKeys;
  replayLatestBiometricPayloadToAgentCards();
  updateSystemIntegrityDots();
  syncFeedStateToDom();
}

/**
 * @param {string} displayName
 */
function pulseAgentCard(displayName) {
  const want = String(displayName || '').trim();
  if (!want) return;
  requestAnimationFrame(() => {
    document.querySelectorAll('.agent-report-card[data-agent-name]').forEach((el) => {
      if (el.dataset.agentName !== want) return;
      el.classList.remove('agent-report-card--data-pulse');
      // reflow so repeated pulses animate
      void el.offsetWidth;
      el.classList.add('agent-report-card--data-pulse');
      el.addEventListener(
        'animationend',
        () => {
          el.classList.remove('agent-report-card--data-pulse');
        },
        { once: true }
      );
    });
  });
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function asRealtimeMetric(value) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} detail
 * @param {string} key
 * @returns {number|null}
 */
function extractBiometricMetric(detail, key) {
  if (!detail || typeof detail !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (detail);
  const metrics = row.metrics && typeof row.metrics === 'object' ? /** @type {Record<string, unknown>} */ (row.metrics) : null;
  return asRealtimeMetric(metrics?.[key] ?? row[key]);
}

/**
 * @param {Element} card
 * @param {'optimal'|'alert'|'searching'} tone
 */
function setRealtimeSignalPillTone(card, tone) {
  const pillEl = card.querySelector('[data-uac-status-pill]');
  if (!pillEl) return;
  pillEl.classList.remove(
    'heart-agent-module__signal-pill--optimal',
    'heart-agent-module__signal-pill--alert',
    'heart-agent-module__signal-pill--searching',
  );
  const safe =
    tone === 'alert' || tone === 'searching' || tone === 'optimal' ? tone : 'optimal';
  pillEl.classList.add(`heart-agent-module__signal-pill--${safe}`);
}

/**
 * @param {Record<string, unknown>} detail
 */
function formatCollapsedStatusPillLabel(detail) {
  const statusRaw = String(detail.status ?? 'OPTIMAL')
    .trim()
    .replace(/^STATUS:\s*/i, '')
    .toUpperCase();
  const status = statusRaw || 'OPTIMAL';
  const value = detail.value ?? detail.primaryValue;
  if (value == null || value === '') return status;
  const unit = detail.unit != null ? String(detail.unit).trim() : '';
  const valueStr = String(value);
  if (unit === 'h') return `${status} | ${valueStr} h`;
  if (unit) return `${status} | ${valueStr} ${unit}`;
  return `${status} | ${valueStr}`;
}

/**
 * @param {string} statusLabel
 */
function signalPillToneFromStatusLabel(statusLabel) {
  const s = String(statusLabel || '').toUpperCase();
  if (s.includes('AWAIT') || s.includes('SEARCH') || s.includes('PENDING')) return 'searching';
  if (s.includes('ALERT') || s.includes('CRITICAL') || s.includes('INTERVENTION')) return 'alert';
  return 'optimal';
}

/**
 * @param {HTMLElement} card
 * @param {Record<string, unknown>} detail
 */
function applyCollapsedStatusPill(card, detail) {
  const pillEl = card.querySelector('[data-uac-status-pill]');
  const textEl = card.querySelector('[data-uac-status-pill-text]');
  console.log('Updating node:', pillEl);
  console.log('Updating node:', textEl);
  if (!(pillEl instanceof HTMLElement) || !(textEl instanceof HTMLElement)) {
    throw new Error('DOM Node missing. Check CSS class names.');
  }

  const label = formatCollapsedStatusPillLabel(detail);
  textEl.textContent = label;
  pillEl.setAttribute('aria-label', `Agent status: ${label}`);

  const tone = signalPillToneFromStatusLabel(label.split('|')[0].trim());
  setRealtimeSignalPillTone(card, tone);

  if (detail.statusColor != null && String(detail.statusColor).trim()) {
    pillEl.style.setProperty('--uac-pill-accent', String(detail.statusColor));
  }

  forceDomRepaint(pillEl);
  forceDomRepaint(textEl);
}

/**
 * @param {{ trackId: string, statusText: string, isCritical: boolean }} cfg
 */
function applyRealtimeBiometricToCards(cfg) {
  const cards = document.querySelectorAll(`.agent-report-card[data-track-id="${cfg.trackId}"]`);
  if (!cards.length) return;
  cards.forEach((card) => {
    const badge = card.querySelector('.heart-agent-module__status-pill');
    if (badge) badge.textContent = '[LINK SENSOR: ONLINE]';
    const textEl = card.querySelector('[data-uac-status-pill-text]');
    if (textEl) {
      const short = cfg.isCritical ? 'ALERT' : 'OPTIMAL';
      textEl.textContent = short;
    }
    setRealtimeSignalPillTone(card, cfg.isCritical ? 'alert' : 'optimal');
    card.classList.remove('heart-agent-module-card--alert', 'heart-agent-module-card--optimal');
    card.classList.add(cfg.isCritical ? 'heart-agent-module-card--alert' : 'heart-agent-module-card--optimal');
    const displayName = String((/** @type {HTMLElement} */ (card)).dataset.agentName || '').trim();
    if (displayName) pulseAgentCard(displayName);
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
function applyRealtimeBiometricPayload(payload) {
  const sleepHours = extractBiometricMetric(payload, 'sleep');
  const stepsCount = extractBiometricMetric(payload, 'steps');

  if (sleepHours != null) {
    const roundedSleep = Math.round(sleepHours * 10) / 10;
    applyRealtimeBiometricToCards({
      trackId: 'sleep',
      statusText: `STATUS: SLEEP DETECTED: ${roundedSleep} HR`,
      isCritical: roundedSleep < 6,
    });
  }

  if (stepsCount != null) {
    const roundedSteps = Math.round(stepsCount);
    applyRealtimeBiometricToCards({
      trackId: 'move',
      statusText: `STATUS: LOAD DETECTED: ${roundedSteps} STEPS`,
      isCritical: roundedSteps < 5000,
    });
  }
}

function replayLatestBiometricPayloadToAgentCards() {
  if (!_latestBiometricsPayload) return;
  applyRealtimeBiometricPayload(_latestBiometricsPayload);
}

function installBiometricsRealtimeSubscriber() {
  if (typeof window === 'undefined') return;
  if (window.__obriumBiometricsSubscriberBound) return;
  window.__obriumBiometricsSubscriberBound = true;
  window.addEventListener('biometricsUpdated', (ev) => {
    const detail = /** @type {CustomEvent} */ (ev).detail;
    if (!detail || typeof detail !== 'object') return;
    _latestBiometricsPayload = /** @type {Record<string, unknown>} */ (detail);
    applyRealtimeBiometricPayload(_latestBiometricsPayload);
  });
}

/** Local-mode / console test ids → feed `data-track-id`. */
const OBRIUM_AGENT_ID_ALIASES = {
  'AGT-01-SLEEP': 'sleep',
  'AGT-11-MOVE': 'move',
};

/**
 * Dynamic fallback agents (Talk local mode / persisted state without ledger row).
 * @type {Record<string, { trackId: AgentLifeTrackId, agentName: string, agentCode: string, agentTitle: string }>}
 */
const MOCK_AGENT_REGISTRY = {
  'AGT-01-SLEEP': {
    trackId: 'sleep',
    agentName: 'Sleep & Recovery',
    agentCode: 'AGT-01',
    agentTitle: 'Sleep & Recovery',
  },
  'AGT-11-MOVE': {
    trackId: 'move',
    agentName: 'Movement & Load',
    agentCode: 'AGT-11',
    agentTitle: 'Movement & Load',
  },
};

let _feedStateHydrateQueued = false;

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseProgressPercent(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/%/g, '').trim());
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : null;
}

/**
 * @param {string} raw
 */
function cssAttrEscape(raw) {
  const s = String(raw ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Resolve feed card wrapper for `event.detail.agentId` (user-agent id, display name, or track id).
 * @param {string} agentId
 * @returns {HTMLElement|null}
 */
/**
 * @returns {HTMLElement|null}
 */
function getFeedGridContainer() {
  return (
    document.getElementById('feed-container') ||
    document.getElementById('agentReportsGrid') ||
    document.querySelector('#feed-view #agentReportsGrid') ||
    document.querySelector('.agent-reports-grid')
  );
}

/**
 * @param {string} agentId
 * @returns {AgentLifeTrackId|null}
 */
function resolveTrackIdFromAgentId(agentId) {
  const id = String(agentId || '').trim().toUpperCase();
  const alias = OBRIUM_AGENT_ID_ALIASES[id];
  if (alias) return /** @type {AgentLifeTrackId} */ (alias);
  const reg = MOCK_AGENT_REGISTRY[id];
  if (reg?.trackId) return reg.trackId;
  const lower = String(agentId || '').trim().toLowerCase();
  if (lower in TRACK_SPECS) return /** @type {AgentLifeTrackId} */ (lower);
  return null;
}

/**
 * Pull live FeedState readings (Talk / biometrics) into sensor_data for confidence calc.
 * @param {string} trackId
 * @param {string} displayName
 * @returns {Record<string, unknown>}
 */
function readFeedStateSensorOverlay(trackId, displayName) {
  try {
    const state = FeedState.load();
    const agents = state.agents || {};
    const wantName = String(displayName || '').trim().toLowerCase();
    const wantTrack = String(trackId || '').trim().toLowerCase();
    for (const [id, payload] of Object.entries(agents)) {
      if (!payload || typeof payload !== 'object') continue;
      const tid = resolveTrackIdFromAgentId(id);
      const nameMatch =
        wantName &&
        String(payload.agentName || payload.agentTitle || '')
          .trim()
          .toLowerCase() === wantName;
      const trackMatch = tid && String(tid).toLowerCase() === wantTrack;
      if (!nameMatch && !trackMatch) continue;
      const fromDetail = buildSensorDataFromDetail(
        /** @type {AgentLifeTrackId} */ (tid || wantTrack || 'general'),
        /** @type {Record<string, unknown>} */ (payload)
      );
      if (Object.keys(fromDetail).length) return fromDetail;
    }
  } catch (_) {}
  return {};
}

/**
 * @param {AgentLifeTrackId} trackId
 * @param {Record<string, unknown>} detail
 */
function buildSensorDataFromDetail(trackId, detail) {
  const value = detail.value ?? detail.primaryValue;
  if (value == null || value === '') return {};
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return {};
  const ts = new Date().toISOString();
  if (trackId === 'sleep' || trackId === 'energy') {
    return { sleep_hours_total: n, sleep_h: n, last_updated_at: ts };
  }
  if (trackId === 'move' || trackId === 'activity' || trackId === 'heart') {
    return { steps_total: Math.round(n), daily_steps: Math.round(n), last_updated_at: ts };
  }
  return { metric_value: n, last_updated_at: ts };
}

/**
 * @param {string} agentId
 * @param {Record<string, unknown>} detail
 * @returns {HTMLElement|null}
 */
function instantiateDynamicAgentCard(agentId, detail) {
  const id = String(agentId || '').trim().toUpperCase();
  const profile = MOCK_AGENT_REGISTRY[id];
  if (!profile) {
    console.warn('[Obrium:UpdateAgent] No registry profile for dynamic card:', agentId);
    return null;
  }

  const trackId = profile.trackId;
  const meta =
    TRACK_UNIVERSAL_META[/** @type {keyof typeof TRACK_UNIVERSAL_META} */ (trackId)] ||
    TRACK_UNIVERSAL_META.general;
  const sensorData = {
    ...(buildSensorDataFromDetail(trackId, detail) || {}),
  };
  const signalConfidencePct =
    parseProgressPercent(
      detail.signalConfidencePct ??
        detail.signal_confidence_pct ??
        detail.integrityPct ??
        detail.progressPct
    ) ?? 85;
  const now = new Date();
  const maturityStage = clampMaturityStage(detail.maturity_stage ?? detail.maturityStage ?? 0);
  const contentSlot = resolveFeedContentSlot({
    maturityStage,
    focusAreaId: detail.trackingLifeAreaId || detail.focusAreaId || null,
    trackId,
    displayName: profile.agentName,
    sensorData,
    ledgerStatus: String(detail.caption || detail.status || ''),
  });
  const confidenceNudge = buildSignalConfidenceNudge(signalConfidencePct);

  const el = createUniversalAgentCard({
    trackId,
    agentName: profile.agentName,
    agentCode: profile.agentCode,
    agentTitle: profile.agentTitle,
    identityIconSvg: meta.icon,
    verdictText: contentSlot.kind === 'personal_insight' ? 'PERSONAL INSIGHT' : (contentSlot.noFact ? 'BASELINE' : 'GROUNDED SCIENCE'),
    verdictTone: 'optimal',
    signalActive: true,
    signalConfidencePct,
    integrityPct: signalConfidencePct, // Deprecated alias.
    maturityStage,
    calibrationText: '',
    focusAreaId: detail.trackingLifeAreaId || detail.focusAreaId || null,
    storedStage: maturityStage,
    payoffEchoText: '',
    payoffContext: '',
    timeStr: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timeIso: now.toISOString(),
    agentPaused: false,
    insightText: contentSlot.body,
    contentSlot,
    confidenceNudge,
    systemLogText: '',
    sensorData,
    expandedSecondary: { kind: 'adjust', label: '[ ADJUST PROTOCOL ]' },
    extraCardClasses: ['agent-report-card--dynamic'],
  });

  el.dataset.feedAgentId = id;
  el.dataset.agentId = id;
  el.dataset.uacDynamic = 'true';

  wireUniversalAgentCard(el, {
    agent: profile.agentName,
    row: {
      agent: profile.agentName,
      status: String(detail.caption || 'Local feed state'),
      updatedAt: now.toISOString(),
    },
    trackId,
    secondary: { kind: 'adjust', label: '[ ADJUST PROTOCOL ]' },
    status: String(detail.status || 'OPTIMAL'),
    metricsLive: [],
    summaryLine: '',
    logicText: '',
    scienceMeta: { scienceText: '', reviewHref: '', protocolTag: '' },
  });
  bindAgentCardControlMenu(el, profile.agentName);
  return el;
}

/**
 * Idempotent: returns existing card or creates exactly one dynamic card per agentId.
 * @param {string} agentId
 * @param {Record<string, unknown>} detail
 * @returns {HTMLElement|null}
 */
function ensureAgentCardInDom(agentId, detail) {
  const id = String(agentId || '').trim();
  if (!id) return null;

  const existing = findAgentCardWrapper(id);
  if (existing instanceof HTMLElement) return existing;

  const grid = getFeedGridContainer();
  if (!(grid instanceof HTMLElement)) return null;

  const esc = cssAttrEscape(id);
  const dupDynamic = grid.querySelector(`.agent-report-card[data-feed-agent-id="${esc}"]`);
  if (dupDynamic instanceof HTMLElement) return dupDynamic;

  const trackId = resolveTrackIdFromAgentId(id);
  if (trackId) {
    const ledgerCard = grid.querySelector(
      `.agent-report-card[data-track-id="${cssAttrEscape(trackId)}"]:not([data-uac-dynamic="true"])`,
    );
    if (ledgerCard instanceof HTMLElement) return ledgerCard;
  }

  const created = instantiateDynamicAgentCard(id, detail);
  if (!(created instanceof HTMLElement)) return null;

  grid.appendChild(created);
  return created;
}

/**
 * @param {string} agentId
 * @param {Record<string, unknown>} detail
 * @param {{ persist?: boolean }} [opts]
 * @returns {HTMLElement|null}
 */
function applyAgentUpdateToDom(agentId, detail, opts = {}) {
  const persist = opts.persist !== false;
  const id = String(agentId || '').trim();
  if (!id) return null;

  if (persist) FeedState.upsertAgent(id, detail);

  const card = ensureAgentCardInDom(id, detail);
  console.log('Target agent found: ', Boolean(card));
  if (!(card instanceof HTMLElement)) {
    console.warn('[Obrium:UpdateAgent] No agent card in DOM for agentId:', id);
    return null;
  }

  try {
    applyAgentDashboardPatch(card, detail);
    console.log('Update successful');
  } catch (err) {
    console.error('[Obrium:UpdateAgent] Patch failed:', err);
    throw err;
  }
  return card;
}

function syncFeedStateToDom() {
  const state = FeedState.load();
  const agents = state.agents || {};
  const ids = Object.keys(agents);
  if (!ids.length) return;

  if (!getFeedGridContainer()) return;

  console.log('[FeedState] Syncing', ids.length, 'agent(s) to DOM');
  for (const id of ids) {
    const payload = agents[id];
    if (!payload || typeof payload !== 'object') continue;
    applyAgentUpdateToDom(id, { ...payload, agentId: id }, { persist: false });
  }
}

function hydrateFeedStateFromStorage() {
  if (_feedStateHydrateQueued) return;
  _feedStateHydrateQueued = true;

  const run = () => {
    const state = FeedState.load();
    const ids = Object.keys(state.agents || {});
    if (!ids.length) return;

    console.log('[FeedState] Hydrating', ids.length, 'persisted agent(s)');
    for (const id of ids) {
      const payload = state.agents[id];
      if (!payload || typeof payload !== 'object') continue;
      try {
        document.dispatchEvent(
          new CustomEvent('Obrium:UpdateAgent', {
            detail: { ...payload, agentId: id, _fromFeedStorage: true },
          }),
        );
      } catch (err) {
        console.warn('[FeedState] dispatch failed for', id, err);
      }
    }
  };

  if (getFeedGridContainer()) {
    run();
    return;
  }

  const onReady = () => {
    if (getFeedGridContainer()) {
      document.removeEventListener('obrium:boot-ready', onReady);
      run();
    }
  };
  document.addEventListener('obrium:boot-ready', onReady, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        requestAnimationFrame(() => {
          if (getFeedGridContainer()) run();
        });
      },
      { once: true },
    );
  } else {
    requestAnimationFrame(() => {
      if (getFeedGridContainer()) run();
    });
  }
}

function findAgentCardWrapper(agentId) {
  const id = String(agentId || '').trim();
  if (!id) return null;

  const esc = cssAttrEscape(id);
  const byFeedId = document.querySelector(`.agent-report-card[data-feed-agent-id="${esc}"]`);
  if (byFeedId instanceof HTMLElement) return byFeedId;

  const byId = document.querySelector(`.agent-report-card[data-agent-id="${esc}"]`);
  if (byId instanceof HTMLElement) return byId;

  const ua = getUserAgentById(id);
  if (ua?.name) {
    const want = String(ua.name).trim();
    for (const el of document.querySelectorAll('.agent-report-card[data-agent-name]')) {
      if (el instanceof HTMLElement && String(el.dataset.agentName || '').trim() === want) {
        return el;
      }
    }
  }

  for (const el of document.querySelectorAll('.agent-report-card[data-agent-name]')) {
    if (el instanceof HTMLElement && String(el.dataset.agentName || '').trim() === id) {
      return el;
    }
  }

  const aliasTrack = OBRIUM_AGENT_ID_ALIASES[id.toUpperCase()];
  if (aliasTrack) {
    const byAlias = document.querySelector(
      `.agent-report-card[data-track-id="${cssAttrEscape(aliasTrack)}"]`,
    );
    if (byAlias instanceof HTMLElement) return byAlias;
  }

  const byTrack = document.querySelector(`.agent-report-card[data-track-id="${esc}"]`);
  if (byTrack instanceof HTMLElement) return byTrack;

  return null;
}

/**
 * Active read-only dashboard inside expanded details (never legacy hub markup).
 * @param {HTMLElement} card
 * @returns {HTMLElement|null}
 */
function getAgentDashboardRoot(card) {
  const details = card.querySelector('.heart-agent-module__details');
  if (!(details instanceof HTMLElement)) return null;

  const dashboard = details.querySelector('.uac-dashboard');
  if (dashboard instanceof HTMLElement) return dashboard;

  return null;
}

/**
 * @param {HTMLElement} node
 */
function forceDomRepaint(node) {
  if (!(node instanceof HTMLElement)) return;
  void node.offsetHeight;
  const shell = node.closest('.heart-agent-module__details');
  if (shell instanceof HTMLElement) void shell.offsetHeight;
  requestAnimationFrame(() => {
    void node.offsetHeight;
  });
}

/**
 * Patch card telemetry. Expanded `.uac-dashboard` is optional (Stage 0 cards omit it).
 * Status-row Signal Confidence must still update when a live value arrives.
 * @param {HTMLElement} card
 * @param {Record<string, unknown>} detail
 */
function applyAgentDashboardPatch(card, detail) {
  const dashboardRoot = getAgentDashboardRoot(card);
  console.log('[Obrium:UpdateAgent] Dashboard root:', dashboardRoot);

  const valueRaw = detail.value ?? detail.primaryValue;
  if (dashboardRoot instanceof HTMLElement) {
    if (valueRaw != null && valueRaw !== '') {
      const valueNode = dashboardRoot.querySelector('.uac-dashboard__focal .uac-dashboard__value');
      console.log('Updating node:', valueNode);
      if (valueNode instanceof HTMLElement) {
        valueNode.textContent = String(valueRaw);
        card.dataset.uacLiveValue = String(valueRaw);
        forceDomRepaint(valueNode);
        forceDomRepaint(dashboardRoot);
      }
    }

    if (detail.unit != null && detail.unit !== '') {
      const focal = dashboardRoot.querySelector('.uac-dashboard__focal');
      let unitNode = dashboardRoot.querySelector('.uac-dashboard__unit');
      console.log('Updating node:', unitNode);
      if (!unitNode && focal instanceof HTMLElement) {
        unitNode = document.createElement('span');
        unitNode.className = 'uac-dashboard__unit';
        focal.appendChild(unitNode);
      }
      if (unitNode instanceof HTMLElement) {
        unitNode.textContent = String(detail.unit);
        forceDomRepaint(unitNode);
      }
    }

    if (detail.caption != null) {
      const captionNode = dashboardRoot.querySelector('.uac-dashboard__caption');
      console.log('Updating node:', captionNode);
      if (captionNode instanceof HTMLElement) {
        const raw = String(detail.caption);
        if (/local mock|mock parsing|awaiting passive|device sync|sys log|placeholder/i.test(raw)) {
          captionNode.textContent = '';
          captionNode.hidden = true;
        } else {
          captionNode.hidden = false;
          captionNode.textContent = raw;
        }
        forceDomRepaint(captionNode);
      }
    }

    const deltaRaw = detail.delta ?? detail.deltaLine;
    if (deltaRaw != null) {
      const deltaNode = dashboardRoot.querySelector('.uac-dashboard__delta');
      console.log('Updating node:', deltaNode);
      if (deltaNode instanceof HTMLElement) {
        deltaNode.textContent = String(deltaRaw);
        forceDomRepaint(deltaNode);
      }
    }
  } else if (valueRaw != null && valueRaw !== '') {
    // No expand panel (common at Stage 0) — still record the live value on the card.
    card.dataset.uacLiveValue = String(valueRaw);
  }

  // Prefer an explicit confidence field; otherwise derive from the logged value
  // (never rely on a hardcoded mock percentage as the only path).
  const progressRaw =
    detail.signalConfidencePct ??
    detail.signal_confidence_pct ??
    detail.integrityPct ??
    detail.progressPct ??
    detail.progress;
  let pctParsed = parseProgressPercent(progressRaw);
  if (pctParsed == null && valueRaw != null && valueRaw !== '') {
    const trackId = String(card.dataset.trackId || '').trim();
    const sd = buildSensorDataFromDetail(
      /** @type {AgentLifeTrackId} */ (trackId || 'general'),
      detail
    );
    pctParsed = computeSignalConfidence(sd);
  }

  if (pctParsed != null) {
    const pct = pctParsed;
    if (dashboardRoot instanceof HTMLElement) {
      const fillNode =
        dashboardRoot.querySelector('[data-track-goal-bar-fill]') ||
        dashboardRoot.querySelector('.uac-progress-track__fill');
      const trackNode =
        dashboardRoot.querySelector('[data-track-goal-bar]') ||
        dashboardRoot.querySelector('.uac-progress-track');
      if (fillNode instanceof HTMLElement && trackNode instanceof HTMLElement) {
        fillNode.style.width = `${pct}%`;
        fillNode.style.setProperty('width', `${pct}%`, 'important');
        trackNode.setAttribute('aria-valuenow', String(pct));
        trackNode.setAttribute('aria-valuetext', `Signal confidence ${pct} percent`);
        const stateNode = dashboardRoot.querySelector('.uac-trend-state');
        if (stateNode instanceof HTMLElement) {
          const level = pct >= 80 ? 'HIGH' : pct >= 50 ? 'MEDIUM' : 'LOW';
          stateNode.className = 'uac-trend-state uac-trend-state--confidence';
          stateNode.textContent = `${level} · ${pct}%`;
        }
        forceDomRepaint(fillNode);
        forceDomRepaint(trackNode);
      }
    }

    const confidenceNode = card.querySelector(
      '.heart-agent-module__signal-confidence, .heart-agent-module__integrity'
    );
    if (confidenceNode instanceof HTMLElement) {
      confidenceNode.textContent = `Signal Confidence: ${pct}%`;
      forceDomRepaint(confidenceNode);
    }
    card.dataset.signalConfidencePct = String(pct);
  } else if (detail.trendState != null && dashboardRoot instanceof HTMLElement) {
    const stateNode = dashboardRoot.querySelector('.uac-trend-state');
    if (stateNode instanceof HTMLElement) {
      stateNode.className = 'uac-trend-state uac-trend-state--confidence';
      stateNode.textContent = String(detail.trendState);
      forceDomRepaint(stateNode);
    }
  }

  if (detail.status != null || valueRaw != null) {
    applyCollapsedStatusPill(card, detail);
  }

  card.classList.add('agent-report-card--live-patch');
  card.classList.remove('agent-report-card--live-patch');
  void card.offsetWidth;
  card.classList.add('agent-report-card--live-patch');
}

/**
 * @param {Event} event
 */
function handleAgentUpdate(event) {
  const detail = /** @type {CustomEvent} */ (event).detail;
  console.log('Event received: ', detail);

  if (!detail || typeof detail !== 'object') {
    console.warn('[Obrium:UpdateAgent] Missing or invalid event.detail');
    return;
  }

  const agentId = String(detail.agentId ?? '').trim();
  if (!agentId) {
    console.warn('[Obrium:UpdateAgent] Missing agentId in event.detail');
    return;
  }

  const persist = detail._fromFeedStorage !== true;
  applyAgentUpdateToDom(agentId, /** @type {Record<string, unknown>} */ (detail), { persist });
}

function installObriumUpdateAgentListener() {
  if (typeof document === 'undefined') return;
  if (document.__obriumUpdateAgentBound) return;
  document.__obriumUpdateAgentBound = true;
  document.addEventListener('Obrium:UpdateAgent', handleAgentUpdate);
}

/**
 * On module init, read today's biometrics from IndexedDB and replay them
 * so agent cards show correct status/values immediately after a page refresh
 * instead of waiting for a new TALK event.
 */
async function hydrateAgentCardsFromStorage() {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;

    const record = await getMetricsByDate(today);
    if (!record || !record.metrics) return;

    _latestBiometricsPayload = /** @type {Record<string, unknown>} */ (record);
    applyRealtimeBiometricPayload(_latestBiometricsPayload);
  } catch (_) {
    // IndexedDB may be unavailable (private browsing, etc.) — silent no-op.
  }
}

const MATURITY_BADGE = ['Baseline', 'Calibrated', 'Trends', 'Biomarkers'];
let profileBeforeCardSync = null;

function readMappedValue(profile, signal) {
  const section = profile?.[signal.section];
  return section && typeof section === 'object' ? section[signal.field] : undefined;
}

function noteChangedFocusSignals(profile) {
  const prev = profileBeforeCardSync;
  try {
    profileBeforeCardSync = JSON.parse(JSON.stringify(profile || {}));
  } catch (_) {
    profileBeforeCardSync = null;
  }
  if (!prev) return;
  for (const signals of Object.values(FOCUS_AREA_SIGNALS)) {
    for (const signal of signals) {
      const before = JSON.stringify(readMappedValue(prev, signal) ?? null);
      const after = JSON.stringify(readMappedValue(profile, signal) ?? null);
      if (before !== after) {
        noteSignalSaved(signal.section, signal.field);
        break;
      }
    }
  }
}

function syncFocusCardsFromProfile() {
  const profile = profileState.get();
  noteChangedFocusSignals(profile);
  document.querySelectorAll('.universal-agent-card[data-focus-area-id]').forEach((el) => {
    const id = el.dataset.focusAreaId;
    if (!id) return;
    const stored = Number(el.dataset.storedStage || 0);
    const stage = displayMaturityStage(stored, profile, id);
    const cal = calibrationLine(profile, id);
    const payoff = payoffDetail(profile, id);
    const fact = payoff ? getEntries({ focusArea: id, field: payoff.field, profile }) : null;
    const badge = el.querySelector('[data-uac-maturity]');
    if (badge) {
      badge.dataset.maturityStage = String(stage);
      badge.textContent = `Stage ${stage} · ${MATURITY_BADGE[stage] || ''}`;
    }
    el.dataset.maturityStage = String(stage);

    const actions = el.querySelector('.heart-agent-module__actions');
    let calEl = el.querySelector('[data-uac-calibration]');
    let calBtn = el.querySelector('[data-uac-calibration-talk]');
    if (cal) {
      if (!calEl) {
        calEl = document.createElement('p');
        calEl.className = 'heart-agent-module__calibration';
        calEl.dataset.uacCalibration = '';
        if (actions) actions.parentNode.insertBefore(calEl, actions);
      }
      calEl.textContent = cal;
      if (!calBtn) {
        calBtn = document.createElement('button');
        calBtn.type = 'button';
        calBtn.className = 'heart-agent-module__btn heart-agent-module__btn--primary';
        calBtn.dataset.uacAction = 'confidence-talk';
        calBtn.dataset.uacCalibrationTalk = '';
        calBtn.textContent = 'Open Talk';
        calEl.insertAdjacentElement('afterend', calBtn);
      }
    } else {
      calEl?.remove();
      calBtn?.remove();
    }

    let pay = el.querySelector('[data-uac-payoff]');
    let ctx = el.querySelector('[data-uac-payoff-context]');
    if (payoff?.echo) {
      if (!pay) {
        pay = document.createElement('p');
        pay.className = 'heart-agent-module__payoff';
        pay.dataset.uacPayoff = '';
        const slot = el.querySelector('[data-uac-content-slot]');
        const anchor = el.querySelector('[data-uac-calibration]') || actions;
        if (slot) slot.insertAdjacentElement('afterend', pay);
        else if (anchor) anchor.parentNode.insertBefore(pay, anchor);
      }
      pay.textContent = payoff.echo;
      if (fact?.text) {
        if (!ctx) {
          ctx = document.createElement('p');
          ctx.className = 'heart-agent-module__payoff-context';
          ctx.dataset.uacPayoffContext = '';
          pay.insertAdjacentElement('afterend', ctx);
        }
        ctx.textContent = fact.text;
      } else {
        ctx?.remove();
      }
    } else {
      pay?.remove();
      ctx?.remove();
    }

    const statusRow = el.querySelector('.heart-agent-module__status-row');
    const pill = statusRow?.querySelector('.heart-agent-module__status-pill');
    const showPill = el.dataset.signalActive === '1' || stage >= 1;
    if (statusRow && showPill && !pill) {
      const next = document.createElement('span');
      next.className = 'heart-agent-module__status-pill';
      next.textContent = el.dataset.signalActive === '1' ? 'Sensor linked' : 'Sensor offline';
      statusRow.prepend(next);
    } else if (!showPill && pill) {
      pill.remove();
    }
    const conf = el.querySelector('.heart-agent-module__signal-confidence');
    const pct = Number(el.dataset.signalConfidence || 0);
    if (!(stage >= 1 && pct > 0)) conf?.remove();
  });
}

function highlightFocusAreaCard(areaId) {
  if (typeof window.switchView === 'function') window.switchView('feed');
  const el = document.querySelector(`.universal-agent-card[data-focus-area-id="${CSS.escape(areaId)}"]`);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  el.classList.add('uac-highlight');
  window.setTimeout(() => el.classList.remove('uac-highlight'), reduce ? 0 : 1600);
}

if (typeof window !== 'undefined') {
  installDelegatedAddAgentListener();
  installBiometricsRealtimeSubscriber();
  installObriumUpdateAgentListener();
  window.highlightFocusAreaCard = highlightFocusAreaCard;
  window.addEventListener('obrium:profile-saved', () => syncFocusCardsFromProfile());

  const initFeedStateLifecycle = () => {
    hydrateFeedStateFromStorage();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeedStateLifecycle, { once: true });
  } else {
    initFeedStateLifecycle();
  }

  window.addEventListener('obrium:agent-sensor-updated', (ev) => {
    const agentName = /** @type {CustomEvent} */ (ev).detail?.agentName;
    renderAgentReportsSection();
    if (agentName) pulseAgentCard(String(agentName));
  });
  hydrateAgentCardsFromStorage();
}

export { FeedState };
