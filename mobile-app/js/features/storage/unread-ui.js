// Serron — Unread UI (New messages indicator)
// @owner: storage
// @role: ui
// Shows "New messages" indicator and "Jump to latest" button in TALK

import { getUnreadCount } from './unread-badges.js';

/**
 * Create "New messages" indicator
 */
function createNewMessagesIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'new-messages-indicator';
  indicator.className = 'new-messages-indicator';
  indicator.setAttribute('role', 'button');
  indicator.setAttribute('tabindex', '0');
  indicator.setAttribute('aria-label', 'New messages - scroll to bottom');
  
  const count = getUnreadCount('talk');
  indicator.innerHTML = `
    <span class="new-messages-text">New messages</span>
    <span class="new-messages-count">${count}</span>
    <span class="new-messages-arrow">↓</span>
  `;
  
  // Click handler - scroll to bottom
  indicator.addEventListener('click', () => {
    scrollToBottomOfTalk();
  });
  
  // Keyboard handler
  indicator.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      scrollToBottomOfTalk();
    }
  });
  
  return indicator;
}

/**
 * Scroll to bottom of TALK
 */
function scrollToBottomOfTalk() {
  const conversationArea = document.getElementById('chatLog');
  if (!conversationArea) return;
  
  const scrollContainer = conversationArea.closest('.chat-scroll-wrapper') || conversationArea;
  
  // Use smooth scroll
  scrollContainer.scrollTo({
    top: scrollContainer.scrollHeight,
    behavior: 'smooth'
  });
  
  // Also trigger scroll in talk component if available
  if (window.talkComponent && typeof window.talkComponent.scrollToBottom === 'function') {
    window.talkComponent.scrollToBottom();
  }
}

/**
 * Update "New messages" indicator
 */
export function updateNewMessagesIndicator() {
  const talkView = document.querySelector('.talk-view') || document.getElementById('talk-view');
  if (!talkView) return;
  
  const unreadCount = getUnreadCount('talk');
  const isAtBottom = window.isUserAtBottomOfTalk?.() || false;
  
  // Find or create indicator
  let indicator = document.getElementById('new-messages-indicator');
  
  // Show indicator only if:
  // 1. There are unread messages
  // 2. User is NOT at bottom
  if (unreadCount > 0 && !isAtBottom) {
    if (!indicator) {
      indicator = createNewMessagesIndicator();
      talkView.appendChild(indicator);
    }
    
    // Update count
    const countElement = indicator.querySelector('.new-messages-count');
    if (countElement) {
      countElement.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
    }
    
    // Show indicator
    indicator.style.display = 'flex';
  } else {
    // Hide indicator
    if (indicator) {
      indicator.style.display = 'none';
    }
  }
}

/**
 * Initialize new messages indicator
 */
export function initNewMessagesIndicator() {
  // Update on unread count changes
  window.addEventListener('unread-count-changed', (e) => {
    if (e.detail.type === 'talk') {
      updateNewMessagesIndicator();
    }
  });
  
  // Update on scroll
  const conversationArea = document.getElementById('chatLog');
  if (conversationArea) {
    const scrollContainer = conversationArea.closest('.chat-scroll-wrapper') || conversationArea;
    scrollContainer.addEventListener('scroll', () => {
      updateNewMessagesIndicator();
    }, { passive: true });
  }
  
  // Initial update
  updateNewMessagesIndicator();
}

// Export for global use
window.updateNewMessagesIndicator = updateNewMessagesIndicator;
window.initNewMessagesIndicator = initNewMessagesIndicator;
window.scrollToBottomOfTalk = scrollToBottomOfTalk;

