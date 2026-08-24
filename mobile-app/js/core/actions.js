// Serron — Action Types (Constants)
// @owner: core
// @role: action-definitions
// Centralized action type definitions for type safety and discoverability

// View actions
export const VIEW_SWITCH = 'VIEW_SWITCH';
export const VIEW_BACK = 'VIEW_BACK';

// Plan actions
export const PLAN_START = 'PLAN_START';
export const PLAN_APPLY = 'PLAN_APPLY';
export const PLAN_PAUSE = 'PLAN_PAUSE';
export const PLAN_RESUME = 'PLAN_RESUME';
export const PLAN_DONE = 'PLAN_DONE';
export const PLAN_EASIER = 'PLAN_EASIER';
export const PLAN_DISMISS = 'PLAN_DISMISS';

// Feed actions
export const FEED_UPDATE_TIME = 'FEED_UPDATE_TIME';
export const FEED_CARD_DISMISS = 'FEED_CARD_DISMISS';
export const FEED_CARD_SHOW = 'FEED_CARD_SHOW';
export const FEED_START_PLAN = 'FEED_START_PLAN';
export const FEED_CHECKIN_SKIP = 'FEED_CHECKIN_SKIP';
export const FEED_WEATHER_TOGGLE_DETAILS = 'FEED_WEATHER_TOGGLE_DETAILS';

// Check-in actions
export const CHECKIN_START = 'CHECKIN_START';
export const CHECKIN_SKIP = 'CHECKIN_SKIP';
export const CHECKIN_COMPLETE = 'CHECKIN_COMPLETE';

// Talk actions
export const TALK_SEND_MESSAGE = 'TALK_SEND_MESSAGE';
export const TALK_RECEIVE_MESSAGE = 'TALK_RECEIVE_MESSAGE';
export const TALK_MARK_READ = 'TALK_MARK_READ';
export const TALK_MODE_SET = 'TALK_MODE_SET';
export const PLAN_STEP_SET = 'PLAN_STEP_SET';
export const TALK_SEED_RECONCILE_REQUEST = 'TALK_SEED_RECONCILE_REQUEST';

// UI actions
export const UI_PLAN_MANAGE_OPEN = 'UI_PLAN_MANAGE_OPEN';
export const UI_PLAN_MANAGE_CLOSE = 'UI_PLAN_MANAGE_CLOSE';
export const UI_CHECKIN_OVERLAY_OPEN = 'UI_CHECKIN_OVERLAY_OPEN';
export const UI_CHECKIN_OVERLAY_CLOSE = 'UI_CHECKIN_OVERLAY_CLOSE';

// Action creators (helpers)
export function createAction(type, payload = {}, reason = 'user-action') {
  return { type, payload, reason };
}
