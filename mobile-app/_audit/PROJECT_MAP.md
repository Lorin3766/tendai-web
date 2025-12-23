# TendAI — Project Map (Single Source of Truth)
Generated: 2025-01-XX

## A) Entry Points (index.html)

### CSS Files (3)
- `styles/theme.css` — theme variables and base styles
- `styles/layout.css` — layout structure and calendar button styles
- `styles/components.css` — all component styles including calendar modal

### JavaScript Entry Points (3)
1. `js/calendar-init.js` — calendar initialization (loads BEFORE app-unified.js)
2. `js/bootstrap.js` — centralized module initialization
3. `app-unified.js` — main app logic (tabs, Talk component)

### Other Resources
- `manifest.json` — PWA manifest

---

## B) Runtime Ownership Map

### 1. Calendar Module (`js/calendar-init.js`)
**Entry Function:** `attachCalendarTrigger()`
- Called on: `DOMContentLoaded` or immediately if DOM ready
- Initializes:
  - Finds `#calendarBtn` (desktop) and `#calendarBtnMobile` (mobile)
  - Calls `ensureCalendarPanel()` from `calendar/ui.js`
  - Attaches `toggleCalendar()` click handlers
- Imports:
  - `calendar/ui.js` → `ensureCalendarPanel`, `toggleCalendar`
  - `calendar/events.js` → event forms (auto-initializes)
  - `calendar/reminders.js` → reminders (auto-initializes)

### 2. Bootstrap Module (`js/bootstrap.js`)
**Entry Function:** `initModules()`
- Called on: `DOMContentLoaded` or immediately if DOM ready
- Initializes:
  - `initProfileCompleteness()` from `profile-completeness.js`
  - `initUnreadTracking()` from `unread-messages.js`
  - `initUnreadMessages()` from `unread-messages-ui.js`
  - `initNextStep()` from `next-step.js`
- Auto-initializes (via IIFE/DOMContentLoaded):
  - `profile-modals.js` — profile modals
  - `feed-updater.js` — feed updater
  - `day-checkin.js` — day check-in
  - `services-init.js` — services initialization

### 3. App Unified (`app-unified.js`)
**Entry Function:** IIFE (immediately invoked)
- Initializes:
  - `TalkComponent` from `components/talk.js` (mounted in `#conversationCard`)
  - `initTabs()` — tab switching (FEED/TALK/SERVICES/PROFILE)
  - `safeInit('Calendar')` — checks calendar availability (doesn't initialize)
- Imports:
  - `components/talk.js` → `TalkComponent`
  - `components/talk.js` imports `llm.js` and `messageParser.js`

---

## C) Feature Ownership

### Calendar Feature
**Owner Folder:** `js/calendar/`
**Files:**
- `js/calendar-init.js` — entry point (attaches triggers)
- `js/calendar/ui.js` — UI rendering, panel management, `toggleCalendar()`
- `js/calendar/events.js` — event forms (`openEventAdd`, `openEventEdit`)
- `js/calendar/reminders.js` — reminders (`checkAndGenerateReminders`)
- `js/calendar/state.js` — calendar data (events storage, date utilities)

**CSS:**
- `styles/components.css` — `.calendar-panel`, `.calendar-day`, etc.
- `styles/layout.css` — `.calendar-header-btn`, `#calendarBtn` styles

**HTML:**
- `#calendarBtn` — desktop button (in tabs)
- `#calendarBtnMobile` — mobile button (in header)
- `#calendarPanel` — created dynamically by `ensureCalendarPanel()`

---

### Feed Feature
**Owner Files:**
- `js/feed-updater.js` — feed content updates (auto-initializes via DOMContentLoaded)
- `js/ai-feed-advice.js` — AI advice generation (exports only, called on demand)

**CSS:**
- `styles/components.css` — `.feed-view`, feed-related styles

**HTML:**
- `#feed-view` — feed container

---

### Talk Feature
**Owner Files:**
- `components/talk.js` — Talk component class (imported by `app-unified.js`)
- `js/llm.js` — LLM communication (`sendMessageToLLM`)
- `js/messageParser.js` — message parsing (`parseAndUpdateState`)

**CSS:**
- `styles/components.css` — `.talk-view`, `.conversation-card`, etc.

**HTML:**
- `#talk-view` — talk container
- `#conversationCard` — conversation area (mounted by TalkComponent)

---

### Services Feature
**Owner Files:**
- `js/services-init.js` — services initialization (auto-initializes via IIFE)
- `js/services-renderer.js` — services rendering (`renderAllServicesMobile`, `renderAllServicesDesktop`)
- `js/services-state.js` — services state (`servicesState`)

**CSS:**
- `styles/components.css` — `.services-view`, service-related styles

**HTML:**
- `#services-view` — services container
- `#screen-services` — mobile services screen
- `#col-right` — desktop right panel

---

### Profile Feature
**Owner Files:**
- `js/profile-completeness.js` — profile completeness tracking (exports `initProfileCompleteness`)
- `js/profile-modals.js` — profile modals (auto-initializes via DOMContentLoaded)
- `js/profile-schema.js` — profile schema (exports only)

**CSS:**
- `styles/components.css` — `.profile-view`, profile-related styles

**HTML:**
- `#profile-view` — profile container

---

### State/Storage Feature
**Owner Files:**
- `js/state.js` — global state (`dayState`, `talkState`, etc.)
- `js/calendar/state.js` — calendar-specific state (events storage)

**Storage:**
- `localStorage` — user preferences, active tab, etc.
- `localStorage` (calendar) — calendar events (via `calendar/state.js`)

---

### Utilities & Services
**Owner Files:**
- `js/units.js` — unit conversions
- `js/slider-config.js` — slider configuration
- `js/message-queue.js` — message queue (`addMessage`)
- `js/collapsible.js` — collapsible components
- `js/tendai-assistant.js` — assistant logic
- `js/location-service.js` — location service
- `js/weather-service.js` — weather service

---

### Check-ins Feature
**Owner Files:**
- `js/day-checkin.js` — day check-in (auto-initializes via IIFE)
- `js/morning-checkin.js` — morning check-in (exports, called from `next-step.js`)
- `js/evening-checkin.js` — evening check-in (exports, called from `next-step.js`)

---

### Other Features
**Owner Files:**
- `js/next-step.js` — next step logic (exports `initNextStep`)
- `js/daily-action.js` — daily actions (exports only)
- `js/soft-streak.js` — soft streak (exports only)
- `js/unread-messages.js` — unread tracking (exports `initUnreadTracking`)
- `js/unread-messages-ui.js` — unread UI (exports `initUnreadMessages`)

---

## Summary

**Total Entry Points:** 3 (calendar-init.js, bootstrap.js, app-unified.js)
**Total JS Modules:** 30
**Total CSS Files:** 3
**Total Features:** 6 (Calendar, Feed, Talk, Services, Profile, State/Storage)

