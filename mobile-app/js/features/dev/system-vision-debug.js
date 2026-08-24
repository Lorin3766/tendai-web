// Serron — System Vision debug overlay (hidden)
// @owner: dev
// @role: diagnostics

import { getCommonLedger } from '../human-os/common-ledger.js';
import { getUserMemory, clearUserMemory } from '../talk/user-memory.js';

const HOLD_MS = 900;
const REFRESH_MS = 1200;

function ensureOverlay() {
  let overlay = document.getElementById('systemVisionDebugOverlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'systemVisionDebugOverlay';
  overlay.className = 'system-vision-debug-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="system-vision-debug-panel">
      <div class="system-vision-debug-head">
        <strong>SYSTEM VISION</strong>
        <button type="button" class="system-vision-debug-close" data-debug-close>Close</button>
      </div>
      <div class="system-vision-debug-block">
        <div class="system-vision-debug-title">Active User Memory</div>
        <pre class="system-vision-debug-pre" id="systemVisionUserMemory"></pre>
      </div>
      <div class="system-vision-debug-block">
        <div class="system-vision-debug-title">Ledger Payload (common_ledger_recent)</div>
        <pre class="system-vision-debug-pre" id="systemVisionLedgerRecent"></pre>
      </div>
      <div class="system-vision-debug-block">
        <div class="system-vision-debug-title">Discuss Context ID</div>
        <pre class="system-vision-debug-pre" id="systemVisionContext"></pre>
      </div>
      <div class="system-vision-debug-actions">
        <button type="button" class="system-vision-debug-clear" data-debug-clear-memory>Clear User Memory</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target && e.target.closest('[data-debug-close]'))) {
      hideOverlay();
      return;
    }
    const clearBtn = e.target && e.target.closest('[data-debug-clear-memory]');
    if (clearBtn) {
      clearUserMemory();
      renderOverlayData();
    }
  });

  return overlay;
}

function getRecentLedgerPayload() {
  const ledger = getCommonLedger();
  const rows = Array.isArray(ledger.agent_insights) ? ledger.agent_insights : [];
  return rows
    .slice()
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 10);
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function renderOverlayData() {
  const memEl = document.getElementById('systemVisionUserMemory');
  const ledgerEl = document.getElementById('systemVisionLedgerRecent');
  const ctxEl = document.getElementById('systemVisionContext');
  if (!memEl || !ledgerEl || !ctxEl) return;

  memEl.textContent = safeJson(getUserMemory());
  ledgerEl.textContent = safeJson(getRecentLedgerPayload());
  const ctx = typeof window !== 'undefined' ? window.__serronDiscussContext || null : null;
  ctxEl.textContent = safeJson(ctx || { context_id: null, state: 'No active DISCUSS session' });
}

let refreshTimer = null;

function showOverlay() {
  const overlay = ensureOverlay();
  renderOverlayData();
  overlay.classList.add('is-active');
  overlay.setAttribute('aria-hidden', 'false');
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(renderOverlayData, REFRESH_MS);
}

function hideOverlay() {
  const overlay = ensureOverlay();
  overlay.classList.remove('is-active');
  overlay.setAttribute('aria-hidden', 'true');
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function bindLongPress(el) {
  if (!el || el.dataset.systemVisionBound === '1') return;
  el.dataset.systemVisionBound = '1';
  let timer = null;
  let fired = false;

  const start = (evt) => {
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      evt.preventDefault();
      showOverlay();
    }, HOLD_MS);
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  el.addEventListener('pointerdown', start, { passive: false });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => {
    if (fired) e.preventDefault();
  });
}

function initSystemVisionDebug() {
  const settingsTriggers = [
    document.getElementById('profileSettingsButton'),
    document.getElementById('mobileProfileSettingsButton'),
  ].filter(Boolean);
  settingsTriggers.forEach(bindLongPress);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSystemVisionDebug);
} else {
  initSystemVisionDebug();
}

