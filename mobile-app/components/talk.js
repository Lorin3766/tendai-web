// TendAI — Unified TALK Component (Mobile & Desktop)
// @owner: talk
// @role: ui
import { sendMessageToLLM } from '../js/features/talk/llm.js';
import { talkState } from '../js/state.js';
import { parseAndUpdateState } from '../js/features/talk/messageParser.js';

export class TalkComponent {
  constructor(container) {
    this.container = container;
    this.conversationArea = null;
    this.chatInput = null;
    this.sendBtn = null;
    this.scrollBtn = null;
    this.init();
  }

  init() {
    this.createHTML();
    this.attachEventListeners();
    this.loadChatHistory();
  }

  createHTML() {
    // Container is already #conversationCard with class conversation-card
    // Check if structure already exists (from HTML)
    this.conversationArea = this.container.querySelector('#chatLog');
    this.chatInput = this.container.querySelector('#chatInput');
    this.sendBtn = this.container.querySelector('#sendBtn');
    this.scrollBtn = this.container.querySelector('#scrollToBottomBtn');
    
    if (!this.conversationArea || !this.chatInput || !this.sendBtn) {
      // Structure doesn't exist, create it
      // Create scroll wrapper
      const scrollWrapper = document.createElement('div');
      scrollWrapper.className = 'chat-scroll-wrapper';
      
      // Create conversation area
      this.conversationArea = document.createElement('div');
      this.conversationArea.id = 'chatLog';
      this.conversationArea.className = 'conversation-area';
      this.conversationArea.setAttribute('aria-live', 'polite');
      
      scrollWrapper.appendChild(this.conversationArea);
      
      // Create input row
      const inputRow = document.createElement('div');
      inputRow.className = 'ai-input-row';
      
      this.chatInput = document.createElement('textarea');
      this.chatInput.id = 'chatInput';
      this.chatInput.className = 'input chat-textarea';
      this.chatInput.placeholder = 'Message';
      this.chatInput.setAttribute('aria-label', 'Type a message');
      this.chatInput.rows = 1;
      
      this.sendBtn = document.createElement('button');
      this.sendBtn.id = 'sendBtn';
      this.sendBtn.className = 'btn';
      this.sendBtn.textContent = 'Send';
      
      inputRow.appendChild(this.chatInput);
      inputRow.appendChild(this.sendBtn);
      
      // Create scroll to bottom button
      this.scrollBtn = document.createElement('button');
      this.scrollBtn.id = 'scrollToBottomBtn';
      this.scrollBtn.className = 'scroll-to-bottom-btn';
      this.scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
      this.scrollBtn.textContent = '↓';
      this.scrollBtn.hidden = true;
      
      // Set container styles
      this.container.style.position = 'relative';
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.flex = '1';
      this.container.style.minHeight = '0';
      this.container.style.overflow = 'hidden';
      
      // Append to container
      this.container.appendChild(scrollWrapper);
      this.container.appendChild(inputRow);
      this.container.appendChild(this.scrollBtn);
    }
    
    // Ensure container has proper styles
    if (!this.container.style.position) {
      this.container.style.position = 'relative';
    }
    if (!this.container.style.display) {
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.flex = '1';
      this.container.style.minHeight = '0';
      this.container.style.overflow = 'hidden';
    }
  }

  attachEventListeners() {
    // Send button
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }
    
    // Enter key (Shift+Enter for new line)
    if (this.chatInput) {
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!this.sendBtn.disabled) {
            this.sendMessage();
          }
        }
      });
      
      // Auto-resize
      this.chatInput.addEventListener('input', () => this.autoResizeTextarea());
    }
    
    // Scroll to bottom button
    if (this.scrollBtn) {
      this.scrollBtn.addEventListener('click', () => {
        this.scrollToBottom();
        this.scrollBtn.hidden = true;
      });
    }
    
    // Scroll listeners
    const handleScroll = () => this.updateScrollToBottomButton();
    if (this.conversationArea) {
      this.conversationArea.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    // Also listen to scroll wrapper if it exists
    const scrollWrapper = this.conversationArea.closest('.chat-scroll-wrapper');
    if (scrollWrapper) {
      scrollWrapper.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    // MutationObserver for new messages
    if (this.conversationArea) {
      const observer = new MutationObserver(() => {
        this.updateScrollToBottomButton();
      });
      observer.observe(this.conversationArea, { childList: true, subtree: true });
    }
  }

  // Format date for separator
  formatDateForSeparator(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Format date for display
  formatDateDisplay(date) {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    
    if (dDate.getTime() === todayDate.getTime()) {
      return 'Today';
    } else if (dDate.getTime() === yesterdayDate.getTime()) {
      return 'Yesterday';
    } else {
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];
      const month = months[d.getMonth()];
      const day = d.getDate();
      return `${month} ${day}`;
    }
  }

  // Format time for message
  formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // Add date separator
  addDateSeparator(date) {
    if (!this.conversationArea) return null;
    
    const existingSeparators = this.conversationArea.querySelectorAll('.date-separator');
    const dateStr = this.formatDateForSeparator(date);
    for (let sep of existingSeparators) {
      if (sep.getAttribute('data-date') === dateStr) {
        return null;
      }
    }
    
    const separatorDiv = document.createElement('div');
    separatorDiv.className = 'date-separator';
    separatorDiv.setAttribute('data-date', dateStr);
    
    const separatorText = document.createElement('span');
    separatorText.className = 'date-separator-text';
    separatorText.textContent = this.formatDateDisplay(date);
    
    separatorDiv.appendChild(separatorText);
    this.conversationArea.appendChild(separatorDiv);
    
    return separatorDiv;
  }

  // Check and add date separator
  checkAndAddDateSeparator(messageDate) {
    const lastMessage = this.conversationArea?.lastElementChild;
    
    if (!lastMessage || !lastMessage.classList.contains('message')) {
      this.addDateSeparator(messageDate);
      return;
    }
    
    const lastMessageDate = lastMessage.getAttribute('data-timestamp');
    if (lastMessageDate) {
      const lastDate = new Date(parseInt(lastMessageDate));
      const lastDateStr = this.formatDateForSeparator(lastDate);
      const currentDateStr = this.formatDateForSeparator(messageDate);
      
      if (lastDateStr !== currentDateStr) {
        this.addDateSeparator(messageDate);
      }
    } else {
      this.addDateSeparator(messageDate);
    }
  }

  // Add message to chat
  addMessageToChat(text, type = 'user', shouldSave = true, timestamp = null) {
    if (!this.conversationArea) return null;
    
    if (timestamp === null) {
      timestamp = Date.now();
    }
    const messageDate = new Date(timestamp);
    this.checkAndAddDateSeparator(messageDate);
    
    // Map 'bot' type to 'bot' class, 'ai' to 'bot', 'user' stays 'user'
    const messageType = (type === 'bot' || type === 'ai') ? 'bot' : 'user';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${messageType} message-appearing`;
    messageDiv.setAttribute('data-timestamp', timestamp);
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.textContent = text;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = this.formatMessageTime(timestamp);
    
    messageContent.appendChild(textP);
    messageContent.appendChild(timeSpan);
    messageDiv.appendChild(messageContent);
    this.conversationArea.appendChild(messageDiv);
    
    requestAnimationFrame(() => {
      messageDiv.classList.add('message-visible');
    });
    
    // Auto-scroll to bottom after adding message
    this.scrollToBottom();
    setTimeout(() => this.scrollToBottom(), 50);
    setTimeout(() => this.scrollToBottom(), 150);
    setTimeout(() => this.scrollToBottom(), 300);
    
    if (shouldSave) {
      this.saveChatHistory();
    }
    
    return messageDiv;
  }

  // Show typing indicator
  showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot typing-indicator';
    typingDiv.id = 'typingIndicator';
    
    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.innerHTML = `TendAI is thinking<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
    
    typingDiv.appendChild(textP);
    this.conversationArea.appendChild(typingDiv);
    this.scrollToBottom();
    
    return typingDiv;
  }

  // Remove typing indicator
  removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // Scroll to bottom
  scrollToBottom() {
    if (!this.conversationArea) return;
    
    // Find the actual scroll container (chat-scroll-wrapper on mobile, conversation-area on desktop)
    const scrollWrapper = this.conversationArea.closest('.chat-scroll-wrapper');
    const scrollContainer = scrollWrapper || this.conversationArea;
    
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      // Scroll to the very bottom, accounting for padding
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      scrollContainer.scrollTop = Math.max(0, maxScroll);
      
      // Force a reflow to ensure scroll happens
      void scrollContainer.offsetHeight;
      
      // Double-check: scroll again after a tiny delay to handle dynamic content
      setTimeout(() => {
        const finalMaxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollContainer.scrollTop = Math.max(0, finalMaxScroll);
        this.updateScrollToBottomButton();
      }, 10);
    });
    
    this.updateScrollToBottomButton();
  }

  // Update scroll button visibility
  updateScrollToBottomButton() {
    if (!this.scrollBtn || !this.conversationArea) return;
    
    // Check both conversation area and scroll wrapper
    const scrollWrapper = this.conversationArea.closest('.chat-scroll-wrapper');
    const scrollContainer = scrollWrapper || this.conversationArea;
    
    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    if (distanceFromBottom > 100) {
      this.scrollBtn.hidden = false;
    } else {
      this.scrollBtn.hidden = true;
    }
  }

  // Auto-resize textarea
  autoResizeTextarea() {
    if (!this.chatInput || this.chatInput.tagName !== 'TEXTAREA') return;
    
    this.chatInput.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(this.chatInput).lineHeight) || 20;
    const maxHeight = lineHeight * 3;
    const scrollHeight = this.chatInput.scrollHeight;
    
    if (scrollHeight <= maxHeight) {
      this.chatInput.style.height = scrollHeight + 'px';
      this.chatInput.style.overflowY = 'hidden';
    } else {
      this.chatInput.style.height = maxHeight + 'px';
      this.chatInput.style.overflowY = 'auto';
    }
  }

  // Save chat history to localStorage
  saveChatHistory() {
    if (!this.conversationArea) return;
    
    try {
      const messages = [];
      const messageElements = this.conversationArea.querySelectorAll('.message');
      messageElements.forEach(msgEl => {
        const text = msgEl.querySelector('.message-text')?.textContent || '';
        const type = msgEl.classList.contains('bot') ? 'ai' : 'user';
        const timestamp = msgEl.getAttribute('data-timestamp');
        if (text.trim() && !msgEl.classList.contains('typing-indicator')) {
          messages.push({ 
            text, 
            type,
            timestamp: timestamp ? parseInt(timestamp) : Date.now()
          });
        }
      });
      
      // Save to localStorage with key "tendai_chat_history"
      localStorage.setItem('tendai_chat_history', JSON.stringify(messages));
      
      // Also update talkState for compatibility
      const talkData = talkState.get();
      talkData.history = messages;
      if (messages.length > 0) {
        const lastUserMsg = messages.filter(m => m.type === 'user').pop();
        const lastBotMsg = messages.filter(m => m.type === 'ai').pop();
        talkData.lastMessage = lastUserMsg?.text || null;
        talkData.lastReply = lastBotMsg?.text || null;
      }
      talkState.save(talkData);
    } catch (error) {
      // Error saving chat history
    }
  }

  // Load chat history from localStorage
  loadChatHistory() {
    if (!this.conversationArea) return;
    
    try {
      // Try to load from "tendai_chat_history" first, fallback to talkState
      let history = [];
      const storedHistory = localStorage.getItem('tendai_chat_history');
      if (storedHistory) {
        try {
          history = JSON.parse(storedHistory);
        } catch (parseError) {
          const talkData = talkState.get();
          history = talkData.history || [];
        }
      } else {
        // Fallback to talkState
        const talkData = talkState.get();
        history = talkData.history || [];
      }
      
      // Normalize type: convert 'bot' to 'ai' if needed
      history = history.map(msg => ({
        ...msg,
        type: msg.type === 'bot' ? 'ai' : msg.type
      }));
      
      this.conversationArea.innerHTML = '';
      
      if (history.length > 0) {
        let lastDateStr = null;
        history.forEach((msg, index) => {
          const timestamp = msg.timestamp || (Date.now() - (history.length - index) * 60000);
          const msgDate = new Date(timestamp);
          const currentDateStr = this.formatDateForSeparator(msgDate);
          
          if (lastDateStr !== null && lastDateStr !== currentDateStr) {
            this.addDateSeparator(msgDate);
          } else if (lastDateStr === null) {
            this.addDateSeparator(msgDate);
          }
          
          lastDateStr = currentDateStr;
          
          // Map 'ai' type to 'bot' class for styling
          const messageType = msg.type === 'ai' ? 'bot' : msg.type;
          
          const messageDiv = document.createElement('div');
          messageDiv.className = `message ${messageType} message-visible`;
          messageDiv.setAttribute('data-timestamp', timestamp);
          
          const messageContent = document.createElement('div');
          messageContent.className = 'message-content';
          
          const textP = document.createElement('p');
          textP.className = 'message-text';
          textP.textContent = msg.text;
          
          const timeSpan = document.createElement('span');
          timeSpan.className = 'message-time';
          timeSpan.textContent = this.formatMessageTime(timestamp);
          
          messageContent.appendChild(textP);
          messageContent.appendChild(timeSpan);
          messageDiv.appendChild(messageContent);
          this.conversationArea.appendChild(messageDiv);
        });
      } else {
        // Show welcome message if history is empty
        this.addDateSeparator(new Date());
        const welcomeText = 'Hi, I\'m TendAI. What\'s on your mind today? I\'m here to help.';
        const welcomeTimestamp = Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot message-visible';
        messageDiv.setAttribute('data-timestamp', welcomeTimestamp);
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const textP = document.createElement('p');
        textP.className = 'message-text';
        textP.textContent = welcomeText;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = this.formatMessageTime(welcomeTimestamp);
        
        messageContent.appendChild(textP);
        messageContent.appendChild(timeSpan);
        messageDiv.appendChild(messageContent);
        this.conversationArea.appendChild(messageDiv);
      }
      
      // Auto-scroll to bottom after loading history
      requestAnimationFrame(() => {
        this.scrollToBottom();
        setTimeout(() => this.scrollToBottom(), 50);
        setTimeout(() => this.scrollToBottom(), 150);
      });
    } catch (error) {
      requestAnimationFrame(() => this.scrollToBottom());
    }
  }

  // Send message
  async sendMessage() {
    if (!this.chatInput || !this.sendBtn) return;

    const messageText = this.chatInput.value.trim();
    if (!messageText) return;

    this.chatInput.disabled = true;
    this.sendBtn.disabled = true;
    this.sendBtn.textContent = 'Sending...';

    try {
      // Add user message
      this.addMessageToChat(messageText, 'user');
      this.chatInput.value = '';
      this.autoResizeTextarea();

      // Show typing indicator after a short delay
      await new Promise(resolve => setTimeout(resolve, 300));
      const typingIndicator = this.showTypingIndicator();

      // Send to LLM
      const reply = await sendMessageToLLM(messageText);

      // Remove typing indicator
      this.removeTypingIndicator();

      // Small delay before showing reply
      await new Promise(resolve => setTimeout(resolve, 200));

      const stateUpdates = parseAndUpdateState(messageText);
      
      // Add AI reply
      this.addMessageToChat(reply, 'ai');
      
      // Ensure scroll to bottom after reply
      setTimeout(() => this.scrollToBottom(), 100);
      setTimeout(() => this.scrollToBottom(), 300);
      setTimeout(() => this.scrollToBottom(), 500);
      
      // Update talkState for compatibility
      talkState.update('lastMessage', messageText);
      talkState.update('lastReply', reply);
      
      // Check for unread messages (if user is not on Talk screen)
      if (window.checkUnreadMessages) {
        setTimeout(() => {
          window.checkUnreadMessages();
        }, 100);
      }
      
      if (stateUpdates.dayState || stateUpdates.profileState || stateUpdates.feedState) {
        setTimeout(() => {
          if (window.updateFeedUI) window.updateFeedUI();
          if (window.updateProfileUI) window.updateProfileUI();
        }, 100);
      }

    } catch (error) {
      // Remove typing indicator on error
      this.removeTypingIndicator();

      // Формируем понятное сообщение об ошибке
      let friendlyMessage = 'I\'m having trouble connecting right now. Please check your internet connection and try again.';
      
      const errorMsg = error.message || '';
      
      // Обрабатываем разные типы ошибок
      if (errorMsg.includes('trouble connecting') || 
          errorMsg.includes('internet connection') ||
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('NetworkError')) {
        friendlyMessage = 'I\'m having trouble connecting right now. Please check your internet connection and try again.';
      } else if (errorMsg.includes('took too long') || 
                 errorMsg.includes('timeout')) {
        friendlyMessage = 'The request took too long. Please try again in a moment.';
      } else if (errorMsg.includes('CORS') || 
                 errorMsg.includes('cross-origin')) {
        friendlyMessage = 'Connection issue detected. Please refresh the page and try again.';
      } else if (errorMsg && errorMsg.length > 0 && 
                 !errorMsg.includes('TypeError') && 
                 !errorMsg.includes('SyntaxError')) {
        // Используем сообщение от backend, если оно понятное
        friendlyMessage = errorMsg;
      }
      
      // Add error message as AI reply
      this.addMessageToChat(friendlyMessage, 'ai');
      
      // Прокручиваем к сообщению об ошибке
      setTimeout(() => this.scrollToBottom(), 100);
    } finally {
      this.chatInput.disabled = false;
      this.sendBtn.disabled = false;
      this.sendBtn.textContent = 'Send';
      this.chatInput.focus();
    }
  }
}

