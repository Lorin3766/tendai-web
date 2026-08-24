// Serron — HealthSync: bridge to device health data (Apple Health / Health Connect)
// @owner: storage
// @role: service
// Requests Step Count and Heart Rate permissions; provides data for Feed.
// When running in browser or when plugin is unavailable, uses fallback:
// Device Motion API may increment step estimate from zero; BPM stays null until native Health provides it.

const LOG_TAG = '[HealthSync]';

/** Cached values (updated on refresh) */
let _stepsToday = null;
let _heartRateBpm = null;
let _lastRefresh = 0;
let _permissionsRequested = false;
/** True when using browser fallback (no native plugin) */
let _usingFallback = false;

/** Check if Capacitor and Health plugin are available */
function getHealthPlugin() {
  if (typeof window === 'undefined') return null;
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform?.()) return null;
  return Cap.Plugins?.Health ?? window.Health ?? null;
}

/**
 * Browser fallback: optional Device Motion step estimate from zero; no synthetic BPM.
 */
function initBrowserFallback() {
  _usingFallback = true;
  // No synthetic steps/BPM: agents and feed bind to real data or show "searching" until motion/native fills values.
  _stepsToday = null;
  _heartRateBpm = null;
  _lastRefresh = Date.now();

  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then((perm) => {
        if (perm === 'granted') startDeviceMotionStepEstimator(0);
        else dispatchFallbackReady();
      })
      .catch(() => dispatchFallbackReady());
  } else {
    startDeviceMotionStepEstimator(0);
  }

  /** Simple step estimator from device motion: magnitude peaks above threshold count as activity. */
  function startDeviceMotionStepEstimator(initialSteps) {
    const base = Number.isFinite(Number(initialSteps)) ? Math.max(0, Math.round(Number(initialSteps))) : 0;
    _stepsToday = base;
    let lastMagnitude = 0;
    let peakCount = 0;
    const threshold = 15;
    const cooldownMs = 300;
    let lastStepAt = 0;

    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration || {};
      const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0;
      const mag = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (mag - lastMagnitude > threshold && now - lastStepAt > cooldownMs) {
        peakCount++;
        lastStepAt = now;
        _stepsToday = Math.min(20000, base + Math.round(peakCount * 12)); // ~12 steps per peak from motion baseline
      }
      lastMagnitude = mag;
    };

    try {
      window.addEventListener('devicemotion', onMotion, { passive: true });
      // Dispatch once so UI can show fallback data immediately
      setTimeout(dispatchFallbackReady, 100);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn(LOG_TAG, 'Device Motion not available', err);
      dispatchFallbackReady();
    }
  }

  function dispatchFallbackReady() {
    _lastRefresh = Date.now();
    try {
      window.dispatchEvent(new CustomEvent('healthsync-fallback-ready', { detail: { steps: _stepsToday, bpm: _heartRateBpm } }));
    } catch (_) {}
  }
}

/**
 * Request permissions for Step Count and Heart Rate.
 * Call once on app start or before first read.
 * @returns {Promise<boolean>} true if granted or already granted
 */
export async function requestHealthPermissions() {
  const Health = getHealthPlugin();
  if (!Health) return false;
  if (_permissionsRequested) return true;
  try {
    const method = Health.requestAuthorization ?? Health.requestPermissions;
    if (method) {
      await method.call(Health, {
        read: ['steps', 'heart_rate', 'heartRate'],
        write: []
      });
    }
    _permissionsRequested = true;
    return true;
  } catch (e) {
    console.warn(LOG_TAG, 'Permission request failed', e);
    return false;
  }
}

/**
 * Fetch steps for today (midnight to now) and latest heart rate.
 * Updates internal cache. Call on app open and when Feed becomes visible.
 */
export async function refresh() {
  const Health = getHealthPlugin();
  if (!Health) {
    // Expected in browser: no Capacitor/Health plugin. Uses Device Motion + defaults (no fetch/URL).
    const isLocalhost = typeof window !== 'undefined' && window.location && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
    if (!isLocalhost && typeof console !== 'undefined' && console.log) {
      console.log(LOG_TAG, 'Browser mode: using fallback (steps/BPM from device motion or defaults).');
    }
    initBrowserFallback();
    return;
  }

  _usingFallback = false;

  try {
    await requestHealthPermissions();

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startIso = startOfDay.toISOString();
    const endIso = now.toISOString();

    // Steps today (dataType may be 'steps' or 'step_count' depending on plugin version)
    const stepsResult = await Health.readSamples?.({
      dataType: 'steps',
      startDate: startIso,
      endDate: endIso,
      limit: 500
    });
    const samples = stepsResult?.samples ?? stepsResult?.data ?? [];
    const steps = Array.isArray(samples)
      ? samples.reduce((sum, s) => sum + (Number(s.value) || 0), 0)
      : 0;
    _stepsToday = Number.isFinite(steps) && steps >= 0 ? Math.round(steps) : null;

    // Latest heart rate (last 24h, take most recent)
    const hrResult = await Health.readSamples?.({
      dataType: 'heart_rate',
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: endIso,
      limit: 10
    });
    const hrSamples = hrResult?.samples ?? hrResult?.data ?? [];
    const lastHr = Array.isArray(hrSamples) && hrSamples.length > 0
      ? hrSamples[hrSamples.length - 1]
      : null;
    const bpm = lastHr != null ? (Number(lastHr.value) || null) : null;
    _heartRateBpm = Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : null;

    _lastRefresh = Date.now();
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(LOG_TAG, 'Native refresh failed, using browser fallback.', e);
    }
    _stepsToday = null;
    _heartRateBpm = null;
    initBrowserFallback();
  }
}

/**
 * Steps count for today (from cache). null if no data.
 * @returns {number|null}
 */
export function getStepsToday() {
  return _stepsToday;
}

/**
 * Latest heart rate in BPM (from cache). null if no data.
 * @returns {number|null}
 */
export function getHeartRateBpm() {
  return _heartRateBpm;
}

/**
 * Whether we have any cached health samples (after at least one refresh).
 * Native: steps and/or BPM from Health plugin. Browser: steps may populate from motion; BPM null until native.
 */
export function hasHardwareData() {
  return _stepsToday != null || _heartRateBpm != null;
}

/** True when using browser/Device Motion fallback instead of native health plugin. */
export function isUsingFallback() {
  return _usingFallback;
}

// Expose for Feed and app entry
window.HealthSync = {
  requestHealthPermissions,
  refresh,
  getStepsToday,
  getHeartRateBpm,
  hasHardwareData,
  isUsingFallback
};
