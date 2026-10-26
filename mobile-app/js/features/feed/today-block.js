// Today block: one local step for the active slot. No Gemini.
// @owner: feed
// @role: ui

import { dayState } from '../../state.js';
import { getSelectedFocusAreaIds } from '../human-os/focus-areas.js';
import { obriumNow, localDateKey } from '../../core/obrium-clock.js';
import { isContentPreviewEnabled } from './content-library.js';
import {
  acknowledgment,
  contactSlotsPerDay,
  loadTodaySteps,
  resolveTodayDisplay,
  saveTodayStep,
} from './today-steps.js';

function daySnapshot() {
  const today = dayState.loadDayStateForToday();
  return {
    sleepHours: today?.sleep?.hours ?? null,
    energy: today?.energy ?? null,
    stressLevel: today?.stressLevel ?? null,
  };
}

function displayOptions() {
  return {
    now: obriumNow(),
    slotsPerDay: contactSlotsPerDay(),
    areas: getSelectedFocusAreaIds(),
    history: loadTodaySteps(),
    day: daySnapshot(),
    preview: isContentPreviewEnabled(),
  };
}

function clearNode(node) {
  if (!node) return;
  node.replaceChildren();
}

let offeredCheckin = null;

function button(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderRecorded(record, step, actions, ack) {
  clearNode(actions);
  ack.hidden = false;
  ack.textContent = acknowledgment({ ...record, kind: step.kind });
  if (record.status === 'done' && step.kind === 'action' && record.rating == null) {
    for (let n = 1; n <= 5; n += 1) {
      const value = n;
      actions.appendChild(button(String(value), 'btn today-block__chip', () => {
        saveTodayStep({ ...record, rating: value });
        renderTodayBlock();
      }));
    }
    actions.appendChild(button('Skip', 'btn today-block__chip today-block__chip--quiet', () => {
      ack.hidden = false;
      ack.textContent = acknowledgment(record);
      clearNode(actions);
    }));
  }
}

export function renderTodayBlock() {
  const root = document.getElementById('todayBlock');
  const slotEl = document.getElementById('todayBlockSlot');
  const textEl = document.getElementById('todayBlockText');
  const actions = document.getElementById('todayBlockActions');
  const ack = document.getElementById('todayBlockAck');
  if (!root || !textEl || !actions || !ack) return;

  const view = resolveTodayDisplay(displayOptions());
  if (view.mode === 'hidden' || !view.step?.text) {
    offeredCheckin = null;
    root.hidden = true;
    return;
  }
  root.hidden = false;
  const slotName = (view.slot || view.step.slot) === 'evening' ? 'Evening' : 'Morning';
  if (slotEl) slotEl.textContent = slotName;
  textEl.textContent = view.step.text;
  clearNode(actions);
  ack.hidden = true;
  ack.textContent = '';

  if (view.mode === 'recorded') {
    offeredCheckin = null;
    renderRecorded(view.record, view.step, actions, ack);
    return;
  }

  const step = view.step;
  const dateKey = view.dateKey || localDateKey(obriumNow());
  const slot = view.slot || (step.slot === 'evening' ? 'evening' : 'morning');
  if (step.kind === 'checkin') {
    offeredCheckin = { date: dateKey, slot, actionId: step.id, area: step.area };
    actions.appendChild(button(step.id === 'checkin-sleep' ? 'Log sleep' : 'Open check-in', 'btn btn-initialize today-block__btn', () => {
      if (typeof window.openDayCheckin === 'function') window.openDayCheckin(step.focus);
    }));
    return;
  }
  offeredCheckin = null;
  actions.appendChild(button('Done', 'btn btn-initialize today-block__btn', () => {
    saveTodayStep({ date: dateKey, slot, actionId: step.id, area: step.area, status: 'done' });
    renderTodayBlock();
  }));
  actions.appendChild(button('Not today', 'btn today-block__btn today-block__btn--quiet', () => {
    saveTodayStep({ date: dateKey, slot, actionId: step.id, area: step.area, status: 'skipped' });
    renderTodayBlock();
  }));
}

function completeCheckinStep() {
  const pending = offeredCheckin;
  if (!pending) return;
  const day = daySnapshot();
  const loggedEnergy = day.energy != null && day.energy !== '';
  const loggedStress = day.stressLevel != null && day.stressLevel !== '';
  const done = pending.actionId === 'checkin-sleep'
    ? day.sleepHours != null && day.sleepHours !== ''
    : loggedEnergy || loggedStress;
  if (!done) return;
  offeredCheckin = null;
  saveTodayStep({ ...pending, status: 'done' });
  renderTodayBlock();
}

function init() {
  renderTodayBlock();
  window.addEventListener('obrium:checkin-saved', () => completeCheckinStep());
  window.renderTodayBlock = renderTodayBlock;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
