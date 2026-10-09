// Obrium — Settings: read-only view of user_memory ("Notes Obrium has inferred about you")
// @owner: settings
// @role: ui

import { getUserMemory, clearUserMemory } from '../talk/user-memory.js';

function renderNotes(panel) {
  const { insights, updatedAt } = getUserMemory();
  panel.textContent = '';

  if (!insights.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-info-text';
    empty.textContent = 'No inferred notes yet.';
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'settings-inferred-notes__list';
  for (const note of insights) {
    const li = document.createElement('li');
    li.textContent = note;
    list.appendChild(li);
  }
  panel.appendChild(list);

  if (updatedAt) {
    const meta = document.createElement('p');
    meta.className = 'settings-info-text';
    meta.textContent = `Last changed ${new Date(updatedAt).toLocaleString()}.`;
    panel.appendChild(meta);
  }

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn ghost settings-inferred-notes__clear';
  clear.textContent = 'Clear these notes';
  clear.addEventListener('click', () => {
    if (!confirm('Clear all notes Obrium has inferred about you? New notes may be added as you use the app.')) return;
    clearUserMemory();
    renderNotes(panel);
  });
  panel.appendChild(clear);
}

export function initInferredNotesView() {
  const row = document.getElementById('settingsInferredNotes');
  const panel = document.getElementById('settingsInferredNotesPanel');
  if (!row || !panel || row.dataset.bound === '1') return;
  row.dataset.bound = '1';
  row.addEventListener('click', () => {
    const open = panel.hidden;
    if (open) renderNotes(panel);
    panel.hidden = !open;
    row.setAttribute('aria-expanded', String(open));
  });
}
