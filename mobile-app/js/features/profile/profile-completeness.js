// TendAI — Profile Completeness Calculator
// @owner: profile
// @role: init
// Calculates profile completion percentage based on filled fields (not sections)

import { profileState } from '../../state.js';
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
    
    // Diagnostic log - collect meaningful fields
    const meaningfulFields = [];
    function collectMeaningfulFields(obj, structure, path = '') {
      for (const key in structure) {
        const currentPath = path ? `${path}.${key}` : key;
        const structureValue = structure[key];
        const objValue = obj && obj[key];
        
        if (structureValue === null || structureValue === undefined || typeof structureValue !== 'object' || Array.isArray(structureValue)) {
          if (isMeaningfulValue(objValue, key)) {
            meaningfulFields.push({ path: currentPath, value: objValue });
          }
        } else {
          if (objValue && typeof objValue === 'object' && !Array.isArray(objValue)) {
            collectMeaningfulFields(objValue, structureValue, currentPath);
          }
        }
      }
    }
    collectMeaningfulFields(profile, structure);
    
    console.log('[PROFILE COMPLETENESS]', {
      totalFields: totalFields,
      filledFields: filledFields,
      percentage: percentage,
      formula: `(${filledFields} / ${totalFields}) * 100 = ${percentage}%`,
      meaningfulFields: meaningfulFields.map(f => f.path).slice(0, 10) // Show first 10
    });
    
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
  const { percentage, filledFields, totalFields } = result;
  
  // Update desktop badge
  const desktopBadge = document.getElementById('profileCompletenessDesktop');
  if (desktopBadge) {
    desktopBadge.textContent = `${percentage}%`;
  }
  
  // Update desktop details (X/Y)
  const desktopDetails = document.getElementById('profileCompletenessDetailsDesktop');
  if (desktopDetails) {
    desktopDetails.textContent = `${filledFields} / ${totalFields}`;
  }
  
  // Update mobile badge
  const mobileBadge = document.getElementById('profileCompletenessMobile');
  if (mobileBadge) {
    mobileBadge.textContent = `${percentage}%`;
  }
  
  // Update mobile details (X/Y)
  const mobileDetails = document.getElementById('profileCompletenessDetailsMobile');
  if (mobileDetails) {
    mobileDetails.textContent = `${filledFields} / ${totalFields}`;
  }
}

/**
 * Initialize profile completeness tracking
 */
export function initProfileCompleteness() {
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
window.initProfileCompleteness = initProfileCompleteness;

