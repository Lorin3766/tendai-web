// Serron — Ecosystem Bridge
// @owner: talk / services
// Connects Sidebar (Create my plan, Labs, Online Doctor) to TALK and FEED

import { profileState } from '../../state.js';

const RECOVERY_DIP_THRESHOLD = 60;

function getUserName() {
  try {
    const name = profileState.get()?.body?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : '';
  } catch (_) {
    return '';
  }
}

/** @returns {number|null} Real recovery % from the Feed sensor tile, or null when there is no reading. */
function getRecoveryFromFeed() {
  const el = document.getElementById('sensorValueRecovery');
  if (!el || el.classList.contains('sensor-tile-value--empty')) return null;
  const n = parseInt((el.textContent || '').replace(/%/g, '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Daily tasks for Intense Training mode (Action Steps checklist) */
const DAILY_TASKS_INTENSE_TRAINING = [
  { id: 'water', label: 'Drink 3L water' },
  { id: 'intensity', label: '85% Intensity session' },
  { id: 'magnesium', label: 'Magnesium at 9PM' }
];

/** Plan templates: 3-point (Nutrition, Load, Sleep) per strategy */
const PLAN_TEMPLATES = {
  'intense-training': {
    nutrition: 'High protein + carbs 1–2h before/after training. Hydrate 2–3 L.',
    load: '2–3 quality sessions. Focus on intensity over volume.',
    sleep: '7–8h. Wind down 30 min before bed.'
  },
  'active-recovery': {
    nutrition: 'Anti-inflammatory focus: omega-3, greens, moderate carbs.',
    load: 'Light movement only: walk, stretch, max 30 min low intensity.',
    sleep: '8h+. Prioritize consistency and dark room.'
  },
  'optimize-competition': {
    nutrition: 'Peak fuel: carb load 24–48h prior, electrolytes, no new foods.',
    load: 'Taper. One short sharp session or rest. No fatigue carryover.',
    sleep: '8h+ with fixed wake. Same bedtime as race week.'
  }
};

/**
 * Start "Create my plan" flow: switch to TALK, show analyzing message + 3 strategy buttons, then plan.
 * @param {Object} talkComponent - TalkComponent instance
 */
export function startPlanGenerationFlow(talkComponent) {
  if (!talkComponent || !talkComponent.conversationArea) return;
  const recovery = getRecoveryFromFeed();
  const name = getUserName();
  const greet = name ? `${name}, ` : '';
  const header = recovery != null ? '[ ANALYZING CURRENT BIOMETRICS ]' : '[ BUILD YOUR PLAN ]';
  const body = recovery != null
    ? `${greet}based on your current Recovery reading (${recovery}%), I am ready to build your strategy.`
    : `${greet}I don't have a Recovery reading yet, so this plan is a general template rather than one tuned to your data. Pick a focus:`;
  talkComponent.addSystemMessage(header, body, false);

  const buttons = [
    { label: '[ INTENSE TRAINING ]', id: 'intense-training' },
    { label: '[ ACTIVE RECOVERY ]', id: 'active-recovery' },
    { label: '[ OPTIMIZE FOR COMPETITION ]', id: 'optimize-competition' }
  ];
  const block = talkComponent.appendActionButtons(buttons, (id) => {
    if (!block || !block.parentNode) return;
    block.remove();
    talkComponent.setInputProcessing(true);
    const plan = PLAN_TEMPLATES[id] || PLAN_TEMPLATES['active-recovery'];
    const planText = `Plan for Today:\n• Nutrition: ${plan.nutrition}\n• Load: ${plan.load}\n• Sleep: ${plan.sleep}`;
    setTimeout(() => {
      talkComponent.addSystemMessage('[ PLAN FOR TODAY ]', planText, true, true);
      if (id === 'intense-training' && talkComponent.appendChecklist) {
        talkComponent.appendChecklist(DAILY_TASKS_INTENSE_TRAINING);
      }
      if (id === 'intense-training' && recovery != null && recovery < RECOVERY_DIP_THRESHOLD) {
        setTimeout(() => {
          talkComponent.addSystemMessage(
            '[ OBRIUM NOTICE ]',
            `Your current Recovery reading is ${recovery}%, which is low for intense training. Would you like to prepare a brief for your doctor before proceeding?`,
            true
          );
          talkComponent.scrollToBottom();
        }, 400);
      }
      talkComponent.setInputProcessing(false);
      talkComponent.scrollToBottom();
    }, 800);
  });
}

/**
 * Start Secure Medical Channel: system message, doctor greeting, temporary dark blue chat header.
 * @param {Object} talkComponent - TalkComponent instance
 */
export function startSecureMedicalChannel(talkComponent) {
  const talkView = document.getElementById('talk-view');
  if (talkView) {
    talkView.setAttribute('data-talk-mode', 'secure-medical');
    document.body.classList.add('talk-header-secure-channel');
    const removeBlue = () => document.body.classList.remove('talk-header-secure-channel');
    setTimeout(removeBlue, 6000);
  }
  if (!talkComponent) return;
  talkComponent.addSystemMessage(
    'SYSTEM',
    'Obrium is not connected to any doctors or specialists yet. You are chatting with Doctor AI, an automated assistant.',
    true
  );
  const header = '[ DOCTOR AI ]';
  const body = 'Doctor AI is online. I can only see lab results and vital signs you have added to Obrium, and I cannot diagnose or replace a clinician. What is your concern?';
  talkComponent.addSystemMessage(header, body, true);
}

function closeLabsOverlay(overlay) {
  overlay.classList.remove('is-active');
}

/**
 * Open Labs modal: User Autonomy — three paths (Generate Medical Brief, Consult Online MD, Schedule Home Lab).
 * @param {string} labId - e.g. 'blood-test', 'cholesterol'
 * @param {string} labName - e.g. 'Blood test', 'Cholesterol'
 */
export function openLabsReportModal(labId, labName) {
  let overlay = document.getElementById('labsReportOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'labsReportOverlay';
    overlay.className = 'profile-modal-overlay';
    overlay.innerHTML = `
      <div class="profile-modal labs-autonomy-modal" id="labsReportModal">
        <div class="profile-modal-header">
          <h3 class="card-title labs-report-title" id="labsReportTitle"></h3>
          <button type="button" class="profile-modal-close" id="labsReportClose" aria-label="Close">×</button>
        </div>
        <div class="labs-report-content" id="labsReportContent"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#labsReportClose').addEventListener('click', () => closeLabsOverlay(overlay));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLabsOverlay(overlay);
    });
  }

  const titleEl = overlay.querySelector('#labsReportTitle');
  const contentEl = overlay.querySelector('#labsReportContent');
  if (!titleEl || !contentEl) return;

  titleEl.textContent = labName;

  // Screen 1: Three choices (User Autonomy)
  contentEl.innerHTML = `
    <div class="labs-autonomy-choices" id="labsAutonomyChoices">
      <p class="labs-autonomy-intro">Choose how to use your lab data. You decide.</p>
      <div class="labs-choice-card labs-choice-primary">
        <button type="button" class="labs-choice-btn labs-choice-btn-primary" id="labsChoiceMedicalBrief" data-action="medical-brief">
          <span class="labs-choice-icon labs-choice-icon-shield" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
          <span class="labs-choice-label">Generate Medical Brief</span>
        </button>
        <p class="labs-choice-subtext">View a summary of your trends to show your doctor.</p>
      </div>
      <div class="labs-choice-card">
        <button type="button" class="labs-choice-btn" id="labsChoiceOnlineMD" data-action="online-md">
          <span class="labs-choice-label">Consult Online MD</span>
        </button>
        <p class="labs-choice-subtext">Coming soon: 10-min sync with a partner specialist ($29). Not bookable yet.</p>
      </div>
      <div class="labs-choice-card labs-choice-secondary">
        <button type="button" class="labs-choice-btn labs-choice-btn-secondary" id="labsChoiceHomeLab" data-action="home-lab">
          <span class="labs-choice-label">Schedule Home Lab</span>
        </button>
        <p class="labs-choice-subtext">Coming soon: nurse visit for sample collection ($149). Not bookable yet.</p>
      </div>
    </div>
  `;

  overlay.querySelector('#labsChoiceMedicalBrief').addEventListener('click', () => {
    showMedicalBriefLoading(contentEl, overlay, labName);
  });
  overlay.querySelector('#labsChoiceOnlineMD').addEventListener('click', () => {
    closeLabsOverlay(overlay);
    if (typeof window.switchView === 'function') window.switchView('talk');
    const talkComponent = window.__serronTalkComponent;
    if (talkComponent) {
      talkComponent.addSystemMessage('[ CONSULT ]', 'Online MD consults are not available yet: Obrium has no booking partner connected, so no request was sent and nobody will contact you. Until then, please book with your own doctor or a telehealth service directly.', true);
    }
  });
  overlay.querySelector('#labsChoiceHomeLab').addEventListener('click', () => {
    closeLabsOverlay(overlay);
    if (typeof window.switchView === 'function') window.switchView('talk');
    const talkComponent = window.__serronTalkComponent;
    if (talkComponent) {
      talkComponent.addSystemMessage('[ HOME LAB ]', 'Home lab visits are not available yet: Obrium has no lab partner connected, so no request was sent and nobody will contact you. Until then, please arrange testing through your doctor or a local lab directly.', true);
    }
  });

  overlay.classList.add('is-active');
}

/** Show 2s loading then Medical Brief document preview */
function showMedicalBriefLoading(contentEl, overlay, labName) {
  contentEl.innerHTML = `
    <div class="labs-medical-brief-loading" id="labsBriefLoading">
      <div class="labs-brief-loading-spinner" aria-hidden="true"></div>
      <p class="labs-brief-loading-text">Generating your Medical Brief…</p>
    </div>
  `;
  setTimeout(() => {
    showMedicalBriefDocument(contentEl, overlay, labName);
  }, 2000);
}

/** Medical Brief document content (Graphite style, Shield icon) */
const MEDICAL_BRIEF_HTML = `
  <div class="labs-medical-brief-doc" id="labsMedicalBriefDoc">
    <div class="labs-brief-header">
      <span class="labs-brief-shield" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
      <h4 class="labs-brief-title">Obrium Biometric Summary | Confidential</h4>
    </div>
    <section class="labs-brief-section">
      <h5 class="labs-brief-section-title">Observations</h5>
      <p class="labs-brief-section-body">No HRV or Resting HR trend data is on record yet. Connect a wearable or add readings to include observations here.</p>
    </section>
    <section class="labs-brief-section">
      <h5 class="labs-brief-section-title">Context</h5>
      <p class="labs-brief-section-body">No self-reported energy or activity notes are on record for this period.</p>
    </section>
    <section class="labs-brief-section labs-brief-physician-note">
      <h5 class="labs-brief-section-title">Physician Note</h5>
      <p class="labs-brief-section-body">Data provided for clinical context. Not a diagnosis.</p>
    </section>
    <button type="button" class="btn btn-initialize profile-modal-save labs-brief-close" id="labsBriefClose">Close</button>
  </div>
`;

function showMedicalBriefDocument(contentEl, overlay, labName) {
  contentEl.innerHTML = MEDICAL_BRIEF_HTML;
  contentEl.querySelector('#labsBriefClose').addEventListener('click', () => closeLabsOverlay(overlay));
}
