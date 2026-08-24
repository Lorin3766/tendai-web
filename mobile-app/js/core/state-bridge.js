// Serron — State Bridge
// @owner: core
// @role: state
//
// ROLES:
// - app-state.js = PRIMARY store for UI/session (activeView, plan, talk mode, checkins, demo).
// - state.js = Persisted data (profile, day, talk history, feed, System Integrity) in localStorage.
//
// This bridge re-exports the persisted state (state.js) so components can import from one place.
// New code should use: getState/subscribe/updateState from app-state.js for UI/session;
// profileState, dayState, talkState, feedState, systemIntegrityState from here (or state.js).
// Do not write the same data to both stores to avoid conflicting state.

export {
  profileState,
  dayState,
  talkState,
  feedState,
  systemIntegrityState,
  SYSTEM_INTEGRITY_MAX,
  // Deprecated aliases:
  integrityState,
  STATE_KEYS,
  INTEGRITY_MAX
} from '../state.js';
