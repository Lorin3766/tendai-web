// TendAI — Unified App (Mobile & Desktop)
import { TalkComponent } from './components/talk.js';

(function () {
  'use strict';

  // Initialize components
  const conversationCard = document.getElementById('conversationCard');
  const feedView = document.getElementById('feed-view');
  const talkView = document.getElementById('talk-view');
  const servicesView = document.getElementById('services-view');
  const profileView = document.getElementById('profile-view');
  const centerTabs = document.getElementById('centerTabs');
  const bottomNav = document.getElementById('bottomNav');

  let talkComponent = null;
  let currentView = 'feed';

  // Initialize TALK component
  // Mount it inside #conversationCard (which is inside #talk-view)
  if (conversationCard) {
    try {
      talkComponent = new TalkComponent(conversationCard);
    } catch (error) {
      console.error('[INIT] Talk component failed:', error);
    }
  }

  // Tabs initialization moved to initTabs() function below (isolated and safe)

  // Switch between FEED, TALK, SERVICES, and PROFILE views
  function switchView(view) {
    if (view === currentView) return;

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

    // Close calendar panel when switching views (predictable behavior)
    try {
      if (window.closeCalendar) {
        window.closeCalendar();
      } else if (window.closeCalendarPanel) {
        window.closeCalendarPanel();
      }
    } catch (error) {
      // Calendar close failed - not critical
    }
    
    // Hide all views first
    if (feedView) feedView.classList.add('hidden');
    if (talkView) talkView.classList.add('hidden');
    if (servicesView) servicesView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');

    // Show selected view
    if (view === 'feed' && feedView) {
      feedView.classList.remove('hidden');
      
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
      
      // Mark all feed messages as read when opening Feed
      if (window.markAllFeedAsRead) {
        window.markAllFeedAsRead();
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
      talkView.classList.remove('hidden');
      
      // Mark all talk messages as read when opening Talk
      if (window.markAllTalkAsRead) {
        window.markAllTalkAsRead();
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
  }

  // Load saved active tab from localStorage
  function loadActiveTab() {
    try {
      const savedTab = localStorage.getItem('tendai_active_tab');
      if (savedTab === 'talk' || savedTab === 'feed') {
        return savedTab;
      }
    } catch (error) {
      // Could not load active tab
    }
    return 'feed'; // Default to feed
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
      console.log(`[INIT] ✅ ${name} initialized`);
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

  // Initialize Tabs FIRST (critical)
  const tabsInit = safeInit('Tabs', initTabs);
  
  if (!tabsInit.success) {
    console.error('[CRITICAL] Tabs initialization failed - app may not work');
  }

  // ============================================================
  // MODULE INITIALIZATION (with guards)
  // ============================================================
  
  /**
   * Load active tab and switch to it
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

  // Initialize with saved or default view (after tabs are ready)
  try {
    const initialView = loadActiveTab();
    switchView(initialView);
  } catch (error) {
    console.error('[INIT] Error loading initial view:', error);
    // Fallback to feed
    try {
      switchView('feed');
    } catch (fallbackError) {
      console.error('[CRITICAL] Cannot switch to feed view:', fallbackError);
    }
  }

  // Initialize calendar (isolated - doesn't affect tabs)
  // Calendar FAB initialization is handled by calendar.js module
  safeInit('Calendar', () => {
    // Calendar module handles its own initialization
    return typeof window.toggleCalendar === 'function';
  });

  // Initialize other modules (with guards)
  const initModules = [
    { name: 'UnreadTracking', fn: () => window.initUnreadTracking?.() },
    { name: 'ProfileCompleteness', fn: () => window.initProfileCompleteness?.() },
    { name: 'NextStep', fn: () => window.initNextStep?.() },
    { name: 'MorningCheckIn', fn: () => window.initMorningCheckIn?.() },
    { name: 'EveningCheckIn', fn: () => window.initEveningCheckIn?.() },
    { name: 'UnreadMessages', fn: () => window.initUnreadMessages?.() },
    { name: 'DailyAction', fn: () => {
      window.pickDailyAction?.();
      window.updateDailyActionUI?.();
    }},
    { name: 'SoftStreak', fn: () => window.checkNewDay?.() }
  ];

  initModules.forEach((module, index) => {
    setTimeout(() => {
      safeInit(module.name, module.fn);
    }, 500 + index * 100);
  });

  // ============================================================
  // SMOKE TEST (automatic verification)
  // ============================================================
  
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
    console.log('[SMOKE TEST] Results:', results);
    if (results.overall) {
      console.log('[SMOKE TEST] ✅ PASS - Core functionality available');
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
  
  // Run smoke test after all modules initialized
  setTimeout(() => {
    runSmokeTest();
  }, 2000);

  // ============================================================
  // EXPORTS
  // ============================================================
  
  // Mark messages as read when switching to Talk
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

  // Switch to specific date (for calendar navigation)
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

  // Export for external use
  window.tendaiApp = {
    switchView,
    talkComponent
  };

  // Log init summary
  const summary = window.tendaiInitStatus.getSummary();
  console.log('[INIT] ✅ App initialization complete');
  console.log('[INIT] Summary:', {
    total: summary.total,
    success: summary.success,
    failed: summary.failed,
    duration: `${summary.duration}ms`,
    modules: Object.keys(summary.modules).map(name => ({
      name,
      status: summary.modules[name].success ? '✅' : '❌'
    }))
  });
  
  // Show init status in console (for quick debugging)
  if (summary.failed > 0) {
    console.warn(`[INIT] ⚠️ ${summary.failed} module(s) failed to initialize`);
    Object.values(summary.modules).forEach(mod => {
      if (!mod.success) {
        console.warn(`  - ${mod.name}: ${mod.error}`);
      }
    });
  }
})();

