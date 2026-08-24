// Serron — Collapsible Sections Controller
// @owner: storage
// @role: utils
// Управление сворачиванием/разворачиванием секций в левой и правой колонках

(function() {
  'use strict';

  // Дефолтные состояния (при первом запуске)
  const defaultStates = {
    left: {
      profileMenu: true   // open
    },
    right: {
      onlineDoctor: false,  // closed (по умолчанию свернуто)
      labs: false,         // closed
      miniPrograms: false, // closed
      agents: false
    },
    center: {
      weeklyGoals: false   // closed (по умолчанию свернуто)
    },
    mobile: {
      profileMenu: false,  // closed (по умолчанию свернуто)
      labs: false,         // closed
      onlineDoctor: false, // closed
      miniPrograms: false, // closed
      agents: false
    }
  };

  // Загрузка состояния из localStorage
  function loadCollapseState() {
    try {
      const leftState = localStorage.getItem('tendai-collapse-left');
      const rightState = localStorage.getItem('tendai-collapse-right');
      const centerState = localStorage.getItem('tendai-collapse-center');
      const mobileState = localStorage.getItem('tendai-collapse-mobile');
      
      const left = leftState ? JSON.parse(leftState) : defaultStates.left;
      const right = { ...defaultStates.right, ...(rightState ? JSON.parse(rightState) : {}) };
      const center = centerState ? JSON.parse(centerState) : defaultStates.center;
      const mobile = { ...defaultStates.mobile, ...(mobileState ? JSON.parse(mobileState) : {}) };
      
      return { left, right, center, mobile };
    } catch (e) {
      return { left: defaultStates.left, right: defaultStates.right, center: defaultStates.center, mobile: defaultStates.mobile };
    }
  }

  // Сохранение состояния в localStorage
  function saveCollapseState(left, right, center, mobile) {
    try {
      localStorage.setItem('tendai-collapse-left', JSON.stringify(left));
      localStorage.setItem('tendai-collapse-right', JSON.stringify(right));
      if (center) {
        localStorage.setItem('tendai-collapse-center', JSON.stringify(center));
      }
      if (mobile) {
        localStorage.setItem('tendai-collapse-mobile', JSON.stringify(mobile));
      }
    } catch (e) {
      // Failed to save state to localStorage
    }
  }

  // Получение текущего состояния
  let collapseState = loadCollapseState();

  // Маппинг data-collapse → ключ состояния
  const collapseKeyMap = {
    'LEFT_PROFILE_MENU': { side: 'left', key: 'profileMenu' },
    'RIGHT_LABS': { side: 'right', key: 'labs' },
    'RIGHT_ONLINE_DOCTOR': { side: 'right', key: 'onlineDoctor' },
    'RIGHT_MINI_PROGRAMS': { side: 'right', key: 'miniPrograms' },
    'RIGHT_AGENTS': { side: 'right', key: 'agents' },
    'MOBILE_PROFILE_MENU': { side: 'mobile', key: 'profileMenu' },
    'MOBILE_LABS': { side: 'mobile', key: 'labs' },
    'MOBILE_ONLINE_DOCTOR': { side: 'mobile', key: 'onlineDoctor' },
    'MOBILE_MINI_PROGRAMS': { side: 'mobile', key: 'miniPrograms' },
    'MOBILE_AGENTS': { side: 'mobile', key: 'agents' }
  };

  // Список mobile Services секций для логики "только одна открыта"
  const mobileServiceSections = ['MOBILE_LABS', 'MOBILE_ONLINE_DOCTOR', 'MOBILE_MINI_PROGRAMS', 'MOBILE_AGENTS'];

  // Переключение состояния секции
  function toggleSection(collapseId) {
    const mapping = collapseKeyMap[collapseId];
    if (!mapping) {
      return;
    }

    const { side, key } = mapping;
    const currentState = collapseState[side][key];
    const newState = !currentState;
    
    // Логика "только одна секция открыта" для mobile Services
    if (mobileServiceSections.includes(collapseId) && newState) {
      // Закрываем все остальные mobile Services секции
      mobileServiceSections.forEach(sectionId => {
        if (sectionId !== collapseId) {
          const otherMapping = collapseKeyMap[sectionId];
          if (otherMapping) {
            collapseState[otherMapping.side][otherMapping.key] = false;
            updateSectionUI(sectionId, false);
          }
        }
      });
    }
    
    collapseState[side][key] = newState;

    // Сохраняем состояние
    saveCollapseState(collapseState.left, collapseState.right, collapseState.center, collapseState.mobile);

    // Обновляем UI
    updateSectionUI(collapseId, newState);
  }

  // Обновление UI секции
  function updateSectionUI(collapseId, isOpen) {
    const header = document.querySelector(`[data-collapse="${collapseId}"]`);
    const body = document.querySelector(`[data-collapse-body="${collapseId}"]`);

    if (!header || !body) {
      return;
    }

    if (isOpen) {
      header.classList.add('is-open');
      body.classList.add('is-open');
      header.setAttribute('aria-expanded', 'true');
    } else {
      header.classList.remove('is-open');
      body.classList.remove('is-open');
      header.setAttribute('aria-expanded', 'false');
    }

    document.querySelectorAll(`[data-collapse-trigger="${collapseId}"]`).forEach((hit) => {
      hit.classList.toggle('is-open', isOpen);
      hit.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    if (collapseId === 'MOBILE_PROFILE_MENU') {
      const mCard = document.getElementById('mobileProfileCard');
      if (mCard) {
        mCard.classList.toggle('is-expanded', isOpen);
      }
    }
  }

  // Инициализация всех секций
  function initializeSections() {
    // Применяем сохранённые состояния
    Object.keys(collapseKeyMap).forEach(collapseId => {
      const mapping = collapseKeyMap[collapseId];
      const { side, key } = mapping;
      // Проверяем, что сторона существует в состоянии
      if (collapseState[side] && collapseState[side][key] !== undefined) {
        const isOpen = collapseState[side][key];
        updateSectionUI(collapseId, isOpen);
      }
    });
  }
  
  // Обработчики событий (делегирование через document)
  function setupEventHandlers() {
    // Клик
    document.addEventListener('click', (e) => {
      const hit = e.target.closest('[data-collapse-trigger]');
      if (hit) {
        const collapseId = hit.getAttribute('data-collapse-trigger');
        if (!collapseId) return;
        e.preventDefault();
        e.stopPropagation();
        toggleSection(collapseId);
        return;
      }

      const header = e.target.closest('.card-header-toggle');
      if (!header) return;

      const collapseId = header.getAttribute('data-collapse');
      if (!collapseId) return;

      e.preventDefault();
      e.stopPropagation();
      toggleSection(collapseId);
    });

    // Клавиатура (Enter/Space)
    document.addEventListener('keydown', (e) => {
      const hit = e.target.closest('[data-collapse-trigger]');
      if (hit && (e.key === 'Enter' || e.key === ' ')) {
        const collapseId = hit.getAttribute('data-collapse-trigger');
        if (!collapseId) return;
        e.preventDefault();
        e.stopPropagation();
        toggleSection(collapseId);
        return;
      }

      const header = e.target.closest('.card-header-toggle');
      if (!header) return;

      if (e.key === 'Enter' || e.key === ' ') {
        const collapseId = header.getAttribute('data-collapse');
        if (!collapseId) return;

        e.preventDefault();
        e.stopPropagation();
        toggleSection(collapseId);
      }
    });
  }

  // Инициализация при загрузке DOM
  // Ждём полной загрузки, чтобы все элементы были в DOM
  function init() {
    // Настраиваем обработчики событий (один раз)
    setupEventHandlers();
    
    // Небольшая задержка для гарантии, что все элементы отрендерены
    setTimeout(() => {
      initializeSections();
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Также инициализируем после динамического рендеринга (если секции добавляются позже)
  if (window.servicesInit) {
    const originalInit = window.servicesInit;
    window.servicesInit = function() {
      if (originalInit) originalInit();
      setTimeout(() => {
        initializeSections();
      }, 200);
    };
  }

  // Экспорт для внешнего доступа (если нужно)
  window.collapsibleController = {
    toggle: toggleSection,
    getState: () => ({ ...collapseState }),
    reset: () => {
      collapseState = { 
        left: { ...defaultStates.left }, 
        right: { ...defaultStates.right },
        center: { ...defaultStates.center },
        mobile: { ...defaultStates.mobile }
      };
      saveCollapseState(collapseState.left, collapseState.right, collapseState.center, collapseState.mobile);
      initializeSections();
    }
  };

})();

