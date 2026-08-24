// Serron — Human OS Dashboard: 14-day baseline + system status
// Passive sensing vs personal baseline. No React — vanilla JS store.

const BASELINE_KEY = 'tendai-human-os-baseline';
const MAX_DAYS = 14;
const DEVIATION_THRESHOLD = 0.15; // 15%

function getLocalDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Load 14-day baseline from localStorage (array of { dateKey, sleep, steps, screenTime }).
 * @returns {Array<{dateKey: string, sleep: number|null, steps: number|null, screenTime: number|null}>}
 */
export function getBaseline() {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-MAX_DAYS) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Append or update today's snapshot. Call from feed when dayState has sleep (and optionally steps/screenTime).
 * @param {{ sleep?: number|null, steps?: number|null, screenTime?: number|null }} snapshot
 */
export function appendTodaySnapshot(snapshot) {
  const dateKey = getLocalDateKey();
  const baseline = getBaseline();
  const existing = baseline.find((d) => d.dateKey === dateKey);
  const row = {
    dateKey,
    sleep: snapshot.sleep != null ? snapshot.sleep : (existing?.sleep ?? null),
    steps: snapshot.steps != null ? snapshot.steps : (existing?.steps ?? null),
    screenTime: snapshot.screenTime != null ? snapshot.screenTime : (existing?.screenTime ?? null)
  };
  const rest = baseline.filter((d) => d.dateKey !== dateKey);
  const next = [...rest, row].slice(-MAX_DAYS);
  try {
    localStorage.setItem(BASELINE_KEY, JSON.stringify(next));
  } catch (_) {}
}

/**
 * Compare today vs average of last 14 days (localStorage = persistence layer).
 * Deviation < 15% = Optimal, >= 15% = Drifting.
 * @returns {'Optimal'|'Drifting'|'Recovery'}
 */
export function getSystemStatus() {
  const todayKey = getLocalDateKey();
  const baseline = getBaseline();
  const todayRow = baseline.find((d) => d.dateKey === todayKey);
  const pastRows = baseline.filter((d) => d.dateKey !== todayKey).slice(-MAX_DAYS);
  if (pastRows.length === 0) return 'Optimal';

  const avg = (key) => {
    const values = pastRows.map((r) => r[key]).filter((v) => v != null && typeof v === 'number');
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  let deviation = 0;
  const avgSleep = avg('sleep');
  const avgSteps = avg('steps');
  const avgScreen = avg('screenTime');
  if (todayRow) {
    if (todayRow.sleep != null && avgSleep != null && avgSleep > 0) {
      deviation = Math.max(deviation, Math.abs(todayRow.sleep - avgSleep) / avgSleep);
    }
    if (todayRow.steps != null && avgSteps != null && avgSteps > 0) {
      deviation = Math.max(deviation, Math.abs(todayRow.steps - avgSteps) / avgSteps);
    }
    if (todayRow.screenTime != null && avgScreen != null && avgScreen > 0) {
      deviation = Math.max(deviation, Math.abs(todayRow.screenTime - avgScreen) / avgScreen);
    }
  }

  if (deviation >= DEVIATION_THRESHOLD) return 'Drifting';
  return 'Optimal';
}

/**
 * Get system status for a specific date (for consecutive-day check).
 * @param {string} dateKey
 * @param {Array} baseline - from getBaseline()
 * @returns {'Optimal'|'Drifting'}
 */
function getSystemStatusForDate(dateKey, baseline) {
  const row = baseline.find((d) => d.dateKey === dateKey);
  const pastRows = baseline.filter((d) => d.dateKey < dateKey).slice(-MAX_DAYS);
  if (pastRows.length === 0) return 'Optimal';
  const avg = (key) => {
    const values = pastRows.map((r) => r[key]).filter((v) => v != null && typeof v === 'number');
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  let deviation = 0;
  if (row) {
    const avgSleep = avg('sleep');
    const avgSteps = avg('steps');
    const avgScreen = avg('screenTime');
    if (row.sleep != null && avgSleep != null && avgSleep > 0) {
      deviation = Math.max(deviation, Math.abs(row.sleep - avgSleep) / avgSleep);
    }
    if (row.steps != null && avgSteps != null && avgSteps > 0) {
      deviation = Math.max(deviation, Math.abs(row.steps - avgSteps) / avgSteps);
    }
    if (row.screenTime != null && avgScreen != null && avgScreen > 0) {
      deviation = Math.max(deviation, Math.abs(row.screenTime - avgScreen) / avgScreen);
    }
  }
  return deviation >= DEVIATION_THRESHOLD ? 'Drifting' : 'Optimal';
}

/**
 * Number of consecutive days (including today) with status Drifting.
 * @returns {number}
 */
export function getDriftingConsecutiveDays() {
  const baseline = getBaseline();
  if (baseline.length === 0) return 0;
  const today = getLocalDateKey();
  const keys = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(getLocalDateKey(d));
  }
  let count = 0;
  for (const key of keys) {
    if (getSystemStatusForDate(key, baseline) === 'Drifting') count++;
    else break;
  }
  return count;
}
