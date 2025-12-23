// TendAI — Unified Slider Configuration
// @owner: storage
// @role: utils
// ============================================================
// Single source of truth for all slider configurations
// ============================================================

import { formatHeightDual, formatWeightDual } from './units.js';

/**
 * Slider configuration for each field
 * @typedef {Object} SliderConfig
 * @property {string} key - Field key
 * @property {number} min - Minimum value
 * @property {number} max - Maximum value
 * @property {number} step - Step size
 * @property {function(number): string} displayFormatter - Function to format display value
 * @property {function(number): number} normalize - Function to normalize/round value
 */

/**
 * Get slider configuration for a field
 * @param {string} key - Field key (e.g., 'bodyAge', 'bodyHeight', 'bodyWeight')
 * @returns {SliderConfig|null} Slider configuration or null if not found
 */
export function getSliderConfig(key) {
  const configs = {
    // Body section
    bodyAge: {
      key: 'bodyAge',
      min: 18,
      max: 90,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} years`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    bodyHeight: {
      key: 'bodyHeight',
      min: 140,
      max: 210,
      step: 1,
      displayFormatter: (value) => formatHeightDual(parseFloat(value)),
      normalize: (value) => Math.round(parseFloat(value))
    },
    bodyWeight: {
      key: 'bodyWeight',
      min: 40,
      max: 150,
      step: 0.5,
      displayFormatter: (value) => formatWeightDual(parseFloat(value)),
      normalize: (value) => Math.round(parseFloat(value) * 2) / 2 // Round to nearest 0.5
    },
    
    // Mind section
    mindStressLevel: {
      key: 'mindStressLevel',
      min: 1,
      max: 5,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 5`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    mindMentalEnergy: {
      key: 'mindMentalEnergy',
      min: 1,
      max: 5,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 5`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Lifestyle section
    lifestyleSleepQuality: {
      key: 'lifestyleSleepQuality',
      min: 1,
      max: 5,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 5`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Goals section
    goalsMotivationLevel: {
      key: 'goalsMotivationLevel',
      min: 1,
      max: 5,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 5`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Health section (Goals tab)
    healthGoalsPriority: {
      key: 'healthGoalsPriority',
      min: 1,
      max: 4,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 4`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Mind section (Goals tab)
    mindGoalsPriority: {
      key: 'mindGoalsPriority',
      min: 1,
      max: 4,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 4`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Lifestyle section (Goals tab)
    lifestyleGoalsPriority: {
      key: 'lifestyleGoalsPriority',
      min: 1,
      max: 4,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 4`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Body section (Goals tab)
    bodyGoalsPriority: {
      key: 'bodyGoalsPriority',
      min: 1,
      max: 4,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)} / 4`,
      normalize: (value) => Math.round(parseFloat(value))
    },
    
    // Day check-in
    checkinStress: {
      key: 'checkinStress',
      min: 1,
      max: 5,
      step: 1,
      displayFormatter: (value) => `${Math.round(value)}`,
      normalize: (value) => Math.round(parseFloat(value))
    }
  };
  
  return configs[key] || null;
}

/**
 * Get all slider configurations
 * @returns {Object<string, SliderConfig>} Object with all slider configurations
 */
export function getAllSliderConfigs() {
  return {
    bodyAge: getSliderConfig('bodyAge'),
    bodyHeight: getSliderConfig('bodyHeight'),
    bodyWeight: getSliderConfig('bodyWeight'),
    mindStressLevel: getSliderConfig('mindStressLevel'),
    mindMentalEnergy: getSliderConfig('mindMentalEnergy'),
    lifestyleSleepQuality: getSliderConfig('lifestyleSleepQuality'),
    goalsMotivationLevel: getSliderConfig('goalsMotivationLevel'),
    healthGoalsPriority: getSliderConfig('healthGoalsPriority'),
    mindGoalsPriority: getSliderConfig('mindGoalsPriority'),
    lifestyleGoalsPriority: getSliderConfig('lifestyleGoalsPriority'),
    bodyGoalsPriority: getSliderConfig('bodyGoalsPriority'),
    checkinStress: getSliderConfig('checkinStress')
  };
}

