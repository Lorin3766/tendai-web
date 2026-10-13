// @owner: core
// @role: utils
// Runtime overrides set on `window` by a deploy-injected script or the dev console.
// The OBRIUM_* name wins; legacy SERRON_* / TENDAI_* names still work but warn once.

const warned = new Set();

function readWindowConfig(name, legacyNames) {
  if (typeof window === 'undefined') return undefined;
  const value = window[name];
  if (value != null && value !== '') return value;
  for (const legacy of legacyNames) {
    const legacyValue = window[legacy];
    if (legacyValue == null || legacyValue === '') continue;
    if (!warned.has(legacy)) {
      warned.add(legacy);
      console.warn(`[Obrium] window.${legacy} is deprecated — set window.${name} instead.`);
    }
    return legacyValue;
  }
  return undefined;
}

/** Relay base URL override, or undefined. */
export function getBackendUrlOverride() {
  return readWindowConfig('OBRIUM_BACKEND_URL', ['SERRON_BACKEND_URL', 'TENDAI_BACKEND_URL']);
}

/** Optional relay bearer token, or undefined. */
export function getBackendBearer() {
  return readWindowConfig('OBRIUM_BACKEND_BEARER', [
    'SERRON_BACKEND_BEARER',
    'SERRON_TALK_BEARER',
    'TENDAI_BACKEND_BEARER',
    'TENDAI_TALK_BEARER',
  ]);
}
