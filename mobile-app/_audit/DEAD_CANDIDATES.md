# Dead Code Candidates
Generated: 2025-01-XX

## Analysis Method
For each candidate, we check:
1. **grep**: Where it's mentioned (or not mentioned) — list of paths
2. **runtime**: Does it affect UI (yes/no) and why
3. **solution**: Delete or move to `mobile-app/_archive/2025-01-cleanup/`

---

## ✅ Already Archived (Safe to Keep in Archive)

### 1. `_archive/calendar-legacy.js`
**grep results:**
```
mobile-app/_archive/calendar-legacy.js (file exists)
No imports found in active codebase
```

**Proof:**
- `rg "calendar-legacy" mobile-app` → 0 results (except the file itself)
- `rg "import.*calendar-legacy|from.*calendar-legacy" mobile-app` → 0 results
- File is in `_archive/` folder, not in active codebase

**Runtime impact:** NO — file is not imported anywhere

**Solution:** ✅ Already in archive, keep as historical reference

---

### 2. `_archive/js-unused/leftPanel.js`
**grep results:**
```
mobile-app/_archive/js-unused/leftPanel.js (file exists)
No imports found in active codebase
```

**Proof:**
- `rg "leftPanel" mobile-app` → 0 results (except the file itself and services-renderer.js which mentions "left panel" as comment)
- `rg "import.*leftPanel|from.*leftPanel|LeftPanelComponent" mobile-app` → 0 results
- File is in `_archive/js-unused/` folder

**Runtime impact:** NO — file is not imported anywhere

**Solution:** ✅ Already in archive, keep as historical reference

---

### 3. `_archive/js-unused/rightPanel.js`
**grep results:**
```
mobile-app/_archive/js-unused/rightPanel.js (file exists)
No imports found in active codebase
```

**Proof:**
- `rg "rightPanel" mobile-app` → 0 results (except the file itself and services-renderer.js which mentions "right panel" as comment)
- `rg "import.*rightPanel|from.*rightPanel|RightPanelComponent" mobile-app` → 0 results
- File is in `_archive/js-unused/` folder

**Runtime impact:** NO — file is not imported anywhere

**Solution:** ✅ Already in archive, keep as historical reference

---

## ✅ Already Removed (CSS Dead Selectors)

### 4. `.calendar-fab` and `#calendarFab`
**grep results:**
```
mobile-app/_archive/2025-01-cleanup/FINAL_STATUS.md (historical reference only)
No CSS selectors found in active codebase
```

**Proof:**
- `rg "\.calendar-fab|#calendarFab" mobile-app/styles` → 0 results
- `rg "calendar-fab|calendarFab" mobile-app/index.html` → 0 results
- `rg "querySelector.*calendar-fab|getElementById.*calendarFab" mobile-app/js` → 0 results

**Runtime impact:** NO — selectors removed, elements don't exist in HTML

**Solution:** ✅ Already removed in previous cleanup

---

### 5. `.calendar-btn-today`
**grep results:**
```
No CSS selectors found in active codebase
```

**Proof:**
- `rg "\.calendar-btn-today" mobile-app/styles` → 0 results
- Actual class used: `.cal-today-btn` (found in `calendar/ui.js` line 347)

**Runtime impact:** NO — selector removed, actual class is `.cal-today-btn`

**Solution:** ✅ Already removed in previous cleanup

---

## ❌ No Dead Code Found in Active Codebase

All files in `mobile-app/js/` are used:
- All files are imported via `bootstrap.js`, `calendar-init.js`, or `app-unified.js`
- All exports are used (checked via grep)
- No unused CSS selectors found (except already removed ones)

---

## Summary

**Files to delete:** 0 (all archived files are already in `_archive/`)
**CSS selectors to remove:** 0 (already removed)
**Action required:** None — cleanup already complete

