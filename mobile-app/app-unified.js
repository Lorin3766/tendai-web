// Serron — Unified App (Mobile & Desktop)
import { TalkComponent } from './components/talk.js';
import { getState, subscribe } from './js/core/app-state.js';
import { IS_VERBOSE_BOOT_LOGS } from './js/env-flags.js';
import { profileState } from './js/state.js';
import { OPEN_TALK_KEY, GREETING_KEY } from './js/features/settings/system-onboarding.js';
import { startPlanGenerationFlow, openLabsReportModal, startSecureMedicalChannel } from './js/features/talk/ecosystem-bridge.js';

(function () {
  'use strict';

  if (IS_VERBOSE_BOOT_LOGS) {
    console.log('[BOOT][UNIFIED] start (waiting for serron:boot-ready)');
    console.log('[RUN MODE] unified');
    const _bootDate = new Date();
    console.log('[BOOT][UNIFIED] local', _bootDate.toISOString(), 'timezone=' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'));
  }

  // Detect mobile layout
  const isMobile = window.matchMedia('(max-width: 899px)').matches;
  if (IS_VERBOSE_BOOT_LOGS) {
    console.log('[RUN MODE] mobile layout:', isMobile ? 'enabled (max-width: 899px)' : 'disabled (desktop)');
  }

  // Clean up any blocking classes from old calendar or modals (after hot reload)
  // Remove classes that block UI interactions
  const blockingClasses = ['calendar-open', 'modal-open', 'overlay-open', 'checkin-overlay-open'];
  blockingClasses.forEach(className => {
    if (document.body.classList.contains(className)) {
      document.body.classList.remove(className);
      if (IS_VERBOSE_BOOT_LOGS) console.log(`[BOOT][UNIFIED] Removed blocking class: ${className}`);
    }
  });

  // Remove any old calendar DOM elements if they exist (safety check)
  const oldCalendarElements = [
    document.getElementById('calendarOverlay'),
    document.getElementById('calendarModal'),
    document.querySelector('.calendar-overlay'),
    document.querySelector('.calendar-modal')
  ];
  oldCalendarElements.forEach(el => {
    if (el) {
      el.remove();
      if (IS_VERBOSE_BOOT_LOGS) console.log('[BOOT][UNIFIED] Removed old calendar element:', el.id || el.className);
    }
  });

  // DOM refs (used after boot-ready)
  const conversationCard = document.getElementById('conversationCard');
  const feedView = document.getElementById('feed-view');
  const talkView = document.getElementById('talk-view');
  const servicesView = document.getElementById('services-view');
  const profileView = document.getElementById('profile-view');
  const centerTabs = document.getElementById('centerTabs');
  const bottomNav = document.getElementById('bottomNav');
  const centerBody = document.getElementById('centerBody');
  const centerFeedTalkSlider = document.getElementById('centerFeedTalkSlider');

  let talkComponent = null;
  let currentView = 'feed';
  const HISTORY_SYNC_LAST_DATE_KEY = 'tendai_last_sync_date';
  const HISTORY_SYNC_PLACEHOLDERS_KEY = 'tendai_sync_placeholders_v1';

  function toDateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fromDateKey(dateKey) {
    return new Date(`${dateKey}T00:00:00`);
  }

  function dayDiff(aDateKey, bDateKey) {
    const a = fromDateKey(aDateKey);
    const b = fromDateKey(bDateKey);
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / 86400000);
  }

  /**
   * Detect history gaps so inactivity does not mark user as drifting.
   * Missing days stay empty: nothing may be written on the user's behalf.
   */
  function syncHistory() {
    // Earlier builds wrote invented "baseline protocol" rows for missing days; purge them.
    try { localStorage.removeItem(HISTORY_SYNC_PLACEHOLDERS_KEY); } catch (_) {}
    try {
      const storage = window.__storageManager;
      const log = storage && typeof storage.get === 'function' ? storage.get('Signals.eventLog') : null;
      if (Array.isArray(log) && log.some((e) => e && e.type === 'HISTORY_SYNC_PLACEHOLDER')) {
        storage.updateRecord('Signals.eventLog', log.filter((e) => !(e && e.type === 'HISTORY_SYNC_PLACEHOLDER')));
      }
    } catch (_) {}

    const todayKey = toDateKey();
    let lastKey = null;
    try {
      lastKey = localStorage.getItem(HISTORY_SYNC_LAST_DATE_KEY);
    } catch (_) {}

    // First run or invalid date -> just establish baseline and continue
    if (!lastKey || !/^\d{4}-\d{2}-\d{2}$/.test(lastKey)) {
      try { localStorage.setItem(HISTORY_SYNC_LAST_DATE_KEY, todayKey); } catch (_) {}
      window.__serronHistorySync = { isSyncing: false, gapDays: 0, missingDateKeys: [] };
      return;
    }

    const diffDays = dayDiff(lastKey, todayKey);
    const missingDays = Math.max(0, diffDays - 1);
    if (missingDays <= 0) {
      try { localStorage.setItem(HISTORY_SYNC_LAST_DATE_KEY, todayKey); } catch (_) {}
      window.__serronHistorySync = { isSyncing: false, gapDays: 0, missingDateKeys: [] };
      return;
    }

    const missingDateKeys = [];
    for (let i = 1; i <= missingDays; i++) {
      const d = fromDateKey(lastKey);
      d.setDate(d.getDate() + i);
      missingDateKeys.push(toDateKey(d));
    }

    window.__serronHistorySync = {
      isSyncing: true,
      gapDays: missingDays,
      missingDateKeys
    };
    try { localStorage.setItem(HISTORY_SYNC_LAST_DATE_KEY, todayKey); } catch (_) {}
  }

  /**
   * Protocol Engine: ensure profile.protocols exists in localStorage (tendai-profile-state).
   * Each item: { id, label, time, active: true }
   */
  function ensureProfileProtocols() {
    try {
      const profile = profileState.get();
      let changed = false;
      if (!Array.isArray(profile.protocols)) {
        profile.protocols = [];
        changed = true;
      } else {
        const normalized = profile.protocols
          .map((row, i) => {
            if (!row || typeof row !== 'object') return null;
            const id = String(row.id || `protocol-${i}`).trim() || `protocol-${i}`;
            const label = String(row.label || 'Routine').trim() || 'Routine';
            const time = String(row.time || '—').trim() || '—';
            const active = row.active !== false;
            return { id, label, time, active };
          })
          .filter(Boolean);
        if (normalized.length !== profile.protocols.length) changed = true;
        else {
          for (let i = 0; i < normalized.length; i++) {
            const a = profile.protocols[i];
            const b = normalized[i];
            if (!a || a.id !== b.id || a.label !== b.label || a.time !== b.time || a.active !== b.active) {
              changed = true;
              break;
            }
          }
        }
        if (changed) profile.protocols = normalized;
      }
      if (changed) profileState.save(profile);
    } catch (_) {}
  }

  // TALK component and tabs are initialized in runAfterBootReady() on serron:boot-ready

  /**
   * Render plan cards in FEED based on plan state.
   * FEED is read-only: no plan CTAs, no "Create my plan", no Start/Manage/Open/Done.
   * Plan creation lives in Programs (Services).
   */
  function renderFeedPlanCards() {
    try {
      const feedRoot = document.getElementById('feed-view');
      if (!feedRoot) return;

      // Hide pinned plans container in FEED — no plan cards or CTAs in feed
      const pinnedContainer = feedRoot.querySelector('#pinnedPlansCard');
      if (pinnedContainer) {
        pinnedContainer.innerHTML = '';
        pinnedContainer.style.display = 'none';
      }

      // Remove any legacy create-plan card that might exist outside container
      const oldCreateCard = feedRoot.querySelector('#createPlanCard[data-card-id="create-plan"]');
      if (oldCreateCard) oldCreateCard.remove();
    } catch (error) {
      console.error('[FEED][PLAN] Failed to render plan cards:', error);
    }
  }

  // Subscribe to plan state changes (once)
  if (!window.__serronPlanCardsSubscribed) {
    try {
      const unsubscribe = subscribe((newState, oldState, patch) => {
        // Only react to plan state changes
        if (patch.plan) {
          const planChanged = patch.plan.status !== undefined || patch.plan.data !== undefined;
          if (planChanged && currentView === 'feed') {
            setTimeout(() => {
              renderFeedPlanCards();
            }, 100);
          }
        }
      });
      window.__serronPlanCardsSubscribed = true;
      window.__serronPlanCardsUnsubscribe = unsubscribe;
    } catch (error) {
      console.warn('[FEED][PLAN] Failed to subscribe to plan state:', error);
    }
  }

  // Programs: "Create my plan" — switch to TALK and start plan generation flow (analyzing + strategy buttons + plan)
  if (!document.body.dataset.tendaiCreatePlanDelegate) {
    document.body.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('[data-service="mini-program"][data-program-id="create-my-plan"]');
      if (!btn) return;
      e.preventDefault();
      addGoldPulseToServiceRow(btn);
      if (typeof window.switchView === 'function') {
        window.switchView('talk');
      }
      setTimeout(() => {
        if (talkComponent) startPlanGenerationFlow(talkComponent);
      }, 200);
    });
    document.body.dataset.tendaiCreatePlanDelegate = '1';
  }

  // Labs: open report modal with chart and "Sync with AI"
  if (!document.body.dataset.tendaiLabsDelegate) {
    document.body.addEventListener('click', (e) => {
      const row = e.target && e.target.closest && e.target.closest('[data-service="lab"]');
      if (!row) return;
      e.preventDefault();
      const labId = row.getAttribute('data-lab-id') || 'blood-test';
      const labName = row.querySelector('.service-row-name')?.textContent || labId;
      addGoldPulseToServiceRow(row);
      openLabsReportModal(labId, labName);
    });
    document.body.dataset.tendaiLabsDelegate = '1';
  }

  // Online Doctor "Chat with doctor": switch to TALK + Secure Medical Channel
  if (!document.body.dataset.tendaiDoctorChatDelegate) {
    document.body.addEventListener('click', (e) => {
      const row = e.target && e.target.closest && e.target.closest('[data-service="online-doctor"][data-doctor-id="chat"]');
      if (!row) return;
      e.preventDefault();
      addGoldPulseToServiceRow(row);
      if (typeof window.switchView === 'function') window.switchView('talk');
      setTimeout(() => {
        if (talkComponent) startSecureMedicalChannel(talkComponent);
      }, 200);
    });
    document.body.dataset.tendaiDoctorChatDelegate = '1';
  }

  function addGoldPulseToServiceRow(element) {
    const row = element.classList && element.classList.contains('service-row') ? element : element.closest('.service-row');
    if (!row) return;
    row.classList.add('ecosystem-pulse');
    setTimeout(() => row.classList.remove('ecosystem-pulse'), 1200);
  }

  // Enable location: delegated handler (catches data-action="enable-location" even when element is created after render)
  if (!document.body.dataset.tendaiEnableLocationDelegate) {
    document.body.dataset.tendaiEnableLocationDelegate = '1';
    document.body.addEventListener('click', (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-action="enable-location"]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.requestGeolocation !== 'function') return;
      window.requestGeolocation()
        .then((loc) => {
          if (loc && loc.coords) {
            if (typeof window.invalidateWeatherCache === 'function') {
              window.invalidateWeatherCache();
            }
            if (typeof window.refreshWeatherCard === 'function') {
              window.refreshWeatherCard();
            }
          }
        })
        .catch(() => {
          if (typeof window.setWeatherLocationDenied === 'function') {
            window.setWeatherLocationDenied();
          }
        });
    });
    document.body.addEventListener('keydown', (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-action="enable-location"]');
      if (!el || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.requestGeolocation !== 'function') return;
      window.requestGeolocation()
        .then((loc) => {
          if (loc && loc.coords) {
            if (typeof window.invalidateWeatherCache === 'function') {
              window.invalidateWeatherCache();
            }
            if (typeof window.refreshWeatherCard === 'function') {
              window.refreshWeatherCard();
            }
          }
        })
        .catch(() => {
          if (typeof window.setWeatherLocationDenied === 'function') {
            window.setWeatherLocationDenied();
          }
        });
    });
  }

  // Switch between FEED, TALK, SERVICES, and PROFILE views
  function switchView(view) {
    if (view === currentView) return;

    const previousView = currentView;
    currentView = view;

    // Save active tab to localStorage (only for feed/talk in desktop)
    if (view === 'feed' || view === 'talk') {
      try {
        localStorage.setItem('tendai_active_tab', view);
      } catch (error) {
        // Could not save active tab
      }
    }

    // Update desktop tabs (only for feed/talk)
    if (centerTabs) {
      const tabFeed = document.getElementById('tab-feed');
      const tabTalk = document.getElementById('tab-talk');
      
      if (view === 'feed') {
        if (tabFeed) {
          tabFeed.classList.add('is-active');
          tabFeed.setAttribute('aria-selected', 'true');
        }
        if (tabTalk) {
          tabTalk.classList.remove('is-active');
          tabTalk.setAttribute('aria-selected', 'false');
        }
      } else if (view === 'talk') {
        if (tabFeed) {
          tabFeed.classList.remove('is-active');
          tabFeed.setAttribute('aria-selected', 'false');
        }
        if (tabTalk) {
          tabTalk.classList.add('is-active');
          tabTalk.setAttribute('aria-selected', 'true');
        }
      }
    }

    // Keep mobile bottom nav in sync (avoids stale gold on Feed when viewing Talk/Services/Profile)
    if (bottomNav) {
      bottomNav.querySelectorAll('.nav-item').forEach((nav) => {
        const screen = nav.getAttribute('data-screen');
        const isActive = screen === view;
        nav.classList.toggle('active', isActive);
        if (isActive) nav.setAttribute('aria-current', 'page');
        else nav.removeAttribute('aria-current');
      });
    }

    // Close calendar panel when switching views (predictable behavior)
    // Use new unified calendar API only
    try {
      if (window.closeCalendar) {
        window.closeCalendar();
      }
    } catch (error) {
      // Calendar close failed - not critical
    }

    // Slider: show/hide and set view class for FEED/TALK sliding transition
    if (centerBody) centerBody.classList.remove('view-feed', 'view-talk');
    if (centerFeedTalkSlider) centerFeedTalkSlider.classList.add('hidden');
    if (feedView) feedView.classList.add('hidden');
    if (talkView) talkView.classList.add('hidden');
    if (servicesView) servicesView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');

    // Show selected view (feed/talk use slider + translate3d; services/profile use .hidden toggle)
    if (view === 'feed' && feedView) {
      if (centerFeedTalkSlider) centerFeedTalkSlider.classList.remove('hidden');
      feedView.classList.remove('hidden');
      talkView.classList.remove('hidden');
      if (centerBody) centerBody.classList.add('view-feed');
      if (talkView) talkView.setAttribute('aria-hidden', 'true');
      if (feedView) feedView.removeAttribute('aria-hidden');

      // Entry animation: run once on first load when feed is shown
      if (feedView && !window.__serronEntryReadyDone) {
        window.__serronEntryReadyDone = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => feedView.classList.add('entry-ready'));
        });
      }

      // Record app visit (for silent mode tracking)
      if (window.recordAppVisit) {
        window.recordAppVisit();
      }
      
      // Check calendar reminders
      if (window.checkAndGenerateReminders) {
        window.checkAndGenerateReminders();
      }
      
      // Check for day change and update Next Step
      if (window.updateNextStepDisplay) {
        window.updateNextStepDisplay();
      }
      
      // Render plan cards from state
      setTimeout(() => {
        renderFeedPlanCards();
      }, 200);
      
      // Mark all feed messages as read when opening Feed
      if (window.markAllFeedAsRead) {
        window.markAllFeedAsRead();
      }
      // Clear notification badge and sync unread items (centralized notifications)
      if (typeof window.clearNotifications === 'function') {
        window.clearNotifications('feed');
      }
      if (typeof window.markAllAsRead === 'function') {
        window.markAllAsRead('feed');
      }
      
      // Display unread messages (limited to 2, or last one if more)
      if (window.displayUnreadFeedMessages) {
        setTimeout(() => {
          window.displayUnreadFeedMessages();
        }, 50);
      }
      
      // Check if day changed (will be handled by next-step.js checkDayChange)
      // We'll pass a flag to morning check-in
      let isDayChanged = false;
      // This will be determined by checking if morning check-in should show for new day
      // For now, we'll let morning check-in logic handle it
      
      // Initialize morning check-in when switching to Feed
      // Show if: day changed OR first visit today
      if (window.initMorningCheckIn) {
        setTimeout(() => {
          window.initMorningCheckIn(false); // Will check internally if day changed
        }, 100);
      }
      
      // Pick daily action if appropriate
      // Show if: after morning check-in OR (first feed visit AND morning was done)
      if (window.pickDailyAction) {
        setTimeout(() => {
          const action = window.pickDailyAction('first_feed_visit');
          if (action && window.updateDailyActionUI) {
            window.updateDailyActionUI();
          }
        }, 120);
      }
      
      // Update daily action UI
      if (window.updateDailyActionUI) {
        setTimeout(() => {
          window.updateDailyActionUI();
        }, 75);
      }
      
      // Initialize evening check-in when switching to Feed
      if (window.initEveningCheckIn) {
        setTimeout(() => {
          window.initEveningCheckIn();
        }, 150);
      }
      
      // Сбрасываем кэш и обновляем AI-советы при открытии Feed
      if (window.resetAIAdviceCache) {
        window.resetAIAdviceCache();
      }
      if (window.updateFeedWithAIAdvice) {
        setTimeout(() => {
          window.updateFeedWithAIAdvice();
        }, 100);
      }
    } else if (view === 'talk' && talkView) {
      if (centerFeedTalkSlider) centerFeedTalkSlider.classList.remove('hidden');
      feedView.classList.remove('hidden');
      talkView.classList.remove('hidden');
      if (centerBody) centerBody.classList.add('view-talk');
      if (feedView) feedView.setAttribute('aria-hidden', 'true');
      if (talkView) talkView.removeAttribute('aria-hidden');
      // Mark all talk messages as read when opening Talk
      if (window.markAllTalkAsRead) {
        window.markAllTalkAsRead();
      }
      // Clear notification badge and sync unread items (centralized notifications)
      if (typeof window.clearNotifications === 'function') {
        window.clearNotifications('talk');
      }
      if (typeof window.markAllAsRead === 'function') {
        window.markAllAsRead('talk');
      }
      
      // Display unread messages
      if (window.displayUnreadTalkMessages) {
        setTimeout(() => {
          window.displayUnreadTalkMessages();
        }, 50);
      }
      
      // Scroll TALK to bottom when switching
      if (talkComponent && talkComponent.conversationArea) {
        requestAnimationFrame(() => {
          talkComponent.scrollToBottom();
          setTimeout(() => talkComponent.scrollToBottom(), 50);
          setTimeout(() => talkComponent.scrollToBottom(), 150);
        });
        if (typeof window.showDriftRecoveryPromptInTalk === 'function') {
          window.showDriftRecoveryPromptInTalk(talkComponent.conversationArea);
        }
        if (typeof talkComponent.onTalkOpened === 'function') {
          void talkComponent.onTalkOpened();
        }
      }
    } else if (view === 'services' && servicesView) {
      servicesView.classList.remove('hidden');
      
      // Initialize services if not already rendered
      if (window.renderServices) {
        setTimeout(() => {
          window.renderServices();
        }, 50);
      }
    } else if (view === 'profile' && profileView) {
      profileView.classList.remove('hidden');
      
      // Update mobile profile display
      if (window.updateProfileUI) {
        setTimeout(() => {
          window.updateProfileUI();
        }, 50);
      }
    }

    // Chat input bar: only visible when TALK is active (fixes fixed input showing on FEED)
    if (view === 'talk') {
      document.body.classList.add('talk-view-active');
    } else {
      document.body.classList.remove('talk-view-active');
    }

    if (previousView === 'talk' && view !== 'talk' && talkComponent && typeof talkComponent.onTalkClosed === 'function') {
      talkComponent.onTalkClosed();
    }

    // Notify badge systems of view change (hide badge on active tab)
    try {
      window.dispatchEvent(new CustomEvent('view-changed', { detail: { view } }));
    } catch (_) {}
  }

  // Initialize mobile profile handlers
  // УДАЛЕНО: обработчики на [data-section] - теперь обрабатываются универсальным обработчиком в profile-modals.js
  // Оставляем только инициализацию других компонентов, если нужно
  function initMobileProfileHandlers() {
    // Обработчики на [data-section] удалены - они обрабатываются в profile-modals.js
    // через единый document.addEventListener('click')
  }

  // Initialize mobile profile handlers on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileProfileHandlers);
  } else {
    initMobileProfileHandlers();
  }
  
  // ============================================================
  // MOBILE GAP DIAGNOSTICS (TALK input vs bottom-nav)
  // ============================================================
  function measureMobileGap() {
    if (!isMobile) return;
    
    const inputRow = document.querySelector('.talk-view .ai-input-row');
    const bottomNav = document.querySelector('.bottom-nav');
    
    if (!inputRow || !bottomNav) return;
    
    const inputRect = inputRow.getBoundingClientRect();
    const navRect = bottomNav.getBoundingClientRect();
    
    const inputBottom = inputRect.bottom;
    const navTop = navRect.top;
    const gapPx = navTop - inputBottom;
    
    if (IS_VERBOSE_BOOT_LOGS) {
      console.log('[MOBILE][GAP] inputBottom=' + inputBottom.toFixed(2) + ' navTop=' + navTop.toFixed(2) + ' gapPx=' + gapPx.toFixed(2));
    }

    // Find the cause
    const inputStyles = window.getComputedStyle(inputRow);
    const navStyles = window.getComputedStyle(bottomNav);

    if (IS_VERBOSE_BOOT_LOGS) {
      console.log('[MOBILE][GAP][CAUSE] input position=' + inputStyles.position + ' bottom=' + inputStyles.bottom);
      console.log('[MOBILE][GAP][CAUSE] input margin-bottom=' + inputStyles.marginBottom + ' padding-bottom=' + inputStyles.paddingBottom);
      console.log('[MOBILE][GAP][CAUSE] nav position=' + navStyles.position + ' height=' + navStyles.height + ' min-height=' + navStyles.minHeight);
      console.log('[MOBILE][GAP][CAUSE] nav margin-top=' + navStyles.marginTop + ' padding-top=' + navStyles.paddingTop);
      console.log('[MOBILE][GAP][BEFORE2] gapPx=' + gapPx);
    }

    // Analyze gap type
    if (gapPx > 0 && gapPx < 2 && IS_VERBOSE_BOOT_LOGS) {
      if (gapPx % 1 !== 0) {
        console.log('[MOBILE][GAP][CAUSE] Fractional gap (' + gapPx + ') → likely rounding/transform/calc');
      } else {
        console.log('[MOBILE][GAP][CAUSE] Integer gap (' + gapPx + ') → likely border/outline');
      }
    }

    // Re-measure after CSS fix (no JS auto-fix)
    setTimeout(() => {
      const inputRect2 = inputRow.getBoundingClientRect();
      const navRect2 = bottomNav.getBoundingClientRect();
      const gapPxAfter = navRect2.top - inputRect2.bottom;
      if (IS_VERBOSE_BOOT_LOGS) console.log('[MOBILE][GAP][AFTER2] gapPx=' + gapPxAfter);
    }, 100);
    
    return gapPx;
  }
  
  // Measure gap when TALK view is shown
  function checkTalkViewGap() {
    if (!isMobile) return;
    const talkView = document.getElementById('talk-view');
    if (talkView && !talkView.classList.contains('hidden')) {
      setTimeout(() => measureMobileGap(), 100);
    }
  }
  
  // Measure on view switch
  const originalShowView = window.showView;
  if (typeof originalShowView === 'function') {
    window.showView = function(view) {
      originalShowView(view);
      if (view === 'talk') {
        setTimeout(() => measureMobileGap(), 200);
      }
    };
  }
  
  // Measure on resize
  window.addEventListener('resize', () => {
    if (isMobile) {
      setTimeout(() => measureMobileGap(), 100);
    }
  });
  
  // Initial measurement after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => checkTalkViewGap(), 500);
    });
  } else {
    setTimeout(() => checkTalkViewGap(), 500);
  }

  // ============================================================
  // SAFE INITIALIZATION SYSTEM
  // ============================================================
  
  // Global init status tracker
  window.tendaiInitStatus = {
    modules: {},
    startTime: Date.now(),
    getSummary: function() {
      const total = Object.keys(this.modules).length;
      const success = Object.values(this.modules).filter(m => m.success).length;
      const failed = total - success;
      return {
        total,
        success,
        failed,
        modules: this.modules,
        duration: Date.now() - this.startTime
      };
    }
  };
  
  /**
   * Safe init wrapper - catches errors and prevents app crash
   */
  function safeInit(name, initFn) {
    try {
      const result = initFn();
      const status = { success: true, name, timestamp: Date.now() };
      window.tendaiInitStatus.modules[name] = status;
      if (IS_VERBOSE_BOOT_LOGS) console.log(`[INIT] ✅ ${name} initialized`);
      return status;
    } catch (error) {
      const status = { 
        success: false, 
        name, 
        error: error.message,
        timestamp: Date.now()
      };
      window.tendaiInitStatus.modules[name] = status;
      console.error(`[INIT] ❌ ${name} failed:`, error.message);
      // Show visible status for failed critical modules
      if (name === 'Tabs') {
        const errorDiv = document.createElement('div');
        errorDiv.id = 'tendai-init-error';
        errorDiv.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(220, 53, 69, 0.9); color: white; padding: 12px 20px; border-radius: 8px; z-index: 10001; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
        errorDiv.textContent = `⚠️ Module ${name} failed: ${error.message}`;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
      }
      return status;
    }
  }

  /**
   * Initialize Tabs (CRITICAL - must work independently)
   */
  function initTabs() {
    if (!centerTabs) {
      return { success: false, name: 'Tabs', error: 'centerTabs not found' };
    }

    const tabFeed = document.getElementById('tab-feed');
    const tabTalk = document.getElementById('tab-talk');

    if (tabFeed) {
      tabFeed.addEventListener('click', () => {
        try {
          switchView('feed');
        } catch (error) {
          console.error('[TABS] Error switching to feed:', error);
        }
      });
    }

    if (tabTalk) {
      tabTalk.addEventListener('click', () => {
        try {
          switchView('talk');
        } catch (error) {
          console.error('[TABS] Error switching to talk:', error);
        }
      });
    }

    // Mobile bottom nav
    if (bottomNav) {
      const navItems = bottomNav.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        item.addEventListener('click', () => {
          try {
            const screen = item.getAttribute('data-screen');
            if (screen && ['feed', 'talk', 'services', 'profile'].includes(screen)) {
              switchView(screen);
              navItems.forEach(nav => nav.classList.remove('active'));
              item.classList.add('active');
            }
          } catch (error) {
            console.error('[TABS] Error switching view:', error);
          }
        });
      });
    }

    return { success: true, name: 'Tabs' };
  }

  /**
   * Load active tab from localStorage
   */
  function loadActiveTab() {
    try {
      const saved = localStorage.getItem('tendai_active_tab');
      if (saved && ['feed', 'talk'].includes(saved)) {
        return saved;
      }
    } catch (error) {
      // Could not load saved tab
    }
    return 'feed';
  }

  /**
   * Run smoke test after initialization
   */
  function runSmokeTest() {
    const results = {
      tabs: false,
      calendar: false,
      switchView: false,
      overall: false
    };
    
    // Test 1: Tabs exist and are clickable
    try {
      const tabFeed = document.getElementById('tab-feed');
      const tabTalk = document.getElementById('tab-talk');
      results.tabs = !!(tabFeed && tabTalk);
    } catch (error) {
      results.tabs = false;
    }
    
    // Test 2: Calendar function exists
    try {
      results.calendar = typeof window.toggleCalendar === 'function';
    } catch (error) {
      results.calendar = false;
    }
    
    // Test 3: switchView function exists
    try {
      results.switchView = typeof window.switchView === 'function';
    } catch (error) {
      results.switchView = false;
    }
    
    // Overall result
    results.overall = results.tabs && results.switchView;
    
    // Log results
    if (IS_VERBOSE_BOOT_LOGS) console.log('[SMOKE TEST] Results:', results);
    if (results.overall) {
      if (IS_VERBOSE_BOOT_LOGS) console.log('[SMOKE TEST] ✅ PASS - Core functionality available');
    } else {
      console.error('[SMOKE TEST] ❌ FAIL - Some core functionality missing');
      console.error('[SMOKE TEST] Details:', {
        tabs: results.tabs ? '✅' : '❌',
        calendar: results.calendar ? '✅' : '⚠️ (optional)',
        switchView: results.switchView ? '✅' : '❌'
      });
    }
    
    // Store results globally
    window.tendaiSmokeTest = results;
    
    return results;
  }

  /**
   * UI initialization: runs only after serron:boot-ready (bootstrap has finished HealthSync + core inits).
   * Single place for TalkComponent, tabs, initial view, calendar, smoke test.
   */
  function runAfterBootReady() {
    syncHistory();
    ensureProfileProtocols();
    if (conversationCard) {
      try {
        talkComponent = new TalkComponent(conversationCard);
        window.__serronTalkComponent = talkComponent;
      } catch (error) {
        console.error('[INIT] Talk component failed:', error);
      }
    }

    try {
      const pendingGreeting = sessionStorage.getItem(GREETING_KEY);
      if (pendingGreeting && talkComponent && typeof talkComponent.deliverOnboardingGreeting === 'function') {
        talkComponent.deliverOnboardingGreeting(pendingGreeting);
        sessionStorage.removeItem(GREETING_KEY);
      }
    } catch (_) {}

    const tabsInit = safeInit('Tabs', initTabs);
    if (!tabsInit.success) {
      console.error('[CRITICAL] Tabs initialization failed - app may not work');
    }

    try {
      let initialView = loadActiveTab();
      try {
        if (sessionStorage.getItem(OPEN_TALK_KEY) === '1') {
          initialView = 'talk';
          sessionStorage.removeItem(OPEN_TALK_KEY);
        }
      } catch (_) {}
      switchView(initialView);
    } catch (error) {
      console.error('[INIT] Error loading initial view:', error);
      try {
        switchView('feed');
      } catch (fallbackError) {
        console.error('[CRITICAL] Cannot switch to feed view:', fallbackError);
      }
    }

    safeInit('Calendar', () => typeof window.toggleCalendar === 'function');

    const summary = window.tendaiInitStatus.getSummary();
    if (IS_VERBOSE_BOOT_LOGS) {
      console.log('[INIT] ✅ App initialization complete');
      console.log('[INIT] Summary:', {
        total: summary.total,
        success: summary.success,
        failed: summary.failed,
        duration: `${summary.duration}ms`,
        modules: Object.keys(summary.modules).map((name) => ({
          name,
          status: summary.modules[name].success ? '✅' : '❌',
        })),
      });
    }
    if (summary.failed > 0 && IS_VERBOSE_BOOT_LOGS) {
      Object.values(summary.modules).forEach(mod => {
        if (!mod.success) {
          console.warn(`  - ${mod.name}: ${mod.error}`);
        }
      });
    }

    setTimeout(runSmokeTest, 2000);
  }

  /**
   * Prime per-card discuss context before opening TALK.
   * Keeps card payload shape stable for feed and future card types.
   */
  function primeDiscussContext(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const prepared = {
      ...payload,
      source: 'agent-card',
      prepared_at: new Date().toISOString(),
    };
    window.__serronDiscussContext = prepared;
    return prepared;
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  const originalSwitchView = switchView;
  window.switchView = function(view) {
    try {
      originalSwitchView(view);
      if (view === 'talk' && window.markMessagesAsRead) {
        window.markMessagesAsRead();
      }
    } catch (error) {
      console.error('[SWITCH] Error switching view:', error);
    }
  };

  window.switchToDate = function(dateKey) {
    try {
      const today = new Date().toISOString().split('T')[0];
      if (dateKey !== today) {
        localStorage.setItem('tendai-selected-date', dateKey);
      } else {
        localStorage.removeItem('tendai-selected-date');
      }
    } catch (error) {
      console.error('[SWITCH] Error saving selected date:', error);
    }
  };

  window.__serronPrimeDiscussContext = primeDiscussContext;

  window.tendaiApp = {
    switchView,
    primeDiscussContext,
    get talkComponent() { return talkComponent; }
  };

  // Gate: run UI init only after bootstrap has set SERRON_BOOT_READY and dispatched serron:boot-ready
  if (window.SERRON_BOOT_READY === true) {
    runAfterBootReady();
  } else {
    window.addEventListener('serron:boot-ready', runAfterBootReady, { once: true });
  }
})();

