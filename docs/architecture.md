# VeerXcape Platform — System Architecture

## 1. Platform Overview
VeerXcape is a connected vehicle safety and emergency-response ecosystem built around **five strictly separated frontend applications** sharing **one central Firebase backend** and an **STM32U575 embedded hardware IoT gateway**:

1. **`veerxcape-mobile-app` (`/apps/mobile-app`)**: Customer, Driver, and Authorised Family Member app (React + TypeScript + Vite + Capacitor for Android/iOS).
2. **`veerxcape-authority` (`/apps/authority-portal`)**: Independent Government Authority portal for Medical, Police, and Road & Highway departments.
3. **`veerxcape-dealer-company` (`/apps/dealer-company-portal`)**: Combined multi-tenant Parent Automotive Company (OEM) and Showroom portal.
4. **`veerxcape-admin` (`/apps/veerxcape-admin`)**: Independent VeerXcape internal Support, Admin, and Super-Admin governance console.
5. **`veerxcape-public` (`/apps/public-website`)**: Independent 14-page zero-login public information website.

## 2. Core Architectural Principles

### 2.1 Zero Client-Side Security Assumptions
- Every mutation (authentication, role assignment, vehicle registration, device provisioning, family invitations, incident state transitions, and authority notes) executes exclusively inside **Firebase Cloud Functions** (`allow write: if false;` in `firebase/firestore.rules`).
- Hiding UI buttons is never treated as a security control. Every endpoint validates live account status, session version (`sv`), tenant status (`companies.status == 'ACTIVE'`, `showrooms.status == 'ACTIVE'`), and explicit scoped role assignments in `userRoles`.

### 2.2 Immediate Revocation Enforcement
- Firebase Auth custom claims are intentionally minimal (`{ sv: number, tier: string }`).
- Whenever an account is suspended, a password is reset, a family member is removed, a showroom is suspended, or a role is revoked:
  1. The Firestore state (`users`, `userRoles`, `familyMemberships`, `showrooms`) is updated transactionally.
  2. `users/{uid}.sessionVersion` is incremented and `admin.auth().revokeRefreshTokens(uid)` is called.
  3. Both Cloud Functions middleware and `firestore.rules` verify `get(/users/$(uid)).data.status == 'ACTIVE'` and `sessionVersion == request.auth.token.sv`, guaranteeing **0-second revocation latency**.

### 2.3 STM32U575 Hardware Security & Secret Management
- Device signing keys are **never** stored as one-way SHA-256 hashes (since HMAC verification requires the shared 256-bit key) and are **never** stored in client-readable Firestore documents.
- Production retrieves raw 256-bit device HMAC keys from **Google Cloud Secret Manager** (`projects/*/secrets/vx-device-key-${deviceId}/versions/${secretVersion}`). Local/Emulator environments use **AES-256-GCM envelope encryption** under `DEVICE_MASTER_KEK_HEX` inside the server-only `_deviceKeyVault` collection.
- Replay protection combines a timestamp freshness check (`±300s`) with a monotonic sequence watermark (`lastSequenceNumber`) and a **64-slot sliding window bitmap** (`replayWindowBitmap`) plus transactional `idempotencyKey` deduplication so offline buffered crash/hazard events can be uploaded safely upon cellular reconnection without permitting replay attacks.

### 2.4 Standardized Location Freshness
All applications and APIs compute location freshness deterministically using `computeLocationFreshness()`:
- **`LIVE`**: Location age `<= 60s` and device heartbeat age `<= 90s`.
- **`RECENT`**: Location age `61s..300s` (1–5 minutes).
- **`STALE`**: Location age `> 300s` while heartbeat age `<= 600s` (explicitly labeled as stale last-known position).
- **`OFFLINE`**: No heartbeat or telemetry for `> 600s` or no GNSS fix ever recorded.

