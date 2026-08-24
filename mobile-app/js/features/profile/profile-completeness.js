// Serron — Profile Completeness Calculator
// @owner: profile
// @role: init
// Calculates profile completion percentage based on filled fields (not sections)

import { profileState } from '../../state.js';
import { storageManager } from '../../core/storage.js';
import { getProfileSchema } from './profile-schema.js';

/**
 * Count total fields in a profile structure (recursively)
 * @param {Object} obj - Object to count fields in
 * @returns {number} - Total number of fields
 */
function countTotalFields(obj) {
  if (!obj || typeof obj !== 'object') {
    return 0;
  }
  
  let count = 0;
  for (const key in obj) {
    const value = obj[key];
    
    if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
      // Primitive value or array - counts as one field
      count++;
    } else {
      // Nested object - count recursively
      count += countTotalFields(value);
    }
  }
  
  return count;
}

/**
 * Check if a value is a meaningful (user-filled) value, not a default
 * @param {*} value - Value to check
 * @param {string} key - Field name (to check for default values)
 * @returns {boolean} - True if value is meaningful
 */
function isMeaningfulValue(value, key) {
  // Skip null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  // Skip whitespace-only strings
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }
  
  // Skip default placeholder strings
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'select...' || lower === 'not set' || lower === '—' || lower === '-' || lower === '') {
      return false;
    }
  }
  
  // Skip default numbers (stress/stressLevel/healthVsEnergy default is 3, goalsPriority default is 2)
  if (typeof value === 'number') {
    // Default stress/stressLevel/healthVsEnergy values should not count
    if ((key === 'stress' || key === 'stressLevel' || key === 'healthVsEnergy') && value === 3) {
      return false;
    }
    // Default goalsPriority values should not count
    if (key === 'goalsPriority' && value === 2) {
      return false;
    }
    // Other numbers (including 0) are meaningful
    return true;
  }
  
  // Skip boolean false (default for many checkboxes)
  if (typeof value === 'boolean') {
    // Only true counts as meaningful (user explicitly checked)
    return value === true;
  }
  
  // Arrays: must have at least one element
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  
  // Objects: check if has meaningful properties
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).some(([k, v]) => isMeaningfulValue(v, k));
  }
  
  // Other types: if not empty, it's meaningful
  return true;
}

/**
 * Count filled fields in a profile (recursively)
 * @param {Object} profile - Profile data
 * @param {Object} structure - Initial structure for reference
 * @returns {number} - Number of filled fields
 */
function countFilledFields(profile, structure) {
  if (!profile || typeof profile !== 'object') {
    return 0;
  }
  
  let count = 0;
  
  // Iterate through structure to ensure we check all possible fields
  for (const key in structure) {
    const structureValue = structure[key];
    const profileValue = profile[key];
    
    if (structureValue === null || structureValue === undefined || typeof structureValue !== 'object' || Array.isArray(structureValue)) {
      // Primitive field or array in structure
      if (isMeaningfulValue(profileValue, key)) {
        count++;
      }
    } else {
      // Nested object - check recursively
      if (profileValue && typeof profileValue === 'object' && !Array.isArray(profileValue)) {
        count += countFilledFields(profileValue, structureValue);
      }
    }
  }
  
  return count;
}

/**
 * Calculate profile completion percentage based on filled fields
 * @returns {Object} - {percentage: number, filledFields: number, totalFields: number}
 */
export function calculateProfileCompleteness() {
  try {
    const profile = profileState.get();
    const structure = getProfileSchema(); // Use unified schema
    
    // Count total fields in profile structure
    const totalFields = countTotalFields(structure);
    
    // GUARANTEE: totalFields must always be > 0
    if (totalFields === 0) {
      console.error('[PROFILE COMPLETENESS] totalFields is 0! Schema may be empty.');
      // Return safe defaults
      return {
        percentage: 0,
        filledFields: 0,
        totalFields: 1 // Prevent division by zero
      };
    }
    
    // Count filled fields in actual profile
    const filledFields = countFilledFields(profile, structure);
    
    // Calculate percentage: (filledFields / totalFields) * 100
    const percentage = Math.round((filledFields / totalFields) * 100);

    return {
      percentage: percentage,
      filledFields: filledFields,
      totalFields: totalFields
    };
  } catch (error) {
    console.error('[PROFILE COMPLETENESS] Error calculating', error);
    return {
      percentage: 0,
      filledFields: 0,
      totalFields: 0
    };
  }
}

/**
 * Update profile completeness display in UI
 */
export function updateProfileCompletenessDisplay() {
  const result = calculateProfileCompleteness();
  const { filledFields, totalFields } = result;
  const detailsText = `${filledFields} / ${totalFields}`;
  const desktopDetails = document.getElementById('profileCompletenessDetailsDesktop');
  if (desktopDetails) desktopDetails.textContent = detailsText;
  const mobileDetails = document.getElementById('profileCompletenessDetailsMobile');
  if (mobileDetails) mobileDetails.textContent = detailsText;

  // SYSTEM INTEGRITY only grows as the system learns more user context.
  updateSystemIntegrityDisplay();
}

/**
 * Update SYSTEM INTEGRITY from cumulative learned user context (0–100%).
 */
export function updateSystemIntegrityDisplay() {
  const score = storageManager ? storageManager.calculateSystemIntegrityScore() : 0;
  const percentage = Math.min(100, Math.max(0, score));
  const filledSegments = Math.min(10, Math.round((percentage / 100) * 10));
  const readoutText = `System Integrity · ${percentage}%`;

  [ { badge: 'profileCompletenessDesktop', details: 'profileCompletenessDetailsDesktop', bar: 'dataIntegrityBarDesktop' },
    { badge: 'profileCompletenessMobile', details: 'profileCompletenessDetailsMobile', bar: 'dataIntegrityBarMobile' } ].forEach(({ badge, details, bar }) => {
    const badgeEl = document.getElementById(badge);
    if (badgeEl) badgeEl.textContent = readoutText;
    const detailsEl = document.getElementById(details);
    if (detailsEl) detailsEl.textContent = `${percentage}%`;
    const barEl = document.getElementById(bar);
    if (barEl) {
      const segments = barEl.querySelectorAll('.data-integrity-segment');
      segments.forEach((seg, i) => {
        seg.classList.toggle('filled', i < filledSegments);
      });
    }
  });
}

/** @deprecated Use updateSystemIntegrityDisplay(). */
export const updateIntegrityDisplay = updateSystemIntegrityDisplay;

/**
 * Initialize profile completeness tracking
 */
export function initProfileCompleteness() {
  if (initProfileCompleteness.initialized) return;
  initProfileCompleteness.initialized = true;

  // Update on load
  updateProfileCompletenessDisplay();
  
  // Update when profile state changes (listen to storage events)
  window.addEventListener('storage', (e) => {
    if (e.key === 'tendai-profile-state') {
      updateProfileCompletenessDisplay();
    }
  });
  
  // Also update periodically (in case localStorage is updated in same tab)
  setInterval(() => {
    updateProfileCompletenessDisplay();
  }, 2000);
}

// Export for global use
window.calculateProfileCompleteness = calculateProfileCompleteness;
window.updateProfileCompletenessDisplay = updateProfileCompletenessDisplay;
window.updateSystemIntegrityDisplay = updateSystemIntegrityDisplay;
window.updateIntegrityDisplay = updateSystemIntegrityDisplay;
window.initProfileCompleteness = initProfileCompleteness;

