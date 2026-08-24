// Serron — Shared context bus: agents publish findings; readers merge before reports
// @owner: core
// @role: state

const BUS_EVENT = 'serron:shared-context-bus';

function createBus() {
  /** @type {Record<string, unknown>} */
  const channels = Object.create(null);
  /** @type {Set<() => void>} */
  const subs = new Set();

  return {
    /** @returns {Record<string, unknown>} */
    get snapshot() {
      return { ...channels };
    },

    /**
     * @param {string} channelId
     * @returns {unknown}
     */
    get(channelId) {
      const k = String(channelId || '').trim();
      return k ? channels[k] : undefined;
    },

    /**
     * Replace channel payload (timestamped).
     * @param {string} channelId
     * @param {Record<string, unknown>} data
     */
    publish(channelId, data) {
      const k = String(channelId || '').trim();
      if (!k) return;
      const payload =
        data && typeof data === 'object' && !Array.isArray(data)
          ? { ...data, updatedAt: new Date().toISOString() }
          : { value: data, updatedAt: new Date().toISOString() };
      channels[k] = payload;
      subs.forEach((fn) => {
        try {
          fn(k, payload);
        } catch (_) {}
      });
      try {
        window.dispatchEvent(new CustomEvent(BUS_EVENT, { detail: { channel: k, payload } }));
      } catch (_) {}
    },

    /**
     * Shallow-merge into a channel object.
     * @param {string} channelId
     * @param {Record<string, unknown>} patch
     */
    merge(channelId, patch) {
      const prev = this.get(channelId);
      const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
      this.publish(channelId, { ...base, ...(patch && typeof patch === 'object' ? patch : {}) });
    },

    /** @param {(channel: string, payload: unknown) => void} fn */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      return () => subs.delete(fn);
    },

    /** True if any publisher reports a health-relevant alert (pulse or critical flag). */
    hasHealthAlertContext() {
      const cardio = channels.cardio_monitor;
      if (cardio && typeof cardio === 'object' && cardio.alert === true) return true;
      const pulse = cardio && typeof cardio === 'object' ? Number(cardio.pulseBpm) : NaN;
      if (Number.isFinite(pulse) && pulse >= 85) return true;
      return false;
    },

    /** @returns {{ pulseBpm: number|null, alert: boolean }} */
    getHealthSummaryForWeather() {
      const c = channels.cardio_monitor;
      if (!c || typeof c !== 'object') return { pulseBpm: null, alert: false };
      const pulseBpm = Number(c.pulseBpm);
      return {
        pulseBpm: Number.isFinite(pulseBpm) ? Math.round(pulseBpm) : null,
        alert: Boolean(c.alert),
      };
    },
  };
}

if (typeof window !== 'undefined') {
  if (!window.sharedContextBus) {
    window.sharedContextBus = createBus();
  }
}

export function getSharedContextBus() {
  if (typeof window === 'undefined') return createBus();
  if (!window.sharedContextBus) window.sharedContextBus = createBus();
  return window.sharedContextBus;
}

export { BUS_EVENT };
