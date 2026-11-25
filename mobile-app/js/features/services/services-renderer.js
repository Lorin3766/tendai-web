// Obrium — Services Renderer
// @owner: services
// @role: ui
// Flat Services rows (Labs / Programs / Focus Areas). Online doctor removed from UI (15d-3).

import { openBlueprintStoreModal } from '../human-os/blueprint-store-modal.js';

/**
 * Flat list: one 1px border per row. No nested card / chevron.
 * Labs → Coming soon (lab booking / partner flows are not live).
 * Programs → opens the existing Create my plan Talk flow (real).
 * Focus Areas → opens the same Focus Area picker as "+ Add Focus".
 */
function buildFlatRow({ name, soon = false, attrs = {} }) {
  if (soon) {
    const row = document.createElement('div');
    row.className = 'service-flat-row service-flat-row--soon';
    row.setAttribute('aria-disabled', 'true');
    const label = document.createElement('span');
    label.className = 'service-flat-row__name';
    label.textContent = name;
    const soonEl = document.createElement('span');
    soonEl.className = 'service-flat-row__soon';
    soonEl.textContent = 'Coming soon';
    row.appendChild(label);
    row.appendChild(soonEl);
    return row;
  }
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'service-flat-row';
  Object.entries(attrs).forEach(([k, v]) => row.setAttribute(k, v));
  const label = document.createElement('span');
  label.className = 'service-flat-row__name';
  label.textContent = name;
  row.appendChild(label);
  return row;
}

function fillServicesList(listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  listEl.appendChild(buildFlatRow({ name: 'Labs', soon: true }));
  listEl.appendChild(
    buildFlatRow({
      name: 'Programs',
      attrs: { 'data-service': 'mini-program', 'data-program-id': 'create-my-plan' },
    }),
  );
  listEl.appendChild(
    buildFlatRow({
      name: 'Focus Areas',
      attrs: { 'data-action': 'open-focus-picker' },
    }),
  );
}

/** Mobile SERVICES screen — flat rows, no Online doctor. */
export function renderAllServicesMobile(container) {
  if (!container) return;
  let list = container.querySelector('#servicesFlatList');
  if (!list) {
    container.innerHTML = '';
    list = document.createElement('div');
    list.className = 'services-flat-list';
    list.id = 'servicesFlatList';
    container.appendChild(list);
  }
  fillServicesList(list);
}

/** Desktop right column — same flat rows. */
export function renderAllServicesDesktop(rightPanel) {
  if (!rightPanel) return;
  // Remove legacy Online doctor card if present.
  rightPanel.querySelector('#onlineDoctorCard')?.remove();

  let list = rightPanel.querySelector('#servicesFlatListDesktop');
  if (!list) {
    // Clear old collapsible cards (labs / programs / agents).
    rightPanel.querySelectorAll('#labsCard, #miniPlansCard, #agentsCard, #onlineDoctorCard').forEach((el) => el.remove());
    list = document.createElement('div');
    list.className = 'services-flat-list services-flat-list--desktop';
    list.id = 'servicesFlatListDesktop';
    rightPanel.appendChild(list);
  }
  fillServicesList(list);
}

/** Open the same Focus Area picker as the Feed "+ Add Focus" pill. */
export function openServicesFocusPicker() {
  openBlueprintStoreModal(() => {
    if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
    if (typeof window.renderServices === 'function') window.renderServices();
    if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
  });
}

// Kept for callers that still import these names (no-ops after 15d-3 flatten).
export function renderLabs() {}
export function renderOnlineDoctor() {}
export function renderMiniPrograms() {}
export function renderAgentsSection() {}
