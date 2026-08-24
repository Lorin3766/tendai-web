// Serron — Ecosystem Bridge
// @owner: talk / services
// Connects Sidebar (Create my plan, Labs, Online Doctor) to TALK and FEED

const USER_NAME = 'Anton';

function getRecoveryFromFeed() {
  const el = document.getElementById('sensorValueRecovery');
  if (!el || el.classList.contains('sensor-tile-value--empty')) return 78;
  const raw = (el.textContent || '').replace(/%/g, '').trim();
  return raw ? parseInt(raw, 10) || 78 : 78;
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
  const header = '[ ANALYZING CURRENT BIOMETRICS ]';
  const body = `${USER_NAME}, based on your Recovery (${recovery}%) and Stress levels, I am ready to build your strategy.`;
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
        // User Autonomy: anomaly hint — offer to prepare a brief for doctor
        setTimeout(() => {
          talkComponent.addSystemMessage(
            '[ TENDAI NOTICE ]',
            'TendAI noticed a recovery dip. Would you like to prepare a brief for your doctor before proceeding?',
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
    'Connecting to a certified specialist... (Secure Channel Active)',
    true
  );
  const header = '[ SECURE MEDICAL CHANNEL ]';
  const body = 'Doctor AI is online. I have access to your Labs and Vital Signs. What is your concern?';
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
        <p class="labs-choice-subtext">Get a PDF summary of your trends to show your doctor.</p>
      </div>
      <div class="labs-choice-card">
        <button type="button" class="labs-choice-btn" id="labsChoiceOnlineMD" data-action="online-md">
          <span class="labs-choice-label">Consult Online MD</span>
        </button>
        <p class="labs-choice-subtext">Quick 10-min sync with our partner specialist ($29).</p>
      </div>
      <div class="labs-choice-card labs-choice-secondary">
        <button type="button" class="labs-choice-btn labs-choice-btn-secondary" id="labsChoiceHomeLab" data-action="home-lab">
          <span class="labs-choice-label">Schedule Home Lab</span>
        </button>
        <p class="labs-choice-subtext">Professional nurse visit for sample collection ($149).</p>
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
      talkComponent.addSystemMessage('[ CONSULT ]', 'You chose Consult Online MD ($29). Our partner will reach out to schedule your 10-min sync.', true);
    }
  });
  overlay.querySelector('#labsChoiceHomeLab').addEventListener('click', () => {
    closeLabsOverlay(overlay);
    if (typeof window.switchView === 'function') window.switchView('talk');
    const talkComponent = window.__serronTalkComponent;
    if (talkComponent) {
      talkComponent.addSystemMessage('[ HOME LAB ]', 'You chose Schedule Home Lab ($149). A nurse will contact you to arrange the visit.', true);
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
      <h4 class="labs-brief-title">TendAI Biometric Summary | Confidential</h4>
    </div>
    <section class="labs-brief-section">
      <h5 class="labs-brief-section-title">Observations</h5>
      <p class="labs-brief-section-body">Detected 22% drop in HRV and 15% increase in Resting HR over the last 72 hours.</p>
    </section>
    <section class="labs-brief-section">
      <h5 class="labs-brief-section-title">Context</h5>
      <p class="labs-brief-section-body">User reported 'Poor' energy levels. Activity load remained constant.</p>
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
