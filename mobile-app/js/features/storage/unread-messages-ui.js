// Serron — Unread Messages UI
// @owner: storage
// @role: ui
// Displays unread messages in Feed and Talk views

import { getUnreadMessages, markAllAsRead } from './message-queue.js';

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  // Format as date
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();
  return `${month} ${day}`;
}

/**
 * Render unread message card for Feed
 * @param {Object} message - Message object
 * @returns {string} HTML string
 */
function renderFeedMessageCard(message) {
  const timeStr = formatTime(message.timestamp);
  return `
    <article class="card-soft" data-message-id="${message.id}" style="margin-bottom: 12px; border-left: 3px solid rgba(246, 195, 106, 0.5);">
      <div class="card-body" style="padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <p style="margin: 0; color: var(--fg); font-size: 14px; flex: 1;">${message.text}</p>
          <span style="color: var(--fg-soft); font-size: 12px; white-space: nowrap;">${timeStr}</span>
        </div>
      </div>
    </article>
  `;
}

/**
 * Render unread message for Talk
 * @param {Object} message - Message object
 * @returns {string} HTML string
 */
function renderTalkMessage(message) {
  const timeStr = formatTime(message.timestamp);
  return `
    <div class="message message-from-tendai" data-message-id="${message.id}" style="margin-bottom: 12px;">
      <div class="message-content" style="background: rgba(246, 195, 106, 0.1); border-left: 3px solid rgba(246, 195, 106, 0.5); padding: 12px 16px; border-radius: 8px;">
        <p style="margin: 0 0 4px 0; color: var(--fg); font-size: 14px;">${message.text}</p>
        <span style="color: var(--fg-soft); font-size: 11px;">${timeStr}</span>
      </div>
    </div>
  `;
}

/**
 * Display unread messages in Feed
 * FEED = context only, no "unread" / debt. We never show Unread section in Feed.
 */
export function displayUnreadFeedMessages() {
  const feedView = document.getElementById('feed-view');
  const screenFeed = document.getElementById('screen-feed');
  // Only remove any legacy unread section; never add Unread to Feed
  const existingSection = feedView?.querySelector('#unread-feed-section');
  if (existingSection) existingSection.remove();
  const existingSectionMobile = screenFeed?.querySelector('#unread-feed-section');
  if (existingSectionMobile) existingSectionMobile.remove();
}

/**
 * Display unread messages in Talk
 */
export function displayUnreadTalkMessages() {
  const talkView = document.getElementById('talk-view');
  const talkMessagesContainer = talkView?.querySelector('.talk-messages') || talkView?.querySelector('#talk-messages');
  
  if (!talkMessagesContainer) return;
  
  const unreadTalk = getUnreadMessages('talk');
  
  if (unreadTalk.length === 0) {
    // Remove existing unread messages
    const existingMessages = talkMessagesContainer.querySelectorAll('[data-message-id]');
    existingMessages.forEach(msg => {
      if (msg.dataset.messageId && msg.dataset.messageId.startsWith('talk-')) {
        msg.remove();
      }
    });
    return;
  }
  
  // Remove existing unread messages first
  unreadTalk.forEach(msg => {
    const existing = talkMessagesContainer.querySelector(`[data-message-id="${msg.id}"]`);
    if (existing) existing.remove();
  });
  
  // Add unread messages at the top
  unreadTalk.forEach(msg => {
    const messageHTML = renderTalkMessage(msg);
    const firstChild = talkMessagesContainer.firstElementChild;
    if (firstChild) {
      firstChild.insertAdjacentHTML('beforebegin', messageHTML);
    } else {
      talkMessagesContainer.insertAdjacentHTML('afterbegin', messageHTML);
    }
  });
}

/**
 * Initialize unread messages display
 */
export function initUnreadMessages() {
  if (initUnreadMessages.initialized) return;
  initUnreadMessages.initialized = true;

  // Display in Feed
  displayUnreadFeedMessages();
  
  // Display in Talk
  displayUnreadTalkMessages();
}

// Export for global use
window.displayUnreadFeedMessages = displayUnreadFeedMessages;
window.displayUnreadTalkMessages = displayUnreadTalkMessages;
window.initUnreadMessages = initUnreadMessages;
window.markAllFeedAsRead = () => markAllAsRead('feed');
window.markAllTalkAsRead = () => markAllAsRead('talk');

