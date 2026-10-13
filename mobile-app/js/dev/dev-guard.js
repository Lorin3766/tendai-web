// Serron — DEV Guard Module
// @owner: dev
// @role: safety
// Self-testing and guardrails for unified mode in development

// Build version for cache detection
const DEV_GUARD_VERSION = '2026-01-24-v2';

const IS_DEV = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location?.hostname || '');

const initRegistry = new Set();
let feedClickTestBound = false;
let panicCardShown = false; // Latch to show panic card only once

/**
 * Guard against double initialization
 * @param {string} key - Unique identifier for the init (e.g., 'Feed.init', 'Plan.init')
 */
export function guardOnce(key) {
  if (!IS_DEV) return;
  if (initRegistry.has(key)) {
    const msg = `[DEV GUARD] Double init detected: ${key}`;
    console.error(msg, new Error().stack);
    throw new Error(msg);
  }
  initRegistry.add(key);
  console.log(`[DEV GUARD] init registry: ${key} OK`);
}

/**
 * Test FEED click pipeline after render
 */
export function testFeedClicks() {
  if (!IS_DEV || feedClickTestBound) return;
  feedClickTestBound = true;

  setTimeout(() => {
    const feedView = document.getElementById('feed-view');
    if (!feedView) {
      console.warn('[DEV SELFTEST] feed-view not found');
      return;
    }

    const list = feedView.querySelector('#feedCardList') || feedView.querySelector('.feed-card-list') || feedView;
    const buttons = list.querySelectorAll('button[data-action]');
    const allButtons = list.querySelectorAll('button');

    console.log(`[DEV SELFTEST] feed buttons: ${buttons.length} with data-action, ${allButtons.length} total`);

    if (buttons.length === 0 && allButtons.length > 0) {
      console.warn('[DEV SELFTEST] ⚠️ Buttons exist but none have data-action', {
        totalButtons: allButtons.length,
        sample: Array.from(allButtons).slice(0, 3).map(b => ({
          text: b.textContent?.trim(),
          hasAction: b.hasAttribute('data-action'),
          html: b.outerHTML.slice(0, 100)
        }))
      });
    }

    // Test capture listener (one-time, DEV only)
    document.addEventListener('click', function testListener(e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('[id*="card"]') || btn.closest('.card-checkin') || btn.closest('.card-weather');
      console.log('[DEV SELFTEST] click captured', {
        action: btn.dataset.action,
        cardId: card?.id || card?.className || 'unknown',
        target: e.target.tagName
      });
      // Remove after first successful capture
      document.removeEventListener('click', testListener, true);
    }, true);
  }, 500);
}

/**
 * Assert that feed-starter did not run in unified mode
 * Safe version: no throw, only console.error + panic card
 */
export function assertNoFeedStarter() {
  if (!IS_DEV) return;
  if (window.__obriumRunMode !== 'unified') return;

  // Check if feed-starter ran (fact-based check, not flag-based)
  let violation = false;
  let violationMsg = '';

  // Check 1: feed-starter ran flag
  if (window.__feedStarterRan === true) {
    violation = true;
    violationMsg = '[DEV GUARD] feed-starter ran in unified mode (should not)';
  }

  // Check 2: DOM markers (feed-starter must never touch DOM in unified)
  const feedView = document.getElementById('feed-view');
  if (feedView && !violation) {
    const markers = feedView.querySelectorAll('[data-rendered-by="feed-starter"]');
    if (markers.length > 0) {
      violation = true;
      violationMsg = `[DEV GUARD] feed-starter DOM markers found in unified (${markers.length} markers)`;
    }
  }

  // If violation found: log error and show panic card (once)
  if (violation) {
    console.error(violationMsg);
    if (!panicCardShown && typeof window !== 'undefined' && window.showPanicCard) {
      panicCardShown = true;
      window.showPanicCard('feed-starter-detected');
    }
  }
}

/**
 * Initialize DEV guard system
 */
export function initDevGuard() {
  if (!IS_DEV) return;
  
  // Prevent double initialization
  if (typeof window !== 'undefined' && window.__devGuardInitialized) {
    console.warn('[DEV GUARD] Already initialized, skipping');
    return;
  }
  
  console.log(`[DEV GUARD] initialized build=${DEV_GUARD_VERSION} guard=v2`);
  guardOnce('DevGuard.init');
  
  if (typeof window !== 'undefined') {
    window.__devGuardInitialized = true;
  }

  // Export to window for app-unified.js access
  if (typeof window !== 'undefined') {
    window.guardOnce = guardOnce;
    window.testFeedClicks = testFeedClicks;
    window.assertNoFeedStarter = assertNoFeedStarter;
  }

  // Multiple async checks for feed-starter (catch delayed execution)
  setTimeout(() => assertNoFeedStarter(), 0);
  setTimeout(() => assertNoFeedStarter(), 250);
  setTimeout(() => assertNoFeedStarter(), 1000);
  
  // Periodic check for feed-starter (every 2 seconds, first 10 seconds)
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    if (checkCount > 5) {
      clearInterval(checkInterval);
      return;
    }
    assertNoFeedStarter();
  }, 2000);

  // Test feed clicks after initial render
  setTimeout(() => {
    testFeedClicks();
  }, 1000);
}

// NOTE: initDevGuard is called explicitly from app-entry in DEV
