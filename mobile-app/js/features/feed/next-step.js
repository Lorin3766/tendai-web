// TendAI — Next Step Feature
// @owner: feed
// @role: init
// Shows ONE next step at a time, always relevant and clickable

import { profileState } from '../../state.js';
import { dayState } from '../../state.js';

/**
 * Determine the next step based on priority
 * PRIORITY 1: Live experience (Location, Morning check-in, Today's One Action)
 * PRIORITY 2: Basic profile (Age, Sleep duration, Stress level, Primary goals)
 * @returns {Object|null} Next step object {text: string, action: string} or null
 */
export function getNextStep() {
  const profile = profileState.get();
  const todayState = dayState.loadDayStateForToday();
  const now = new Date();
  const currentHour = now.getHours();

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

  // ============================================================
  // PRIORITY 2 — БАЗОВЫЙ ПРОФИЛЬ (берём ПЕРВОЕ пустое)
  // ============================================================

  // 1. Age отсутствует
  const age = profile.body?.age;
  if (!age || age === null || age === '') {
    return {
      text: 'Add your age',
      action: 'profile_body'
    };
  }

  // 2. Sleep duration отсутствует
  const sleepHours = profile.lifestyle?.sleepHours;
  if (!sleepHours || sleepHours === null || sleepHours === '') {
    return {
      text: 'Add your sleep duration',
      action: 'profile_lifestyle'
    };
  }

  // 3. Stress level отсутствует (default is 3, so check if it's still 3)
  // Check mind.stress first (primary field for stress level)
  const mindStress = profile.mind?.stress;
  if (!mindStress || mindStress === 3) {
    return {
      text: 'Set your stress level',
      action: 'profile_mind'
    };
  }

  // 4. Primary goals пустые
  const primaryGoals = profile.goals?.primaryGoals;
  if (!primaryGoals || !Array.isArray(primaryGoals) || primaryGoals.length === 0) {
    return {
      text: 'Pick 1–2 goals',
      action: 'profile_goals'
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
      // Открыть Profile modal → Body
      if (window.openProfileModal) {
        window.openProfileModal('body');
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
  // Initialize last known date
  lastKnownDate = dayState.getTodayDate();
  
  // Update on load
  updateNextStepDisplay();

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

