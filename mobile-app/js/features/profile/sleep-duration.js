/**
 * Canonical storage for lifestyle.sleepDuration.
 * ONE write format: '<6h' | '6-7h' | '7-8h' | '8h+' | 'prefer-not-say'
 * Read helpers also accept legacy forms (bare "7-8", midpoint numbers) without migrating storage.
 */
// @owner: profile

export const SLEEP_DURATION_BUCKETS = ['<6h', '6-7h', '7-8h', '8h+'];

export function hoursToSleepBucket(hours) {
  if (hours == null || !Number.isFinite(hours)) return null;
  if (hours < 6) return '<6h';
  if (hours < 7) return '6-7h';
  if (hours < 8) return '7-8h';
  return '8h+';
}

/**
 * @returns {string|null} canonical bucket, or null if unrecognized / empty
 */
export function normalizeSleepDuration(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return hoursToSleepBucket(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw === 'prefer-not-say') return raw;
  const compact = raw.toLowerCase().replace(/\s+/g, '').replace(/–|—/g, '-');
  if (SLEEP_DURATION_BUCKETS.includes(compact)) return compact;
  if (compact === '<6' || compact === 'under6') return '<6h';
  if (compact === '6-7' || compact === '6to7') return '6-7h';
  if (compact === '7-8' || compact === '7to8' || compact === '7or8') return '7-8h';
  if (compact === '8+' || compact === '8h' || compact === '>8') return '8h+';
  const asNum = Number(compact.replace(/h$/, ''));
  if (Number.isFinite(asNum) && /^-?\d+(\.\d+)?h?$/.test(compact)) {
    return hoursToSleepBucket(asNum);
  }
  return null;
}

/** Human phrase for Feed / Talk display from any stored sleepDuration form. */
export function sleepDurationDisplay(value) {
  const bucket = normalizeSleepDuration(value);
  const map = {
    '<6h': 'under 6 hours',
    '6-7h': '6 to 7 hours',
    '7-8h': '7 to 8 hours',
    '8h+': '8 or more hours',
    'prefer-not-say': 'prefer not to say',
  };
  if (bucket && map[bucket]) return map[bucket];
  const raw = String(value ?? '').trim();
  return raw || '';
}
