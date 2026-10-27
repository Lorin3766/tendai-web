// @owner: core
// @role: utils
// Runtime overrides set on `window`, or via <meta name="obrium-backend-url"> / bearer.
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

function readMeta(name) {
  if (typeof document === 'undefined') return undefined;
  const el = document.querySelector(`meta[name="${name}"]`);
  const content = el && el.getAttribute('content');
  return content != null && String(content).trim() !== '' ? String(content).trim() : undefined;
}

export function isLoopbackHostname(hostname) {
  const host = String(hostname || '');
  return host === 'localhost' || host === '127.0.0.1';
}

export function currentHostname(env) {
  if (env && env.hostname != null) return String(env.hostname);
  if (typeof location !== 'undefined') return String(location.hostname || '');
  return '';
}

/** Relay base URL override from window or meta tag, or undefined. */
export function getBackendUrlOverride() {
  const fromWindow = readWindowConfig('OBRIUM_BACKEND_URL', ['SERRON_BACKEND_URL', 'TENDAI_BACKEND_URL']);
  if (fromWindow != null && fromWindow !== '') return fromWindow;
  return readMeta('obrium-backend-url');
}

/** Optional relay bearer token from window or meta, or undefined. */
export function getBackendBearer() {
  const fromWindow = readWindowConfig('OBRIUM_BACKEND_BEARER', [
    'SERRON_BACKEND_BEARER',
    'SERRON_TALK_BEARER',
    'TENDAI_BACKEND_BEARER',
    'TENDAI_TALK_BEARER',
  ]);
  if (fromWindow != null && fromWindow !== '') return fromWindow;
  return readMeta('obrium-backend-bearer');
}

/**
 * Resolve the relay base URL.
 * Production (non-loopback) never falls back to localhost — configure meta/window instead.
 * @param {{ hostname?: string, port?: string }} [env]
 */
export function resolveBackendURL(env) {
  const override = getBackendUrlOverride();
  if (override) return String(override).replace(/\/$/, '');

  const hostname = currentHostname(env);
  if (!isLoopbackHostname(hostname)) return '';

  let port = '';
  if (env && env.port != null) port = String(env.port);
  else if (typeof location !== 'undefined') {
    port = location.port || (location.protocol === 'https:' ? '443' : '80');
  }
  // PWA on common local ports: relay stays on :3001.
  if (port === '3000' || port === '5500' || port === '8080' || port === '5173' || port === '50490') {
    return 'http://127.0.0.1:3001';
  }
  return 'http://127.0.0.1:3001';
}
