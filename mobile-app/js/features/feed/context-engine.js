// Serron — Advanced Visual Asset Engine & Multi-Condition Mapping
// @owner: feed
// @role: utils
// Location + sun position + weather codes (WMO) + temperature → scene assets, overlays, mood accent.
// Local assets only (no Unsplash). Missing images fall back to sky-gradient-generator.
import { getSkyGradient } from './sky-gradient-generator.js';

/**
 * Get sunrise and sunset in local time for a given date and location.
 * NOAA-style; DST automatic via Date.
 */
export function getSunriseSunset(lat, lon, date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const jd = d.getTime() / 86400000 - d.getTimezoneOffset() / 1440 + 2440587.5;
  const n = jd - 2451545.0 - 0.0009 - lon / 360;
  const nRound = Math.round(n);
  const J = 2451545.0 + 0.0009 + lon / 360 + nRound;
  const M = ((357.5291 + 0.98560028 * (J - 2451545)) % 360 + 360) % 360;
  const C = 1.9148 * Math.sin((M * Math.PI) / 180) + 0.02 * Math.sin((2 * M * Math.PI) / 180);
  const lambda = M + C + 180 + 102.9372;
  const Jtransit = J + 0.0053 * Math.sin((M * Math.PI) / 180) - 0.0069 * Math.sin((2 * lambda * Math.PI) / 180);
  const sinDelta = Math.sin((lambda * Math.PI) / 180) * Math.sin((23.44 * Math.PI) / 180);
  const cosDelta = Math.cos(Math.asin(sinDelta));
  const cosOmega = (Math.sin((-0.83 * Math.PI) / 180) - Math.sin((lat * Math.PI) / 180) * sinDelta) / (Math.cos((lat * Math.PI) / 180) * cosDelta);
  if (cosOmega > 1 || cosOmega < -1) return null;
  const omega = (Math.acos(cosOmega) * 180) / Math.PI;
  const Jrise = Jtransit - omega / 360;
  const Jset = Jtransit + omega / 360;
  return {
    sunrise: new Date((Jrise - 2440587.5) * 86400000),
    sunset: new Date((Jset - 2440587.5) * 86400000)
  };
}

/** Scene mode from user's local time and location (sunrise/sunset). Uses actual local time for clear_day / clear_night / clear_golden. */
export function getSunMode(lat, lon, now = new Date()) {
  const times = getSunriseSunset(lat, lon, now);
  if (!times) return now.getHours() >= 18 || now.getHours() < 6 ? 'night' : 'day';
  const t = now.getTime();
  const rise = times.sunrise.getTime();
  const set = times.sunset.getTime();
  const ms30 = 30 * 60 * 1000;
  const ms45 = 45 * 60 * 1000;
  if (t < rise - ms30) return 'night';
  if (t >= rise - ms30 && t < rise + ms30) return 'dawn';
  if (t >= rise + ms30 && t < set - ms45) return 'day';
  if (t >= set - ms45 && t < set + ms30) return 'golden-hour';
  /* After sunset: still treat 6 AM–6 PM as day (e.g. 5 PM should load overcast_day.jpg, not overcast_night.jpg) */
  if (t >= set + ms30) {
    const h = now.getHours();
    if (h >= 6 && h < 18) return 'day';
    return 'night';
  }
  return 'day';
}

/** Uses the user's actual local time (no UTC). Used when coords unavailable for sunrise/sunset. */
export function getSunModeFallback(now = new Date()) {
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  if (mins >= 0 && mins < 5 * 60) return 'night';
  if (mins >= 5 * 60 && mins < 7 * 60) return 'dawn';
  if (mins >= 7 * 60 && mins < 17 * 60) return 'day';
  if (mins >= 17 * 60 && mins < 20 * 60) return 'golden-hour';
  return 'night';
}

// ——— Condition slugs (API condition text → slug for scene keys) ———
const CONDITION_TO_SLUG = {
  'clear': 'clear',
  'mainly clear': 'mainly-clear',
  'partly cloudy': 'partly-cloudy',
  'overcast': 'overcast',
  'foggy': 'foggy',
  'fog': 'foggy',
  'mist': 'mist',
  'haze': 'haze',
  'drizzle': 'drizzle',
  'rain': 'rain',
  'thunderstorm': 'thunderstorm',
  'snow': 'snow',
  'unknown': 'clear'
};

/** API condition text → slug (thunderstorm, drizzle, snow, mist, etc.) */
export function conditionToSlug(conditionText) {
  if (!conditionText) return 'clear';
  const c = String(conditionText).toLowerCase().trim();
  if (CONDITION_TO_SLUG[c]) return CONDITION_TO_SLUG[c];
  if (c.includes('thunder') || c.includes('storm')) return 'thunderstorm';
  if (c.includes('snow')) return 'snow';
  if (c.includes('rain') || c.includes('drizzle')) return c.includes('drizzle') ? 'drizzle' : 'rain';
  if (c.includes('fog') || c.includes('mist')) return 'foggy';
  if (c.includes('haze')) return 'haze';
  if (c.includes('cloud') || c.includes('overcast')) return c.includes('partly') ? 'partly-cloudy' : 'overcast';
  return 'clear';
}

// ——— Mood / accent (for UI buttons, progress bars) ———
const ACCENT_BY_MOOD = {
  cold: '#7dd3fc',      // ice blue
  cool: '#93c5fd',      // soft blue
  neutral: '#f6c36a',   // default gold
  warm: '#fb923c',      // warm orange
  heat: '#f97316',      // hot orange
  storm: '#94a3b8',     // slate
  'clear-night': '#818cf8' // indigo
};

function getMoodFromContext(temperatureF, conditionSlug, mode) {
  if (conditionSlug === 'thunderstorm' || (conditionSlug === 'rain' && mode === 'night')) return 'storm';
  if (mode === 'night' && (conditionSlug === 'clear' || conditionSlug === 'mainly-clear')) return 'clear-night';
  if (temperatureF == null) return 'neutral';
  if (temperatureF <= 32) return 'cold';
  if (temperatureF <= 50) return 'cool';
  if (temperatureF >= 95) return 'heat';
  if (temperatureF >= 76) return 'warm';
  return 'neutral';
}

/** Return overlay class for extreme conditions: 'frost' | 'raindrop' | '' */
export function getOverlayClass(temperatureF, conditionSlug, weatherStatus) {
  const isRain = conditionSlug === 'rain' || conditionSlug === 'drizzle' || conditionSlug === 'thunderstorm';
  const isCold = temperatureF != null && temperatureF <= 35;
  const isSnow = conditionSlug === 'snow';
  if (isCold || isSnow) return 'weather-overlay-frost';
  if (isRain) return 'weather-overlay-raindrop';
  return '';
}

/**
 * STRICT MVP: Get context for weather card. No image URLs — gradients only.
 */
export function getContextAsset(weatherStatus, mode, opts = {}, temperatureF = null, conditionText = null) {
  const conditionSlug = conditionText ? conditionToSlug(conditionText) : conditionFromStatus(weatherStatus);
  const gradient = getSkyGradient(mode, conditionSlug);
  const mood = getMoodFromContext(temperatureF, conditionSlug, mode);
  const overlay = getOverlayClass(temperatureF, conditionSlug, weatherStatus);
  const accent = ACCENT_BY_MOOD[mood] || ACCENT_BY_MOOD.neutral;
  const sceneKey = mode + '-' + conditionSlug;

  return {
    gradient,
    filter: '',
    mood,
    overlay,
    accent,
    sceneKey,
    conditionSlug
  };
}

function conditionFromStatus(weatherStatus) {
  const s = String(weatherStatus || '').toLowerCase();
  if (s.includes('thunderstorm')) return 'thunderstorm';
  if (s.includes('rain')) return 'rain';
  if (s.includes('snow')) return 'snow';
  if (s.includes('foggy') || s.includes('fog')) return 'foggy';
  if (s.includes('cloudy')) return 'cloudy';
  return 'clear';
}

/**
 * Get current context (mode from coords + time, then asset/overlay/mood).
 */
export function getCurrentContext(coords, weatherStatus, now = new Date(), opts = {}, temperatureF = null, conditionText = null) {
  const mode = coords && typeof coords.lat === 'number' && typeof coords.lon === 'number'
    ? getSunMode(coords.lat, coords.lon, now)
    : getSunModeFallback(now);
  const asset = getContextAsset(weatherStatus, mode, opts, temperatureF, conditionText);
  return {
    mode,
    gradient: asset.gradient,
    filter: asset.filter,
    mood: asset.mood,
    overlay: asset.overlay,
    accent: asset.accent,
    sceneKey: asset.sceneKey,
    conditionSlug: asset.conditionSlug,
    coords: coords || null
  };
}

/**
 * Get context for a future time (for pre-loading). Uses same mode logic at `futureNow`.
 */
export function getContextForTime(coords, weatherStatus, futureNow, opts = {}, temperatureF = null, conditionText = null) {
  const mode = coords && typeof coords.lat === 'number' && typeof coords.lon === 'number'
    ? getSunMode(coords.lat, coords.lon, futureNow)
    : getSunModeFallback(futureNow);
  const asset = getContextAsset(weatherStatus, mode, opts, temperatureF, conditionText);
  return { ...asset, mode };
}

/** STRICT MVP: No image preloading. Kept for API compatibility. */
export function preloadNext2hBackgrounds() {
  return [];
}
