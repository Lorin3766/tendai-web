// Serron — Fetch gatekeeper: defers to NetworkController so dead relays never hit native fetch()
// @owner: core
// @role: network

import { NetworkController } from '../infrastructure/network-controller.js';

const HEALTH_PROBE_TIMEOUT_MS = 2500;

/** @type {null | (() => string)} */
let _getHealthUrl = null;

/**
 * Wrap relay requests — rejects immediately if NetworkController blocks (no net::ERR in console).
 * @param {RequestInfo|URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function fetchBackend(input, init = {}) {
  const url = typeof input === 'string' ? input : String(input);
  if (NetworkController.shouldBlockRelayFetch(url)) {
    return Promise.reject(new TypeError('Backend offline (gatekeeper)'));
  }
  return fetch(input, init);
}

export function isBackendUnreachableError(err, url = '') {
  const msg = `${err && err.message ? err.message : ''} ${err && err.cause && err.cause.message ? err.cause.message : ''}`;
  if (/ERR_CONNECTION_REFUSED/i.test(msg)) return true;
  if (err && err.name === 'AbortError') return false;
  if (err && err.name === 'TypeError' && /Failed to fetch/i.test(String(err.message || ''))) {
    const u = String(url || '');
    if (/localhost:3001|127\.0\.0\.1:3001|:3001\/api\//i.test(u)) return true;
    return typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '');
  }
  return false;
}

/**
 * Single health probe — only runs when NetworkController allows (boot or RECONNECT).
 * Uses native fetch only when allowed, so no phantom requests.
 * @param {string} healthUrl
 * @returns {Promise<boolean>}
 */
export async function runHealthProbe(healthUrl) {
  if (typeof window === 'undefined') return false;

  if (!NetworkController.shouldAllowHealthFetch()) {
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    NetworkController.markUnreachable();
    publishBackendStatus('Offline');
    return false;
  }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), HEALTH_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (res.ok) {
      NetworkController.markReachable();
      publishBackendStatus('Online');
      return true;
    }
    NetworkController.markUnreachable();
    publishBackendStatus('Offline');
    return false;
  } catch (_) {
    clearTimeout(to);
    NetworkController.markUnreachable();
    publishBackendStatus('Offline');
    return false;
  }
}

export function publishBackendStatus(status) {
  if (typeof window === 'undefined') return;
  window.tendaiServerStatus = status;
  try {
    window.dispatchEvent(new CustomEvent('serron:server-status', { detail: { status } }));
  } catch (_) {}
  updateCoreStatusStrip(status);
}

function updateCoreStatusStrip(status) {
  const nodes = typeof document !== 'undefined' ? document.querySelectorAll('[data-tendai-core-status]') : [];
  nodes.forEach((el) => {
    el.classList.remove('sidebar-core-status--online', 'sidebar-core-status--offline', 'sidebar-core-status--unknown');
    const textEl = el.querySelector('.sidebar-core-status__text');
    if (status === 'Online') {
      el.hidden = false;
      el.classList.add('sidebar-core-status--online');
      if (textEl) textEl.textContent = 'CORE: ONLINE';
      el.setAttribute('aria-label', 'TendAI core relay online');
      el.setAttribute('title', 'Connected relay available. Local ledger remains private.');
    } else if (status === 'Offline') {
      el.hidden = false;
      el.classList.add('sidebar-core-status--offline');
      if (textEl) textEl.textContent = 'CORE: LOCAL';
      el.setAttribute('aria-label', 'TendAI running in local mode');
      el.setAttribute('title', 'Running on-device ledger for maximum privacy.');
    } else {
      el.hidden = true;
      if (textEl) textEl.textContent = 'CORE: LOCAL';
      el.setAttribute('aria-label', 'TendAI running in local mode');
      el.setAttribute('title', 'Running on-device ledger for maximum privacy.');
    }
  });

  const retries = typeof document !== 'undefined' ? document.querySelectorAll('[data-tendai-core-retry]') : [];
  retries.forEach((btn) => {
    btn.hidden = status !== 'Offline';
  });
}

/**
 * Registers relay URL for RECONNECT. No automatic network request by default (zero boot net::ERR).
 * Set `window.DEBUG_NETWORK = true` before modules load to run one GET /api/health at startup.
 * @param {() => string} getHealthUrl
 */
export async function performBootHealthProbe(getHealthUrl) {
  _getHealthUrl = getHealthUrl;
  if (typeof window === 'undefined') return;
  const url = typeof getHealthUrl === 'function' ? getHealthUrl() : '';
  if (!url) return;

  if (window.DEBUG_NETWORK === true) {
    NetworkController.armManualReconnect();
    await runHealthProbe(url);
    return;
  }

  publishBackendStatus('Offline');
  NetworkController._syncLegacyWindowFlags();
}

export function retryBackendConnection() {
  if (typeof window === 'undefined') return;
  NetworkController.armManualReconnect();
  const url = typeof _getHealthUrl === 'function' ? _getHealthUrl() : '';
  if (!url) return;
  void runHealthProbe(url);
}

export function initBackendRetryButtons() {
  if (typeof window === 'undefined' || window.__serronCoreRetryBound) return;
  window.__serronCoreRetryBound = true;
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target && /** @type {HTMLElement} */ (e.target).closest('[data-tendai-core-retry]');
      if (!t) return;
      e.preventDefault();
      retryBackendConnection();
    },
    true
  );
}

export function isHealthCircuitOpen() {
  return !NetworkController.isBackendReachable;
}
