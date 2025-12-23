// TendAI Mobile — Message Parser for State Updates
// @owner: talk
// @role: utils

import { dayState, profileState, feedState } from './state.js';

/**
 * Parse user message and update states accordingly
 * @param {string} message - User message text
 * @returns {Object} - Object with updated fields info
 */
export function parseAndUpdateState(message) {
  const lowerMessage = message.toLowerCase();
  const updates = {
    dayState: false,
    profileState: false,
    feedState: false
  };

  // Parse sleep information - multiple patterns
  const sleepPatterns = [
    /(?:slept|sleep|slept for|got)\s+(\d+(?:\.\d+)?)\s*(?:hours?|h)/i,
    /(?:i|i've)\s+(?:slept|got)\s+(\d+(?:\.\d+)?)\s*(?:hours?|h)/i,
    /(\d+(?:\.\d+)?)\s*(?:hours?|h)\s+(?:of\s+)?sleep/i
  ];
  
  for (const pattern of sleepPatterns) {
    const sleepMatch = lowerMessage.match(pattern);
    if (sleepMatch) {
      const hours = parseFloat(sleepMatch[1]);
      if (hours >= 0 && hours <= 24) {
        dayState.update('sleep.hours', hours);
        feedState.update('dayPulse.sleep', `${hours}h`);
        updates.dayState = true;
        updates.feedState = true;
        break;
      }
    }
  }

  // Parse water intake
  const waterMatch = lowerMessage.match(/(?:drank|drunk|had|drank|drank)\s+(\d+)\s*(?:cups?|glasses?|liters?|l|ml|oz|bottles?)/i);
  if (waterMatch) {
    const amount = parseInt(waterMatch[1]);
    const currentWater = dayState.getField('water.current', 0);
    const newTotal = currentWater + amount;
    dayState.update('water.current', newTotal);
    updates.dayState = true;
    updates.feedState = true;
  }
  
  // Also check for "I drank X" pattern
  const waterMatch2 = lowerMessage.match(/\b(i|i've|i've)\s+(?:drank|drunk|had)\s+(\d+)\s*(?:cups?|glasses?|liters?|l|ml|oz|bottles?)/i);
  if (waterMatch2 && !waterMatch) {
    const amount = parseInt(waterMatch2[2]);
    const currentWater = dayState.getField('water.current', 0);
    const newTotal = currentWater + amount;
    dayState.update('water.current', newTotal);
    updates.dayState = true;
    updates.feedState = true;
  }

  // Parse stress level
  if (lowerMessage.match(/\b(stressed|stress|anxious|anxiety|worried|worries)\b/i)) {
    // Increase stress level
    const currentStress = profileState.getField('mind.stress', 3);
    const newStress = Math.min(5, currentStress + 1);
    profileState.update('mind.stress', newStress);
    profileState.update('lifestyle.stressLevel', newStress);
    updates.profileState = true;
    updates.feedState = true;
  }

  // Parse calm/relaxed state
  if (lowerMessage.match(/\b(calm|relaxed|peaceful|chill|zen)\b/i)) {
    const currentStress = profileState.getField('mind.stress', 3);
    const newStress = Math.max(1, currentStress - 1);
    profileState.update('mind.stress', newStress);
    profileState.update('lifestyle.stressLevel', newStress);
    updates.profileState = true;
  }

  // Parse mood
  if (lowerMessage.match(/\b(feel|feeling|mood)\s+(good|great|excellent|amazing|wonderful)\b/i)) {
    profileState.update('mind.mood', 'Good');
    updates.profileState = true;
  } else if (lowerMessage.match(/\b(feel|feeling|mood)\s+(bad|terrible|awful|depressed|sad|down)\b/i)) {
    profileState.update('mind.mood', 'Low');
    updates.profileState = true;
  }

  // Parse energy level
  if (lowerMessage.match(/\b(energy|energetic|tired|exhausted|fatigue)\b/i)) {
    if (lowerMessage.match(/\b(high|good|great|energetic)\b/i)) {
      dayState.update('energy', 'Good');
      feedState.update('dayPulse.energy', 'Good');
      updates.dayState = true;
      updates.feedState = true;
    } else if (lowerMessage.match(/\b(low|tired|exhausted|fatigue)\b/i)) {
      dayState.update('energy', 'Low');
      feedState.update('dayPulse.energy', 'Low');
      updates.dayState = true;
      updates.feedState = true;
    }
  }

  // Parse steps/activity
  const stepsMatch = lowerMessage.match(/(\d+)\s*(?:steps?|кроків)/i);
  if (stepsMatch) {
    const steps = parseInt(stepsMatch[1]);
    let category = 'low';
    if (steps >= 15000) category = 'very-high';
    else if (steps >= 10000) category = 'high';
    else if (steps >= 5000) category = 'moderate';
    
    profileState.update('lifestyle.stepCategory', category);
    updates.profileState = true;
  }

  // Update last update timestamp
  if (updates.dayState || updates.profileState || updates.feedState) {
    feedState.update('lastUpdate', new Date().toISOString());
  }

  return updates;
}

/**
 * Generate advice based on current state
 * @returns {string} - Advice text
 */
export function generateAdvice() {
  const dayData = dayState.get();
  const profileData = profileState.get();
  
  const advice = [];
  
  // Sleep advice
  if (dayData.sleep?.hours) {
    if (dayData.sleep.hours < 6) {
      advice.push('Try to get more sleep tonight (aim for 7-8 hours).');
    } else if (dayData.sleep.hours > 9) {
      advice.push('You got plenty of rest. Maintain this sleep schedule.');
    }
  }
  
  // Water advice
  if (dayData.water?.current) {
    const remaining = dayData.water.target - dayData.water.current;
    if (remaining > 2) {
      advice.push(`Drink ${remaining} more cups of water today.`);
    }
  }
  
  // Stress advice
  const stress = profileData.mind?.stress || profileData.lifestyle?.stressLevel || 3;
  if (stress >= 4) {
    advice.push('Take time to reduce stress today. Consider deep breathing or a short walk.');
  }
  
  // Energy advice
  if (dayData.energy === 'Low') {
    advice.push('Focus on hydration and light movement to boost energy.');
  }
  
  return advice.length > 0 ? advice[0] : 'Keep up the good work with your wellbeing routine.';
}

