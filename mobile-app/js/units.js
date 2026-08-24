// Serron — Units Conversion & Formatting Module
// @owner: storage
// @role: utils
// ============================================================
// Single source of truth for unit conversions and dual-unit display
// ============================================================

/**
 * Convert centimeters to feet and inches
 * @param {number} cm - Height in centimeters
 * @returns {{feet: number, inches: number}} Object with feet and inches
 */
export function cmToFeetIn(cm) {
  if (typeof cm !== 'number' || isNaN(cm) || cm <= 0) {
    return { feet: 0, inches: 0 };
  }
  
  // Calculate total inches first (round to avoid fractional garbage)
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  
  return { feet, inches };
}

/**
 * Convert feet and inches to centimeters
 * @param {number} feet - Feet
 * @param {number} inches - Inches
 * @returns {number} Height in centimeters
 */
export function feetInToCm(feet, inches) {
  if (typeof feet !== 'number' || isNaN(feet) || feet < 0) feet = 0;
  if (typeof inches !== 'number' || isNaN(inches) || inches < 0) inches = 0;
  
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54);
}

/**
 * Convert kilograms to pounds
 * @param {number} kg - Weight in kilograms
 * @returns {number} Weight in pounds (rounded)
 */
export function kgToLb(kg) {
  if (typeof kg !== 'number' || isNaN(kg) || kg <= 0) {
    return 0;
  }
  
  // 1 kg = 2.20462 lb
  return Math.round(kg * 2.20462);
}

/**
 * Convert pounds to kilograms
 * @param {number} lb - Weight in pounds
 * @returns {number} Weight in kilograms
 */
export function lbToKg(lb) {
  if (typeof lb !== 'number' || isNaN(lb) || lb <= 0) {
    return 0;
  }
  
  // 1 lb = 0.453592 kg
  return lb / 2.20462;
}

/**
 * Format height with dual units: "170 cm (5′7″)"
 * @param {number} cm - Height in centimeters
 * @returns {string} Formatted string with cm and ft/in
 */
export function formatHeightDual(cm) {
  if (typeof cm !== 'number' || isNaN(cm) || cm <= 0) {
    return '—';
  }
  
  const { feet, inches } = cmToFeetIn(cm);
  return `${Math.round(cm)} cm (${feet}′${inches}″)`;
}

/**
 * Format weight with dual units: "70 kg (154 lb)"
 * @param {number} kg - Weight in kilograms
 * @returns {string} Formatted string with kg and lb
 */
export function formatWeightDual(kg) {
  if (typeof kg !== 'number' || isNaN(kg) || kg <= 0) {
    return '—';
  }
  
  const lb = kgToLb(kg);
  return `${Math.round(kg)} kg (${lb} lb)`;
}

