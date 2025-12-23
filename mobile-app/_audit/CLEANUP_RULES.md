# TendAI Cleanup Rules
Generated: 2025-01-XX

## Purpose
Prevent codebase clutter and ensure single source of truth.

---

## 1. Where to Store Reports

**Location:** `mobile-app/_audit/`
- All audit reports, maps, and analysis documents
- Examples: `PROJECT_MAP.md`, `DEAD_CANDIDATES.md`, `DUPLICATES.md`, `CLEANUP_REPORT.md`

**DO NOT:**
- Create `*_final*.md` in project root
- Create `*_report*.md` in project root
- Create `*_audit*.md` in project root
- Create `*_status*.md` in project root

**DO:**
- Use `_audit/` for all analysis and reports
- Use descriptive names: `PROJECT_MAP.md`, not `map.md`

---

## 2. Where to Store Experimental/Temporary Files

**Location:** `mobile-app/_archive/YYYY-MM-description/`
- Old/unused code that might be needed for reference
- Examples: `_archive/2025-01-cleanup/`, `_archive/js-unused/`

**DO NOT:**
- Delete files immediately — move to archive first
- Create archives in root directory
- Mix archived files with active code

**DO:**
- Use date-based folder names: `2025-01-cleanup/`
- Add README in archive folder explaining what's archived and why
- Keep archives organized by purpose: `js-unused/`, `reports/`, etc.

---

## 3. Prohibited File Patterns

**NEVER create in project root:**
- `*_final*.md`
- `*_report*.md`
- `*_audit*.md`
- `*_status*.md`
- `*_debug*.md`
- `*_checklist*.md`
- `*_verification*.md`

**NEVER create in `mobile-app/`:**
- `*_final*.js`
- `*_old*.js`
- `*_backup*.js`
- `*_legacy*.js` (unless in `_archive/`)

**Exception:** Files in `_archive/` or `_audit/` can use any naming pattern.

---

## 4. Code Organization Rules

### JavaScript Files

**Active code:**
- All files in `mobile-app/js/` must be imported somewhere
- Entry points: `calendar-init.js`, `bootstrap.js`, `app-unified.js`
- Feature folders: `js/calendar/` for calendar feature

**Dead code:**
- If file is not imported → move to `_archive/`
- If exports are unused → investigate, then archive if confirmed unused

### CSS Files

**Active code:**
- All selectors must be used in HTML or JS (querySelector/getElementById)
- Dead selectors → remove immediately (no archive needed)

**Organization:**
- `styles/theme.css` — theme variables
- `styles/layout.css` — layout structure
- `styles/components.css` — component styles

### HTML Files

**Active code:**
- `index.html` — main entry point
- `privacy-policy.html`, `terms-of-use.html`, `disclaimer.html` — legal pages

---

## 5. Verification Before Cleanup

**Before moving/deleting any file:**

1. **grep check:**
   ```bash
   rg "filename" mobile-app
   ```

2. **Import check:**
   ```bash
   rg "import.*filename|from.*filename" mobile-app
   ```

3. **Runtime check:**
   - Does it affect UI? (yes/no)
   - Is it called on page load? (yes/no)
   - Is it exported and used? (yes/no)

4. **Document decision:**
   - Add entry to `DEAD_CANDIDATES.md` with proof
   - Move to archive (don't delete immediately)
   - Update `PROJECT_MAP.md` if needed

---

## 6. Git Workflow

**For cleanup work:**
- Always use feature branch: `chore/cleanup-*`
- Never cleanup directly in `main`/`master`
- Commit with clear messages: `chore: archive unused files`

**Before merging:**
- Verify all acceptance tests pass
- Update `CLEANUP_REPORT.md`
- Ensure no broken imports

---

## 7. Single Source of Truth

**Each feature has ONE entry point:**
- Calendar → `js/calendar-init.js`
- Feed → `js/feed-updater.js` (auto-initializes)
- Talk → `components/talk.js` (imported by `app-unified.js`)
- Services → `js/services-init.js` (auto-initializes)
- Profile → `js/profile-completeness.js` + `js/profile-modals.js`

**DO NOT:**
- Create multiple entry points for same feature
- Duplicate initialization logic
- Create "final" or "new" versions of existing files

---

## 8. Enforcement

**Pre-commit checks:**
- `scripts/check-syntax.js` — syntax validation
- Manual review for new `*_final*`, `*_report*` files in root

**Code review:**
- Reject PRs that create temporary files in root
- Require moving to `_archive/` or `_audit/`

---

## Summary

✅ **DO:**
- Store reports in `_audit/`
- Archive unused code in `_archive/YYYY-MM-description/`
- Verify before cleanup (grep + runtime)
- Use feature branches for cleanup

❌ **DON'T:**
- Create `*_final*`, `*_report*` in root
- Delete files without proof
- Mix archived and active code
- Create duplicate entry points

