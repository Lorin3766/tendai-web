// TendAI — Calendar Reminders
// @owner: calendar
// @role: ui
// Event-based reminder system integrated with unread queue

import { getCalendarEvents, wasReminderShownToday, addReminderLogEntry, localYMD } from './state.js';
import { addMessage } from '../../features/storage/message-queue.js';

/**
 * Check and generate reminders for events
 * Called on: app open, focus, visibilitychange, day changed, event created/edited
 */
export function checkAndGenerateReminders() {
  // Check silent mode
  if (window.shouldBeSilent && window.shouldBeSilent()) {
    return;
  }
  
  const events = getCalendarEvents();
  const now = new Date();
  const today = localYMD(now);
  
  // Filter: planned events with reminder, not shown today
  const eventsToRemind = events.filter(event => {
    if (event.status !== 'planned') return false;
    if (event.reminder === 'none') return false;
    if (wasReminderShownToday(event.id, today)) return false;
    
    const eventDate = new Date(event.startAt);
    const eventDateKey = localYMD(eventDate);
    
    // Only today's events
    if (eventDateKey !== today) return false;
    
    // Check reminder timing
    return checkReminderTiming(event, now);
  });
  
  // Anti-spam: max 1 reminder per day
  if (eventsToRemind.length > 0) {
    const event = eventsToRemind[0]; // Take first one
    
    // Generate reminder message
    addMessage({
      type: 'feed',
      subtype: 'calendarReminder',
      text: `Reminder: ${event.title}`,
      eventId: event.id
    });
    
    // Log reminder
    addReminderLogEntry(event.id, today);
    
    // No console logs here (stability / no-noise)
  }
}

/**
 * Check if reminder should trigger now
 * @param {Object} event - Event object
 * @param {Date} now - Current time
 * @returns {boolean} True if should remind
 */
function checkReminderTiming(event, now) {
  const eventTime = new Date(event.startAt);
  
  if (event.allDay) {
    // All day events: remind in morning (before 10 AM)
    return now.getHours() < 10;
  }
  
  // Timed events
  switch (event.reminder) {
    case 'atTime':
      // Remind at event time (within 5 minutes)
      const diff = eventTime - now;
      return diff >= 0 && diff <= 5 * 60 * 1000;
      
    case '1hBefore':
      // Remind 1 hour before (within 5 minutes of 1h mark)
      const oneHourBefore = new Date(eventTime.getTime() - 60 * 60 * 1000);
      const diff1h = oneHourBefore - now;
      return diff1h >= 0 && diff1h <= 5 * 60 * 1000;
      
    case 'morning':
      // Remind in morning (before 10 AM, if event is today)
      return now.getHours() < 10;
      
    case 'evening':
      // Remind in evening (after 18:00, if event is tomorrow)
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const eventDateKey = localYMD(eventTime);
      const tomorrowKey = localYMD(tomorrow);
      
      if (eventDateKey === tomorrowKey) {
        return now.getHours() >= 18;
      }
      return false;
      
    default:
      return false;
  }
}

// Export for global use
window.checkAndGenerateReminders = checkAndGenerateReminders;

