# Obrium — agent standing rules

Read this file at the start of every new task chat, together with the founder’s current task file.
Old documents under `archive/` (when present) are history, not requirements. Current requirements are the founder’s task files.

## Fresh-context protocol

- Start each new task in a **new chat** that begins with: `Read AGENTS.md and the task file`.
- Do not continue a finished task’s thread. Long threads make the agent slower and less accurate.

## Product

- Product name: **Obrium** (not TendAI, Serron, Seregin OS, or Human OS in user-visible copy).
- Wellness only. No judgments about the user’s values.
- Zero fabrication: never show a fake or simulated reply as if it came from the model.
- No new Gemini / off-device AI calls from app features unless the task explicitly requires them.
- Local-first. Privacy copy must stay true.
- Storage keys keep the `tendai_*` / `tendai-` convention by design. Every key lives in the local-storage inventory and is cleared by “Delete all local data”.

## User-visible vocabulary (do not use)

Avoid these words/phrases in UI copy: stage, baseline, calibration, signals, Human OS, agent codes, “On track”, “not done”. Prefer plain language (greeting, Log, Your focus areas, Saved, I now know N things, …).

## Visual

- Warm graphite + gold (`--bg` / `--bg-elevated` / `--bg-panel` / `--gold` `#f6c36a`).
- No glow or gradients on cards and buttons (flat fills; separation via 1px borders).
- Contrast: body text meets WCAG intent (`--fg`, `--fg-soft`, `--fg-muted` on elevated surfaces).
- Tap targets at least **44 px**.
- Interface accent: `--accent` / `--gold`. Focus-area colors (identity only, never good/bad):

| Area | Token | Hex |
| --- | --- | --- |
| Sleep | `--area-sleep` | `#8B9CFF` |
| Move | `--area-move` | `#4FD68A` |
| Nutrition | `--area-nutrition` | `#FF9F4A` |
| Labs | `--area-labs` | `#2FD6C6` |
| Stress | `--area-stress` | `#5CB8FF` |
| Longevity | `--area-longevity` | `#B8E04A` |
| Skin | `--area-skin` | `#FF7AB8` |
| Cardio | `--area-cardio` | `#FF6B6B` |
| Mental | `--area-mental` | `#C084FC` |

## Serve and test

- One server: `npm run serve` → `mobile-app` as web root on **http://127.0.0.1:5501**.
- Tests read `OBRIUM_URL` (default `http://127.0.0.1:5501`). Do not depend on Live Server’s workspace root.
- Live Server (if used): rooted at `/mobile-app`, port 5501 (see `.vscode/settings.json`).
- After each edit: `npm run test:quick` (layout + render; target under ~3 minutes).
- Once at the end of a task, before push: `npm run test:all`.
- Never loosen a test to make it pass. Intentional expectation updates must be listed and justified.

## Git / ship

- One commit per task item.
- No deletions without founder approval; prefer `git mv` into `archive/`.
- Before push: bump `BUILD_ID` / service-worker `CACHE_NAME` in lockstep when shipping app shell changes; push `main`; report the live build id.

## Scope discipline

- No behavior or visual change beyond the task.
- Do not silently work around problems — report what could not be verified.
