# TendAI — Used Files Map (Single Source of Truth)
Generated: 2025-01-XX

## HTML Entry Point
- `mobile-app/index.html` — main entry point

## CSS Files (Loaded in index.html)
- `styles/theme.css` — theme variables and base styles
- `styles/layout.css` — layout structure and calendar button styles
- `styles/components.css` — all component styles including calendar modal

## JavaScript Entry Points (Loaded in index.html)
1. `js/calendar-init.js` — calendar initialization
2. `js/bootstrap.js` — centralized module initialization
3. `app-unified.js` — main app logic

## JavaScript Dependencies

### Calendar Module (from calendar-init.js)
- `js/calendar/ui.js` — calendar UI and rendering
- `js/calendar/events.js` — event forms
- `js/calendar/reminders.js` — reminders
- `js/calendar/state.js` — calendar data (imported by ui.js, events.js, reminders.js)

### Bootstrap Module Dependencies (from bootstrap.js)
**Utilities:**
- `js/state.js` — global state
- `js/units.js` — unit conversions
- `js/slider-config.js` — slider configuration
- `js/message-queue.js` — message queue
- `js/collapsible.js` — collapsible components

**Core Services:**
- `js/tendai-assistant.js` — assistant logic
- `js/location-service.js` — location service
- `js/weather-service.js` — weather service

**Profile Modules:**
- `js/profile-completeness.js` — profile completeness (exports initProfileCompleteness)
- `js/profile-modals.js` — profile modals (auto-initializes)
- `js/profile-schema.js` — profile schema (exports only)

**Feed Modules:**
- `js/feed-updater.js` — feed updater (auto-initializes)
- `js/ai-feed-advice.js` — AI feed advice (exports only)

**Check-ins:**
- `js/day-checkin.js` — day check-in (auto-initializes via IIFE)
- `js/morning-checkin.js` — morning check-in (exports, called from next-step)
- `js/evening-checkin.js` — evening check-in (exports, called from next-step)

**Unread Messages:**
- `js/unread-messages.js` — unread tracking (exports initUnreadTracking)
- `js/unread-messages-ui.js` — unread UI (exports initUnreadMessages)

**Services:**
- `js/services-init.js` — services initialization (auto-initializes via IIFE)
- `js/services-renderer.js` — services rendering (imported by services-init.js)
- `js/services-state.js` — services state (imported by services-renderer.js)

**Other Modules:**
- `js/next-step.js` — next step logic (exports initNextStep)
- `js/daily-action.js` — daily actions (exports only)
- `js/soft-streak.js` — soft streak (exports only)

### App Unified Dependencies (from app-unified.js)
- `components/talk.js` — Talk component (imports llm.js and messageParser.js)

### Talk Component Dependencies (from components/talk.js)
- `js/llm.js` — LLM communication
- `js/messageParser.js` — message parsing

## Summary
**Total JS files in use:** 30
**Total CSS files in use:** 3
**Total HTML entry points:** 1

