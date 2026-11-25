// Serron — Services Renderer
// @owner: services
// @role: ui
// Functions to render Labs, Online Doctor, and Programs in both mobile and desktop views

import { servicesState } from './services-state.js';

/**
 * Create one unified service row: icon (left) + name + arrow (right).
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
}

