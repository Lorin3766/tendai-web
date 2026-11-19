/**
 * Inventory of Obrium localStorage keys (device-only).
 * New keys must be added here. "Delete all local data" uses localStorage.clear()
 * and also wipes keys starting with "tendai".
 * @owner: core
 */

export const LOCAL_STORAGE_INVENTORY = [
  'tendai-profile-state',
  'tendai_chat_history',
  'tendai_system_onboarding_v1',
  'tendai_welcome_accepted',
  'tendai_quick_setup_v1',
  'tendai_ai_consent_v1',
  'tendai_focus_areas_v1',
  'tendai_data_sent_log_v1',
  'tendai_followups_v1',
  'tendai_followup_muted_areas_v1',
  'tendai_local_metrics_v1',
  'tendai_checkin_history_v1',
  'tendai_today_steps_v1',
  'tendai_library_shown_v1',
  'tendai_contact_frequency_v1',
  'tendai_user_memory_v1',
  'tendai_user_agents',
  'tendai_talk_opening_shown_v1',
  'tendai_talk_intro_ever_v1',
  'tendai_talk_last_viewed',
  'tendai_active_advisory',
  'tendai-notifications',
  'common_ledger',
];

export function isInventoriedLocalStorageKey(key) {
  return LOCAL_STORAGE_INVENTORY.includes(String(key || ''));
}
