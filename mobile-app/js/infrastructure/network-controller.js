// Serron — Network master switch: zero browser net::ERR spam by never calling fetch when backend is known dead
// @owner: infrastructure
// @role: singleton

/**
 * Global singleton — import `{ NetworkController }` only.
 * `isBackendReachable` is true only after a successful GET /api/health.
 */
export const NetworkController = {
  /** @type {boolean} */
  isBackendReachable: false,

  /** Reserved for optional debug-only boot probe (`window.DEBUG_NETWORK`). */
  _bootProbePending: false,

  /** User clicked RECONNECT — allow exactly one more health attempt. */
  _manualReconnectArmed: false,

  /**
   * After a failed health check: no automatic fetches until this timestamp (10 minutes).
   * @type {number}
   */
  _silentUntil: 0,

  /** True until first success or explicit RECONNECT — blocks automatic /api/health (default startup is offline). */
  _requireManualReconnect: true,

  /**
   * Backend relay HTTP: block native fetch entirely when we know the relay is down.
   * @param {string} url
   */
  shouldBlockRelayFetch(url) {
    const u = String(url || '');
    if (!u) return false;
    const isHealth = /\/api\/health/i.test(u);
    if (isHealth) {
      return !this._shouldAllowHealthFetchInternal();
    }
    if (!this._isRelayUrl(u)) return false;
    if (this._bootProbePending) return false;
    if (!this.isBackendReachable) return true;
    return false;
  },

  /**
   * @param {string} url
   */
  _isRelayUrl(url) {
    const u = String(url || '');
    if (/localhost:3001|127\.0\.0\.1:3001/i.test(u)) return true;
    try {
      if (typeof window !== 'undefined') {
        const override = window.SERRON_BACKEND_URL || window.TENDAI_BACKEND_URL;
        if (override) {
          const base = String(override).replace(/\/$/, '');
          if (base && u.startsWith(base)) return true;
        }
      }
    } catch (_) {}
    if (/\/api\//i.test(u) && typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '')) {
      return true;
    }
    return false;
  },

  _shouldAllowHealthFetchInternal() {
    if (this._manualReconnectArmed) return true;
    if (this._bootProbePending) return true;
    if (this._requireManualReconnect) return false;
    if (Date.now() < this._silentUntil) return false;
    return false;
  },

  /** True only for boot probe or manual RECONNECT (no background health polling). */
  shouldAllowHealthFetch() {
    return this._shouldAllowHealthFetchInternal();
  },

  /** One successful /api/health */
  markReachable() {
    this.isBackendReachable = true;
    this._bootProbePending = false;
    this._manualReconnectArmed = false;
    this._requireManualReconnect = false;
    this._silentUntil = 0;
    this._syncLegacyWindowFlags();
  },

  /** Failed /api/health (boot or manual reconnect). */
  markUnreachable() {
    this.isBackendReachable = false;
    this._bootProbePending = false;
    this._manualReconnectArmed = false;
    this._requireManualReconnect = true;
    this._silentUntil = Date.now() + 10 * 60 * 1000;
    this._syncLegacyWindowFlags();
  },

  /** User pressed RECONNECT — next health fetch is allowed once. */
  armManualReconnect() {
    this._manualReconnectArmed = true;
    this._requireManualReconnect = false;
    this._silentUntil = 0;
    this._syncLegacyWindowFlags();
  },

  _syncLegacyWindowFlags() {
    if (typeof window === 'undefined') return;
    window.isBackendConfirmedOffline = !this.isBackendReachable;
  },
};
