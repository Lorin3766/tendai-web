# Serron System Architecture (Anti-Chaos v1)

## Golden Rule

**UI не имеет права менять себя "сбоку".**
**UI меняется только как следствие Action → State → Render.**

## Architecture Principles

### 1. Single Source of Truth (State-first)

- **AppState** (`js/core/app-state.js`) — единственный источник решений
- State не зависит от DOM
- Все модули используют AppState

**Запрещено:**
- Логика на основе `querySelector`, `innerText`, `classList`
- Принятие решений "по наличию элемента"

**Допустимо:**
- DOM используется только как отображение state

### 2. Unidirectional Flow

```
Action → State → Effects → Render
```

**Все события проходят через `dispatch(action)`:**

```javascript
import { dispatch } from './js/core/dispatch.js';

dispatch({
  type: 'FEED_START_PLAN',
  payload: { planId: '...' },
  reason: 'user-click'
});
```

**Flow:**
1. `dispatch(action)` → регистрируется в истории
2. Handler обновляет AppState
3. Effects выполняют побочные действия
4. Render обновляет UI

**Запрещено:**
- Прямые вызовы render из таймеров, observer'ов, обработчиков DOM
- Сайд-эффекты внутри render/UI функций

### 3. Effects Layer

**Все побочные эффекты регистрируются централизованно:**

```javascript
import { registerEffect, createIntervalEffect } from './js/core/effects.js';

// Register effect
registerEffect('feed-update-timer', {
  reason: 'Update feed time labels every 20s',
  start: (params) => {
    return setInterval(() => {
      dispatch({ type: 'FEED_UPDATE_TIME', reason: 'timer' });
    }, 20000);
  },
  stop: (intervalId) => clearInterval(intervalId)
});

// Or use helper
createIntervalEffect('feed-update-timer', 20000, () => {
  dispatch({ type: 'FEED_UPDATE_TIME', reason: 'timer' });
}, 'Update feed time labels');
```

**Effects включают:**
- `setInterval` / `setTimeout`
- `MutationObserver`
- `localStorage`
- `fetch` / network
- toasts / analytics

**Требования:**
- Каждый effect имеет `start` / `done` / `error` лог
- Каждый effect имеет `reason`
- Может быть выключен флагом (dev/prod)

**Запрещено:**
- Effects внутри FEED/TALK UI функций
- "Тихие" observer'ы без логов и фильтров

### 4. MutationObserver Policy

**Правило TendAI:**
**MutationObserver не управляет логикой.**

**Допустимо:**
- Наблюдение только за конкретным контейнером
- Реакция только на конкретный тип изменений
- Debounce + reason-лог

**Запрещено:**
- Observer → full rerender
- Observer → изменение state без action

**Пример:**
```javascript
import { createObserverEffect } from './js/core/effects.js';

createObserverEffect(
  'feed-dom-watch',
  () => document.getElementById('feed-view'),
  { childList: true, subtree: false },
  (mutations) => {
    // Only log, don't trigger rerender
    console.log('[EFFECT] Feed DOM changed', mutations.length);
  },
  'Monitor feed DOM changes for debugging'
);
```

### 5. Module Isolation

**Требование:**
- FEED не трогает TALK DOM
- TALK не трогает FEED DOM
- Общение только через:
  - `dispatch(action)`
  - AppState

**Запрещено:**
- Прямые cross-module DOM манипуляции
- "Подглядывание" состояния другого модуля через DOM

### 6. Runtime Registry & Initialization Guard

**Требование:**
- Все модули регистрируются через `runtime-registry.js`
- Инициализация каждого модуля — строго один раз
- Видимый RUN MODE в логах

**Запрещено:**
- Самозапускающиеся модули
- Повторные bind'ы обработчиков

**Пример:**
```javascript
import { registerFeature, markFeatureInitialized } from './js/runtime-registry.js';

registerFeature('feed', { role: 'feature' });

// In init function:
if (window.__feedInitialized) {
  console.warn('[GUARD] Feed already initialized');
  return;
}
window.__feedInitialized = true;
markFeatureInitialized('feed');
```

### 7. Logging & Action Trace Standard

**Формат логов (обязателен):**

```
[ACTION] id=... type=... reason=...
[STATE] patch=... reason=... id=...
[EFFECT] start/done/error id=... reason=... correlation=...
[RENDER] begin/end component=... reason=... correlation=...
[GUARD][WARN] ...
[ERROR] context=...
```

**Требование:**
- Один `correlationId` проходит через всю цепочку
- Логи позволяют восстановить путь: клик → state → effect → UI

**Пример:**
```javascript
import { createLogger } from './js/core/logger.js';

const logger = createLogger('feed');

logger.action('FEED_START_PLAN', { planId: '...' }, 'user-click');
logger.state({ plan: { status: 'active' } }, 'plan-started', correlationId);
logger.render('begin', 'feed', 'plan-started', correlationId);
```

### 8. Testing & Definition of Done (DoD)

#### A) Core Smoke (обязателен)

После Hard Reload:
- ✅ 0 красных ошибок
- ✅ 0×404
- ✅ RUN MODE visible
- ✅ FEED рендерится
- ✅ Вкладки переключаются

#### B) Action Chain Checks

Проверить ключевые цепочки:
- ✅ FEED Start → TALK открыт → plan seed корректен
- ✅ Plan Apply → state обновлён → FEED отражает

#### C) Visual Assets

- Ассеты могут давать warning
- Core не должен падать

### 9. Change Discipline

**Каждое изменение должно содержать:**

1. **Цель** (1 строка)
2. **Список файлов** (≤5)
3. **Возможные риски** (1–2)
4. **DoD**

### 10. File Structure

```
mobile-app/
  js/
    core/
      app-state.js      # Single source of truth
      dispatch.js       # Action routing
      effects.js        # Side effects isolation
      logger.js         # Logging system
    runtime-registry.js # Module registration
    state.js           # Legacy state (migrate to app-state)
```

## Migration Guide

### Step 1: Replace direct state access

**Before:**
```javascript
const planData = getPlanData(); // From localStorage
if (planData) { ... }
```

**After:**
```javascript
import { getState } from './js/core/app-state.js';

const state = getState();
if (state.plan.data) { ... }
```

### Step 2: Replace direct DOM manipulation with actions

**Before:**
```javascript
button.addEventListener('click', () => {
  switchView('talk');
  startPlanBuilder();
});
```

**After:**
```javascript
import { dispatch } from './js/core/dispatch.js';

button.addEventListener('click', () => {
  dispatch({
    type: 'FEED_START_PLAN',
    payload: {},
    reason: 'user-click'
  });
});
```

### Step 3: Register action handler

```javascript
import { registerActionHandler } from './js/core/dispatch.js';
import { getState, updateState } from './js/core/app-state.js';

registerActionHandler('FEED_START_PLAN', (payload, state) => {
  // Return state patch
  return {
    activeView: 'talk',
    plan: {
      ...state.plan,
      status: 'active'
    }
  };
});
```

### Step 4: Register effect

```javascript
import { registerEffect } from './js/core/dispatch.js';

registerEffect('FEED_START_PLAN', async (payload, newState, oldState, correlationId) => {
  // Side effects: switch view, start plan builder
  if (window.switchView) {
    window.switchView('talk');
  }
  if (window.startPlanBuilder) {
    window.startPlanBuilder();
  }
});
```

## Status

- ✅ Core infrastructure created
- ⏳ FEED migration in progress
- ⏳ TALK migration pending
- ⏳ Effects migration pending
