// TendAI — Weather Service (Unified Core)
// @owner: storage
// @role: utils
// Fetches real weather data with caching

import { getUserLocation } from './location-service.js';

const WEATHER_CACHE_KEY = 'tendai-weather-cache';
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
// Using OpenWeatherMap API (free tier: 60 calls/minute, 1M calls/month)
// Get your free API key at: https://openweathermap.org/api
// IMPORTANT: Replace 'demo' with your actual API key from openweathermap.org
// Without a valid API key, weather will show "Weather unavailable"
const WEATHER_API_KEY = 'demo'; // TODO: Replace with your API key from openweathermap.org
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5/weather';

/**
 * Get weather data (from cache or API)
 * @returns {Promise<Object|null>} Weather object or null
 */
export async function getWeather() {
  // Check cache first
  const cached = getCachedWeather();
  if (cached) {
    console.log('[WEATHER] cache hit');
    return cached;
  }

  // Get location
  const location = await getUserLocation();
  if (!location) {
    console.log('[WEATHER] unavailable - no location');
    return null;
  }

  // Fetch from API
  try {
    const weather = await fetchWeatherFromAPI(location);
    if (weather) {
      saveWeatherCache(weather);
      console.log('[WEATHER] fetch ok');
      return weather;
    }
  } catch (error) {
    console.log('[WEATHER] fetch failed:', error.message);
    
    // Return cached data even if expired (graceful degradation)
    const expiredCache = getCachedWeather(true);
    if (expiredCache) {
      console.log('[WEATHER] using expired cache');
      return expiredCache;
    }
  }

  return null;
}

/**
 * Fetch weather from API
 * @param {Object} location - Location object
 * @returns {Promise<Object|null>} Weather data or null
 */
async function fetchWeatherFromAPI(location) {
  let url = '';
  
  if (location.type === 'geo' && location.coords) {
    // Use coordinates
    url = `${WEATHER_API_BASE}?lat=${location.coords.lat}&lon=${location.coords.lon}&appid=${WEATHER_API_KEY}&units=imperial`;
  } else if (location.type === 'manual') {
    // Use city or ZIP
    const query = location.zip || location.city;
    url = `${WEATHER_API_BASE}?q=${encodeURIComponent(query)}&appid=${WEATHER_API_KEY}&units=imperial`;
  } else {
    throw new Error('Invalid location type');
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Transform API response to our format
  return {
    city: data.name,
    state: data.sys?.country || '',
    temperature: Math.round(data.main.temp),
    condition: data.weather[0]?.main || 'Unknown',
    description: data.weather[0]?.description || '',
    feelsLike: Math.round(data.main.feels_like),
    wind: Math.round(data.wind?.speed || 0),
    pressure: Math.round(data.main.pressure || 0),
    humidity: data.main.humidity || 0
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
 * Format weather display string
 * @param {Object} weather - Weather data
 * @returns {string} Formatted string
 */
export function formatWeatherDisplay(weather) {
  if (!weather) return 'Weather unavailable';

  const parts = [];
  
  // City, State
  if (weather.city) {
    const locationStr = weather.state ? `${weather.city}, ${weather.state}` : weather.city;
    parts.push(locationStr);
  }
  
  // Temperature and condition
  if (weather.temperature !== undefined) {
    const tempStr = `${weather.temperature}°F`;
    const conditionStr = weather.condition || '';
    parts.push(tempStr + (conditionStr ? ` · ${conditionStr}` : ''));
  }

  return parts.join(' · ');
}

/**
 * Format weather details string
 * @param {Object} weather - Weather data
 * @returns {string} Formatted details
 */
export function formatWeatherDetails(weather) {
  if (!weather) return '';

  const parts = [];
  
  if (weather.wind !== undefined) {
    parts.push(`Wind: ${weather.wind} mph`);
  }
  
  if (weather.pressure !== undefined) {
    parts.push(`Pressure: ${weather.pressure} hPa`);
  }

  return parts.join(' · ');
}

// Export for global use
window.getWeather = getWeather;
window.formatWeatherDisplay = formatWeatherDisplay;
window.formatWeatherDetails = formatWeatherDetails;

