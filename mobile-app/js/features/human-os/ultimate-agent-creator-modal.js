// Serron — Premium Pro Health (PHAI) agent wizard — isolated `phai-*` UI layer
// @owner: human-os
// @role: ui

import { profileState } from '../../state.js';
import {
  addUserAgent,
  addBlueprintUserAgent,
  allocateUniqueAgentDisplayName,
  buildAgentConfigSignature,
  hasUserAgentConfigSignature,
  findUserAgentByFocusAreaId,
} from './user-agents.js';
import { writeAgentInsight, LEDGER_SOURCE_ULTIMATE_CREATOR } from './common-ledger.js';
import { tickModularAgents } from './modular-agents-runtime.js';
import {
  STARTER_FOCUS_AREAS,
  getSelectedFocusAreaIds,
  getBehaviorModeUserLabel,
} from './focus-areas.js';

/**
 * Inline sector icons (path-only SVG, ASCII-safe `d` attributes — no truncation).
 * Used by SELECT SECTOR modal only.
 */
const UAC_SECTOR_ICON_SVGS = {
  brain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3"/></svg>`,
  eyes: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12s-3.5 5.5-9.5 5.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  lung: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8"/><path d="M12 11c-1.7 0-3 1.3-3 3v5H6.8a3.8 3.8 0 0 1-3.5-2.3L2 13.5a3 3 0 0 1 .9-3.5 3 3 0 0 1 4 .4l2.1 2.6"/><path d="M12 11c1.7 0 3 1.3 3 3v5h2.2a3.8 3.8 0 0 0 3.5-2.3l1.3-3.2a3 3 0 0 0-.9-3.5 3 3 0 0 0-4 .4L15 13"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/></svg>`,
  blood: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3l2-3 3 6 2-4 1.5 2H21"/><path d="M3 17h18"/></svg>`,
  move: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/><path d="M12 12l6-6M12 12l-5 7"/><circle cx="18" cy="6" r="1.3"/><circle cx="7" cy="19" r="1.3"/></svg>`,
  sleep: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8" width="15" height="8" rx="1.8"/><path d="M18.5 10.5h2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2"/><path d="M6 12h2l1.2-1.8 1.8 3.6 1.6-2.4H16"/></svg>`,
  nutrition: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="2"/><circle cx="16.8" cy="8.2" r="2"/><circle cx="17.2" cy="16.2" r="2"/><path d="M8.7 11.1l6.3-2M8.9 13l6.4 2.1"/></svg>`,
};

const EASE_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Wizard slide motion: sharp / instrument-like (not slow web easing). */
const STEP_DURATION_MS = 100;
const STEP_COUNT = 3;

const PHAI_TITLE_STEP0 = 'SELECT SECTOR FOR MONITORING';
const PHAI_TITLE_STEP1 = 'Choose your focus';
const PHAI_TITLE_STEP2 = 'DATA ACQUISITION METHOD';
const PHAI_BTN_CONTINUE = 'CONTINUE';
const PHAI_BTN_START = 'START FOCUS AREA';

const PHAI_SECTION_BODY = 'BODY AREAS';
const PHAI_SECTION_ACTIVITY = 'ACTIVITY';
const PHAI_ICON_PREFIX = './assets/phai-area/';
const PHAI_ICON_FILES = new Set(['heart.svg', 'sleep.svg', 'nutrition.svg', 'energy.svg', 'labs.svg', 'activity.svg']);
const PHAI_ICON_CHECK_CACHE = new Map();

/** @typedef {'auto' | 'manual' | 'ai_only'} UacTrackingMode */

function purgeAgentUiOverlaysFromDocument() {
  const byId = [
    'obrium-create-agent-overlay',
    'obrium-edit-agent-overlay',
    'obrium-ultimate-agent-creator-overlay',
    'obrium-blueprint-store-overlay',
    'obrium-workflow-init-overlay',
  ];
  byId.forEach((id) => document.getElementById(id)?.remove());
  document.querySelectorAll('body > .human-os-modal-overlay').forEach((el) => el.remove());
}

/**
 * Body Areas (row 1) + Activity (row 2) on a fixed 3x2 grid. Icons: `./assets/phai-area/*.svg`.
 * @type {Array<{ sectionLabel: string, areas: Array<{ id: string, label: string, iconAsset: string, desc: string }> }>}
 */
const LIFE_AREA_GROUPS = [
  {
    sectionLabel: PHAI_SECTION_BODY,
    areas: [
      {
        id: 'heart',
        label: 'Heart',
        iconAsset: './assets/phai-area/heart.svg',
        desc: 'Analyze Heart Rate & Variability',
      },
      {
        id: 'sleep',
        label: 'Sleep',
        iconAsset: './assets/phai-area/sleep.svg',
        desc: 'Track quality, find problems',
      },
      {
        id: 'nutrition',
        label: 'Nutrition',
        iconAsset: './assets/phai-area/nutrition.svg',
        desc: 'Analyze diet, supplements & metabolic impact',
      },
    ],
  },
  {
    sectionLabel: PHAI_SECTION_ACTIVITY,
    areas: [
      {
        id: 'energy',
        label: 'Energy',
        iconAsset: './assets/phai-area/energy.svg',
        desc: 'Daily capacity, focus & rhythm',
      },
      {
        id: 'labs',
        label: 'Labs',
        iconAsset: './assets/phai-area/labs.svg',
        desc: 'Biomarkers & blood test data',
      },
      {
        id: 'activity',
        label: 'Activity',
        iconAsset: './assets/phai-area/activity.svg',
        desc: 'Monitor training load & 10k steps goal',
      },
    ],
  },
];

function getAllLifeAreas() {
  return LIFE_AREA_GROUPS.flatMap((g) => g.areas);
}

/**
 * Step 2 goals: user-facing only; each maps to internal agent definition.
 * @type {Record<string, Array<{ id: string, label: string, desc: string, domainId: string, typeId: string }>>}
 */
const GOALS_BY_AREA = {
  heart: [
    {
      id: 'heart-rate',
      label: 'Watch heart rate & recovery',
      desc: 'Pulse, zones, and recovery-friendly alerts.',
      domainId: 'health',
      typeId: 'cardio',
    },
    {
      id: 'heart-wellness',
      label: 'Overall heart wellness',
      desc: 'Broader cardiovascular support and vitals context.',
      domainId: 'health',
      typeId: 'vitals',
    },
    {
      id: 'heart-strain',
      label: 'Balance strain & rest',
      desc: 'Training load vs recovery awareness.',
      domainId: 'health',
      typeId: 'recovery',
    },
  ],
  sleep: [
    {
      id: 'sleep-improve',
      label: 'Improve sleep',
      desc: 'Duration, consistency, and better nights.',
      domainId: 'health',
      typeId: 'sleep',
    },
    {
      id: 'sleep-quality',
      label: 'Track sleep quality',
      desc: 'Patterns and trends over time.',
      domainId: 'health',
      typeId: 'sleep',
    },
    {
      id: 'sleep-find',
      label: 'Find problems',
      desc: 'Spot disruptions, stress, and wind-down issues.',
      domainId: 'health',
      typeId: 'sleep',
    },
  ],
  nutrition: [
    {
      id: 'nut-eat',
      label: 'Eat better consistently',
      desc: 'Meal rhythm and sustainable choices.',
      domainId: 'routine',
      typeId: 'habits',
    },
    {
      id: 'nut-track',
      label: 'Track meals & habits',
      desc: 'Logging and streak-friendly nudges.',
      domainId: 'routine',
      typeId: 'habits',
    },
    {
      id: 'nut-protocol',
      label: 'Stick to a plan',
      desc: 'Protocols and daily structure.',
      domainId: 'routine',
      typeId: 'planner',
    },
  ],
  energy: [
    {
      id: 'en-recovery',
      label: 'Recovery & readiness',
      desc: 'Strain vs rest and daily capacity.',
      domainId: 'health',
      typeId: 'recovery',
    },
    {
      id: 'en-focus',
      label: 'Focus & deep work',
      desc: 'Protect energy for what matters.',
      domainId: 'routine',
      typeId: 'focus',
    },
    {
      id: 'en-vitals',
      label: 'Daily energy signals',
      desc: 'Vitals and how you feel day to day.',
      domainId: 'health',
      typeId: 'vitals',
    },
  ],
  labs: [
    {
      id: 'lab-results',
      label: 'Understand my results',
      desc: 'Summaries and questions to discuss with your clinician.',
      domainId: 'knowledge',
      typeId: 'research',
    },
    {
      id: 'lab-track',
      label: 'Track trends',
      desc: 'Markers over time in plain language.',
      domainId: 'knowledge',
      typeId: 'docs',
    },
    {
      id: 'lab-prep',
      label: 'Prep for appointments',
      desc: 'Notes and priorities before visits.',
      domainId: 'knowledge',
      typeId: 'research',
    },
  ],
  activity: [
    {
      id: 'act-move',
      label: 'Move more intentionally',
      desc: 'Steps, sessions, and outdoor time.',
      domainId: 'routine',
      typeId: 'planner',
    },
    {
      id: 'act-habit',
      label: 'Build movement habits',
      desc: 'Streaks and small wins.',
      domainId: 'routine',
      typeId: 'habits',
    },
    {
      id: 'act-outdoor',
      label: 'Outdoor & environment',
      desc: 'Weather and conditions for activity.',
      domainId: 'bio-env',
      typeId: 'weather',
    },
  ],
};

/** Human-readable domain labels for prompts (not shown as grid labels). */
const DOMAIN_LABELS = {
  health: 'Health',
  'bio-env': 'Environment',
  routine: 'Daily rhythm',
  knowledge: 'Knowledge',
};

/** @type {Record<string, Array<{ id: string, label: string, desc: string, blueprintId: string|null }>>} */
const DOMAIN_TYPES = {
  health: [
    { id: 'cardio', label: 'Heart monitor', desc: 'Pulse thresholds and recovery-aware alerts.', blueprintId: 'cardio_monitor' },
    { id: 'sleep', label: 'Sleep coach', desc: 'Sleep debt and wind-down cues.', blueprintId: null },
    { id: 'recovery', label: 'Recovery', desc: 'Strain vs recovery balance.', blueprintId: null },
    { id: 'vitals', label: 'Vitals', desc: 'Aggregated daily vitals summaries.', blueprintId: null },
  ],
  'bio-env': [
    { id: 'weather', label: 'Weather', desc: 'Wind, UV, and outdoor thermal load.', blueprintId: 'weather_scout' },
    { id: 'air', label: 'Air quality', desc: 'Outdoor air and breathing load.', blueprintId: null },
    { id: 'circadian', label: 'Circadian', desc: 'Light and time-of-day alignment.', blueprintId: null },
  ],
  routine: [
    { id: 'planner', label: 'Day planner', desc: 'Calendar-aware pacing.', blueprintId: null },
    { id: 'habits', label: 'Habits', desc: 'Streaks and ritual anchoring.', blueprintId: null },
    { id: 'focus', label: 'Focus', desc: 'Deep-work protection windows.', blueprintId: null },
  ],
  knowledge: [
    { id: 'github', label: 'GitHub', desc: 'Assigned issues and repository signals.', blueprintId: 'github_scout' },
    { id: 'research', label: 'Research', desc: 'Summaries and source tracking.', blueprintId: null },
    { id: 'docs', label: 'Documents', desc: 'Internal docs and briefings.', blueprintId: null },
  ],
};

const SOURCE_DEFS = {
  apple_health: { label: 'Apple Health / Watch', sub: 'Automatic sync when connected' },
  google_fit: { label: 'Google Fit', sub: 'Android health stack' },
  devices_bt: { label: 'HARDWARE SYNC', sub: 'Bluetooth and connected apps' },
  manual: { label: 'TERMINAL UPLINK', sub: 'You log or confirm in Obrium' },
  global_api: { label: 'AI insights', sub: 'Guidance without a device link' },
};

const HEALTH_SOURCE_ORDER = ['apple_health', 'google_fit', 'devices_bt', 'manual', 'global_api'];
const DEFAULT_SOURCE_ORDER = ['devices_bt', 'manual', 'global_api'];

const TRACKING_OPTIONS = [
  {
    id: 'auto',
    label: 'HARDWARE SYNC',
    sub: 'Apple Health, wearables, and connected apps',
    mode: 'auto',
  },
  { id: 'manual', label: 'TERMINAL UPLINK', sub: 'You log or confirm in Obrium', mode: 'manual' },
  { id: 'ai_only', label: 'AI Only', sub: 'Insights and coaching without device data', mode: 'ai_only' },
];

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} iconPath
 */
function normalizePhaiIconPath(iconPath) {
  const raw = String(iconPath || '').trim().replace(/\\/g, '/');
  const fileName = raw.split('/').pop() || '';
  if (!PHAI_ICON_FILES.has(fileName)) return '';
  return `${PHAI_ICON_PREFIX}${fileName}`;
}

/**
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function checkPhaiIconExists(path) {
  if (!path) return false;
  if (PHAI_ICON_CHECK_CACHE.has(path)) return PHAI_ICON_CHECK_CACHE.get(path);
  const promise = (async () => {
    try {
      const headRes = await fetch(path, { method: 'HEAD', cache: 'no-store' });
      if (headRes.ok) return true;
    } catch (_) {}
    try {
      const getRes = await fetch(path, { method: 'GET', cache: 'no-store' });
      return getRes.ok;
    } catch (_) {
      return false;
    }
  })();
  PHAI_ICON_CHECK_CACHE.set(path, promise);
  return promise;
}

/**
 * @param {HTMLElement} host
 */
function guardPhaiTileIcons(host) {
  if (!host) return;
  const imgs = host.querySelectorAll('.phai-tile__icon-img');
  imgs.forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    const originalPath = String(img.getAttribute('data-icon-path') || img.getAttribute('src') || '').trim();
    const normalizedPath = normalizePhaiIconPath(originalPath);
    if (!normalizedPath) {
      if (typeof window !== 'undefined' && typeof window.__obriumApplyAssetFallback === 'function') {
        window.__obriumApplyAssetFallback(img, originalPath);
      }
      return;
    }
    if (img.getAttribute('src') !== normalizedPath) {
      img.setAttribute('src', normalizedPath);
    }
    img.addEventListener(
      'error',
      () => {
        if (typeof window !== 'undefined' && typeof window.__obriumApplyAssetFallback === 'function') {
          window.__obriumApplyAssetFallback(img, normalizedPath);
        }
      },
      { once: true }
    );
    void checkPhaiIconExists(normalizedPath).then((exists) => {
      if (exists) return;
      if (typeof console !== 'undefined') {
        if (console.error) console.error(`[PATH ERROR]: Missing file at ${normalizedPath}`);
        if (console.warn) console.warn(`[SYSTEM ERROR]: Resource Missing at ${normalizedPath}`);
      }
      if (typeof window !== 'undefined' && typeof window.__obriumApplyAssetFallback === 'function') {
        window.__obriumApplyAssetFallback(img, normalizedPath);
      }
    });
  });
}

function formatPhaiStatusClock() {
  const d = new Date();
  const h24 = d.getHours();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `[ ${hh}:${mm} ${ampm} ]`;
}

export function getUserDeploymentProfileFacts() {
  let p = {};
  try {
    p = profileState.get() || {};
  } catch (_) {
    p = {};
  }
  const body = p.body || {};
  const health = p.health || {};

  const rawName = typeof body.name === 'string' && body.name.trim()
    ? body.name
    : (typeof localStorage !== 'undefined' && localStorage.getItem('tendai-display-name')) || '';
  const name = rawName.trim() || 'not provided';

  const w = body.weight;
  const weightLine =
    w != null && w !== '' && !Number.isNaN(Number(w))
      ? `Weight: ${w} kg (from Profile — confirm units in settings if needed).`
      : 'Weight: not provided (unknown — do not assume a value).';

  const heartBits = [];
  if (Array.isArray(health.chronicDiseases) && health.chronicDiseases.length) {
    heartBits.push(`Flagged conditions: ${health.chronicDiseases.join(', ')}`);
  }
  if (health.chronicDiseasesOther) heartBits.push(String(health.chronicDiseasesOther));
  if (Array.isArray(health.healthConcerns) && health.healthConcerns.length) {
    heartBits.push(`Concerns: ${health.healthConcerns.join(', ')}`);
  }
  if (health.limitations) heartBits.push(String(health.limitations));

  const heartLine =
    heartBits.length > 0
      ? `Medical / cardiac context (Profile): ${heartBits.join('; ')}.`
      : 'Medical / cardiac context: none provided (unknown — do not assume any condition).';

  return { name, weightLine, heartLine };
}

function getTypeDef(domainId, typeId) {
  const list = DOMAIN_TYPES[domainId] || [];
  return list.find((t) => t.id === typeId) || null;
}

/**
 * @param {{ domainId: string, agentType: object, sourceId: string, displayName: string, userGoalLabel?: string, trackingMode?: UacTrackingMode }} sel
 */
function buildSystemPrompt(sel) {
  const { name, weightLine, heartLine } = getUserDeploymentProfileFacts();
  const domainLabel = DOMAIN_LABELS[sel.domainId] || sel.domainId;
  const typeLabel = sel.agentType.label;
  const src = SOURCE_DEFS[sel.sourceId] || SOURCE_DEFS.devices_bt;
  const goalLine = sel.userGoalLabel
    ? `User goal: ${sel.userGoalLabel}.`
    : '';
  const modeLine =
    sel.trackingMode === 'ai_only'
      ? 'Operate primarily from insights and user dialog; device data may be absent until connected.'
      : sel.trackingMode === 'manual'
        ? 'Prioritize user-confirmed and manually logged inputs.'
        : 'Prefer automatic signals from connected health stack and wearables when available.';
  return [
    `You are "${sel.displayName}", a ${domainLabel} companion focused on: ${typeLabel}.`,
    goalLine,
    `Data path: ${src.label} — ${src.sub}.`,
    modeLine,
    '',
    'USER PROFILE (only what the user has provided; anything marked "not provided" is unknown and must not be invented):',
    `- Name: ${name}`,
    `- ${weightLine}`,
    `- ${heartLine}`,
    '',
    `Mission: ${sel.agentType.desc}`,
    '',
    'Default safety: prefer verified on-device or user-confirmed data over assumptions.',
  ]
    .filter(Boolean)
    .join('\n');
}

function sensorDataForSource(sourceId, domainId) {
  const base = {
    source_mode: sourceId,
    domain: domainId,
    health_stack:
      sourceId === 'apple_health'
        ? 'apple_health'
        : sourceId === 'google_fit'
          ? 'google_fit'
          : sourceId === 'devices_bt'
            ? 'generic_bt'
            : null,
  };
  if (sourceId === 'apple_health' || sourceId === 'google_fit' || sourceId === 'devices_bt') {
    if (domainId === 'health') base.health_connected = false;
  }
  return base;
}

/**
 * @param {UacTrackingMode} mode
 * @param {string} domainId
 */
function sourceIdForTrackingMode(mode, domainId) {
  if (mode === 'manual') return 'manual';
  if (mode === 'ai_only') return 'global_api';
  if (domainId === 'health') return 'apple_health';
  return 'devices_bt';
}

function showWorkflowInitializingOverlay() {
  const el = document.createElement('div');
  el.id = 'obrium-workflow-init-overlay';
  el.className = 'obrium-workflow-init-overlay';
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<span class="obrium-workflow-init-overlay__text">Initializing Workflow...</span>';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('is-visible'));
  });
  return el;
}

function showCompletionToast(displayName, areaHint) {
  const prev = document.getElementById('obrium-phai-toast');
  if (prev) prev.remove();
  const el = document.createElement('div');
  el.id = 'obrium-phai-toast';
  el.className = 'phai-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <p class="phai-toast__title">${esc(displayName)} started tracking</p>
    <p class="phai-toast__sub">No data yet — connect your device or log manually in the app.</p>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/**
 * @param {object} opts
 * @param {string} opts.domainId
 * @param {object} opts.agentType
 * @param {string} opts.sourceId
 * @param {string} opts.displayName
 * @param {string} [opts.userGoalLabel]
 * @param {UacTrackingMode} [opts.trackingMode]
 * @param {string} [opts.trackingLifeAreaId] life-area id from step 0 (heart, sleep, ...)
 * @param {string} [opts.behaviorModeId]
 * @param {string} [opts.agentConfigSignature]
 * @param {boolean} [opts.silentInsight]
 */
function deployAgent(opts) {
  const agentConfigSignature =
    String(opts.agentConfigSignature || '').trim() ||
    buildAgentConfigSignature({ sectorId: opts.trackingLifeAreaId, functionId: '' });
  if (agentConfigSignature && hasUserAgentConfigSignature(agentConfigSignature)) {
    return { blocked: true, reason: 'duplicate_signature', signature: agentConfigSignature };
  }
  const prompt = buildSystemPrompt({
    domainId: opts.domainId,
    agentType: opts.agentType,
    sourceId: opts.sourceId,
    displayName: opts.displayName,
    userGoalLabel: opts.userGoalLabel,
    trackingMode: opts.trackingMode,
  });
  const sd = sensorDataForSource(opts.sourceId, opts.domainId);
  const bp = opts.agentType.blueprintId;
  const trackMeta = {
    trackingLifeAreaId: opts.trackingLifeAreaId,
    trackingGoalLabel: opts.userGoalLabel,
    behaviorModeId: opts.behaviorModeId,
    agentConfigSignature,
  };
  if (bp) {
    addBlueprintUserAgent({
      blueprintId: bp,
      name: opts.displayName,
      instruction: prompt,
      sensor_data: sd,
      agentStatus: 'Incomplete',
      ...trackMeta,
    });
  } else {
    addUserAgent({ name: opts.displayName, instruction: prompt, ...trackMeta });
  }
  if (!opts.silentInsight) {
    writeAgentInsight(
      opts.displayName,
      `${opts.displayName} is live. No data yet — connect a device or use manual log when you are ready.`,
      { source: LEDGER_SOURCE_ULTIMATE_CREATOR }
    );
  }
  return { blocked: false, signature: agentConfigSignature };
}

export function openUltimateAgentCreatorModal(onDone) {
  console.log('Modal launch initiated');
  purgeAgentUiOverlaysFromDocument();
  setTimeout(() => openUltimateAgentCreatorModalAfterPurge(onDone), 0);
}

export function openUltimateAgentCreatorModalAfterPurge(onDone) {
  const ICONS = UAC_SECTOR_ICON_SVGS;
  const LOGIC_ICONS = {
    watchdog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 4.5V2.5M21.5 12h-2M12 21.5v-2M2.5 12h2"/><path d="M12 12l3-2"/></svg>`,
    advisor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="14" rx="2"/><path d="M7 20h10"/><path d="M8 9h2M12 9h1M8 13h8"/></svg>`,
    archivist: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="6.5" ry="2.5"/><path d="M5.5 6v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6"/><path d="M5.5 10v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4"/><path d="M5.5 14v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4"/></svg>`,
    analyst: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><rect x="6" y="12" width="2.5" height="5"/><rect x="10.75" y="9" width="2.5" height="8"/><rect x="15.5" y="6" width="2.5" height="11"/></svg>`,
    orchestrator: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/><circle cx="6" cy="8" r="1.8"/><circle cx="18" cy="8" r="1.8"/><circle cx="6" cy="16" r="1.8"/><circle cx="18" cy="16" r="1.8"/><path d="M10.2 10.8 7.4 8.9M13.8 10.8l2.8-1.9M10.2 13.2l-2.8 1.9M13.8 13.2l2.8 1.9"/></svg>`,
    sentinel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 5 6.6v5c0 4 2.7 7.6 7 8.9 4.3-1.3 7-4.9 7-8.9v-5L12 3.5z"/><path d="M9 12l2 2 4-4"/></svg>`,
    drive_signal: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 12h5M8 15h8"/></svg>`,
    wearables_stream: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3.5" width="10" height="17" rx="3"/><path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h5"/></svg>`,
    manual_logs: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V20.5H6z"/><path d="M15 3.5v3h3"/><path d="M9 10h6M9 13h6M9 16h4"/></svg>`,
    context_memory: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 7.5h13v9h-13z"/><path d="M8 16.5v2h8v-2"/><path d="M9 10h6M9 13h4"/></svg>`,
  };

  // "Focus Areas" is the user-facing name; internal model keeps `sector`/`agent`
  // identifiers (see focus-areas.js tech debt note). Catalog is shared with onboarding.
  const sectors = STARTER_FOCUS_AREAS;

  // `name` stays short — it feeds internal agent display names and signatures.
  // `userLabel` is what the user sees on the behavior mode tiles.
  const logicFunctions = [
    {
      id: 'watchdog',
      name: 'Monitor',
      userLabel: "Just watch, tell me only if something's off",
      short: 'M',
      desc: 'Passively watches data streams and alerts you only when thresholds are breached.',
      iconKey: 'watchdog',
      typeByDomain: { health: 'vitals', routine: 'focus' },
    },
    {
      id: 'analyst',
      name: 'Analyzer',
      userLabel: 'Look for connections with other topics',
      short: 'N',
      desc: 'Processes historical data to identify correlations, trends, and systemic anomalies.',
      iconKey: 'analyst',
      typeByDomain: { health: 'cardio', routine: 'planner' },
    },
    {
      id: 'advisor',
      name: 'Assistant',
      userLabel: 'You can suggest and remind me proactively',
      short: 'A',
      desc: 'Actively guides daily routines, suggests adjustments, and interacts in real-time.',
      iconKey: 'advisor',
      typeByDomain: { health: 'recovery', routine: 'planner' },
    },
    {
      id: 'archivist',
      name: 'Data Logger',
      userLabel: "I'll log data myself, just save it",
      short: 'D',
      desc: 'Strictly structures and categorizes your manual inputs for accurate database entry.',
      iconKey: 'archivist',
      typeByDomain: { health: 'vitals', routine: 'habits' },
    },
  ];

  /** Stream pre-checked whenever the user lands on Phase 02. */
  const DEFAULT_SOURCE_ID = 'drive_signal';

  const dataSources = [
    { id: 'drive_signal', name: 'System Telemetry', desc: 'Raw usage statistics, screen states, and app activity from your hardware.', iconKey: 'drive_signal' },
    { id: 'wearables_stream', name: 'Wearable Sensors', desc: 'Synced biometric data from smartwatches, rings, and central health APIs.', iconKey: 'wearables_stream' },
    { id: 'manual_logs', name: 'Manual Check-ins', desc: 'Explicit user inputs, text logs, and verbal state updates provided by you.', iconKey: 'manual_logs' },
    { id: 'context_memory', name: 'Interaction History', desc: 'Past chat context and previously established system preferences.', iconKey: 'context_memory' },
  ];

  /**
   * Focus Areas still available to add in Phase 00 (one active module per area).
   * The user's first-setup picks (getSelectedFocusAreaIds) sort first.
   */
  function getAvailableFocusAreas() {
    const preferred = new Set(getSelectedFocusAreaIds());
    return sectors
      .filter((s) => !findUserAgentByFocusAreaId(s.id))
      .sort((a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id)));
  }

  const state = {
    /** 0 = Focus Area, 1 = Function (behavior mode), 2 = Knowledge Base, 3 = init log. */
    phase: 0,
    /** Single Focus Area chosen in Phase 00 (Set for legacy iteration helpers). */
    selectedSectorIds: new Set(),
    selectedFunctionIds: new Set(),
    /** Phase 02 knowledge streams; re-seeded with DEFAULT_SOURCE_ID on each entry to phase 02. */
    selectedSourceIds: new Set(),
    logLines: [],
    isBusy: false,
  };

  const overlay = document.createElement('div');
  overlay.id = 'obrium-ultimate-agent-creator-overlay';

  function resetWizardSelections() {
    state.phase = 0;
    state.selectedSectorIds = new Set();
    state.selectedFunctionIds.clear();
    state.selectedSourceIds.clear();
    state.logLines = [];
    state.isBusy = false;
  }

  function removeModalFromDom() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  /** User cancelled (X, ESC, or backdrop): clear partial selections and remove the modal. */
  function dismissWizard() {
    resetWizardSelections();
    removeModalFromDom();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      dismissWizard();
    }
  }

  function getOrderedSelectedSectors() {
    return sectors.filter((s) => state.selectedSectorIds.has(s.id));
  }

  function getDomainsFromSelectedSectors() {
    const doms = new Set();
    getOrderedSelectedSectors().forEach((s) => doms.add(s.init.domainId));
    return doms;
  }

  /** Functions compatible with at least one selected sector domain (union). */
  function getVisibleLogicFunctions() {
    const doms = getDomainsFromSelectedSectors();
    if (doms.size === 0) return logicFunctions;
    const filtered = logicFunctions.filter((f) =>
      Object.keys(f.typeByDomain || {}).some((d) => doms.has(d))
    );
    return filtered.length ? filtered : logicFunctions;
  }

  function getOrderedSelectedFunctionsForDeploy() {
    return getVisibleLogicFunctions().filter((f) => state.selectedFunctionIds.has(f.id));
  }

  function pruneInvalidFunctionSelections() {
    const ok = new Set(getVisibleLogicFunctions().map((f) => f.id));
    Array.from(state.selectedFunctionIds).forEach((id) => {
      if (!ok.has(id)) state.selectedFunctionIds.delete(id);
    });
  }

  function isContinueDisabled() {
    if (state.phase === 0) return state.selectedSectorIds.size !== 1;
    if (state.phase === 1) return state.selectedFunctionIds.size === 0;
    if (state.phase === 2) return state.selectedSourceIds.size === 0 || getDuplicateSelections().length > 0;
    return true;
  }

  function getSelectedDeploymentCombos() {
    const sList = getOrderedSelectedSectors();
    const fList = getOrderedSelectedFunctionsForDeploy();
    /** @type {Array<{ sectorId: string, sectorName: string, functionId: string, functionName: string, signature: string }>} */
    const out = [];
    sList.forEach((sector) => {
      fList.forEach((fn) => {
        const signature = buildAgentConfigSignature({ sectorId: sector.id, functionId: fn.id });
        if (!signature) return;
        out.push({
          sectorId: sector.id,
          sectorName: sector.name,
          functionId: fn.id,
          functionName: fn.name,
          signature,
        });
      });
    });
    return out;
  }

  function getDuplicateSelections() {
    return getSelectedDeploymentCombos().filter((x) => hasUserAgentConfigSignature(x.signature));
  }

  function getContinueLabel() {
    if (state.phase === 2) return 'Initialize Focus Area';
    if (state.phase === 0) {
      const picked = getOrderedSelectedSectors()[0];
      return picked ? `Continue — ${picked.name}` : 'Continue';
    }
    if (state.phase === 1) {
      const n = state.selectedFunctionIds.size;
      if (n === 0) return 'Continue';
      return n === 1 ? 'Continue (1 mode)' : `Continue (${n} modes)`;
    }
    return 'Continue';
  }

  function getHeaderTitle() {
    if (state.phase === 0) return 'Which Focus Area are you adding?';
    if (state.phase === 1) return 'How should this Focus Area work?';
    if (state.phase === 2) return 'What knowledge should it use?';
    return 'Setting up';
  }

  function getHeaderContextMarkup() {
    if (state.phase < 1) return '';
    const picked = getOrderedSelectedSectors()[0];
    const left = picked
      ? `<div class="deploy-context-left">${esc(picked.name)}</div>`
      : '';
    const fns = getOrderedSelectedFunctionsForDeploy();
    // User-facing phrasing only — never surface Monitor/Analyzer/etc. here.
    const fPart = fns
      .map((f) => getBehaviorModeUserLabel(f.id) || f.userLabel || f.name)
      .join(' · ');
    const right =
      state.phase >= 2 && fPart
        ? `<div class="deploy-context-right deploy-context-right--human">${esc(fPart)}</div>`
        : '';
    if (!left && !right) return '';
    return `<div class="deploy-context-row deploy-context-row--human">${left}${right}</div>`;
  }

  function renderFocusAreaStep() {
    const available = getAvailableFocusAreas();
    if (!available.length) {
      return `
        <p class="deploy-instruction">All 9 Focus Areas are already active. Remove one from the sidebar to redeploy it.</p>
      `;
    }
    const tiles = available
      .map((area) => {
        const selected = state.selectedSectorIds.has(area.id);
        return `
          <button
            type="button"
            class="deploy-tile${selected ? ' is-selected' : ''}"
            data-focus-area-id="${esc(area.id)}"
          >
            <span class="deploy-tile-check" aria-hidden="true">${selected ? '✓' : ''}</span>
            <span class="deploy-tile-icon" aria-hidden="true">${ICONS[area.iconKey] || ICONS.heart}</span>
            <span class="deploy-tile-body">
              <span class="deploy-tile-title">${esc(area.name)}</span>
              <span class="deploy-tile-desc">${esc(area.desc)}</span>
            </span>
          </button>
        `;
      })
      .join('');
    return `
      <p class="deploy-instruction">Choose one to start learning with.</p>
      <div class="deploy-tile-grid deploy-tile-grid--uniform">${tiles}</div>
    `;
  }

  function renderFunctionStep() {
    const visibleFns = getVisibleLogicFunctions();
    const toolbar = `
      <div class="deploy-tile-toolbar">
        <p class="deploy-instruction deploy-instruction--toolbar">Pick one or more ways it can help.</p>
        <div class="deploy-tile-toolbar-actions">
          <button type="button" class="deploy-bulk-btn" data-deploy-bulk="functions-all">Select all</button>
          <button type="button" class="deploy-bulk-btn" data-deploy-bulk="functions-clear">Clear</button>
        </div>
      </div>
    `;
    const tiles = visibleFns
      .map((fn) => {
        const selected = state.selectedFunctionIds.has(fn.id);
        return `
          <button
            type="button"
            class="deploy-tile${selected ? ' is-selected' : ''}"
            data-function-id="${esc(fn.id)}"
          >
            <span class="deploy-tile-check" aria-hidden="true">${selected ? '✓' : ''}</span>
            <span class="deploy-tile-icon" aria-hidden="true">${LOGIC_ICONS[fn.iconKey] || LOGIC_ICONS.watchdog}</span>
            <span class="deploy-tile-body">
              <span class="deploy-tile-title">${esc(fn.userLabel || fn.name)}</span>
              <span class="deploy-tile-desc">${esc(fn.desc)}</span>
            </span>
          </button>
        `;
      })
      .join('');
    return `${toolbar}<div class="deploy-tile-grid deploy-tile-grid--uniform">${tiles}</div>`;
  }

  function renderKnowledgeStep() {
    const duplicateSelections = getDuplicateSelections();
    const duplicateNotice =
      duplicateSelections.length > 0
        ? `<p class="deploy-duplicate-block" role="status" aria-live="polite" title="Initialization Blocked: This Focus Area is already active.">Initialization Blocked: This Focus Area is already active.</p>`
        : '';
    return `
      <p class="deploy-instruction deploy-knowledge-lead">Choose the data streams it can learn from.</p>
      ${duplicateNotice}
      <div class="deploy-source-list">
        ${dataSources
          .map((src) => {
            const selected = state.selectedSourceIds.has(src.id);
            return `
              <button class="deploy-source-row ${selected ? 'is-selected' : ''}" type="button" data-source-id="${esc(src.id)}">
                <span class="deploy-source-icon">${LOGIC_ICONS[src.iconKey] || LOGIC_ICONS.drive_signal}</span>
                <span class="deploy-source-copy">
                  <span class="deploy-source-name">${esc(src.name)}</span>
                  <span class="deploy-source-desc">${esc(src.desc)}</span>
                </span>
                <span class="deploy-source-check" aria-hidden="true">${selected ? '✓' : ''}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function renderInitStep() {
    return `
      <div class="deploy-init-overlay">
        <div class="deploy-init-log">
          ${state.logLines.map((line) => `<div class="deploy-init-line">${esc(line)}</div>`).join('')}
        </div>
      </div>
    `;
  }

  function renderPhaseBody() {
    if (state.phase === 0) return renderFocusAreaStep();
    if (state.phase === 1) return renderFunctionStep();
    if (state.phase === 2) return renderKnowledgeStep();
    return renderInitStep();
  }

  function getTrackingModeAndSource(domainId) {
    if (state.selectedSourceIds.has('manual_logs') && state.selectedSourceIds.size === 1) {
      return { trackingMode: 'manual', sourceId: 'manual' };
    }
    if (state.selectedSourceIds.has('context_memory') && state.selectedSourceIds.size === 1) {
      return { trackingMode: 'ai_only', sourceId: 'global_api' };
    }
    if (state.selectedSourceIds.has('wearables_stream')) {
      return { trackingMode: 'auto', sourceId: domainId === 'health' ? 'apple_health' : 'devices_bt' };
    }
    return { trackingMode: 'auto', sourceId: sourceIdForTrackingMode('auto', domainId) };
  }

  function deploySingleConfiguredAgent(sector, fn) {
    if (!sector || !fn) return null;
    const agentConfigSignature = buildAgentConfigSignature({ sectorId: sector.id, functionId: fn.id });
    if (!agentConfigSignature) return null;
    if (hasUserAgentConfigSignature(agentConfigSignature)) {
      return {
        blocked: true,
        reason: 'duplicate_signature',
        signature: agentConfigSignature,
        sectorName: sector.name,
        functionName: fn.name,
      };
    }
    // One Focus Area = one active module. Prevents duplicate Feed cards for the same area.
    if (findUserAgentByFocusAreaId(sector.id)) {
      return {
        blocked: true,
        reason: 'duplicate_focus_area',
        signature: agentConfigSignature,
        sectorName: sector.name,
        functionName: fn.name,
      };
    }
    const preferredTypeId = fn.typeByDomain[sector.init.domainId] || sector.init.typeId;
    const agentType =
      getTypeDef(sector.init.domainId, preferredTypeId) ||
      getTypeDef(sector.init.domainId, sector.init.typeId);
    if (!agentType) return null;

    const { trackingMode, sourceId } = getTrackingModeAndSource(sector.init.domainId);
    // Display name is the Focus Area name only — behavior mode is a separate field.
    const displayName = allocateUniqueAgentDisplayName(sector.name);
    const modeLabel = fn.userLabel || getBehaviorModeUserLabel(fn.id) || fn.name;

    deployAgent({
      domainId: sector.init.domainId,
      agentType,
      sourceId,
      displayName,
      userGoalLabel: `${sector.init.goalLabel} · ${modeLabel}`,
      trackingMode,
      trackingLifeAreaId: sector.id,
      behaviorModeId: fn.id,
      agentConfigSignature,
    });
    return {
      displayName,
      sectorName: sector.name,
      functionName: fn.name,
      functionUserLabel: modeLabel,
      signature: agentConfigSignature,
    };
  }

  function deployAllConfiguredAgents() {
    const sList = getOrderedSelectedSectors();
    const fList = getOrderedSelectedFunctionsForDeploy();
    if (!sList.length || !fList.length) return { results: [], blocked: [], count: 0 };
    const results = [];
    const blocked = [];
    for (const sector of sList) {
      for (const fn of fList) {
        const r = deploySingleConfiguredAgent(sector, fn);
        if (!r) continue;
        if (r.blocked) blocked.push(r);
        else results.push(r);
      }
    }
    return { results, blocked, count: results.length };
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function runInitializationSequence() {
    const sList = getOrderedSelectedSectors();
    const fList = getOrderedSelectedFunctionsForDeploy();
    if (!sList.length || !fList.length || state.isBusy) return;
    state.isBusy = true;
    state.phase = 3;
    state.logLines = [];
    renderModal();

    const primarySource = Array.from(state.selectedSourceIds).join(' · ') || 'NONE';
    const sectorLine = sList.map((s) => s.name.toUpperCase()).join(', ');
    const fnLine = fList.map((f) => `"${f.userLabel || f.name}"`).join(', ');
    const lines = [
      `[ ALLOCATING SECTORS: ${sectorLine} ] ... DONE`,
      `[ DEPLOYING LOGIC: ${fnLine} ] ... DONE`,
      `[ ESTABLISHING KNOWLEDGE BASE: ${primarySource.toUpperCase()} ] ... DONE`,
    ];

    for (const line of lines) {
      if (!overlay.isConnected) return;
      state.logLines.push(line);
      renderModal();
      await wait(280);
    }

    if (!overlay.isConnected) return;

    const { results, blocked, count } = deployAllConfiguredAgents();
    void tickModularAgents();
    const finalSummary =
      count === 1 && results[0]
        ? results[0].displayName.replace(/\s+/g, '_')
        : `${count}_MODULES_ONLINE`;
    state.logLines.push(
      `[ MODIFIED MODULE DEPLOYED ] ... ${count} FOCUS AREA(S): ${finalSummary.replace(/_/g, ' ')}`
    );
    if (blocked.length > 0) {
      state.logLines.push(
        `[ DUPLICATE BLOCK ] ... ${blocked.length} CONFIGURATION(S) SKIPPED (ALREADY OPERATIONAL)`
      );
    }
    renderModal();
    await wait(420);

    const donePayload = {
      sectorIds: Array.from(state.selectedSectorIds),
      functionIds: Array.from(state.selectedFunctionIds),
      sources: Array.from(state.selectedSourceIds),
      deployedCount: count,
      blockedCount: blocked.length,
    };
    resetWizardSelections();
    removeModalFromDom();
    const initOverlay = showWorkflowInitializingOverlay();
    await wait(560);
    initOverlay.classList.remove('is-visible');
    window.setTimeout(() => initOverlay.remove(), 240);
    if (typeof window.switchView === 'function') window.switchView('feed');
    if (typeof onDone === 'function') {
      onDone([donePayload]);
    }
    if (count > 0 && results[0]) {
      const hint =
        count === 1
          ? `${results[0].sectorName} · ${results[0].functionUserLabel}`
          : `${count} focus areas (e.g. ${results[0].displayName})`;
      showCompletionToast(count === 1 ? results[0].displayName : `${count} focus areas`, hint);
    }
  }

  function renderModal() {
    overlay.innerHTML = `
      <div class="obrium-modal-overlay" role="dialog" aria-modal="true" aria-label="Focus Area deployment modal">
        <div class="obrium-modal-content obrium-modal-container glass-panel deploy-cyan deploy-phase-${state.phase}">
          <button
            type="button"
            class="deploy-modal-close-btn"
            data-deploy-close
            aria-label="Close deployment wizard"
            title="Close"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
          ${getHeaderContextMarkup()}
          <div class="deploy-header-row">
            ${
              state.phase > 0 && state.phase < 3
                ? '<button type="button" class="deploy-back-btn" data-deploy-nav="back" aria-label="Back to previous step">← Back</button>'
                : '<span class="deploy-back-spacer" aria-hidden="true"></span>'
            }
            <h1 class="modal-header system-text">${getHeaderTitle()}</h1>
          </div>
          <div class="deploy-phase-body">${renderPhaseBody()}</div>
          <div class="deploy-modal-footer">
            <button class="modal-continue-btn hardware-gold-btn${state.phase < 2 ? ' modal-continue-btn--compact' : ''}" type="button">${getContinueLabel()}</button>
          </div>
        </div>
      </div>
    `;

    const modalOverlay = overlay.querySelector('.obrium-modal-overlay');
    modalOverlay?.addEventListener('click', (e) => {
      if (e.target === modalOverlay && !state.isBusy) dismissWizard();
    });

    overlay.querySelector('[data-deploy-close]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissWizard();
    });

    if (state.phase === 0) {
      overlay.querySelectorAll('[data-focus-area-id]').forEach((cardEl) => {
        cardEl.addEventListener('click', () => {
          const id = cardEl.getAttribute('data-focus-area-id');
          if (!id || state.isBusy) return;
          // Single-select: picking a tile replaces the previous pick; re-click deselects.
          if (state.selectedSectorIds.has(id)) state.selectedSectorIds.clear();
          else state.selectedSectorIds = new Set([id]);
          renderModal();
        });
      });
    }

    if (state.phase === 1) {
      overlay.querySelectorAll('[data-function-id]').forEach((cardEl) => {
        cardEl.addEventListener('click', () => {
          const id = cardEl.getAttribute('data-function-id');
          if (!id || state.isBusy) return;
          if (state.selectedFunctionIds.has(id)) state.selectedFunctionIds.delete(id);
          else state.selectedFunctionIds.add(id);
          renderModal();
        });
      });
    }

    overlay.querySelectorAll('[data-deploy-bulk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.isBusy) return;
        const act = btn.getAttribute('data-deploy-bulk');
        if (act === 'functions-all') {
          getVisibleLogicFunctions().forEach((f) => state.selectedFunctionIds.add(f.id));
        } else if (act === 'functions-clear') state.selectedFunctionIds.clear();
        renderModal();
      });
    });

    overlay.querySelector('[data-deploy-nav="back"]')?.addEventListener('click', () => {
      if (state.isBusy) return;
      if (state.phase === 2) state.phase = 1;
      else if (state.phase === 1) state.phase = 0;
      renderModal();
    });

    if (state.phase === 2) {
      overlay.querySelectorAll('[data-source-id]').forEach((rowEl) => {
        rowEl.addEventListener('click', () => {
          const id = rowEl.getAttribute('data-source-id');
          if (!id || state.isBusy) return;
          if (state.selectedSourceIds.has(id)) state.selectedSourceIds.delete(id);
          else state.selectedSourceIds.add(id);
          renderModal();
        });
      });
    }

    const continueBtn = overlay.querySelector('.modal-continue-btn');
    if (continueBtn instanceof HTMLButtonElement) {
      continueBtn.disabled = isContinueDisabled() || state.isBusy;
      continueBtn.setAttribute('aria-disabled', continueBtn.disabled ? 'true' : 'false');
      if (state.phase === 2 && getDuplicateSelections().length > 0) {
        continueBtn.title = 'Initialization Blocked: This Focus Area is already active.';
      } else {
        continueBtn.removeAttribute('title');
      }
      continueBtn.addEventListener('click', () => {
        if (continueBtn.disabled || state.isBusy) return;
        if (state.phase === 0) {
          // Domain filter for behavior modes depends on the picked area.
          pruneInvalidFunctionSelections();
          state.phase = 1;
        } else if (state.phase === 1) {
          // Reset to the default stream (System Telemetry) on every entry to Phase 02.
          state.selectedSourceIds = new Set([DEFAULT_SOURCE_ID]);
          state.phase = 2;
        } else if (state.phase === 2) {
          void runInitializationSequence();
          return;
        }
        renderModal();
      });
    }
  }

  renderModal();
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
}
