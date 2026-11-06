# VEERXCAPE — STAGE 10B: FIREBASE EMULATOR INTEGRATION AND SECURITY VERIFICATION REPORT

**Project ID**: `veerxcape-01`  
**Stage**: `10B` — Real Firebase Emulator Integration & 28-Collection Security Rules Verification  
**Status**: Verified Against Live Firebase Emulators (`auth`, `firestore`, `functions`, `storage`)

---

## 1. Firebase Emulator Setup & Architecture

The VeerXcape monorepo is configured in [`firebase.json`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase.json) and [`.firebaserc`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/.firebaserc) to run a local multi-service Firebase Emulator Suite in `singleProjectMode` (`veerxcape-01`):

| Emulator Service | Host & Port | Configuration Source | Purpose |
| :--- | :--- | :--- | :--- |
| **Firebase Authentication Emulator** | `127.0.0.1:9099` | [`firebase.json`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase.json#L26-L28) | Real user creation (`ensureUserByPhone`), custom claims (`sv`, `tier`), custom token signing, `accounts:signInWithCustomToken` JWT exchange, and `verifyIdToken(token, true)` verification |
| **Cloud Firestore Emulator** | `127.0.0.1:8080` | [`firebase/firestore.rules`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase/firestore.rules), [`firebase/firestore.indexes.json`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase/firestore.indexes.json) | Real security rules evaluation across all 28 collections, native `.where()` / `.orderBy()` / `.startAfter()` / `.limit()` queries, and ACID multi-document transactions |
| **Cloud Functions Emulator** | `127.0.0.1:5001` | [`functions/src/index.ts`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/functions/src/index.ts) (`asia-south1-api`) | HTTP gateway endpoint `http://127.0.0.1:5001/veerxcape-01/asia-south1/api` running on Node 24 |
| **Firebase Storage Emulator** | `127.0.0.1:9199` | [`firebase/storage.rules`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase/storage.rules) | Vehicle registration document and incident attachment storage rules |
| **Emulator UI** | `127.0.0.1:4000` | [`firebase.json`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase.json#L38-L41) | Local inspection UI when running `npm run emulators:start` |

### Prerequisites
- **Node.js**: `v24.x` (configured in `functions/package.json` `"engines": { "node": "24" }`)
- **Java Runtime**: OpenJDK 21 (`/opt/homebrew/opt/openjdk@21/bin/java`) required by `cloud-firestore-emulator-v1.22.0.jar` and the Firebase Storage Emulator JAR
- **Workspace Dependencies**: `firebase-tools` (`v15.35.0`) and `@firebase/rules-unit-testing` (`^3.0.4`) installed in the root `package.json`

---

## 2. Exact Commands to Execute Tests

| Command | Description |
| :--- | :--- |
| `npm run typecheck` | Builds shared workspace packages and runs `tsc --noEmit` across all 9 workspaces (`4` shared packages, `functions`, and `5` frontend applications) |
| `npm run build` | Builds all 4 shared packages, compiles `functions/lib`, and builds all 5 Vite frontend production bundles |
| `npm test` | Runs the fast deterministic unit and HTTP security regression suites (`5` test files, `25` tests) |
| `npm run test:emulator` | Builds shared packages + `functions`, boots the real Firebase Emulators (`auth`, `firestore`, `functions`, `storage`) via `firebase emulators:exec`, executes `vitest run --config vitest.emulator.config.ts` (`2` emulator test files, `9` comprehensive integration & rules suites), and tears down all emulators cleanly |
| `npm run emulators:start` | Starts the interactive Firebase Emulator Suite (`auth`, `firestore`, `functions`, `storage`, and Emulator UI on port `4000`) |

### Test Isolation & Cleanup Policy
Every test in [`firestore-rules.emulator.test.ts`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/functions/src/__tests__/emulator/firestore-rules.emulator.test.ts) and [`backend-integration.emulator.test.ts`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/functions/src/__tests__/emulator/backend-integration.emulator.test.ts) purges both the Firestore Emulator database (`DELETE /emulator/v1/projects/veerxcape-01/databases/(default)/documents` / `testEnv.clearFirestore()`) and the Firebase Auth Emulator accounts (`DELETE /emulator/v1/projects/veerxcape-01/accounts`) in `beforeEach` and `afterEach`/`afterAll`.

---

## 3. Emulator Test Suites, Cases, and Results

### A. Firestore Security Rules Suite (`functions/src/__tests__/emulator/firestore-rules.emulator.test.ts`)
Executed against the live Cloud Firestore Emulator (`127.0.0.1:8080`) using `@firebase/rules-unit-testing` across all **28 canonical collections** (`24` domain + `4` server-only):

| Test Case | Collections Covered | Verification Result |
| :--- | :--- | :--- |
| **1. Server-Only Lock & Secret Collections** | `_uniqueLocks`, `_authSecrets`, `_otpChallenges`, `_deviceKeyVault` | **PASSED** — 100% of client reads and writes fail (`assertFails`) for unauthenticated users, customers, and even `VEERXCAPE_SUPER_ADMIN`. |
| **2. Identity, Live Revocation & Role Self-Assignment Prevention** | `users`, `userProfiles`, `userRoles` | **PASSED** — Active user (`sv == sessionVersion`) can read own profile/roles; stale token (`sv != sessionVersion`) or `SUSPENDED` status is denied immediately (`0s` delay); self-escalation to `VEERXCAPE_SUPER_ADMIN` fails. |
| **3. Customer Ownership, Granular Family Permissions & Driver Restrictions** | `vehicles`, `vehicleOwners`, `vehicleDrivers`, `familyMemberships`, `emergencyContacts`, `devices`, `deviceAssignments`, `deviceHeartbeats`, `telemetry` | **PASSED** — Vehicle owner can read all owned vehicle/device/telemetry records; unrelated owner is denied; family member with `canViewTelemetry: true` can read `telemetry` while `canViewTelemetry: false` is denied; `REVOKED` family member is denied immediately; assigned driver can read `vehicles` and `vehicleDrivers` but is denied `telemetry`, `familyMemberships`, and `emergencyContacts`. |
| **4. Showroom & Parent-Company Tenant Isolation** | `companies`, `showrooms`, `vehicles`, `devices`, `deviceAssignments` | **PASSED** — Showroom A staff can read Showroom A and its vehicles/devices, but is denied on Showroom B and Company A/B; Company A Admin can read Company A, Showroom A, and Vehicle A1, but is denied on Company B and Showroom B. |
| **5. Authority Department/Jurisdiction Isolation & Immutable Audit/Incident Event Protection** | `organisations`, `authorities`, `incidents`, `incidentEvents`, `incidentUpdates`, `alerts`, `notifications`, `auditLogs`, `supportTickets`, `systemConfiguration` | **PASSED** — `AUTHORITY_MEDICAL` in `IN-UP-LKO` can read `MEDICAL`-authorized crash incident in `IN-UP-LKO`, is denied on `POLICE`-only theft incident, and is denied on incidents outside `IN-UP-LKO`; `AUTHORITY_ROAD` is denied raw Firestore reads on `/incidents/{id}` (forcing use of the anonymized Cloud Function endpoint); `auditLogs` is readable only by `VEERXCAPE_ADMIN`/`VEERXCAPE_SUPER_ADMIN` (denied to `VEERXCAPE_SUPPORT` and customers); client `create`, `update`, and `delete` on `incidentEvents` and `auditLogs` fail for all roles. |

### B. Backend Integration, Pagination & Concurrency Suite (`functions/src/__tests__/emulator/backend-integration.emulator.test.ts`)
Executed against the live Firebase Auth Emulator (`127.0.0.1:9099`) and Cloud Firestore Emulator (`127.0.0.1:8080`) using `createFirebaseAdminRuntime` and `createVeerXcapeExpressApp`:

| Test Case | Workflows & Invariants Verified | Verification Result |
| :--- | :--- | :--- |
| **1. Real Firebase Auth Emulator Token & Revocation Lifecycle** | Custom token generation (`auth.createCustomToken`), JWT exchange via Auth Emulator (`accounts:signInWithCustomToken`), `auth.verifyIdToken(token, true)`, invalid/tampered/expired JWT rejection (`401`), privilege self-assignment rejection (`403`), account suspension (`POST /api/v1/admin/users/:userId/suspend`), and account reactivation (`POST /api/v1/admin/users/:userId/reactivate`) | **PASSED** |
| **2. Real Firebase-Backed End-to-End Domain Workflows** | Company/Showroom/Authority onboarding, STM32U575 device provisioning & key rotation, showroom vehicle registration with OTP verification, customer account activation & phone+password login, family member invitation/activation/revocation, driver assignment, STM32U575 signed heartbeat + telemetry + crash event ingestion, `incidentEvents` history creation, transient FCM failure & admin notification retry (`POST /api/v1/admin/notifications/:id/retry`), Medical authority acknowledgement, Road authority PII anonymization, device revocation, and SHA-256 audit chain verification | **PASSED** |
| **3. Native Firestore Queries, Composite Ordering & Cursor Pagination** | Empty collection pagination, native `.where('registeredByShowroomId', '==', ...)` + `.orderBy('createdAt', 'desc')` + `.limit(3)` + `.startAfter(cursorSnap)` across 3 sequential pages (7 records total, zero duplicates or gaps), and deleted-record exclusion between pages | **PASSED** |
| **4. Concurrency, Transactional Uniqueness Locks, Idempotency & Replay Protection** | Concurrent device provisioning (`Promise.all` for identical serial `VX-STM32U575-CONC1` -> `[200, 409]`), concurrent vehicle registration (`Promise.all` for identical registration `UP32CN0001` & VIN -> `[200, 409]`), duplicate hardware incident batch submission (`duplicateCount: 1`, single incident created), STM32 sequence replay rejection (`409 REPLAY_DETECTED`), and SHA-256 audit hash-chain tamper detection | **PASSED** |

---

## 4. Defects Discovered & Fixed During Emulator Verification

Running against the real Firebase Emulators uncovered and resolved three defects that did not surface in the in-memory test runtime:

1. **Firestore Read-Before-Write Transaction Ordering (`functions/src/shared/firebaseAdmin.ts`)**:
   - *Finding*: Real Cloud Firestore requires all `firestoreTx.get()` calls inside `db.runTransaction` to execute before any `firestoreTx.set()` or `firestoreTx.delete()` call. Interleaved calls (such as consecutive `claimUniqueLockInTx` calls followed by `tx.getDoc` in `registerVehicleAndAssignDevice`) caused real Firestore transactions to throw `Firestore transactions require all reads to be executed before all writes`.
   - *Fix*: Updated `runTransaction` in [`functions/src/shared/firebaseAdmin.ts`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/functions/src/shared/firebaseAdmin.ts#L330-L400) to execute `firestoreTx.get()` immediately on uncached reads while staging writes/deletes in memory (supporting read-your-own-writes within the transaction) and flushing all `firestoreTx.set()` and `firestoreTx.delete()` mutations atomically after `fn(tx)` finishes all reads. Also enabled `ignoreUndefinedProperties: true` and recursive `undefined` stripping for Firestore document writes.
2. **Firestore Security Rules 10-Document-Lookup & 1,000-Expression Limits (`firebase/firestore.rules`)**:
   - *Finding*: Calling `isActiveUser()` inside every sub-helper and invoking `exists(path) && get(path)` across all role branches in `canReadVehicle` caused evaluations for later branches (such as `COMPANY_ADMIN`) to exceed Firestore Rules' 1,000-expression and 10-service-call limits per rule evaluation.
   - *Fix*: Refactored [`firebase/firestore.rules`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase/firestore.rules#L37-L135) so `isActiveUser()` is evaluated once per rule and each role helper short-circuits on `userPrimaryRole()` (which reads the already-cached `/users/$(request.auth.uid)` document at zero additional lookup cost), reducing per-request document lookups to `2–4` calls.
3. **Cloud Functions Emulator Node Engine Specification (`functions/package.json`)**:
   - *Finding*: `firebase-tools@15.35.0` requires an explicit major Node engine version (`"22"` or `"24"`) in `functions/package.json` rather than `">=20.0.0"`.
   - *Fix*: Updated [`functions/package.json`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/functions/package.json#L28-L30) `"engines": { "node": "24" }`.

---

## 5. Required Composite Indexes (`firebase/firestore.indexes.json`)

[`firebase/firestore.indexes.json`](file:///Users/neevaggarwal/Zealion/VeerXcape/Code_VeerXcape/firebase/firestore.indexes.json) defines **26 composite indexes** and **2 TTL field overrides** (`telemetry.ttlExpireAt` and `deviceHeartbeats.ttlExpireAt`) covering all multi-field `.where()` + `.orderBy()` queries executed by the backend services:
- `userRoles`: `(userId ASC, status ASC)`, `(scopeType ASC, scopeId ASC, status ASC)`
- `showrooms`: `(companyId ASC, status ASC, createdAt DESC)`, `(companyId ASC, createdAt DESC)`
- `authorities`: `(jurisdictionCode ASC, department ASC, verificationStatus ASC)`
- `vehicles`: `(primaryOwnerId ASC, createdAt DESC)`, `(companyId ASC, createdAt DESC)`, `(registeredByShowroomId ASC, createdAt DESC)`
- `vehicleOwners`: `(userId ASC, status ASC)`, `(vehicleId ASC, status ASC)`
- `vehicleDrivers`: `(driverUserId ASC, status ASC)`, `(vehicleId ASC, status ASC)`
- `familyMemberships`: `(familyUserId ASC, status ASC)`, `(vehicleId ASC, status ASC)`, `(ownerUserId ASC, status ASC)`
- `devices`: `(allocatedShowroomId ASC, status ASC)`, `(allocatedCompanyId ASC, status ASC)`
- `deviceHeartbeats`: `(deviceId ASC, receivedAt DESC)`
- `telemetry`: `(vehicleId ASC, receivedAt DESC)`
- `incidents`: `(vehicleId ASC, occurredAt DESC)`, `(location.jurisdictionCode ASC, lifecycleState ASC, occurredAt DESC)`, `(location.jurisdictionCode ASC, authorizedDepartments CONTAINS, occurredAt DESC)`
- `incidentEvents`: `(incidentId ASC, occurredAt ASC)`, `(vehicleId ASC, occurredAt DESC)`
- `incidentUpdates`: `(incidentId ASC, createdAt ASC)`
- `notifications`: `(recipientUserId ASC, createdAt DESC)`, `(status ASC, createdAt ASC)`
- `auditLogs`: `(actorUserId ASC, createdAt DESC)`, `(targetCollection ASC, targetDocumentId ASC, createdAt DESC)`

---

## 6. Emulator-Verified vs. Production-Verified Functionality

| Capability | Emulator-Verified (Stage 10B) | Production-Verified | Notes |
| :--- | :--- | :--- | :--- |
| **Firebase Auth Token Issuance, Custom Claims & Revocation** | **YES** (`127.0.0.1:9099`) | Not deployed | Verified with real JWT exchange (`accounts:signInWithCustomToken`) and `admin.auth().verifyIdToken(token, true)` |
| **Firestore Security Rules (All 28 Collections)** | **YES** (`127.0.0.1:8080`) | Not deployed | Verified with `@firebase/rules-unit-testing` across all roles and tenant boundaries |
| **Firestore Native Queries, Cursor Pagination & Transactions** | **YES** (`127.0.0.1:8080`) | Not deployed | Verified with real Firestore transactions, concurrent `Promise.all` contention, and cursor pagination |
| **Cloud Functions HTTP Gateway (`asia-south1-api`)** | **YES** (`127.0.0.1:5001`) | Not deployed | Loaded and initialized in Functions Emulator (`node@24`) |
| **FCM Push Delivery & SMS OTP Gateway** | **Simulated in Emulator** | Requires Production Credentials | Firebase Emulator Suite does not include an FCM or SMS carrier emulator; production requires live FCM credentials and a DLT SMS gateway |
| **Google Cloud Secret Manager (`_deviceKeyVault` KEK)** | **Envelope Encryption Verified Locally** | Requires GCP Secret Manager | Production requires provisioning `DEVICE_MASTER_KEK_HEX` and `AUTH_SERVER_PEPPER` in Secret Manager |

