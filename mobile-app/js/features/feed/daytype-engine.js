// Serron — Day-Type Engine (FEED)
// Weather → 1–2 day types → FOCUS / MOVE / AVOID (templates, deterministic by date)
// No medicine, no morality, no motivation. Short, neutral, system-note style.

/** Local date key YYYY-MM-DD for deterministic seed */
function getLocalDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Simple deterministic index from seed string (same seed → same index) */
function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Pick one template from list deterministically by seed.
 * @param {string[]} list
 * @param {string} seed - e.g. dateKey + '_focus_' + typeKey
 * @param {string} key - optional extra key (e.g. 'focus', 'move', 'avoid')
 * @returns {{ text: string, index: number }}
 */
export function pickTemplate(list, seed, key = '') {
  if (!list || list.length === 0) return { text: '', index: -1 };
  const fullSeed = key ? `${seed}_${key}` : seed;
  const index = hashSeed(fullSeed) % list.length;
  return { text: list[index], index };
}

/** Human-readable label for type (for badges) */
const TYPE_LABELS = {
  COLD: 'Cold',
  HOT: 'Hot',
  WINDY: 'Windy',
  RAIN: 'Rain',
  SNOW_ICE: 'Snow / Ice',
  HUMID: 'Humid',
  NICE_STABLE: 'Stable',
  EXTREME: 'Extreme',
  NO_DATA: 'No data'
};

/** Templates: focus / move / avoid per type and for combos */
export const TEMPLATES = {
  COLD: {
    focus: [
      'Cold day — warmth conservation matters.',
      'Low temps — energy may dip if you get chilled.',
      'Today is a "layer up" day.'
    ],
    move: [
      'One extra layer helps (hands/neck).',
      'Short walk, steady pace.'
    ],
    avoid: [
      'Avoid long outdoor time when already cold.',
      'Don\'t start heavy tasks when chilled.'
    ]
  },
  HOT: {
    focus: [
      'Heat — pace yourself; rest in shade.',
      'High temps — hydration and breaks matter.',
      'Today favors shorter efforts, then cool-down.'
    ],
    move: [
      'Earlier or later for outdoor time.',
      'Light activity; shade when needed.'
    ],
    avoid: [
      'Avoid peak sun for long exertion.',
      'Don\'t overpack the middle of the day.'
    ]
  },
  WINDY: {
    focus: [
      'Wind — things feel more draining.',
      'Breezy day — energy can scatter.'
    ],
    move: [
      'Shorter exposure; sheltered option if possible.',
      'One layer more than you think.'
    ],
    avoid: [
      'Avoid long outdoor time in open wind.',
      'Don\'t plan precision tasks outside.'
    ]
  },
  RAIN: {
    focus: [
      'Rain — indoor or covered rhythm.',
      'Wet day — steady, low-key pace.'
    ],
    move: [
      'Brief outing with cover if you want.',
      'Good day for inside focus.'
    ],
    avoid: [
      'Avoid long uncovered outdoor plans.',
      'Don\'t rely on dry outdoor time.'
    ]
  },
  SNOW_ICE: {
    focus: [
      'Snow/ice — traction and warmth.',
      'Cold and slippery — slow, deliberate pace.'
    ],
    move: [
      'Short steps; warm layers.',
      'Indoor option is valid.'
    ],
    avoid: [
      'Avoid rushing or long exposure.',
      'Don\'t plan critical errands if roads are bad.'
    ]
  },
  HUMID: {
    focus: [
      'Humid — effort feels heavier.',
      'Muggy day — pace yourself.'
    ],
    move: [
      'Lighter activity; hydration.',
      'Shade and breaks help.'
    ],
    avoid: [
      'Avoid long intense exertion in humidity.',
      'Don\'t overpack the midday.'
    ]
  },
  NICE_STABLE: {
    focus: [
      'Stable weather — easy day for steady pace.',
      'Calm conditions — good for routine.'
    ],
    move: [
      'Good day for a longer walk if you feel like it.',
      'Outdoor option is there if you want.'
    ],
    avoid: [
      'Don\'t overpack the schedule — keep it light.',
      'No need to force anything.'
    ]
  },
  EXTREME: {
    focus: [
      'Extreme conditions — safety first.',
      'Very cold or very hot or storm — minimize exposure.'
    ],
    move: [
      'Stay in or very short outings only.',
      'Indoor focus today.'
    ],
    avoid: [
      'Avoid non-essential outdoor time.',
      'Don\'t push through extreme weather.'
    ]
  },
  'COLD+WINDY': {
    focus: [
      'Wind makes it feel colder — energy drops faster later.',
      'Today is a "protect warmth" day.',
      'Cold and windy — layer and shorten exposure.'
    ],
    move: [
      'One extra layer helps (hands/neck matter).',
      'Shorter walk, warmer pace.'
    ],
    avoid: [
      'Avoid long outdoor time late afternoon.',
      'Don\'t start heavy tasks when already chilled.'
    ]
  },
  'HOT+HUMID': {
    focus: [
      'Hot and humid — effort feels heavy.',
      'Muggy heat — pace and hydration matter.'
    ],
    move: [
      'Earlier or later; shade and breaks.',
      'Light activity only.'
    ],
    avoid: [
      'Avoid peak heat and long exertion.',
      'Don\'t overpack the middle of the day.'
    ]
  },
  'RAIN+WINDY': {
    focus: [
      'Rain and wind — indoor or sheltered.',
      'Wet and breezy — low-key day.'
    ],
    move: [
      'Brief covered outing if needed.',
      'Indoor focus is enough.'
    ],
    avoid: [
      'Avoid long uncovered time outside.',
      'Don\'t rely on dry or calm conditions.'
    ]
  }
};

/**
 * Get 1–2 day types from weather. Uses °F and mph (normalized in engine).
 * No wind data → no WINDY. No humidity → HUMID never. Condition used for rain/snow.
 * @param {Object|null} weather - { temperature, wind, condition, humidity?, precipProb? }
 * @returns {string[]} Up to 2 types; EXTREME alone; empty if no data
 */
export function getDayTypes(weather) {
  if (!weather) return [];

  const temp = weather.temperature != null ? Number(weather.temperature) : null;
  const wind = weather.wind != null ? Number(weather.wind) : null;
  const humidity = weather.humidity != null ? Number(weather.humidity) : null;
  const precipProb = weather.precipProb != null ? Number(weather.precipProb) : null;
  const condition = (weather.condition || weather.description || '').toLowerCase();

  const hasRain = condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunder');
  const hasSnow = condition.includes('snow') || condition.includes('ice');

  // EXTREME: one type only
  if (temp != null) {
    if (temp <= 20 || temp >= 95) return ['EXTREME'];
  }
  if (wind != null && wind >= 30) return ['EXTREME'];
  if (condition.includes('thunderstorm') || condition.includes('thunder')) return ['EXTREME'];

  const types = [];

  // SNOW_ICE (priority over RAIN)
  if (temp != null && temp <= 34 && hasSnow) {
    types.push('SNOW_ICE');
  }
  // RAIN (if not already snow)
  if (types.indexOf('SNOW_ICE') === -1 && (hasRain || (precipProb != null && precipProb >= 40))) {
    types.push('RAIN');
  }

  // COLD / HOT (only if no snow/rain already, or add anyway per spec — spec says COLD ≤45, HOT ≥82)
  if (temp != null) {
    if (temp <= 45) types.push('COLD');
    else if (temp >= 82) types.push('HOT');
  }

  // WINDY only if wind data present
  if (wind != null && wind >= 15) types.push('WINDY');

  // HUMID only if we have humidity
  if (humidity != null && humidity >= 75 && temp != null && temp >= 70) types.push('HUMID');

  // NICE_STABLE: 50–75°F, wind < 12, low precip
  if (temp != null && temp >= 50 && temp <= 75 && (wind == null || wind < 12) &&
      (precipProb == null || precipProb < 25) && !hasRain && !hasSnow && types.length === 0) {
    types.push('NICE_STABLE');
  }

  // If nothing matched, default to NICE_STABLE when we have temp in range
  if (types.length === 0 && temp != null && temp >= 45 && temp <= 82) {
    types.push('NICE_STABLE');
  }
  if (types.length === 0 && temp != null) {
    if (temp <= 45) types.push('COLD');
    else if (temp >= 82) types.push('HOT');
    else types.push('NICE_STABLE');
  }

  // Cap at 2 types; EXTREME already returned above
  return types.slice(0, 2);
}

/**
 * Get FOCUS / MOVE / AVOID lines for the weather card. Deterministic by date.
 * @param {Object|null} weather
 * @param {string} dateKey - YYYY-MM-DD (local)
 * @returns {{ types: string[], focus: string, move: string, avoid: string, focusId: string, moveId: string, avoidId: string, noData?: boolean }}
 */
export function getDayTypeLines(weather, dateKey) {
  const noData = !weather;
  if (noData) {
    return {
      types: ['NO_DATA'],
      focus: 'Weather data unavailable.',
      move: '',
      avoid: '',
      focusId: 'nodata',
      moveId: '',
      avoidId: '',
      noData: true
    };
  }

  const types = getDayTypes(weather);
  if (types.length === 0) {
    return {
      types: ['NO_DATA'],
      focus: 'Weather data unavailable.',
      move: '',
      avoid: '',
      focusId: 'nodata',
      moveId: '',
      avoidId: '',
      noData: true
    };
  }

  const typeKey = types.join('+');
  const seed = `${dateKey}_${typeKey}`;

  let focusText = '';
  let moveText = '';
  let avoidText = '';
  let focusId = '';
  let moveId = '';
  let avoidId = '';

  if (types.length === 2) {
    const comboKey = types.slice().sort().join('+');
    const combo = TEMPLATES[comboKey];
    const t0 = TEMPLATES[types[0]];
    const t1 = TEMPLATES[types[1]];

    if (combo && combo.focus && combo.focus.length) {
      const r = pickTemplate(combo.focus, seed, 'focus');
      focusText = r.text;
      focusId = `${comboKey}_focus_${r.index}`;
    } else if (t0 && t0.focus && t0.focus.length) {
      const r = pickTemplate(t0.focus, seed, 'focus');
      focusText = r.text;
      focusId = `${types[0]}_focus_${r.index}`;
    }

    if (t1 && t1.move && t1.move.length) {
      const r = pickTemplate(t1.move, seed, 'move');
      moveText = r.text;
      moveId = `${types[1]}_move_${r.index}`;
    }
    if (t0 && t0.avoid && t0.avoid.length) {
      const r = pickTemplate(t0.avoid, seed, 'avoid');
      avoidText = r.text;
      avoidId = `${types[0]}_avoid_${r.index}`;
    }
  } else {
    const t = TEMPLATES[types[0]];
    if (t) {
      if (t.focus && t.focus.length) {
        const r = pickTemplate(t.focus, seed, 'focus');
        focusText = r.text;
        focusId = `${types[0]}_focus_${r.index}`;
      }
      if (t.move && t.move.length) {
        const r = pickTemplate(t.move, seed, 'move');
        moveText = r.text;
        moveId = `${types[0]}_move_${r.index}`;
      }
      if (t.avoid && t.avoid.length) {
        const r = pickTemplate(t.avoid, seed, 'avoid');
        avoidText = r.text;
        avoidId = `${types[0]}_avoid_${r.index}`;
      }
    }
  }

  return {
    types,
    focus: focusText || '—',
    move: moveText,
    avoid: avoidText,
    focusId: focusId || '—',
    moveId,
    avoidId
  };
}

export { TYPE_LABELS, getLocalDateKey };
