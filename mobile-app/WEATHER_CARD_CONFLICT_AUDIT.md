# Weather Card Visual Stack — Conflict Audit

**Date:** 2025  
**Goal:** Identify and list all conflicting styles/scripts that can muddy the weather card background or turn effects into "moving stripes," and propose clean-up for permission.

---

## 1. Global search: filters affecting weather card stack

### 1.1 CSS `filter` / `backdrop-filter` touching weather card

| File | Selector | Rule | Notes |
|------|----------|------|--------|
| **components.css** | `.weather-bg` | `filter: none` | Base rule — OK. |
| **components.css** | (same block) `#weatherCard` | `filter: none` | On card container — OK. |
| **components.css** | `.weather-effects-layer.has-rain::before/::after` | `filter: blur(1.5px)` | Rain lines softened — OK. |
| **components.css** | `.weather-effects-layer.has-fog::before/::after` | `backdrop-filter: blur(8px)` | Fog layer — can read as stripes if gradient is banded (see §4). |
| **components.css** | `.weather-effect-overlay.weather-overlay-raindrop` | `backdrop-filter: blur(0.5px)` | Frost/raindrop overlay — separate from photo. |
| **components.css** | `#weatherCard .weather-glass` | `backdrop-filter: blur(4px)` | Content glass — OK for depth. |

**JS (inline style):**  
- **feed-updater.js** sets `el.style.filter` in `setLayerImage` (around line 309).  
- Current logic: filter is stripped to no grayscale/sepia/hue-rotate and defaults to `'none'`, so photo is at full brightness.  
- **context-engine.js** still returns `getFilterForCondition()` strings that include **grayscale** and **blur** (rain/cloudy/fog). Those are stripped in feed-updater before application; the **source** of muddy filters is **context-engine.js** `getFilterForCondition()` (lines 255–259).

**Summary:** No remaining brightness/sepia/grayscale applied to `#weatherCardBg` from JS (feed-updater clears them). CSS does not apply brightness/sepia/grayscale to the photo layer. Legacy **source** of such filters: **context-engine.js** `getFilterForCondition()`.

---

## 2. "!important" clashes (background / overlays)

### 2.1 theme.css

| Selector | Rule | Affects weather? |
|----------|------|-------------------|
| `html[data-theme="graphite"]` | `background: #0f1114 !important` | No (root). |
| `html[data-theme="graphite"] body` | `background: #0f1114 !important` | No (body only). |
| `html[data-theme="graphite"] body` | `background-image: none !important` | No (body only; photo is on `#weatherCardBg`). |
| `html[data-theme="graphite"] body::before, ::after` | `background: none !important` | No. |
| `html[data-theme="graphite"] .tendai-layout` | `background: #0f1114 !important` | No (layout wrapper). |

**Conclusion:** theme.css does **not** target `#weatherCard`, `#weatherCardBg`, or `.weather-glass`. No direct clash with the weather card background image.

### 2.2 components.css (weather-related and overlay-related)

| Selector | Rule | Conflict? |
|----------|------|-----------|
| `#weatherCard`, `.weather-card--cinematic` (block ~4320–4337) | `background: transparent !important; background-image: none !important` | **No.** These apply to the **card container** (`#weatherCard`), not to the background **child** `#weatherCardBg` (`.weather-bg`). The photo is on the child; container has no background by design. |
| `.weather-card--cinematic.weather-card--empty` | `background: rgba(26, 29, 34, 0.5) !important` | No (empty state only). |
| `#weatherCard .weather-glass` (and duplicate block) | `background: rgba(0, 0, 0, 0.15) !important` | No (content panel; does not set background-image). |

**Conclusion:** No !important rule in components.css or theme.css removes or overrides the **background-image** on `#weatherCardBg`. The only background-image on the photo layer is set in JS with `!important` in feed-updater.

---

## 3. JS logic de-duplication (weather card update)

- **feed-updater.js:**  
  - Defines `applyWeatherCardBackgroundFromContext`, `updateWeather`, `applyDefaultWeatherBackground`.  
  - Calls `applyWeatherCardBackgroundFromContext` from `updateWeather()` (when weather loads) and from `applyDefaultWeatherBackground()` (on DOM ready).  
  - **Single source of truth** for updating the weather card UI (background, effects, text).

- **app-unified.js:**  
  - **No references** to `weatherCard`, `weatherCardBg`, `updateWeather`, or `applyWeather`.  
  - Does **not** update the weather card.

**Conclusion:** No duplicate weather-card update; only feed-updater.js drives the weather card. No change needed.

---

## 4. Trace: "moving stripes" (weather-effects-layer)

**Cause:** The fog effect uses a **horizontal linear-gradient** with several color stops (0%, 25%, 50%, 75%, 100%) and **background-size: 200% 100%** with an animation that **translates** the layer (`translateX(5%)`). That produces visible **horizontal bands** (stripes) that move.

**Relevant CSS (components.css):**

- **.weather-effects-layer.has-fog::before**  
  - `background: linear-gradient(90deg, ... 0%, ... 25%, ... 50%, ... 75%, ... 100%)`  
  - `background-size: 200% 100%`  
  - `animation: weather-effects-fog-drift` (translateX 0 → 5% → 0)  
  - `backdrop-filter: blur(8px)`  
  - `opacity: 0.15`

- **.weather-effects-layer.has-fog::after**  
  - Solid tint + same drift animation (reverse)  
  - `backdrop-filter: blur(8px)`  
  - `opacity: 0.15`

**Why it looks like stripes:**  
- The gradient has four distinct bands (25%, 50%, 75%).  
- Even at low opacity, the **difference between stops** creates edges.  
- **backdrop-filter** blurs what’s **behind** the element; it does not blur the **gradient paint** of this element, so the gradient edges stay relatively sharp.  
- So: **linear-gradient banding + animation = “moving stripes.”**

**Fix (proposed):**  
- Replace the banded gradient with a **single, smooth** fog (e.g. one or two very close stops, or a single semi-transparent color).  
- Optionally add a **filter: blur()** on the fog pseudo-elements so the **painted** gradient is softened (not only the content behind).

---

## 5. Final clean-up proposal (for permission)

Below are the **conflicts and legacy sources** and the proposed changes. **No edits have been applied yet;** please confirm before applying.

---

### A. Remove / neutralize legacy filter source (context-engine.js)

**Issue:** `getFilterForCondition()` still returns strings with **grayscale**, **blur**, and reduced **brightness**. feed-updater strips grayscale/sepia/hue-rotate before applying, but the function remains the single source of “muddy” filter ideas and is still used for `context.filter`.

**Proposal:**  
- **Option 1 (recommended):** Change `getFilterForCondition()` to return `''` for all conditions so no filter is suggested for the photo layer (keep photo at natural brightness/colors).  
- **Option 2:** Keep it but remove only grayscale/sepia/blur from the returned strings so only very light brightness/contrast remain (if you want a tiny mood tint).

**File:** `mobile-app/js/features/feed/context-engine.js` (lines 255–259).

---

### B. Fog “stripes” → soft fog (components.css)

**Issue:** Fog uses a multi-stop horizontal gradient + drift animation, which reads as moving stripes.

**Proposal:**  
- Replace the banded `linear-gradient(90deg, ... 25% ... 50% ... 75% ...)` with a **single-color** or **two-stop smooth** overlay (e.g. one rgba over full width).  
- Optionally add a small **filter: blur(2px)** (or similar) on `.weather-effects-layer.has-fog::before` and `::after` so the painted layer is softened.  
- Keep `backdrop-filter: blur(8px)` and low opacity (e.g. 0.15) so the effect stays a “whisper.”

**File:** `mobile-app/styles/components.css` (`.weather-effects-layer.has-fog::before` and `::after`).

---

### C. Optional: Clarify card container vs. background layer (components.css)

**Issue:** The rule `#weatherCard, ... { background: transparent !important; background-image: none !important }` applies to the **card** element. It does not affect `#weatherCardBg`. For clarity and to avoid future mistakes, add a short comment that the photo lives on the **child** `.weather-bg` / `#weatherCardBg`, not on `#weatherCard`.

**Proposal:** Add one comment line above the `background-image: none !important` line: e.g. `/* Card container only; photo is on #weatherCardBg (.weather-bg) */`.

**File:** `mobile-app/styles/components.css` (block around 4334–4336).

---

### D. No change (confirmed)

- **theme.css:** No rule targets the weather card or its background; no change.  
- **app-unified.js:** Does not update the weather card; no change.  
- **feed-updater.js:** Already strips grayscale/sepia/hue-rotate and uses `filter: 'none'`; no further change required for “kill filters” goal.

---

## Summary table

| # | Item | File | Action |
|---|------|------|--------|
| 1 | Legacy filter source (grayscale/blur/brightness) | context-engine.js | **Propose:** Return `''` from `getFilterForCondition()` (or remove grayscale/blur only). |
| 2 | Fog gradient banding → moving stripes | components.css | **Propose:** Single-color or smooth two-stop fog + optional filter blur on fog pseudo-elements. |
| 3 | Card container background comment | components.css | **Propose:** Add comment that photo is on #weatherCardBg. |
| 4 | theme.css | theme.css | No change. |
| 5 | app-unified.js | app-unified.js | No change. |
| 6 | feed-updater filter application | feed-updater.js | No change. |

---

**Permission:** Please confirm which of the proposed changes (A, B, C) you want applied, or ask for a different approach (e.g. only A, or A+B but not C). Once you confirm, the changes can be implemented as agreed.
