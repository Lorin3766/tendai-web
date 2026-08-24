# Serron Core Architecture

## Quick Start

### 1. Dispatch an Action

```javascript
import { dispatch } from './js/core/dispatch.js';
import { PLAN_START } from './js/core/actions.js';

// In your click handler
button.addEventListener('click', () => {
  dispatch({
    type: PLAN_START,
    payload: { planId: '...' },
    reason: 'user-click-start-button'
  });
});
```

### 2. Register Action Handler

```javascript
import { registerActionHandler } from './js/core/dispatch.js';
import { PLAN_START } from './js/core/actions.js';

registerActionHandler(PLAN_START, (payload, state) => {
  // Return state patch (immutable update)
  return {
    activeView: 'talk',
    plan: {
      ...state.plan,
      status: 'active'
    }
  };
});
```

### 3. Register Effect (Side Effects)

```javascript
import { registerEffect } from './js/core/dispatch.js';
import { PLAN_START } from './js/core/actions.js';

registerEffect(PLAN_START, async (payload, newState, oldState, correlationId) => {
  // Side effects: switch view, start plan builder
  if (window.switchView) {
    window.switchView('talk');
  }
  if (window.startPlanBuilder) {
    window.startPlanBuilder();
  }
  
  // Log effect
  console.log(`[EFFECT] Plan started, correlation=${correlationId}`);
});
```

### 4. Subscribe to State Changes

```javascript
import { subscribe, getState } from './js/core/app-state.js';

// Subscribe to state changes
const unsubscribe = subscribe((newState, oldState, patch) => {
  // React to state changes
  if (patch.activeView) {
    console.log(`View changed: ${oldState.activeView} → ${newState.activeView}`);
  }
  
  // Update UI based on state
  updateFeedUI(newState);
});

// Later, unsubscribe
// unsubscribe();
```

### 5. Use Effects Layer for Timers/Observers

```javascript
import { createIntervalEffect, startEffect, stopEffect } from './js/core/effects.js';

// Register interval effect
createIntervalEffect(
  'feed-update-timer',
  20000, // 20 seconds
  () => {
    // This runs every 20s
    dispatch({ type: 'FEED_UPDATE_TIME', reason: 'timer' });
  },
  'Update feed time labels'
);

// Start effect
startEffect('feed-update-timer');

// Stop effect (when needed)
stopEffect('feed-update-timer');
```

## Migration Example: FEED Start Button

### Before (Old Way)

```javascript
// In app-unified.js
button.addEventListener('click', () => {
  switchView('talk');
  startPlanBuilder();
  // Direct DOM manipulation
  // No state tracking
  // No logging
});
```

### After (New Way)

```javascript
// 1. In click handler
import { dispatch } from './js/core/dispatch.js';
import { PLAN_START } from './js/core/actions.js';

button.addEventListener('click', () => {
  dispatch({
    type: PLAN_START,
    payload: {},
    reason: 'user-click-start-button'
  });
});

// 2. Register handler (in app-unified.js init)
import { registerActionHandler } from './js/core/dispatch.js';
import { PLAN_START } from './js/core/actions.js';

registerActionHandler(PLAN_START, (payload, state) => {
  return {
    activeView: 'talk',
    plan: {
      ...state.plan,
      status: 'active'
    }
  };
});

// 3. Register effect (in app-unified.js init)
import { registerEffect } from './js/core/dispatch.js';

registerEffect(PLAN_START, async (payload, newState, oldState, correlationId) => {
  if (window.switchView) {
    window.switchView('talk');
  }
  if (window.startPlanBuilder) {
    window.startPlanBuilder();
  }
});

// 4. Subscribe to state changes (in app-unified.js init)
import { subscribe } from './js/core/app-state.js';

subscribe((newState, oldState, patch) => {
  if (patch.activeView) {
    // Update UI based on state
    updateViewUI(newState.activeView);
  }
});
```

## Benefits

1. **Traceability**: Every action has a correlation ID that flows through state → effects → render
2. **Testability**: Easy to test actions and state changes in isolation
3. **Debugging**: Full action history and state history in DEV mode
4. **Predictability**: Unidirectional flow eliminates "ghost bugs"
5. **Scalability**: Easy to add new features without breaking existing ones

## Next Steps

1. Migrate FEED actions to use dispatch
2. Migrate TALK actions to use dispatch
3. Replace direct state access with AppState
4. Register all timers/observers through Effects Layer
5. Add module isolation guards
