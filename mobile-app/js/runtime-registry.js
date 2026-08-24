// Serron — Runtime Feature Registry (single source of truth)
// Central place to declare and audit which features are loaded/initialized.

const globalKey = '__serronRuntime__';

function ensureRuntime() {
  if (!window[globalKey]) {
    window[globalKey] = {
      features: {},
      logSummary() {
        const items = Object.entries(this.features).map(([name, data]) => ({
          name,
          status: data.status,
          meta: data.meta || {}
        }));
        console.table(items);
      }
    };
  }
  return window[globalKey];
}

export function registerFeature(name, meta = {}) {
  const runtime = ensureRuntime();
  if (!runtime.features[name]) {
    runtime.features[name] = {
      status: 'registered',
      meta,
      initialized: false
    };
  }
  return runtime.features[name];
}

export function markFeatureInitialized(name, meta = {}) {
  const runtime = ensureRuntime();
  if (!runtime.features[name]) {
    runtime.features[name] = { status: 'registered', meta, initialized: false };
  }
  runtime.features[name].status = 'initialized';
  runtime.features[name].initialized = true;
  runtime.features[name].meta = { ...runtime.features[name].meta, ...meta };
  return runtime.features[name];
}

export function runtimeSummary() {
  ensureRuntime().logSummary();
}


