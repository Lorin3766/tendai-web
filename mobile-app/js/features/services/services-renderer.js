// Serron — Services Renderer
// @owner: services
// @role: ui
// Functions to render Labs, Online Doctor, and Programs in both mobile and desktop views

import { servicesState } from './services-state.js';
import { getUserAgents } from '../human-os/user-agents.js';
import {
  getFocusAreaById,
  getFocusAreaByName,
  getBehaviorModeUserLabel,
} from '../human-os/focus-areas.js';

/** Robot icon for Focus Area rows (inline SVG for dark/gold UI) */
const AGENT_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 3h6v2H9V3zm2 4v2h2V7h-2zM7 9h10a2 2 0 012 2v3h2v2h-2v3a2 2 0 01-2 2H7a2 2 0 01-2-2v-3H3v-2h2v-3a2 2 0 012-2zm0 5v4h10v-4H7zm2 2h2v2H9v-2zm4 0h2v2h-2v-2z" fill="currentColor"/></svg>`;

/**
 * Prefer catalog Focus Area name; strip legacy "NAME_ANALYZER" suffixes.
 * @param {object} agent
 */
function focusAreaDisplayName(agent) {
  const byId = getFocusAreaById(agent?.trackingLifeAreaId);
  if (byId?.name) return byId.name;
  const raw = String(agent?.name || '').trim();
  const cleaned = raw
    .replace(/_(MONITOR|ANALYZER|ASSISTANT|DATA\s*LOGGER)\b/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  const byName = getFocusAreaByName(cleaned) || getFocusAreaByName(raw);
  if (byName?.name) return byName.name;
  return cleaned || raw || 'Focus Area';
}

/**
 * One agent row with contextual actions menu.
 */
function createAgentManageRow(agent) {
  const isStandby = agent.active === false || agent.agentStatus === 'Paused';
  const displayName = focusAreaDisplayName(agent);
  const modeLabel = getBehaviorModeUserLabel(agent.behaviorModeId);

  const wrap = document.createElement('div');
  wrap.className = 'service-row-agent-wrap';

  const row = document.createElement('div');
  row.className = `service-row service-row--agent${isStandby ? ' service-row--agent-standby' : ''}`;
  row.setAttribute('role', 'group');

  const icon = document.createElement('span');
  icon.className = 'service-row-icon';
  icon.innerHTML = AGENT_ICON_SVG;

  const label = document.createElement('span');
  label.className = 'service-row-name';
  label.textContent = displayName;
  if (modeLabel) label.title = modeLabel;

  const status = document.createElement('span');
  status.className = `service-row-agent-status${isStandby ? ' is-standby' : ' is-active'}`;
  status.textContent = isStandby ? 'Paused' : 'Active';

  const tools = document.createElement('div');
  tools.className = 'service-row-agent-tools';

  const menuTrigger = document.createElement('button');
  menuTrigger.type = 'button';
  menuTrigger.className = 'service-row-tool-btn service-row-tool-btn--menu';
  menuTrigger.setAttribute('data-action', 'toggle-agent-menu');
  menuTrigger.setAttribute('data-agent-id', agent.id);
  menuTrigger.setAttribute('aria-haspopup', 'menu');
  menuTrigger.setAttribute('aria-expanded', 'false');
  menuTrigger.setAttribute('aria-label', 'Agent options');
  menuTrigger.textContent = '⋯';

  const menu = document.createElement('div');
  menu.className = 'service-row-agent-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" class="service-row-agent-menu__item" data-action="toggle-agent-status" data-agent-id="${agent.id}" role="menuitem">${isStandby ? 'Set active' : 'Pause focus area'}</button>
    <button type="button" class="service-row-agent-menu__item" data-action="configure-agent" data-agent-id="${agent.id}" role="menuitem">Configure knowledge</button>
    <button type="button" class="service-row-agent-menu__item" data-action="reboot-agent" data-agent-id="${agent.id}" role="menuitem">Clear context</button>
    <button type="button" class="service-row-agent-menu__item service-row-agent-menu__item--danger" data-action="terminate-agent" data-agent-id="${agent.id}" role="menuitem">Delete focus area</button>
  `;

  tools.appendChild(menuTrigger);
  tools.appendChild(menu);

  row.appendChild(icon);
  row.appendChild(label);
  row.appendChild(status);
  row.appendChild(tools);

  wrap.appendChild(row);
  if (agent.instruction) wrap.title = agent.instruction;
  return wrap;
}

/**
 * Create one unified service row: icon (left) + name + arrow (right).
 * Same visual language for Labs, Online doctor, Programs.
 * @param {string} iconContent - Emoji or SVG HTML string
 * @param {string} name - Label text
 * @param {Object} attrs - data attributes for the row button
 * @returns {HTMLButtonElement}
 */
function createServiceRow(iconContent, name, attrs = {}) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'service-row';
  Object.entries(attrs).forEach(([k, v]) => row.setAttribute(k, v));

  const icon = document.createElement('span');
  icon.className = 'service-row-icon';
  if (iconContent.startsWith('<')) {
    icon.innerHTML = iconContent;
  } else {
    icon.textContent = iconContent;
  }
  const label = document.createElement('span');
  label.className = 'service-row-name';
  label.textContent = name;
  const arrow = document.createElement('span');
  arrow.className = 'service-row-arrow';
  arrow.textContent = '→';

  row.appendChild(icon);
  row.appendChild(label);
  row.appendChild(arrow);
  return row;
}

/**
 * Render Labs section — same list style as Online doctor and Programs
 */
export function renderLabs(container, mode = 'mobile') {
  if (!container) return;
  const labs = servicesState.getLabs();
  container.innerHTML = '';
  labs.forEach(lab => {
    const row = createServiceRow(lab.icon || '🩸', lab.name, {
      'data-service': 'lab',
      'data-lab-id': lab.id
    });
    container.appendChild(row);
  });
}

/**
 * Get classic, recognizable icons for Online Doctor option
 * Style: Simple, intuitive, like system icons - maximum recognition
 * @param {string} id - Option id ('chat', 'voice', 'video')
 * @returns {string} - SVG markup
 */
function getOnlineDoctorIcon(id) {
  const icons = {
    'chat': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Classic chat bubble - light/neutral -->
      <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#9A9A9A"/>
      <path d="M7 9H17V11H7V9ZM7 12H14V14H7V12Z" fill="#FFFFFF"/>
    </svg>`,
    'voice': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Classic red phone receiver - like iOS/Android -->
      <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#FF3B30"/>
    </svg>`,
    'video': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Classic video camera - neutral dark/system color -->
      <path d="M17 10.5V7C17 6.45 16.55 6 16 6H4C3.45 6 3 6.45 3 7V17C3 17.55 3.45 18 4 18H16C16.55 18 17 17.55 17 17V13.5L21 17.5V6.5L17 10.5Z" fill="#6B6B6B"/>
    </svg>`
  };
  return icons[id] || '';
}

/**
 * Render Online Doctor section — same list style as Labs and Programs
 */
export function renderOnlineDoctor(container, mode = 'mobile') {
  if (!container) return;
  const options = servicesState.getOnlineDoctor();
  container.innerHTML = '';
  options.forEach(option => {
    const row = createServiceRow(getOnlineDoctorIcon(option.id), option.name, {
      'data-service': 'online-doctor',
      'data-doctor-id': option.id
    });
    container.appendChild(row);
  });
}

/**
 * Render Programs section — same list style as Labs and Online doctor
 */
export function renderMiniPrograms(container, mode = 'mobile') {
  if (!container) return;
  const programs = servicesState.getMiniPrograms();
  container.innerHTML = '';
  programs.forEach(program => {
    const row = createServiceRow(program.icon || '📋', program.name, {
      'data-service': 'mini-program',
      'data-program-id': program.id
    });
    container.appendChild(row);
  });
}

/**
 * Agents list + "Create agent" CTA (same row style as Programs).
 */
export function renderAgentsSection(container) {
  if (!container) return;
  container.innerHTML = '';
  const agents = getUserAgents().filter((a) => a);
  agents.forEach((agent) => {
    container.appendChild(createAgentManageRow(agent));
  });
  // User-facing label is "focus area"; internal action ids keep `agent` (see focus-areas.js tech debt note).
  const cta = createServiceRow(AGENT_ICON_SVG, '+ Add focus area', {
    'data-action': 'create-agent',
  });
  cta.classList.add('service-row-cta');
  container.appendChild(cta);
}

/**
 * Render all services in a container (for mobile SERVICES screen)
 * @param {HTMLElement} container - Container element (e.g., #screen-services)
 */
export function renderAllServicesMobile(container) {
  if (!container) return;

  // Find Labs section
  const labsSection = container.querySelector('[data-service-section="labs"]');
  if (labsSection) {
    const labsContent = labsSection.querySelector('.service-options-list') || labsSection.querySelector('#mobileLabsList');
    if (labsContent) {
      renderLabs(labsContent, 'mobile');
    }
  }

  // Find Online Doctor section
  const doctorSection = container.querySelector('[data-service-section="online-doctor"]');
  if (doctorSection) {
    let doctorContent = doctorSection.querySelector('.service-section-content');
    // Fallback: use direct container if structure is different
    if (!doctorContent) {
      doctorContent = doctorSection.querySelector('#mobileOnlineDoctorContainer');
    }
    if (doctorContent) {
      renderOnlineDoctor(doctorContent, 'mobile');
    }
  }

  // Find Programs section
  const programsSection = container.querySelector('[data-service-section="mini-programs"]');
  if (programsSection) {
    let programsContent = programsSection.querySelector('.service-section-content .pinned-list');
    // Fallback: use direct container if structure is different
    if (!programsContent) {
      programsContent = programsSection.querySelector('#mobileMiniPlansList');
    }
    if (programsContent) {
      renderMiniPrograms(programsContent, 'mobile');
    }
  }

  const agentsSection = container.querySelector('[data-service-section="agents"]');
  if (agentsSection) {
    let agentsContent = agentsSection.querySelector('.pinned-list');
    if (!agentsContent) {
      agentsContent = agentsSection.querySelector('#mobileAgentsList');
    }
    if (agentsContent) {
      renderAgentsSection(agentsContent);
    }
  }
}

/**
 * Render all services in desktop right panel
 * @param {HTMLElement} rightPanel - Right panel container (#col-right)
 */
export function renderAllServicesDesktop(rightPanel) {
  if (!rightPanel) return;

  // Render Labs
  const labsContainer = rightPanel.querySelector('#labsList') || rightPanel.querySelector('#labsChipsContainer');
  if (labsContainer) {
    renderLabs(labsContainer, 'desktop');
  }

  // Render Online Doctor (create if doesn't exist)
  let doctorCard = rightPanel.querySelector('#onlineDoctorCard');
  if (!doctorCard) {
    // Find Labs card to insert after
    const labsCard = rightPanel.querySelector('#labsCard');
    if (labsCard) {
      doctorCard = document.createElement('article');
      doctorCard.className = 'card-soft quick-help-card';
      doctorCard.id = 'onlineDoctorCard';
      
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = 'Online doctor';
      
      const list = document.createElement('div');
      list.className = 'pinned-list';
      list.id = 'onlineDoctorList';
      
      doctorCard.appendChild(title);
      doctorCard.appendChild(list);
      
      labsCard.insertAdjacentElement('afterend', doctorCard);
    }
  }
  
  const doctorList = rightPanel.querySelector('#onlineDoctorList');
  if (doctorList) {
    renderOnlineDoctor(doctorList, 'desktop');
  }

  // Render Programs
  const programsContainer = rightPanel.querySelector('#miniPlansList');
  if (programsContainer) {
    renderMiniPrograms(programsContainer, 'desktop');
  }

  const agentsContainer = rightPanel.querySelector('#agentsList');
  if (agentsContainer) {
    renderAgentsSection(agentsContainer);
  }
}

