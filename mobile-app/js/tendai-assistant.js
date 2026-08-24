// Serron — Living Assistant Core
// @owner: feed
// @role: utils
// Event-based, human-like, non-intrusive assistant behavior

import { dayState } from './state.js';
import { addMessage } from './message-queue.js';

// ============================================================
// PRODUCTION FLAG
// ============================================================
const IS_PRODUCTION_READY = true; // Set to false for debug mode

// ============================================================
// STATE TRACKING
// ============================================================
const ASSISTANT_STATE_KEY = 'tendai-assistant-state';

function getAssistantState() {
  try {
    const stored = localStorage.getItem(ASSISTANT_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    // Error reading state
  }
  
  return {
    lastInteraction: null, // ISO timestamp
    ignoredCount: 0, // Count of ignored appearances
    lastIgnored: null, // ISO timestamp
    closedWithoutAnswer: 0, // Count of closed check-ins without answer
    silentMode: false, // Silent mode flag
    silentModeUntil: null, // ISO timestamp when silent mode ends
    lastAppVisit: null, // ISO timestamp of last app visit
    consecutiveNoResponse: 0 // Consecutive times user didn't respond
  };
}

function saveAssistantState(state) {
  try {
    localStorage.setItem(ASSISTANT_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    // Error saving state
  }
}

// ============================================================
// ANTI-SPAM LOGIC
// ============================================================
const MIN_HOURS_BETWEEN_MESSAGES = 3;
const MAX_IGNORED_BEFORE_SILENT = 2;
const MAX_CONSECUTIVE_NO_RESPONSE = 3;
const SILENT_MODE_HOURS = 48;

/**
 * Check if TendAI should be silent (anti-spam)
 * @returns {boolean} True if should be silent
 */
export function shouldBeSilent() {
  const state = getAssistantState();
  const now = new Date();
  
  // Check explicit silent mode
  if (state.silentMode) {
    if (state.silentModeUntil) {
      const until = new Date(state.silentModeUntil);
      if (now < until) {
        return true; // Still in silent mode
      } else {
        // Silent mode expired, reset
        state.silentMode = false;
        state.silentModeUntil = null;
        saveAssistantState(state);
      }
    } else {
      return true; // Permanent silent mode
    }
  }
  
  // Check if user ignored last 2 appearances
  if (state.ignoredCount >= MAX_IGNORED_BEFORE_SILENT) {
    const lastIgnored = state.lastIgnored ? new Date(state.lastIgnored) : null;
    if (lastIgnored) {
      const hoursSinceIgnored = (now - lastIgnored) / (1000 * 60 * 60);
      if (hoursSinceIgnored < SILENT_MODE_HOURS) {
        return true; // Still in cooldown after ignoring
      } else {
        // Reset ignored count after cooldown
        state.ignoredCount = 0;
        state.lastIgnored = null;
        saveAssistantState(state);
      }
    }
  }
  
  // Check if user closed check-in without answer 3 times
  if (state.consecutiveNoResponse >= MAX_CONSECUTIVE_NO_RESPONSE) {
    return true; // Silent mode activated
  }
  
  // Check if user hasn't visited in 48 hours
  if (state.lastAppVisit) {
    const lastVisit = new Date(state.lastAppVisit);
    const hoursSinceVisit = (now - lastVisit) / (1000 * 60 * 60);
    if (hoursSinceVisit >= SILENT_MODE_HOURS) {
      return true; // Silent until user returns
    }
  }
  
  // Check minimum time between messages
  if (state.lastInteraction) {
    const lastInteraction = new Date(state.lastInteraction);
    const hoursSinceInteraction = (now - lastInteraction) / (1000 * 60 * 60);
    if (hoursSinceInteraction < MIN_HOURS_BETWEEN_MESSAGES) {
      return true; // Too soon after last interaction
    }
  }
  
  return false;
}

/**
 * Check if TendAI can write (user-initiated action)
 * @param {string} context - Context: 'user_opened_feed' | 'user_opened_talk' | 'user_completed_action' | 'day_changed'
 * @returns {boolean} True if can write
 */
export function canWrite(context) {
  // Always allow if user initiated action
  if (context === 'user_opened_feed' || context === 'user_opened_talk' || context === 'user_completed_action') {
    return true;
  }
  
  // Day changed - check silent mode
  if (context === 'day_changed') {
    return !shouldBeSilent();
  }
  
  // Default: check silent mode
  return !shouldBeSilent();
}

/**
 * Record user interaction
 */
export function recordInteraction() {
  const state = getAssistantState();
  state.lastInteraction = new Date().toISOString();
  state.lastAppVisit = new Date().toISOString();
  state.ignoredCount = 0; // Reset ignored count on interaction
  state.consecutiveNoResponse = 0; // Reset consecutive no response
  saveAssistantState(state);
}

/**
 * Record ignored appearance
 */
export function recordIgnored() {
  const state = getAssistantState();
  state.ignoredCount = (state.ignoredCount || 0) + 1;
  state.lastIgnored = new Date().toISOString();
  
  // Activate silent mode if threshold reached
  if (state.ignoredCount >= MAX_IGNORED_BEFORE_SILENT) {
    state.silentMode = true;
    const until = new Date();
    until.setHours(until.getHours() + SILENT_MODE_HOURS);
    state.silentModeUntil = until.toISOString();
  }
  
  saveAssistantState(state);
}

/**
 * Record closed check-in without answer
 */
export function recordClosedWithoutAnswer() {
  const state = getAssistantState();
  state.closedWithoutAnswer = (state.closedWithoutAnswer || 0) + 1;
  state.consecutiveNoResponse = (state.consecutiveNoResponse || 0) + 1;
  
  // Activate silent mode if threshold reached
  if (state.consecutiveNoResponse >= MAX_CONSECUTIVE_NO_RESPONSE) {
    state.silentMode = true;
    const until = new Date();
    until.setHours(until.getHours() + SILENT_MODE_HOURS);
    state.silentModeUntil = until.toISOString();
  }
  
  saveAssistantState(state);
}

/**
 * Record app visit
 */
export function recordAppVisit() {
  const state = getAssistantState();
  state.lastAppVisit = new Date().toISOString();
  saveAssistantState(state);
}

// ============================================================
// TEXT VARIATIONS
// ============================================================
const MORNING_GREETINGS = [
  "Good morning. How did you sleep?",
  "Morning. How's your energy today?",
  "Hey. Ready to start the day?"
];

const ACTION_INTROS = [
  "Today's focus: {action}",
  "One small thing for today: {action}",
  "Here's something simple: {action}"
];

const EVENING_GREETINGS = [
  "How was your day?",
  "Anything you want to reflect on?",
  "How did today go?"
];

/**
 * Get random morning greeting
 */
export function getMorningGreeting() {
  return MORNING_GREETINGS[Math.floor(Math.random() * MORNING_GREETINGS.length)];
}

/**
 * Get random action intro
 */
export function getActionIntro(actionText) {
  const intro = ACTION_INTROS[Math.floor(Math.random() * ACTION_INTROS.length)];
  return intro.replace('{action}', actionText.toLowerCase());
}

/**
 * Get random evening greeting
 */
export function getEveningGreeting() {
  return EVENING_GREETINGS[Math.floor(Math.random() * EVENING_GREETINGS.length)];
}

// ============================================================
// LOGGING (Production mode)
// ============================================================
function log(message, data = null) {
  if (!IS_PRODUCTION_READY) {
    console.log(`[TENDAI ASSISTANT] ${message}`, data || '');
  }
}

function logError(message, error) {
  if (!IS_PRODUCTION_READY) {
    console.error(`[TENDAI ASSISTANT] ${message}`, error);
  }
}

// Export for global use
window.shouldBeSilent = shouldBeSilent;
window.canWrite = canWrite;
window.recordInteraction = recordInteraction;
window.recordIgnored = recordIgnored;
window.recordClosedWithoutAnswer = recordClosedWithoutAnswer;
window.recordAppVisit = recordAppVisit;
window.getMorningGreeting = getMorningGreeting;
window.getActionIntro = getActionIntro;
window.getEveningGreeting = getEveningGreeting;
window.IS_PRODUCTION_READY = IS_PRODUCTION_READY;

