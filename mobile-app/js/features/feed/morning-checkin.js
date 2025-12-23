// TendAI — Morning Check-In (Living Assistant)
// @owner: feed
// @role: ui
// Shows a simple morning question once per day (event-based, no spam)

import { dayState } from '../../state.js';
import { addMessage } from '../storage/message-queue.js';
import { countToday } from '../storage/soft-streak.js';

const CHECKIN_CUTOFF_HOUR = 14; // Show only before 2 PM

/**
 * Check if morning check-in should be shown today
 * @param {boolean} isDayChanged - True if day just changed
 * @returns {boolean} True if should show check-in
 */
function shouldShowCheckIn(isDayChanged = false) {
  const todayState = dayState.loadDayStateForToday();
  const now = new Date();
  const currentHour = now.getHours();
  
  // Already answered today
  if (todayState.morningCheckin && todayState.morningCheckin.answered) {
    return false;
  }
  
  // Only show before cutoff time
  if (currentHour >= CHECKIN_CUTOFF_HOUR) {
    return false;
  }
  
  // Check anti-spam logic (only if not day changed or first visit)
  if (!isDayChanged && window.shouldBeSilent && window.shouldBeSilent()) {
    return false;
  }
  
  return true;
}

/**
 * Get morning check-in response text for Feed
 * @param {string} value - Check-in value (good, okay, tired, stressed)
 * @returns {string} Feed reaction text
 */
export function getCheckInReaction(value) {
  const reactions = {
    good: 'Maintain your momentum today.',
    okay: 'Keep a steady pace today.',
    tired: 'Prioritize rest and hydration today.',
    stressed: 'Focus on calm and recovery today.'
  };
  
  return reactions[value] || reactions.okay;
}

/**
 * Save morning check-in answer
 * @param {string} value - Answer value (good, okay, tired, stressed)
 */
function saveCheckInAnswer(value) {
  const todayState = dayState.loadDayStateForToday();
  todayState.morningCheckin = {
    answered: true,
    value: value,
    timestamp: new Date().toISOString()
  };
  dayState.saveDayStateForToday(todayState);
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[MORNING CHECK-IN] answered:', value);
  }
  
  // Record interaction
  if (window.recordInteraction) {
    window.recordInteraction();
  }
  
  // Count today for soft streak
  countToday();
  
  // Add to message queue (morning check-in reaction)
  const reaction = getCheckInReaction(value);
  addMessage({
    type: 'feed',
    subtype: 'morning_checkin_reaction',
    text: reaction
  });
  
  // Check for calendar events today
  const today = new Date().toISOString().split('T')[0];
  if (window.getEventsForDate) {
    const todayEvents = window.getEventsForDate(today);
    const healthProgramEvents = todayEvents.filter(e => 
      (e.type === 'health' || e.type === 'program') && e.status === 'planned'
    );
    
    if (healthProgramEvents.length > 0) {
      const event = healthProgramEvents[0];
      // Add reminder question
      setTimeout(() => {
        if (window.addMessage) {
          window.addMessage({
            type: 'feed',
            subtype: 'calendar_reminder_question',
            text: `You have ${event.title} today. Want a reminder?`,
            eventId: event.id
          });
        }
      }, 500);
    }
  }
  
  // Trigger daily action after morning check-in
  if (window.pickDailyAction) {
    const action = window.pickDailyAction('after_morning_checkin');
    if (action && window.updateDailyActionUI) {
      setTimeout(() => {
        window.updateDailyActionUI();
      }, 100);
    }
  }
  
  // Update Feed immediately
  if (window.updateDailyFocus) {
    window.updateDailyFocus();
  }
  if (window.updateFeedUI) {
    window.updateFeedUI();
  }
  
  // Update next step display
  if (window.updateNextStepDisplay) {
    window.updateNextStepDisplay();
  }
}

/**
 * Render morning check-in card HTML
 * @returns {string} HTML string
 */
function renderCheckInCard() {
  // Get variation greeting
  const greeting = window.getMorningGreeting ? window.getMorningGreeting() : "Good morning. How did you sleep?";
  
  return `
    <article class="card-soft" id="morningCheckInCard" style="margin-bottom: 16px;">
      <div class="card-header" style="padding: 16px 20px;">
        <h3 class="card-title" style="margin: 0; font-size: 16px;">Morning Check-In</h3>
      </div>
      <div class="card-body" style="padding: 16px 20px;">
        <p style="margin: 0 0 16px 0; color: var(--fg); font-size: 14px;">${greeting}</p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button class="checkin-btn" data-checkin-value="good" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            👍 Good
          </button>
          <button class="checkin-btn" data-checkin-value="okay" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😐 Okay
          </button>
          <button class="checkin-btn" data-checkin-value="tired" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😴 Tired
          </button>
          <button class="checkin-btn" data-checkin-value="stressed" style="flex: 1; min-width: 80px; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            😓 Stressed
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
    <article class="card-soft" id="morningCheckInCard" style="margin-bottom: 16px;">
      <div class="card-body" style="padding: 16px 20px;">
        <p style="margin: 0; color: var(--fg); font-size: 14px; font-style: italic;">${reaction}</p>
      </div>
    </article>
  `;
}

/**
 * Initialize morning check-in in Feed
 * @param {boolean} isDayChanged - True if day just changed
 */
export function initMorningCheckIn(isDayChanged = false) {
  // Find Feed container
  const feedView = document.getElementById('feed-view');
  const screenFeed = document.getElementById('screen-feed');
  
  if (!feedView && !screenFeed) {
    return; // Feed not found
  }
  
  // Check if should show
  if (!shouldShowCheckIn(isDayChanged)) {
    // Check if already answered - show reaction
    const todayState = dayState.loadDayStateForToday();
    if (todayState.morningCheckin && todayState.morningCheckin.answered) {
      const value = todayState.morningCheckin.value;
      const reactionCard = renderCheckInReaction(value);
      
      // Insert at the top of Feed (above My Day card)
      if (feedView) {
        const existingCard = feedView.querySelector('#morningCheckInCard');
        const myDayCard = feedView.querySelector('#myDayCard');
        
        if (existingCard) {
          existingCard.outerHTML = reactionCard;
        } else if (myDayCard) {
          // Insert before My Day card
          myDayCard.insertAdjacentHTML('beforebegin', reactionCard);
        } else {
          // Fallback: insert at the beginning
          feedView.insertAdjacentHTML('afterbegin', reactionCard);
        }
      }
      
      if (screenFeed) {
        const existingCard = screenFeed.querySelector('#morningCheckInCard');
        const dayHeaderCard = screenFeed.querySelector('#dayHeaderCard');
        
        if (existingCard) {
          existingCard.outerHTML = reactionCard;
        } else if (dayHeaderCard) {
          // Insert before day header card
          dayHeaderCard.insertAdjacentHTML('beforebegin', reactionCard);
        } else {
          // Fallback: insert at the beginning
          screenFeed.insertAdjacentHTML('afterbegin', reactionCard);
        }
      }
    }
    return;
  }
  
  // Show check-in card
  const checkInCard = renderCheckInCard();
  
  // Insert at the top of Feed (above My Day card)
  if (feedView) {
    const existingCard = feedView.querySelector('#morningCheckInCard');
    const myDayCard = feedView.querySelector('#myDayCard');
    
    if (existingCard) {
      existingCard.outerHTML = checkInCard;
    } else if (myDayCard) {
      // Insert before My Day card
      myDayCard.insertAdjacentHTML('beforebegin', checkInCard);
    } else {
      // Fallback: insert at the beginning
      feedView.insertAdjacentHTML('afterbegin', checkInCard);
    }
  }
  
  if (screenFeed) {
    const existingCard = screenFeed.querySelector('#morningCheckInCard');
    const dayHeaderCard = screenFeed.querySelector('#dayHeaderCard');
    
    if (existingCard) {
      existingCard.outerHTML = checkInCard;
    } else if (dayHeaderCard) {
      // Insert before day header card
      dayHeaderCard.insertAdjacentHTML('beforebegin', checkInCard);
    } else {
      // Fallback: insert at the beginning
      screenFeed.insertAdjacentHTML('afterbegin', checkInCard);
    }
  }
  
  // Setup button handlers
  setTimeout(() => {
    const buttons = document.querySelectorAll('.checkin-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', function() {
        const value = this.getAttribute('data-checkin-value');
        if (value) {
          saveCheckInAnswer(value);
          
          // Replace card with reaction
          const reactionCard = renderCheckInReaction(value);
          const card = document.getElementById('morningCheckInCard');
          if (card) {
            card.outerHTML = reactionCard;
          }
        }
      });
      
      // Track if user closes without answering (add close button handler if needed)
      // This will be handled by visibility/focus events
      
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
window.initMorningCheckIn = initMorningCheckIn;
window.getCheckInReaction = getCheckInReaction;

