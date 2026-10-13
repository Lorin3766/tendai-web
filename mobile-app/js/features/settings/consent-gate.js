// @owner: settings
// @role: utils
// Third-party lookups (ipapi.co, Nominatim, Open-Meteo) must not run before the user has seen the AI consent step.

const AI_CONSENT_KEY = 'tendai_ai_consent_v1';
const ONBOARDING_KEY = 'tendai_system_onboarding_v1';

/**
 * True once the consent step was acknowledged, or for users who finished onboarding
 * before the consent step existed (their behaviour must not change).
 */
export function hasThirdPartyLookupConsent() {
  try {
    return !!localStorage.getItem(AI_CONSENT_KEY) || localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch (_) {
    return false;
  }
}
