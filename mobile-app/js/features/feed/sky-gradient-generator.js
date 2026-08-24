// Serron — Sky gradient generator (no external images)
// @owner: feed
// @role: utils
// Returns CSS gradient strings by time-of-day and condition. Used when no local asset or as base layer.

/**
 * Sky colors by condition (name → [top, bottom] or single gradient stop).
 * All values are CSS color strings (no people/portraits).
 */
const SKY_GRADIENTS = {
  // Thunderstorm — purple/slate
  thunderstorm: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 50%, #0f172a 100%)',
  // Rain
  rain: 'linear-gradient(135deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
  drizzle: 'linear-gradient(135deg, #475569 0%, #334155 50%, #1e293b 100%)',
  // Snow
  snow: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #64748b 100%)',
  // Fog / atmosphere
  foggy: 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #475569 100%)',
  mist: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 50%, #64748b 100%)',
  // Clouds
  overcast: 'linear-gradient(135deg, #64748b 0%, #475569 50%, #334155 100%)',
  cloudy: 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #475569 100%)',
  'partly-cloudy': 'linear-gradient(135deg, #7dd3fc 0%, #38bdf8 40%, #0ea5e9 70%, #0369a1 100%)',
  'mainly-clear': 'linear-gradient(135deg, #bae6fd 0%, #7dd3fc 50%, #0ea5e9 100%)',
  // Clear
  clear: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)',
  // Night (deep blue)
  'night-clear': 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #020617 100%)',
  'night-cloudy': 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
  'night-rain': 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
  'night-thunderstorm': 'linear-gradient(135deg, #312e81 0%, #1e1b4b 50%, #0f172a 100%)',
  'night-foggy': 'linear-gradient(135deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
  night: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #020617 100%)',
  // Dawn / golden hour
  dawn: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 30%, #f59e0b 60%, #92400e 100%)',
  'golden-hour': 'linear-gradient(135deg, #fde68a 0%, #f59e0b 40%, #d97706 70%, #78350f 100%)',
  // Day clear (default)
  day: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%)'
};

/**
 * Get CSS gradient for sky based on mode (day/night/dawn/golden-hour) and condition slug.
 * @param {string} mode - 'day' | 'night' | 'dawn' | 'golden-hour'
 * @param {string} conditionSlug - 'clear' | 'cloudy' | 'rain' | 'thunderstorm' | 'snow' | 'foggy' | etc.
 * @returns {string} CSS gradient value (e.g. linear-gradient(...))
 */
export function getSkyGradient(mode, conditionSlug) {
  const slug = conditionSlug || 'clear';
  const key = mode + '-' + slug;
  if (SKY_GRADIENTS[key]) return SKY_GRADIENTS[key];
  if (SKY_GRADIENTS[slug]) return SKY_GRADIENTS[slug];
  if (SKY_GRADIENTS[mode]) return SKY_GRADIENTS[mode];
  return SKY_GRADIENTS.day;
}
