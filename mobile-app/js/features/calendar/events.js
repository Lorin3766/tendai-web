// Serron — Calendar Event Add/Edit Form
// @owner: calendar
// @role: ui
// Handles event creation and editing

import { addEvent, updateEvent, deleteEvent, getCalendarEvents, localYMD } from './state.js';

let eventFormOverlay = null;
let currentEditingEventId = null;

/**
 * Open Add Event form
 * @param {string} initialDate - Initial date in YYYY-MM-DD format
 */
export function openEventAdd(initialDate = null) {
  const today = initialDate || localYMD();
  const defaultDateTime = initialDate 
    ? `${initialDate}T09:00` 
    : new Date().toISOString().substring(0, 16);
  
  currentEditingEventId = null;
  showEventForm({
    title: '',
    type: 'personal',
    startAt: defaultDateTime,
    allDay: false,
    reminder: 'none',
    notes: ''
  });
}

/**
 * Open Edit Event form
 * @param {string} eventId - Event ID
 */
export function openEventEdit(eventId) {
  const events = getCalendarEvents();
  const event = events.find(e => e.id === eventId);
  
  if (!event) {
    return;
  }
  
  currentEditingEventId = eventId;
  
  // Format datetime for input
  const startAt = event.startAt.substring(0, 16);
  
  showEventForm({
    title: event.title,
    type: event.type,
    startAt: startAt,
    allDay: event.allDay,
    reminder: event.reminder,
    notes: event.notes || '',
    status: event.status
  });
}

/**
 * Show event form
 */
function showEventForm(eventData) {
  // Create overlay if doesn't exist
  if (!eventFormOverlay) {
    eventFormOverlay = document.createElement('div');
    eventFormOverlay.id = 'eventFormOverlay';
    eventFormOverlay.className = 'profile-modal-overlay';
    document.body.appendChild(eventFormOverlay);
  }
  
  const isEdit = currentEditingEventId !== null;
  
  eventFormOverlay.innerHTML = `
    <div class="profile-modal" style="max-width: 500px;">
      <div class="profile-modal-header">
        <h3 class="card-title">${isEdit ? 'Edit Event' : 'Add Event'}</h3>
        <button class="profile-modal-close" id="eventFormClose">×</button>
      </div>
      
      <form id="eventForm" class="profile-modal-content" style="padding: 20px;">
        <label class="goal-field">
          Title
          <input type="text" id="eventTitle" value="${eventData.title || ''}" placeholder="Event title" required />
        </label>
        
        <label class="goal-field">
          Type
          <select id="eventType">
            <option value="health" ${eventData.type === 'health' ? 'selected' : ''}>Health</option>
            <option value="program" ${eventData.type === 'program' ? 'selected' : ''}>Program</option>
            <option value="personal" ${eventData.type === 'personal' ? 'selected' : ''}>Personal</option>
            <option value="tendai" ${eventData.type === 'tendai' ? 'selected' : ''}>TendAI</option>
          </select>
        </label>
        
        <label class="goal-field">
          <input type="checkbox" id="eventAllDay" ${eventData.allDay ? 'checked' : ''} />
          <span>All day</span>
        </label>
        
        <label class="goal-field" id="eventDateTimeLabel">
          ${eventData.allDay ? 'Date' : 'Date & Time'}
          <input type="${eventData.allDay ? 'date' : 'datetime-local'}" id="eventStartAt" value="${eventData.startAt}" required />
        </label>
        
        <label class="goal-field">
          Reminder
          <select id="eventReminder">
            <option value="none" ${eventData.reminder === 'none' ? 'selected' : ''}>None</option>
            <option value="atTime" ${eventData.reminder === 'atTime' ? 'selected' : ''}>At time</option>
            <option value="1hBefore" ${eventData.reminder === '1hBefore' ? 'selected' : ''}>1 hour before</option>
            <option value="morning" ${eventData.reminder === 'morning' ? 'selected' : ''}>Morning</option>
            <option value="evening" ${eventData.reminder === 'evening' ? 'selected' : ''}>Evening</option>
          </select>
        </label>
        
        <label class="goal-field">
          Notes (optional)
          <textarea id="eventNotes" rows="2" placeholder="Additional notes">${eventData.notes || ''}</textarea>
        </label>
        
        ${isEdit ? `
          <div style="display: flex; gap: 8px; margin-top: 16px;">
            <button type="button" class="btn" id="eventMarkDone" style="flex: 1; background: rgba(76, 175, 80, 0.2);">Mark Done</button>
            <button type="button" class="btn" id="eventMarkSkipped" style="flex: 1; background: rgba(255, 152, 0, 0.2);">Skip</button>
            <button type="button" class="btn" id="eventDelete" style="flex: 1; background: rgba(244, 67, 54, 0.2);">Delete</button>
          </div>
        ` : ''}
      </form>
      
      <div class="profile-modal-footer">
        <button type="button" class="btn profile-modal-save" id="eventFormSave">Save</button>
        <button type="button" class="btn profile-modal-cancel" id="eventFormCancel" style="background: rgba(255,255,255,0.1);">Cancel</button>
      </div>
    </div>
  `;
  
  // Setup handlers
  setupEventFormHandlers();
  
  // Show overlay
  eventFormOverlay.style.display = 'flex';
  
  // Toggle date/datetime input based on allDay
  const allDayCheckbox = document.getElementById('eventAllDay');
  const dateTimeLabel = document.getElementById('eventDateTimeLabel');
  const dateTimeInput = document.getElementById('eventStartAt');
  
  if (allDayCheckbox && dateTimeLabel && dateTimeInput) {
    allDayCheckbox.addEventListener('change', () => {
      const isAllDay = allDayCheckbox.checked;
      const currentValue = dateTimeInput.value;
      const dateOnly = currentValue.split('T')[0];
      
      if (isAllDay) {
        // Switch to date only
        dateTimeLabel.innerHTML = 'Date <input type="date" id="eventStartAt" value="' + dateOnly + '" required />';
        const newInput = document.getElementById('eventStartAt');
        if (newInput) {
          newInput.addEventListener('change', () => {
            // Value updated
          });
        }
      } else {
        // Switch to datetime
        const datetimeValue = currentValue || new Date().toISOString().substring(0, 16);
        dateTimeLabel.innerHTML = 'Date & Time <input type="datetime-local" id="eventStartAt" value="' + datetimeValue + '" required />';
      }
    });
  }
}

/**
 * Setup event form handlers
 */
function setupEventFormHandlers() {
  // Close button
  const closeBtn = document.getElementById('eventFormClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeEventForm);
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('eventFormCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeEventForm);
  }
  
  // Overlay click
  eventFormOverlay.addEventListener('click', (e) => {
    if (e.target === eventFormOverlay) {
      closeEventForm();
    }
  });
  
  // Save button
  const saveBtn = document.getElementById('eventFormSave');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveEvent();
    });
  }
  
  // Mark Done
  const markDoneBtn = document.getElementById('eventMarkDone');
  if (markDoneBtn) {
    markDoneBtn.addEventListener('click', () => {
      if (currentEditingEventId) {
        updateEvent(currentEditingEventId, { status: 'done' });
        closeEventForm();
        if (window.closeCalendar) {
          window.closeCalendar();
        }
        if (window.openCalendar) {
          window.openCalendar();
        }
      }
    });
  }
  
  // Mark Skipped
  const markSkippedBtn = document.getElementById('eventMarkSkipped');
  if (markSkippedBtn) {
    markSkippedBtn.addEventListener('click', () => {
      if (currentEditingEventId) {
        updateEvent(currentEditingEventId, { status: 'skipped' });
        closeEventForm();
        if (window.closeCalendar) {
          window.closeCalendar();
        }
        if (window.openCalendar) {
          window.openCalendar();
        }
      }
    });
  }
  
  // Delete
  const deleteBtn = document.getElementById('eventDelete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (currentEditingEventId && confirm('Delete this event?')) {
        deleteEvent(currentEditingEventId);
        closeEventForm();
        if (window.closeCalendar) {
          window.closeCalendar();
        }
        if (window.openCalendar) {
          window.openCalendar();
        }
      }
    });
  }
}

/**
 * Save event
 */
function saveEvent() {
  const title = document.getElementById('eventTitle').value.trim();
  const type = document.getElementById('eventType').value;
  const allDay = document.getElementById('eventAllDay').checked;
  const startAtInput = document.getElementById('eventStartAt').value;
  const reminder = document.getElementById('eventReminder').value;
  const notes = document.getElementById('eventNotes').value.trim();
  
  if (!title) {
    alert('Please enter a title');
    return;
  }
  
  // Format startAt
  let startAt = startAtInput;
  if (allDay) {
    startAt = `${startAtInput}T00:00:00`;
  } else if (!startAt.includes('T')) {
    startAt = `${startAtInput}:00`;
  }
  
  if (currentEditingEventId) {
    // Update existing
    updateEvent(currentEditingEventId, {
      title,
      type,
      allDay,
      startAt,
      reminder,
      notes
    });
  } else {
    // Create new
    addEvent({
      title,
      type,
      allDay,
      startAt,
      reminder,
      notes
    });
  }
  
  closeEventForm();
  
  // Refresh calendar panel if open (reopen with same date)
  const wasOpen = window.isCalendarPanelOpen || false;
  if (window.closeCalendar) {
    window.closeCalendar();
  }
  if (wasOpen) {
    setTimeout(() => {
      const currentDate = currentEditingEventId 
        ? (() => {
            const events = window.getCalendarEvents ? window.getCalendarEvents() : [];
            const event = events.find(e => e.id === currentEditingEventId);
            return event ? new Date(event.startAt).toISOString().split('T')[0] : null;
          })()
        : null;
      if (window.openCalendar) {
        window.openCalendar(currentDate);
      }
    }, 300);
  }
  
  // Update Next Step
  if (window.updateNextStepDisplay) {
    window.updateNextStepDisplay();
  }
}

/**
 * Close event form
 */
function closeEventForm() {
  if (eventFormOverlay) {
    eventFormOverlay.style.display = 'none';
  }
  currentEditingEventId = null;
}

// Export for global use
window.openEventAdd = openEventAdd;
window.openEventEdit = openEventEdit;

