// TendAI — Evening Check-In (Close the Loop)
// @owner: feed
// @role: ui
// Shows a simple evening question once per day after 18:00

import { dayState } from './state.js';
import { addMessage } from './message-queue.js';
import { countToday } from './soft-streak.js';

const CHECKIN_START_HOUR = 18; // Show after 6 PM
const CHECKIN_END_HOUR = 2; // Until 2 AM (next day)

/**
 * Check if evening check-in should be shown today
 * @returns {boolean} True if should show check-in
 */
function shouldShowCheckIn() {
  const todayState = dayState.loadDayStateForToday();
  const now = new Date();
  const currentHour = now.getHours();
  
  // Already answered today
  if (todayState.eveningCheckin && todayState.eveningCheckin.answered) {
    return false;
  }
  
  // Show after start hour or before end hour (for late night)
  const isAfterStart = currentHour >= CHECKIN_START_HOUR;
  const isBeforeEnd = currentHour < CHECKIN_END_HOUR;
  
  // Show if after 18:00 OR before 02:00 (late night)
  if (!isAfterStart && !isBeforeEnd) {
    return false;
  }
  
  // REQUIREMENT: Only show if there was morning check-in OR activity during day
  const morningCheckin = todayState.morningCheckin;
  const hasMorningCheckin = morningCheckin && morningCheckin.answered;
  const dailyAction = todayState.dailyAction;
  const hasActivity = dailyAction && (dailyAction.status === 'done' || dailyAction.status === 'pending');
  
  if (!hasMorningCheckin && !hasActivity) {
    return false; // No activity today, don't show evening check-in
  }
  
  // Check anti-spam
  if (window.shouldBeSilent && window.shouldBeSilent()) {
    return false;
  }
  
  return true;
}

/**
 * Check if tomorrow has health/program events (for evening reminder)
 * @returns {Object|null} Event or null
 */
function getTomorrowEvent() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().split('T')[0];
  
  if (window.getEventsForDate) {
    const tomorrowEvents = window.getEventsForDate(tomorrowKey);
    const healthProgramEvents = tomorrowEvents.filter(e => 
      (e.type === 'health' || e.type === 'program') && e.status === 'planned'
    );
    
    return healthProgramEvents.length > 0 ? healthProgramEvents[0] : null;
  }
  
  return null;
}

/**
 * Get evening check-in response text for Feed
 * @param {string} value - Check-in value (good, okay, hard, exhausting)
 * @returns {string} Feed reaction text
 */
export function getCheckInReaction(value) {
  const reactions = {
    good: 'Nice. Let\'s keep that rhythm tomorrow.',
    okay: 'Solid. One small improvement tomorrow is enough.',
    hard: 'Thanks for sharing. Tomorrow, go easier on yourself.',
    exhausting: 'Recovery matters. Let\'s focus on rest tonight.'
  };
  
  return reactions[value] || reactions.okay;
}

/**
 * Save evening check-in answer
 * @param {string} value - Answer value (good, okay, hard, exhausting)
 */
function saveCheckInAnswer(value) {
  const todayState = dayState.loadDayStateForToday();
  todayState.eveningCheckin = {
    answered: true,
    value: value,
    timestamp: new Date().toISOString()
  };
  dayState.saveDayStateForToday(todayState);
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[EVENING CHECK-IN] answered:', value);
  }
  
  // Record interaction
  if (window.recordInteraction) {
    window.recordInteraction();
  }
  
  // Count today for soft streak
  countToday();
  
  // Add to message queue (evening check-in reaction)
  const reaction = getCheckInReaction(value);
  addMessage({
    type: 'feed',
    subtype: 'evening_checkin_reaction',
    text: reaction
  });
  
  // Check for tomorrow's events (evening reminder)
  const tomorrowEvent = getTomorrowEvent();
  if (tomorrowEvent && !window.shouldBeSilent()) {
    setTimeout(() => {
      if (window.addMessage) {
        window.addMessage({
          type: 'feed',
          subtype: 'calendar_tomorrow_reminder',
          text: `Tomorrow you have ${tomorrowEvent.title}. Want a reminder in the morning?`,
          eventId: tomorrowEvent.id
        });
      }
    }, 500);
  }
  
  // Update Feed immediately
  if (window.updateFeedUI) {
    window.updateFeedUI();
  }
  
  // Update next step display
  if (window.updateNextStepDisplay) {
    window.updateNextStepDisplay();
  }
}

/**
 * Render evening check-in card HTML
 * @returns {string} HTML string
 */
function renderCheckInCard() {
  const greeting = window.getEveningGreeting ? window.getEveningGreeting() : "How was your day?";
  
  return `
    <article class="card-soft" id="eveningCheckInCard" style="margin-top: 16px; margin-bottom: 16px;">
      <div class="card-header" style="padding: 16px 20px;">
        <h3 class="card-title" style="margin: 0; font-size: 16px;">Evening Check-In</h3>
      </div>
      <div class="card-body" style="padding: 16px 20px;">
        <p style="margin: 0 0 16px 0; color: var(--fg); font-size: 14px;">${greeting}</p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button class="checkin-btn-evening" data-checkin-value="good" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😊 Good
          </button>
          <button class="checkin-btn-evening" data-checkin-value="okay" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😐 Okay
          </button>
          <button class="checkin-btn-evening" data-checkin-value="hard" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😣 Hard
          </button>
          <button class="checkin-btn-evening" data-checkin-value="exhausting" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😴 Exhausting
          </button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Render check-in reaction card (after answer)
 * @param {string} value - Answer value
 * @returns {string} HTML string
 */
function renderCheckInReaction(value) {
  const reaction = getCheckInReaction(value);
  return `
    <article class="card-soft" id="eveningCheckInCard" style="margin-top: 16px; margin-bottom: 16px;">
      <div class="card-body" style="padding: 16px 20px;">
        <p style="margin: 0; color: var(--fg); font-size: 14px; font-style: italic;">${reaction}</p>
      </div>
    </article>
  `;
}

/**
 * Initialize evening check-in in Feed
 */
export function initEveningCheckIn() {
  // Find Feed container
  const feedView = document.getElementById('feed-view');
  const screenFeed = document.getElementById('screen-feed');
  
  if (!feedView && !screenFeed) {
    return; // Feed not found
  }
  
  // Check if should show
  if (!shouldShowCheckIn()) {
    // Check if already answered - show reaction
    const todayState = dayState.loadDayStateForToday();
    if (todayState.eveningCheckin && todayState.eveningCheckin.answered) {
      const value = todayState.eveningCheckin.value;
      const reactionCard = renderCheckInReaction(value);
      
      // Insert in Feed (after My Day card or at the end)
      if (feedView) {
        const existingCard = feedView.querySelector('#eveningCheckInCard');
        const myDayCard = feedView.querySelector('#myDayCard');
        
        if (existingCard) {
          existingCard.outerHTML = reactionCard;
        } else if (myDayCard) {
          // Insert after My Day card
          myDayCard.insertAdjacentHTML('afterend', reactionCard);
        } else {
          // Fallback: insert at the end
          feedView.insertAdjacentHTML('beforeend', reactionCard);
        }
      }
      
      if (screenFeed) {
        const existingCard = screenFeed.querySelector('#eveningCheckInCard');
        const dayHeaderCard = screenFeed.querySelector('#dayHeaderCard');
        
        if (existingCard) {
          existingCard.outerHTML = reactionCard;
        } else if (dayHeaderCard) {
          // Insert after day header card
          dayHeaderCard.insertAdjacentHTML('afterend', reactionCard);
        } else {
          // Fallback: insert at the end
          screenFeed.insertAdjacentHTML('beforeend', reactionCard);
        }
      }
    }
    return;
  }
  
  // Show check-in card
  const checkInCard = renderCheckInCard();
  
  // Insert in Feed (after My Day card or at the end)
  if (feedView) {
    const existingCard = feedView.querySelector('#eveningCheckInCard');
    const myDayCard = feedView.querySelector('#myDayCard');
    
    if (existingCard) {
      existingCard.outerHTML = checkInCard;
    } else if (myDayCard) {
      // Insert after My Day card
      myDayCard.insertAdjacentHTML('afterend', checkInCard);
    } else {
      // Fallback: insert at the end
      feedView.insertAdjacentHTML('beforeend', checkInCard);
    }
  }
  
  if (screenFeed) {
    const existingCard = screenFeed.querySelector('#eveningCheckInCard');
    const dayHeaderCard = screenFeed.querySelector('#dayHeaderCard');
    
    if (existingCard) {
      existingCard.outerHTML = checkInCard;
    } else if (dayHeaderCard) {
      // Insert after day header card
      dayHeaderCard.insertAdjacentHTML('afterend', checkInCard);
    } else {
      // Fallback: insert at the end
      screenFeed.insertAdjacentHTML('beforeend', checkInCard);
    }
  }
  
  // Setup button handlers
  setTimeout(() => {
    const buttons = document.querySelectorAll('.checkin-btn-evening');
    buttons.forEach(btn => {
      btn.addEventListener('click', function() {
        const value = this.getAttribute('data-checkin-value');
        if (value) {
          saveCheckInAnswer(value);
          
          // Replace card with reaction
          const reactionCard = renderCheckInReaction(value);
          const card = document.getElementById('eveningCheckInCard');
          if (card) {
            card.outerHTML = reactionCard;
          }
        }
      });
      
      // Hover effect
      btn.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(255,255,255,0.15)';
        this.style.borderColor = 'rgba(246, 195, 106, 0.4)';
      });
      btn.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(255,255,255,0.1)';
        this.style.borderColor = 'rgba(255,255,255,0.2)';
      });
    });
  }, 100);
}

// Export for global use
window.initEveningCheckIn = initEveningCheckIn;
window.getEveningCheckInReaction = getCheckInReaction;

