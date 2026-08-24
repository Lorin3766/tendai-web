// Serron — Calendar Entry Point
// @owner: calendar
// @role: init
// One source of truth: #calendarBtn → toggleCalendar() → calendar panel
// BUILD: 2025-12-21-final-clean

// Only run in unified-mode (hard stop for old calendar)
import { RUN_MODE, IS_VERBOSE_BOOT_LOGS } from './env-flags.js';

if (IS_VERBOSE_BOOT_LOGS) {
  console.log('[CAL][INIT] RUN_MODE=', RUN_MODE);
}

if (RUN_MODE !== 'unified') {
  console.error('[CALENDAR] DEPRECATED: Old calendar mode detected. Only unified-mode is supported.');
  throw new Error('Calendar only works in unified-mode. Set RUN_MODE to "unified" in env-flags.js');
}

if (RUN_MODE === 'unified' && IS_VERBOSE_BOOT_LOGS) {
  console.log('[CAL][INIT] using features/calendar');
}

import { ensureCalendarPanel, toggleCalendar } from './features/calendar/ui.js';
import './features/calendar/events.js';
import './features/calendar/reminders.js';

/**
 * Remove legacy calendar DOM + blocking classes. Safeguard: never remove elements with data-cal="new".
 * @param {string} phase - 'boot' | 'before-open' | 'after-close'
 */
function cleanupLegacyCalendarArtifacts(phase) {
  let overlay = 0, modal = 0, overlayClass = 0, modalClass = 0;
  const removedClasses = [];

  const elOverlay = document.getElementById('calendarOverlay');
  if (elOverlay) { elOverlay.remove(); overlay = 1; }
  const elModal = document.getElementById('calendarModal');
  if (elModal) { elModal.remove(); modal = 1; }

  document.querySelectorAll('.calendar-overlay').forEach((el) => {
    if (el.dataset.cal !== 'new') { el.remove(); overlayClass++; }
  });
  document.querySelectorAll('.calendar-modal').forEach((el) => {
    if (el.dataset.cal !== 'new') { el.remove(); modalClass++; }
  });

  const blockClasses = ['calendar-open', 'modal-open', 'overlay-open', 'checkin-overlay-open'];
  for (const c of blockClasses) {
    if (document.body.classList.contains(c)) { document.body.classList.remove(c); removedClasses.push(c); }
    if (document.documentElement.classList.contains(c)) { document.documentElement.classList.remove(c); if (!removedClasses.includes(c)) removedClasses.push(c); }
  }

}

window.__calCleanup = cleanupLegacyCalendarArtifacts;

function attachCalendarTrigger() {
  const btn = document.getElementById('calendarBtn');
  const btnMobile = document.getElementById('calendarBtnMobile');

  cleanupLegacyCalendarArtifacts('boot');

  ensureCalendarPanel();

  const legacy = {
    calendarOverlay: document.getElementById('calendarOverlay') ? 1 : 0,
    calendarModal: document.getElementById('calendarModal') ? 1 : 0,
    calendarOverlayClass: document.querySelectorAll('.calendar-overlay').length,
    calendarModalClass: document.querySelectorAll('.calendar-modal').length
  };
  const legacyCount = legacy.calendarOverlay + legacy.calendarModal + legacy.calendarOverlayClass + legacy.calendarModalClass;
  if (legacyCount > 0 && IS_VERBOSE_BOOT_LOGS) {
    console.warn('[CAL][DUP] legacy calendar dom still present', legacy);
  }

  // Attach to desktop button
  if (btn) {
    if (btn.dataset.calendarBound !== '1') {
      btn.dataset.calendarBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCalendar();
      });
      if (IS_VERBOSE_BOOT_LOGS) console.log('✅ Calendar trigger attached: #calendarBtn (desktop)');
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
      if (IS_VERBOSE_BOOT_LOGS) console.log('✅ Calendar trigger attached: #calendarBtnMobile (mobile)');
    }
  }
}

// BUILD stamp for proof
if (IS_VERBOSE_BOOT_LOGS) console.log('[CALENDAR] BUILD: 2025-12-21-final-clean');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachCalendarTrigger);
} else {
  attachCalendarTrigger();
}

