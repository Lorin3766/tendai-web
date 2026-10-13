// Serron — Weather Service (Unified Core)
// @owner: storage
// @role: utils
// Uses Open-Meteo (no API key)

import { getUserLocation } from './location-service.js';
import { hasThirdPartyLookupConsent } from '../settings/consent-gate.js';

const WEATHER_CACHE_KEY = 'tendai-weather-cache';
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/** Clear weather cache — call when location changes so getWeather fetches fresh data */
export function invalidateWeatherCache() {
  try {
    localStorage.removeItem(WEATHER_CACHE_KEY);
  } catch (_) {}
}

/**
 * Open-Meteo WMO weather codes → display condition (strict mapping).
 * Aligns with OpenWeather-style series: 2xx thunder, 3xx drizzle, 5xx rain, 6xx snow, 7xx atmosphere, 8xx clouds.
 */
const WMO_TO_CONDITION = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail'
};

function wmoToCondition(code) {
  const c = code != null ? Number(code) : 0;
  return WMO_TO_CONDITION[c] ?? 'Clear';
}

/** Export for context-engine and UI: raw WMO code → condition text */
export function weatherCodeToCondition(code) {
  return wmoToCondition(code);
}

/**
 * Get weather data (from cache or Open-Meteo).
 * Fetches immediately after location is available (e.g. right after auto getCurrentPosition).
 * @returns {Promise<Object|null>} Weather object or null
 */
export async function getWeather() {
  if (!hasThirdPartyLookupConsent()) return null;
  const location = await getUserLocation();
  if (!location) return null;

  const cached = getCachedWeather();
  if (cached) return cached;

  let lat, lon;
  if (location.type === 'geo' && location.coords) {
    lat = location.coords.lat;
    lon = location.coords.lon;
  } else if (location.type === 'manual' && (location.city || location.zip)) {
    const coords = await geocode(location.zip || location.city);
    if (!coords) return null;
    lat = coords.lat;
    lon = coords.lon;
  } else {
    return null;
  }

  try {
    const weather = await fetchOpenMeteo(lat, lon);
    if (weather) {
      saveWeatherCache(weather);
      return weather;
    }
  } catch (error) {
    const expiredCache = getCachedWeather(true);
    if (expiredCache) return expiredCache;
  }

  return null;
}

async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const r = data.results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude } : null;
}

async function fetchOpenMeteo(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,uv_index&daily=temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);

  const data = await res.json();
  const cur = data.current || {};
  const daily = data.daily || {};
  const hourly = data.hourly || {};
  const tempF = cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null;
  const hiF = daily.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : tempF;
  const loF = daily.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : tempF;
  const windMph = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : 0;
  const uvIndex = cur.uv_index != null ? Math.round(cur.uv_index * 10) / 10 : null;
  const conditionText = wmoToCondition(cur.weather_code ?? 0);

  const hourlyCodes = hourly.weather_code || [];
  const hourlyTemps = hourly.temperature_2m || [];
  const hourlyNext2h = [];
  for (let i = 1; i <= 2 && i < hourlyCodes.length; i++) {
    hourlyNext2h.push({
      weatherCode: hourlyCodes[i] ?? cur.weather_code ?? 0,
      temperatureF: hourlyTemps[i] != null ? Math.round(hourlyTemps[i]) : tempF,
      time: (hourly.time || [])[i] || null
    });
  }

  return {
    temperature: tempF,
    tempMin: loF,
    tempMax: hiF,
    condition: conditionText,
    description: conditionText.toLowerCase(),
    wind: windMph,
    uvIndex,
    feelsLike: tempF,
    pressure: null,
    humidity: null,
    windGust: null,
    rain1h: null,
    snow1h: null,
    city: null,
    state: '',
    weatherCode: cur.weather_code ?? 0,
    hourlyNext2h
  };
}

/**
 * Get cached weather if still valid
 * @param {boolean} allowExpired - Return even if expired
 * @returns {Object|null} Cached weather or null
 */
function getCachedWeather(allowExpired = false) {
  try {
    const cached = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);
    const age = Date.now() - cacheData.timestamp;

    if (!allowExpired && age > WEATHER_CACHE_TTL) {
      return null;
    }

    return cacheData.weather;
  } catch (error) {
    return null;
  }
}

/**
 * Save weather to cache
 * @param {Object} weather - Weather data
 */
function saveWeatherCache(weather) {
  const cacheData = {
    weather: weather,
    timestamp: Date.now()
  };
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cacheData));
}

/**
 * Short summary line (e.g. "Cool and windy") — facts only, no advice
 * @param {Object} weather - Weather data
 * @returns {string}
 */
export function formatWeatherSummary(weather) {
  if (!weather) return 'Weather unavailable';
  const d = (weather.description || '').toLowerCase();
  const c = (weather.condition || '').toLowerCase();
  const temp = weather.temperature;
  const wind = weather.wind || 0;
  if (wind >= 15 && (temp == null || temp < 60)) return 'Cool and windy';
  if (wind >= 15) return 'Windy';
  if (c === 'clear') return 'Clear';
  if (d.includes('few clouds') || d.includes('scattered')) return 'Partly cloudy';
  if (d.includes('overcast')) return 'Overcast';
  if (d.includes('rain') && !d.includes('light')) return 'Rain';
  if (d.includes('drizzle')) return 'Drizzle';
  if (d.includes('snow')) return 'Snow';
  if (d.includes('thunder')) return 'Thunderstorms';
  if (c !== 'unknown') return weather.condition || '—';
  return '—';
}

/**
 * Main line: location + temp + condition (one line)
 * @param {Object} weather - Weather data
 * @returns {string}
 */
export function formatWeatherDisplay(weather) {
  if (!weather) return 'Weather unavailable';
  const parts = [];
  if (weather.city) {
    const locationStr = weather.state ? `${weather.city}, ${weather.state}` : weather.city;
    parts.push(locationStr);
  }
  if (weather.temperature !== undefined) {
    const tempStr = `${weather.temperature}°F`;
    const conditionStr = weather.condition || '';
    parts.push(tempStr + (conditionStr ? ` · ${conditionStr}` : ''));
  }
  return parts.join(' · ');
}

/**
 * Glance layer: Now (temp + condition), Today (High/Low), Wind — no humidity/pressure
 * @param {Object} weather - Weather data
 * @returns {{ now: string, today: string, wind: string }}
 */
export function formatWeatherGlance(weather) {
  if (!weather) {
    return { now: '—', today: '—', wind: '—' };
  }
  const now = weather.temperature != null && weather.condition
    ? `${weather.temperature}°F · ${weather.condition}`
    : (weather.temperature != null ? `${weather.temperature}°F` : '—');
  let today = '—';
  if (weather.tempMin != null && weather.tempMax != null) {
    today = `H ${weather.tempMax} / L ${weather.tempMin}`;
  } else if (weather.temperature != null) {
    today = `${weather.temperature}°F`;
  }
  const wind = weather.wind != null ? `${weather.wind} mph` : '—';
  return { now, today, wind };
}

/**
 * Details layer only: Humidity %, Pressure (hPa everywhere — single format).
 * @param {Object} weather - Weather data
 * @returns {{ humidity: string, pressure: string }}
 */
export function formatWeatherDetailsOnly(weather) {
  if (!weather) {
    return { humidity: 'Not available', pressure: 'Not available' };
  }
  const humidity = weather.humidity != null ? `${weather.humidity}%` : '—';
  const pressure = weather.pressure != null ? `${weather.pressure} hPa` : '—';
  return { humidity, pressure };
}

/**
 * Details line(s): full details (legacy / other use)
 * @param {Object} weather - Weather data
 * @returns {string}
 */
export function formatWeatherDetails(weather) {
  if (!weather) return '';
  const parts = [];
  if (weather.temperature != null) parts.push(`${weather.temperature}°F`);
  if (weather.feelsLike != null) parts.push(`Feels like ${weather.feelsLike}°F`);
  if (weather.wind != null) {
    const windStr = weather.windGust != null
      ? `Wind: ${weather.wind} mph, gusts ${weather.windGust} mph`
      : `Wind: ${weather.wind} mph`;
    parts.push(windStr);
  }
  if (weather.humidity != null) parts.push(`Humidity: ${weather.humidity}%`);
  if (weather.pressure != null) parts.push(`Pressure: ${weather.pressure} hPa`);
  return parts.join(' · ');
}

// Export for global use
window.getWeather = getWeather;
window.invalidateWeatherCache = invalidateWeatherCache;
window.formatWeatherSummary = formatWeatherSummary;
window.formatWeatherDisplay = formatWeatherDisplay;
window.formatWeatherGlance = formatWeatherGlance;
window.formatWeatherDetailsOnly = formatWeatherDetailsOnly;
window.formatWeatherDetails = formatWeatherDetails;

