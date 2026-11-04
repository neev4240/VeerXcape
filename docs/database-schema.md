# VeerXcape Platform — Firestore Database Schema (27 Collections)

## 1. Reconciled Collection Inventory
The VeerXcape Firestore database consists of **27 collections** in total (`FIRESTORE_COLLECTIONS` in `@veerxcape/shared-constants`):
- **23 Core Domain, Governance & Configuration Collections** (`DOMAIN_COLLECTIONS`: `users`, `userProfiles`, `userRoles`, `organisations`, `companies`, `showrooms`, `authorities`, `vehicles`, `vehicleOwners`, `vehicleDrivers`, `familyMemberships`, `emergencyContacts`, `devices`, `deviceAssignments`, `deviceHeartbeats`, `telemetry`, `incidents`, `incidentUpdates`, `alerts`, `notifications`, `auditLogs`, `supportTickets`, `systemConfiguration`).
- **4 Server-Only Security, Key Vault & Uniqueness Lock Collections** (`SERVER_ONLY_COLLECTIONS`: `_uniqueLocks`, `_authSecrets`, `_otpChallenges`, `_deviceKeyVault`).

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
