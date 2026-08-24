# PWA Icons

Placeholder PNGs (slate gradient) are generated here: **icon-192.png**, **icon-512.png**.

- **icon-192.png** — 192×192 px (Add to Home Screen, etc.)
- **icon-512.png** — 512×512 px (splash / high-DPI)

**Manifest:** `manifest.json` uses relative paths: `./assets/icons/icon-192.png`, `./assets/icons/icon-512.png`.

**If you still see 404 for icon-192.png:** The browser resolves the path relative to the page (or manifest) origin. Run the app with the app root = `mobile-app` (e.g. `npm start` → `serve mobile-app -l 3000`). Then the request goes to `http://localhost:3000/assets/icons/icon-192.png`, which matches this folder. If you serve from the repo root instead, the icons path may need to be `mobile-app/assets/icons/icon-192.png` in the manifest. Confirm in file explorer that `icon-192.png` and `icon-512.png` exist here.
