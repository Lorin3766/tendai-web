// Serron — Blueprint store + 4-step agent activation (modular agents)
// @owner: human-os
// @role: ui

import { loadBlueprints } from './blueprints-loader.js';
import {
  addBlueprintUserAgent,
  allocateUniqueAgentDisplayName,
} from './user-agents.js';
import { requestHealthPermissions } from '../storage/health-sync.js';
import { tickModularAgents } from './modular-agents-runtime.js';

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {() => void|Promise<void>} [onSaved]
 */
export function openBlueprintStoreModal(onSaved) {
  document.getElementById('tendai-ultimate-agent-creator-overlay')?.remove();
  const prev = document.getElementById('tendai-blueprint-store-overlay');
  if (prev) prev.remove();

  const state = {
    step: 1,
    /** @type {object|null} */
    blueprint: null,
    sensor_data: {},
    custom_triggers: {},
  };

  const overlay = document.createElement('div');
  overlay.id = 'tendai-blueprint-store-overlay';
  overlay.className = 'blueprint-store-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'blueprint-store-title');

  const modal = document.createElement('div');
  modal.className = 'blueprint-store-modal';

  const shell = document.createElement('div');
  shell.className = 'blueprint-store-shell';

  const stepper = document.createElement('div');
  stepper.className = 'blueprint-store-stepper';
  stepper.innerHTML = `
    <span class="blueprint-store-stepper__i is-active" data-step-hint="1">Store</span>
    <span class="blueprint-store-stepper__dot" aria-hidden="true"></span>
    <span class="blueprint-store-stepper__i" data-step-hint="2">Sensors</span>
    <span class="blueprint-store-stepper__dot" aria-hidden="true"></span>
    <span class="blueprint-store-stepper__i" data-step-hint="3">Triggers</span>
    <span class="blueprint-store-stepper__dot" aria-hidden="true"></span>
    <span class="blueprint-store-stepper__i" data-step-hint="4">Background</span>
  `;

  const title = document.createElement('h2');
  title.id = 'blueprint-store-title';
  title.className = 'blueprint-store-title';
  title.textContent = 'ADD FOCUS';

  const body = document.createElement('div');
  body.className = 'blueprint-store-body';

  const nav = document.createElement('div');
  nav.className = 'blueprint-store-nav';

  const close = () => overlay.remove();

  function syncStepper() {
    stepper.querySelectorAll('.blueprint-store-stepper__i').forEach((el) => {
      const n = Number(el.getAttribute('data-step-hint'));
      el.classList.toggle('is-active', n === state.step);
      el.classList.toggle('is-done', n < state.step);
    });
  }

  function sensorsReadyFor(bp) {
    if (!bp) return false;
    const id = bp.id;
    const sd = state.sensor_data;
    if (id === 'weather_scout') {
      return Boolean(String(sd.openweather_api_key || '').trim() && sd.location_granted === true);
    }
    if (id === 'cardio_monitor') {
      return sd.health_connected === true;
    }
    if (id === 'github_scout') {
      return Boolean(String(sd.github_token || '').trim());
    }
    return false;
  }

  async function render() {
    body.innerHTML = '';
    nav.innerHTML = '';
    title.textContent =
      state.step === 1 ? 'BLUEPRINT STORE' : state.step === 2 ? 'SENSOR LINK' : state.step === 3 ? 'TRIGGER TUNING' : 'BACKGROUND PROCESS';
    syncStepper();

    if (state.step === 1) {
      const grid = document.createElement('div');
      grid.className = 'blueprint-store-grid';
      let list = [];
      try {
        list = await loadBlueprints();
      } catch (_) {
        const err = document.createElement('p');
        err.className = 'blueprint-store-error';
        err.textContent = 'Could not load blueprints. Check that data/blueprints.json is available.';
        body.appendChild(err);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'blueprint-store-btn blueprint-store-btn--ghost';
        b.textContent = 'Close';
        b.addEventListener('click', close);
        nav.appendChild(b);
        return;
      }

      list.forEach((bp, idx) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'blueprint-store-card';
        card.style.animationDelay = `${idx * 45}ms`;
        card.innerHTML = `
          <span class="blueprint-store-card__cat">${esc(bp.category)}</span>
          <span class="blueprint-store-card__name">${esc(bp.title)}</span>
          <span class="blueprint-store-card__desc">${esc(bp.description)}</span>
        `;
        card.addEventListener('click', () => {
          state.blueprint = bp;
          state.sensor_data = {};
          state.custom_triggers = {};
          const nums = bp.trigger_logic_schema?.numeric || [];
          nums.forEach((r) => {
            state.custom_triggers[r.id] = Number(r.default);
          });
          state.step = 2;
          void render();
        });
        grid.appendChild(card);
      });
      body.appendChild(grid);

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'blueprint-store-btn blueprint-store-btn--ghost';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);
      nav.appendChild(cancel);
    }

    if (state.step === 2 && state.blueprint) {
      const bp = state.blueprint;
      const form = document.createElement('div');
      form.className = 'blueprint-store-form';

      if (bp.id === 'weather_scout') {
        form.innerHTML = `
          <p class="blueprint-store-copy">OpenWeather is used only when your API key is saved (Step 2 data integrity).</p>
          <label class="blueprint-store-label" for="bp-ow-key">OpenWeather API key</label>
          <input type="password" id="bp-ow-key" class="blueprint-store-input" autocomplete="off" placeholder="Paste key" />
          <label class="blueprint-store-check">
            <input type="checkbox" id="bp-loc-ok" />
            <span>Location is available for this app (Glance / device location)</span>
          </label>
        `;
        body.appendChild(form);
        const k = form.querySelector('#bp-ow-key');
        const c = form.querySelector('#bp-loc-ok');
        k.value = String(state.sensor_data.openweather_api_key || '');
        c.checked = state.sensor_data.location_granted === true;
        k.addEventListener('input', () => {
          state.sensor_data.openweather_api_key = k.value;
        });
        c.addEventListener('change', () => {
          state.sensor_data.location_granted = c.checked;
        });
      } else if (bp.id === 'cardio_monitor') {
        form.innerHTML = `
          <p class="blueprint-store-copy">Heart rate is read from Health / device after you connect.</p>
          <label class="blueprint-store-check">
            <input type="checkbox" id="bp-hr-ok" />
            <span>Connect heart rate source</span>
          </label>
          <button type="button" class="blueprint-store-btn blueprint-store-btn--secondary" id="bp-hr-perm">Request health permissions (native)</button>
        `;
        body.appendChild(form);
        const c = form.querySelector('#bp-hr-ok');
        c.checked = state.sensor_data.health_connected === true;
        c.addEventListener('change', () => {
          state.sensor_data.health_connected = c.checked;
        });
        form.querySelector('#bp-hr-perm')?.addEventListener('click', async () => {
          try {
            await requestHealthPermissions();
            if (window.HealthSync?.refresh) await window.HealthSync.refresh();
          } catch (_) {}
        });
      } else if (bp.id === 'github_scout') {
        form.innerHTML = `
          <p class="blueprint-store-copy">Token stays on this device (localStorage). Used only for GitHub API calls.</p>
          <label class="blueprint-store-label" for="bp-gh">GitHub personal access token</label>
          <input type="password" id="bp-gh" class="blueprint-store-input" autocomplete="off" placeholder="ghp_…" />
        `;
        body.appendChild(form);
        const k = form.querySelector('#bp-gh');
        k.value = String(state.sensor_data.github_token || '');
        k.addEventListener('input', () => {
          state.sensor_data.github_token = k.value;
        });
      }

      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'blueprint-store-btn blueprint-store-btn--ghost';
      back.textContent = 'Back';
      back.addEventListener('click', () => {
        state.step = 1;
        void render();
      });
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'blueprint-store-btn blueprint-store-btn--primary';
      next.textContent = 'Continue';
      next.addEventListener('click', () => {
        state.step = 3;
        void render();
      });
      nav.appendChild(back);
      nav.appendChild(next);
    }

    if (state.step === 3 && state.blueprint) {
      const bp = state.blueprint;
      const wrap = document.createElement('div');
      wrap.className = 'blueprint-store-triggers';
      const nums = bp.trigger_logic_schema?.numeric || [];
      nums.forEach((r) => {
        const row = document.createElement('div');
        row.className = 'blueprint-store-slider-row';
        const lab = document.createElement('label');
        lab.className = 'blueprint-store-label';
        lab.htmlFor = `bp-sl-${r.id}`;
        lab.textContent = r.label;
        const input = document.createElement('input');
        input.type = 'range';
        input.id = `bp-sl-${r.id}`;
        input.min = String(r.min ?? 0);
        input.max = String(r.max ?? 100);
        input.value = String(state.custom_triggers[r.id] ?? r.default ?? 0);
        const val = document.createElement('span');
        val.className = 'blueprint-store-slider-val';
        val.textContent = input.value + (r.unit ? ` ${r.unit}` : '');
        input.addEventListener('input', () => {
          state.custom_triggers[r.id] = Number(input.value);
          val.textContent = input.value + (r.unit ? ` ${r.unit}` : '');
        });
        row.appendChild(lab);
        row.appendChild(input);
        row.appendChild(val);
        wrap.appendChild(row);
      });
      const nlLab = document.createElement('label');
      nlLab.className = 'blueprint-store-label';
      nlLab.htmlFor = 'bp-nl';
      nlLab.textContent = 'Natural language instructions (optional)';
      const nl = document.createElement('textarea');
      nl.id = 'bp-nl';
      nl.className = 'blueprint-store-textarea';
      nl.rows = 3;
      nl.placeholder = 'e.g. Only warn me before outdoor workouts…';
      nl.value = String(state.custom_triggers.naturalLanguage || '');
      nl.addEventListener('input', () => {
        state.custom_triggers.naturalLanguage = nl.value;
      });
      wrap.appendChild(nlLab);
      wrap.appendChild(nl);
      body.appendChild(wrap);

      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'blueprint-store-btn blueprint-store-btn--ghost';
      back.textContent = 'Back';
      back.addEventListener('click', () => {
        state.step = 2;
        void render();
      });
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'blueprint-store-btn blueprint-store-btn--primary';
      next.textContent = 'Continue';
      next.addEventListener('click', () => {
        state.step = 4;
        void render();
      });
      nav.appendChild(back);
      nav.appendChild(next);
    }

    if (state.step === 4 && state.blueprint) {
      const bp = state.blueprint;
      const ready = sensorsReadyFor(bp);
      const p = document.createElement('div');
      p.className = 'blueprint-store-summary';
      p.innerHTML = `
        <p class="blueprint-store-copy"><strong>${esc(bp.title)}</strong> runs silently in the background.</p>
        <p class="blueprint-store-copy">A feed card is created <strong>only</strong> when your trigger logic fires — not for routine “all clear” states.</p>
        <p class="blueprint-store-status ${ready ? 'is-ready' : 'is-incomplete'}">
          ${ready ? 'Sensors linked — status: Active' : 'Sensors incomplete — agent stays Incomplete until keys/permissions are satisfied.'}
        </p>
      `;
      body.appendChild(p);

      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'blueprint-store-btn blueprint-store-btn--ghost';
      back.textContent = 'Back';
      back.addEventListener('click', () => {
        state.step = 3;
        void render();
      });
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'blueprint-store-btn blueprint-store-btn--primary';
      act.textContent = 'Activate agent';
      act.addEventListener('click', async () => {
        const displayName = allocateUniqueAgentDisplayName(bp.title);
        const instruction = String(state.custom_triggers.naturalLanguage || '').trim();
        const status = sensorsReadyFor(bp) ? 'Active' : 'Incomplete';
        addBlueprintUserAgent({
          blueprintId: bp.id,
          name: displayName,
          instruction,
          sensor_data: { ...state.sensor_data },
          custom_triggers: { ...state.custom_triggers },
          agentStatus: status,
        });
        close();
        try {
          await tickModularAgents();
        } catch (_) {}
        if (typeof onSaved === 'function') await onSaved();
      });
      nav.appendChild(back);
      nav.appendChild(act);
    }

    modal.style.setProperty('--bp-ease', EASE);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  modal.appendChild(shell);
  shell.appendChild(stepper);
  shell.appendChild(title);
  shell.appendChild(body);
  shell.appendChild(nav);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  void render();
}
