// Today block: greeting by local time + one local step for the active slot. No Gemini.
// Task 13b / 14b: compact single-row presentation (~44–52 px). Behavior unchanged from Tasks 10/13.
// @owner: feed
// @role: ui

import { dayState, profileState } from '../../state.js';
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

/** 14b: greeting by local hour. Never "Guest"; name only if the user entered one. */
export function feedGreetingFor(now = obriumNow(), profile = profileState.get?.() || {}) {
  const d = now instanceof Date ? now : new Date(now);
  const h = d.getHours();
  let hello = 'Good evening.';
  if (h < 12) hello = 'Good morning.';
  else if (h < 17) hello = 'Good afternoon.';
  const raw =
    profile?.body?.preferredName ||
    profile?.lifestyle?.preferredName ||
    profile?.preferredName ||
    profile?.displayName ||
    '';
  const name = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40);
  if (!name || /^guest$/i.test(name)) return hello;
  return `${hello.replace(/\.$/, '')}, ${name}.`;
}

function lineLabel(view) {
  const step = view.step;
  if (view.mode === 'recorded') {
    if (view.record?.status === 'skipped') return 'Not today';
    return '✓ Done today';
  }
  if (step?.kind === 'checkin') {
    if (step.id === 'checkin-sleep') return 'Log how you slept · 1 min';
    return 'Log your day · 1 min';
  }
  const short = String(step?.text || 'Today step').replace(/\s+/g, ' ').trim();
  const clipped = short.length > 40 ? `${short.slice(0, 38)}…` : short;
  return clipped;
}

function renderRecorded(record, step, actions, ack, textEl, slotEl, rowEl, root) {
  clearNode(actions);
  if (slotEl) slotEl.textContent = '';
  if (rowEl) rowEl.hidden = false;
  const pendingRating = record.status === 'done' && step.kind === 'action' && record.rating == null;
  if (textEl) {
    if (record.status === 'skipped') textEl.textContent = 'Not today';
    else textEl.textContent = pendingRating ? 'Done today' : '✓ Done today';
  }
  // 15c-2: status lives in the row; keep ack text for screen readers / tests that read it.
  ack.hidden = false;
  ack.textContent = acknowledgment({ ...record, kind: step.kind });
  if (root) {
    root.classList.toggle('today-block--settled', !pendingRating);
  }
  if (pendingRating) {
    if (root) root.classList.remove('today-block--settled');
    for (let n = 1; n <= 5; n += 1) {
      const value = n;
      actions.appendChild(
        button(String(value), 'btn today-block__chip', () => {
          saveTodayStep({ ...record, rating: value });
          renderTodayBlock();
        }),
      );
    }
    actions.appendChild(
      button('Skip', 'btn today-block__chip today-block__chip--quiet', () => {
        clearNode(actions);
        if (textEl) textEl.textContent = '✓ Done today';
        if (root) root.classList.add('today-block--settled');
        ack.hidden = false;
        ack.textContent = acknowledgment(record);
      }),
    );
  }
}

function setTodaySource(step, sourceEl, expandEl) {
  const short = String(step?.sourceShort || '').trim();
  const isLibraryAction = step?.kind === 'action' && short;
  if (sourceEl) {
    if (isLibraryAction) {
      sourceEl.hidden = false;
      sourceEl.textContent = `Source: ${short}`;
    } else {
      sourceEl.hidden = true;
      sourceEl.textContent = '';
    }
  }
  if (expandEl) {
    expandEl.hidden = !isLibraryAction;
  }
}

export function renderTodayBlock() {
  const root = document.getElementById('todayBlock');
  const greetEl = document.getElementById('todayGreeting');
  const rowEl = document.getElementById('todayBlockRow');
  const slotEl = document.getElementById('todayBlockSlot');
  const textEl = document.getElementById('todayBlockText');
  const sourceEl = document.getElementById('todayBlockSource');
  const expandEl = document.getElementById('todayBlockExpand');
  const actions = document.getElementById('todayBlockActions');
  const ack = document.getElementById('todayBlockAck');
  if (!root || !textEl || !actions || !ack) return;

  const now = obriumNow();
  const profile = profileState.get?.() || {};
  if (greetEl) greetEl.textContent = feedGreetingFor(now, profile);

  const view = resolveTodayDisplay(displayOptions());
  root.hidden = false;
  root.classList.add('today-block--compact');
  root.classList.remove('today-block--settled');
  clearNode(actions);
  ack.hidden = true;
  ack.textContent = '';
  if (greetEl) greetEl.hidden = false;

  // 14b: if nothing is eligible, show only the greeting
  if (view.mode === 'hidden' || !view.step?.text) {
    offeredCheckin = null;
    if (rowEl) rowEl.hidden = true;
    textEl.textContent = '';
    setTodaySource(null, sourceEl, expandEl);
    return;
  }
  if (rowEl) rowEl.hidden = false;

  if (view.mode === 'recorded') {
    offeredCheckin = null;
    // Settled row is status-only — no source / disclaimer under the line.
    setTodaySource(null, sourceEl, expandEl);
    renderRecorded(view.record, view.step, actions, ack, textEl, slotEl, rowEl, root);
    return;
  }

  const step = view.step;
  const dateKey = view.dateKey || localDateKey(now);
  const slot = view.slot || (step.slot === 'evening' ? 'evening' : 'morning');
  if (slotEl) slotEl.textContent = '';
  textEl.textContent = lineLabel(view);
  setTodaySource(step, sourceEl, expandEl);

  if (step.kind === 'checkin') {
    offeredCheckin = { date: dateKey, slot, actionId: step.id, area: step.area };
    setTodaySource(null, sourceEl, expandEl);
    actions.appendChild(
      button('Log', 'btn btn-initialize today-block__btn today-block__btn--primary', () => {
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
  const done =
    pending.actionId === 'checkin-sleep'
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
