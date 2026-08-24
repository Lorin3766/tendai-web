// Serron — Daily One Action
// @owner: feed
// @role: utils
// Provides one contextual action per day based on check-ins, weather, and state

import { dayState } from '../../state.js';
import { addMessage } from '../storage/message-queue.js';
import { countToday } from '../storage/soft-streak.js';

/**
 * Pick daily action based on morning check-in, weather, and state
 * @param {string} context - Context: 'after_morning_checkin' | 'first_feed_visit' | 'day_changed'
 * @returns {Object|null} Action object with id, text, and metadata, or null if shouldn't show
 */
export function pickDailyAction(context = 'first_feed_visit') {
  const todayState = dayState.loadDayStateForToday();
  const today = new Date().toISOString().split('T')[0];
  
  // Check if action already exists for today
  if (todayState.dailyAction && todayState.dailyAction.dateKey === today) {
    // Return existing action only if it's pending
    if (todayState.dailyAction.status === 'pending') {
      return todayState.dailyAction;
    }
    return null; // Already done or skipped
  }
  
  // Check if should show (anti-spam)
  // Only show if: after morning check-in OR (first feed visit AND morning was done) OR day changed
  const morningCheckin = todayState.morningCheckin;
  const hasMorningCheckin = morningCheckin && morningCheckin.answered;
  
  if (context === 'after_morning_checkin') {
    // Always show after morning check-in
  } else if (context === 'first_feed_visit') {
    // Only show if morning check-in was done
    if (!hasMorningCheckin) {
      return null; // Wait for morning check-in
    }
  } else if (context === 'day_changed') {
    // Check anti-spam
    if (window.shouldBeSilent && window.shouldBeSilent()) {
      return null;
    }
  } else {
    // Unknown context, don't show
    return null;
  }
  
  let action = null;
  
  // PRIORITY 0: Calendar Events (health/program today)
  if (window.getEventsForDate) {
    const todayEvents = window.getEventsForDate(today);
    const soonEvents = todayEvents.filter(e => {
      if (e.status !== 'planned') return false;
      if (e.type !== 'health' && e.type !== 'program') return false;
      
      // If allDay, it's "soon"
      if (e.allDay) return true;
      
      // If timed, check if within 6 hours
      const eventTime = new Date(e.startAt);
      const now = new Date();
      const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      return eventTime >= now && eventTime <= sixHoursLater;
    });
    
    if (soonEvents.length > 0) {
      const event = soonEvents[0];
      const prepActions = [
        'Set a 2-minute prep: water + documents',
        'Quick check: time + address',
        'Pack what you need'
      ];
      const randomAction = prepActions[Math.floor(Math.random() * prepActions.length)];
      
      action = {
        id: 'action_prep_event',
        text: randomAction,
        category: 'preparation',
        eventId: event.id
      };
    }
  }
  
  // PRIORITY 1: Morning Check-In
  if (!action) {
    const morningCheckin = todayState.morningCheckin;
    if (morningCheckin && morningCheckin.answered) {
      const value = morningCheckin.value;
      
      if (value === 'tired') {
        action = {
          id: 'action_breathing_2min',
          text: 'Take 2 minutes to slow your breathing (4–4–6).',
          category: 'recovery'
        };
      } else if (value === 'stressed') {
        action = {
          id: 'action_breathing_3min',
          text: 'Take 3 minutes for deep breathing. Inhale 4, hold 4, exhale 6.',
          category: 'calm'
        };
      } else if (value === 'good') {
        action = {
          id: 'action_walk_5min',
          text: 'Go outside for 5 minutes. Fresh air helps maintain momentum.',
          category: 'maintenance'
        };
      } else if (value === 'okay') {
        action = {
          id: 'action_water_now',
          text: 'Drink a full glass of water right now.',
          category: 'hydration'
        };
      }
    }
  }
  
  // PRIORITY 2: Weather (if no action from check-in)
  if (!action) {
    const weather = todayState.weather;
    const pressure = todayState.pressure;
    
    if (weather && weather.temperature) {
      const temp = weather.temperature;
      const condition = weather.condition?.toLowerCase() || '';
      
      // Good weather (warm, sunny, clear)
      if (temp > 60 && temp < 85 && (condition.includes('clear') || condition.includes('sunny') || condition.includes('partly'))) {
        action = {
          id: 'action_walk_5min',
          text: 'Go outside for 5 minutes. Good weather for a short walk.',
          category: 'movement'
        };
      }
      // Bad weather (cold, rainy, stormy)
      else if (temp < 50 || condition.includes('rain') || condition.includes('storm') || condition.includes('snow')) {
        action = {
          id: 'action_stretch_10',
          text: 'Do 10 slow stretches at home. Your body will thank you.',
          category: 'movement'
        };
      }
    }
    
    // Pressure changes
    if (!action && pressure && (pressure < 1000 || pressure > 1020)) {
      action = {
        id: 'action_breathing_2min',
        text: 'Take 2 minutes to slow your breathing. Pressure changes can affect mood.',
        category: 'calm'
      };
    }
  }
  
  // PRIORITY 3: Fallback (always available)
  if (!action) {
    action = {
      id: 'action_water_now',
      text: 'Drink a glass of water now.',
      category: 'hydration'
    };
  }
  
  // Create action object
  const dailyAction = {
    dateKey: today,
    id: action.id,
    text: action.text,
    status: 'pending',
    updatedAt: new Date().toISOString()
  };
  
  // Save to dayState
  todayState.dailyAction = dailyAction;
  dayState.saveDayStateForToday(todayState);
  
  // Add to message queue with variation
  const actionIntro = window.getActionIntro ? window.getActionIntro(action.text) : `Today's focus: ${action.text.toLowerCase()}`;
  addMessage({
    type: 'feed',
    subtype: 'daily_action',
    text: actionIntro
  });
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[DAILY ACTION] Picked action:', dailyAction);
  }
  
  return dailyAction;
}

/**
 * Mark action as done
 */
export function markActionAsDone() {
  const todayState = dayState.loadDayStateForToday();
  const today = new Date().toISOString().split('T')[0];
  
  if (todayState.dailyAction && todayState.dailyAction.dateKey === today) {
    todayState.dailyAction.status = 'done';
    todayState.dailyAction.updatedAt = new Date().toISOString();
    dayState.saveDayStateForToday(todayState);
    
    if (!window.IS_PRODUCTION_READY) {
      console.log('[DAILY ACTION] Marked as done');
    }
    
    // Record interaction
    if (window.recordInteraction) {
      window.recordInteraction();
    }
    
    // Count today for soft streak
    countToday();
    
    // Update UI
    if (window.updateDailyActionUI) {
      window.updateDailyActionUI();
    }
    
    // Update next step display
    if (window.updateNextStepDisplay) {
      window.updateNextStepDisplay();
    }
  }
}

/**
 * Mark action as skipped
 */
export function markActionAsSkipped() {
  const todayState = dayState.loadDayStateForToday();
  const today = new Date().toISOString().split('T')[0];
  
  if (todayState.dailyAction && todayState.dailyAction.dateKey === today) {
    todayState.dailyAction.status = 'skipped';
    todayState.dailyAction.updatedAt = new Date().toISOString();
    dayState.saveDayStateForToday(todayState);
    
    if (!window.IS_PRODUCTION_READY) {
      console.log('[DAILY ACTION] Marked as skipped');
    }
    
    // Record ignored (user skipped)
    if (window.recordIgnored) {
      window.recordIgnored();
    }
    
    // Update UI (hide card)
    if (window.updateDailyActionUI) {
      window.updateDailyActionUI();
    }
  }
}

/**
 * Get current daily action
 * @returns {Object|null} Current action or null
 */
export function getCurrentDailyAction() {
  const todayState = dayState.loadDayStateForToday();
  const today = new Date().toISOString().split('T')[0];
  
  if (todayState.dailyAction && todayState.dailyAction.dateKey === today) {
    return todayState.dailyAction;
  }
  
  return null;
}

// Export for global use
window.pickDailyAction = pickDailyAction;
window.markActionAsDone = markActionAsDone;
window.markActionAsSkipped = markActionAsSkipped;
window.getCurrentDailyAction = getCurrentDailyAction;

