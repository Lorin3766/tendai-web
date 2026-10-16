// Closed wellness content library. Facts ship unreviewed until the founder flips flags.
// @owner: feed
// @role: content

import library from './content-library.json' with { type: 'json' };

const AREAS = ['sleep', 'move', 'nutrition', 'labs', 'stress', 'longevity', 'skin', 'cardio', 'mental'];
const EVIDENCE = new Set(['consensus', 'guideline', 'observational', 'emerging']);

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
 * One library fact for a Focus Area, or null.
 * Strict mode (default) never returns unreviewed entries.
 * @param {{ focusArea?: string, field?: string|null, profile?: object, now?: Date }} query
 * @param {{ hostname?: string, search?: string }} [env]
 * @returns {object|null}
 */
export function getEntries(query = {}, env) {
  const preview = isContentPreviewEnabled(env);
  const focusArea = String(query.focusArea || '').trim();
  if (!AREAS.includes(focusArea)) return null;
  let pool = getLibraryEntries().filter((e) => e && e.focusArea === focusArea);
  if (!preview) pool = pool.filter((e) => e.reviewed === true);
  if (query.field) {
    const field = String(query.field);
    const specific = pool.filter((e) => e.field === field);
    pool = specific.length ? specific : pool.filter((e) => e.field == null);
  }
  pool = pool.filter((e) => applies(e, query.profile));
  if (!pool.length) return null;
  const key = `${profileIdentity(query.profile)}|${localDateKey(query.now)}|${focusArea}`;
  const idx = hashString(key) % pool.length;
  return pool[idx];
}

export function validateLibrary(entries = getLibraryEntries()) {
  const errors = [];
  const ids = new Set();
  const byArea = {};
  for (const area of AREAS) byArea[area] = 0;
  for (const e of entries) {
    for (const key of ['id', 'focusArea', 'text', 'sourceLabel', 'sourceVerified', 'evidenceLevel', 'reviewed']) {
      if (e[key] == null || e[key] === '') errors.push(`${e.id || '?'} missing ${key}`);
    }
    if (!('field' in e)) errors.push(`${e.id} missing field`);
    if (ids.has(e.id)) errors.push(`duplicate id ${e.id}`);
    ids.add(e.id);
    if (!AREAS.includes(e.focusArea)) errors.push(`${e.id} bad focusArea`);
    else byArea[e.focusArea] += 1;
    if (String(e.text || '').length > 220) errors.push(`${e.id} text over 220`);
    if (!EVIDENCE.has(e.evidenceLevel)) errors.push(`${e.id} bad evidenceLevel`);
    if (typeof e.reviewed !== 'boolean') errors.push(`${e.id} reviewed not boolean`);
    if (typeof e.sourceVerified !== 'boolean') errors.push(`${e.id} sourceVerified not boolean`);
  }
  for (const area of AREAS) {
    if (byArea[area] < 3 || byArea[area] > 5) errors.push(`${area} has ${byArea[area]} entries`);
  }
  return errors;
}
