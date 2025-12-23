// TendAI — Bootstrap Entry Point
// @owner: (entry point - no feature)
// @role: init
// Centralized module initialization
// BUILD: 2025-12-21-bootstrap-v1

// Utilities (must load first - no init needed, just imports)
import './state.js';
import './features/storage/units.js';
import './features/storage/slider-config.js';
import './features/storage/message-queue.js';
import './features/storage/collapsible.js';

// Core services (export functions, no init needed)
import './features/feed/tendai-assistant.js';
import './features/storage/location-service.js';
import './features/storage/weather-service.js';

// Profile modules
import { initProfileCompleteness } from './features/profile/profile-completeness.js';
import './features/profile/profile-modals.js'; // Auto-initializes via DOMContentLoaded wrapper
import './features/profile/profile-schema.js'; // Just exports, no init

// Feed modules
import './features/feed/feed-updater.js'; // Auto-initializes via DOMContentLoaded wrapper
import './features/feed/ai-feed-advice.js'; // Just exports, no init

// Check-ins (export functions, called on demand)
import './features/feed/day-checkin.js'; // Auto-initializes via IIFE
import './features/feed/morning-checkin.js'; // Just exports, called from next-step
import './features/feed/evening-checkin.js'; // Just exports, called from next-step

// Unread messages
import { initUnreadTracking } from './features/storage/unread-messages.js';
import { initUnreadMessages } from './features/storage/unread-messages-ui.js';

// Services
import './features/services/services-init.js'; // Auto-initializes via IIFE

// Other modules
import { initNextStep } from './features/feed/next-step.js';
import './features/feed/daily-action.js'; // Just exports, no init
import './features/storage/soft-streak.js'; // Just exports, no init

// Initialize modules that require explicit init
function initModules() {
  // Profile
  if (typeof initProfileCompleteness === 'function') {
    initProfileCompleteness();
  }

  // Unread
  if (typeof initUnreadTracking === 'function') {
    initUnreadTracking();
  }
  if (typeof initUnreadMessages === 'function') {
    initUnreadMessages();
  }

  // Next Step
  if (typeof initNextStep === 'function') {
    initNextStep();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initModules);
} else {
  initModules();
}

// BUILD stamp
console.log('[BOOT] BUILD: 2025-12-21-bootstrap-v1');

