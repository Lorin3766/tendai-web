// TendAI — Location Service (Unified Core)
// @owner: storage
// @role: utils
// Handles geolocation and manual location input

import { profileState } from './state.js';

const LOCATION_CACHE_KEY = 'tendai-location';
const LOCATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get user location (PRIORITY: manual > geo > cache)
 * PRODUCT-GRADE: Manual location is source of truth
 * @returns {Promise<Object|null>} Location object {type, coords?, city?, zip?, country?} or null
 */
export async function getUserLocation() {
  // PRIORITY 1: Manual location from profile (HIGHEST PRIORITY)
  const manualLocation = getManualLocation();
  if (manualLocation) {
    console.log('[LOCATION] manual used');
    return manualLocation;
  }

  // PRIORITY 2: Cached location (could be geo or manual)
  const cached = getCachedLocation();
  if (cached) {
    // Only use cached if it's not manual (manual already checked above)
    if (cached.type !== 'manual') {
      console.log('[LOCATION] cached location used');
      return cached;
    }
  }

  // PRIORITY 3: Auto-geolocation (ONLY if no manual location)
  // Note: This should be called explicitly by user action, not automatically
  // Returning null here - caller should request geo explicitly if needed

  // No location available
  console.log('[LOCATION] no location available');
  return null;
}

/**
 * Request browser geolocation
 * @returns {Promise<Object|null>} Location object with coords or null
 */
function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          type: 'geo',
          coords: {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          }
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
 * Save location to profile state and cache
 * @param {Object} location - Location object
 */
export function saveLocation(location) {
  // Save to profile state
  const profile = profileState.get();
  profile.location = location;
  profileState.save(profile);
  
  // Update next step display
  if (window.updateNextStepDisplay) {
    window.updateNextStepDisplay();
  }

  // Save to cache
  const cacheData = {
    location: location,
    timestamp: Date.now()
  };
  localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cacheData));
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
  try {
    const geoLocation = await getGeolocation();
    if (geoLocation) {
      // Only save if no manual location exists
      const manualLocation = getManualLocation();
      if (!manualLocation) {
        saveLocation(geoLocation);
        console.log('[LOCATION] geo used');
        return geoLocation;
      } else {
        console.log('[LOCATION] geo requested but manual location exists, keeping manual');
        return manualLocation; // Return manual, don't override
      }
    }
  } catch (error) {
    console.log('[LOCATION] geolocation failed:', error.message);
    throw error;
  }
  
  return null;
}

// Export for global use
window.getUserLocation = getUserLocation;
window.setManualLocation = setManualLocation;
window.requestGeolocation = requestGeolocation;

