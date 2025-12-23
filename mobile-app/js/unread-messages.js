// TendAI — Unread Messages Indicator
// @owner: storage
// @role: init
// Tracks unread messages from TendAI and shows indicator

import { talkState } from './state.js';

const UNREAD_KEY = 'tendai_unread_count';
const LAST_VIEWED_KEY = 'tendai_talk_last_viewed';

/**
 * Mark all messages as read (when user opens Talk)
 */
export function markMessagesAsRead() {
  try {
    localStorage.setItem(LAST_VIEWED_KEY, Date.now().toString());
    updateUnreadIndicator();
  } catch (error) {
    // Could not mark as read
  }
}

/**
 * Check for new messages and update indicator
 */
export function checkUnreadMessages() {
  try {
    const talkData = talkState.get();
    const history = talkData.history || [];
    
    // Get last viewed timestamp
    const lastViewed = parseInt(localStorage.getItem(LAST_VIEWED_KEY) || '0', 10);
    
    // Count messages from TendAI (type === 'ai' or 'bot') after last viewed
    const unreadCount = history.filter(msg => {
      if (msg.type !== 'ai' && msg.type !== 'bot') return false;
      const msgTime = msg.timestamp || 0;
      return msgTime > lastViewed;
    }).length;
    
    // Save unread count
    localStorage.setItem(UNREAD_KEY, unreadCount.toString());
    
    // Update indicator
    updateUnreadIndicator();
    
    return unreadCount;
  } catch (error) {
    return 0;
  }
}

/**
 * Update unread indicator in UI
 */
function updateUnreadIndicator() {
  try {
    const unreadCount = parseInt(localStorage.getItem(UNREAD_KEY) || '0', 10);
    
    // Update desktop tab
    const tabTalk = document.getElementById('tab-talk');
    if (tabTalk) {
      const existingBadge = tabTalk.querySelector('.unread-badge');
      if (unreadCount > 0) {
        if (!existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'unread-badge';
          badge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();
          tabTalk.appendChild(badge);
        } else {
          existingBadge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();
        }
      } else {
        if (existingBadge) {
          existingBadge.remove();
        }
      }
    }
    
    // Update mobile nav item
    const mobileTalkNav = document.querySelector('[data-screen="talk"]');
    if (mobileTalkNav) {
      const existingBadge = mobileTalkNav.querySelector('.unread-badge');
      if (unreadCount > 0) {
        if (!existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'unread-badge';
          badge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();
          mobileTalkNav.appendChild(badge);
        } else {
          existingBadge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();
        }
      } else {
        if (existingBadge) {
          existingBadge.remove();
        }
      }
    }
  } catch (error) {
    // Could not update indicator
  }
}

/**
 * Initialize unread messages tracking
 */
export function initUnreadTracking() {
  // Check on load
  checkUnreadMessages();
  
  // Check periodically (every 5 seconds)
  setInterval(() => {
    checkUnreadMessages();
  }, 5000);
  
  // Also check when new messages are added (via MutationObserver on conversation area)
  const conversationArea = document.getElementById('chatLog');
  if (conversationArea) {
    const observer = new MutationObserver(() => {
      // Small delay to ensure message is saved
      setTimeout(() => {
        checkUnreadMessages();
      }, 100);
    });
    
    observer.observe(conversationArea, {
      childList: true,
      subtree: true
    });
  }
}

// Export for global use
window.markMessagesAsRead = markMessagesAsRead;
window.checkUnreadMessages = checkUnreadMessages;
window.initUnreadTracking = initUnreadTracking;

