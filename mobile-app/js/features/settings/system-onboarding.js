// Serron — First-launch system onboarding (Personal OS)
// @owner: settings / onboarding
// @role: init
// Lean pipeline: Welcome → AI/Legal consent → Focus Areas → Feed/Talk.
// Health forms (blood type, allergies, fitness devices) stay in Profile, not here.

import {
  STARTER_FOCUS_AREAS,
  FOCUS_AREAS_MIN,
  FOCUS_AREAS_MAX,
  saveSelectedFocusAreaIds,
  getSelectedFocusAreaIds,
  getFocusAreaById,
} from '../human-os/focus-areas.js';
import {
  addUserAgent,
  findUserAgentByFocusAreaId,
} from '../human-os/user-agents.js';
import {
  writeAgentInsight,
  getCommonLedger,
  LEDGER_SOURCE_ULTIMATE_CREATOR,
} from '../human-os/common-ledger.js';

const ONBOARDING_KEY = 'tendai_system_onboarding_v1';
const GREETING_KEY = 'tendai_onboarding_greeting';
const OPEN_TALK_KEY = 'tendai_open_talk_after_onboarding';
const AI_CONSENT_KEY = 'tendai_ai_consent_v1';
const ONBOARDING_COMPLETED_ON_KEY = 'tendai_onboarding_completed_on';

const STEP_WELCOME = 'welcome';
const STEP_CONSENT = 'consent';
const STEP_FOCUS = 'focus';

function isOnboardingComplete() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function markOnboardingComplete() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
    const today = localDateKey();
    localStorage.setItem(ONBOARDING_COMPLETED_ON_KEY, today);
    // Missed-day detection starts from the day the profile exists, not from earlier app opens.
    localStorage.setItem('tendai_last_sync_date', today);
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.__obriumHistorySync = { isSyncing: false, gapDays: 0, missingDateKeys: [] };
  }
}

function hasAcknowledgedAiProcessing() {
  try {
    return !!localStorage.getItem(AI_CONSENT_KEY);
  } catch (_) {
    return false;
  }
}

function markAiProcessingAcknowledged() {
  try {
    localStorage.setItem(AI_CONSENT_KEY, new Date().toISOString());
  } catch (_) {}
}

function buildOnboardingGreeting() {
  const parts = [];
  const steps = typeof window !== 'undefined' && window.HealthSync?.getStepsToday?.();
  const bpm = typeof window !== 'undefined' && window.HealthSync?.getHeartRateBpm?.();
  if (steps != null && Number.isFinite(steps)) {
    parts.push(`about ${Number(steps).toLocaleString()} steps today`);
  }
  if (bpm != null && Number.isFinite(bpm)) {
    parts.push(`a recent heart rate of ${bpm} bpm`);
  }

  let lead = "I'm online and starting to learn your baseline from conversation and whatever data you share.";
  if (parts.length === 1) {
    lead = `I'm online. From your health data I can already see ${parts[0]}.`;
  } else if (parts.length > 1) {
    lead = `I'm online. From your health data I can see ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
  }

  return `${lead} Ask me anything — I'll answer from your personal context as it grows.`;
}

/**
 * Persist onboarding Focus Area picks as live Feed cards (user-agent + ledger insight).
 * Also backfills missing insight rows when agents already exist (empty-Feed heal).
 * @param {string[]} [ids]
 * @returns {string[]} display names that were created or backfilled
 */
export function deployOnboardingFocusAreas(ids) {
  const list = Array.isArray(ids) && ids.length ? ids : getSelectedFocusAreaIds();
  const created = [];
  const ledger = getCommonLedger();
  const insightNames = new Set(
    (ledger.agent_insights || [])
      .map((r) => String(r?.agent || '').trim().toLowerCase())
      .filter(Boolean)
  );

  for (const id of list) {
    const area = getFocusAreaById(id);
    if (!area) continue;

    let ua = findUserAgentByFocusAreaId(area.id);
    if (!ua) {
      ua = addUserAgent({
        name: area.name,
        instruction: `Focus Area: ${area.name}. ${area.desc} Goal: ${area.init?.goalLabel || area.name}.`,
        trackingLifeAreaId: area.id,
        trackingGoalLabel: area.init?.goalLabel || area.name,
        behaviorModeId: 'watchdog',
        maturity_stage: 0,
      });
    }

    const name = String(ua?.name || area.name).trim();
    if (!name) continue;
    if (!insightNames.has(name.toLowerCase())) {
      writeAgentInsight(
        name,
        `${name} is live. Building your baseline from profile and science.`,
        { source: LEDGER_SOURCE_ULTIMATE_CREATOR }
      );
      insightNames.add(name.toLowerCase());
      created.push(name);
    }
  }
  return created;
}

function refreshFeedAndProfile() {
  try {
    if (typeof window === 'undefined') return;
    if (typeof window.updateFeedUI === 'function') void window.updateFeedUI();
    else if (typeof window.renderAgentReportsSection === 'function') {
      window.renderAgentReportsSection();
    }
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI();
  } catch (_) {}
}

async function finishOnboarding(answers) {
  markOnboardingComplete();

  const focusIds = Array.isArray(answers.focusAreaIds) ? answers.focusAreaIds : [];
  if (focusIds.length) {
    saveSelectedFocusAreaIds(focusIds);
  }
  deployOnboardingFocusAreas(focusIds.length ? focusIds : getSelectedFocusAreaIds());

  refreshFeedAndProfile();

  const greeting = buildOnboardingGreeting();
  try {
    sessionStorage.setItem(GREETING_KEY, greeting);
    sessionStorage.setItem(OPEN_TALK_KEY, '1');
  } catch (_) {}

  if (typeof window !== 'undefined' && window.__obriumTalkComponent) {
    if (typeof window.switchView === 'function') window.switchView('talk');
    if (typeof window.__obriumTalkComponent.deliverOnboardingGreeting === 'function') {
      window.__obriumTalkComponent.deliverOnboardingGreeting(greeting);
      try {
        sessionStorage.removeItem(GREETING_KEY);
        sessionStorage.removeItem(OPEN_TALK_KEY);
      } catch (_) {}
    }
  }
}

/**
 * Boot-time heal: if Focus Areas were saved but Feed cards missing, deploy them.
 * Safe to call after Feed modules are ready.
 */
export function ensureOnboardingFocusAreasInFeed() {
  try {
    if (!isOnboardingComplete()) return [];
    const created = deployOnboardingFocusAreas(getSelectedFocusAreaIds());
    if (created.length) refreshFeedAndProfile();
    else if (typeof window !== 'undefined' && typeof window.updateProfileUI === 'function') {
      window.updateProfileUI();
    }
    return created;
  } catch (_) {
    return [];
  }
}

/**
 * Show lean 3-phase onboarding on first launch only.
 * Phase 1 Welcome → Phase 2 AI/Legal consent → Phase 3 Focus Areas → Talk.
 */
export function initSystemOnboarding() {
  if (initSystemOnboarding.initialized) return;
  initSystemOnboarding.initialized = true;

  if (isOnboardingComplete()) return;

  document.body.classList.add('onboarding-active');

  const answers = {
    focusAreaIds: /** @type {string[]} */ ([]),
  };

  let step = STEP_WELCOME;

  const overlay = document.createElement('div');
  overlay.id = 'systemOnboardingOverlay';
  overlay.className = 'profile-modal-overlay welcome-modal-overlay system-onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  function render() {
    let body = '';
    let footer = '';

    if (step === STEP_WELCOME) {
      body = `
        <h2 class="card-title system-onboarding-title">Obrium learns you.</h2>
        <p class="welcome-modal-text system-onboarding-subtitle">Not from forms — from your data and conversation.</p>
      `;
      footer = `<button type="button" class="btn btn-initialize profile-modal-save" data-os-next>Get Started</button>`;
    } else if (step === STEP_CONSENT) {
      body = `
        <h2 class="card-title system-onboarding-title">How Obrium uses AI</h2>
        <p class="welcome-modal-text">Talk's replies, Feed advice and automatic health checks are written by Google's Gemini. To do that, Obrium sends the relevant profile and health data you've provided to Google's Gemini API through its relay server. Because Obrium currently uses Gemini's free tier, Google may use this data to improve its AI models, and it may be reviewed by people at Google (<a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener" class="system-onboarding-link" data-os-google-terms-link>Google's Gemini API terms</a>). You can switch off automatic profile questions, health checks and Feed advice in Settings → Privacy &amp; Security.</p>
        <p class="welcome-modal-text"><a href="privacy-policy.html" target="_blank" rel="noopener" class="system-onboarding-link" data-os-privacy-link>Read the Privacy Policy</a></p>
      `;
      footer = `<button type="button" class="btn btn-initialize profile-modal-save" data-os-ack-ai>I understand</button>`;
    } else if (step === STEP_FOCUS) {
      const chips = STARTER_FOCUS_AREAS.map((area) => {
        const selected = answers.focusAreaIds.includes(area.id);
        return `
          <button type="button" class="btn system-onboarding-focus-chip${selected ? ' is-selected' : ''}" data-os-focus-area="${area.id}" aria-pressed="${selected}">
            ${area.name}
          </button>
        `;
      }).join('');
      body = `
        <h2 class="card-title system-onboarding-title">Choose your Focus Areas</h2>
        <p class="welcome-modal-text system-onboarding-subtitle">Pick ${FOCUS_AREAS_MIN} to ${FOCUS_AREAS_MAX} priorities to start. You can add more later.</p>
        <div class="system-onboarding-focus-grid">${chips}</div>
        <p class="welcome-modal-text system-onboarding-focus-count" data-os-focus-count aria-live="polite">${answers.focusAreaIds.length} of ${FOCUS_AREAS_MAX} selected</p>
      `;
      const canContinue =
        answers.focusAreaIds.length >= FOCUS_AREAS_MIN &&
        answers.focusAreaIds.length <= FOCUS_AREAS_MAX;
      footer = `<button type="button" class="btn btn-initialize profile-modal-save" data-os-finish ${canContinue ? '' : 'disabled'}>Continue</button>`;
    }

    overlay.innerHTML = `
      <div class="profile-modal welcome-modal system-onboarding-modal">
        <div class="profile-modal-content system-onboarding-content">${body}</div>
        ${
          footer
            ? `<div class="profile-modal-footer system-onboarding-footer">${footer}</div>`
            : ''
        }
      </div>
    `;

    overlay.querySelector('[data-os-next]')?.addEventListener('click', () => {
      if (step !== STEP_WELCOME) return;
      step = hasAcknowledgedAiProcessing() ? STEP_FOCUS : STEP_CONSENT;
      render();
    });

    overlay.querySelector('[data-os-ack-ai]')?.addEventListener('click', () => {
      markAiProcessingAcknowledged();
      try { window.refreshWeatherCard?.(); } catch (_) {}
      step = STEP_FOCUS;
      render();
    });

    overlay.querySelectorAll('[data-os-focus-area]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-os-focus-area');
        if (!id) return;
        const idx = answers.focusAreaIds.indexOf(id);
        if (idx >= 0) {
          answers.focusAreaIds.splice(idx, 1);
        } else if (answers.focusAreaIds.length < FOCUS_AREAS_MAX) {
          answers.focusAreaIds.push(id);
        }
        render();
      });
    });

    overlay.querySelector('[data-os-finish]')?.addEventListener('click', () => {
      if (
        answers.focusAreaIds.length < FOCUS_AREAS_MIN ||
        answers.focusAreaIds.length > FOCUS_AREAS_MAX
      ) return;
      saveSelectedFocusAreaIds(answers.focusAreaIds);
      overlay.classList.remove('is-active');
      document.body.classList.remove('onboarding-active');
      void finishOnboarding(answers);
      window.setTimeout(() => overlay.remove(), 300);
    });
  }

  document.body.appendChild(overlay);
  render();
  requestAnimationFrame(() => overlay.classList.add('is-active'));
}

export { isOnboardingComplete, GREETING_KEY, OPEN_TALK_KEY };
