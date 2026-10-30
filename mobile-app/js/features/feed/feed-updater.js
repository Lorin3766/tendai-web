// Serron — Feed UI Updater
// @owner: feed
// @role: init
// Updates Feed UI elements based on dayState

import { dayState, profileState } from '../../state.js';
import { storageManager } from '../../core/storage.js';
import { getState } from '../../core/app-state.js';
import { addMessage } from '../storage/message-queue.js';
import { getCurrentDailyAction, markActionAsDone, markActionAsSkipped } from './daily-action.js';
import { getCurrentContext } from './context-engine.js';
import { renderAgentReportsSection } from './agent-reports-feed.js';
import { withFeedRefreshBodyShield } from '../../core/gatekeeper.js';
import { focusCues, formatWaterStat, wellbeingSummaryText } from './checkin-display.js';

/** Set when user denied location; weather card shows "Location denied" and keeps link clickable */
let locationDenied = false;

/**
 * Remove legacy Protocol Engine section; daily routines render as agent cards in the adaptive feed.
 */
export function renderProtocolCards() {
  document.getElementById('feed-view')?.querySelector('#protocolEngineSection')?.remove();
}

/** Returns a Promise that resolves when OBRIUM_BOOT_READY is true (bootstrap + HealthSync done). */
function ensureBootReady() {
  if (typeof window !== 'undefined' && window.OBRIUM_BOOT_READY === true) {
    return Promise.resolve();
  }
  return new Promise(function (resolve) {
    window.addEventListener('obrium:boot-ready', function () { resolve(); }, { once: true });
  });
}

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
    waterElement.textContent = formatWaterStat(todayState.water);
  }

  // Also update mobile version
  mobileSleepElements.forEach(el => {
    const label = el.previousElementSibling;
    if (label && label.textContent.includes('Water:')) {
      el.textContent = formatWaterStat(todayState.water);
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

/** Format time as "4:46 PM" (12h, no seconds, no "Updated") */
function formatTimeShort(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const am = hours < 12;
  const h = hours % 12 || 12;
  const m = String(minutes).padStart(2, '0');
  return `${h}:${m} ${am ? 'AM' : 'PM'}`;
}

/**
 * Update day date display (left) and time display (right)
 */
function updateDayDate() {
  const dateElement = document.getElementById('dayHeaderDate');
  const timeElement = document.getElementById('dayHeaderTime');
  const now = new Date();

  if (dateElement) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[now.getDay()];
    const day = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    dateElement.textContent = `${dayName} · ${month} ${day} · ${year}`;
  }

  if (timeElement) {
    timeElement.textContent = formatTimeShort(now);
  }
}

/** Normalize condition: clear | cloudy | foggy | rain | thunderstorm | snow | windy */
function getWeatherTheme(condition) {
  if (!condition) return 'clear';
  const c = String(condition).toLowerCase().trim();
  const normalizedMap = {
    'mainly clear': 'clear',
    'clear': 'clear',
    'partly cloudy': 'cloudy',
    'overcast': 'cloudy',
    'cloudy': 'cloudy',
    'fog': 'foggy',
    'foggy': 'foggy',
    'mist': 'foggy',
    'misty': 'foggy',
    'rain': 'rain',
    'rainy': 'rain',
    'drizzle': 'rain',
    'light rain': 'rain',
    'thunderstorm': 'thunderstorm',
    'storm': 'thunderstorm',
    'snow': 'snow',
    'snowy': 'snow',
    'wind': 'windy',
    'windy': 'windy',
    'breezy': 'windy'
  };
  if (normalizedMap[c]) return normalizedMap[c];
  if (c.includes('thunder') || c.includes('storm')) return 'thunderstorm';
  if (c.includes('snow')) return 'snow';
  if (c.includes('rain') || c.includes('drizzle')) return 'rain';
  if (c.includes('fog') || c.includes('mist')) return 'foggy';
  if (c.includes('wind') || c.includes('breeze')) return 'windy';
  if (c.includes('cloudy') || c.includes('overcast') || c.includes('partly')) return 'cloudy';
  return 'clear';
}

/** Return 'day' or 'night' from local hour (6–20 = day). Used for theme class / status string only. */
function getDayNight() {
  const h = new Date().getHours();
  return h >= 6 && h < 20 ? 'day' : 'night';
}

/** Return time-of-day label for data-time-of-day (fixed fallback when no coords). */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 5 && h < 7) return 'early-morning';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'golden-hour';
  return 'night';
}

/** Micro-tone: one word by theme. wind >= 12 overrides to Breezy. */
function getMicroTone(theme, dayNight, wind) {
  if (wind >= 12) return 'Breezy';
  const map = {
    'clear-day': 'Bright',
    'clear-night': 'Hushed',
    'cloudy-day': 'Muted',
    'cloudy-night': 'Deep',
    'foggy-day': 'Soft',
    'foggy-night': 'Veiled',
    'rain-day': 'Quiet',
    'rain-night': 'Still',
    'thunderstorm-day': 'Tense',
    'thunderstorm-night': 'Electric',
    'snow-day': 'Crisp',
    'snow-night': 'Calm',
    'windy-day': 'Stirred',
    'windy-night': 'Restless'
  };
  return map[theme + '-' + dayNight] || 'Still';
}

/** Atmospheric status: theme + dayNight for precise photo selection */
function getWeatherStatus(theme, dayNight) {
  const key = theme + '-' + dayNight;
  const map = {
    'clear-day': 'clear-day',
    'clear-night': 'clear-night',
    'cloudy-day': 'cloudy-day',
    'cloudy-night': 'cloudy-night',
    'foggy-day': 'foggy-day',
    'foggy-night': 'foggy-night',
    'rain-day': 'rain-day',
    'rain-night': 'rain-night',
    'thunderstorm-day': 'thunderstorm-day',
    'thunderstorm-night': 'thunderstorm-night',
    'snow-day': 'snow-day',
    'snow-night': 'snow-night',
    'windy-day': 'windy-day',
    'windy-night': 'windy-night'
  };
  return map[key] || (theme + '-' + dayNight) || 'clear-day';
}

/** Weather effect for overlays: rain | fog | none */
function getWeatherEffect(theme) {
  if (theme === 'rain' || theme === 'thunderstorm') return 'rain';
  if (theme === 'foggy') return 'fog';
  return 'none';
}

/** Last applied background state — skip DOM updates when unchanged to prevent blinking. */
let _lastWeatherBg = { conditionSlug: null, status: null };

/**
 * STRICT MVP: Returns a solid CSS linear gradient for weather backgrounds.
 * No images — high-performance, minimal, 0 network errors.
 */
function getWeatherGradient(weatherType) {
  const t = String(weatherType || 'clear').toLowerCase();
  if (t === 'rain' || t === 'thunderstorm' || t === 'drizzle') {
    return 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)';
  }
  if (t === 'snow' || t === 'cold') {
    return 'linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)';
  }
  if (t === 'cloudy' || t === 'foggy' || t === 'mist' || t === 'overcast' || t === 'partly-cloudy') {
    return 'linear-gradient(180deg, #18181b 0%, #27272a 100%)';
  }
  return 'linear-gradient(180deg, #111827 0%, #374151 100%)'; // clear/sunny default
}

/**
 * Update the weather effects layer (rain, fog, clear) to match current condition.
 * Adds/removes CSS classes on #weatherEffectsLayer with 0.5s fade.
 */
function updateWeatherEffects(conditionSlug) {
  const layer = document.getElementById('weatherEffectsLayer');
  if (!layer) return;
  layer.classList.remove('has-rain', 'has-fog', 'has-clear');
  const c = (conditionSlug || '').toLowerCase();
  if (c === 'rain' || c === 'drizzle' || c === 'thunderstorm') {
    layer.classList.add('has-rain');
  } else if (c === 'foggy' || c === 'mist' || c === 'overcast' || c === 'partly-cloudy') {
    layer.classList.add('has-fog');
  } else if (c === 'clear' || c === 'mainly-clear') {
    layer.classList.add('has-clear');
  }
}

/**
 * Apply background from context engine. STRICT MVP: gradient only, no images.
 * Skips DOM updates when conditionSlug/status unchanged to prevent re-render loop.
 */
function applyWeatherCardBackgroundFromContext(weatherCard, context, status, weatherEffect) {
  if (!weatherCard) return;
  const bg = document.getElementById('weatherCardBg');
  const bgNext = document.getElementById('weatherCardBgNext');
  if (!bg || !bgNext) return;

  const slug = context.conditionSlug || 'clear';
  if (_lastWeatherBg.conditionSlug === slug && _lastWeatherBg.status === status) {
    return;
  }
  _lastWeatherBg = { conditionSlug: slug, status };

  updateWeatherEffects(slug);

  const gradient = getWeatherGradient(slug);

  weatherCard.setAttribute('data-weather-status', status);
  weatherCard.setAttribute('data-time-of-day', context.mode);
  weatherCard.setAttribute('data-weather-effect', weatherEffect);

  const effectOverlay = document.getElementById('weatherEffectOverlay');
  if (effectOverlay) {
    effectOverlay.className = 'weather-effect-overlay' + (context.overlay ? ' ' + context.overlay : '');
  }
  if (typeof document.body.setAttribute === 'function') {
    document.body.setAttribute('data-weather-mood', context.mood || 'neutral');
  }

  const applyGradient = (el) => {
    el.style.setProperty('background-image', gradient, 'important');
    el.style.setProperty('background-size', 'cover', 'important');
    el.style.setProperty('background-position', 'center', 'important');
    el.style.setProperty('background-repeat', 'no-repeat', 'important');
    el.style.filter = 'none';
    el.className = 'weather-bg weather-status-' + status + (context.mood !== 'clear' ? ' weather-context-' + context.mood : '');
  };

  applyGradient(bg);
  applyGradient(bgNext);
  bgNext.style.opacity = '0';
}

/**
 * Weather card: TendAI Cinematic — temp + condition, Today H/L · Wind, micro-tone.
 * Updates only: textContent, style.color, style.display, background-image, className.
 * Layout (padding, margin, spacing) is handled by CSS only.
 */
async function updateWeather() {
  const weatherCard = document.getElementById('weatherCard');
  const nowEl = document.getElementById('dayHeaderWeatherNow');
  const conditionEl = document.getElementById('dayHeaderWeatherCondition');
  const todayEl = document.getElementById('dayHeaderWeatherToday');
  const microToneEl = document.getElementById('dayHeaderWeatherMicroTone');
  const weatherMobileElement = document.querySelector('#screen-feed .day-header-weather');
  const pressureMobileElement = document.querySelector('#screen-feed .day-header-pressure');

  if (!nowEl) return;

  const { getWeather, formatWeatherGlance } = await import('../storage/weather-service.js');
  const { getUserLocation, isLocationDenied } = await import('../storage/location-service.js');
  const location = await getUserLocation();
  const weather = await getWeather();
  const locationDeniedNow = isLocationDenied ? isLocationDenied() : locationDenied;
  const coords = location && location.type === 'geo' && location.coords ? location.coords : null;

  if (weather) {
    locationDenied = false;
    const glance = formatWeatherGlance(weather);
    let theme = getWeatherTheme(weather.condition);
    const dayNight = getDayNight();
    if ((weather.wind >= 15) && (theme === 'clear' || theme === 'cloudy')) theme = 'windy';
    const themeClass = 'theme-' + theme + '-' + dayNight;
    const status = getWeatherStatus(theme, dayNight);

    if (weatherCard) {
      const weatherEffect = getWeatherEffect(theme);
      const context = getCurrentContext(coords, status, new Date(), {}, weather.temperature, weather.condition);
      weatherCard.className = 'my-day-weather weather-card--cinematic ' + themeClass;
      weatherCard.classList.remove('weather-card--empty');
      applyWeatherCardBackgroundFromContext(weatherCard, context, status, weatherEffect);
    }

    const cityLabel = location && (location.city || (location.type === 'manual' && location.zip)) ? (location.city || location.zip) : '';
    nowEl.replaceChildren();
    if (weather.temperature != null) {
      nowEl.appendChild(document.createTextNode(`${weather.temperature}°F`));
      if (cityLabel) {
        const locSpan = document.createElement('span');
        locSpan.className = 'weather-location';
        locSpan.textContent = ' · ' + cityLabel;
        nowEl.appendChild(locSpan);
      }
    } else if (cityLabel) {
      const locSpan = document.createElement('span');
      locSpan.className = 'weather-location';
      locSpan.textContent = cityLabel;
      nowEl.appendChild(locSpan);
    }
    nowEl.style.color = '';
    if (conditionEl) {
      conditionEl.textContent = weather.condition || '';
      conditionEl.style.display = 'block';
    }
    if (todayEl) {
      const parts = [];
      if (glance.today && glance.today !== '—') parts.push('Today ' + glance.today);
      if (glance.wind && glance.wind !== '—') parts.push('Wind ' + glance.wind);
      todayEl.textContent = '';
      todayEl.style.color = '';
      todayEl.style.display = 'flex';
      todayEl.replaceChildren();
      if (parts.length) todayEl.appendChild(document.createTextNode(parts.join(' · ')));
      const refreshLink = document.createElement('span');
      refreshLink.className = 'weather-enable-location-link';
      refreshLink.setAttribute('role', 'button');
      refreshLink.setAttribute('tabindex', '0');
      refreshLink.setAttribute('data-action', 'enable-location');
      refreshLink.textContent = 'Refresh location';
      if (todayEl.childNodes.length) todayEl.appendChild(document.createTextNode(' · '));
      todayEl.appendChild(refreshLink);
    }
    if (microToneEl) {
      microToneEl.textContent = getMicroTone(theme, dayNight, weather.wind || 0);
      microToneEl.style.display = '';
    }

    if (weatherMobileElement) {
      weatherMobileElement.textContent = `${nowEl.textContent}${weather.condition ? ' · ' + weather.condition : ''} · Today: ${glance.today} · Wind: ${glance.wind}`;
    }
    if (pressureMobileElement) pressureMobileElement.style.display = 'none';

    const dayState = (await import('../../state.js')).dayState;
    const todayState = dayState.loadDayStateForToday();
    todayState.weather = {
      temperature: weather.temperature,
      condition: weather.condition,
      feelsLike: weather.feelsLike
    };
    todayState.pressure = weather.pressure;
    dayState.saveDayStateForToday(todayState);

    addMessage({
      type: 'feed',
      subtype: 'weather',
      text: `Weather: ${nowEl.textContent} · ${weather.condition || ''}`
    });
  } else {
    if (typeof document.body.setAttribute === 'function') document.body.setAttribute('data-weather-mood', 'neutral');
    if (weatherCard) {
      weatherCard.className = 'my-day-weather weather-card--cinematic weather-card--empty';
      weatherCard.removeAttribute('data-weather-status');
      weatherCard.setAttribute('data-time-of-day', getTimeOfDay());
      weatherCard.setAttribute('data-weather-effect', 'none');
      const context = getCurrentContext(coords, 'clear-day', new Date(), {}, null, null);
      applyWeatherCardBackgroundFromContext(weatherCard, context, 'clear-day', 'none');
    }
    nowEl.replaceChildren();
    nowEl.appendChild(document.createTextNode((locationDenied || locationDeniedNow) ? 'Location denied' : (location ? 'Weather unavailable' : 'Set location in Settings')));
    nowEl.style.color = 'var(--fg-soft)';
    if (conditionEl) conditionEl.style.display = 'block';
    if (todayEl) {
      todayEl.style.color = 'var(--fg-soft)';
      todayEl.style.display = '';
      todayEl.replaceChildren();
      const link = document.createElement('span');
      link.className = 'weather-enable-location-link';
      link.setAttribute('role', 'button');
      link.setAttribute('tabindex', '0');
      link.setAttribute('data-action', 'enable-location');
      link.textContent = 'Refresh location';
      todayEl.appendChild(link);
      todayEl.appendChild(document.createTextNode(' to see Now / Today / Wind'));
    }
    if (microToneEl) microToneEl.style.display = 'flex';

    if (weatherMobileElement) {
      weatherMobileElement.replaceChildren();
      const mobileLink = document.createElement('span');
      mobileLink.className = 'weather-enable-location-link';
      mobileLink.setAttribute('role', 'button');
      mobileLink.setAttribute('tabindex', '0');
      mobileLink.setAttribute('data-action', 'enable-location');
      mobileLink.textContent = 'Enable location →';
      weatherMobileElement.appendChild(mobileLink);
      weatherMobileElement.appendChild(document.createTextNode(' to see Now / Today / Wind'));
    }
    if (pressureMobileElement) pressureMobileElement.style.display = 'none';
  }

  // Day-Type block: badges + FOCUS / MOVE / AVOID (deterministic by date)
  try {
    const daytypeContainer = document.getElementById('weatherDaytype');
    const badgesEl = document.getElementById('weatherDaytypeBadges');
    const focusEl = document.getElementById('weatherDaytypeFocus');
    const moveEl = document.getElementById('weatherDaytypeMove');
    const avoidEl = document.getElementById('weatherDaytypeAvoid');
    if (daytypeContainer && badgesEl && focusEl) {
      const { getDayTypeLines, getLocalDateKey, TYPE_LABELS } = await import('./daytype-engine.js');
      const dateKey = getLocalDateKey();
      const result = getDayTypeLines(weather, dateKey);
      const types = result.types || [];
      badgesEl.replaceChildren();
      for (const t of types) {
        const label = TYPE_LABELS[t] || t;
        const badge = document.createElement('span');
        badge.className = 'weather-daytype-badge' + (t === 'COLD' || t === 'WINDY' ? ' weather-daytype-badge--glow' : '');
        badge.textContent = label;
        badgesEl.appendChild(badge);
      }
      focusEl.textContent = result.focus || '';
      const focusRow = focusEl.closest('.daytype-row');
      if (focusRow) focusRow.style.display = 'flex';
      else focusEl.style.display = 'flex';
      if (moveEl) {
        moveEl.textContent = result.move || '';
        const moveRow = moveEl.closest('.daytype-row');
        if (moveRow) moveRow.style.display = 'flex';
        else moveEl.style.display = 'flex';
      }
      if (avoidEl) {
        avoidEl.textContent = result.avoid || '';
        const avoidRow = avoidEl.closest('.daytype-row');
        if (avoidRow) avoidRow.style.display = 'flex';
        else avoidEl.style.display = 'flex';
      }
      daytypeContainer.style.display = 'block';
      daytypeContainer.setAttribute('aria-hidden', types.length ? 'false' : 'true');
    }
  } catch (e) {
    // Fail-safe: Safe Mode if daytype-engine fails to load.
    const daytypeContainer = document.getElementById('weatherDaytype');
    const badgesEl = document.getElementById('weatherDaytypeBadges');
    const focusEl = document.getElementById('weatherDaytypeFocus');
    const moveEl = document.getElementById('weatherDaytypeMove');
    const avoidEl = document.getElementById('weatherDaytypeAvoid');
    if (daytypeContainer) {
      daytypeContainer.style.display = 'block';
      daytypeContainer.setAttribute('aria-hidden', 'false');
    }
    if (badgesEl) {
      badgesEl.replaceChildren();
      const badge = document.createElement('span');
      badge.className = 'weather-daytype-badge';
      badge.textContent = 'Safe Mode';
      badgesEl.appendChild(badge);
    }
    if (focusEl) focusEl.textContent = 'Safe Mode active — weather strategy fallback loaded.';
    if (moveEl) moveEl.textContent = 'Movement guidance unavailable until weather strategy loads.';
    if (avoidEl) avoidEl.textContent = 'Avoid overcorrection until data sync completes.';
    console.warn('[FEED][DAYTYPE] Safe Mode fallback active', e);
  }

  /* Card content always visible: block/flex only (no inline top/left set in updateWeather) */
  const dayHeaderNow = document.getElementById('dayHeaderWeatherNow');
  const dayHeaderCondition = document.getElementById('dayHeaderWeatherCondition');
  const weatherDaytypeEl = document.getElementById('weatherDaytype');
  if (dayHeaderNow) dayHeaderNow.style.display = 'block';
  if (dayHeaderCondition) dayHeaderCondition.style.display = 'block';
  if (weatherDaytypeEl) weatherDaytypeEl.style.display = 'block';

  // Environmental Load (Card 2): status/advice from temp, wind, UV
  const envAdviceEl = document.getElementById('environmentalLoadAdvice');
  if (envAdviceEl && weather) {
    const temp = weather.temperature != null ? weather.temperature : null;
    const wind = weather.wind != null ? weather.wind : 0;
    const uv = weather.uvIndex != null ? weather.uvIndex : null;
    const parts = [];
    if (temp !== null && (temp < 40 || wind > 15)) {
      parts.push('Status: High Thermal Drain. Advice: Minimize exposure, focus on indoor work.');
    }
    if (uv != null && uv > 6) {
      parts.push('Status: High Radiation. Advice: Limit direct exposure.');
    }
    if (parts.length) {
      const raw = parts.join(' ');
      envAdviceEl.textContent = raw.replace(/%%/g, '%').replace(/\s+/g, ' ').trim();
      envAdviceEl.style.display = '';
    } else {
      envAdviceEl.style.display = 'none';
    }
  } else if (envAdviceEl) {
    envAdviceEl.style.display = 'none';
  }

  updateHumanOsDashboard(weather);
}

/**
 * Human OS Dashboard: System Status, Operational Window, Maintenance card, Talk badge.
 * Baseline is updated from today's sleep (and optional steps/screenTime).
 */
/**
 * Random value in [min, max] for demo mode (realistic ranges).
 */
function demoRandom(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Update Sensor Grid tiles from baseline and todayState (recovery, strain, screen, pulse).
 * When Demo Mode is ON, shows randomized realistic values.
 */
async function updateSensorGridAsync() {
  await ensureBootReady();
  const isDemoMode = getState().demo?.isDemoMode === true;

  if (isDemoMode) {
    const recoveryEl = document.getElementById('sensorValueRecovery');
    const strainEl = document.getElementById('sensorValueStrain');
    const screenEl = document.getElementById('sensorValueScreen');
    const pulseEl = document.getElementById('sensorValuePulse');

    const recoveryPct = Math.round(demoRandom(72, 92));
    const demoSteps = Math.round(demoRandom(4200, 11000));
    const screenMins = Math.round(demoRandom(180, 320));
    const screenH = Math.floor(screenMins / 60);
    const screenM = Math.round(screenMins % 60);
    const screenStr = (screenH > 0 ? screenH + 'h ' : '') + screenM + 'm';
    const bpm = Math.round(demoRandom(62, 76));

    if (recoveryEl) {
      recoveryEl.textContent = `Recovery ${recoveryPct}%, nominal`;
    }
    if (strainEl) {
      strainEl.textContent = `Load / activity ${demoSteps} steps equivalent`;
    }
    if (screenEl) {
      screenEl.textContent = `Screen ${screenStr}`;
    }
    if (pulseEl) {
      pulseEl.textContent = `Pulse ${bpm} BPM`;
    }
    return;
  }

  const todayState = dayState.loadDayStateForToday();
  let baseline = [];
  try {
    const { getBaseline } = await import('./human-os-baseline.js');
    baseline = getBaseline();
  } catch (_) {}
  const d = new Date();
  const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayRow = baseline.find((row) => row.dateKey === todayKey);

  const recoveryEl = document.getElementById('sensorValueRecovery');
  const sleepHours = todayState.sleep?.hours;
  const sleepTarget = todayState.sleep?.target || 7.5;
  let recoveryPct = null;
  if (recoveryEl) {
    if (sleepHours != null && sleepTarget > 0) {
      recoveryPct = Math.min(100, Math.round((sleepHours / sleepTarget) * 100));
      recoveryEl.textContent = `Recovery ${recoveryPct}%`;
    } else {
      const useProfileFallback = !(window.HealthSync && window.HealthSync.hasHardwareData && window.HealthSync.hasHardwareData())
        || (window.HealthSync && window.HealthSync.isUsingFallback && window.HealthSync.isUsingFallback());
      if (useProfileFallback && storageManager) {
        // System Integrity measures learned context, never health/recovery.
        recoveryEl.textContent = 'Recovery: no sensor data';
        recoveryPct = null;
      } else {
        recoveryEl.textContent = 'Recovery: no data';
        recoveryPct = null;
      }
    }
  }
  const strainEl = document.getElementById('sensorValueStrain');
  const stepsFromHealth = (window.HealthSync && typeof window.HealthSync.getStepsToday === 'function')
    ? window.HealthSync.getStepsToday()
    : null;
  const steps = stepsFromHealth ?? todayRow?.steps ?? null;
  if (strainEl) {
    if (steps != null && Number.isFinite(steps)) {
      strainEl.textContent = `Activity ${steps >= 1000 ? (steps / 1000).toFixed(1) + 'k' : String(steps)} steps`;
    } else {
      strainEl.textContent = 'Activity: no data';
    }
  }
  const screenEl = document.getElementById('sensorValueScreen');
  const minutes = todayRow?.screenTime;
  if (screenEl) {
    if (minutes != null && typeof minutes === 'number') {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      screenEl.textContent = `Screen ${h > 0 ? h + 'h ' : ''}${m}m`;
    } else {
      screenEl.textContent = 'Screen: no data';
    }
  }
  const pulseEl = document.getElementById('sensorValuePulse');
  if (pulseEl) {
    const heartRateBpm = (window.HealthSync && typeof window.HealthSync.getHeartRateBpm === 'function')
      ? window.HealthSync.getHeartRateBpm()
      : null;
    if (heartRateBpm != null && Number.isFinite(heartRateBpm)) {
      pulseEl.textContent = `Pulse ${Math.round(heartRateBpm)} BPM`;
    } else {
      pulseEl.textContent = 'Pulse: no data';
    }
  }
}

async function updateHumanOsDashboard(weatherOrNull) {
  try {
    // Refresh health data when Feed is updated (app open or tab focus)
    if (window.HealthSync && typeof window.HealthSync.refresh === 'function') {
      await window.HealthSync.refresh();
    }

    const { getSystemStatus, getDriftingConsecutiveDays, appendTodaySnapshot } = await import('./human-os-baseline.js');
    const todayState = dayState.loadDayStateForToday();
    const stepsFromHealth = (window.HealthSync && typeof window.HealthSync.getStepsToday === 'function')
      ? window.HealthSync.getStepsToday()
      : null;
    appendTodaySnapshot({
      sleep: todayState.sleep?.hours ?? null,
      steps: stepsFromHealth ?? null,
      screenTime: null
    });

    updateSensorGridAsync();

    let status = getSystemStatus();
    let driftingDays = getDriftingConsecutiveDays();
    const historySync = window.__obriumHistorySync || { isSyncing: false, gapDays: 0 };
    const isSyncingHistory = historySync.isSyncing === true && Number(historySync.gapDays || 0) > 0;
    if (isSyncingHistory) {
      // Inactivity gap is missing data, not evidence of drift (or of being optimal).
      status = 'Syncing history';
      driftingDays = 0;
    }

    // Demo mode badge: show near SYSTEM STATUS when simulation is on
    const isDemoMode = getState().demo?.isDemoMode === true;
    const demoBadge = document.getElementById('humanOsDemoBadge');
    if (demoBadge) {
      demoBadge.classList.toggle('human-os-demo-badge--visible', isDemoMode);
      demoBadge.setAttribute('aria-hidden', isDemoMode ? 'false' : 'true');
    }

    // Card 1: System Status (class for Optimal glow)
    const statusBlock = document.getElementById('humanOsSystemStatus');
    const statusValueEl = document.getElementById('humanOsStatusValue');
    const statusSubtextEl = document.getElementById('humanOsStatusSubtext');
    if (statusBlock) {
      statusBlock.classList.remove('human-os-status--optimal', 'human-os-status--drifting');
      if (status === 'Optimal') statusBlock.classList.add('human-os-status--optimal');
      else if (status === 'Drifting') statusBlock.classList.add('human-os-status--drifting');
    }
    if (statusValueEl) statusValueEl.textContent = status;
    if (statusSubtextEl) {
      if (isSyncingHistory) {
        statusSubtextEl.textContent = `No data logged for the last ${historySync.gapDays} day${historySync.gapDays === 1 ? '' : 's'}. Status resumes once new data arrives.`;
        statusSubtextEl.style.display = '';
      } else if (status === 'Drifting') {
        statusSubtextEl.textContent = 'Minor rhythm deviation detected. Monitoring active.';
        statusSubtextEl.style.display = '';
      } else {
        statusSubtextEl.style.display = 'none';
      }
    }

    // Card 3: Operational Window (previous night's Sleep End + 3h → +7h; default wake 7:00)
    const sleepEndMinutes = todayState.sleep?.sleepEndMinutes;
    const defaultWakeMinutes = 7 * 60;
    const wakeMinutes = sleepEndMinutes != null ? sleepEndMinutes : defaultWakeMinutes;
    const peakStartMinutes = wakeMinutes + 3 * 60;
    const peakEndMinutes = wakeMinutes + 7 * 60;
    const fmt = (m) => {
      const h = Math.floor(m / 60) % 24;
      const min = m % 60;
      const h12 = h % 12 || 12;
      const am = h < 12;
      return h12 + ':' + String(min).padStart(2, '0') + ' ' + (am ? 'AM' : 'PM');
    };
    const windowText = `Peak Capacity: ${fmt(peakStartMinutes)} – ${fmt(peakEndMinutes)}. Best for high-complexity tasks.`;
    const windowEl = document.getElementById('operationalWindowText');
    const opTitleEl = document.getElementById('operationalWindowTitle');
    const opLinkEl = document.getElementById('operationalWindowLink');
    const isEvening = new Date().getHours() >= 20;
    if (isEvening) {
      if (opTitleEl) opTitleEl.textContent = 'RECHARGE PROTOCOL';
      if (windowEl) windowEl.textContent = 'System preparation for shutdown. Suggested sleep start: 10:30 PM.';
      if (opLinkEl) opLinkEl.style.display = 'none';
    } else {
      if (opTitleEl) opTitleEl.textContent = 'OPERATIONAL WINDOW';
      if (windowEl) windowEl.textContent = windowText;
    }

    const windowLink = document.getElementById('operationalWindowLink');
    if (windowLink) {
      if (isEvening) {
        windowLink.style.display = 'none';
      } else if (status === 'Optimal') {
        windowLink.textContent = 'View high-performance plan';
        windowLink.style.display = '';
      } else if (status === 'Drifting') {
        windowLink.textContent = 'View recovery protocol';
        windowLink.style.display = '';
      } else {
        windowLink.style.display = 'none';
      }
      if (!windowLink.dataset.humanOsBound) {
        windowLink.dataset.humanOsBound = 'true';
        windowLink.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof window.switchView === 'function') window.switchView('services');
        });
      }
    }

    // Card 4: Maintenance (only when Drifting 2+ days)
    const maintenanceCard = document.getElementById('maintenanceSuggestedCard');
    const maintenanceLink = document.getElementById('maintenanceSuggestedLink');
    if (maintenanceCard) {
      maintenanceCard.style.display = driftingDays >= 2 ? '' : 'none';
    }
    if (maintenanceLink && !maintenanceLink.dataset.humanOsBound) {
      maintenanceLink.dataset.humanOsBound = 'true';
      maintenanceLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.switchView === 'function') window.switchView('services');
      });
    }

    // Talk notification dot: only when Drifting 3+ consecutive days
    updateTalkMaintenanceBadge(driftingDays >= 3);
  } catch (e) {
    console.warn('[FEED][HumanOS] updateHumanOsDashboard failed', e);
  }
}

/** True on the day onboarding finished: a brand-new profile has no history to have missed. */
function isOnboardingDay() {
  try {
    const on = localStorage.getItem('tendai_onboarding_completed_on');
    if (!on) return false;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return on === today;
  } catch (_) {
    return false;
  }
}

/**
 * If systemStatus is Drifting for 3+ days, show the recovery prompt as first message in TALK (once per open).
 * Call when user switches to Talk view.
 * @param {HTMLElement|null} conversationArea - #chatLog / .conversation-area
 */
export async function showDriftRecoveryPromptInTalk(conversationArea) {
  if (!conversationArea) return;
  if (conversationArea.querySelector('[data-drift-prompt]')) return;
  if (isOnboardingDay()) return;
  const historySync = window.__obriumHistorySync || { isSyncing: false, gapDays: 0 };
  if (historySync.isSyncing && Number(historySync.gapDays || 0) > 0) {
    const onceKey = `tendai_history_gap_prompt_shown_${new Date().toISOString().slice(0, 10)}`;
    try {
      if (sessionStorage.getItem(onceKey) === '1') return;
      sessionStorage.setItem(onceKey, '1');
    } catch (_) {}
    const wrap = document.createElement('div');
    wrap.setAttribute('data-drift-prompt', 'true');
    wrap.className = 'message bot message-visible drift-recovery-prompt';
    const content = document.createElement('div');
    content.className = 'message-content';
    const textP = document.createElement('p');
    textP.className = 'message-text';
    const days = Number(historySync.gapDays);
    const rawName = profileState.get()?.body?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? `, ${rawName.trim()}` : '';
    const gapText = days === 1
      ? 'the last 1 day, so that day is empty in your history. Want to tell me roughly how it went'
      : `the last ${days} days, so those days are empty in your history. Want to tell me roughly how they went`;
    textP.textContent = `Welcome back${name}. Nothing was logged for ${gapText}, or start fresh from today?`;
    content.appendChild(textP);
    const actions = document.createElement('div');
    actions.className = 'drift-recovery-actions';
    const tellBtn = document.createElement('button');
    tellBtn.type = 'button';
    tellBtn.className = 'btn drift-recovery-btn';
    tellBtn.textContent = 'Tell you about it';
    const freshBtn = document.createElement('button');
    freshBtn.type = 'button';
    freshBtn.className = 'btn drift-recovery-btn';
    freshBtn.textContent = 'Start fresh from today';
    tellBtn.addEventListener('click', () => {
      actions.remove();
      const input = document.getElementById('chatInput');
      if (input) input.focus();
    });
    freshBtn.addEventListener('click', () => {
      actions.remove();
    });
    actions.appendChild(tellBtn);
    actions.appendChild(freshBtn);
    content.appendChild(actions);
    wrap.appendChild(content);
    conversationArea.insertBefore(wrap, conversationArea.firstChild);
    return;
  }
  let getDriftingConsecutiveDays;
  try {
    const mod = await import('./human-os-baseline.js');
    getDriftingConsecutiveDays = mod.getDriftingConsecutiveDays;
  } catch (_) {
    return;
  }
  if (getDriftingConsecutiveDays() < 3) return;

  const wrap = document.createElement('div');
  wrap.setAttribute('data-drift-prompt', 'true');
  wrap.className = 'message bot message-visible drift-recovery-prompt';
  const content = document.createElement('div');
  content.className = 'message-content';
  const textP = document.createElement('p');
  textP.className = 'message-text';
  textP.textContent = 'System drift detected for 3 days. High resource drain. Would you like to see recovery options?';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn drift-recovery-btn';
  btn.textContent = 'See recovery options';
  btn.addEventListener('click', () => {
    if (typeof window.switchView === 'function') window.switchView('services');
  });
  content.appendChild(textP);
  content.appendChild(btn);
  wrap.appendChild(content);
  conversationArea.insertBefore(wrap, conversationArea.firstChild);
}

/**
 * Show or hide the Talk tab "maintenance" badge (dot). When true, badge shows; when false, badge from Human OS is removed.
 * Task: Talk dot only appears if systemStatus stays Drifting for 3 consecutive days.
 */
function updateTalkMaintenanceBadge(show) {
  const tabTalk = document.getElementById('tab-talk');
  const mobileTalk = document.querySelector('[data-screen="talk"]');
  for (const el of [tabTalk, mobileTalk].filter(Boolean)) {
    let badge = el.querySelector('.unread-badge[data-badge-source="human-os"]');
    if (show) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.setAttribute('aria-label', 'Maintenance suggested');
        badge.dataset.badgeSource = 'human-os';
        badge.textContent = '1';
        if (el.style.position !== 'relative') el.style.position = 'relative';
        el.appendChild(badge);
      }
    } else {
      if (badge) badge.remove();
    }
  }
}

/**
 * FEED weather-card: no tip/advice. Only summary + details. No "take/try/should/don't forget".
 */
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

  // Missing stress and water are ignored. No hydration cue in Feed.
  const focusItems = focusCues(todayState);

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
/** FEED = context only; no habit/reminder cards. Daily action card is not shown in Feed. */
export function updateDailyActionUI() {
  const feedView = document.getElementById('feed-view');
  const screenFeed = document.getElementById('screen-feed');
  // Remove daily action card from Feed so it never appears as a "task/reminder"
  const existingFeed = feedView?.querySelector('#dailyActionCard');
  if (existingFeed) existingFeed.remove();
  const existingMobile = screenFeed?.querySelector('#dailyActionCard');
  if (existingMobile) existingMobile.remove();
  // Button handlers below are no-op when card is not in DOM
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

  wellbeingElement.textContent = wellbeingSummaryText(todayState);
}

/**
 * Update all Feed UI elements. Waits for obrium:boot-ready if called before boot.
 */
export async function updateFeedUI() {
  await ensureBootReady();
  if (typeof window !== 'undefined' && !window.__obriumLegacyLastFeedStatePurged) {
    window.__obriumLegacyLastFeedStatePurged = true;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('last_feed_state');
    } catch (_) {}
  }
  const feedView = document.getElementById('feed-view');
  if (feedView) feedView.classList.add('feed-mission-control-mode');
  updateDayDate();
  updateWeather();
  updateDayAdvice();
  updateFeedHeaderStats();
  updateDailyFocus();
  updateWellbeing();
  renderProtocolCards();
  renderAgentReportsSection();
  if (typeof window.renderTodayBlock === 'function') window.renderTodayBlock();
}

// Time ticker: refresh header time every minute (no seconds in display)
let dayHeaderTimeInterval = null;
function startDayHeaderTimeTicker() {
  if (dayHeaderTimeInterval) return;
  dayHeaderTimeInterval = setInterval(() => {
    const timeElement = document.getElementById('dayHeaderTime');
    if (timeElement) timeElement.textContent = formatTimeShort(new Date());
  }, 60000);
}

// Initialize Feed UI only after obrium:boot-ready (HealthSync and core inits done)
async function initFeedUI() {
  await updateFeedUI();
  updateDailyActionUI();
  startDayHeaderTimeTicker();
  if (window.updateFeedWithAIAdvice) {
    setTimeout(function () {
      window.updateFeedWithAIAdvice();
    }, 500);
  }
}

function runInitFeedUIWhenReady() {
  if (typeof window !== 'undefined' && window.OBRIUM_BOOT_READY === true) {
    initFeedUI();
  } else if (typeof window !== 'undefined') {
    window.addEventListener('obrium:boot-ready', function () { initFeedUI(); }, { once: true });
  }
}
runInitFeedUIWhenReady();

/** Apply default weather background as soon as DOM has the card, so Environmental Load never shows blank before updateWeather() runs. */
function applyDefaultWeatherBackground() {
  const weatherCard = document.getElementById('weatherCard');
  if (!weatherCard || !document.getElementById('weatherCardBg')) return;
  const context = getCurrentContext(null, 'clear-day', new Date(), {}, null, null);
  applyWeatherCardBackgroundFromContext(weatherCard, context, 'clear-day', 'none');
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDefaultWeatherBackground);
  } else {
    applyDefaultWeatherBackground();
  }
}

// Re-update when switching to Feed screen (mobile). Debounced to prevent re-render loop.
let _feedScreenUpdateScheduled = false;
const feedScreen = document.getElementById('screen-feed');
if (feedScreen) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.id === 'screen-feed' && target.classList.contains('active')) {
          if (_feedScreenUpdateScheduled) return;
          _feedScreenUpdateScheduled = true;
          setTimeout(() => {
            _feedScreenUpdateScheduled = false;
            updateFeedUI();
            updateDailyActionUI();
          }, 100);
        }
      }
    });
  });
  
  observer.observe(feedScreen, {
    attributes: true,
    attributeFilter: ['class']
  });
}

/** Call when user denies location; redraws weather card to show "Location denied" and keeps link clickable */
export async function setWeatherLocationDenied() {
  locationDenied = true;
  try {
    const { setLocationDeniedFlag } = await import('../storage/location-service.js');
    if (typeof setLocationDeniedFlag === 'function') setLocationDeniedFlag(true);
  } catch (_) {}
  updateWeather();
}

/** Refresh weather card only — call after location saved (no full Feed reload) */
export async function refreshWeatherCard() {
  await updateWeather();
}

// Export for global use
window.updateFeedUI = updateFeedUI;
window.refreshFeedWithBodyShield = function refreshFeedWithBodyShield() {
  return withFeedRefreshBodyShield(() => updateFeedUI());
};
window.refreshWeatherCard = refreshWeatherCard;
window.refreshHumanOsFeed = async function() {
  await updateSensorGridAsync();
  await updateHumanOsDashboard(null);
};
window.updateDailyFocus = updateDailyFocus;
window.updateWellbeing = updateWellbeing;
window.updateDailyActionUI = updateDailyActionUI;
window.setWeatherLocationDenied = setWeatherLocationDenied;
window.showDriftRecoveryPromptInTalk = showDriftRecoveryPromptInTalk;
window.renderProtocolCards = renderProtocolCards;
window.renderAgentReportsSection = renderAgentReportsSection;

// When HealthSync fallback is ready (browser/Device Motion), refresh sensor grid so UI shows live data
if (typeof window !== 'undefined') {
  window.addEventListener('healthsync-fallback-ready', () => {
    updateSensorGridAsync();
  });
}

