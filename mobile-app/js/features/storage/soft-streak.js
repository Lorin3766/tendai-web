// Serron — Soft Streak (Gentle Habit Support, No Gamification)
// @owner: storage
// @role: utils
// Tracks presence days without pressure or achievements

import { dayState } from '../../state.js';

const STREAK_KEY = 'tendai-streak';

/**
 * Get streak data from localStorage
 * @returns {Object} Streak data
 */
function getStreakData() {
  try {
    const stored = localStorage.getItem(STREAK_KEY);
    if (!stored) {
      return {
        lastActiveDate: null,
        currentStreak: 0,
        todayCounted: false
      };
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error('[SOFT STREAK] Error reading streak', error);
    return {
      lastActiveDate: null,
      currentStreak: 0,
      todayCounted: false
    };
  }
}

/**
 * Save streak data to localStorage
 * @param {Object} streakData - Streak data
 */
function saveStreakData(streakData) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streakData));
  } catch (error) {
    console.error('[SOFT STREAK] Error saving streak', error);
  }
}

/**
 * Get today's date key (YYYY-MM-DD)
 * @returns {string} Today's date key
 */
function getTodayDateKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if today is already counted
 * @returns {boolean} True if today is counted
 */
export function isTodayCounted() {
  const streakData = getStreakData();
  const today = getTodayDateKey();
  
  return streakData.todayCounted && streakData.lastActiveDate === today;
}

/**
 * Count today as active day
 * Called after: Morning Check-In, Evening Check-In, or Daily Action Done
 */
export function countToday() {
  const streakData = getStreakData();
  const today = getTodayDateKey();
  
  // If already counted today, don't update
  if (streakData.todayCounted && streakData.lastActiveDate === today) {
    return;
  }
  
  const lastActiveDate = streakData.lastActiveDate;
  let currentStreak = streakData.currentStreak || 0;
  
  // Check if last active was yesterday (consecutive day)
  if (lastActiveDate) {
    const lastDate = new Date(lastActiveDate);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      // Consecutive day - increment streak
      currentStreak += 1;
    } else if (diffDays > 1) {
      // Gap in days - reset streak
      currentStreak = 1;
    } else if (diffDays === 0) {
      // Same day - don't change streak
      // (shouldn't happen due to todayCounted check, but safety)
      return;
    }
  } else {
    // First time - start streak
    currentStreak = 1;
  }
  
  // Update streak data
  const updatedStreak = {
    lastActiveDate: today,
    currentStreak: currentStreak,
    todayCounted: true
  };
  
  saveStreakData(updatedStreak);
  
  console.log('[SOFT STREAK] Counted today, streak:', currentStreak);
  
  // Show streak message in Feed
  showStreakMessage();
}

/**
 * Get current streak count
 * @returns {number} Current streak count
 */
export function getCurrentStreak() {
  const streakData = getStreakData();
  const today = getTodayDateKey();
  
  // If today is counted, return current streak
  if (streakData.todayCounted && streakData.lastActiveDate === today) {
    return streakData.currentStreak || 0;
  }
  
  // If last active was not today, streak is 0 (broken)
  if (streakData.lastActiveDate !== today) {
    return 0;
  }
  
  return streakData.currentStreak || 0;
}

/**
 * Render streak message HTML
 * @param {number} streak - Current streak count
 * @returns {string} HTML string or empty if should not show
 */
function renderStreakMessage(streak) {
  // Don't show if streak is 0 or not counted today
  if (streak === 0 || !isTodayCounted()) {
    return '';
  }
  
  // For streak = 1, show simple message
  if (streak === 1) {
    return `
      <div id="softStreakMessage" style="margin-top: 12px; margin-bottom: 12px; padding: 12px 16px; text-align: center;">
        <p style="margin: 0; color: var(--fg-soft); font-size: 13px; font-weight: 400;">You showed up today</p>
      </div>
    `;
  }
  
  // For streak >= 2, show days in a row
  return `
    <div id="softStreakMessage" style="margin-top: 12px; margin-bottom: 12px; padding: 12px 16px; text-align: center;">
      <p style="margin: 0; color: var(--fg-soft); font-size: 13px; font-weight: 400;">${streak} days in a row</p>
    </div>
  `;
}

/**
 * Show streak message in Feed
 */
export function showStreakMessage() {
  const feedView = document.getElementById('feed-view');
  const screenFeed = document.getElementById('screen-feed');
  
  if (!feedView && !screenFeed) return;
  
  const streak = getCurrentStreak();
  const messageHTML = renderStreakMessage(streak);
  
  // Insert in Feed (after Daily Action card or after My Day card)
  if (feedView) {
    const existingMessage = feedView.querySelector('#softStreakMessage');
    const dailyActionCard = feedView.querySelector('#dailyActionCard');
    const myDayCard = feedView.querySelector('#myDayCard');
    
    if (messageHTML) {
      if (existingMessage) {
        existingMessage.outerHTML = messageHTML;
      } else if (dailyActionCard) {
        // Insert after Daily Action card
        dailyActionCard.insertAdjacentHTML('afterend', messageHTML);
      } else if (myDayCard) {
        // Insert after My Day card
        myDayCard.insertAdjacentHTML('afterend', messageHTML);
      } else {
        // Fallback: insert at the beginning
        feedView.insertAdjacentHTML('afterbegin', messageHTML);
      }
    } else {
      // Remove if should not show
      if (existingMessage) {
        existingMessage.remove();
      }
    }
  }
  
  if (screenFeed) {
    const existingMessage = screenFeed.querySelector('#softStreakMessage');
    const dailyActionCard = screenFeed.querySelector('#dailyActionCard');
    const dayHeaderCard = screenFeed.querySelector('#dayHeaderCard');
    
    if (messageHTML) {
      if (existingMessage) {
        existingMessage.outerHTML = messageHTML;
      } else if (dailyActionCard) {
        // Insert after Daily Action card
        dailyActionCard.insertAdjacentHTML('afterend', messageHTML);
      } else if (dayHeaderCard) {
        // Insert after day header card
        dayHeaderCard.insertAdjacentHTML('afterend', messageHTML);
      } else {
        // Fallback: insert at the beginning
        screenFeed.insertAdjacentHTML('afterbegin', messageHTML);
      }
    } else {
      // Remove if should not show
      if (existingMessage) {
        existingMessage.remove();
      }
    }
  }
}

/**
 * Check and reset today's flag if it's a new day
 * Called on app initialization
 */
export function checkNewDay() {
  const streakData = getStreakData();
  const today = getTodayDateKey();
  
  // If last active date is not today, reset todayCounted flag
  if (streakData.lastActiveDate !== today) {
    streakData.todayCounted = false;
    saveStreakData(streakData);
  }
}

// Export for global use
window.countToday = countToday;
window.showStreakMessage = showStreakMessage;
window.getCurrentStreak = getCurrentStreak;
window.isTodayCounted = isTodayCounted;
window.checkNewDay = checkNewDay;

