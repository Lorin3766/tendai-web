/**
 * Single build id for HTML, JS, CSS, and the service worker.
 * Bump this AND CACHE_NAME in service-worker.js together on every ship.
 * @owner: core
 */
export const BUILD_ID = 'obrium-shell-v11e-15';

/** Expose for Settings → About self-check (non-module readers). */
if (typeof window !== 'undefined') {
  window.__OBRIUM_BUILD_ID = BUILD_ID;
}
