/**
 * Task 9.1 item 3: automatic location must not calibrate Skin & Environment.
 * Usage: node scripts/verify-task9-1-skin.mjs
 */
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const { isSignalAnswered, stageFloorFromSignals, nextFocusAreaSignal } = await import(
  '../mobile-app/js/features/profile/focus-area-signals.js'
);
const signal = { section: 'location', field: 'location', echo: 'generic' };
const gps = { location: { type: 'geo', city: 'Boston', coords: { lat: 42.3, lon: -71.1 } } };
const manual = { location: { type: 'manual', city: 'Boston' } };
let failed = false;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed = true;
};
if (isSignalAnswered(gps, signal)) fail('GPS location counted as a Skin signal');
if (stageFloorFromSignals(gps, 'skin') !== 0) fail('GPS location raised the Skin stage');
if (!isSignalAnswered(manual, signal)) fail('typed city did not count');
if (stageFloorFromSignals(manual, 'skin') !== 1) fail('typed city did not floor Skin at stage 1');
localStorage.getItem = (key) => (key === 'tendai_focus_areas_v1' ? JSON.stringify(['skin']) : null);
if (nextFocusAreaSignal({}) != null) fail('Skin produced a Talk question');
if (failed) process.exit(1);
console.log('TASK9_1_SKIN_OK');
