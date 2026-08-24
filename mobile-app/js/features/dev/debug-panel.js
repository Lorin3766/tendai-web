// Serron — Hidden debug panel for biometric payload injection
// Shortcut: Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)

import { saveMetrics } from '../../core/biometrics-db.js';

const PANEL_ID = 'debugBiometricsPanel';
const STEPS_INPUT_ID = 'debug-steps';
const SLEEP_INPUT_ID = 'debug-sleep';
const INJECT_BUTTON_ID = 'debug-inject-btn';

function getTodayLocalIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseNumberInput(inputEl) {
  const rawValue = (inputEl && inputEl.value ? String(inputEl.value) : '').trim();
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

function togglePanelVisibility(panel) {
  if (!panel) return;

  const nextHidden = !panel.hidden;
  panel.hidden = nextHidden;
  panel.setAttribute('aria-hidden', nextHidden ? 'true' : 'false');
}

async function handleInjectClick(stepsInput, sleepInput) {
  const steps = parseNumberInput(stepsInput);
  const sleep = parseNumberInput(sleepInput);

  if (steps == null || sleep == null) {
    console.error('[DEBUG_PANEL] Injection aborted: invalid numeric inputs.', {
      steps: stepsInput ? stepsInput.value : null,
      sleep: sleepInput ? sleepInput.value : null
    });
    return;
  }

  const payload = {
    date: getTodayLocalIsoDate(),
    metrics: {
      steps,
      sleep
    }
  };

  try {
    await saveMetrics(payload);
    console.log('[DEBUG_PANEL] Payload injected successfully:', payload);
    window.dispatchEvent(new CustomEvent('biometricsUpdated', { detail: payload }));
    stepsInput.value = '';
    sleepInput.value = '';
  } catch (error) {
    console.error('[DEBUG_PANEL] Failed to inject payload:', error, payload);
  }
}

export function initDebugPanel() {
  const panel = document.getElementById(PANEL_ID);
  const stepsInput = document.getElementById(STEPS_INPUT_ID);
  const sleepInput = document.getElementById(SLEEP_INPUT_ID);
  const injectButton = document.getElementById(INJECT_BUTTON_ID);

  if (!panel || !stepsInput || !sleepInput || !injectButton) {
    return;
  }

  if (injectButton.dataset.debugInjectorBound === '1') {
    return;
  }
  injectButton.dataset.debugInjectorBound = '1';

  injectButton.addEventListener('click', () => {
    void handleInjectClick(stepsInput, sleepInput);
  });

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const isMacLike = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
    const hasModifier = isMacLike ? event.metaKey : event.ctrlKey;
    if (!hasModifier || !event.shiftKey || key !== 'd') return;

    event.preventDefault();
    togglePanelVisibility(panel);
  });
}
