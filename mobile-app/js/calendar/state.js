// Serron — Calendar State Management
// @owner: calendar
// @role: state
// Stores calendar events locally

const CALENDAR_EVENTS_KEY = 'tendai-calendar-events';
const REMINDER_LOG_KEY = 'tendai-calendar-reminder-log';

/**
 * Get local date as YYYY-MM-DD (no UTC offset issues)
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} YYYY-MM-DD format
 */
export function localYMD(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convert YYYY-MM-DD string to local Date (midnight local time)
 * @param {string} ymd - YYYY-MM-DD format
 * @returns {Date} Local date at midnight
 */
export function ymdToLocalDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight
}

/**
 * Generate UUID for event ID
 */
function generateEventId() {
  return 'event-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get all calendar events
 * @returns {Array} Array of event objects
 */
export function getCalendarEvents() {
  try {
    const stored = localStorage.getItem(CALENDAR_EVENTS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    // Error reading events
  }
  return [];
}

/**
 * Save calendar events
 * @param {Array} events - Array of event objects
 */
function saveCalendarEvents(events) {
  try {
    localStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify(events));
  } catch (error) {
    console.error('[CALENDAR] Error saving events', error);
  }
}

/**
 * Add new event
 * @param {Object} eventData - Event data
 * @returns {Object} Created event
 */
export function addEvent(eventData) {
  const events = getCalendarEvents();
  const event = {
    id: generateEventId(),
    title: eventData.title || '',
    type: eventData.type || 'personal',
    startAt: eventData.startAt || new Date().toISOString(),
    endAt: eventData.endAt || null,
    allDay: eventData.allDay !== undefined ? eventData.allDay : false,
    reminder: eventData.reminder || 'none',
    notes: eventData.notes || '',
    status: eventData.status || 'planned',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  events.push(event);
  saveCalendarEvents(events);
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[CALENDAR] Added event:', event.id);
  }
  
  return event;
}

/**
 * Update event
 * @param {string} eventId - Event ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated event or null
 */
export function updateEvent(eventId, updates) {
  const events = getCalendarEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    return null;
  }
  
  events[eventIndex] = {
    ...events[eventIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  saveCalendarEvents(events);
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[CALENDAR] Updated event:', eventId);
  }
  
  return events[eventIndex];
}

/**
 * Delete event
 * @param {string} eventId - Event ID
 */
export function deleteEvent(eventId) {
  const events = getCalendarEvents();
  const filtered = events.filter(e => e.id !== eventId);
  saveCalendarEvents(filtered);
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[CALENDAR] Deleted event:', eventId);
  }
}

/**
 * Get events for a specific date
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {Array} Array of events for that date
 */
export function getEventsForDate(dateKey) {
  const events = getCalendarEvents();
  return events.filter(event => {
    const eventDate = new Date(event.startAt);
    const eventDateKey = localYMD(eventDate);
    return eventDateKey === dateKey;
  });
}

/**
 * Get events for date range
 * @param {string} startDate - Start date in YYYY-MM-DD
 * @param {string} endDate - End date in YYYY-MM-DD
 * @returns {Array} Array of events in range
 */
export function getEventsForDateRange(startDate, endDate) {
  const events = getCalendarEvents();
  return events.filter(event => {
    const eventDate = new Date(event.startAt);
    const eventDateKey = localYMD(eventDate);
    return eventDateKey >= startDate && eventDateKey <= endDate;
  });
}

/**
 * Get upcoming events (planned, not done/skipped)
 * @param {number} hoursAhead - Hours to look ahead (default: 24)
 * @returns {Array} Array of upcoming events
 */
export function getUpcomingEvents(hoursAhead = 24) {
  const events = getCalendarEvents();
  const now = new Date();
  const future = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  
  return events
    .filter(event => {
      if (event.status !== 'planned') return false;
      const eventDate = new Date(event.startAt);
      return eventDate >= now && eventDate <= future;
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
}

/**
 * Get nearest event today (for Next Step)
 * @param {string} dateKey - Date in YYYY-MM-DD format (default: today)
 * @returns {Object|null} Nearest event or null
 */
export function getNearestEventToday(dateKey = null) {
  const today = dateKey || localYMD();
  const events = getEventsForDate(today);
  
  // Filter: health or program, planned, within 6 hours if timed
  const now = new Date();
  const sixHoursLater = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  
  const relevantEvents = events
    .filter(event => {
      if (event.status !== 'planned') return false;
      if (event.type !== 'health' && event.type !== 'program') return false;
      
      const eventTime = new Date(event.startAt);
      
      // If allDay, always include
      if (event.allDay) return true;
      
      // If timed, must be within 6 hours
      return eventTime >= now && eventTime <= sixHoursLater;
    })
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  
  return relevantEvents.length > 0 ? relevantEvents[0] : null;
}

/**
 * Get dates with events (for calendar markers)
 * @param {string} monthKey - Month in YYYY-MM format
 * @returns {Set} Set of date keys (YYYY-MM-DD) with events
 */
export function getDatesWithEvents(monthKey) {
  const events = getCalendarEvents();
  const dates = new Set();
  
  events.forEach(event => {
    const eventDate = new Date(event.startAt);
    const eventMonth = localYMD(eventDate).substring(0, 7);
    if (eventMonth === monthKey) {
      const dateKey = localYMD(eventDate);
      dates.add(dateKey);
    }
  });
  
  return dates;
}

/**
 * Get reminder log
 * @returns {Array} Array of reminder log entries
 */
export function getReminderLog() {
  try {
    const stored = localStorage.getItem(REMINDER_LOG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    // Error reading log
  }
  return [];
}

/**
 * Add reminder log entry
 * @param {string} eventId - Event ID
 * @param {string} dateKey - Date in YYYY-MM-DD format
 */
export function addReminderLogEntry(eventId, dateKey) {
  const log = getReminderLog();
  const entry = {
    eventId,
    dateKey,
    timestamp: new Date().toISOString()
  };
  log.push(entry);
  
  try {
    localStorage.setItem(REMINDER_LOG_KEY, JSON.stringify(log));
  } catch (error) {
    console.error('[CALENDAR] Error saving reminder log', error);
  }
}

/**
 * Check if reminder was shown today for event
 * @param {string} eventId - Event ID
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {boolean} True if reminder was shown
 */
export function wasReminderShownToday(eventId, dateKey) {
  const log = getReminderLog();
  return log.some(entry => entry.eventId === eventId && entry.dateKey === dateKey);
}

// Export for global use
window.getCalendarEvents = getCalendarEvents;
window.addCalendarEvent = addEvent;
window.updateCalendarEvent = updateEvent;
window.deleteCalendarEvent = deleteEvent;
window.getEventsForDate = getEventsForDate;
window.getUpcomingEvents = getUpcomingEvents;
window.getNearestEventToday = getNearestEventToday;
window.getDatesWithEvents = getDatesWithEvents;

