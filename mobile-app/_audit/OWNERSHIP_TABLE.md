# TendAI — Ownership Table
Generated: 2025-01-XX

## Table: File → Feature → Role → Called From

| File | Feature | Role | Called From |
|------|---------|------|-------------|
| **ENTRY POINTS** |
| `js/bootstrap.js` | (entry) | init | `index.html` |
| `js/calendar-init.js` | calendar | init | `index.html` |
| `app-unified.js` | (entry) | init | `index.html` |
| **CALENDAR** |
| `js/calendar-init.js` | calendar | init | `index.html` |
| `js/features/calendar/ui.js` | calendar | ui | `calendar-init.js` |
| `js/features/calendar/events.js` | calendar | ui | `calendar-init.js` |
| `js/features/calendar/reminders.js` | calendar | ui | `calendar-init.js` |
| `js/features/calendar/state.js` | calendar | state | `calendar/ui.js`, `calendar/events.js`, `calendar/reminders.js` |
| **FEED** |
| `js/features/feed/feed-updater.js` | feed | init | `bootstrap.js` (auto-initializes) |
| `js/features/feed/ai-feed-advice.js` | feed | utils | `feed-updater.js` (on demand) |
| `js/features/feed/day-checkin.js` | feed | ui | `bootstrap.js` (auto-initializes) |
| `js/features/feed/morning-checkin.js` | feed | ui | `next-step.js`, `feed-updater.js` |
| `js/features/feed/evening-checkin.js` | feed | ui | `feed-updater.js` |
| `js/features/feed/daily-action.js` | feed | utils | `feed-updater.js`, `morning-checkin.js` |
| `js/features/feed/next-step.js` | feed | init | `bootstrap.js` |
| `js/features/feed/tendai-assistant.js` | feed | utils | `bootstrap.js` (imported) |
| **TALK** |
| `components/talk.js` | talk | ui | `app-unified.js` |
| `js/features/talk/llm.js` | talk | utils | `components/talk.js` |
| `js/features/talk/messageParser.js` | talk | utils | `components/talk.js` |
| **SERVICES** |
| `js/features/services/services-init.js` | services | init | `bootstrap.js` (auto-initializes) |
| `js/features/services/services-renderer.js` | services | ui | `services-init.js` |
| `js/features/services/services-state.js` | services | state | `services-renderer.js` |
| **PROFILE** |
| `js/features/profile/profile-completeness.js` | profile | init | `bootstrap.js` |
| `js/features/profile/profile-modals.js` | profile | ui | `bootstrap.js` (auto-initializes) |
| `js/features/profile/profile-schema.js` | profile | state | `profile-completeness.js`, `profile-modals.js` |
| **STORAGE** |
| `js/state.js` | storage | state | All features (global state) |
| `js/features/storage/message-queue.js` | storage | state | `calendar/reminders.js`, `morning-checkin.js`, `evening-checkin.js`, `daily-action.js`, `feed-updater.js`, `tendai-assistant.js`, `unread-messages-ui.js` |
| `js/features/storage/unread-messages.js` | storage | init | `bootstrap.js` |
| `js/features/storage/unread-messages-ui.js` | storage | ui | `bootstrap.js` |
| `js/features/storage/soft-streak.js` | storage | utils | `morning-checkin.js`, `evening-checkin.js` |
| `js/features/storage/location-service.js` | storage | utils | `weather-service.js`, `profile-modals.js` |
| `js/features/storage/weather-service.js` | storage | utils | `daily-action.js`, `feed-updater.js` |
| `js/features/storage/units.js` | storage | utils | `bootstrap.js` (imported) |
| `js/features/storage/slider-config.js` | storage | utils | `day-checkin.js`, `profile-modals.js` |
| `js/features/storage/collapsible.js` | storage | utils | `bootstrap.js` (imported) |

## Summary by Feature

### Calendar (5 files)
- **init:** `calendar-init.js`
- **ui:** `calendar/ui.js`, `calendar/events.js`, `calendar/reminders.js`
- **state:** `calendar/state.js`

### Feed (7 files)
- **init:** `feed-updater.js`, `next-step.js`
- **ui:** `day-checkin.js`, `morning-checkin.js`, `evening-checkin.js`
- **utils:** `ai-feed-advice.js`, `daily-action.js`, `tendai-assistant.js`

### Talk (3 files)
- **ui:** `components/talk.js`
- **utils:** `llm.js`, `messageParser.js`

### Services (3 files)
- **init:** `services-init.js`
- **ui:** `services-renderer.js`
- **state:** `services-state.js`

### Profile (3 files)
- **init:** `profile-completeness.js`
- **ui:** `profile-modals.js`
- **state:** `profile-schema.js`

### Storage (9 files)
- **state:** `state.js`, `message-queue.js`
- **init:** `unread-messages.js`
- **ui:** `unread-messages-ui.js`
- **utils:** `soft-streak.js`, `location-service.js`, `weather-service.js`, `units.js`, `slider-config.js`, `collapsible.js`

## Total: 30 files

