# VeerXcape Platform — Backend & STM32U575 IoT API Contract

## 1. Authentication & Identity Endpoints
- `POST /api/v1/auth/request-otp`: Generates a rate-limited 6-digit OTP challenge in `_otpChallenges` (`purpose`: `CUSTOMER_LOGIN` | `CUSTOMER_ACTIVATION` | `FAMILY_ACTIVATION` | `SHOWROOM_CUSTOMER_VERIFY` | `PASSWORD_RESET`).
- `POST /api/v1/auth/activate-account`: Verifies phone OTP (and `pendingInviteHashHex` for family invitations), stores scrypt password hash in `_authSecrets`, activates the account, and returns `{ customToken }`.
- `POST /api/v1/auth/login-phone`: Verifies `phoneE164` + `password` against `_authSecrets` with 5-attempt lockout protection; returns `{ customToken, user, activeRoles }`.
- `POST /api/v1/auth/reset-password`: Verifies recovery OTP, updates password hash, increments `sessionVersion`, and calls `revokeRefreshTokens(uid)`.

## 2. Mobile App Endpoints (Owner, Family, Driver)
- `GET /api/v1/mobile/dashboard`: Returns role-scoped vehicles, `liveStatusSummary`, standardized `locationFreshness` (`LIVE` | `RECENT` | `STALE` | `OFFLINE`), and recent incidents.
- `POST /api/v1/mobile/family/invite`: Vehicle owner creates a pending family member invitation with hashed initial password and granular vehicle permissions.
- `PATCH /api/v1/mobile/family/:membershipId`: Owner modifies family permissions or revokes access immediately.
- `POST /api/v1/mobile/drivers/assign`: Owner assigns or revokes an authorised driver.
- `POST /api/v1/mobile/sos/trigger` & `POST /api/v1/mobile/sos/:incidentId/cancel`: Trigger or cancel a manual SOS incident.

## 3. Showroom & Parent-Company Endpoints
- `POST /api/v1/dealer/customer-otp/send` & `POST /api/v1/dealer/customer-otp/verify`: Verify customer phone during showroom registration.
- `POST /api/v1/dealer/vehicles/register`: Atomic transaction reserving `_uniqueLocks` (`reg_*`, `vin_*`, `phone_*`), creating the `vehicles` record, assigning the STM32U575 device, and issuing a customer activation invitation without setting a customer password.
- `GET /api/v1/company/overview` & `PATCH /api/v1/company/showrooms/:showroomId/status`: Parent-company tenant oversight and showroom management.

## 4. Government Authority Endpoints
- `GET /api/v1/authority/incidents`: Returns jurisdiction- and department-filtered incidents (automatically anonymized for `AUTHORITY_ROAD`) and writes an `AUTHORITY_INCIDENT_QUEUE_VIEWED` audit log.
- `GET /api/v1/authority/incidents/:incidentId`: Returns single incident detail with mandatory `auditLogs` entry.
- `POST /api/v1/authority/incidents/:incidentId/update`: Records department acknowledgement, dispatch reference, hazard status, or response notes.

## 5. STM32U575 Hardware IoT Gateway Endpoints
Required Headers:
- `X-Device-Serial`: e.g. `VX-STM32U575-0001`
- `X-Device-Timestamp`: Event UTC epoch milliseconds
- `X-Transmission-Timestamp`: Current transmission UTC epoch milliseconds (must be within ±300s of server clock)
- `X-Device-Sequence`: Monotonic integer sequence number
- `X-Device-Signature`: `HMAC-SHA256(deviceSecretKey, "${serial}\n${method}\n${path}\n${deviceTimestamp}\n${transmissionTimestamp}\n${sequence}\n${sha256(rawBody)}")`

Endpoints:
- `POST /api/v1/iot/heartbeat`
- `POST /api/v1/iot/telemetry`
- `POST /api/v1/iot/events` (supports single or offline-buffered batch with sliding-window replay protection and `idempotencyKey` deduplication)
- `GET /api/v1/iot/config`

