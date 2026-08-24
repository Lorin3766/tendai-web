// Serron — Blueprint catalog loader (data/blueprints.json)
// @owner: human-os
// @role: data

const CATALOG_URL = new URL('../../../data/blueprints.json', import.meta.url).href;

/** @type {object[]|null} */
let _cache = null;
/** @type {Promise<object[]>|null} */
let _inflight = null;

/**
 * @returns {Promise<object[]>}
 */
export async function loadBlueprints() {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const res = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`blueprints: ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.blueprints) ? data.blueprints : [];
    _cache = list;
    return list;
  })();
  try {
    return await _inflight;
  } finally {
    _inflight = null;
  }
}

/** @returns {object[]} */
export function getBlueprintsSync() {
  return _cache || [];
}

/**
 * @param {string} id
 * @returns {object|undefined}
 */
export function getBlueprintByIdSync(id) {
  const want = String(id || '').trim();
  return getBlueprintsSync().find((b) => b && String(b.id) === want);
}

/**
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export async function getBlueprintById(id) {
  await loadBlueprints();
  return getBlueprintByIdSync(id);
}
