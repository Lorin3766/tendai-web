// Serron — Unread Visibility Tracker (Intersection Observer)
// @owner: storage
// @role: ui
// Tracks when FEED and TALK items become visible and marks them as read

import { 
  markItemAsRead, 
  findUnreadItemByElement,
  getUnreadItemsByType,
  markAllAsRead
} from './unread-badges.js';

// Intersection Observer instances
let feedObserver = null;
let talkObserver = null;

// Track if user is at bottom of TALK
let isAtBottomOfTalk = false;
let talkScrollContainer = null;

/**
 * Initialize FEED visibility tracking
 */
export function initFeedVisibilityTracking() {
  const feedView = document.getElementById('feed-view');
  if (!feedView) return;
  
  // Clean up existing observer
  if (feedObserver) {
    feedObserver.disconnect();
  }
  
  // Create Intersection Observer for FEED items
  feedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Element is visible - mark as read
        const elementId = entry.target.id || entry.target.getAttribute('data-unread-id');
        if (elementId) {
          const item = findUnreadItemByElement(elementId, 'feed');
          if (item) {
            markItemAsRead(item.id);
          }
        }
      }
    });
  }, {
    root: feedView,
    rootMargin: '0px',
    threshold: 0.5 // Element must be at least 50% visible
  });
  
  // Observe all FEED cards
  observeFeedItems();
  
  // Re-observe when new items are added
  const feedMutationObserver = new MutationObserver(() => {
    observeFeedItems();
  });
  
  feedMutationObserver.observe(feedView, {
    childList: true,
    subtree: true
  });
}

/**
 * Observe all FEED items
 */
function observeFeedItems() {
  if (!feedObserver) return;
  
  const feedView = document.getElementById('feed-view');
  if (!feedView) return;
  
  // Find all card-soft elements in feed-view
  const feedCards = feedView.querySelectorAll('.card-soft[data-unread-id], .card-soft[id]');
  feedCards.forEach(card => {
    const elementId = card.id || card.getAttribute('data-unread-id');
    if (elementId) {
      // Check if this item is unread
      const item = findUnreadItemByElement(elementId, 'feed');
      if (item) {
        feedObserver.observe(card);
      }
    }
  });
}

/**
 * Initialize TALK visibility tracking
 */
export function initTalkVisibilityTracking() {
  const talkView = document.querySelector('.talk-view') || document.getElementById('talk-view');
  const conversationArea = document.getElementById('chatLog');
  if (!talkView || !conversationArea) return;
  
  // Find scroll container
  talkScrollContainer = conversationArea.closest('.chat-scroll-wrapper') || conversationArea;
  
  // Clean up existing observer
  if (talkObserver) {
    talkObserver.disconnect();
  }
  
  // Track scroll position to detect if user is at bottom
  const updateScrollPosition = () => {
    if (!talkScrollContainer) return;
    
    const container = talkScrollContainer;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Consider "at bottom" if within 100px of bottom
    isAtBottomOfTalk = (scrollHeight - scrollTop - clientHeight) < 100;
    
    // If at bottom, mark all visible messages as read
    if (isAtBottomOfTalk) {
      markVisibleTalkMessagesAsRead();
    }
  };
  
  // Listen to scroll events
  talkScrollContainer.addEventListener('scroll', updateScrollPosition, { passive: true });
  
  // Create Intersection Observer for TALK messages
  talkObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && isAtBottomOfTalk) {
        // Message is visible and user is at bottom - mark as read
        const messageElement = entry.target;
        const messageId = messageElement.getAttribute('data-message-id') || 
                         messageElement.id;
        
        if (messageId) {
          const item = findUnreadItemByElement(messageId, 'talk');
          if (item) {
            markItemAsRead(item.id);
          }
        }
      }
    });
  }, {
    root: talkScrollContainer,
    rootMargin: '0px',
    threshold: 0.5
  });
  
  // Observe TALK messages
  observeTalkMessages();
  
  // Re-observe when new messages are added
  const talkMutationObserver = new MutationObserver(() => {
    observeTalkMessages();
    updateScrollPosition();
  });
  
  talkMutationObserver.observe(conversationArea, {
    childList: true,
    subtree: true
  });
  
  // Initial check
  updateScrollPosition();
}

/**
 * Observe all TALK messages
 */
function observeTalkMessages() {
  if (!talkObserver) return;
  
  const conversationArea = document.getElementById('chatLog');
  if (!conversationArea) return;
  
  // Find all message elements (AI messages only)
  const messages = conversationArea.querySelectorAll('.message-ai[data-message-id], .message-ai[id], [data-message-type="ai"][data-message-id]');
  messages.forEach(message => {
    const messageId = message.getAttribute('data-message-id') || message.id;
    if (messageId) {
      // Check if this message is unread
      const item = findUnreadItemByElement(messageId, 'talk');
      if (item) {
        talkObserver.observe(message);
      }
    }
  });
}

/**
 * Mark visible TALK messages as read (when user is at bottom)
 */
function markVisibleTalkMessagesAsRead() {
  if (!talkScrollContainer) return;
  
  const conversationArea = document.getElementById('chatLog');
  if (!conversationArea) return;
  
  // Get all unread TALK items
  const unreadItems = getUnreadItemsByType('talk');
  
  // Check which messages are visible
  const messages = conversationArea.querySelectorAll('.message-ai[data-message-id], .message-ai[id], [data-message-type="ai"][data-message-id]');
  
  messages.forEach(message => {
    const messageId = message.getAttribute('data-message-id') || message.id;
    if (messageId) {
      const rect = message.getBoundingClientRect();
      const containerRect = talkScrollContainer.getBoundingClientRect();
      
      // Check if message is visible in container
      const isVisible = (
        rect.top >= containerRect.top &&
        rect.bottom <= containerRect.bottom
      );
      
      if (isVisible) {
        const item = unreadItems.find(i => i.elementId === messageId);
        if (item) {
          markItemAsRead(item.id);
        }
      }
    }
  });
}

/**
 * Check if user is at bottom of TALK
 * @returns {boolean}
 */
export function isUserAtBottomOfTalk() {
  return isAtBottomOfTalk;
}

/**
 * Initialize all visibility tracking
 */
export function initVisibilityTracking() {
  // Initialize FEED tracking
  initFeedVisibilityTracking();
  
  // Initialize TALK tracking
  initTalkVisibilityTracking();
}

// Export for global use
window.initFeedVisibilityTracking = initFeedVisibilityTracking;
window.initTalkVisibilityTracking = initTalkVisibilityTracking;
window.initVisibilityTracking = initVisibilityTracking;
window.isUserAtBottomOfTalk = isUserAtBottomOfTalk;

