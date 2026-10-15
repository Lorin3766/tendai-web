// Serron — Next Step Feature
// @owner: feed
// @role: init
// Shows ONE next step at a time, always relevant and clickable

import { profileState, dayState } from '../../state.js';
import { getNextProfileQuestion } from '../profile/profile-schema.js';

/** Labels that don't read naturally after "Add your …". */
const PROFILE_STEP_TEXT = {
  'health.healthConditions': 'Add your health conditions',
  'health.goalsConstraints': 'Add anything Obrium must consider',
  'mind.wantToImproveFocus': 'Tell Obrium if you want to improve focus',
  'goals.wantFromTendAI': 'Add what you want from Obrium',
};

/** Set when Talk's "Another time" defers profile questions for the rest of the Talk session. */
const PROFILE_SNOOZE_KEY = 'tendai_profile_questions_snoozed';

/**
 * Mirror Talk's `_proactivePassiveThisSession` for the sidebar.
 * Active while the user has deferred profile questions; cleared when Talk reopens or they continue.
 * @param {boolean} active
 */
export function setProfileQuestionsSnoozed(active) {
  try {
    if (active) sessionStorage.setItem(PROFILE_SNOOZE_KEY, '1');
    else sessionStorage.removeItem(PROFILE_SNOOZE_KEY);
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.__obriumProfileQuestionsSnoozed = !!active;
    try {
      if (typeof window.updateNextStepDisplay === 'function') window.updateNextStepDisplay();
    } catch (_) {}
  }
}

/** @returns {boolean} */
export function areProfileQuestionsSnoozed() {
  try {
    if (sessionStorage.getItem(PROFILE_SNOOZE_KEY) === '1') return true;
  } catch (_) {}
  return typeof window !== 'undefined' && window.__obriumProfileQuestionsSnoozed === true;
}

/**
 * Sidebar step for the profile field Talk is asking about (same resolver as Talk).
 * @param {Object} profile
 * @returns {{ text: string, action: string, path: string } | null}
 */
export function getProfileNextStep(profile) {
  const question = getNextProfileQuestion(profile);
  if (!question) return null;
  return {
    text: PROFILE_STEP_TEXT[question.path] || `Add your ${question.fieldLabel.toLowerCase()}`,
    action: `profile_${question.sectionKey}`,
    path: question.path,
  };
}

/**
 * Determine the next step based on priority
 * PRIORITY 0: The next unanswered profile field — the same one Talk asks (getNextProfileQuestion),
 *             unless Talk has snoozed profile questions ("Another time").
 * PRIORITY 1: Calendar event, then live experience (Location, Morning check-in, Today's One Action)
 * @returns {Object|null} Next step object {text: string, action: string} or null
 */
export function getNextStep() {
  const profile = profileState.get();
  const todayState = dayState.loadDayStateForToday();
  const now = new Date();
  const currentHour = now.getHours();

  if (!areProfileQuestionsSnoozed()) {
    const profileStep = getProfileNextStep(profile);
    if (profileStep) return profileStep;
  }

  // ============================================================
  // PRIORITY 0 — CALENDAR EVENTS (выше всего остального)
  // ============================================================
  
  // Check for nearest event today (health or program, within 6 hours)
  if (window.getNearestEventToday) {
    const nearestEvent = window.getNearestEventToday();
    if (nearestEvent) {
      return {
        text: nearestEvent.allDay ? `Today: ${nearestEvent.title}` : `Prepare for: ${nearestEvent.title}`,
        action: 'calendar_event',
        eventId: nearestEvent.id
      };
    }
  }

  // ============================================================
  // PRIORITY 1 — ЖИВОЙ ОПЫТ (если есть — остальное игнорируется)
  // ============================================================

  // 1. Location не задана
  const location = profile.location;
  if (!location || !location.type || (!location.city && !location.zip && !location.coords)) {
    return {
      text: 'Set your location for weather',
      action: 'settings_location'
    };
  }

  // 2. Morning check-in сегодня не был завершён (текущее время < 14:00)
  if (currentHour < 14) {
    const morningCheckin = todayState.morningCheckin;
    if (!morningCheckin || !morningCheckin.answered) {
      return {
        text: 'Complete your morning check-in',
        action: 'feed_checkin'
      };
    }
  }

  // 3. Today's One Action ещё не выполнено
  const dailyAction = todayState.dailyAction;
  if (dailyAction && dailyAction.status !== 'done' && dailyAction.status !== 'skipped') {
    return {
      text: "Today's 1 Action",
      action: 'feed_action'
    };
  }

  // No next step needed
  return null;
}

/**
 * Handle click on Next Step
 * @param {string} action - Action identifier
 * @param {Object} nextStepData - Next step data (optional, for eventId)
 */
export function handleNextStepClick(action, nextStepData = null) {
  if (!action) return;

  switch (action) {
    case 'settings_location':
      // Открыть Settings → Location
      if (window.openSettingsModal) {
        window.openSettingsModal();
        // Scroll to location section after modal opens
        setTimeout(() => {
          const locationSection = document.querySelector('[data-section="settings"]');
          if (locationSection) {
            // Settings modal should show location section by default
            // If needed, we can add logic to scroll to location inputs
            const locationInputs = document.getElementById('settingsLocationCity') || 
                                   document.getElementById('settingsLocationCountry');
            if (locationInputs) {
              locationInputs.focus();
            }
          }
        }, 300);
      }
      break;

    case 'profile_body':
      if (window.openProfileModal) {
        window.openProfileModal('body');
      }
      break;

    case 'profile_health':
      if (window.openProfileModal) {
        window.openProfileModal('health');
      }
      break;

    case 'profile_lifestyle':
      // Открыть Profile modal → Lifestyle
      if (window.openProfileModal) {
        window.openProfileModal('lifestyle');
      }
      break;

    case 'profile_mind':
      // Открыть Profile modal → Mind
      if (window.openProfileModal) {
        window.openProfileModal('mind');
      }
      break;

    case 'profile_goals':
      // Открыть Profile modal → Goals
      if (window.openProfileModal) {
        window.openProfileModal('goals');
      }
      break;

    case 'feed_checkin':
      // Открыть Feed / Talk (check-in)
      if (window.switchView) {
        window.switchView('feed');
        // Morning check-in should be visible in Feed
        setTimeout(() => {
          if (window.initMorningCheckIn) {
            window.initMorningCheckIn();
          }
          // Scroll to check-in card if exists
          const checkInCard = document.getElementById('morningCheckInCard');
          if (checkInCard) {
            checkInCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
      break;

    case 'feed_action':
      // Открыть Feed с action
      if (window.switchView) {
        window.switchView('feed');
        setTimeout(() => {
          // Scroll to daily action if exists
          const actionCard = document.getElementById('dailyActionCard');
          if (actionCard) {
            actionCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
      break;

    case 'calendar_event':
      // Открыть Calendar Panel на событии
      const eventId = nextStepData?.eventId;
      if (window.openCalendar) {
        const today = new Date().toISOString().split('T')[0];
        window.openCalendar(today);
        // Scroll to event if possible
        if (eventId) {
          setTimeout(() => {
            const eventElement = document.querySelector(`[data-event-id="${eventId}"]`);
            if (eventElement) {
              eventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              eventElement.style.background = 'rgba(246, 195, 106, 0.2)';
              setTimeout(() => {
                eventElement.style.background = '';
              }, 2000);
            }
          }, 300);
        }
      }
      break;

    default:
      if (!window.IS_PRODUCTION_READY) {
        console.warn('[NEXT STEP] Unknown action:', action);
      }
  }
}

/**
 * Update Next Step display in UI
 * Called only on events (no polling)
 */
export function updateNextStepDisplay() {
  // Check for day change first (updates lastKnownDate)
  const dayChanged = checkDayChange();
  
  // If day changed, log it (for debugging)
  if (dayChanged) {
    console.log('[NEXT STEP] Day changed, updating Next Step');
  }
  
  const nextStep = getNextStep();
  
  // Desktop
  const desktopNextStep = document.getElementById('nextStepDesktop');
  if (desktopNextStep) {
    if (nextStep) {
      desktopNextStep.textContent = nextStep.text;
      desktopNextStep.setAttribute('data-action', nextStep.action);
      if (nextStep.eventId) {
        desktopNextStep.setAttribute('data-event-id', nextStep.eventId);
      } else {
        desktopNextStep.removeAttribute('data-event-id');
      }
      desktopNextStep.style.display = '';
      desktopNextStep.style.cursor = 'pointer';
    } else {
      desktopNextStep.textContent = '';
      desktopNextStep.removeAttribute('data-action');
      desktopNextStep.removeAttribute('data-event-id');
      desktopNextStep.style.display = 'none';
    }
  }

  // Mobile
  const mobileNextStep = document.getElementById('nextStepMobile');
  if (mobileNextStep) {
    if (nextStep) {
      mobileNextStep.textContent = nextStep.text;
      mobileNextStep.setAttribute('data-action', nextStep.action);
      if (nextStep.eventId) {
        mobileNextStep.setAttribute('data-event-id', nextStep.eventId);
      } else {
        mobileNextStep.removeAttribute('data-event-id');
      }
      mobileNextStep.style.display = '';
      mobileNextStep.style.cursor = 'pointer';
    } else {
      mobileNextStep.textContent = '';
      mobileNextStep.removeAttribute('data-action');
      mobileNextStep.removeAttribute('data-event-id');
      mobileNextStep.style.display = 'none';
    }
  }
}

// Track last known date to detect day changes
let lastKnownDate = null;

/**
 * Check if day has changed
 * @returns {boolean} True if day changed
 */
function checkDayChange() {
  const today = dayState.getTodayDate();
  const dayChanged = lastKnownDate && lastKnownDate !== today;
  lastKnownDate = today;
  return dayChanged;
}

/**
 * Initialize Next Step feature
 */
export function initNextStep() {
  if (initNextStep.initialized) return;
  initNextStep.initialized = true;

  // Initialize last known date
  lastKnownDate = dayState.getTodayDate();
  
  // Update on load
  updateNextStepDisplay();

  // Any profile save (onboarding, Talk answers, profile modals) can change the next unanswered field.
  window.addEventListener('obrium:profile-saved', () => updateNextStepDisplay());

  // Setup click handlers
  const desktopNextStep = document.getElementById('nextStepDesktop');
  const mobileNextStep = document.getElementById('nextStepMobile');

  if (desktopNextStep) {
    desktopNextStep.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      const eventId = this.getAttribute('data-event-id');
      if (action) {
        const nextStepData = eventId ? { eventId } : null;
        handleNextStepClick(action, nextStepData);
      }
    });
  }

  if (mobileNextStep) {
    mobileNextStep.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      const eventId = this.getAttribute('data-event-id');
      if (action) {
        const nextStepData = eventId ? { eventId } : null;
        handleNextStepClick(action, nextStepData);
      }
    });
  }
  
  // Check for day change on visibility change (user returns to app)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const dayChanged = checkDayChange();
      if (dayChanged) {
        updateNextStepDisplay();
        // Check calendar reminders
        if (window.checkAndGenerateReminders) {
          window.checkAndGenerateReminders();
        }
        // Trigger morning check-in if day changed
        if (window.initMorningCheckIn) {
          setTimeout(() => {
            window.initMorningCheckIn(true); // Pass isDayChanged = true
          }, 100);
        }
        // Record app visit
        if (window.recordAppVisit) {
          window.recordAppVisit();
        }
      } else {
        // Check reminders when app becomes visible
        if (window.checkAndGenerateReminders) {
          window.checkAndGenerateReminders();
        }
      }
    }
  });
  
  // Check for day change on focus (user switches back to tab)
  window.addEventListener('focus', () => {
    const dayChanged = checkDayChange();
    if (dayChanged) {
      updateNextStepDisplay();
      // Check calendar reminders
      if (window.checkAndGenerateReminders) {
        window.checkAndGenerateReminders();
      }
      // Trigger morning check-in if day changed
      if (window.initMorningCheckIn) {
        setTimeout(() => {
          window.initMorningCheckIn(true); // Pass isDayChanged = true
        }, 100);
      }
      // Record app visit
      if (window.recordAppVisit) {
        window.recordAppVisit();
      }
    } else {
      // Check reminders on focus
      if (window.checkAndGenerateReminders) {
        window.checkAndGenerateReminders();
      }
    }
  });
}

// Export for global use
window.getNextStep = getNextStep;
window.handleNextStepClick = handleNextStepClick;
window.updateNextStepDisplay = updateNextStepDisplay;
window.initNextStep = initNextStep;
window.setProfileQuestionsSnoozed = setProfileQuestionsSnoozed;
window.areProfileQuestionsSnoozed = areProfileQuestionsSnoozed;

