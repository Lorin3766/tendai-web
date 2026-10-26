// Serron — Bootstrap Entry Point
// @owner: (entry point - no feature)
// @role: init
// Centralized module initialization. Boot gate: HealthSync first, then inits, then obrium:boot-ready.
// BUILD: 2026-04-02-uac-ghost-debug-cachebust

// Utilities (must load first - no init needed, just imports)
import { profileState } from './state.js';
import './core/shared-context-bus.js';
import { storageManager } from './core/storage.js';
import './features/storage/units.js';
import './features/storage/slider-config.js';
import './features/storage/message-queue.js';
import './features/storage/collapsible.js';

// Core services (export functions, no init needed)
import './features/feed/obrium-assistant.js';
import './features/storage/location-service.js';
import './features/storage/weather-service.js';

// Profile modules
import { initProfileCompleteness } from './features/profile/profile-completeness.js';
import './features/profile/profile-modals.js'; // Auto-initializes via DOMContentLoaded wrapper
import { getNextProfileQuestion } from './features/profile/profile-schema.js';

// Feed modules
import { updateFeedUI } from './features/feed/feed-updater.js';
import './features/feed/ai-feed-advice.js'; // Just exports, no init

// Check-ins (export functions, called on demand)
import './features/feed/day-checkin.js'; // Auto-initializes via IIFE
import './features/feed/today-block.js'; // Today step, local only
import './features/feed/morning-checkin.js'; // Just exports, called from next-step
import './features/feed/evening-checkin.js'; // Just exports, called from next-step

// Unread messages
import { initUnreadTracking } from './features/storage/unread-messages.js';
import { initUnreadMessages } from './features/storage/unread-messages-ui.js';

// Centralized notification badges (FEED + TALK)
import { initNotifications } from './core/notifications.js';

// Unread integration (watchers for new feed cards / talk messages)
import { initUnreadWatchers } from './features/storage/unread-integration.js';

// Services
import './features/services/services-init.js'; // Auto-initializes via IIFE

// Other modules
import { initNextStep } from './features/feed/next-step.js';
import './features/feed/daily-action.js'; // Just exports, no init
import './features/storage/soft-streak.js'; // Just exports, no init
import { initSystemOnboarding, ensureOnboardingFocusAreasInFeed } from './features/settings/system-onboarding.js';
import './features/settings/send-log-to-dev.js'; // Send Log to Dev (Settings)
import { initInferredNotesView } from './features/settings/inferred-notes.js';
import './features/storage/health-sync.js'; // HealthSync: steps + heart rate (native); fallback in browser
import './features/dev/system-vision-debug.js'; // Hidden System Vision debug overlay
import { initDebugPanel } from './features/dev/debug-panel.js'; // Hidden biometric payload injector
import { initAlertsDisplay } from './features/ui/alerts-display.js'; // Biometrics -> critical system alert card
import { initDemoAgentSimulation } from './features/dev/mock-data-generator.js'; // Demo mode → agent simulation
import { initModularAgentsRuntime, tickModularAgents } from './features/human-os/modular-agents-runtime.js';
import { initDataDispatcher } from './features/feed/data-dispatcher.js';
import { getBackendURL } from './features/talk/llm.js';
import { performBootHealthProbe, initBackendRetryButtons } from './core/backend-fetch.js';
import { getSharedContextBus } from './core/shared-context-bus.js';
import { releaseObriumGatekeeper } from './core/gatekeeper.js';
import { IS_DEV, IS_VERBOSE_BOOT_LOGS } from './env-flags.js';

/**
 * Async init: Gate 1 — await HealthSync.refresh() before any other inits.
 * Then run all core inits once, set OBRIUM_BOOT_READY and dispatch obrium:boot-ready.
 */
async function initModules() {
  // StorageManager: load Master Record, migrate legacy data if needed
  storageManager.load();
  if (typeof window !== 'undefined') window.__storageManager = storageManager;
  try {
    storageManager.syncFromProfileIfStale(profileState.get());
  } catch (_) {}
  initInferredNotesView();

  await performBootHealthProbe(() => `${getBackendURL()}/api/health`);
  initBackendRetryButtons();

  // Gate 1: HealthSync must complete so Feed has data on first paint
  if (window.HealthSync && typeof window.HealthSync.refresh === 'function') {
    try {
      await window.HealthSync.refresh();
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[BOOT] HealthSync.refresh failed (non-blocking):', err);
      }
    }
  }

  // System onboarding (first launch only)
  if (typeof initSystemOnboarding === 'function') {
    initSystemOnboarding();
  }

  // Profile
  if (typeof initProfileCompleteness === 'function') {
    initProfileCompleteness();
  }

  // Notifications first (single source for badges; DOM reset clears legacy)
  if (typeof initNotifications === 'function') {
    initNotifications();
  }
  // Unread
  if (typeof initUnreadTracking === 'function') {
    initUnreadTracking();
  }
  if (typeof initUnreadMessages === 'function') {
    initUnreadMessages();
  }
  if (typeof initUnreadWatchers === 'function') {
    initUnreadWatchers();
  }

  // Next Step
  if (typeof initNextStep === 'function') {
    initNextStep();
  }

  // Demo simulation hooks for ledger + talk memory
  if (typeof initDebugPanel === 'function') {
    initDebugPanel();
  }
  if (typeof initAlertsDisplay === 'function') {
    initAlertsDisplay();
  }

  if (typeof initDemoAgentSimulation === 'function') {
    initDemoAgentSimulation();
  }

  initModularAgentsRuntime();
  initDataDispatcher();

  try {
    await tickModularAgents();
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[BOOT] tickModularAgents (gate) failed (non-blocking):', err);
    }
  }

  try {
    const bus = getSharedContextBus();
    void bus.snapshot;
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[BOOT] sharedContextBus snapshot (gate) failed (non-blocking):', err);
    }
  }

  window.OBRIUM_BOOT_READY = true;
  try {
    window.dispatchEvent(new CustomEvent('obrium:boot-ready'));
  } catch (_) {}
  if (IS_VERBOSE_BOOT_LOGS && typeof console !== 'undefined' && console.log) {
    console.log('[BOOT] OBRIUM_BOOT_READY set, obrium:boot-ready dispatched');
  }

  try {
    await updateFeedUI();
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[BOOT] first updateFeedUI (gate) failed (non-blocking):', err);
    }
  }

  // After Feed is ready: heal empty Feed if onboarding Focus Areas were saved without cards
  try {
    ensureOnboardingFocusAreasInFeed();
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[BOOT] ensureOnboardingFocusAreasInFeed failed (non-blocking):', err);
    }
  }

  releaseObriumGatekeeper();

  if (IS_DEV && typeof window !== 'undefined') {
    window.getNextProfileQuestion = getNextProfileQuestion;
  }
}

// Initialize when DOM is ready (once)
if (window.__BOOT_INIT__) {
  // Already initialized (e.g. hot reload)
} else {
  window.__BOOT_INIT__ = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initModules();
    });
  } else {
    initModules();
  }
}

// BUILD stamp
if (IS_VERBOSE_BOOT_LOGS) console.log('[BOOT] BUILD: 2026-04-02-system-shield-gatekeeper');
