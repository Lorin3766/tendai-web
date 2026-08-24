// LEGACY BLOCKED IN UNIFIED — do not edit logic here.
// See: mobile-app/_audit/ARCHITECTURE_RUNTIME.md
//
// Serron — Feed UI Updater
// @owner: feed
// @role: init
// Updates Feed UI elements based on dayState

// DEPRECATED in unified-mode: Block legacy duplicate
import { shouldBlockLegacy } from './_legacy_blocklist.js';
import { dayState } from './state.js';
import { addMessage } from './message-queue.js';
import { getCurrentDailyAction, markActionAsDone, markActionAsSkipped } from './daily-action.js';

// Block execution if legacy
if (shouldBlockLegacy()) {
  console.warn('[LEGACY][BLOCK]', 'feed-updater.js');
  // Export empty stubs to prevent errors
  export function updateFeedUI() {}
  export function updateDailyFocus() {}
  export function updateWellbeing() {}
  export function updateDailyActionUI() {}
  // Set window stubs
  if (typeof window !== 'undefined') {
    window.updateFeedUI = function() {};
    window.updateDailyFocus = function() {};
    window.updateWellbeing = function() {};
    window.updateDailyActionUI = function() {};
  }
  // Block all execution - wrap rest of file in condition
} else {
  // Original code continues below (all code after this point)

  /**
   * Update Feed header stats (Sleep, Water, Energy)
   */
  export function updateFeedHeaderStats() {
  const todayState = dayState.loadDayStateForToday();

  // Update Sleep
  const sleepElement = document.getElementById('dayStatSleep');
  if (sleepElement) {
    const sleepHours = todayState.sleep?.hours;
    const sleepTarget = todayState.sleep?.target || 7.5;
    if (sleepHours !== null && sleepHours !== undefined) {
      sleepElement.textContent = `${sleepHours} / ${sleepTarget} h`;
    } else {
      sleepElement.textContent = '— / 7.5 h';
    }
  }

  // Also update mobile version
  const mobileSleepElements = document.querySelectorAll('#screen-feed .day-stat-value');
  mobileSleepElements.forEach(el => {
    const label = el.previousElementSibling;
    if (label && label.textContent.includes('Sleep:')) {
      const sleepHours = todayState.sleep?.hours;
      const sleepTarget = todayState.sleep?.target || 7.5;
      if (sleepHours !== null && sleepHours !== undefined) {
        el.textContent = `${sleepHours} / ${sleepTarget} h`;
      } else {
        el.textContent = '— / 7.5 h';
      }
    }
  });

  // Update Water
  const waterElement = document.getElementById('dayStatWater');
  if (waterElement) {
    const waterCurrent = todayState.water?.current || 0;
    const waterTarget = todayState.water?.target || 8;
    waterElement.textContent = `${waterCurrent} / ${waterTarget}`;
  }

  // Also update mobile version
  mobileSleepElements.forEach(el => {
    const label = el.previousElementSibling;
    if (label && label.textContent.includes('Water:')) {
      const waterCurrent = todayState.water?.current || 0;
      const waterTarget = todayState.water?.target || 8;
      el.textContent = `${waterCurrent} / ${waterTarget}`;
    }
  });

  // Update Energy
  const energyElement = document.getElementById('dayStatEnergy');
  if (energyElement) {
    const energy = todayState.energy;
    if (energy) {
      energyElement.textContent = energy;
    } else {
      energyElement.textContent = 'Not set';
    }
  }

  // Also update mobile version
  mobileSleepElements.forEach(el => {
    const label = el.previousElementSibling;
    if (label && label.textContent.includes('Energy:')) {
      const energy = todayState.energy;
      if (energy) {
        el.textContent = energy;
      } else {
        el.textContent = 'Not set';
      }
    }
  });

  // Update advice text
  updateDayAdvice();
}

  /**
   * Update day date display
   */
  function updateDayDate() {
  const dateElement = document.getElementById('dayHeaderDate');
  if (!dateElement) return;

  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const dayName = days[now.getDay()];
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();

  dateElement.textContent = `${dayName} · ${month} ${day} · ${year}`;
}

  /**
   * Update weather display (real data from API with caching)
   */
  async function updateWeather() {
  const weatherMainElement = document.getElementById('dayHeaderWeather');
  const weatherDetailsElement = document.getElementById('dayHeaderWeatherDetails');
  const weatherMobileElement = document.querySelector('#screen-feed .day-header-weather');
  const pressureMobileElement = document.querySelector('#screen-feed .day-header-pressure');
  
  if (!weatherMainElement) return;

  // Import weather service dynamically
  const { getWeather, formatWeatherDisplay, formatWeatherDetails } = await import('./weather-service.js');
  
  // Get real weather data
  const weather = await getWeather();
  
  if (weather) {
    // Format and display
    const mainText = formatWeatherDisplay(weather);
    const detailsText = formatWeatherDetails(weather);
    
    weatherMainElement.textContent = mainText;
    
    if (weatherDetailsElement) {
      weatherDetailsElement.textContent = detailsText;
    }
    
    // Update mobile version
    if (weatherMobileElement) {
      const mobileText = `${weather.temperature}°F · ${weather.condition}${weather.feelsLike ? ` · Feels like ${weather.feelsLike}°` : ''}`;
      weatherMobileElement.textContent = mobileText;
    }
    
    if (pressureMobileElement && weather.pressure) {
      pressureMobileElement.textContent = `Pressure: ${weather.pressure} hPa`;
    }
    
    // Update dayState for advice generation
    const dayState = (await import('./state.js')).dayState;
    const todayState = dayState.loadDayStateForToday();
    todayState.weather = {
      temperature: weather.temperature,
      condition: weather.condition,
      feelsLike: weather.feelsLike
    };
    todayState.pressure = weather.pressure;
    dayState.saveDayStateForToday(todayState);
    
    // Add to message queue (weather update)
    addMessage({
      type: 'feed',
      subtype: 'weather',
      text: `Weather: ${mainText}`
    });
  } else {
    // No weather available - show friendly message with link to settings
    const clickableText = 'Set your location to see local weather';
    weatherMainElement.innerHTML = `<span style="cursor: pointer; text-decoration: underline;" onclick="if(window.openSettingsModal){window.openSettingsModal();}">${clickableText}</span>`;
    weatherMainElement.style.color = 'var(--fg-soft)';
    
    if (weatherDetailsElement) {
      weatherDetailsElement.textContent = '';
    }
    
    if (weatherMobileElement) {
      weatherMobileElement.innerHTML = `<span style="cursor: pointer; text-decoration: underline;" onclick="if(window.openSettingsModal){window.openSettingsModal();}">${clickableText}</span>`;
    }
  }
}

/** FEED weather-card: no tip/advice (summary + details only). No "take/try/should". */
function updateDayAdvice() {
  const adviceElement = document.getElementById('dayHeaderAdvice');
  if (!adviceElement) return;
  adviceElement.textContent = '';
  adviceElement.style.display = 'none';
  const mobileAdvice = document.querySelector('#screen-feed .day-header-advice');
  if (mobileAdvice) {
    mobileAdvice.textContent = '';
    mobileAdvice.style.display = 'none';
  }
}

  /**
   * Update Daily Focus text based on dayState
   */
  export function updateDailyFocus() {
  const todayState = dayState.loadDayStateForToday();
  const focusElement = document.getElementById('dailyFocusText');
  
  if (!focusElement) return;

  const sleepHours = todayState.sleep?.hours;
  const waterCurrent = todayState.water?.current || 0;
  const waterTarget = todayState.water?.target || 8;
  const stressLevel = todayState.stressLevel || 3;
  const energy = todayState.energy;
  
  // Check morning check-in first (highest priority)
  const morningCheckin = todayState.morningCheckin;
  if (morningCheckin && morningCheckin.answered) {
    // Import dynamically to avoid circular dependency
    import('./morning-checkin.js').then((module) => {
      const reaction = module.getCheckInReaction(morningCheckin.value);
      focusElement.textContent = reaction;
      
      // Also update mobile version
      const mobileFocus = document.querySelector('#screen-feed .card-subtitle');
      if (mobileFocus && mobileFocus.textContent === 'Daily Focus') {
        const mobileFocusText = mobileFocus.nextElementSibling;
        if (mobileFocusText && mobileFocusText.classList.contains('card-text')) {
          mobileFocusText.textContent = reaction;
        }
      }
    }).catch(() => {
      // If import fails, continue with normal logic
    });
    return;
  }

  const focusItems = [];

  // Generate focus based on state
  if (sleepHours !== null && sleepHours < 6) {
    focusItems.push('rest & recovery');
  }
  if (waterCurrent < waterTarget * 0.6) {
    focusItems.push('hydration');
  }
  if (stressLevel >= 4) {
    focusItems.push('reduce stress');
  }
  if (energy === 'Low') {
    focusItems.push('gentle activities');
  }
  if (sleepHours !== null && sleepHours >= 7 && energy === 'Good') {
    focusItems.push('focused work');
  }

  let focusText = '';
  if (focusItems.length > 0) {
    if (focusItems.length === 1) {
      focusText = focusItems[0] + '.';
    } else if (focusItems.length === 2) {
      focusText = focusItems.join(' and ') + '.';
    } else {
      focusText = focusItems.slice(0, -1).join(', ') + ' and ' + focusItems[focusItems.length - 1] + '.';
    }
    focusText = focusText.charAt(0).toUpperCase() + focusText.slice(1);
  } else {
    focusText = 'Maintain your wellbeing routine.';
  }

  focusElement.textContent = focusText;

  // Add to message queue (daily focus update)
  addMessage({
    type: 'feed',
    subtype: 'daily_focus',
    text: focusText
  });

  // Also update mobile version if exists
  const mobileFocus = document.querySelector('#screen-feed .card-subtitle');
  if (mobileFocus && mobileFocus.textContent === 'Daily Focus') {
    const mobileFocusText = mobileFocus.nextElementSibling;
    if (mobileFocusText && mobileFocusText.classList.contains('card-text')) {
      mobileFocusText.textContent = focusText;
    }
  }
}

  /**
   * Render daily action card HTML
   * @param {Object} action - Action object
   * @returns {string} HTML string
   */
  function renderDailyActionCard(action) {
  if (!action) return '';
  
  if (action.status === 'done') {
    return `
      <article class="card-soft" id="dailyActionCard" style="margin-bottom: 16px; border-left: 3px solid rgba(76, 175, 80, 0.5);">
        <div class="card-body" style="padding: 16px 20px;">
          <p style="margin: 0; color: var(--fg); font-size: 14px;">✅ Nice. Action completed for today.</p>
        </div>
      </article>
    `;
  }
  
  if (action.status === 'skipped') {
    return ''; // Hide skipped actions
  }
  
  // Pending action
  return `
    <article class="card-soft" id="dailyActionCard" style="margin-bottom: 16px; border-left: 3px solid rgba(246, 195, 106, 0.5);">
      <div class="card-header" style="padding: 16px 20px 8px 20px;">
        <h3 class="card-title" style="margin: 0; font-size: 16px;">Today's 1 Action</h3>
      </div>
      <div class="card-body" style="padding: 8px 20px 16px 20px;">
        <p style="margin: 0 0 16px 0; color: var(--fg); font-size: 14px; line-height: 1.5;">${action.text}</p>
        <div style="display: flex; gap: 8px;">
          <button id="dailyActionDone" class="btn" style="flex: 1; padding: 10px 16px; background: rgba(246, 195, 106, 0.2); border: 1px solid rgba(246, 195, 106, 0.4); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            Done
          </button>
          <button id="dailyActionNotNow" class="btn" style="flex: 1; padding: 10px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--fg); cursor: pointer; font-size: 14px; transition: all 180ms ease-out;">
            Not now
          </button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Update daily action UI in Feed
 */
export function updateDailyActionUI() {
  const feedView = document.getElementById('feed-view');
  const screenFeed = document.getElementById('screen-feed');
  
  if (!feedView && !screenFeed) return;
  
  const action = getCurrentDailyAction();
  const actionCard = renderDailyActionCard(action);
  
  // Insert in Feed (after My Day card or after Daily Focus section)
  if (feedView) {
    const existingCard = feedView.querySelector('#dailyActionCard');
    const myDayCard = feedView.querySelector('#myDayCard');
    
    if (actionCard) {
      if (existingCard) {
        existingCard.outerHTML = actionCard;
      } else if (myDayCard) {
        // Insert after My Day card
        myDayCard.insertAdjacentHTML('afterend', actionCard);
      } else {
        // Fallback: insert at the beginning
        feedView.insertAdjacentHTML('afterbegin', actionCard);
      }
    } else {
      // Remove if no action or skipped
      if (existingCard) {
        existingCard.remove();
      }
    }
  }
  
  if (screenFeed) {
    const existingCard = screenFeed.querySelector('#dailyActionCard');
    const dayHeaderCard = screenFeed.querySelector('#dayHeaderCard');
    
    if (actionCard) {
      if (existingCard) {
        existingCard.outerHTML = actionCard;
      } else if (dayHeaderCard) {
        // Insert after day header card
        dayHeaderCard.insertAdjacentHTML('afterend', actionCard);
      } else {
        // Fallback: insert at the beginning
        screenFeed.insertAdjacentHTML('afterbegin', actionCard);
      }
    } else {
      // Remove if no action or skipped
      if (existingCard) {
        existingCard.remove();
      }
    }
  }
  
  // Setup button handlers
  setTimeout(() => {
    const doneBtn = document.getElementById('dailyActionDone');
    const notNowBtn = document.getElementById('dailyActionNotNow');
    
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        markActionAsDone();
        updateDailyActionUI();
      });
      
      // Hover effect
      doneBtn.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(246, 195, 106, 0.3)';
        this.style.borderColor = 'rgba(246, 195, 106, 0.6)';
      });
      doneBtn.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(246, 195, 106, 0.2)';
        this.style.borderColor = 'rgba(246, 195, 106, 0.4)';
      });
    }
    
    if (notNowBtn) {
      notNowBtn.addEventListener('click', () => {
        markActionAsSkipped();
        updateDailyActionUI();
      });
      
      // Hover effect
      notNowBtn.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(255,255,255,0.15)';
        this.style.borderColor = 'rgba(246, 195, 106, 0.4)';
      });
      notNowBtn.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(255,255,255,0.1)';
        this.style.borderColor = 'rgba(255,255,255,0.2)';
      });
    }
  }, 100);
}

  /**
   * Update Wellbeing summary text based on dayState
   */
  export function updateWellbeing() {
  const todayState = dayState.loadDayStateForToday();
  const wellbeingElement = document.getElementById('wellbeingSummaryText');
  
  if (!wellbeingElement) return;

  const energy = todayState.energy;
  const stressLevel = todayState.stressLevel || 3;
  const sleepHours = todayState.sleep?.hours;

  const parts = [];

  // Energy status
  if (energy === 'Low') {
    parts.push('Energy low');
  } else if (energy === 'Normal' || energy === 'Good') {
    parts.push('Energy steady');
  } else if (energy === 'High') {
    parts.push('Energy high');
  } else {
    parts.push('Energy not set');
  }

  // Stress status
  if (stressLevel <= 2) {
    parts.push('Stress low');
  } else if (stressLevel === 3) {
    parts.push('Stress moderate');
  } else if (stressLevel >= 4) {
    parts.push('Stress high');
  }

  // Sleep status (if available)
  if (sleepHours !== null && sleepHours < 6) {
    parts.push('Sleep insufficient');
  } else if (sleepHours !== null && sleepHours >= 7) {
    parts.push('Sleep good');
  }

  const summaryText = parts.length > 0 ? parts.join(' • ') : 'Wellbeing data not set.';
  wellbeingElement.textContent = summaryText;
}

  /**
   * Update all Feed UI elements
   */
  export function updateFeedUI() {
  updateDayDate();
  updateWeather();
  updateDayAdvice();
  updateFeedHeaderStats();
  updateDailyFocus();
  updateWellbeing();
}

  // Initialize Feed UI on load
  function initFeedUI() {
  updateFeedUI();
  updateDailyActionUI();
  // Запрашиваем AI-советы при инициализации Feed
  if (window.updateFeedWithAIAdvice) {
    setTimeout(() => {
      window.updateFeedWithAIAdvice();
    }, 500);
  }
}

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeedUI);
  } else {
    initFeedUI();
  }

  // Re-update when switching to Feed screen (mobile)
  const feedScreen = document.getElementById('screen-feed');
  if (feedScreen) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.id === 'screen-feed' && target.classList.contains('active')) {
            setTimeout(() => {
              updateFeedUI();
              updateDailyActionUI();
            }, 50);
          }
        }
      });
    });
    
    observer.observe(feedScreen, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Export for global use
  window.updateFeedUI = updateFeedUI;
  window.updateDailyFocus = updateDailyFocus;
  window.updateWellbeing = updateWellbeing;
  window.updateDailyActionUI = updateDailyActionUI;
}

