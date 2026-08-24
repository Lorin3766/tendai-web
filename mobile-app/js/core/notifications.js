// Serron — Centralized Notification Badge State (FEED + TALK)
// @owner: core
// @role: state
// Robust, high-performance badge logic. Works offline. No increment when tab is active.

const STORAGE_KEY = 'tendai-notifications';

/** Centralized state: { feed: number, talk: number } */
let notifications = { feed: 0, talk: 0 };

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      notifications = {
        feed: Math.max(0, parseInt(parsed.feed, 10) || 0),
        talk: Math.max(0, parseInt(parsed.talk, 10) || 0)
      };
    }
  } catch (_) {
    notifications = { feed: 0, talk: 0 };
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch (_) {}
}

/** Check if tab is currently active (user is viewing it) */
function isTabActive(tabName) {
  const tab = tabName === 'feed' ? 'feed' : tabName === 'talk' ? 'talk' : null;
  if (!tab) return false;
  const tabEl = document.getElementById(`tab-${tab}`);
  const mobileEl = document.querySelector(`[data-screen="${tab}"]`);
  const feedView = document.getElementById('feed-view');
  const talkView = document.getElementById('talk-view');
  if (tabEl?.classList.contains('is-active')) return true;
  if (mobileEl?.classList.contains('active')) return true;
  if (tab === 'feed' && feedView && !feedView.classList.contains('hidden')) return true;
  if (tab === 'talk' && talkView && !talkView.classList.contains('hidden')) return true;
  return false;
}

/** Render badge text: count > 0 ? `${count}` : '' (99+ for large counts) */
function renderBadge(count) {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

/** Update badge UI for a tab (desktop + mobile). Targets .badge-container elements. */
function updateBadgeUI(tabName) {
  const count = notifications[tabName] || 0;
  if (typeof console !== 'undefined' && console.trace && count > 0) {
    console.trace('[NOTIFICATIONS] Badge update triggered (count>0)', { tabName, count });
  }
  const text = renderBadge(count);
  const show = count > 0 && !isTabActive(tabName);

  const updateContainer = (container) => {
    if (!container) return;
    if (show) {
      container.innerHTML = `<span class="badge-count" aria-label="${count} unread ${tabName} items">${text}</span>`;
    } else {
      container.innerHTML = '';
    }
  };

  const tabEl = document.getElementById(`tab-${tabName}`);
  if (tabEl) {
    const container = tabEl.querySelector('.badge-container');
    updateContainer(container);
  }

  const mobileEl = document.querySelector(`[data-screen="${tabName}"]`);
  if (mobileEl) {
    const container = mobileEl.querySelector('.badge-container');
    updateContainer(container);
  }
}

/** Get notification count for a tab */
export function getNotificationCount(tabName) {
  if (!notifications[tabName] && notifications[tabName] !== 0) return 0;
  return Math.max(0, notifications[tabName]);
}

/** Set notification count (internal) */
function setCount(tabName, count) {
  const n = Math.max(0, parseInt(count, 10) || 0);
  notifications[tabName] = n;
  saveToStorage();
  updateBadgeUI(tabName);
  try {
    window.dispatchEvent(new CustomEvent('notifications-changed', { detail: { tabName, count: n } }));
  } catch (_) {}
}

/**
 * Clear notifications for a tab. Optimistic UI + localStorage sync.
 * Works offline (no network required).
 * Caller should also call markAllAsRead(tabName) from unread-badges to sync items.
 * @param {string} tabName - 'feed' | 'talk'
 */
export function clearNotifications(tabName) {
  if (tabName !== 'feed' && tabName !== 'talk') return;
  setCount(tabName, 0);
  if (tabName === 'talk') {
    try {
      localStorage.removeItem('tendai_unread_count');
      localStorage.setItem('tendai_talk_last_viewed', Date.now().toString());
    } catch (_) {}
  }
}

/**
 * Increment notification count. Does NOT increment if tab is active.
 * @param {string} tabName - 'feed' | 'talk'
 */
export function incrementNotification(tabName) {
  if (tabName !== 'feed' && tabName !== 'talk') return;
  if (isTabActive(tabName)) return;
  setCount(tabName, (notifications[tabName] || 0) + 1);
}

/** Update all badge UIs */
export function updateAllBadges() {
  updateBadgeUI('feed');
  updateBadgeUI('talk');
}

/** Initialize: load from storage, sync from unread-badges if empty (migration), listen for events */
export function initNotifications() {
  // Force DOM reset: clear ALL badge elements (nuclear fix for stuck legacy badges)
  try {
    document.querySelectorAll('.badge-container').forEach(el => { el.innerHTML = ''; });
    document.querySelectorAll('.unread-badge').forEach(el => el.remove());
  } catch (_) {}
  loadFromStorage();
  // Migration: if no stored counts, sync from unread-badges items
  if ((notifications.feed === 0 && notifications.talk === 0) && typeof window.getUnreadCount === 'function') {
    try {
      notifications.feed = Math.max(0, window.getUnreadCount('feed') || 0);
      notifications.talk = Math.max(0, window.getUnreadCount('talk') || 0);
      saveToStorage();
    } catch (_) {}
  }
  updateAllBadges();

  window.addEventListener('unread-item-added', (e) => {
    const type = e.detail?.type;
    if (type === 'feed' || type === 'talk') incrementNotification(type);
  });

  // Sync from unread-badges when count changes (e.g. markItemAsRead, reconciliation)
  window.addEventListener('unread-count-changed', (e) => {
    const type = e.detail?.type;
    const count = e.detail?.count;
    if ((type === 'feed' || type === 'talk') && typeof count === 'number') {
      setCount(type, count);
    }
  });

  window.addEventListener('view-changed', () => updateAllBadges());
}

// Global API
if (typeof window !== 'undefined') {
  window.clearNotifications = clearNotifications;
  window.getNotificationCount = getNotificationCount;
  window.incrementNotification = incrementNotification;
  window.updateNotificationBadges = updateAllBadges;
}
