// TendAI — Calendar Entry Point
// @owner: calendar
// @role: init
// One source of truth: #calendarBtn → toggleCalendar() → calendar panel
// BUILD: 2025-12-21-final-clean

import { ensureCalendarPanel, toggleCalendar } from './features/calendar/ui.js';
import './features/calendar/events.js';
import './features/calendar/reminders.js';

function attachCalendarTrigger() {
  // Desktop button (in tabs)
  const btn = document.getElementById('calendarBtn');
  // Mobile button (in header)
  const btnMobile = document.getElementById('calendarBtnMobile');

  // Ensure panel container exists in DOM (created once, hidden until open)
  ensureCalendarPanel();

  // Attach to desktop button
  if (btn) {
    if (btn.dataset.calendarBound !== '1') {
      btn.dataset.calendarBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCalendar();
      });
      console.log('✅ Calendar trigger attached: #calendarBtn (desktop)');
    }
  }

  // Attach to mobile button
  if (btnMobile) {
    if (btnMobile.dataset.calendarBound !== '1') {
      btnMobile.dataset.calendarBound = '1';
      btnMobile.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCalendar();
      });
      console.log('✅ Calendar trigger attached: #calendarBtnMobile (mobile)');
    }
  }
}

// BUILD stamp for proof
console.log('[CALENDAR] BUILD: 2025-12-21-final-clean');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachCalendarTrigger);
} else {
  attachCalendarTrigger();
}

