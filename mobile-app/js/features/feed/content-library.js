// Closed wellness content library. Facts ship unreviewed until the founder flips flags.
// @owner: feed
// @role: content

import library from './content-library.json' with { type: 'json' };

const AREAS = ['sleep', 'move', 'nutrition', 'labs', 'stress', 'longevity', 'skin', 'cardio', 'mental'];
const EVIDENCE = new Set(['consensus', 'guideline', 'observational', 'emerging']);

/**
 * Entry ids allowed to contain plain numbers in text (hours, minutes, guideline counts).
 * Do not add dosing / medication amounts here. Task 15a-1.
 */
export const NUMBER_TEXT_ALLOWLIST = new Set([
  'sleep-duration-7h',
  'sleep-screens-evening',
  'move-weekly-aerobic',
  'move-strength-2days',
  'act-sleep-screens',
]);

/** @returns {object[]} */
export function getLibraryEntries() {
  return Array.isArray(library.entries) ? library.entries : [];
}

/**
 * Preview of unreviewed entries is only possible on loopback with ?contentPreview=1.
 * @param {{ hostname?: string, search?: string }} [env]
 */
export function isContentPreviewEnabled(env = {}) {
  const hostname =
    env.hostname != null
      ? String(env.hostname)
      : typeof location !== 'undefined'
        ? location.hostname
        : '';
  const search =
    env.search != null ? String(env.search) : typeof location !== 'undefined' ? location.search : '';
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return false;
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('contentPreview') === '1';
  } catch (_) {
    return false;
  }
}

function profileIdentity(profile) {
  const body = profile && typeof profile.body === 'object' ? profile.body : {};
  const bits = [body.name, body.birthYear, body.age].filter((v) => v != null && String(v).trim() !== '');
  return bits.length ? bits.map(String).join('|') : 'local';
}

function hashString(input) {
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function localDateKey(now) {
  const d = now instanceof Date ? now : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ageOf(profile) {
  const body = profile?.body || {};
  if (body.age != null && Number.isFinite(Number(body.age))) return Number(body.age);
  if (body.birthYear != null && Number.isFinite(Number(body.birthYear))) {
    return new Date().getFullYear() - Number(body.birthYear);
  }
  return null;
}

function fieldValue(profile, path) {
  if (!path || !profile) return undefined;
  const parts = String(path).split('.');
  let cur = profile;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function applies(entry, profile) {
  const when = entry.appliesWhen && typeof entry.appliesWhen === 'object' ? entry.appliesWhen : {};
  const age = ageOf(profile);
  if (when.ageMin != null && (age == null || age < when.ageMin)) return false;
  if (when.ageMax != null && (age == null || age > when.ageMax)) return false;
  const required = Array.isArray(when.requiredFields) ? when.requiredFields : [];
  for (const path of required) {
    const v = fieldValue(profile, path);
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return false;
  }
  const goals = Array.isArray(when.goals) ? when.goals : [];
  if (goals.length) {
    const have = Array.isArray(profile?.goals?.primaryGoals) ? profile.goals.primaryGoals.map(String) : [];
    if (!goals.some((g) => have.includes(String(g)))) return false;
  }
  return true;
}

/**
 * Short on-screen source: organization + year only. Empty if none can be derived.
 * @param {string} sourceLabel
 */
export function shortSourceLabel(sourceLabel) {
  const raw = String(sourceLabel || '').trim();
  if (!raw) return '';
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : '';

  let org = '';
  if (/AASM and Sleep Research Society/i.test(raw)) org = 'AASM and Sleep Research Society';
  else if (/AASM Sleep Education/i.test(raw) || /\bAASM\b/.test(raw)) org = 'AASM Sleep Education';
  else if (/\bNIGMS\b/i.test(raw)) org = 'NIGMS';
  else if (/\bNCCIH\b/i.test(raw)) org = 'NCCIH';
  else if (/\bCDC\b/.test(raw)) org = 'CDC';
  else if (/\bWHO\b/.test(raw)) org = 'WHO';
  else if (/Watson et al/i.test(raw)) org = 'AASM and Sleep Research Society';
  else {
    const beforeComma = raw.split(',')[0].trim();
    org = beforeComma.replace(/\s+\d{4}.*$/, '').trim() || beforeComma;
  }
  if (!org) return '';
  return year ? `${org}, ${year}` : org;
}

/**
 * One library fact for a Focus Area, or null.
 * Strict mode (default) never returns unreviewed entries.
 * @param {{ focusArea?: string, field?: string|null, profile?: object, now?: Date, shownIds?: string[] }} query
 * @param {{ hostname?: string, search?: string }} [env]
 * @returns {object|null}
 */
export function getEntries(query = {}, env) {
  const preview = isContentPreviewEnabled(env);
  const focusArea = String(query.focusArea || '').trim();
  if (!AREAS.includes(focusArea)) return null;
  let pool = getLibraryEntries().filter((e) => e && e.focusArea === focusArea && e.kind !== 'action');
  if (!preview) pool = pool.filter((e) => e.reviewed === true);
  pool = pool.filter((e) => String(e.sourceLabel || '').trim() !== '');
  if (query.field) {
    const field = String(query.field);
    const specific = pool.filter((e) => e.field === field);
    pool = specific.length ? specific : pool.filter((e) => e.field == null);
  }
  pool = pool.filter((e) => applies(e, query.profile));
  if (!pool.length) return null;

  // Deterministic: first not-yet-shown (by id order), then rotate. No randomness.
  const ordered = [...pool].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const shown = Array.isArray(query.shownIds) ? query.shownIds.map(String) : null;
  if (shown) {
    const unseen = ordered.filter((e) => !shown.includes(String(e.id)));
    const cycle = unseen.length ? unseen : ordered;
    return cycle[0];
  }
  // Stable within a local day when caller does not pass shownIds.
  const key = `${profileIdentity(query.profile)}|${localDateKey(query.now)}|${focusArea}`;
  const idx = hashString(key) % ordered.length;
  return ordered[idx];
}

const ACTION_SLOTS = new Set(['morning', 'evening', 'any']);
const ACTION_EFFORT = new Set(['low', 'medium']);
const ACTION_FORBIDDEN = [
  /diagnos/i,
  /\bcure\b/i,
  /\btreat/i,
  /prevent\w*\s+disease/i,
  /\bdose\b/i,
  /\bdosage\b/i,
  /\bmedication\b/i,
  /repeat the test/i,
  /\bfast/i,
  /intense/i,
  /supplement/i,
  /this will/i,
];

export function actionEntries(entries = getLibraryEntries()) {
  return entries.filter((e) => e && e.kind === 'action');
}

export function validateLibrary(entries = getLibraryEntries()) {
  const errors = [];
  const ids = new Set();
  const factsByArea = {};
  const actionsByArea = {};
  for (const area of AREAS) {
    factsByArea[area] = 0;
    actionsByArea[area] = 0;
  }
  for (const e of entries) {
    const kind = e.kind === 'action' ? 'action' : 'fact';
    for (const key of ['id', 'focusArea', 'text', 'sourceLabel', 'sourceVerified', 'evidenceLevel', 'reviewed']) {
      if (e[key] == null || e[key] === '') errors.push(`${e.id || '?'} missing ${key}`);
    }
    if (kind === 'fact' && !('field' in e)) errors.push(`${e.id} missing field`);
    if (ids.has(e.id)) errors.push(`duplicate id ${e.id}`);
    ids.add(e.id);
    if (!AREAS.includes(e.focusArea)) errors.push(`${e.id} bad focusArea`);
    else if (kind === 'action') actionsByArea[e.focusArea] += 1;
    else factsByArea[e.focusArea] += 1;
    const limit = kind === 'action' ? 140 : 220;
    if (String(e.text || '').length > limit) errors.push(`${e.id} text over ${limit}`);
    if (!EVIDENCE.has(e.evidenceLevel)) errors.push(`${e.id} bad evidenceLevel`);
    if (typeof e.reviewed !== 'boolean') errors.push(`${e.id} reviewed not boolean`);
    if (typeof e.sourceVerified !== 'boolean') errors.push(`${e.id} sourceVerified not boolean`);

    // Digits in text: forbid on actions unless allowlisted (15a-1). Facts with
    // guideline numbers are allowlisted when they appear in NUMBER_TEXT_ALLOWLIST;
    // non-allowlisted facts are not digit-checked (legacy pack).
    if (kind === 'action' && /\d/.test(String(e.text || '')) && !NUMBER_TEXT_ALLOWLIST.has(e.id)) {
      errors.push(`${e.id} action text has a number`);
    }

    if (e.reviewed === true) {
      if (e.sourceVerified !== true) errors.push(`${e.id} reviewed requires sourceVerified`);
      if (!String(e.sourceUrl || '').trim()) errors.push(`${e.id} reviewed requires sourceUrl`);
      if (!String(e.sourceQuote || '').trim()) errors.push(`${e.id} reviewed requires sourceQuote`);
    }

    if (kind === 'action') {
      if (!ACTION_SLOTS.has(e.slot)) errors.push(`${e.id} bad slot`);
      if (!ACTION_EFFORT.has(e.effort)) errors.push(`${e.id} bad effort`);
      for (const re of ACTION_FORBIDDEN) {
        if (re.test(String(e.text || ''))) errors.push(`${e.id} action forbidden ${re}`);
      }
    }
  }
  for (const e of entries) {
    if (e && e.kind === 'action' && e.basedOn != null && e.basedOn !== '' && !ids.has(e.basedOn)) {
      errors.push(`${e.id} basedOn missing ${e.basedOn}`);
    }
  }
  // 15a adds a verified pack on top of the original 3–5 / 2–3 caps; keep minima only.
  for (const area of AREAS) {
    if (factsByArea[area] < 3) errors.push(`${area} has ${factsByArea[area]} facts`);
    if (actionsByArea[area] < 2) errors.push(`${area} has ${actionsByArea[area]} actions`);
  }
  return errors;
}
