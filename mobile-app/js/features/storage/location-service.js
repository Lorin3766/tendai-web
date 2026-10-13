// Serron — Location Service (Unified Core)
// @owner: storage
// @role: utils
// Handles geolocation and manual location input. Geolocation requires a secure context (HTTPS or localhost).

import { profileState } from '../../state.js';
import { hasThirdPartyLookupConsent } from '../settings/consent-gate.js';

const LOCATION_CACHE_KEY = 'tendai-location';
const LOCATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Silent IP-based geo when GPS is blocked. No user prompt. Returns { type, coords, city?, country? } or null. */
async function fetchIpGeo() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const d = await res.json();
    if (d.latitude == null || d.longitude == null) return null;
    return { type: 'geo', coords: { lat: d.latitude, lon: d.longitude }, city: d.city || null, country: d.country_name || null };
  } catch (_) { return null; }
}

/** True when on http: and not localhost — geolocation will be blocked; suggest Settings. */
function isInsecureNonLocalhost() {
  if (typeof window === 'undefined' || !window.location) return false;
  const { protocol, hostname } = window.location;
  return protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1';
}

/**
 * Get user location (PRIORITY: manual > cached > GPS > silent IP-geo > null)
 * When GPS is blocked or denied, fetches city from ipapi.co (no user prompt).
 * @returns {Promise<Object|null>} Location object {type, coords?, city?, country?} or null
 */
export async function getUserLocation() {
  if (!hasThirdPartyLookupConsent()) return null;

  const manualLocation = getManualLocation();
  if (manualLocation) return manualLocation;

  const cached = getCachedLocation();
  if (cached) return cached;

  if (isInsecureNonLocalhost()) {
    if (typeof window !== 'undefined') window.__obriumLocationSuggestSettings = true;
    return null;
  }

  if (typeof window !== 'undefined' && window.isSecureContext && navigator.geolocation) {
    try {
      const geo = await getGeolocation();
      if (geo && geo.coords) {
        const withCity = await addCityToGeoLocation(geo);
        saveLocation(withCity);
        return withCity;
      }
    } catch (err) {
      if (err.code === 1) setLocationDeniedFlag(true);
    }
  }

  const ipLoc = await fetchIpGeo();
  if (ipLoc && ipLoc.coords) {
    saveLocation(ipLoc);
    return ipLoc;
  }

  return null;
}

/** Set when user denied geolocation (so UI can show "Location denied"). */
let _locationDenied = false;
export function setLocationDeniedFlag(value) {
  _locationDenied = value;
}
export function isLocationDenied() {
  return _locationDenied;
}

/**
 * Reverse geocode (lat, lon) to city name via Nominatim. Used to show city on weather card.
 * @returns {Promise<string|null>} City name or null
 */
async function reverseGeocode(lat, lon) {
  if (!hasThirdPartyLookupConsent()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Obrium-PWA-Weather/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    return addr.city || addr.town || addr.village || addr.municipality || addr.county || null;
  } catch (_) {
    return null;
  }
}

/** Enrich geo location with city name (reverse geocode). */
async function addCityToGeoLocation(geo) {
  if (!geo || !geo.coords) return geo;
  const city = await reverseGeocode(geo.coords.lat, geo.coords.lon);
  return { ...geo, ...(city && { city }) };
}

/**
 * Request browser geolocation
 * @returns {Promise<Object|null>} Location object with coords or null
 */
function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new Error('Geolocation requires a secure context (HTTPS or localhost).'));
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        resolve({
          type: 'geo',
          coords: { lat, lon }
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  });
}

/**
 * Get manual location from profile state
 * @returns {Object|null} Location object or null
 */
function getManualLocation() {
  const profile = profileState.get();
  const location = profile.location;
  
  if (location && location.type === 'manual' && (location.city || location.zip)) {
    return location;
  }
  
  return null;
}

/**
 * Save location to profile state and cache.
 * Rule: after save, next getUserLocation() returns this location without reload.
 */
export function saveLocation(location) {
  // Save to profile state
  const profile = profileState.get();
  profile.location = location;
  profileState.save(profile);

  // Save to cache (getCachedLocation reads this; no in-memory cache)
  const cacheData = {
    location: location,
    timestamp: Date.now()
  };
  localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cacheData));

  if (typeof window !== 'undefined') window.__obriumLocationSuggestSettings = false;

  try {
    document.dispatchEvent(new CustomEvent('obrium:location-changed', { detail: { location } }));
  } catch (_) {}

  if (window.updateNextStepDisplay) {
    window.updateNextStepDisplay();
  }
}

/**
 * Get cached location if still valid
 * @returns {Object|null} Cached location or null
 */
function getCachedLocation() {
  try {
    const cached = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);
    const age = Date.now() - cacheData.timestamp;

    if (age > LOCATION_CACHE_TTL) {
      localStorage.removeItem(LOCATION_CACHE_KEY);
      return null;
    }

    return cacheData.location;
  } catch (error) {
    return null;
  }
}

/**
 * Set manual location (city, ZIP, or country+city)
 * @param {Object} locationData - {country?, city?, zip?}
 * @returns {Object} Saved location object
 */
export function setManualLocation(locationData) {
  if (!locationData) return null;

  const { country, city, zip } = locationData;
  
  // Validate: need at least city or zip
  if (!city && !zip) {
    console.error('[LOCATION] manual location requires city or zip');
    return null;
  }

  const location = {
    type: 'manual',
    ...(country && { country }),
    ...(city && { city }),
    ...(zip && { zip })
  };

  saveLocation(location);
  console.log('[LOCATION] manual set:', location);
  
  return location;
}

/**
 * Request browser geolocation (explicit user action)
 * @returns {Promise<Object|null>} Location object with coords or null
 */
export async function requestGeolocation() {
  console.log('[LOCATION] request started');
  setLocationDeniedFlag(false);
  try {
    const geoLocation = await getGeolocation();
    if (geoLocation) {
      const manualLocation = getManualLocation();
      if (!manualLocation) {
        const withCity = await addCityToGeoLocation(geoLocation);
        saveLocation(withCity);
        console.log('[LOCATION] success saved');
        return withCity;
      } else {
        console.log('[LOCATION] manual location exists, keeping manual');
        return manualLocation;
      }
    }
  } catch (error) {
    if (error.code === 1) setLocationDeniedFlag(true);
    console.log('[LOCATION] denied');
    throw error;
  }
  return null;
}

// Export for global use
window.getUserLocation = getUserLocation;
window.setManualLocation = setManualLocation;
window.requestGeolocation = requestGeolocation;

