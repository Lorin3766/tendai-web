// Quick Setup (30 sec) — single-device preferences
// @owner: settings
// @role: ui

const QS_STORAGE_KEY = 'tendai_quick_setup_v1';

const QS_DEFAULTS = {
  primaryFocus: 'energy',
  secondaryFocus: '',
  secondaryEnabled: false,
  priority: 'energy', // backward compatibility
  time: 10,
  intensity: 'normal',
  conversationLength: '10',
  remember: true,
  weather: false,
  completed: true,
};

function loadQuickSetup() {
  try {
    const raw = localStorage.getItem(QS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Backward compatibility: priority -> primaryFocus
    if (!parsed.primaryFocus && parsed.priority) {
      parsed.primaryFocus = parsed.priority;
    }
    if (!parsed.priority && parsed.primaryFocus) {
      parsed.priority = parsed.primaryFocus;
    }
    if (!parsed.secondaryFocus) {
      parsed.secondaryFocus = '';
      parsed.secondaryEnabled = false;
    }
    if (typeof parsed.secondaryEnabled === 'undefined') {
      parsed.secondaryEnabled = false;
    }
    // Enforce invariants for Balance
    if (parsed.primaryFocus === 'balance') {
      parsed.secondaryEnabled = false;
      parsed.secondaryFocus = '';
    }
    return parsed;
  } catch (_e) {
    return null;
  }
}

function saveQuickSetup(values) {
  try {
    const merged = { ...QS_DEFAULTS, ...values, completed: true };
    // keep priority in sync for backward compatibility
    merged.priority = merged.primaryFocus || merged.priority || QS_DEFAULTS.primaryFocus;
    if (merged.primaryFocus === 'balance') {
      merged.secondaryEnabled = false;
      merged.secondaryFocus = '';
    }
    localStorage.setItem(QS_STORAGE_KEY, JSON.stringify(merged));
    try {
      window.dispatchEvent(new CustomEvent('quick-setup-saved', { detail: merged }));
    } catch (_e) {
      // ignore dispatch errors
    }
    return merged;
  } catch (_e) {
    return null;
  }
}

function shouldShowInitial() {
  try {
    if (localStorage.getItem('tendai_system_onboarding_v1') !== '1') return false;
  } catch (_e) {
    return false;
  }
  const data = loadQuickSetup();
  return !data || !data.completed;
}

function getElements() {
  return {
    overlay: document.getElementById('quickSetupOverlay'),
    closeBtn: document.getElementById('quickSetupClose'),
    skipBtn: document.getElementById('quickSetupSkip'),
    startBtn: document.getElementById('quickSetupStart'),
    steps: [...document.querySelectorAll('.quick-setup-step')],
    priorityOptions: document.getElementById('qsPriorityOptions'),
    secondaryBlock: document.getElementById('qsSecondaryBlock'),
    secondaryOptions: document.getElementById('qsSecondaryOptions'),
    secondarySelected: document.getElementById('qsSecondarySelected'),
    secondarySelectedText: document.getElementById('qsSecondarySelectedText'),
    secondaryClear: document.getElementById('qsSecondaryClear'),
    addSecondaryBtn: document.getElementById('qsAddSecondary'),
    intensityOptions: document.getElementById('qsIntensityOptions'),
    lengthOptions: document.getElementById('qsLengthOptions'),
    timeSlider: document.getElementById('qsTimeSlider'),
    timeValue: document.getElementById('qsTimeValue'),
    rememberToggle: document.getElementById('qsRemember'),
    weatherToggle: document.getElementById('qsWeather'),
    back1: document.getElementById('qsBack1'),
    next1: document.getElementById('qsNext1'),
    back2: document.getElementById('qsBack2'),
    next2: document.getElementById('qsNext2'),
    back3: document.getElementById('qsBack3'),
    next3: document.getElementById('qsNext3'),
    back4: document.getElementById('qsBack4'),
    next4: document.getElementById('qsNext4'),
    back5: document.getElementById('qsBack5'),
    finish: document.getElementById('qsFinish'),
  };
}

function setActiveChip(container, value) {
  if (!container) return;
  const chips = container.querySelectorAll('.qs-chip');
  chips.forEach((chip) => {
    if (chip.dataset.value === value) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

function getActiveValue(container) {
  if (!container) return null;
  const active = container.querySelector('.qs-chip.active');
  return active ? active.dataset.value : null;
}

function showStep(steps, stepId) {
  steps.forEach((step) => {
    step.classList.toggle('hidden', step.dataset.step !== stepId);
  });
}

function applyStateToUI(el, state) {
  setActiveChip(el.priorityOptions, state.primaryFocus || state.priority);

  if (state.primaryFocus === 'balance') {
    state.secondaryEnabled = false;
    state.secondaryFocus = '';
  }

  const secondaryActive = !!(
    state.secondaryEnabled &&
    state.secondaryFocus &&
    state.primaryFocus !== 'balance'
  );

  setActiveChip(el.secondaryOptions, secondaryActive ? state.secondaryFocus : null);
  if (el.secondarySelected && el.secondarySelectedText) {
    if (secondaryActive) {
      el.secondarySelected.classList.remove('hidden');
      el.secondarySelectedText.textContent = `Second focus: ${state.secondaryFocus}`;
    } else {
      el.secondarySelected.classList.add('hidden');
      el.secondarySelectedText.textContent = '';
    }
  }
  setActiveChip(el.intensityOptions, state.intensity);
  setActiveChip(el.lengthOptions, state.conversationLength);
  if (el.timeSlider && el.timeValue) {
    el.timeSlider.value = state.time ?? QS_DEFAULTS.time;
    el.timeValue.textContent = `${state.time ?? QS_DEFAULTS.time} min`;
  }
  if (el.rememberToggle) el.rememberToggle.checked = !!state.remember;
  if (el.weatherToggle) el.weatherToggle.checked = !!state.weather;
}

function collectState(el, state) {
  return {
    ...state,
    primaryFocus: getActiveValue(el.priorityOptions) || state.primaryFocus || state.priority,
    secondaryFocus: getActiveValue(el.secondaryOptions) || state.secondaryFocus || '',
    secondaryEnabled: state.secondaryEnabled,
    priority: getActiveValue(el.priorityOptions) || state.primaryFocus || state.priority,
    time: parseInt(el.timeSlider?.value || state.time || QS_DEFAULTS.time, 10),
    intensity: getActiveValue(el.intensityOptions) || state.intensity,
    conversationLength: getActiveValue(el.lengthOptions) || state.conversationLength,
    remember: !!el.rememberToggle?.checked,
    weather: !!el.weatherToggle?.checked,
  };
}

function markCompletedWithDefaults() {
  saveQuickSetup(QS_DEFAULTS);
}

function initQuickSetup() {
  const el = getElements();
  if (!el.overlay) return;

  let step = 'intro';
  let state = loadQuickSetup() || { ...QS_DEFAULTS, completed: false };
  let secondaryEnabled =
    state.primaryFocus !== 'balance' && (state.secondaryEnabled || !!state.secondaryFocus);

  function refreshSecondaryOptions() {
    if (!el.secondaryOptions) return;
    const main = state.primaryFocus || state.priority;
    el.secondaryOptions.querySelectorAll('.qs-chip').forEach((chip) => {
      const val = chip.dataset.value;
      const shouldHide = val === main || val === 'balance';
      chip.classList.toggle('hidden', shouldHide);
      chip.classList.remove('disabled');
      chip.disabled = false;
      if (shouldHide && state.secondaryFocus === val) {
        state.secondaryFocus = '';
        if (el.secondarySelected && el.secondarySelectedText) {
          el.secondarySelected.classList.add('hidden');
          el.secondarySelectedText.textContent = '';
        }
      }
    });
  }

  function clearSecondarySelection() {
    state.secondaryFocus = '';
    setActiveChip(el.secondaryOptions, null);
    if (el.secondarySelected && el.secondarySelectedText) {
      el.secondarySelected.classList.add('hidden');
      el.secondarySelectedText.textContent = '';
    }
  }

  function syncSecondaryUI() {
    if (state.primaryFocus === 'balance') {
      secondaryEnabled = false;
      state.secondaryEnabled = false;
      clearSecondarySelection();
      el.secondaryBlock?.classList.add('hidden');
      el.addSecondaryBtn?.classList.add('hidden');
      return;
    }

    state.secondaryEnabled = secondaryEnabled;

    if (secondaryEnabled) {
      refreshSecondaryOptions();
      el.secondaryBlock?.classList.remove('hidden');
      if (el.addSecondaryBtn) {
        el.addSecondaryBtn.classList.remove('hidden');
        el.addSecondaryBtn.textContent = '– Remove second focus';
      }
      if (el.secondarySelected && el.secondarySelectedText) {
        if (state.secondaryFocus) {
          el.secondarySelected.classList.remove('hidden');
          el.secondarySelectedText.textContent = `Second focus: ${state.secondaryFocus}`;
        } else {
          el.secondarySelected.classList.add('hidden');
          el.secondarySelectedText.textContent = '';
        }
      }
    } else {
      clearSecondarySelection();
      el.secondaryBlock?.classList.add('hidden');
      if (el.addSecondaryBtn) {
        el.addSecondaryBtn.classList.remove('hidden');
        el.addSecondaryBtn.textContent = '+ Add a second focus (optional)';
      }
    }
  }

  function captureStateFromUI() {
    state.secondaryEnabled = secondaryEnabled;
    state = collectState(el, state);
    if (!secondaryEnabled || state.primaryFocus === 'balance') {
      state.secondaryEnabled = false;
      state.secondaryFocus = '';
    }
  }

  function updateNavState() {
    el.next1.disabled = !getActiveValue(el.priorityOptions);
    el.next3.disabled = !getActiveValue(el.intensityOptions);
    el.next4.disabled = !getActiveValue(el.lengthOptions);
  }

  function openOverlay() {
    state = loadQuickSetup() || { ...QS_DEFAULTS, completed: false };
    if (state.primaryFocus === 'balance') {
      state.secondaryFocus = '';
      state.secondaryEnabled = false;
    }
    if (!state.secondaryFocus) {
      state.secondaryEnabled = false;
    }
    secondaryEnabled =
      state.primaryFocus !== 'balance' &&
      (state.secondaryEnabled || !!state.secondaryFocus);
    applyStateToUI(el, state);
    refreshSecondaryOptions();
    syncSecondaryUI();
    showStep(el.steps, 'intro');
    step = 'intro';
    el.overlay.classList.remove('hidden');
    el.overlay.setAttribute('aria-hidden', 'false');
    updateNavState();
  }

  function closeOverlay() {
    el.overlay.classList.add('hidden');
    el.overlay.setAttribute('aria-hidden', 'true');
  }

  // Chip handlers
  [el.priorityOptions, el.intensityOptions, el.lengthOptions].forEach((container) => {
    if (!container) return;
    container.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.qs-chip');
      if (!chip) return;
      const value = chip.dataset.value;
      const focus = chip.dataset.focus || value;
      setActiveChip(container, value);
      if (container === el.priorityOptions) {
        state.primaryFocus = focus;
        state.priority = focus;
        if (focus === 'balance') {
          secondaryEnabled = false;
        }
        refreshSecondaryOptions();
        syncSecondaryUI();
      }
      if (container === el.intensityOptions) state.intensity = value;
      if (container === el.lengthOptions) state.conversationLength = value;
      updateNavState();
    });
  });

  // Secondary chip handler
  if (el.secondaryOptions) {
    el.secondaryOptions.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.qs-chip');
      if (!chip) return;
      const value = chip.dataset.value;
      // cannot pick same as main or balance
      if (value === (state.primaryFocus || state.priority) || value === 'balance') return;
      secondaryEnabled = true;
      state.secondaryEnabled = true;
      state.secondaryFocus = value;
      setActiveChip(el.secondaryOptions, value);
      syncSecondaryUI();
    });
  }

  // Slider
  if (el.timeSlider && el.timeValue) {
    el.timeSlider.addEventListener('input', () => {
      el.timeValue.textContent = `${el.timeSlider.value} min`;
      state.time = parseInt(el.timeSlider.value, 10);
    });
  }

  // Preset buttons for time
  const presetContainer = document.querySelector('.quick-setup-presets');
  if (presetContainer) {
    presetContainer.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-preset]');
      if (!btn || !el.timeSlider || !el.timeValue) return;
      const val = parseInt(btn.dataset.preset, 10);
      el.timeSlider.value = val;
      el.timeValue.textContent = `${val} min`;
      state.time = val;
    });
  }

  // Toggles
  if (el.rememberToggle) {
    el.rememberToggle.addEventListener('change', () => {
      state.remember = el.rememberToggle.checked;
    });
  }
  if (el.weatherToggle) {
    el.weatherToggle.addEventListener('change', () => {
      state.weather = el.weatherToggle.checked;
    });
  }

  // Navigation
  if (el.startBtn) {
    el.startBtn.addEventListener('click', () => {
      showStep(el.steps, '1');
      step = '1';
      refreshSecondaryOptions();
    });
  }
  if (el.skipBtn) {
    el.skipBtn.addEventListener('click', () => {
      markCompletedWithDefaults();
      closeOverlay();
    });
  }
  if (el.closeBtn) {
    el.closeBtn.addEventListener('click', () => {
      markCompletedWithDefaults();
      closeOverlay();
    });
  }

  // Step buttons
  el.next1?.addEventListener('click', () => {
    captureStateFromUI();
    refreshSecondaryOptions();
    showStep(el.steps, '2');
    step = '2';
  });
  el.back2?.addEventListener('click', () => {
    showStep(el.steps, '1');
    step = '1';
  });
  el.next2?.addEventListener('click', () => {
    captureStateFromUI();
    showStep(el.steps, '3');
    step = '3';
    updateNavState();
  });
  el.back3?.addEventListener('click', () => {
    showStep(el.steps, '2');
    step = '2';
  });
  el.next3?.addEventListener('click', () => {
    captureStateFromUI();
    showStep(el.steps, '4');
    step = '4';
    updateNavState();
  });
  el.back4?.addEventListener('click', () => {
    showStep(el.steps, '3');
    step = '3';
    updateNavState();
  });
  el.next4?.addEventListener('click', () => {
    captureStateFromUI();
    showStep(el.steps, '5');
    step = '5';
  });
  el.back5?.addEventListener('click', () => {
    showStep(el.steps, '4');
    step = '4';
    updateNavState();
  });
  el.finish?.addEventListener('click', () => {
    captureStateFromUI();
    saveQuickSetup(state);
    try {
      window.dispatchEvent(new CustomEvent('quick-setup-finished', { detail: state }));
    } catch (_e) {
      // ignore
    }
    closeOverlay();
  });

  // Add secondary toggle
  if (el.addSecondaryBtn) {
    el.addSecondaryBtn.addEventListener('click', () => {
      const main = getActiveValue(el.priorityOptions) || state.primaryFocus || state.priority;
      if (main) {
        state.primaryFocus = main;
        state.priority = main;
      }
      if (state.primaryFocus === 'balance') {
        secondaryEnabled = false;
        syncSecondaryUI();
        return;
      }
      secondaryEnabled = !secondaryEnabled;
      syncSecondaryUI();
    });
  }

  // Clear secondary
  if (el.secondaryClear) {
    el.secondaryClear.addEventListener('click', () => {
      secondaryEnabled = false;
      syncSecondaryUI();
    });
  }

  // Settings entry point
  const settingsQuickSetup = document.getElementById('settingsQuickSetup');
  if (settingsQuickSetup) {
    settingsQuickSetup.addEventListener('click', () => {
      openOverlay();
    });
  }

  // Auto show on first launch
  if (shouldShowInitial()) {
    openOverlay();
  }

  // Initial UI sync
  applyStateToUI(el, state);
  refreshSecondaryOptions();
  secondaryEnabled =
    state.primaryFocus !== 'balance' &&
    (state.secondaryEnabled || !!state.secondaryFocus);
  syncSecondaryUI();
  updateNavState();

  window.openQuickSetup = openOverlay;
  window.saveQuickSetup = saveQuickSetup;
}

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQuickSetup);
} else {
  initQuickSetup();
}

