// Serron — Edit Agent modal (Human OS — legacy create flow removed; use Ultimate Agent Creator)
// @owner: human-os
// @role: ui

import { updateUserAgent } from './user-agents.js';

/**
 * @typedef {{ id: string, name?: string, instruction?: string }} AgentEditPayload
 */

/**
 * Edit an existing agent (name / mission). Create flows use `openUltimateAgentCreatorModal`.
 * @param {() => void} [onSaved]
 * @param {AgentEditPayload} edit - required `{ id, name?, instruction? }`
 */
export function openEditAgentModal(onSaved, edit) {
  if (!edit || !edit.id) return;

  document.getElementById('tendai-ultimate-agent-creator-overlay')?.remove();
  document.getElementById('tendai-blueprint-store-overlay')?.remove();
  document.getElementById('tendai-create-agent-overlay')?.remove();
  document.querySelectorAll('body > .human-os-modal-overlay').forEach((el) => el.remove());

  const editId = String(edit.id);

  const overlay = document.createElement('div');
  overlay.id = 'tendai-edit-agent-overlay';
  overlay.className = 'human-os-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'tendai-agent-modal-title');

  const modal = document.createElement('div');
  modal.className = 'human-os-modal';

  const title = document.createElement('h2');
  title.id = 'tendai-agent-modal-title';
  title.className = 'human-os-modal__title';
  title.textContent = 'EDIT FOCUS AREA';

  const intro = document.createElement('p');
  intro.className = 'human-os-modal__intro';
  intro.textContent =
    'Update name or mission. Renaming migrates Feed insights; routing follows the new name.';

  const docLabel = document.createElement('p');
  docLabel.className = 'human-os-modal__doc-label';
  docLabel.textContent = 'Integration';

  const codeBlock = document.createElement('pre');
  codeBlock.className = 'human-os-modal__code';
  const code = document.createElement('code');
  code.textContent = `ObriumHumanOS.writeAgentInsight(\n  'AgentName',\n  'Short status line'\n);`;
  codeBlock.appendChild(code);

  const nameLabel = document.createElement('label');
  nameLabel.className = 'human-os-modal__label';
  nameLabel.htmlFor = 'tendai-agent-name';
  nameLabel.textContent = 'Designation';
  const nameInput = document.createElement('input');
  nameInput.id = 'tendai-agent-name';
  nameInput.type = 'text';
  nameInput.className = 'human-os-modal__input';
  nameInput.placeholder = 'e.g. Environmental scout';
  nameInput.autocomplete = 'off';
  nameInput.value = String(edit.name || '');

  const instrLabel = document.createElement('label');
  instrLabel.className = 'human-os-modal__label';
  instrLabel.htmlFor = 'tendai-agent-instruction';
  instrLabel.textContent = 'Mission / instruction';
  const instrInput = document.createElement('textarea');
  instrInput.id = 'tendai-agent-instruction';
  instrInput.className = 'human-os-modal__textarea';
  instrInput.rows = 4;
  instrInput.placeholder = 'What to monitor, thresholds, and how to phrase alerts.';
  instrInput.value = String(edit.instruction || '');

  const actions = document.createElement('div');
  actions.className = 'human-os-modal__actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'human-os-btn human-os-btn--steel';
  cancel.textContent = 'Cancel';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'human-os-btn human-os-btn--commit';
  save.textContent = 'Save changes';

  const close = () => overlay.remove();

  cancel.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  save.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const instruction = instrInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    updateUserAgent(editId, { name, instruction });
    close();
    if (typeof onSaved === 'function') onSaved();
  });

  modal.appendChild(title);
  modal.appendChild(intro);
  modal.appendChild(docLabel);
  modal.appendChild(codeBlock);
  modal.appendChild(nameLabel);
  modal.appendChild(nameInput);
  modal.appendChild(instrLabel);
  modal.appendChild(instrInput);
  actions.appendChild(cancel);
  actions.appendChild(save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  nameInput.focus();
  nameInput.select();
}

const AGENT_SOURCE_OPTIONS = [
  { id: 'apple_health', label: 'Apple Health / Watch' },
  { id: 'google_fit', label: 'Google Fit' },
  { id: 'devices_bt', label: 'Hardware Sync' },
  { id: 'manual', label: 'Terminal Uplink' },
  { id: 'global_api', label: 'AI Insights' },
];

function normalizeConnectedSources(agent) {
  const sd = agent?.sensor_data && typeof agent.sensor_data === 'object' ? agent.sensor_data : {};
  const fromArray = Array.isArray(sd.connected_sources)
    ? sd.connected_sources.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const fromPrimary = String(sd.source_mode || '').trim();
  const merged = fromPrimary && !fromArray.includes(fromPrimary) ? [fromPrimary, ...fromArray] : fromArray;
  return merged.length ? merged : ['devices_bt'];
}

/**
 * Configure an agent's connected data sources.
 * @param {() => void} [onSaved]
 * @param {{ id: string, name?: string, sensor_data?: object }} agent
 */
export function openConfigureAgentSourcesModal(onSaved, agent) {
  if (!agent || !agent.id) return;

  document.getElementById('tendai-ultimate-agent-creator-overlay')?.remove();
  document.getElementById('tendai-blueprint-store-overlay')?.remove();
  document.getElementById('tendai-create-agent-overlay')?.remove();
  document.querySelectorAll('body > .human-os-modal-overlay').forEach((el) => el.remove());

  const agentId = String(agent.id);
  const selected = new Set(normalizeConnectedSources(agent));

  const overlay = document.createElement('div');
  overlay.id = 'tendai-configure-agent-overlay';
  overlay.className = 'human-os-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'tendai-agent-configure-title');

  const modal = document.createElement('div');
  modal.className = 'human-os-modal';

  const title = document.createElement('h2');
  title.id = 'tendai-agent-configure-title';
  title.className = 'human-os-modal__title';
  title.textContent = 'CONFIGURE KNOWLEDGE BASE';

  const intro = document.createElement('p');
  intro.className = 'human-os-modal__intro';
  intro.textContent = `Adjust connected data streams for ${String(agent.name || 'this agent')}.`;

  const sourceGroup = document.createElement('div');
  sourceGroup.className = 'deploy-source-list';
  sourceGroup.innerHTML = AGENT_SOURCE_OPTIONS.map((src) => {
    const isSelected = selected.has(src.id);
    return `
      <button class="deploy-source-row ${isSelected ? 'is-selected' : ''}" type="button" data-config-source="${src.id}">
        <span class="deploy-source-copy">
          <span class="deploy-source-name">${src.label}</span>
          <span class="deploy-source-desc">${isSelected ? 'Connected' : 'Tap to connect'}</span>
        </span>
        <span class="deploy-source-check" aria-hidden="true">${isSelected ? '✓' : ''}</span>
      </button>
    `;
  }).join('');

  const actions = document.createElement('div');
  actions.className = 'human-os-modal__actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'human-os-btn human-os-btn--steel';
  cancel.textContent = 'Cancel';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'human-os-btn human-os-btn--commit';
  save.textContent = 'Save';

  const close = () => overlay.remove();

  function renderSources() {
    sourceGroup.querySelectorAll('[data-config-source]').forEach((el) => {
      const id = el.getAttribute('data-config-source');
      if (!id) return;
      const on = selected.has(id);
      el.classList.toggle('is-selected', on);
      const check = el.querySelector('.deploy-source-check');
      if (check) check.textContent = on ? '✓' : '';
      const desc = el.querySelector('.deploy-source-desc');
      if (desc) desc.textContent = on ? 'Connected' : 'Tap to connect';
    });
    save.disabled = selected.size === 0;
    save.setAttribute('aria-disabled', save.disabled ? 'true' : 'false');
  }

  sourceGroup.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-config-source]');
    if (!btn) return;
    const id = btn.getAttribute('data-config-source');
    if (!id) return;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    renderSources();
  });

  cancel.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  save.addEventListener('click', () => {
    const connectedSources = Array.from(selected);
    if (!connectedSources.length) return;
    const primary = connectedSources[0];
    const healthStack =
      primary === 'apple_health' ? 'apple_health' : primary === 'google_fit' ? 'google_fit' : primary === 'devices_bt' ? 'generic_bt' : null;
    updateUserAgent(agentId, {
      sensor_data: {
        ...(agent.sensor_data && typeof agent.sensor_data === 'object' ? agent.sensor_data : {}),
        source_mode: primary,
        connected_sources: connectedSources,
        health_stack: healthStack,
      },
    });
    close();
    if (typeof onSaved === 'function') onSaved();
  });

  modal.appendChild(title);
  modal.appendChild(intro);
  modal.appendChild(sourceGroup);
  actions.appendChild(cancel);
  actions.appendChild(save);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  renderSources();
}
