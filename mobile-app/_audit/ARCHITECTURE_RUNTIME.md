# ARCHITECTURE_RUNTIME — Карта реального runtime (NO CHAOS)

**RUN MODE:** `unified`  
**Цель:** Понятная карта: что активное, что legacy-заблокировано, entrypoint, Single Source of Truth.

---

## 1) Runtime Overview

**RUN MODE:** `unified`  
**Источник режима:** `mobile-app/js/env-flags.js` → `RUN_MODE = 'unified'`

### Active entry (подключено в `mobile-app/index.html`)

Скрипты в порядке загрузки:

1. `<script type="module" src="js/calendar-init.js"></script>`
2. `<script type="module" src="js/bootstrap.js"></script>`
3. `<script type="module" src="app-unified.js"></script>`

### Что НЕ используется

- **`app-entry.js`** — существует, в HTML **не** подключён. Boot идёт через `calendar-init` → `bootstrap` → `app-unified`.

---

## 2) Single Source of Truth (SSOT)

| Что | Файл / путь |
|-----|-------------|
| **State** | `mobile-app/js/core/app-state.js` — `getState()`, `subscribe()`, `updateState()`. Plan / feed / talk state. |
| **State (legacy)** | `mobile-app/js/state.js` — profile, day, feed, talk (другая структура). |
| **FEED plan cards render** | `mobile-app/app-unified.js` — функция `renderFeedPlanCards()` (около line 61). Рендер в `#feed-view` / `#pinnedPlansCard`. |
| **TALK component owner** | `mobile-app/components/talk.js` — класс `TalkComponent`. |
| **Calendar active owner** | `mobile-app/js/features/calendar/` — `ui.js`, `events.js`, `reminders.js`, `state.js`. Инициализация через `calendar-init.js`. |

---

## 3) Active Features (USED in unified)

Только то, что реально исполняется (импорты из `index.html` → `calendar-init` / `bootstrap` / `app-unified`).

| Фича | Модули |
|------|--------|
| **FEED** | `app-unified.js` (plan cards), `js/features/feed/feed-updater.js`, `js/features/feed/next-step.js`, `ai-feed-advice`, `daily-action`, check-ins, `tendai-assistant` |
| **TALK** | `components/talk.js` (инициализация в `app-unified.js`) |
| **Calendar** | `js/calendar-init.js` → `js/features/calendar/ui.js`, `events.js`, `reminders.js` |
| **Plan** | `app-unified.js` (`renderFeedPlanCards`), state из `core/app-state.js` |
| **Navigation** | `app-unified.js` — табы FEED/TALK, bottom nav, `switchView()` |
| **Profile** | `js/features/profile/profile-modals.js`, `profile-completeness.js` |
| **Services** | `js/features/services/services-init.js`, `services-renderer.js`, `services-state.js` |
| **Storage / collapsible** | `js/features/storage/collapsible.js` (и др. в `features/storage/`) |

---

## 4) Legacy Blocklist (BLOCKED in unified)

Файлы, которые **сейчас блокируются** (guard / не импортируются). Логику не менять.

| Файл | Why exists | How blocked |
|------|------------|-------------|
| `mobile-app/js/_legacy_blocklist.js` | Определяет `shouldBlockLegacy()` для unified. | Не «блокируется», а **используется** другими legacy-модулями. Не менять логику. |
| `mobile-app/js/feed-updater.js` | Legacy duplicate старого feed pipeline. | `shouldBlockLegacy()` → export stubs, остальной код в `else`. Не импортируется (bootstrap использует `features/feed/feed-updater.js`). |
| `mobile-app/js/next-step.js` | Legacy duplicate next-step. | `shouldBlockLegacy()` → `isBlocked`; `getNextStep()` и др. делают early return. Не импортируется (`features/feed/next-step.js`). |
| `mobile-app/js/profile-modals.js` | Legacy duplicate profile modals. | `shouldBlockLegacy()` → stub `window.openProfileModal` и др. Не импортируется (`features/profile/profile-modals.js`). |
| `mobile-app/js/calendar/ui.js` | Legacy duplicate календаря. | `RUN_MODE === 'unified'` → export stubs. Не импортируется (`calendar-init` использует `features/calendar/ui.js`). |

---

## 5) Known Duplicate Zones (Danger Map)

По `TECH_AUDIT_REPORT.md`:

### DUPLICATES present

- **`js/calendar/`** vs **`js/features/calendar/`** — активен только `features/calendar/`.
- **`js/feed-updater.js`**, **`js/next-step.js`** vs **`js/features/feed/`** — активны только `features/feed/*`.
- **`js/profile-modals.js`** vs **`js/features/profile/profile-modals.js`** — активен только `features/`.
- **`js/collapsible.js`** vs **`js/features/storage/collapsible.js`** — активен только `features/storage/collapsible.js`.

### MULTIPLE click listeners (`document.addEventListener('click', ...)`)

| Файл | Строка | Active / Blocked |
|------|--------|------------------|
| `js/features/profile/profile-modals.js` | ~1917 | **active** |
| `js/features/storage/collapsible.js` | ~158 | **active** |
| `js/profile-modals.js` | ~1935 | **blocked** (legacy, not imported) |
| `js/collapsible.js` | ~158 | **blocked** (legacy, not imported) |

Табы и bottom nav — прямые `addEventListener('click')` на элементы в `app-unified.js`, не `document`-делегаты.

---

## 6) Safe Editing Rules

1. **Unified FEED plan cards** — меняем только **owner**: `mobile-app/app-unified.js` (`renderFeedPlanCards` и связанная логика). FEED stats / next step — в `js/features/feed/*`.
2. **Legacy blocked files** не трогаем, кроме комментариев. См. список в п. 4.
3. **Новая фича:** один owner, один init, один контейнер. Не дублировать в `js/` и `js/features/`.
4. **Новые глобальные `document.addEventListener('click')`** — только через делегат в owner (например, `profile-modals` или отдельный owner). Не плодить разрозненные document‑клики.
5. **HTML** подключает **только** эти entry‑скрипты: `js/calendar-init.js`, `js/bootstrap.js`, `app-unified.js`. Других entry в `index.html` нет.
6. **Перед правками:** Ctrl+Shift+F по имени функции / логу → убедиться, что правим **active** path (не legacy из п. 4–5).

---

**См. также:** `TECH_AUDIT_REPORT.md`, `WHERE_TO_EDIT.md`, `ARCHITECTURE_IMPLEMENTATION.md`.
