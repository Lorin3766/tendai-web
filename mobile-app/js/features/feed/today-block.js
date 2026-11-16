// Today block: one local step for the active slot. No Gemini.
// Task 13b: compact single-row presentation (~44–52 px). Behavior unchanged.
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

function verbForStep(step) {
  if (!step) return 'Do it';
  if (step.kind === 'checkin') {
    return step.id === 'checkin-sleep' ? 'Log sleep' : 'Do it';
  }
  return 'Do it';
}

function statusLabel(view) {
  if (view.mode === 'recorded') {
    const st = view.record?.status;
    if (st === 'skipped') return 'not today';
    return 'done';
  }
  return 'not done';
}

function lineLabel(view) {
  const slot = (view.slot || view.step?.slot) === 'evening' ? 'Evening' : 'Morning';
  const step = view.step;
  if (view.mode === 'recorded') {
    return `Today: ${statusLabel(view)}`;
  }
  if (step?.kind === 'checkin') {
    return `${slot} check-in · ${statusLabel(view)}`;
  }
  const short = String(step?.text || 'Today step').replace(/\s+/g, ' ').trim();
  const clipped = short.length > 36 ? `${short.slice(0, 34)}…` : short;
  return `${slot} · ${clipped}`;
}

function renderRecorded(record, step, actions, ack, textEl, slotEl) {
  clearNode(actions);
  if (slotEl) slotEl.textContent = '';
  if (textEl) textEl.textContent = `Today: ${record.status === 'skipped' ? 'not today' : 'done'}`;
  // Keep Task 10 acknowledgments (e.g. "Logged.") as a quiet line under the compact row.
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
      clearNode(actions);
      ack.hidden = false;
      ack.textContent = acknowledgment(record);
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
  root.classList.add('today-block--compact');
  clearNode(actions);
  ack.hidden = true;
  ack.textContent = '';

  if (view.mode === 'recorded') {
    offeredCheckin = null;
    renderRecorded(view.record, view.step, actions, ack, textEl, slotEl);
    return;
  }

  const step = view.step;
  const dateKey = view.dateKey || localDateKey(obriumNow());
  const slot = view.slot || (step.slot === 'evening' ? 'evening' : 'morning');
  if (slotEl) slotEl.textContent = '';
  textEl.textContent = lineLabel(view);

  if (step.kind === 'checkin') {
    offeredCheckin = { date: dateKey, slot, actionId: step.id, area: step.area };
    actions.appendChild(
      button(verbForStep(step), 'btn btn-initialize today-block__btn today-block__btn--primary', () => {
        if (typeof window.openDayCheckin === 'function') window.openDayCheckin(step.focus);
      }),
    );
    return;
  }
  offeredCheckin = null;
  actions.appendChild(
    button('Done', 'btn btn-initialize today-block__btn today-block__btn--primary', () => {
      saveTodayStep({ date: dateKey, slot, actionId: step.id, area: step.area, status: 'done' });
      renderTodayBlock();
    }),
  );
  actions.appendChild(
    button('Not today', 'btn today-block__btn today-block__btn--quiet', () => {
      saveTodayStep({ date: dateKey, slot, actionId: step.id, area: step.area, status: 'skipped' });
      renderTodayBlock();
    }),
  );
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
