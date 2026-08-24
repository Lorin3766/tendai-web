// LEGACY BLOCKED IN UNIFIED — do not edit logic here.
// See: mobile-app/_audit/ARCHITECTURE_RUNTIME.md
//
// Serron — Legacy Blocklist (Unified Mode)
// @owner: core
// @role: safety
// Blocks legacy duplicate files in unified mode

import { RUN_MODE } from './env-flags.js';

let warned = false;

/**
 * Check if legacy files should be blocked
 * @returns {boolean} true if unified mode and legacy should be blocked
 */
export function shouldBlockLegacy() {
  if (RUN_MODE === 'unified') {
    if (!warned) {
      console.warn('[LEGACY] blocked list active (unified)');
      warned = true;
    }
    return true;
  }
  return false;
}
