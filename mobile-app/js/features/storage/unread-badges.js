// Serron — Unread Badges System (FEED + TALK)
// @owner: storage
// @role: state
// Unified system for tracking unread items in FEED and TALK

const STORAGE_KEY = 'tendai-unread-items';
const MAX_DAYS_TO_KEEP = 30; // Keep unread items for 30 days

/**
 * Unread item structure:
 * {
 *   id: string (unique identifier),
 *   type: 'feed' | 'talk',
 *   elementId: string (DOM element ID or selector),
 *   timestamp: number (when created),
 *   readAt: number | null (when marked as read),
 *   metadata: object (optional, e.g., messageId for TALK)
 * }
 */

/**
 * Get all unread items from storage
 * @returns {Array} Array of unread items
 */
function getUnreadItems() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const items = JSON.parse(stored);
    // Clean old items
    return cleanOldItems(items);
  } catch (error) {
    console.error('[UNREAD BADGES] Error reading items', error);
    return [];
  }
}

/**
 * Save unread items to storage
 * @param {Array} items - Array of unread items
 */
function saveUnreadItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('[UNREAD BADGES] Error saving items', error);
  }
}

/**
 * Clean items older than MAX_DAYS_TO_KEEP
 * @param {Array} items - Array of items
 * @returns {Array} Cleaned items
 */
function cleanOldItems(items) {
  const now = Date.now();
  const cutoffTime = now - MAX_DAYS_TO_KEEP * 24 * 60 * 60 * 1000;
  
  return items.filter(item => {
    // Keep unread items and recently read items (within 7 days)
    if (!item.readAt) return true;
    return item.readAt > cutoffTime;
  });
}

/**
 * Generate unique ID for unread item
 * @param {string} type - 'feed' | 'talk'
 * @param {string} identifier - Unique identifier (e.g., messageId, cardId)
 * @returns {string} Unique ID
 */
function generateItemId(type, identifier) {
  return `${type}-${identifier}`;
}

/**
 * Add unread item
 * @param {Object} itemData - Item data
 * @param {string} itemData.type - 'feed' | 'talk'
 * @param {string} itemData.elementId - DOM element ID or selector
 * @param {string} [itemData.identifier] - Unique identifier (for deduplication)
 * @param {Object} [itemData.metadata] - Optional metadata
 * @returns {Object|null} Added item or null if duplicate
 */
export function addUnreadItem({ type, elementId, identifier, metadata = {} }) {
  if (!type || !elementId) {
    console.error('[UNREAD BADGES] Missing required fields', { type, elementId });
    return null;
  }
  
  const items = getUnreadItems();
  const itemId = identifier ? generateItemId(type, identifier) : generateItemId(type, elementId);
  
  // Check for duplicate (same ID and still unread)
  const existing = items.find(item => item.id === itemId && !item.readAt);
  if (existing) {
    // Update timestamp if duplicate found
    existing.timestamp = Date.now();
    saveUnreadItems(items);
    return existing;
  }
  
  // Create new item
  const item = {
    id: itemId,
    type,
    elementId,
    timestamp: Date.now(),
    readAt: null,
    metadata
  };
  
  items.push(item);
  saveUnreadItems(items);
  
  // Notify centralized notifications (drives badge via unread-item-added)
  try {
    window.dispatchEvent(new CustomEvent('unread-item-added', { detail: { type } }));
  } catch (_) {}
  dispatchUnreadChanged(type, getUnreadCount(type));
  
  return item;
}

/**
 * Mark item as read
 * @param {string} itemId - Item ID
 */
export function markItemAsRead(itemId) {
  const items = getUnreadItems();
  const item = items.find(i => i.id === itemId);
  
  if (item && !item.readAt) {
    item.readAt = Date.now();
    saveUnreadItems(items);
    
    // Notify centralized notifications to sync badge
    try {
      window.dispatchEvent(new CustomEvent('unread-count-changed', {
        detail: { type: item.type, count: getUnreadCount(item.type) }
      }));
    } catch (_) {}
    dispatchUnreadChanged(item.type, getUnreadCount(item.type));
    
    return true;
  }
  
  return false;
}

/**
 * Mark all items of a type as read
 * @param {string} type - 'feed' | 'talk'
 */
export function markAllAsRead(type) {
  const items = getUnreadItems();
  let updated = false;
  
  items.forEach(item => {
    if (item.type === type && !item.readAt) {
      item.readAt = Date.now();
      updated = true;
    }
  });
  
  if (updated) {
    saveUnreadItems(items);
    if (typeof window.clearNotifications === 'function') {
      window.clearNotifications(type);
    }
    dispatchUnreadChanged(type, getUnreadCount(type));
  }
}

/**
 * Get unread count for a type
 * @param {string} type - 'feed' | 'talk'
 * @returns {number} Count of unread items
 */
export function getUnreadCount(type) {
  const items = getUnreadItems();
  return items.filter(item => item.type === type && !item.readAt).length;
}

function dispatchUnreadChanged(type, count) {
  try {
    window.dispatchEvent(new CustomEvent('unread-count-changed', {
      detail: { type, count },
    }));
  } catch (_e) {
    // silent
  }
}

/**
 * Get all unread items for a type
 * @param {string} type - 'feed' | 'talk'
 * @returns {Array} Array of unread items
 */
export function getUnreadItemsByType(type) {
  const items = getUnreadItems();
  return items.filter(item => item.type === type && !item.readAt);
}

/**
 * Find unread item by element ID
 * @param {string} elementId - DOM element ID or selector
 * @param {string} [type] - Optional type filter
 * @returns {Object|null} Unread item or null
 */
export function findUnreadItemByElement(elementId, type) {
  const items = getUnreadItems();
  return items.find(item => 
    item.elementId === elementId && 
    !item.readAt &&
    (!type || item.type === type)
  );
}

/**
 * Get current active view/tab
 * @returns {string} 'feed' | 'talk' | null
 */
function getActiveView() {
  // Check desktop tabs
  const tabFeed = document.getElementById('tab-feed');
  const tabTalk = document.getElementById('tab-talk');
  
  if (tabFeed && tabFeed.classList.contains('is-active')) {
    return 'feed';
  }
  if (tabTalk && tabTalk.classList.contains('is-active')) {
    return 'talk';
  }
  
  // Check mobile nav
  const mobileFeed = document.querySelector('[data-screen="feed"]');
  const mobileTalk = document.querySelector('[data-screen="talk"]');
  
  if (mobileFeed && mobileFeed.classList.contains('active')) {
    return 'feed';
  }
  if (mobileTalk && mobileTalk.classList.contains('active')) {
    return 'talk';
  }
  
  // Check visible views
  const feedView = document.getElementById('feed-view');
  const talkView = document.querySelector('.talk-view') || document.getElementById('talk-view');
  
  if (feedView && !feedView.classList.contains('hidden')) {
    return 'feed';
  }
  if (talkView && !talkView.classList.contains('hidden')) {
    return 'talk';
  }
  
  return null;
}

/**
 * Update badge count in UI
 * DELEGATED: Badge display is handled by js/core/notifications.js via .badge-container.
 * This only removes orphan .unread-badge and dispatches so notifications can sync.
 * @param {string} type - 'feed' | 'talk'
 */
function updateBadgeCount(type) {
  const count = getUnreadCount(type);
  // Remove any legacy .unread-badge — notifications.js owns display
  const tabElement = document.getElementById(`tab-${type}`);
  if (tabElement) {
    const badge = tabElement.querySelector('.unread-badge');
    if (badge) badge.remove();
  }
  const mobileNav = document.querySelector(`[data-screen="${type}"]`);
  if (mobileNav) {
    const badge = mobileNav.querySelector('.unread-badge');
    if (badge) badge.remove();
  }
  // Notify notifications.js to update .badge-container
  dispatchUnreadChanged(type, count);
  if (typeof window.updateNotificationBadges === 'function') {
    window.updateNotificationBadges();
  }
}

/**
 * Update all badge counts (call this when view changes)
 */
export function updateAllBadgeCounts() {
  updateBadgeCount('feed');
  updateBadgeCount('talk');
}

/**
 * Initialize badge counts on load
 */
export function initBadgeCounts() {
  if (initBadgeCounts.__initialized) return;
  initBadgeCounts.__initialized = true;

  updateAllBadgeCounts();
  
  // Listen for view changes to update badges
  window.addEventListener('view-changed', () => {
    updateAllBadgeCounts();
  });
  
  // Also listen for tab clicks (desktop)
  const tabFeed = document.getElementById('tab-feed');
  const tabTalk = document.getElementById('tab-talk');
  
  if (tabFeed) {
    tabFeed.addEventListener('click', () => {
      setTimeout(() => updateAllBadgeCounts(), 50);
    });
  }
  if (tabTalk) {
    tabTalk.addEventListener('click', () => {
      setTimeout(() => updateAllBadgeCounts(), 50);
    });
  }
  
  // Listen for mobile nav clicks
  const mobileNavs = document.querySelectorAll('[data-screen="feed"], [data-screen="talk"]');
  mobileNavs.forEach(nav => {
    nav.addEventListener('click', () => {
      setTimeout(() => updateAllBadgeCounts(), 50);
    });
  });

  // One-time debug dump on startup (non-intrusive)
  setTimeout(() => {
    if (typeof console !== 'undefined' && console.groupCollapsed) {
      debugUnreadBadgeState('startup');
    }
  }, 0);
}

// Export for global use
window.addUnreadItem = addUnreadItem;
window.markItemAsRead = markItemAsRead;
window.markAllAsRead = markAllAsRead;
window.getUnreadCount = getUnreadCount;
window.getUnreadItemsByType = getUnreadItemsByType;
window.findUnreadItemByElement = findUnreadItemByElement;
window.initBadgeCounts = initBadgeCounts;
window.updateAllBadgeCounts = updateAllBadgeCounts;
window.reconcileTalkUnreadOrphans = reconcileTalkUnreadOrphans;
window.__debugUnreadState = function debugUnreadState() {
  const items = getUnreadItems();
  const unread = items.filter(i => !i.readAt);
  const feed = unread.filter(i => i.type === 'feed');
  const talk = unread.filter(i => i.type === 'talk');
  const toLog = (arr) => arr.map(i => ({
    id: i.id,
    type: i.type,
    elementId: i.elementId,
    timestamp: i.timestamp,
    readAt: i.readAt,
    metadata: i.metadata,
  }));
  console.group('[UNREAD BADGES] Debug state');
  console.log('Total unread:', unread.length);
  console.log('Feed unread:', feed.length, toLog(feed));
  console.log('Talk unread:', talk.length, toLog(talk));
  console.log('Raw items:', items);
  console.groupEnd();
  return { unread, feed, talk, all: items };
};

/**
 * Debug logger: badge sources and unread items
 * @param {string} trigger - who called (e.g., 'startup', 'manual')
 */
function debugUnreadBadgeState(trigger = 'manual') {
  try {
    const activeView = getActiveView();
    const feedUnread = getUnreadCount('feed');
    const talkUnread = getUnreadCount('talk');
    const legacyUnreadRaw = localStorage.getItem('tendai_unread_count');
    const legacyUnread = legacyUnreadRaw !== null ? legacyUnreadRaw : 'null';

    const tabTalk = document.getElementById('tab-talk');
    const badgeTalk = tabTalk?.querySelector('.unread-badge');
    const badgeTalkText = badgeTalk?.textContent || '';
    const badgeTalkSource = badgeTalk?.dataset?.badgeSource || 'unknown';

    const items = getUnreadItems();
    const talkItems = items.filter(i => i.type === 'talk' && !i.readAt);
    const talkItemsDetailed = talkItems.map(i => ({
      id: i.id,
      elementId: i.elementId,
      existsInDOM: !!(i.elementId && document.getElementById(i.elementId)),
      timestamp: i.timestamp,
      readAt: i.readAt,
      metadata: i.metadata,
    }));

    console.groupCollapsed('[UNREAD DEBUG]', { trigger });
    console.log('activeView:', activeView);
    console.log('feedUnread (new):', feedUnread);
    console.log('talkUnread (new):', talkUnread);
    console.log('legacy tendai_unread_count:', legacyUnread);
    console.log('badge talk text:', badgeTalkText, 'source:', badgeTalkSource);
    console.log('talk unread items:', talkItemsDetailed);
    console.groupEnd();

    return {
      activeView,
      feedUnread,
      talkUnread,
      legacyUnread,
      badgeTalkText,
      badgeTalkSource,
      talkItemsDetailed,
    };
  } catch (error) {
    console.error('[UNREAD DEBUG] Failed', error);
    return null;
  }
}

/**
 * Reconcile orphan TALK unread items (no DOM element exists)
 * Run after TALK has rendered to avoid counting “висяки”
 */
export function reconcileTalkUnreadOrphans(delayMs = 350) {
  setTimeout(() => {
    try {
      const items = getUnreadItems();
      let changed = false;
      items
        .filter(i => i.type === 'talk' && !i.readAt)
        .forEach(i => {
          if (!i.elementId) {
            markItemAsRead(i.id);
            changed = true;
            return;
          }
          const el = document.getElementById(i.elementId);
          if (!el) {
            markItemAsRead(i.id);
            changed = true;
          }
        });
      if (changed) {
        updateAllBadgeCounts();
      }
    } catch (error) {
      console.error('[UNREAD BADGES] Reconcile failed', error);
    }
  }, delayMs);
}

// Export reconcile for global use
window.reconcileTalkUnreadOrphans = reconcileTalkUnreadOrphans;

window.debugUnreadBadgeState = debugUnreadBadgeState;

