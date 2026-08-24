# Capacitor setup (TendAI native build)

## 1. Install dependencies

From the project root:

```bash
npm install
```

## 2. Add native projects (first time)

```bash
npx cap add ios
npx cap add android
```

## 3. Sync web app into native projects

After any change to the `mobile-app/` folder:

```bash
npx cap sync
```

## 4. Open in IDE and run

- **iOS:** `npx cap open ios` (opens Xcode). Set your team, then run on simulator or device.
- **Android:** `npx cap open android` (opens Android Studio). Run on emulator or device.

## 5. Health plugin (steps & heart rate)

The app uses **@capgo/capacitor-health** for Apple Health and Health Connect (Android).

- **iOS:** In Xcode, enable the **HealthKit** capability and add usage descriptions in `Info.plist` (e.g. `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`) for steps and heart rate.
- **Android:** Ensure **Health Connect** is available (API 26+). The plugin will request runtime permissions.

When running in **browser** or without the plugin, the app uses fallback (mock) data and logs:  
`[HealthSync] No hardware data found, using fallback.`

## 6. App entry

- The web app is served from the `mobile-app/` directory (`webDir` in `capacitor.config.json`).
- No build step is required for development; use `npx serve mobile-app -l 3000` for local PWA testing.
