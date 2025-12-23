// TendAI — Services Renderer
// @owner: services
// @role: ui
// Functions to render Labs, Online Doctor, and Mini Programs in both mobile and desktop views

import { servicesState } from './services-state.js';

/**
 * Render Labs section (chips/buttons)
 * @param {HTMLElement} container - Container element to render into
 * @param {string} mode - 'mobile' or 'desktop'
 */
export function renderLabs(container, mode = 'mobile') {
  if (!container) return;

  const labs = servicesState.getLabs();
  
  if (mode === 'desktop') {
    // Desktop: chip-row with chips
    container.innerHTML = '';
    labs.forEach(lab => {
      const chip = document.createElement('button');
      chip.className = 'chip chip-action';
      chip.textContent = lab.name;
      chip.setAttribute('data-service', 'lab');
      chip.setAttribute('data-lab-id', lab.id);
      container.appendChild(chip);
    });
  } else {
    // Mobile: chip-row with chips (same structure)
    container.innerHTML = '';
    labs.forEach(lab => {
      const chip = document.createElement('button');
      chip.className = 'chip chip-action';
      chip.textContent = lab.name;
      chip.setAttribute('data-service', 'lab');
      chip.setAttribute('data-lab-id', lab.id);
      container.appendChild(chip);
    });
  }
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
 * Render Online Doctor section
 * @param {HTMLElement} container - Container element to render into
 * @param {string} mode - 'mobile' or 'desktop'
 */
export function renderOnlineDoctor(container, mode = 'mobile') {
  if (!container) return;

  const options = servicesState.getOnlineDoctor();
  
  if (mode === 'desktop') {
    // Desktop: compact list similar to Mini Programs
    container.innerHTML = '';
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pinned-plan';
      button.setAttribute('data-service', 'online-doctor');
      button.setAttribute('data-doctor-id', option.id);
      
      const icon = document.createElement('span');
      icon.className = 'pinned-plan-icon';
      icon.innerHTML = getOnlineDoctorIcon(option.id);
      
      const name = document.createElement('span');
      name.textContent = option.name;
      
      button.appendChild(icon);
      button.appendChild(name);
      container.appendChild(button);
    });
  } else {
    // Mobile: service cards with icons and descriptions
    container.innerHTML = '';
    const servicesList = document.createElement('div');
    servicesList.className = 'services-list';
    
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'service-card';
      button.setAttribute('data-service', 'online-doctor');
      button.setAttribute('data-doctor-id', option.id);
      
      const icon = document.createElement('span');
      icon.className = 'service-icon';
      icon.innerHTML = getOnlineDoctorIcon(option.id);
      
      const info = document.createElement('div');
      info.className = 'service-info';
      
      const name = document.createElement('span');
      name.className = 'service-name';
      name.textContent = option.name;
      
      const desc = document.createElement('span');
      desc.className = 'service-desc';
      desc.textContent = option.description;
      
      info.appendChild(name);
      info.appendChild(desc);
      
      const arrow = document.createElement('span');
      arrow.className = 'service-arrow';
      arrow.textContent = '→';
      
      button.appendChild(icon);
      button.appendChild(info);
      button.appendChild(arrow);
      
      servicesList.appendChild(button);
    });
    
    container.appendChild(servicesList);
  }
}

/**
 * Render Mini Programs section
 * @param {HTMLElement} container - Container element to render into
 * @param {string} mode - 'mobile' or 'desktop'
 */
export function renderMiniPrograms(container, mode = 'mobile') {
  if (!container) return;

  const programs = servicesState.getMiniPrograms();
  
  // Both mobile and desktop use similar structure (pinned-list with pinned-plan buttons)
  container.innerHTML = '';
  programs.forEach(program => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pinned-plan';
    button.setAttribute('data-service', 'mini-program');
    button.setAttribute('data-program-id', program.id);
    button.setAttribute('data-plan', program.name);
    
    if (mode === 'mobile') {
      // Mobile: includes icon
      const icon = document.createElement('span');
      icon.className = 'pinned-plan-icon';
      icon.textContent = program.icon;
      button.appendChild(icon);
    }
    
    const name = document.createElement('span');
    name.textContent = program.name;
    
    const days = document.createElement('span');
    days.textContent = `${program.days}d`;
    
    button.appendChild(name);
    button.appendChild(days);
    
    container.appendChild(button);
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
    let labsContent = labsSection.querySelector('.service-section-content .chip-row');
    // Fallback: use direct container if structure is different
    if (!labsContent) {
      labsContent = labsSection.querySelector('#mobileLabsChipsContainer');
    }
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

  // Find Mini Programs section
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
  const labsContainer = rightPanel.querySelector('#labsChipsContainer');
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

  // Render Mini Programs
  const programsContainer = rightPanel.querySelector('#miniPlansList');
  if (programsContainer) {
    renderMiniPrograms(programsContainer, 'desktop');
  }
}

