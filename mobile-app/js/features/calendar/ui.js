// Serron — Calendar UI Component
// @owner: calendar
// @role: ui
// Calendar Panel with month view and events list

import { getEventsForDate, getDatesWithEvents, addEvent, updateEvent, deleteEvent, localYMD, ymdToLocalDate } from './state.js';
import { dayState } from '../../state.js';

// Optional debug flag: set window.DEBUG_CALENDAR = true in console (no logs by default)
if (typeof window !== 'undefined' && window.DEBUG_CALENDAR === undefined) {
  window.DEBUG_CALENDAR = false;
}

let currentSelectedDate = null;
let currentMonth = null;
let calendarPanel = null;
let isPanelOpen = false;

/**
 * Ensure calendar panel overlay exists in DOM (hidden).
 * Called by calendar entry-point on init.
 */
export function ensureCalendarPanel() {
  if (calendarPanel) return calendarPanel;

  calendarPanel = document.createElement('div');
  calendarPanel.id = 'calendarPanel';
  calendarPanel.className = 'calendar-panel-overlay';
  calendarPanel.setAttribute('data-cal', 'new');
  calendarPanel.style.display = 'none';
  document.body.appendChild(calendarPanel);
  return calendarPanel;
}

/**
 * Format date for display (using local date, no UTC)
 * @param {string} ymd - YYYY-MM-DD format
 * @returns {string} Formatted date string
 */
function formatDate(ymd) {
  const dt = ymdToLocalDate(ymd); // local date, no UTC
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(dt);
}

/**
 * Format time for display
 */
function formatTime(dateTime) {
  const d = new Date(dateTime);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${ampm}`;
}

/**
 * Render month calendar
 */
function renderMonthCalendar(monthDate, selectedDate, datesWithEvents) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  // First day of month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // Start from Sunday of the week containing first day
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  
  // End on Saturday of the week containing last day
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
  
  const weeks = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateKey = localYMD(currentDate);
      const isCurrentMonth = currentDate.getMonth() === month;
      const isSelected = selectedDate && dateKey === selectedDate;
      const hasEvent = datesWithEvents.has(dateKey);
      const isToday = dateKey === localYMD(); // Check if this is today
      
      week.push({
        date: new Date(currentDate),
        dateKey,
        isCurrentMonth,
        isSelected,
        hasEvent,
        isToday
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push(week);
  }
  
  let html = '<div class="calendar-month">';
  html += '<div class="calendar-weekdays">';
  html += '<div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>';
  html += '</div>';
  
  weeks.forEach(week => {
    html += '<div class="calendar-week">';
    week.forEach(day => {
      const classes = ['calendar-day'];
      if (!day.isCurrentMonth) classes.push('calendar-day-other-month');
      if (day.isSelected) classes.push('calendar-day-selected');
      if (day.hasEvent) classes.push('calendar-day-has-event');
      if (day.isToday) classes.push('calendar-day-today');
      
      html += `<div class="${classes.join(' ')}" data-date="${day.dateKey}">`;
      html += `<span class="calendar-day-number">${day.date.getDate()}</span>`;
      if (day.hasEvent) {
        html += '<span class="calendar-day-marker">●</span>';
      }
      html += '</div>';
    });
    html += '</div>';
  });
  
  html += '</div>';
  return html;
}

/**
 * Render events list for selected date
 */
function renderEventsList(dateKey) {
  const events = getEventsForDate(dateKey);
  const sortedEvents = events.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return new Date(a.startAt) - new Date(b.startAt);
  });
  
  let html = '<div class="calendar-events-list">';
  
  if (sortedEvents.length === 0) {
    html += '<div class="calendar-events-empty">No events for this day</div>';
  } else {
    sortedEvents.slice(0, 6).forEach(event => {
      const timeStr = event.allDay ? 'All day' : formatTime(event.startAt);
      const typeLabels = {
        health: 'Health',
        program: 'Program',
        personal: 'Personal',
        tendai: 'Obrium'
      };
      
      html += `<div class="calendar-event-item" data-event-id="${event.id}">`;
      html += `<div class="calendar-event-time">${timeStr}</div>`;
      html += `<div class="calendar-event-content">`;
      html += `<div class="calendar-event-title">${event.title}</div>`;
      html += `<div class="calendar-event-meta">${typeLabels[event.type] || event.type} · ${event.status}</div>`;
      html += `</div>`;
      html += `</div>`;
    });
  }
  
  html += '</div>';
  return html;
}

/**
 * Open Calendar Panel
 * @param {string} initialDate - Initial date in YYYY-MM-DD format (optional)
 * @param {string} source - Source of open ('feed' | 'talk' | 'nextstep' | etc)
 */
function openPanel(initialDate = null) {
  window.__calCleanup?.('before-open');

  if (isPanelOpen && calendarPanel) {
    closePanel();
    return;
  }

  if (!calendarPanel) {
    ensureCalendarPanel();
  }
  
  // Set initial date (use local date to avoid UTC offset)
  const today = localYMD();
  currentSelectedDate = initialDate || today;
  currentMonth = currentSelectedDate ? ymdToLocalDate(currentSelectedDate) : new Date();
  
  updateCalendarPanel();
  
  // Show panel
  calendarPanel.style.display = 'flex';
  isPanelOpen = true;
  window.isCalendarPanelOpen = true; // Export for external check
  document.body.classList.add('calendar-open'); // Lock background scroll

  // Update trigger aria-expanded (both desktop and mobile buttons)
  const trigger = document.getElementById('calendarBtn');
  const triggerMobile = document.getElementById('calendarBtnMobile');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  if (triggerMobile) triggerMobile.setAttribute('aria-expanded', 'true');
  
  // Focus trap and ESC handler
  setupPanelKeyboardHandlers();
  
  // Debug log
  if (!window.IS_PRODUCTION_READY) {
    console.log('[CALENDAR] Panel opened');
  }
}

/**
 * Close Calendar Panel
 */
function closePanel() {
  if (calendarPanel) {
    calendarPanel.style.display = 'none';
    isPanelOpen = false;
    window.isCalendarPanelOpen = false;
    document.body.classList.remove('calendar-open');

    const trigger = document.getElementById('calendarBtn');
    const triggerMobile = document.getElementById('calendarBtnMobile');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (triggerMobile) triggerMobile.setAttribute('aria-expanded', 'false');
    if (globalEscHandler) {
      document.removeEventListener('keydown', globalEscHandler);
      globalEscHandler = null;
    }
    if (!window.IS_PRODUCTION_READY) {
      console.log('[CALENDAR] Panel closed');
    }
    window.__calCleanup?.('after-close');
  }
}

/**
 * Toggle Calendar Panel (for button click)
 */
function togglePanel() {
  if (isPanelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

/**
 * Unified API: openCalendar
 */
export function openCalendar(initialDate = null) {
  openPanel(initialDate);
}

/**
 * Unified API: closeCalendar
 */
export function closeCalendar() {
  closePanel();
}

/**
 * Unified API: toggleCalendar
 */
export function toggleCalendar() {
  togglePanel();
}

// Global ESC handler (removed when panel closes)
let globalEscHandler = null;

/**
 * Setup keyboard handlers (ESC to close)
 */
function setupPanelKeyboardHandlers() {
  // Remove old handler if exists
  if (globalEscHandler) {
    document.removeEventListener('keydown', globalEscHandler);
  }
  
  globalEscHandler = (e) => {
    if (e.key === 'Escape' && isPanelOpen) {
      closePanel();
      if (globalEscHandler) {
        document.removeEventListener('keydown', globalEscHandler);
        globalEscHandler = null;
      }
    }
  };
  
  document.addEventListener('keydown', globalEscHandler);
}

/**
 * Update Calendar Panel content
 */
function updateCalendarPanel() {
  if (!calendarPanel) return;
  
  const monthKey = localYMD(currentMonth).substring(0, 7);
  const datesWithEvents = getDatesWithEvents(monthKey);
  const selectedDateKey = currentSelectedDate;
  
  const monthHtml = renderMonthCalendar(currentMonth, selectedDateKey, datesWithEvents);
  const eventsHtml = renderEventsList(selectedDateKey);
  
  const todayKey = localYMD();
  const dateLabel = selectedDateKey === todayKey 
    ? 'Today' 
    : formatDate(selectedDateKey);
  
  // Get month/year header
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthHeader = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  
  calendarPanel.innerHTML = `
    <div class="calendar-panel">
      <div class="calendar-panel-header">
        <h3 class="calendar-panel-title">Calendar</h3>
        <button class="calendar-panel-close" id="calendarPanelClose">×</button>
      </div>
      
      <div class="calendar-panel-body">
        <div class="calendar-section">
          <div class="calendar-month-header">${monthHeader}</div>
          ${monthHtml}
        </div>
        
        <div class="calendar-section">
          <div class="calendar-section-header">
            <h4>${dateLabel}</h4>
          </div>
          ${eventsHtml}
        </div>
      </div>
      
      <div class="calendar-panel-footer">
        <button class="btn calendar-btn-add" id="calendarBtnAdd">+ Add event</button>
        <button type="button" class="cal-today-btn" id="calendarBtnToday">Today</button>
      </div>
    </div>
  `;
  
  // Setup event handlers
  setupCalendarHandlers();
}

/**
 * Setup calendar event handlers
 */
function setupCalendarHandlers() {
  // Close button
  const closeBtn = document.getElementById('calendarPanelClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }
  
  // Overlay click to close
  calendarPanel.addEventListener('click', (e) => {
    if (e.target === calendarPanel) {
      closePanel();
    }
  });
  
  // Day selection
  const dayElements = calendarPanel.querySelectorAll('.calendar-day');
  dayElements.forEach(dayEl => {
    dayEl.addEventListener('click', () => {
      const dateKey = dayEl.getAttribute('data-date');
      if (dateKey) {
        currentSelectedDate = dateKey;
        updateCalendarPanel();
        
        // Update day state if needed (for Feed navigation)
        if (window.switchToDate) {
          window.switchToDate(dateKey);
        }
      }
    });
  });
  
  // Event item click (edit)
  const eventItems = calendarPanel.querySelectorAll('.calendar-event-item');
  eventItems.forEach(item => {
    item.addEventListener('click', () => {
      const eventId = item.getAttribute('data-event-id');
      if (eventId && window.openEventEdit) {
        window.openEventEdit(eventId);
      }
    });
  });
  
  // Add event button
  const addBtn = document.getElementById('calendarBtnAdd');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (window.openEventAdd) {
        window.openEventAdd(currentSelectedDate);
      }
    });
  }
  
  // Today button
  const todayBtn = document.getElementById('calendarBtnToday');
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      const today = localYMD();
      currentSelectedDate = today;
      currentMonth = new Date(); // Switch to current month
      updateCalendarPanel();
    });
  }
  
  // Month navigation (prev/next)
  // Can be added later if needed
}

// Export for global use (unified API only)
window.openCalendar = openCalendar;
window.closeCalendar = closeCalendar;
window.toggleCalendar = toggleCalendar;

