# Duplicate Logic Scan
Generated: 2025-01-XX

## Analysis Method
Find files that do similar things by meaning:
- Two files do "check-in"
- Two files render "feed"
- Two files manage "messages/queue"

For each duplicate:
- Describe what each file does
- Decide which to keep as primary
- Which to archive (if any)
- Why

---

## 1. Check-in Logic

### Files:
- `js/day-checkin.js` — Day check-in modal (unified for mobile/desktop)
- `js/morning-checkin.js` — Morning check-in card in Feed
- `js/evening-checkin.js` — Evening check-in card in Feed

### Analysis:

**`day-checkin.js`:**
- Purpose: Modal form for daily check-in (sleep, water, energy, stress)
- Triggered by: `[data-open-checkin]` buttons
- UI: Modal overlay with form
- Auto-initializes: Yes (via IIFE)

**`morning-checkin.js`:**
- Purpose: Morning question card in Feed ("How are you feeling?")
- Triggered by: Time-based (before 2 PM), once per day
- UI: Card in Feed with buttons (good/okay/tired/stressed)
- Exports: `initMorningCheckIn()`, `shouldShowCheckIn()`, `saveCheckInAnswer()`

**`evening-checkin.js`:**
- Purpose: Evening question card in Feed ("How was your day?")
- Triggered by: Time-based (after 6 PM), once per day
- UI: Card in Feed with buttons (good/okay/hard/exhausting)
- Exports: `initEveningCheckIn()`, `shouldShowCheckIn()`, `saveCheckInAnswer()`

### Conclusion:
**NOT DUPLICATES** — Different purposes:
- `day-checkin.js` = Detailed modal form (sleep, water, energy, stress)
- `morning-checkin.js` = Simple morning mood question
- `evening-checkin.js` = Simple evening mood question

**Action:** ✅ Keep all three — they serve different purposes

---

## 2. Feed Rendering Logic

### Files:
- `js/feed-updater.js` — Feed UI updater
- `js/ai-feed-advice.js` — AI feed advice generator

### Analysis:

**`feed-updater.js`:**
- Purpose: Updates Feed UI elements (stats, cards, check-ins)
- Functions: `updateFeedHeaderStats()`, `updateFeedCards()`, `initFeedUI()`
- Auto-initializes: Yes (via DOMContentLoaded)
- Imports: `dayState`, `message-queue`, `daily-action`, `morning-checkin`, `evening-checkin`

**`ai-feed-advice.js`:**
- Purpose: Generates AI advice for Feed blocks (Quick advice, Nutrition insight, Tips)
- Functions: `generateAIAdvice()`, `getCachedAdvice()`
- Exports only: No auto-init, called on demand
- Imports: None (uses `window.dayState` dynamically)

### Conclusion:
**NOT DUPLICATES** — Different purposes:
- `feed-updater.js` = Updates existing UI elements (stats, cards)
- `ai-feed-advice.js` = Generates AI content for advice blocks

**Action:** ✅ Keep both — they serve different purposes

---

## 3. Message/Queue Management

### Files:
- `js/message-queue.js` — Message queue (unread messages like Telegram)

### Analysis:

**`message-queue.js`:**
- Purpose: Stores and manages unread messages for Feed and Talk
- Functions: `addMessage()`, `getUnreadMessages()`, `markAllAsRead()`, `getMessageQueue()`
- Used by: `calendar/reminders.js`, `morning-checkin.js`, `evening-checkin.js`, `daily-action.js`, `feed-updater.js`, `tendai-assistant.js`, `unread-messages-ui.js`

### Conclusion:
**NO DUPLICATES** — Single source of truth for message queue

**Action:** ✅ Keep — no duplicates found

---

## 4. Services Rendering

### Files:
- `js/services-init.js` — Services initialization
- `js/services-renderer.js` — Services rendering
- `js/services-state.js` — Services state

### Analysis:

**`services-init.js`:**
- Purpose: Initializes services rendering for mobile and desktop
- Functions: `initServices()`, `reRenderServicesOnShow()`
- Auto-initializes: Yes (via IIFE)
- Imports: `services-renderer.js`

**`services-renderer.js`:**
- Purpose: Renders services UI (mobile screen and desktop panel)
- Functions: `renderAllServicesMobile()`, `renderAllServicesDesktop()`
- Exports only: Called by `services-init.js`
- Imports: `services-state.js`

**`services-state.js`:**
- Purpose: Manages services state/data
- Exports: `servicesState` object
- Used by: `services-renderer.js`

### Conclusion:
**NOT DUPLICATES** — Clear separation of concerns:
- `services-init.js` = Initialization logic
- `services-renderer.js` = Rendering logic
- `services-state.js` = State management

**Action:** ✅ Keep all three — proper separation of concerns

---

## Summary

**Duplicates found:** 0

All files serve distinct purposes:
- Check-ins: 3 files (modal, morning card, evening card) — different UI/UX
- Feed: 2 files (updater, AI advice) — different responsibilities
- Services: 3 files (init, renderer, state) — proper separation of concerns
- Messages: 1 file (queue) — single source of truth

**Action required:** None — no duplicates to remove

