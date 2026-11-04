# VeerXcape Platform — Deployment & Environment Guide

## 1. Environment Separation (`development` | `staging` | `production`)
- **`development`**: Uses Firebase Local Emulator Suite (`VITE_USE_FIREBASE_EMULATORS=true`). Demo OTP inspection and explicitly labeled `DEMO/SIMULATED` telemetry are allowed only when `VEERXCAPE_ENV=development`.
- **`staging`**: Connects to `veerxcape-staging` Firebase project and Vercel preview deployments.
- **`production`**: Connects to `veerxcape-prod` Firebase project and production domains. `ALLOW_DEMO_OTP` and `ALLOW_SIMULATED_IOT` are hard-blocked in code when `VEERXCAPE_ENV === 'production'`.

## 2. Five Independent Vercel Projects
Each frontend application in `/apps/*` is deployed as its own isolated Vercel project:

| Vercel Project Name | App Root Directory | Build Command | Output Directory | Auth Required |
| :--- | :--- | :--- | :--- | :--- |
| `veerxcape-mobile-app` | `apps/mobile-app` | `npm run build` | `dist` | Yes (Customer/Family/Driver) |
| `veerxcape-authority` | `apps/authority-portal` | `npm run build` | `dist` | Yes (Verified Authorities Only) |
| `veerxcape-dealer-company` | `apps/dealer-company-portal` | `npm run build` | `dist` | Yes (Company/Showroom Staff) |
| `veerxcape-admin` | `apps/veerxcape-admin` | `npm run build` | `dist` | Yes (VeerXcape Internal Staff) |
| `veerxcape-public` | `apps/public-website` | `npm run build` | `dist` | No (14 Static Public Pages) |

## 3. Native Android & iOS Builds (Capacitor)
The mobile application (`apps/mobile-app`) includes Capacitor configuration (`capacitor.config.ts`) for native packaging:
```bash
cd apps/mobile-app
npm run build
npx cap sync android
npx cap sync ios
```

## 4. Firebase Backend Deployment
Firestore rules, indexes, Storage rules, and Cloud Functions are deployed separately from Vercel:
```bash
firebase use staging # or production (requires explicit approval)
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions
```

