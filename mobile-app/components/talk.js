// Serron — Unified TALK Component (Mobile & Desktop)
// @owner: talk
// @role: ui
import { sendMessageToLLM } from '../js/features/talk/llm.js';
import { getCommonLedger } from '../js/features/human-os/common-ledger.js';
import { getSystemContextDetails, getUserProfile } from '../js/features/talk/talk-context.js';
import { recordDataSent, DATA_SENT_REQUEST_TYPES } from '../js/features/talk/data-sent-log.js';
import { isAutoProfileQuestionsEnabled } from '../js/features/settings/auto-requests.js';
import { talkState, profileState } from '../js/state.js';
import { getNextProfileQuestion } from '../js/features/profile/profile-schema.js';
import { setProfileQuestionsSnoozed } from '../js/features/feed/next-step.js';
import {
  parseProfileAnswer,
  applyProfileTalkAnswer,
  getConversationalAsk,
} from '../js/features/talk/profile-answer-parser.js';
import { parseAndUpdateState } from '../js/features/talk/messageParser.js';
import { extractRoutineSuggestionFromText, protocolIdForRoutine } from '../js/features/talk/talk-engine.js';
import { getUserMemory, learnFromUserMessage } from '../js/features/talk/user-memory.js';
import { addMessage } from '../js/features/storage/message-queue.js';
import { storageManager } from '../js/core/storage.js';
import { publishBackendStatus } from '../js/core/backend-fetch.js';

/** Regex for [SIGNAL: XYZ] — TendAI secret sauce: offer to save to Feed/Profile */
const SIGNAL_REGEX = /\[SIGNAL:\s*([^\]]+)\]/gi;
const PROACTIVE_TALK_SESSION_LIMIT = 3;

/**
 * Show or hide the amber advisory badge on all Talk navigation elements.
 * @param {boolean} visible
 */
function updateTalkBadgeVisibility(visible) {
  document.querySelectorAll('.talk-advisory-badge').forEach((el) => {
    /** @type {HTMLElement} */ (el).style.display = visible ? '' : 'none';
  });
}

export class TalkComponent {
  constructor(container) {
    this.container = container;
    this.conversationArea = null;
    this.chatInput = null;
    this.sendBtn = null;
    this.scrollBtn = null;
    this.selectMode = false;
    this.selectModeBar = null;
    this._profilePromptSeq = 0;
    this._proactiveAnswersThisSession = 0;
    this._awaitingPaceChoice = false;
    this._proactivePassiveThisSession = false;
    setProfileQuestionsSnoozed(false);
    this.init();
  }

  init() {
    this.createHTML();
    this.attachEventListeners();
    this.setupOverflowMenu();
    this.loadChatHistory();
    this.initAdvisoryBlock();
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
      
      // Create input row (pill wraps textarea + send; matches static index.html)
      const inputRow = document.createElement('div');
      inputRow.className = 'ai-input-row';
      const inputPill = document.createElement('div');
      inputPill.className = 'talk-input-pill';

      this.chatInput = document.createElement('textarea');
      this.chatInput.id = 'chatInput';
      this.chatInput.className = 'input chat-textarea';
      this.chatInput.placeholder = 'Message';
      this.chatInput.setAttribute('aria-label', 'Type a message');
      this.chatInput.rows = 1;

      this.sendBtn = document.createElement('button');
      this.sendBtn.type = 'button';
      this.sendBtn.id = 'sendBtn';
      this.sendBtn.className = 'btn talk-input-send';
      this.sendBtn.textContent = 'Send';

      inputPill.appendChild(this.chatInput);
      inputPill.appendChild(this.sendBtn);
      inputRow.appendChild(inputPill);
      
      // Create scroll to bottom button
      this.scrollBtn = document.createElement('button');
      this.scrollBtn.id = 'scrollToBottomBtn';
      this.scrollBtn.className = 'scroll-to-bottom-btn';
      this.scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
      this.scrollBtn.textContent = '↓';
      this.scrollBtn.hidden = true;
      
      // Set container styles (overflow from CSS so overlay menu is not clipped)
      this.container.style.position = 'relative';
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.flex = '1';
      this.container.style.minHeight = '0';
      
      // Append to container
      this.container.appendChild(scrollWrapper);
      this.container.appendChild(inputRow);
      this.container.appendChild(this.scrollBtn);
    }
    
    // Ensure container has proper styles (overflow left to CSS so overlay menu is not clipped)
    if (!this.container.style.position) {
      this.container.style.position = 'relative';
    }
    if (!this.container.style.display) {
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      this.container.style.flex = '1';
      this.container.style.minHeight = '0';
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
      
      // Auto-resize + Send enabled only when there is text
      this.chatInput.addEventListener('input', () => {
        this.autoResizeTextarea();
        this.syncSendButtonState();
      });
      this.syncSendButtonState();
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

  setupOverflowMenu() {
    const btn = document.getElementById('talkOverflowBtn');
    const menu = document.getElementById('talkOverflowMenu');
    if (!btn || !menu) return;

    const closeMenu = () => {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', this._boundCloseOverflowOnOutside);
    };

    this._boundCloseOverflowOnOutside = (e) => {
      if (btn.contains(e.target) || menu.contains(e.target)) return;
      closeMenu();
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('is-open');
      if (isOpen) {
        closeMenu();
        return;
      }
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(() => document.addEventListener('click', this._boundCloseOverflowOnOutside), 0);
    });

    menu.querySelectorAll('[data-action]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = item.getAttribute('data-action');
        closeMenu();
        document.removeEventListener('click', this._boundCloseOverflowOnOutside);
        this.handleOverflowAction(action);
      });
    });
  }

  handleOverflowAction(action) {
    if (action === 'clear-selected') {
      this.enterSelectMode();
    } else if (action === 'clear-chat') {
      this.showClearChatModal();
    } else if (action === 'report') {
      this.copyReportInfo();
    }
  }

  enterSelectMode() {
    if (this.selectMode) return;
    this.selectMode = true;
    this.container.classList.add('talk-select-mode');
    const bar = document.createElement('div');
    bar.className = 'talk-select-bar';
    bar.innerHTML = '<span class="talk-select-label">Select messages</span><button type="button" class="talk-select-cancel">Cancel</button><button type="button" class="talk-select-delete" disabled>Delete (0)</button>';
    this.container.insertBefore(bar, this.container.firstChild);
    this.selectModeBar = bar;
    const cancelBtn = bar.querySelector('.talk-select-cancel');
    const deleteBtn = bar.querySelector('.talk-select-delete');
    cancelBtn.addEventListener('click', () => this.exitSelectMode());
    deleteBtn.addEventListener('click', () => this.deleteSelectedMessages());
    const updateDeleteBtn = () => {
      const n = this.container.querySelectorAll('.message.talk-selectable.selected').length;
      deleteBtn.disabled = n === 0;
      deleteBtn.textContent = 'Delete (' + n + ')';
    };
    this.conversationArea.querySelectorAll('.message').forEach((el) => {
      if (el.classList.contains('sleep-flow-message') || el.hasAttribute('data-sleep-checkin-id') || el.classList.contains('typing-indicator')) return;
      if (el.classList.contains('date-separator')) return;
      if (!el.hasAttribute('data-msg-id')) return;
      el.classList.add('talk-selectable');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', (e) => {
        e.preventDefault();
        el.classList.toggle('selected');
        updateDeleteBtn();
      });
    });
    updateDeleteBtn();
  }

  exitSelectMode() {
    if (!this.selectMode) return;
    this.selectMode = false;
    this.container.classList.remove('talk-select-mode');
    if (this.selectModeBar && this.selectModeBar.parentNode) {
      this.selectModeBar.remove();
    }
    this.selectModeBar = null;
    this.conversationArea.querySelectorAll('.message.talk-selectable').forEach((el) => {
      el.classList.remove('talk-selectable', 'selected');
      el.removeAttribute('tabindex');
    });
  }

  deleteSelectedMessages() {
    this.container.querySelectorAll('.message.talk-selectable.selected').forEach((el) => el.remove());
    this.exitSelectMode();
    this.saveChatHistory();
  }

  showClearChatModal() {
    const overlay = document.createElement('div');
    overlay.className = 'talk-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'talk-clear-title');
    overlay.innerHTML = '<div class="talk-modal"><h2 id="talk-clear-title" class="talk-modal-title">Clear chat?</h2><p class="talk-modal-text">This will remove your chat messages on this device.</p><div class="talk-modal-actions"><button type="button" class="btn ghost talk-modal-cancel">Cancel</button><button type="button" class="btn talk-modal-clear">Clear</button></div></div>';
    document.body.appendChild(overlay);
    const close = () => {
      overlay.remove();
    };
    overlay.querySelector('.talk-modal-cancel').addEventListener('click', close);
    overlay.querySelector('.talk-modal-clear').addEventListener('click', () => {
      close();
      localStorage.removeItem('tendai_chat_history');
      const talkData = talkState.get();
      talkData.history = [];
      talkState.save(talkData);
      this.conversationArea.innerHTML = '';
      document.getElementById('talk-view')?.removeAttribute('data-talk-mode');
      this.loadChatHistory();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  copyReportInfo() {
    const runMode = typeof window !== 'undefined' && window.__obriumRunMode ? window.__obriumRunMode : 'unified';
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('tendai_')) keys.push(k);
    }
    const lines = [
      'RUN MODE: ' + runMode,
      'Local: ' + now.toISOString() + ' timezone=' + tz,
      'localStorage keys: ' + (keys.length ? keys.join(', ') : 'none')
    ];
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => this.showToast('Debug info copied')).catch(() => this.showToast('Copy failed'));
    } else {
      this.showToast('Copy failed');
    }
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'talk-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('talk-toast-visible'));
    setTimeout(() => {
      toast.classList.remove('talk-toast-visible');
      setTimeout(() => toast.remove(), 200);
    }, 2000);
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

  /**
   * Render a message with role-specific styling.
   * @param {'system'|'user'|'assistant'} role - system → [ SYSTEM LOG ], user → bubble, assistant → AI response
   * @param {string} text - Message content
   * @param {Object} [opts] - { shouldSave, timestamp }
   * @returns {HTMLElement|null}
   */
  renderMessage(role, text, opts = {}) {
    const { shouldSave = true, timestamp = null } = opts;
    if (role === 'system') {
      return this.addMessageToChat(text, 'system', shouldSave, timestamp);
    }
    if (role === 'user') {
      return this.addMessageToChat(text, 'user', shouldSave, timestamp);
    }
    if (role === 'assistant') {
      return this.addMessageToChat(text, 'ai', shouldSave, timestamp);
    }
    return this.addMessageToChat(text, 'user', shouldSave, timestamp);
  }

  // Add message to chat (AI messages get typing effect and command-center styling)
  addMessageToChat(text, type = 'user', shouldSave = true, timestamp = null, options = {}) {
    if (!this.conversationArea) return null;

    const isProfilePrompt = Boolean(options.profilePrompt);
    const profilePromptPath = options.profilePromptPath ? String(options.profilePromptPath) : '';

    if (timestamp === null) {
      timestamp = Date.now();
    }
    const messageDate = new Date(timestamp);
    this.checkAndAddDateSeparator(messageDate);

    const messageType = (type === 'bot' || type === 'ai' || type === 'system') ? 'bot' : 'user';
    const msgId = 'msg-' + timestamp;
    const isAi = messageType === 'bot';
    const isSystem = type === 'system';

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${messageType} message-appearing${isAi ? ' message-command-center' : ''}`;
    messageDiv.setAttribute('data-timestamp', timestamp);
    messageDiv.setAttribute('data-msg-id', msgId);
    if (isProfilePrompt && profilePromptPath) {
      messageDiv.setAttribute('data-profile-prompt-path', profilePromptPath);
    }

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    if (isSystem) {
      const sysHeader = document.createElement('div');
      sysHeader.className = 'message-system-header';
      sysHeader.textContent = 'System note';
      messageContent.appendChild(sysHeader);
    }

    const textP = document.createElement('p');
    textP.className = 'message-text' + (isSystem ? ' message-text-multiline' : '');
    textP.textContent = '';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time' + (isAi ? ' message-time-system' : '');
    timeSpan.textContent = this.formatMessageTime(timestamp);

    messageContent.appendChild(textP);
    messageContent.appendChild(timeSpan);
    messageDiv.appendChild(messageContent);
    this.conversationArea.appendChild(messageDiv);

    const finalizeAiMessage = (displayText, signal) => {
      textP.textContent = displayText;
      messageDiv.classList.remove('message-typing');
      messageDiv.classList.add('message-visible');
      if (!isProfilePrompt) {
        if (signal) this.appendSignalSaveButton(messageContent, signal, displayText);
        const routine = extractRoutineSuggestionFromText(displayText);
        if (routine) {
          const protocolId = protocolIdForRoutine(routine.label, routine.time);
          this.appendProtocolAddButton(messageContent, {
            id: protocolId,
            label: routine.label,
            time: routine.time,
          });
        }
        try {
          const ledger = getCommonLedger();
          if (ledger && Array.isArray(ledger.agent_insights) && ledger.agent_insights.length > 0) {
            this.appendAgentQuickReplies(messageContent);
          }
        } catch (_) {}
      }
      if (messageDiv.getAttribute('data-talk-pace-prompt') === '1') {
        this.appendPaceChoiceButtons(messageContent);
      }
      if (shouldSave) this.saveChatHistory();
    };

    if (isAi && text) {
      const fullText = String(text);
      const { displayText, signal } = this.parseSignalFromResponse(fullText);

      if (isSystem) {
        textP.textContent = displayText;
        requestAnimationFrame(() => messageDiv.classList.add('message-visible'));
        if (shouldSave) this.saveChatHistory();
      } else if (isProfilePrompt) {
        textP.textContent = displayText;
        requestAnimationFrame(() => messageDiv.classList.add('message-visible'));
        if (shouldSave) this.saveChatHistory();
      } else {
        messageDiv.classList.add('message-typing');
        const typingDelayMs = 25;
        const initialDelayMs = 200;
        let index = 0;
        const reveal = () => {
          if (index < displayText.length) {
            const chunk = displayText.slice(0, index + 1);
            textP.textContent = chunk;
            index += (displayText.length > 80 ? 2 : 1);
            this.scrollToBottom();
            setTimeout(reveal, typingDelayMs);
          } else {
            finalizeAiMessage(displayText, signal);
          }
        };
        requestAnimationFrame(() => messageDiv.classList.add('message-visible'));
        setTimeout(reveal, initialDelayMs);
      }
    } else {
      textP.textContent = text;
      requestAnimationFrame(() => messageDiv.classList.add('message-visible'));
      if (shouldSave) this.saveChatHistory();
    }

    this.scrollToBottom();
    setTimeout(() => this.scrollToBottom(), 50);
    setTimeout(() => this.scrollToBottom(), 150);
    setTimeout(() => this.scrollToBottom(), 300);

    return messageDiv;
  }

  /** Parse [SIGNAL: XYZ] from AI response. Returns { displayText, signal } */
  parseSignalFromResponse(text) {
    const str = String(text || '');
    const matches = str.match(SIGNAL_REGEX);
    if (!matches || matches.length === 0) return { displayText: str, signal: null };
    const displayText = str.replace(SIGNAL_REGEX, '').replace(/\s{2,}/g, ' ').trim() || str;
    const firstMatch = matches[0];
    const signal = firstMatch.replace(/\[SIGNAL:\s*/i, '').replace(/\]\s*$/i, '').trim();
    return { displayText, signal: signal || null };
  }

  /** Append "Save this to your Feed/Profile?" button when signal detected */
  appendSignalSaveButton(messageContent, signalLabel, fullText) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost talk-signal-save-btn';
    btn.textContent = 'Save this to your Feed/Profile?';
    btn.addEventListener('click', () => {
      const content = `[SIGNAL: ${signalLabel}] ${fullText}`;
      storageManager.routeSignal(signalLabel, content);
      addMessage({ type: 'feed', subtype: 'signal', text: content, dateKey: new Date().toISOString().split('T')[0] });
      btn.textContent = 'Saved';
      btn.disabled = true;
      this.showToast('Saved to Master Record');
      if (window.updateProfileCompletenessDisplay) window.updateProfileCompletenessDisplay();
    });
    messageContent.insertBefore(btn, messageContent.querySelector('.message-time'));
  }

  /** Append "Add to Human OS" when a routine (habit + time) is detected in the AI reply */
  appendProtocolAddButton(messageContent, { id, label, time }) {
    const timeEl = messageContent.querySelector('.message-time');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'talk-protocol-add-btn';
    btn.setAttribute('data-protocol-id', id);

    const syncInitialState = () => {
      try {
        const profile = profileState.get();
        const list = Array.isArray(profile.protocols) ? profile.protocols : [];
        if (list.some((p) => p && String(p.id) === String(id))) {
          btn.textContent = '✅ Added to Feed';
          btn.disabled = true;
          btn.dataset.added = '1';
          return true;
        }
      } catch (_) {}
      btn.textContent = '✨ Add to Human OS';
      btn.disabled = false;
      return false;
    };
    syncInitialState();

    btn.addEventListener('click', () => {
      if (btn.disabled || btn.dataset.added === '1') return;
      btn.disabled = true;

      try {
        const profile = profileState.get();
        if (!Array.isArray(profile.protocols)) profile.protocols = [];

        if (profile.protocols.some((p) => p && String(p.id) === String(id))) {
          btn.textContent = '✅ Added to Feed';
          btn.dataset.added = '1';
          return;
        }

        profile.protocols.push({ id, label, time, active: true });
        profileState.save(profile);
        if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
        btn.textContent = '✅ Added to Feed';
        btn.dataset.added = '1';
        this.saveChatHistory();
      } catch (_) {
        btn.disabled = false;
      }
    });

    messageContent.insertBefore(btn, timeEl);
  }

  /** Quick replies when Agent ledger has data (CEO synthesis context). Never on profile-question prompts. */
  appendAgentQuickReplies(messageContent) {
    const timeEl = messageContent.querySelector('.message-time');
    if (!timeEl || messageContent.querySelector('.talk-quick-replies')) return;
    const host = messageContent.closest('.message');
    if (host && host.getAttribute('data-profile-prompt-path')) return;
    const wrap = document.createElement('div');
    wrap.className = 'talk-quick-replies';
    const replies = [
      { label: '👍 Confirm', text: 'Confirm — I want to prioritize this in my Human OS today.' },
      { label: '🔔 Remind in 1h', text: 'Remind me to revisit this in about one hour.' },
      { label: '❓ Why?', text: 'Why did you synthesize it this way? Briefly tie it to my agent reports.' },
    ];
    replies.forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'talk-quick-reply-btn';
      b.textContent = r.label;
      b.addEventListener('click', () => {
        if (!this.chatInput) return;
        this.chatInput.value = r.text;
        this.sendMessage();
      });
      wrap.appendChild(b);
    });
    messageContent.insertBefore(wrap, timeEl);
  }

  initAdvisoryBlock() {
    const block = document.getElementById('system-advisory-block');
    const textEl = document.getElementById('systemAdvisoryText');
    const ackBtn = document.getElementById('systemAdvisoryAckBtn');
    if (!block || !textEl || !ackBtn) return;

    const stored = localStorage.getItem('tendai_active_advisory');
    if (stored) {
      textEl.textContent = stored;
      block.style.display = '';
      updateTalkBadgeVisibility(true);
    }

    ackBtn.addEventListener('click', () => {
      const advisoryText = textEl.textContent || '';
      localStorage.removeItem('tendai_active_advisory');
      block.style.display = 'none';
      updateTalkBadgeVisibility(false);

      if (advisoryText && this.conversationArea) {
        this.addSystemMessage(
          'Got it',
          advisoryText,
          true,
          true,
        );
      }
    });

    if (!window.__obriumAdvisoryListenerBound) {
      window.__obriumAdvisoryListenerBound = true;
      window.addEventListener('obrium:show-advisory', (ev) => {
        const text = /** @type {CustomEvent} */ (ev).detail?.text;
        if (!text) return;
        const b = document.getElementById('system-advisory-block');
        const t = document.getElementById('systemAdvisoryText');
        if (b && t) {
          t.textContent = text;
          b.style.display = '';
        }
        updateTalkBadgeVisibility(true);
      });
    }
  }

  /**
   * Health-check advisory is shown once: it stays on screen for this Talk visit
   * (Got it still dismisses it), but is not restored on later launches.
   */
  markAdvisorySeen() {
    const block = document.getElementById('system-advisory-block');
    if (!block || block.style.display === 'none') return;
    try {
      localStorage.removeItem('tendai_active_advisory');
    } catch (_) {}
  }

  // Show typing indicator
  showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot typing-indicator';
    typingDiv.id = 'typingIndicator';
    
    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.innerHTML = `Obrium is thinking<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
    
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

  /** Send is gold/enabled only when there is text; neutral/disabled when empty. */
  syncSendButtonState() {
    if (!this.sendBtn || !this.chatInput) return;
    if (this.chatInput.disabled) {
      this.sendBtn.disabled = true;
      return;
    }
    const hasText = Boolean(String(this.chatInput.value || '').trim());
    this.sendBtn.disabled = !hasText;
    if (this.sendBtn.textContent !== 'Sending...' && this.sendBtn.textContent !== '...') {
      this.sendBtn.textContent = 'Send';
    }
  }

  // Remove legacy sleep-flow block from DOM (no-op; check-in flow removed)
  removeSleepFlowBlock(checkinId) {
    if (!this.conversationArea || !checkinId) return;
    this.conversationArea.querySelectorAll('[data-sleep-checkin-id="' + checkinId + '"]').forEach((el) => el.remove());
  }

  /** First message after system onboarding — only when profile is already complete (proactive Talk owns incomplete profiles). */
  deliverOnboardingGreeting(text) {
    if (!this.conversationArea || !text) return;
    if (getNextProfileQuestion(profileState.get())) return;

    const talkData = talkState.get();
    talkData.history = [];
    talkState.save(talkData);
    this.conversationArea.innerHTML = '';

    const timestamp = Date.now();
    this.addDateSeparator(new Date(timestamp));

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot message-visible message-command-center';
    messageDiv.setAttribute('data-timestamp', String(timestamp));
    messageDiv.setAttribute('data-msg-id', 'onboarding-' + timestamp);

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const sysHeader = document.createElement('div');
    sysHeader.className = 'message-system-header';
    sysHeader.textContent = 'Welcome';
    messageContent.appendChild(sysHeader);

    const textP = document.createElement('p');
    textP.className = 'message-text message-text-multiline';
    textP.textContent = String(text);
    messageContent.appendChild(textP);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time message-time-system';
    timeSpan.textContent = this.formatMessageTime(timestamp);
    messageContent.appendChild(timeSpan);

    messageDiv.appendChild(messageContent);
    this.conversationArea.appendChild(messageDiv);

    talkData.history = [{
      id: 'onboarding-' + timestamp,
      text: String(text),
      type: 'ai',
      timestamp
    }];
    talkState.save(talkData);
    this.scrollToBottom();
  }

  /** Remove legacy welcome/onboarding bot rows when proactive profile questions will run. */
  clearStaleWelcomeMessagesForProactiveFlow() {
    if (!this.conversationArea) return;
    let removed = false;
    this.conversationArea.querySelectorAll('.message.bot:not(.typing-indicator)').forEach((el) => {
      if (el.getAttribute('data-profile-prompt-path')) return;
      if (el.getAttribute('data-talk-pace-prompt') === '1') return;
      const msgId = el.getAttribute('data-msg-id') || '';
      const header = el.querySelector('.message-system-header');
      const body = el.querySelector('.message-text')?.textContent || '';
      const isOnboarding = msgId.startsWith('onboarding-');
      const isPassiveIdentity = /Identity:\s*(?:Obrium|Seregin OS|Serron|TendAI)/i.test(body);
      const isOnlineWelcome = /\bI'm online\b/i.test(body);
      const isWelcomeCard = header && /^Welcome$/i.test(String(header.textContent || '').trim());
      if (isOnboarding || isPassiveIdentity || isOnlineWelcome || isWelcomeCard) {
        el.remove();
        removed = true;
      }
    });
    if (removed) this.saveChatHistory();
  }

  profilePromptChatOptions(question) {
    return { profilePrompt: true, profilePromptPath: question.path };
  }

  isUsableProfileOpening(text, question) {
    const s = String(text || '').trim();
    if (!s || /\[LOCAL MODE\]/i.test(s)) return false;
    if (s.length < 48) return false;
    if (!/[.?!]\s*$/.test(s)) return false;
    const expectedAsk = getConversationalAsk(question);
    if (expectedAsk.includes('?') && !/\?/.test(s)) return false;
    return true;
  }

  /**
   * On Talk open: if the profile is incomplete, greet briefly and ask the next unanswered field.
   * Skips when the last visible message is already that same prompt. Profile-complete: no-op.
   */
  async onTalkOpened() {
    this._proactiveAnswersThisSession = 0;
    this._awaitingPaceChoice = false;
    this._proactivePassiveThisSession = false;
    setProfileQuestionsSnoozed(false);
    this.markAdvisorySeen();
    if (!isAutoProfileQuestionsEnabled()) return;
    const question = getNextProfileQuestion(profileState.get());
    if (!question) return;

    this.clearStaleWelcomeMessagesForProactiveFlow();

    const msgs = this.conversationArea
      ? this.conversationArea.querySelectorAll('.message:not(.typing-indicator)')
      : [];
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    if (last && last.getAttribute('data-profile-prompt-path') === question.path) {
      return;
    }

    const seq = ++this._profilePromptSeq;
    this.showTypingIndicator();
    let text = '';
    try {
      text = await this.composeProfileOpeningPrompt(question);
    } catch (_) {
      text = this.fallbackProfileOpeningPrompt(question);
    }
    this.removeTypingIndicator();
    if (seq !== this._profilePromptSeq) return;

    const trimmed = String(text || '').trim();
    const sanitized = this.sanitizeTalkGreetingText(trimmed);
    const usable =
      this.isUsableProfileOpening(sanitized, question)
        ? sanitized
        : this.fallbackProfileOpeningPrompt(question);
    this.addMessageToChat(usable, 'ai', true, null, this.profilePromptChatOptions(question));
  }

  fallbackProfileOpeningPrompt(question) {
    const ask = getConversationalAsk(question);
    return `I'm Obrium, your personal companion. I get to know you through conversation so your Feed and advice actually fit. ${ask}`;
  }

  onTalkClosed() {
    this._proactiveAnswersThisSession = 0;
    this._awaitingPaceChoice = false;
    this._proactivePassiveThisSession = false;
    setProfileQuestionsSnoozed(false);
  }

  getLastBotMessageEl() {
    if (!this.conversationArea) return null;
    const msgs = this.conversationArea.querySelectorAll('.message.bot:not(.typing-indicator)');
    return msgs.length ? msgs[msgs.length - 1] : null;
  }

  getPendingProfileQuestion() {
    if (this._proactivePassiveThisSession) return null;
    const next = getNextProfileQuestion(profileState.get());
    if (!next) return null;
    const last = this.getLastBotMessageEl();
    if (!last) return null;
    const path = last.getAttribute('data-profile-prompt-path');
    if (path !== next.path) return null;
    return next;
  }

  async askNextProfileQuestion(question) {
    if (!question) return;
    const text = getConversationalAsk(question);
    this.addMessageToChat(text, 'ai', true, null, this.profilePromptChatOptions(question));
  }

  /**
   * If Talk is waiting on a proactive profile answer, parse/save it instead of sending to the LLM.
   * @returns {Promise<boolean>} true when the reply was handled here
   */
  async tryHandleProactiveTalkReply(messageText) {
    if (this._proactivePassiveThisSession) return false;

    if (this._awaitingPaceChoice) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const choice = this.interpretPaceReply(messageText);
      await this.resolvePaceChoice(choice, { fromText: true });
      return true;
    }

    const question = this.getPendingProfileQuestion();
    if (!question) return false;

    await new Promise((resolve) => setTimeout(resolve, 250));
    this.showTypingIndicator();
    const parsed = parseProfileAnswer(question, messageText);
    await new Promise((resolve) => setTimeout(resolve, 180));
    this.removeTypingIndicator();

    if (!parsed.ok) {
      this.addMessageToChat(parsed.clarify, 'ai', true, null, this.profilePromptChatOptions(question));
      return true;
    }

    applyProfileTalkAnswer(question.sectionKey, question.fieldKey, parsed.value);
    recordDataSent({
      requestType: DATA_SENT_REQUEST_TYPES.PROFILE_ANSWER_LOCAL,
      sentOffDevice: false,
      dataCategoriesIncluded: [
        `profile answer saved: ${question.sectionLabel} · ${question.fieldLabel}`,
        'parsed on device; included in later AI requests as profile context',
      ],
    });
    this._proactiveAnswersThisSession += 1;

    const next = getNextProfileQuestion(profileState.get());
    if (!next) {
      this.addMessageToChat(
        "That's everything I needed on your profile for now. Ask me anything whenever you like.",
        'ai',
      );
      this._proactivePassiveThisSession = true;
      this._awaitingPaceChoice = false;
      setProfileQuestionsSnoozed(true);
      return true;
    }

    if (this._proactiveAnswersThisSession >= PROACTIVE_TALK_SESSION_LIMIT) {
      this.showPacePrompt();
      return true;
    }

    await this.askNextProfileQuestion(next);
    return true;
  }

  interpretPaceReply(text) {
    const t = String(text || '').toLowerCase();
    if (/\b(continue|keep going|keep on|yes|yeah|yep|sure|now|let's go|lets go)\b/.test(t)) {
      return 'continue';
    }
    if (/\b(later|another time|stop|not now|nope|nah|no thanks)\b/.test(t) || /^(no|nope)[.!?]?$/.test(t.trim())) {
      return 'stop';
    }
    return 'stop';
  }

  showPacePrompt() {
    this._awaitingPaceChoice = true;
    const el = this.addMessageToChat(
      "We've covered a few things. Want to keep going now, or pick this up another time?",
      'ai',
    );
    if (el) el.setAttribute('data-talk-pace-prompt', '1');
  }

  appendPaceChoiceButtons(messageContent) {
    if (!messageContent || messageContent.querySelector('.talk-pace-actions')) return;
    const timeEl = messageContent.querySelector('.message-time');
    const wrap = document.createElement('div');
    wrap.className = 'talk-pace-actions';

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn talk-pace-continue';
    continueBtn.textContent = 'Continue now';
    continueBtn.addEventListener('click', () => {
      if (!this._awaitingPaceChoice) return;
      this.addMessageToChat('Continue now', 'user');
      void this.resolvePaceChoice('continue');
    });

    const laterBtn = document.createElement('button');
    laterBtn.type = 'button';
    laterBtn.className = 'btn talk-pace-later';
    laterBtn.textContent = 'Another time';
    laterBtn.addEventListener('click', () => {
      if (!this._awaitingPaceChoice) return;
      this.addMessageToChat('Another time', 'user');
      void this.resolvePaceChoice('stop');
    });

    wrap.appendChild(continueBtn);
    wrap.appendChild(laterBtn);
    if (timeEl) messageContent.insertBefore(wrap, timeEl);
    else messageContent.appendChild(wrap);
  }

  disablePaceButtons() {
    if (!this.conversationArea) return;
    this.conversationArea.querySelectorAll('.talk-pace-actions button').forEach((btn) => {
      btn.disabled = true;
    });
  }

  async resolvePaceChoice(choice, { fromText = false } = {}) {
    this._awaitingPaceChoice = false;
    this.disablePaceButtons();

    await new Promise((resolve) => setTimeout(resolve, fromText ? 180 : 80));
    this.showTypingIndicator();
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.removeTypingIndicator();

    if (choice === 'continue') {
      this._proactiveAnswersThisSession = 0;
      setProfileQuestionsSnoozed(false);
      const next = getNextProfileQuestion(profileState.get());
      if (!next) {
        this.addMessageToChat(
          "That's everything I needed on your profile for now. Ask me anything whenever you like.",
          'ai',
        );
        this._proactivePassiveThisSession = true;
        setProfileQuestionsSnoozed(true);
        return;
      }
      await this.askNextProfileQuestion(next);
      return;
    }

    this._proactivePassiveThisSession = true;
    setProfileQuestionsSnoozed(true);
    this.addMessageToChat(
      "No rush — I'll pick this up next time you open Talk. Ask me anything in the meantime.",
      'ai',
    );
  }

  /** Replace every leaked legacy product name (TendAI, Serron, Seregin OS) with Obrium. */
  sanitizeTalkGreetingText(text) {
    const legacy = '(?:Tend[\\s.-]?AI|Serron|Seregin[\\s-]?OS|Seregin)';
    let s = String(text || '').trim();
    s = s.replace(new RegExp(`\\byour\\s+(?:personal\\s+)?${legacy}\\s+companion\\b`, 'gi'), 'your personal companion');
    s = s.replace(new RegExp(`\\b${legacy}\\s+companion\\b`, 'gi'), 'personal companion');
    s = s.replace(new RegExp(`\\b${legacy}\\b`, 'gi'), 'Obrium');
    s = s.replace(/\bObrium(?:\s+Obrium)+\b/g, 'Obrium');
    return s;
  }

  async composeProfileOpeningPrompt(question) {
    const systemContext = [
      'PROACTIVE TALK OPENING — this turn only.',
      'Write at most two short sentences a busy person can skim in a few seconds.',
      'Sentence 1 MUST start like: "I\'m Obrium, your personal companion..." then one short clause about learning them so Feed/advice fit.',
      'Never say TendAI, Serron, Seregin OS, or any other product name. The only name is Obrium.',
      'Sentence 2: ONE natural conversational question that collects this exact fact — not a form label.',
      `Required fact: ${question.fieldLabel} (${question.sectionLabel}). Internal key ${question.path}.`,
      'The question must be clearly about that fact (e.g. Age → "How old are you?").',
      'No lists, markdown, JSON, or extra questions. Not medical advice.',
    ].join(' ');

    const raw = await sendMessageToLLM(
      'The user just opened Talk. Greet them briefly as Obrium (never TendAI, Serron, or Seregin OS) and ask only the next profile question.',
      {
        systemContext,
        requestType: DATA_SENT_REQUEST_TYPES.PROFILE_GREETING,
        includeLedger: false,
        dataCategories: [`profile question being asked: ${question.sectionLabel} · ${question.fieldLabel}`],
      },
    );
    return this.sanitizeTalkGreetingText(raw);
  }

  // Save chat history to localStorage
  saveChatHistory() {
    if (!this.conversationArea) return;
    
    try {
      const messages = [];
      const messageElements = this.conversationArea.querySelectorAll('.message');
      let idx = 0;
      messageElements.forEach((msgEl) => {
        if (msgEl.classList.contains('sleep-flow-message') || msgEl.hasAttribute('data-sleep-checkin-id')) return;
        if (msgEl.hasAttribute('data-drift-prompt')) return;
        const text = msgEl.querySelector('.message-text')?.textContent || '';
        const type = msgEl.classList.contains('bot') ? 'ai' : 'user';
        const timestamp = msgEl.getAttribute('data-timestamp');
        if (text.trim() && !msgEl.classList.contains('typing-indicator')) {
          const ts = timestamp ? parseInt(timestamp) : Date.now();
          const promptPath = msgEl.getAttribute('data-profile-prompt-path');
          const pacePrompt = msgEl.getAttribute('data-talk-pace-prompt');
          messages.push({
            id: msgEl.getAttribute('data-msg-id') || 'msg-' + ts + '-' + idx,
            text,
            type,
            timestamp: ts,
            ...(promptPath ? { profilePromptPath: promptPath } : {}),
            ...(pacePrompt ? { talkPacePrompt: true } : {}),
          });
          idx++;
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
      history = history
        .map(msg => {
          const type = msg.type === 'bot' ? 'ai' : msg.type;
          return {
            ...msg,
            type,
            ...(type === 'ai' && typeof msg.text === 'string' ? { text: this.sanitizeTalkGreetingText(msg.text) } : {})
          };
        })
        .filter(msg => !(msg.type === 'ai' && /filled it with your baseline protocol/i.test(String(msg.text || ''))));

      const pendingQuestion = getNextProfileQuestion(profileState.get());
      if (pendingQuestion && history.length > 0) {
        history = history.filter((msg) => {
          if (msg.type === 'user') return true;
          if (msg.profilePromptPath) return true;
          if (msg.talkPacePrompt) return true;
          return false;
        });
      }
      
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
          const msgId = msg.id || 'msg-' + timestamp + '-' + index;
          
          const messageDiv = document.createElement('div');
          messageDiv.className = `message ${messageType} message-visible${messageType === 'bot' ? ' message-command-center' : ''}`;
          messageDiv.setAttribute('data-timestamp', timestamp);
          messageDiv.setAttribute('data-msg-id', msgId);
          if (msg.profilePromptPath) {
            messageDiv.setAttribute('data-profile-prompt-path', msg.profilePromptPath);
          }
          if (msg.talkPacePrompt) {
            messageDiv.setAttribute('data-talk-pace-prompt', '1');
          }
          
          const messageContent = document.createElement('div');
          messageContent.className = 'message-content';
          
          const textP = document.createElement('p');
          textP.className = 'message-text';
          textP.textContent = msg.text;
          
          const timeSpan = document.createElement('span');
          timeSpan.className = 'message-time' + (messageType === 'bot' ? ' message-time-system' : '');
          timeSpan.textContent = this.formatMessageTime(timestamp);
          
          messageContent.appendChild(textP);
          messageContent.appendChild(timeSpan);
          messageDiv.appendChild(messageContent);
          this.conversationArea.appendChild(messageDiv);
        });
      } else {
        const nextQuestion = getNextProfileQuestion(profileState.get());
        // Incomplete profile: wait for Talk-open to ask via LLM. Complete: keep existing welcome.
        if (!nextQuestion) {
        this.addDateSeparator(new Date());
        const welcomeTimestamp = Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot message-visible message-command-center';
        messageDiv.setAttribute('data-timestamp', welcomeTimestamp);
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const sysHeader = document.createElement('div');
        sysHeader.className = 'message-system-header';
        sysHeader.textContent = 'Welcome';
        messageContent.appendChild(sysHeader);
        
        const textP = document.createElement('p');
        textP.className = 'message-text message-text-multiline';
        const rawName = profileState.get()?.body?.name;
        const nameSuffix = typeof rawName === 'string' && rawName.trim() ? `, ${rawName.trim()}` : '';
        textP.textContent = `Identity: Obrium v1.0.\nStatus: Active. How can I assist with your optimization today${nameSuffix}?`;
        messageContent.appendChild(textP);
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time message-time-system';
        timeSpan.textContent = this.formatMessageTime(welcomeTimestamp);
        messageContent.appendChild(timeSpan);
        
        messageDiv.appendChild(messageContent);
        this.conversationArea.appendChild(messageDiv);
        }
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

      try {
        window.dispatchEvent(new CustomEvent('obrium:talk-user-submit', { detail: { text: messageText } }));
      } catch (_) {}

      if (await this.tryHandleProactiveTalkReply(messageText)) {
        return;
      }

      // Show typing indicator after a short delay
      await new Promise(resolve => setTimeout(resolve, 300));
      const typingIndicator = this.showTypingIndicator();

      // User profile (name, age, location, goals) + system context for LLM
      const userProfile = getUserProfile();
      const { text: systemContext, categories: contextCategories } = getSystemContextDetails();
      learnFromUserMessage(messageText);
      const discussContext =
        typeof window !== 'undefined' &&
        window.__obriumDiscussContext &&
        typeof window.__obriumDiscussContext === 'object'
          ? window.__obriumDiscussContext
          : null;
      const reply = await sendMessageToLLM(messageText, {
        userProfile,
        systemContext,
        requestType: DATA_SENT_REQUEST_TYPES.TALK_MESSAGE,
        dataCategories: contextCategories,
        systemState: {
          user_memory: getUserMemory(),
          ...(discussContext && discussContext.context_id ? { context_id: discussContext.context_id } : {}),
        },
      });
      if (typeof window !== 'undefined' && window.__obriumDiscussContext) {
        window.__obriumDiscussContext = null;
      }

      // Remove typing indicator
      this.removeTypingIndicator();

      // Small delay before showing reply
      await new Promise(resolve => setTimeout(resolve, 200));

      const stateUpdates = parseAndUpdateState(messageText);
      
      // Add AI reply
      this.addMessageToChat(this.sanitizeTalkGreetingText(reply), 'ai');
      
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

      const errorMsg = String((error && error.message) || '');
      const isFetchTypeError =
        (error && error.name === 'TypeError' && /Failed to fetch/i.test(errorMsg)) ||
        /ERR_CONNECTION_REFUSED/i.test(errorMsg) ||
        /Backend offline \(stealth\)/i.test(errorMsg) ||
        /Backend offline \(gatekeeper\)/i.test(errorMsg);
      if (isFetchTypeError) {
        if (typeof window !== 'undefined') {
          publishBackendStatus('Offline');
          window.__obriumForceLocalConversation = true;
        }
      } else {
        console.error('[TendAI Talk] sendMessage failed', {
          name: error && error.name,
          message: error && error.message,
          stack: error && error.stack
        });
      }

      // Формируем понятное сообщение об ошибке
      let friendlyMessage = 'I\'m having trouble connecting right now. Please check your internet connection and try again.';
      if (isFetchTypeError) {
        friendlyMessage = 'Offline Assistant mode is active. I will continue from your local Obrium data.';
      }
      
      // Обрабатываем разные типы ошибок
      if (!isFetchTypeError && (errorMsg.includes('trouble connecting') || 
          errorMsg.includes('internet connection') ||
          errorMsg.includes('Failed to fetch') ||
          errorMsg.includes('NetworkError'))) {
        friendlyMessage = 'I\'m having trouble connecting right now. Please check your internet connection and try again.';
      } else if (!isFetchTypeError && (errorMsg.includes('took too long') || 
                 errorMsg.includes('timeout'))) {
        friendlyMessage = 'The request took too long. Please try again in a moment.';
      } else if (!isFetchTypeError && (errorMsg.includes('CORS') || 
                 errorMsg.includes('cross-origin'))) {
        friendlyMessage = 'Connection issue detected. Please refresh the page and try again.';
      } else if (!isFetchTypeError && errorMsg && errorMsg.length > 0 && 
                 !errorMsg.includes('TypeError') && 
                 !errorMsg.includes('SyntaxError')) {
        // Используем сообщение от backend, если оно понятное
        friendlyMessage = errorMsg;
      }
      
      // Add error message as AI reply
      this.addMessageToChat(this.sanitizeTalkGreetingText(friendlyMessage), 'ai');
      
      // Прокручиваем к сообщению об ошибке
      setTimeout(() => this.scrollToBottom(), 100);
    } finally {
      this.chatInput.disabled = false;
      this.sendBtn.textContent = 'Send';
      this.syncSendButtonState();
      this.chatInput.focus();
    }
  }

  /** Set input to "Processing..." and disable send (for ecosystem plan generation, etc.) */
  setInputProcessing(active) {
    if (!this.chatInput || !this.sendBtn) return;
    if (active) {
      this.chatInput.disabled = true;
      this.chatInput.placeholder = 'Processing...';
      this.sendBtn.disabled = true;
      this.sendBtn.textContent = '...';
    } else {
      this.chatInput.disabled = false;
      this.chatInput.placeholder = 'Message';
      this.sendBtn.textContent = 'Send';
      this.syncSendButtonState();
    }
  }

  /** Add a system-style AI message with optional header (no typing effect). Returns the message div. */
  addSystemMessage(headerText, bodyText, shouldSave = false, multiline = false) {
    if (!this.conversationArea) return null;
    const timestamp = Date.now();
    this.checkAndAddDateSeparator(new Date(timestamp));
    const msgId = 'msg-' + timestamp;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot message-visible message-command-center';
    messageDiv.setAttribute('data-timestamp', timestamp);
    messageDiv.setAttribute('data-msg-id', msgId);
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    if (headerText) {
      const header = document.createElement('div');
      header.className = 'message-system-header';
      header.textContent = headerText;
      messageContent.appendChild(header);
    }
    const textP = document.createElement('p');
    textP.className = 'message-text' + (multiline ? ' message-text-multiline' : '');
    textP.textContent = bodyText;
    messageContent.appendChild(textP);
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time message-time-system';
    timeSpan.textContent = this.formatMessageTime(timestamp);
    messageContent.appendChild(timeSpan);
    messageDiv.appendChild(messageContent);
    this.conversationArea.appendChild(messageDiv);
    this.scrollToBottom();
    if (shouldSave) this.saveChatHistory();
    return messageDiv;
  }

  /** Append an action block (terminal bar buttons). Returns the container so caller can remove it. */
  appendActionButtons(buttons, onSelect) {
    if (!this.conversationArea) return null;
    const wrap = document.createElement('div');
    wrap.className = 'ecosystem-action-block';
    wrap.setAttribute('data-ecosystem-buttons', '1');
    buttons.forEach(({ label, id }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ecosystem-terminal-bar talk-status-tile';
      btn.textContent = label;
      btn.dataset.value = id;
      btn.addEventListener('click', () => onSelect(id));
      wrap.appendChild(btn);
    });
    this.conversationArea.appendChild(wrap);
    this.scrollToBottom();
    return wrap;
  }

  /**
   * Append an interactive checklist (Action Steps). Each item has a custom checkbox; when checked, row becomes semi-transparent and strikethrough.
   * @param {Array<{id: string, label: string}>} tasks - List of { id, label }
   * @returns {HTMLElement} The checklist container
   */
  appendChecklist(tasks) {
    if (!this.conversationArea || !Array.isArray(tasks) || tasks.length === 0) return null;
    const wrap = document.createElement('div');
    wrap.className = 'talk-action-steps';
    wrap.setAttribute('data-action-steps', '1');
    tasks.forEach(({ id, label }) => {
      const row = document.createElement('label');
      row.className = 'talk-action-step-row';
      row.setAttribute('data-task-id', id);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'talk-action-step-checkbox';
      input.setAttribute('aria-label', label);
      const span = document.createElement('span');
      span.className = 'talk-action-step-label';
      span.textContent = label;
      row.appendChild(input);
      row.appendChild(span);
      input.addEventListener('change', () => {
        row.classList.toggle('is-checked', input.checked);
      });
      wrap.appendChild(row);
    });
    this.conversationArea.appendChild(wrap);
    this.scrollToBottom();
    return wrap;
  }
}

