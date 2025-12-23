// TendAI — Day Check-in Modal and Logic
// @owner: feed
// @role: ui
// Unified daily check-in for mobile and desktop

import { dayState } from '../../state.js';
import { getSliderConfig } from '../storage/slider-config.js';

(function () {
  'use strict';

  let checkinModalOverlay = null;
  let checkinModal = null;
  let checkinForm = null;

  // Initialize check-in modal elements
  function initCheckinModal() {
    checkinModalOverlay = document.getElementById('dayCheckinModalOverlay');
    checkinModal = document.getElementById('dayCheckinModal');
    checkinForm = document.getElementById('dayCheckinForm');
    
    if (!checkinModalOverlay || !checkinModal || !checkinForm) {
      return false;
    }
    return true;
  }

  // Open check-in modal
  function openCheckinModal() {
    if (!initCheckinModal()) {
      return;
    }

    // Load today's state
    const todayState = dayState.loadDayStateForToday();
    
    // Populate form with existing values
    const sleepInput = document.getElementById('checkinSleep');
    const waterInput = document.getElementById('checkinWater');
    const energySelect = document.getElementById('checkinEnergy');
    const stressSlider = document.getElementById('checkinStress');
    const stressDisplay = document.getElementById('checkinStressDisplay');

    if (sleepInput) {
      sleepInput.value = todayState.sleep?.hours || '';
    }
    if (waterInput) {
      waterInput.value = todayState.water?.current || 0;
    }
    if (energySelect) {
      energySelect.value = todayState.energy || '';
    }
    if (stressSlider) {
      const stressValue = todayState.stressLevel || 3;
      stressSlider.value = stressValue;
      const stressConfig = getSliderConfig('checkinStress');
      if (stressDisplay) {
        stressDisplay.textContent = stressConfig ? stressConfig.displayFormatter(stressValue) : stressValue.toString();
      }
    }

    // Show modal
    checkinModalOverlay.classList.add('is-active');
    document.body.style.overflow = 'hidden';
  }

  // Close check-in modal
  function closeCheckinModal() {
    if (checkinModalOverlay) {
      checkinModalOverlay.classList.remove('is-active');
      document.body.style.overflow = '';
    }
  }

  // Save check-in data
  function saveCheckinData() {
    if (!checkinForm) return;

    const sleepInput = document.getElementById('checkinSleep');
    const waterInput = document.getElementById('checkinWater');
    const energySelect = document.getElementById('checkinEnergy');
    const stressSlider = document.getElementById('checkinStress');

    const todayState = dayState.loadDayStateForToday();

    // Update state with form values
    if (sleepInput && sleepInput.value) {
      todayState.sleep.hours = parseFloat(sleepInput.value);
    }
    if (waterInput) {
      todayState.water.current = parseInt(waterInput.value) || 0;
    }
    if (energySelect && energySelect.value) {
      todayState.energy = energySelect.value;
    }
    if (stressSlider) {
      const stressConfig = getSliderConfig('checkinStress');
      todayState.stressLevel = stressConfig ? stressConfig.normalize(parseFloat(stressSlider.value)) : (parseInt(stressSlider.value) || 3);
    }

    // Save to localStorage
    dayState.saveDayStateForToday(todayState);

    // Close modal
    closeCheckinModal();

    // Update UI
    if (window.updateFeedUI) {
      window.updateFeedUI();
    }
    if (window.updateDailyFocus) {
      window.updateDailyFocus();
    }
    if (window.updateWellbeing) {
      window.updateWellbeing();
    }

    // Сбрасываем кэш AI-советов и обновляем после чек-ина
    if (window.resetAIAdviceCache) {
      window.resetAIAdviceCache();
    }
    if (window.updateFeedWithAIAdvice) {
      // Небольшая задержка, чтобы UI успел обновиться
      setTimeout(() => {
        window.updateFeedWithAIAdvice();
      }, 300);
    }
  }

  // Setup event handlers
  function setupCheckinHandlers() {
    // Open buttons
    const openButtons = document.querySelectorAll('[data-open-checkin]');
    openButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        openCheckinModal();
      });
    });

    // Close button
    const closeButton = document.getElementById('dayCheckinClose');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCheckinModal();
      });
    }

    // Overlay click
    if (checkinModalOverlay) {
      checkinModalOverlay.addEventListener('click', (e) => {
        if (e.target === checkinModalOverlay) {
          closeCheckinModal();
        }
      });
    }

    // Prevent modal content clicks from closing
    if (checkinModal) {
      checkinModal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Form submit
    if (checkinForm) {
      checkinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCheckinData();
      });
    }

    // Save button
    const saveButton = document.getElementById('dayCheckinSave');
    if (saveButton) {
      saveButton.addEventListener('click', (e) => {
        e.preventDefault();
        saveCheckinData();
      });
    }

    // Cancel button
    const cancelButton = document.getElementById('dayCheckinCancel');
    if (cancelButton) {
      cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        closeCheckinModal();
      });
    }

    // Stress slider with new system
    const stressSlider = document.getElementById('checkinStress');
    const stressDisplay = document.getElementById('checkinStressDisplay');
    if (stressSlider && stressDisplay) {
      const stressConfig = getSliderConfig('checkinStress');
      
      // Update display on input
      stressSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const normalized = stressConfig ? stressConfig.normalize(value) : Math.round(value);
        e.target.value = normalized;
        stressDisplay.textContent = stressConfig ? stressConfig.displayFormatter(normalized) : normalized.toString();
      });
      
      // Setup +/- buttons if they exist
      const minusBtn = document.querySelector('.slider-btn-minus[data-slider-id="checkinStress"]');
      const plusBtn = document.querySelector('.slider-btn-plus[data-slider-id="checkinStress"]');
      
      if (minusBtn && stressConfig) {
        minusBtn.addEventListener('click', () => {
          const currentValue = parseFloat(stressSlider.value);
          const newValue = Math.max(stressConfig.min, currentValue - stressConfig.step);
          const normalized = stressConfig.normalize(newValue);
          stressSlider.value = normalized;
          stressDisplay.textContent = stressConfig.displayFormatter(normalized);
          stressSlider.dispatchEvent(new Event('input'));
        });
      }
      
      if (plusBtn && stressConfig) {
        plusBtn.addEventListener('click', () => {
          const currentValue = parseFloat(stressSlider.value);
          const newValue = Math.min(stressConfig.max, currentValue + stressConfig.step);
          const normalized = stressConfig.normalize(newValue);
          stressSlider.value = normalized;
          stressDisplay.textContent = stressConfig.displayFormatter(normalized);
          stressSlider.dispatchEvent(new Event('input'));
        });
      }
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCheckinModal();
      setupCheckinHandlers();
    });
  } else {
    initCheckinModal();
    setupCheckinHandlers();
  }

  // Export functions globally
  window.openDayCheckin = openCheckinModal;
  window.closeDayCheckin = closeCheckinModal;
})();

