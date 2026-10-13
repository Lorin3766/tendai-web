// Serron — Services Initialization
// @owner: services
// @role: init
// Initialize services rendering for both mobile and desktop versions

import { renderAllServicesMobile, renderAllServicesDesktop } from './services-renderer.js';
import { openEditAgentModal, openConfigureAgentSourcesModal } from '../human-os/agents-ui.js';
import { openBlueprintStoreModal } from '../human-os/blueprint-store-modal.js';
import { tickModularAgents } from '../human-os/modular-agents-runtime.js';
import { getCommonLedger, writeAgentInsight, setAgentInsightPaused } from '../human-os/common-ledger.js';
import { getUserAgentById, deleteUserAgent, updateUserAgent } from '../human-os/user-agents.js';

(function () {
  'use strict';

  if (typeof window !== 'undefined') {
    window.ObriumHumanOS = {
      getLedger: getCommonLedger,
      writeAgentInsight,
    };
  }

  async function refreshServicesAfterAgentChange() {
    try {
      await tickModularAgents();
    } catch (_) {}
    if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
    if (typeof window.renderServices === 'function') window.renderServices();
    if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
  }

  function clearDiscussSessionForDeletedAgent(agent) {
    if (!agent) return;
    const activeCtx =
      typeof window !== 'undefined' && window.__obriumDiscussContext && typeof window.__obriumDiscussContext === 'object'
        ? window.__obriumDiscussContext
        : null;
    if (!activeCtx) return;
    if (String(activeCtx.agent || '').trim() !== String(agent.name || '').trim()) return;

    window.__obriumDiscussContext = null;
    window.__obriumForceLocalConversation = false;

    const tc = window.__obriumTalkComponent;
    if (tc && tc.chatInput) {
      const v = String(tc.chatInput.value || '');
      if (v.includes(`@${agent.name}`)) {
        tc.chatInput.value = '';
        tc.autoResizeTextarea && tc.autoResizeTextarea();
      }
      if (typeof tc.addSystemMessage === 'function') {
        tc.addSystemMessage('[ DISCUSS CLEARED ]', `${agent.name} was deleted. Active discussion context has been terminated.`, false, false);
      }
    }
  }

  function closeAllAgentMenus() {
    document.querySelectorAll('.service-row-agent-menu').forEach((menuEl) => {
      menuEl.hidden = true;
      menuEl.classList.remove('is-open');
    });
    document.querySelectorAll('[data-action="toggle-agent-menu"][aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  if (!document.body.dataset.obriumCreateAgentDelegate) {
    document.body.dataset.obriumCreateAgentDelegate = '1';
    document.body.addEventListener('click', (e) => {
      const menuBtn = e.target && e.target.closest && e.target.closest('[data-action="toggle-agent-menu"]');
      if (menuBtn) {
        e.preventDefault();
        e.stopPropagation();
        const row = menuBtn.closest('.service-row-agent-wrap');
        const menu = row ? row.querySelector('.service-row-agent-menu') : null;
        if (!menu) return;
        const willOpen = menu.hidden;
        closeAllAgentMenus();
        if (willOpen) {
          menu.hidden = false;
          menu.classList.add('is-open');
          menuBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const statusBtn = e.target && e.target.closest && e.target.closest('[data-action="toggle-agent-status"]');
      if (statusBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = statusBtn.getAttribute('data-agent-id');
        if (!id) return;
        const agent = getUserAgentById(id);
        if (!agent) return;
        const goStandby = !(agent.active === false || agent.agentStatus === 'Paused');
        updateUserAgent(id, { agentStatus: goStandby ? 'Paused' : 'Active' });
        setAgentInsightPaused(String(agent.name || ''), goStandby);
        closeAllAgentMenus();
        refreshServicesAfterAgentChange();
        return;
      }

      const configureBtn = e.target && e.target.closest && e.target.closest('[data-action="configure-agent"]');
      if (configureBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = configureBtn.getAttribute('data-agent-id');
        if (!id) return;
        const agent = getUserAgentById(id);
        if (!agent) return;
        closeAllAgentMenus();
        openConfigureAgentSourcesModal(refreshServicesAfterAgentChange, agent);
        return;
      }

      const rebootBtn = e.target && e.target.closest && e.target.closest('[data-action="reboot-agent"]');
      if (rebootBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = rebootBtn.getAttribute('data-agent-id');
        if (!id) return;
        const agent = getUserAgentById(id);
        if (!agent) return;
        window.__obriumDiscussContext = null;
        window.__obriumForceLocalConversation = false;
        writeAgentInsight(agent.name, `${agent.name} reboot complete. Runtime context refreshed.`);
        closeAllAgentMenus();
        refreshServicesAfterAgentChange();
        return;
      }

      const terminateBtn = e.target && e.target.closest && e.target.closest('[data-action="terminate-agent"]');
      if (terminateBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = terminateBtn.getAttribute('data-agent-id');
        if (!id) return;
        const agent = getUserAgentById(id);
        if (!agent) return;
        if (!window.confirm(`Are you sure you want to terminate "${agent.name}"? This removes the agent and its Feed insights.`)) return;
        deleteUserAgent(id);
        terminateBtn.closest('.service-row-agent-wrap')?.remove();
        clearDiscussSessionForDeletedAgent(agent);
        closeAllAgentMenus();
        if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
        if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
        refreshServicesAfterAgentChange();
        return;
      }

      const editBtn = e.target && e.target.closest && e.target.closest('[data-action="edit-agent"]');
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = editBtn.getAttribute('data-agent-id');
        const agent = getUserAgentById(id);
        if (!agent) return;
        openEditAgentModal(refreshServicesAfterAgentChange, {
          id: agent.id,
          name: agent.name,
          instruction: agent.instruction || '',
        });
        return;
      }
      const delBtn = e.target && e.target.closest && e.target.closest('[data-action="delete-agent"]');
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = delBtn.getAttribute('data-agent-id');
        if (!id) return;
        if (!window.confirm('Remove this agent and its Feed insights?')) return;
        const agent = getUserAgentById(id);
        deleteUserAgent(id);
        // Immediate UI removal (requested hard delete sync).
        document.querySelector(`[data-agent-id="${id}"]`)?.remove();
        delBtn.closest('.service-row-agent-wrap')?.remove();
        clearDiscussSessionForDeletedAgent(agent);
        if (typeof window.renderAgentReportsSection === 'function') window.renderAgentReportsSection();
        if (typeof window.updateFeedUI === 'function') window.updateFeedUI();
        refreshServicesAfterAgentChange();
        return;
      }
      const row = e.target && e.target.closest && e.target.closest('[data-action="create-agent"]');
      if (row) {
        e.preventDefault();
        openBlueprintStoreModal(refreshServicesAfterAgentChange);
        return;
      }

      if (!e.target.closest('.service-row-agent-menu')) {
        closeAllAgentMenus();
      }
    });
  }

  function initServices() {
    // Initialize mobile SERVICES screen
    const servicesScreen = document.getElementById('screen-services');
    if (servicesScreen) {
      renderAllServicesMobile(servicesScreen);
    }

    // Initialize desktop right panel
    const rightPanel = document.getElementById('col-right');
    if (rightPanel) {
      renderAllServicesDesktop(rightPanel);
    }
  }

  // Re-render services when switching to SERVICES view
  function reRenderServicesOnShow() {
    const servicesView = document.getElementById('services-view');
    if (servicesView) {
      // Use MutationObserver to detect when services-view becomes visible
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const target = mutation.target;
            if (target.id === 'services-view' && !target.classList.contains('hidden')) {
              // Services view is now visible, re-render
              const servicesScreen = document.getElementById('screen-services');
              if (servicesScreen) {
                setTimeout(() => {
                  renderAllServicesMobile(servicesScreen);
                }, 50);
              }
            }
          }
        });
      });
      
      observer.observe(servicesView, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initServices();
      reRenderServicesOnShow();
    });
  } else {
    initServices();
    reRenderServicesOnShow();
  }

  // Export for manual re-rendering if needed
  window.renderServices = function() {
    initServices();
  };
})();

