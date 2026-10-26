// Display text for check-in fields. Missing values stay missing.

export function formatWaterStat(water) {
  const target = water?.target || 8;
  const current = water?.current;
  if (current == null || current === '') return `- / ${target}`;
  return `${current} / ${target}`;
}

function hasCheckinValue(value) {
  return value != null && value !== '';
}

/**
 * Wellbeing sentence. A missing stress value is not "moderate".
 * @param {{ energy?: string|null, stressLevel?: number|null, sleep?: { hours?: number|null } }} day
 */
export function wellbeingSummaryText(day) {
  const energy = day?.energy;
  const stressLevel = day?.stressLevel;
  const sleepHours = day?.sleep?.hours;
  const hasStress = hasCheckinValue(stressLevel);
  const hasSleep = hasCheckinValue(sleepHours);
  const parts = [];

  if (energy === 'Low') parts.push('Energy low');
  else if (energy === 'Normal' || energy === 'Good') parts.push('Energy steady');
  else if (energy === 'High') parts.push('Energy high');
  else if (!hasStress && !hasSleep) return 'No check-in yet';
  else parts.push('Energy not set');

  if (hasStress) {
    const level = Number(stressLevel);
    if (level <= 2) parts.push('Stress low');
    else if (level === 3) parts.push('Stress moderate');
    else if (level >= 4) parts.push('Stress high');
  }

  if (hasSleep && Number(sleepHours) < 6) parts.push('Sleep insufficient');
  else if (hasSleep && Number(sleepHours) >= 7) parts.push('Sleep good');

  return parts.length ? parts.join(' • ') : 'No check-in yet';
}

/**
 * Focus cues from values the user actually stored. Missing stress and water add nothing.
 * @param {{ energy?: string|null, stressLevel?: number|null, sleep?: { hours?: number|null }, water?: { current?: number|null } }} day
 */
export function focusCues(day) {
  const sleepHours = day?.sleep?.hours;
  const stressLevel = day?.stressLevel;
  const energy = day?.energy;
  const items = [];
  if (hasCheckinValue(sleepHours) && Number(sleepHours) < 6) items.push('rest & recovery');
  if (hasCheckinValue(stressLevel) && Number(stressLevel) >= 4) items.push('reduce stress');
  if (energy === 'Low') items.push('gentle activities');
  if (hasCheckinValue(sleepHours) && Number(sleepHours) >= 7 && energy === 'Good') items.push('focused work');
  return items;
}
