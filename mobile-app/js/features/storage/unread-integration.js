// Serron — Unread Integration (Auto-add unread items)
// @owner: storage
// @role: integration
// Automatically adds unread items when FEED cards or TALK messages are created

import { addUnreadItem } from './unread-badges.js';

/**
 * Mark FEED card as unread
 * @param {string} cardId - Card element ID
 * @param {string} [identifier] - Optional unique identifier
 * @param {Object} [metadata] - Optional metadata
 */
export function markFeedCardAsUnread(cardId, identifier, metadata = {}) {
  if (!cardId) return;
  
  // Wait for element to exist
  requestAnimationFrame(() => {
    const card = document.getElementById(cardId) || 
                 document.querySelector(`[data-unread-id="${cardId}"]`);
    
    if (card) {
      // Set data attribute for tracking
      if (!card.id) {
        card.id = cardId;
      }
      card.setAttribute('data-unread-id', cardId);
      
      // Add to unread items
      addUnreadItem({
        type: 'feed',
        elementId: cardId,
        identifier: identifier || cardId,
        metadata
      });
    }
  });
}

/**
 * Mark TALK message as unread
 * @param {string} messageId - Message element ID
 * @param {string} [identifier] - Optional unique identifier
 * @param {Object} [metadata] - Optional metadata
 */
export function markTalkMessageAsUnread(messageId, identifier, metadata = {}) {
  if (!messageId) return;
  
  // Wait for element to exist
  requestAnimationFrame(() => {
    const message = document.getElementById(messageId) || 
                   document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (message) {
      // Set data attribute for tracking
      if (!message.id) {
        message.id = messageId;
      }
      message.setAttribute('data-message-id', messageId);
      
      // Add to unread items (only for AI messages)
      const isAIMessage = message.classList.contains('message-ai') || 
                         message.getAttribute('data-message-type') === 'ai' ||
                         message.getAttribute('data-message-type') === 'bot';
      
      if (isAIMessage) {
        addUnreadItem({
          type: 'talk',
          elementId: messageId,
          identifier: identifier || messageId,
          metadata
        });
      }
    }
  });
}

/**
 * Watch for new FEED cards and mark them as unread
 */
export function watchForNewFeedCards() {
  const feedView = document.getElementById('feed-view');
  if (!feedView) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          // Check if it's a card-soft element or contains one
          let card = null;
          if (node.classList?.contains('card-soft')) {
            card = node;
          } else {
            // Check if node contains a card-soft (for insertAdjacentHTML case)
            card = node.querySelector?.('.card-soft');
            // Also check if node itself might be a card (for direct insertion)
            if (!card && node.querySelector) {
              const allCards = node.querySelectorAll('.card-soft');
              if (allCards.length > 0) {
                card = allCards[0]; // Take first card
              }
            }
          }
          
          if (card) {
            const cardId = card.id || card.getAttribute('data-unread-id');
            if (cardId && !card.hasAttribute('data-unread-tracked')) {
              // Mark as tracked to avoid duplicates
              card.setAttribute('data-unread-tracked', 'true');
              // New card - mark as unread (with delay to ensure DOM is ready)
              setTimeout(() => {
                markFeedCardAsUnread(cardId);
              }, 50);
            }
          }
        }
      });
    });
  });
  
  observer.observe(feedView, {
    childList: true,
    subtree: true
  });
}

/**
 * Watch for new TALK messages and mark AI messages as unread
 */
export function watchForNewTalkMessages() {
  const conversationArea = document.getElementById('chatLog');
  if (!conversationArea) return;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          // Check if it's a message element
          const message = node.classList?.contains('message-ai') || 
                         node.classList?.contains('message') ? node :
                         node.querySelector?.('.message-ai, .message[data-message-type="ai"]');
          
          if (message) {
            // Skip messages loaded from history
            if (message.getAttribute('data-from-history') === 'true') {
              return;
            }
            
            const isAIMessage = message.classList.contains('message-ai') || 
                               message.getAttribute('data-message-type') === 'ai' ||
                               message.getAttribute('data-message-type') === 'bot';
            
            if (isAIMessage) {
              // Generate message ID if not exists
              let messageId = message.id || message.getAttribute('data-message-id');
              if (!messageId) {
                messageId = `talk-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                message.id = messageId;
                message.setAttribute('data-message-id', messageId);
              }
              
              // Skip if already tracked
              if (message.hasAttribute('data-unread-tracked')) {
                return;
              }
              
              // Mark as tracked
              message.setAttribute('data-unread-tracked', 'true');
              
              // Check if user is at bottom - if not, mark as unread
              const isAtBottom = window.isUserAtBottomOfTalk?.() || false;
              if (!isAtBottom) {
                // Delay to ensure element is fully in DOM
                setTimeout(() => {
                  markTalkMessageAsUnread(messageId);
                }, 50);
              }
            }
          }
        }
      });
    });
  });
  
  observer.observe(conversationArea, {
    childList: true,
    subtree: true
  });
}

/**
 * Initialize all watchers
 */
export function initUnreadWatchers() {
  watchForNewFeedCards();
  watchForNewTalkMessages();
}

// Export for global use
window.markFeedCardAsUnread = markFeedCardAsUnread;
window.markTalkMessageAsUnread = markTalkMessageAsUnread;
window.watchForNewFeedCards = watchForNewFeedCards;
window.watchForNewTalkMessages = watchForNewTalkMessages;
window.initUnreadWatchers = initUnreadWatchers;

