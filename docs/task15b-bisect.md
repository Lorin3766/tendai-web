# Task 15b-1 — failing-test bisect (v11e-15 vs v11e-16)

Method: clean worktrees at `916b71d` (pre-15a / v11e-15) and `c0991a0` (v11e-16).  
Each of the 8 tests run **alone, twice**. Servers: `5515` (v15) and `5516` (v16).

| test | v11e-15 (r1/r2) | v11e-16 (r1/r2) | first error | kind | caused by 15a? |
| --- | --- | --- | --- | --- | --- |
| verify-talk-part3.mjs | PASS / PASS (~14s / ~11s) | PASS / PASS (~11s / ~11s) | — | — | **No** |
| verify-talk-part4.mjs | PASS / PASS (~32s / ~25s) | PASS / PASS (~33s / ~24s) | — | — | **No** |
| verify-talk-part5.mjs | PASS / PASS (~14s / ~14s) | PASS / PASS (~14s / ~14s) | — | — | **No** |
| verify-onboarding-sync-fixes.mjs | PASS / PASS (~29s / ~30s) | PASS / PASS (~31s / ~30s) | — | — | **No** |
| verify-task4-privacy.mjs | PASS / PASS (~9s / ~9s) | PASS / PASS (~10s / ~10s) | — | — | **No** |
| verify-task5c-consent.mjs | PASS / PASS (~23s / ~23s) | PASS / PASS (~23s / ~23s) | — | — | **No** |
| verify-task6b-feed-toggle.mjs | PASS / PASS (~10s / ~9s) | PASS / PASS (~10s / ~12s) | — | — | **No** |
| verify-task14c-1.mjs | PASS / PASS (~13s / ~13s) | PASS / PASS (~13s / ~13s) | — | — | **No** |

## Cause of the earlier `test:all` reds

None of the eight are assertion regressions from 15a (library, Today selector, `tendai_library_shown_v1`, or source labels).  
When run alone they pass on both builds. The earlier suite reds were **load / timeout flakiness** under a long sequential `verify-all` run (Playwright `TimeoutError`s), plus one mid-bump `verify-task14c-1` failure when BUILD_ID was only partially updated during the 15a ship.

Live-relay / Gemini scripts remain SKIPPED by design (not among these eight).

Raw JSON: `scripts/_bisect-v11e-15.json`, `scripts/_bisect-v11e-16.json`.
