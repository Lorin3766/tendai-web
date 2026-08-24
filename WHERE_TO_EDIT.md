# Before editing: Cursor must output (1) RUN MODE, (2) list of files (max 5) with reasons. If >5 needed — stop and ask.

# Serron edit map (single entry policy)

- Entry point (only): `mobile-app/app-entry.js` — imports `app-unified.js`. Run mode is logged as `[RUN MODE] ...`.
- FEED (UI/logic): `mobile-app/app-unified.js` (unified source of truth). Do not edit `js/features/feed/feed-starter.js` for DEV; it is not loaded in this run mode.
- Styles shared: `mobile-app/styles/components.css`; Nebula theme: `mobile-app/styles/feed-nebula-cards.css`.
- Assets: `mobile-app/assets/feed-nebula/` (PNG backgrounds), `mobile-app/favicon.ico`.
- Env flags: `mobile-app/js/env-flags.js` (IS_DEV, RUN_MODE). Avoid defining env flags elsewhere.
- TALK core: `mobile-app/components/talk.js`.
- Runtime registry: `mobile-app/js/runtime-registry.js`.
- Legacy / do-not-touch unless asked: `mobile-app/_archive/**`, `mobile-app/js/_archive/**`, unused calendar legacy files, `mobile-app/js/features/feed/feed-starter.js` (not active in unified DEV).
- Timestamps/UX contract: use “Created:” for check-ins; at most 1 check-in per period per day (stable key `checkin:<period>:YYYY-MM-DD`); date+time context must be visible in FEED.

Workflow rule for Cursor:
1) Before edits: post a plan listing files you will touch and why (match this map).
2) Do not introduce a second entrypoint or parallel FEED path.
3) Keep assets names/paths exactly as listed to avoid 404.
