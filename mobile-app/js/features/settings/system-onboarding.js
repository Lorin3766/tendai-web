// Serron — First-launch system onboarding (Personal OS)
// @owner: settings / onboarding
// @role: init

import { profileState, resolveAgeYears } from '../../state.js';
import { requestHealthPermissions, refresh } from '../storage/health-sync.js';
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
const CONSENT_STEP = 'consent';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function isOnboardingComplete() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function markOnboardingComplete() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
    localStorage.setItem('tendai_welcome_accepted', '1');
  } catch (_) {}
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

function buildOnboardingGreeting(answers) {
  const parts = [];
  const steps = typeof window !== 'undefined' && window.HealthSync?.getStepsToday?.();
  const bpm = typeof window !== 'undefined' && window.HealthSync?.getHeartRateBpm?.();
  if (steps != null && Number.isFinite(steps)) {
    parts.push(`about ${Number(steps).toLocaleString()} steps today`);
  }
  if (bpm != null && Number.isFinite(bpm)) {
    parts.push(`a recent heart rate of ${bpm} bpm`);
  }

  let lead = "I'm online and starting to learn your baseline from what you've shared.";
  if (parts.length === 1) {
    lead = `I'm online. From your health data I can already see ${parts[0]}.`;
  } else if (parts.length > 1) {
    lead = `I'm online. From your health data I can see ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
  }

  const detailBits = [];
  if (answers.birthYear) detailBits.push(`born ${answers.birthYear}`);
  if (answers.bloodType && answers.bloodType !== 'unknown') {
    detailBits.push(`blood type ${answers.bloodType}`);
  }
  if (answers.hasAllergies === true) detailBits.push('noted allergies on file');
  if (answers.hasAllergies === false) detailBits.push('no known allergies noted');

  const profileLine =
    detailBits.length > 0 ? ` I also have ${detailBits.join(', ')}.` : '';

  return `${lead}${profileLine} Ask me anything — I'll answer from your personal context as it grows.`;
}

function saveProfileFromAnswers(answers) {
  const profile = profileState.get();
  profile.body = profile.body || {};
  profile.health = profile.health || {};

  if (answers.birthYear) {
    profile.body.birthYear = answers.birthYear;
    // birthYear is source of truth; age is derived (same helper as sidebar)
    const age = resolveAgeYears({ birthYear: answers.birthYear });
    if (age != null) profile.body.age = age;
  }

  if (answers.bloodType === 'unknown') {
    profile.body.bloodType = null;
    profile.health.knowsBloodType = false;
  } else if (answers.bloodType) {
    profile.body.bloodType = answers.bloodType;
    profile.health.knowsBloodType = true;
  }

  if (answers.hasAllergies === true) {
    profile.health.hasAllergies = true;
  } else if (answers.hasAllergies === false) {
    profile.health.hasAllergies = false;
  }

  profileState.save(profile);
  try {
    if (typeof window !== 'undefined' && typeof window.updateProfileUI === 'function') {
      window.updateProfileUI();
    }
  } catch (_) {}
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
  saveProfileFromAnswers(answers);

  const focusIds = Array.isArray(answers.focusAreaIds) ? answers.focusAreaIds : [];
  if (focusIds.length) {
    saveSelectedFocusAreaIds(focusIds);
  }
  deployOnboardingFocusAreas(focusIds.length ? focusIds : getSelectedFocusAreaIds());

  try {
    await requestHealthPermissions();
    await refresh();
  } catch (_) {}

  refreshFeedAndProfile();

  const greeting = buildOnboardingGreeting(answers);
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
 * Show multi-step onboarding on first launch only.
 */
export function initSystemOnboarding() {
  if (initSystemOnboarding.initialized) return;
  initSystemOnboarding.initialized = true;

  if (isOnboardingComplete()) return;

  document.body.classList.add('onboarding-active');

  const answers = {
    birthYear: null,
    bloodType: null,
    hasAllergies: null,
    healthConnected: false,
    focusAreaIds: /** @type {string[]} */ ([]),
  };

  let step = 1;

  const overlay = document.createElement('div');
  overlay.id = 'systemOnboardingOverlay';
  overlay.className = 'profile-modal-overlay welcome-modal-overlay system-onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  function bloodTypePickerOptions(selectedValue) {
    const types = BLOOD_TYPES.map((t) => {
      const selected = selectedValue === t;
      return `<li role="option" class="system-onboarding-picker-option${selected ? ' is-selected' : ''}" data-value="${t}" aria-selected="${selected}">${t}</li>`;
    }).join('');
    const unknownSelected = selectedValue === 'unknown';
    return `${types}<li role="option" class="system-onboarding-picker-option${unknownSelected ? ' is-selected' : ''}" data-value="unknown" aria-selected="${unknownSelected}">I don't know</li>`;
  }

  function bloodTypeLabel(value) {
    if (!value) return 'Select blood type';
    if (value === 'unknown') return "I don't know";
    return value;
  }

  function render() {
    let body = '';
    let footer = '';

    if (step === 1) {
      body = `
        <h2 class="card-title system-onboarding-title">Obrium learns you.</h2>
        <p class="welcome-modal-text system-onboarding-subtitle">Not from forms — from your data and conversation.</p>
      `;
      footer = `<button type="button" class="btn btn-initialize profile-modal-save" data-os-next>Get Started</button>`;
    } else if (step === CONSENT_STEP) {
      body = `
        <h2 class="card-title system-onboarding-title">How Obrium uses AI</h2>
        <p class="welcome-modal-text">Talk's replies, Feed advice and automatic health checks are written by Google's Gemini. To do that, Obrium sends the relevant profile and health data you've provided to Google's Gemini API through its relay server. Because Obrium currently uses Gemini's free tier, Google may use this data to improve its AI models, and it may be reviewed by people at Google (<a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener" class="system-onboarding-link" data-os-google-terms-link>Google's Gemini API terms</a>). You can switch off automatic profile questions, health checks and Feed advice in Settings → Privacy &amp; Security.</p>
        <p class="welcome-modal-text"><a href="privacy-policy.html" target="_blank" rel="noopener" class="system-onboarding-link" data-os-privacy-link>Read the Privacy Policy</a></p>
      `;
      footer = `<button type="button" class="btn btn-initialize profile-modal-save" data-os-ack-ai>I understand</button>`;
    } else if (step === 2) {
      body = `
        <h2 class="card-title system-onboarding-title">Connect your health data</h2>
        <p class="welcome-modal-text">This helps Obrium understand you faster — no extra typing needed.</p>
      `;
      footer = `
        <button type="button" class="btn ghost profile-modal-cancel" data-os-skip-health>Skip for now</button>
        <button type="button" class="btn btn-initialize profile-modal-save" data-os-allow-health>Allow Access</button>
      `;
    } else if (step === 3) {
      body = `
        <h2 class="card-title system-onboarding-title">What year were you born?</h2>
        <label class="system-onboarding-field">
          <span class="sr-only">Birth year</span>
          <input type="number" class="profile-input system-onboarding-input" data-os-birth-year min="1920" max="${new Date().getFullYear()}" placeholder="e.g. 1990" inputmode="numeric" />
        </label>
      `;
      footer = `<button type="button" class="btn btn-initialize profile-modal-save" data-os-next disabled>Continue</button>`;
    } else if (step === 4) {
      const currentBlood =
        answers.bloodType && answers.bloodType !== 'unknown' ? answers.bloodType : '';
      const hasBlood = !!currentBlood;
      body = `
        <h2 class="card-title system-onboarding-title">Do you know your blood type?</h2>
        <div class="system-onboarding-field">
          <span class="sr-only" id="osBloodTypeLabel">Blood type</span>
          <div class="system-onboarding-picker" data-os-blood-picker>
            <button
              type="button"
              class="system-onboarding-picker-trigger${!hasBlood ? ' is-placeholder' : ''}"
              data-os-blood-trigger
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-labelledby="osBloodTypeLabel"
            >
              <span data-os-blood-label>${bloodTypeLabel(currentBlood)}</span>
              <span class="system-onboarding-picker-chevron" aria-hidden="true"></span>
            </button>
            <input type="hidden" data-os-blood-type value="${currentBlood}" />
            <ul class="system-onboarding-picker-list" role="listbox" data-os-blood-list hidden>
              ${bloodTypePickerOptions(currentBlood)}
            </ul>
          </div>
        </div>
      `;
      footer = `
        <button type="button" class="btn ghost profile-modal-cancel" data-os-skip-blood>Skip for now</button>
        <button type="button" class="btn btn-initialize profile-modal-save" data-os-next ${hasBlood ? '' : 'disabled'}>Continue</button>
      `;
    } else if (step === 5) {
      body = `
        <h2 class="card-title system-onboarding-title">Do you have any known allergies?</h2>
        <div class="system-onboarding-choices" role="group" aria-label="Known allergies">
          <button type="button" class="system-onboarding-choice system-onboarding-choice--secondary" data-os-allergies="yes">Yes</button>
          <button type="button" class="system-onboarding-choice system-onboarding-choice--primary" data-os-allergies="no">No</button>
        </div>
      `;
      footer = '';
    } else if (step === 6) {
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
        <p class="welcome-modal-text system-onboarding-subtitle">Pick ${FOCUS_AREAS_MIN} to ${FOCUS_AREAS_MAX} to start. You can add more later.</p>
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
      if (step === 1) {
        step = hasAcknowledgedAiProcessing() ? 2 : CONSENT_STEP;
        render();
        return;
      }
      if (step === 3) {
        const input = overlay.querySelector('[data-os-birth-year]');
        const year = parseInt(input?.value, 10);
        if (!Number.isFinite(year) || year < 1920 || year > new Date().getFullYear()) return;
        answers.birthYear = year;
        step = 4;
        render();
        return;
      }
      if (step === 4) {
        const sel = overlay.querySelector('[data-os-blood-type]');
        const val = sel?.value;
        if (!val) return;
        answers.bloodType = val;
        step = 5;
        render();
      }
    });

    overlay.querySelector('[data-os-ack-ai]')?.addEventListener('click', () => {
      markAiProcessingAcknowledged();
      try { window.refreshWeatherCard?.(); } catch (_) {}
      step = 2;
      render();
    });

    overlay.querySelector('[data-os-allow-health]')?.addEventListener('click', async () => {
      try {
        const granted = await requestHealthPermissions();
        answers.healthConnected = !!granted;
        await refresh();
      } catch (_) {}
      step = 3;
      render();
    });

    overlay.querySelector('[data-os-skip-health]')?.addEventListener('click', () => {
      answers.healthConnected = false;
      step = 3;
      render();
    });

    overlay.querySelector('[data-os-skip-blood]')?.addEventListener('click', () => {
      answers.bloodType = 'unknown';
      step = 5;
      render();
    });

    const birthInput = overlay.querySelector('[data-os-birth-year]');
    const birthBtn = overlay.querySelector('[data-os-next]');
    if (birthInput && birthBtn && step === 3) {
      birthInput.focus();
      birthInput.addEventListener('input', () => {
        const year = parseInt(birthInput.value, 10);
        birthBtn.disabled = !(year >= 1920 && year <= new Date().getFullYear());
      });
    }

    const bloodPicker = overlay.querySelector('[data-os-blood-picker]');
    const bloodTrigger = overlay.querySelector('[data-os-blood-trigger]');
    const bloodList = overlay.querySelector('[data-os-blood-list]');
    const bloodInput = overlay.querySelector('[data-os-blood-type]');
    const bloodLabel = overlay.querySelector('[data-os-blood-label]');
    const bloodBtn = overlay.querySelector('[data-os-next]');
    if (bloodPicker && bloodTrigger && bloodList && bloodInput && bloodLabel && bloodBtn && step === 4) {
      let outsideClose = null;
      let onReposition = null;

      const clearListPosition = () => {
        bloodList.style.position = '';
        bloodList.style.left = '';
        bloodList.style.right = '';
        bloodList.style.top = '';
        bloodList.style.bottom = '';
        bloodList.style.width = '';
        bloodList.style.maxHeight = '';
        bloodList.style.zIndex = '';
      };

      const placeList = () => {
        const rect = bloodTrigger.getBoundingClientRect();
        const gap = 6;
        const maxH = Math.min(220, Math.round(window.innerHeight * 0.36));
        const spaceBelow = window.innerHeight - rect.bottom - gap - 16;
        const spaceAbove = rect.top - gap - 16;
        const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
        const available = Math.max(120, openUp ? spaceAbove : spaceBelow);
        const height = Math.min(maxH, available);

        bloodList.style.position = 'fixed';
        bloodList.style.left = `${Math.round(rect.left)}px`;
        bloodList.style.width = `${Math.round(rect.width)}px`;
        bloodList.style.right = 'auto';
        bloodList.style.zIndex = '10050';
        bloodList.style.maxHeight = `${height}px`;
        if (openUp) {
          bloodList.style.top = 'auto';
          bloodList.style.bottom = `${Math.round(window.innerHeight - rect.top + gap)}px`;
        } else {
          bloodList.style.bottom = 'auto';
          bloodList.style.top = `${Math.round(rect.bottom + gap)}px`;
        }
      };

      const setOpen = (open) => {
        bloodList.hidden = !open;
        bloodTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        bloodPicker.classList.toggle('is-open', open);
        if (outsideClose) {
          document.removeEventListener('pointerdown', outsideClose, true);
          outsideClose = null;
        }
        if (onReposition) {
          window.removeEventListener('resize', onReposition);
          window.removeEventListener('scroll', onReposition, true);
          onReposition = null;
        }
        if (!open) {
          clearListPosition();
          return;
        }
        placeList();
        onReposition = () => placeList();
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        outsideClose = (e) => {
          if (!bloodPicker.contains(e.target) && !bloodList.contains(e.target)) setOpen(false);
        };
        document.addEventListener('pointerdown', outsideClose, true);
      };

      bloodTrigger.addEventListener('click', () => {
        setOpen(bloodList.hidden);
      });

      bloodList.querySelectorAll('[role="option"]').forEach((opt) => {
        opt.addEventListener('click', () => {
          const value = opt.getAttribute('data-value') || '';
          bloodInput.value = value;
          bloodLabel.textContent = bloodTypeLabel(value);
          bloodTrigger.classList.toggle('is-placeholder', !value);
          bloodList.querySelectorAll('[role="option"]').forEach((el) => {
            const on = el === opt;
            el.classList.toggle('is-selected', on);
            el.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          bloodBtn.disabled = !value;
          setOpen(false);
        });
      });
    }

    overlay.querySelectorAll('[data-os-allergies]').forEach((btn) => {
      btn.addEventListener('click', () => {
        answers.hasAllergies = btn.getAttribute('data-os-allergies') === 'yes';
        step = 6;
        render();
      });
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
