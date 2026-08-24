// Serron — Services Initialization
// @owner: services
// @role: init
// Initialize services rendering for both mobile and desktop versions

import { renderAllServicesMobile, renderAllServicesDesktop } from './services-renderer.js';

(function () {
  'use strict';

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

