// Serron — Message Queue (Unread Queue like Telegram)
// @owner: storage
// @role: state
// Stores and manages unread messages for Feed and Talk

const QUEUE_KEY = 'tendai-message-queue';
const MAX_DAYS_TO_KEEP = 7; // Keep messages for 7 days

/**
 * Get all messages from queue
 * @returns {Array} Array of message objects
 */
function getMessageQueue() {
  try {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (!stored) return [];
    const queue = JSON.parse(stored);
    // Clean old messages
    return cleanOldMessages(queue);
  } catch (error) {
    console.error('[MESSAGE QUEUE] Error reading queue', error);
    return [];
  }
}

/**
 * Save message queue to localStorage
 * @param {Array} queue - Array of message objects
 */
function saveMessageQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[MESSAGE QUEUE] Error saving queue', error);
  }
}

/**
 * Clean messages older than MAX_DAYS_TO_KEEP
 * @param {Array} queue - Array of messages
 * @returns {Array} Cleaned queue
 */
function cleanOldMessages(queue) {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - MAX_DAYS_TO_KEEP * 24 * 60 * 60 * 1000);
  
  return queue.filter(msg => {
    const msgDate = new Date(msg.timestamp);
    return msgDate > cutoffDate;
  });
}

/**
 * Generate unique message ID
 * @param {string} type - Message type (feed | talk)
 * @param {string} subtype - Message subtype
 * @param {string} dateKey - Date key (YYYY-MM-DD)
 * @returns {string} Unique message ID
 */
function generateMessageId(type, subtype, dateKey) {
  return `${type}-${subtype}-${dateKey}`;
}

/**
 * Check if message already exists (anti-duplicate)
 * @param {Array} queue - Current message queue
 * @param {string} type - Message type
 * @param {string} subtype - Message subtype
 * @param {string} dateKey - Date key
 * @param {string} text - Message text
 * @returns {Object|null} Existing message or null
 */
function findDuplicate(queue, type, subtype, dateKey, text) {
  return queue.find(msg => 
    msg.type === type &&
    msg.subtype === subtype &&
    msg.dateKey === dateKey &&
    msg.text === text
  );
}

/**
 * Add message to queue (with anti-duplicate)
 * @param {Object} messageData - Message data
 * @param {string} messageData.type - Message type (feed | talk)
 * @param {string} messageData.subtype - Message subtype
 * @param {string} messageData.text - Message text
 * @param {string} [messageData.dateKey] - Date key (YYYY-MM-DD), defaults to today
 * @returns {Object|null} Added message or null if duplicate
 */
export function addMessage({ type, subtype, text, dateKey }) {
  if (!type || !subtype || !text) {
    console.error('[MESSAGE QUEUE] Missing required fields', { type, subtype, text });
    return null;
  }
  
  const queue = getMessageQueue();
  const today = new Date().toISOString().split('T')[0];
  const msgDateKey = dateKey || today;
  
  // Check for duplicate (same type, subtype, date, and text)
  const duplicate = findDuplicate(queue, type, subtype, msgDateKey, text);
  
  if (duplicate) {
    // Update timestamp if duplicate found (refresh the message)
    duplicate.timestamp = new Date().toISOString();
    saveMessageQueue(queue);
    if (!window.IS_PRODUCTION_READY) {
      console.log('[MESSAGE QUEUE] Updated existing message:', duplicate.id);
    }
    return duplicate;
  }
  
  // Create new message
  const messageId = generateMessageId(type, subtype, msgDateKey);
  const message = {
    id: messageId,
    type: type,
    subtype: subtype,
    text: text,
    timestamp: new Date().toISOString(),
    status: 'unread',
    dateKey: msgDateKey
  };
  
  queue.push(message);
  saveMessageQueue(queue);
  
  if (!window.IS_PRODUCTION_READY) {
    console.log('[MESSAGE QUEUE] Added message:', message.id);
  }
  return message;
}

/**
 * Get unread messages
 * @param {string} [type] - Filter by type (feed | talk), optional
 * @param {number} [limit] - Maximum number of messages to return (default: 2 for unread queue)
 * @returns {Array} Array of unread messages
 */
export function getUnreadMessages(type, limit = 2) {
  const queue = getMessageQueue();
  let unread = queue.filter(msg => msg.status === 'unread');
  
  if (type) {
    unread = unread.filter(msg => msg.type === type);
  }
  
  // Sort by timestamp (oldest first)
  unread.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // ANTI-SPAM: Limit unread messages shown
  // If more than limit, show only the last one (most recent)
  if (unread.length > limit) {
    // Return only the last (most recent) message
    return [unread[unread.length - 1]];
  }
  
  return unread;
}

/**
 * Get all messages by type
 * @param {string} type - Message type (feed | talk)
 * @returns {Array} Array of messages
 */
export function getMessagesByType(type) {
  const queue = getMessageQueue();
  return queue.filter(msg => msg.type === type);
}

/**
 * Mark message as read
 * @param {string} messageId - Message ID
 */
export function markMessageAsRead(messageId) {
  const queue = getMessageQueue();
  const message = queue.find(msg => msg.id === messageId);
  
  if (message) {
    message.status = 'read';
    saveMessageQueue(queue);
    if (!window.IS_PRODUCTION_READY) {
      console.log('[MESSAGE QUEUE] Marked as read:', messageId);
    }
  }
}

/**
 * Mark all messages of a type as read
 * @param {string} type - Message type (feed | talk)
 */
export function markAllAsRead(type) {
  const queue = getMessageQueue();
  let updated = false;
  
  queue.forEach(msg => {
    if (msg.type === type && msg.status === 'unread') {
      msg.status = 'read';
      updated = true;
    }
  });
  
  if (updated) {
    saveMessageQueue(queue);
    if (!window.IS_PRODUCTION_READY) {
      console.log('[MESSAGE QUEUE] Marked all as read:', type);
    }
  }
}

/**
 * Get unread count by type
 * @param {string} type - Message type (feed | talk)
 * @returns {number} Count of unread messages
 */
export function getUnreadCount(type) {
  return getUnreadMessages(type).length;
}

/**
 * Clear all messages (for testing/debugging)
 */
export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
  if (!window.IS_PRODUCTION_READY) {
    console.log('[MESSAGE QUEUE] Queue cleared');
  }
}

// Export for global use
window.addMessageToQueue = addMessage;
window.getUnreadMessages = getUnreadMessages;
window.markAllAsRead = markAllAsRead;
window.getUnreadCount = getUnreadCount;
window.clearMessageQueue = clearQueue;

