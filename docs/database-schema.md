# VeerXcape Platform — Firestore Database Schema (28 Collections)

## 1. Reconciled Collection Inventory
The VeerXcape Firestore database consists of **28 collections** in total (`FIRESTORE_COLLECTIONS` in `@veerxcape/shared-constants`):
- **24 Core Domain, Governance & Configuration Collections** (`DOMAIN_COLLECTIONS`: `users`, `userProfiles`, `userRoles`, `organisations`, `companies`, `showrooms`, `authorities`, `vehicles`, `vehicleOwners`, `vehicleDrivers`, `familyMemberships`, `emergencyContacts`, `devices`, `deviceAssignments`, `deviceHeartbeats`, `telemetry`, `incidents`, `incidentEvents`, `incidentUpdates`, `alerts`, `notifications`, `auditLogs`, `supportTickets`, `systemConfiguration`).
- **4 Server-Only Security, Key Vault & Uniqueness Lock Collections** (`SERVER_ONLY_COLLECTIONS`: `_uniqueLocks`, `_authSecrets`, `_otpChallenges`, `_deviceKeyVault`).

| # | Collection | Category | Document ID | Primary Relationships & Indexing | Client Rules (`firestore.rules`) |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | `users` | Domain | `{uid}` | Unique `phoneE164` via `_uniqueLocks/phone_{e164}` | Read: Self or Staff. Write: `false`. |
| 2 | `userProfiles` | Domain | `{uid}` | 1:1 profile & privacy settings for `users/{uid}` | Read: Active Self or Staff. Write: `false`. |
| 3 | `userRoles` | Domain | `{uid}_{role}_{scopeId}` | Indexed by `(userId, status)`, `(companyId, role, status)`, `(showroomId, role, status)` | Read: Active Self or Staff. Write: `false`. |
| 4 | `organisations` | Domain | `{orgId}` | Parent legal entity for Companies & Authorities | Read: Staff. Write: `false`. |
| 5 | `companies` | Domain | `{companyId}` | Linked to `organisations/{orgId}` | Read: Active `COMPANY_ADMIN` or Staff. Write: `false`. |
| 6 | `showrooms` | Domain | `{showroomId}` | Linked to `companies/{companyId}`; unique `dealer_{companyId}_{dealerCode}` | Read: Showroom Staff/Manager, Company Admin, or Staff. Write: `false`. |
| 7 | `authorities` | Domain | `{authorityId}` | Scoped by `department` (`MEDICAL`, `POLICE`, `ROAD`) & `jurisdictionCode` | Read: Active Authority Role or Staff. Write: `false`. |
| 8 | `vehicles` | Domain | `{vehicleId}` | Unique `reg_{regNo}` & `vin_{vin}`; holds lightweight `liveStatusSummary` | Read: Owner, Family, Driver, Showroom, Company Admin, or Staff. Write: `false`. |
| 9 | `vehicleOwners` | Domain | `{vehicleId}_{userId}` | Indexed by `(userId, status)` | Read: Active Owner or Staff. Write: `false`. |
| 10 | `vehicleDrivers` | Domain | `{vehicleId}_{driverUserId}` | Indexed by `(driverUserId, status)` and `(vehicleId, status)` | Read: Assigned Driver, Owner, or Staff. Write: `false`. |
| 11 | `familyMemberships` | Domain | `{vehicleId}_{familyUserId}` | Indexed by `(familyUserId, status)` and `(vehicleId, status)` | Read: Owner, Active Family Member, or Staff. Write: `false`. |
| 12 | `emergencyContacts` | Domain | `{contactId}` | Linked to `vehicleId` & `ownerUserId` | Read: Owner or Staff. Write: `false`. |
| 13 | `devices` | Domain | `{deviceId}` | Unique `serial_{serialNumber}`; indexed by `(allocatedShowroomId, status)` & `(allocatedCompanyId, status)` | Read: Vehicle Owner, Showroom, Company Admin, or Staff. Write: `false`. |
| 14 | `deviceAssignments` | Domain | `{assignmentId}` | Links `deviceId`, `vehicleId`, `companyId`, `showroomId` | Read: Vehicle Owner, Showroom, Company Admin, or Staff. Write: `false`. |
| 15 | `deviceHeartbeats` | Domain | `{deviceId}_{sequenceNumber}` | Indexed by `(deviceId, receivedAt DESC)`; **30-day TTL** (`ttlExpireAt`) | Read: Vehicle Owner or Staff. Write: `false`. |
| 16 | `telemetry` | Domain | `{deviceId}_{sequenceNumber}` | Indexed by `(vehicleId, receivedAt DESC)`; **90-day TTL** (`ttlExpireAt`) | Read: Owner, permitted Family Member (`canViewTelemetry`), or Staff. Write: `false`. |
| 17 | `incidents` | Domain | `{incidentId}` | Indexed by `(vehicleId, occurredAt DESC)` & `(location.jurisdictionCode, authorizedDepartments, occurredAt DESC)` | Read: Owner, permitted Family Member, Driver, or Staff (Authorities via redacted API). Write: `false`. |
| 18 | `incidentEvents` | Domain | `{eventId}` | Append-only incident timeline indexed by `(incidentId, occurredAt ASC)` | Read: Owner, permitted Family Member, Driver, or Staff. Write: `false`. |
| 19 | `incidentUpdates` | Domain | `{updateId}` | Status transition notes indexed by `(incidentId, createdAt DESC)` | Read: Owner (`ALL_AUTHORIZED`/`CUSTOMER_VISIBLE`) or Staff. Write: `false`. |
| 20 | `alerts` | Domain | `{alertId}` | High-priority alert records scoped by `targetUserIds` | Read: Target User or Staff. Write: `false`. |
| 21 | `notifications` | Domain | `{notificationId}` | Indexed by `(recipientUserId, createdAt DESC)` | Read: Recipient or Staff. Write: `false`. |
| 22 | `auditLogs` | Domain | `{auditId}` | Append-only SHA-256 hash chain indexed by `sequenceIndex DESC` | Read: `VEERXCAPE_ADMIN` / `VEERXCAPE_SUPER_ADMIN`. Create/Update/Delete: `false`. |
| 23 | `supportTickets` | Domain | `{ticketId}` | Scoped by `createdByUserId` | Read: Creator or Staff. Write: `false`. |
| 24 | `systemConfiguration` | Domain | `{configKey}` | Platform safety & IoT threshold configuration | Read: Staff. Write: `false`. |
| 25 | `_uniqueLocks` | Server-Only | `{lockKey}` | Deterministic transactional uniqueness locks | `allow read, write: if false;` |
| 26 | `_authSecrets` | Server-Only | `{uid}` | `scrypt` password & invite hashes, failed login counters | `allow read, write: if false;` |
| 27 | `_otpChallenges` | Server-Only | `{phoneE164}_{purpose}` | `scrypt` OTP hashes & rate-limit windows | `allow read, write: if false;` |
| 28 | `_deviceKeyVault` | Server-Only | `{deviceId}` | AES-256-GCM encrypted 256-bit STM32 HMAC keys & rotation versions | `allow read, write: if false;` |

## 2. Transactional Uniqueness via `_uniqueLocks/{lockKey}`
Because Cloud Firestore does not enforce SQL-style `UNIQUE` constraints across arbitrary fields, every creation or update of a unique identifier runs inside `db.runTransaction()` and claims a deterministic lock document in `_uniqueLocks/{lockKey}`:

| Unique Entity | Deterministic Lock Document ID | Target Collection |
| :--- | :--- | :--- |
| User Phone Number (E.164) | `phone_${phoneE164}` | `users` |
| Vehicle Registration Number | `reg_${normalizedRegNumber}` | `vehicles` |
| Vehicle VIN | `vin_${normalizedVin}` | `vehicles` |
| STM32U575 Device Serial | `serial_${normalizedSerial}` | `devices` |
| Showroom Dealer Code | `dealer_${companyId}_${dealerCode}` | `showrooms` |

## 3. High-Volume Telemetry vs. Live Summary Separation
- **`vehicles/{vehicleId}.liveStatusSummary`**: Stores only the current vehicle state (`connectionStatus`, `lastSeenAt`, `lastHeartbeatAt`, `lastLocation`, `batteryVoltageMv`, `backupBatteryPercent`, `powerSource`). Mobile and portal dashboards read this lightweight summary without querying historical telemetry.
- **`telemetry/{telemetryId}`**: High-volume time-series sensor payloads indexed by `(vehicleId, receivedAt DESC)` with Firestore TTL enabled on `ttlExpireAt` (90 days).
- **`deviceHeartbeats/{heartbeatId}`**: Periodic liveness packets indexed by `(deviceId, receivedAt DESC)` with Firestore TTL enabled on `ttlExpireAt` (30 days).

## 4. Append-Only Tamper-Evident Audit Logs (`auditLogs/{auditId}`)
- Client creation, modification, and deletion are blocked in `firestore.rules` (`allow create, update, delete: if false;`).
- Every entry is written server-side with a monotonic `sequenceIndex`, `prevAuditHash`, and `entryHash = SHA-256(prevAuditHash + canonicalPayload)` with a 7-year `retainUntil` timestamp.
