/**
 * @veerxcape/shared-constants
 * Central source of truth for VeerXcape roles, collection names, deterministic lock keys,
 * incident lifecycle states, location freshness thresholds, notification states, and brand palette.
 */

// ============================================================================
// 1. THE 12 EXPLICIT VEERXCAPE ROLES
// ============================================================================
export const USER_ROLES = {
  VEHICLE_OWNER: 'VEHICLE_OWNER',
  FAMILY_MEMBER: 'FAMILY_MEMBER',
  DRIVER: 'DRIVER',
  SHOWROOM_STAFF: 'SHOWROOM_STAFF',
  SHOWROOM_MANAGER: 'SHOWROOM_MANAGER',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  AUTHORITY_MEDICAL: 'AUTHORITY_MEDICAL',
  AUTHORITY_POLICE: 'AUTHORITY_POLICE',
  AUTHORITY_ROAD: 'AUTHORITY_ROAD',
  VEERXCAPE_SUPPORT: 'VEERXCAPE_SUPPORT',
  VEERXCAPE_ADMIN: 'VEERXCAPE_ADMIN',
  VEERXCAPE_SUPER_ADMIN: 'VEERXCAPE_SUPER_ADMIN'
} as const;

export type UserRoleCode = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ALL_USER_ROLES: readonly UserRoleCode[] = Object.values(USER_ROLES);

export const ROLE_SCOPE_TYPES = {
  PLATFORM: 'PLATFORM',
  COMPANY: 'COMPANY',
  SHOWROOM: 'SHOWROOM',
  AUTHORITY: 'AUTHORITY',
  VEHICLE: 'VEHICLE'
} as const;

export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[keyof typeof ROLE_SCOPE_TYPES];

export const AUTHORITY_DEPARTMENTS = {
  MEDICAL: 'MEDICAL',
  POLICE: 'POLICE',
  ROAD: 'ROAD'
} as const;

export type AuthorityDepartment = (typeof AUTHORITY_DEPARTMENTS)[keyof typeof AUTHORITY_DEPARTMENTS];

// ============================================================================
// 2. RECONCILED 26 FIRESTORE COLLECTIONS (22 Domain + 4 Server-Only Security)
// ============================================================================
export const DOMAIN_COLLECTIONS = {
  USERS: 'users',
  USER_PROFILES: 'userProfiles',
  USER_ROLES: 'userRoles',
  ORGANISATIONS: 'organisations',
  COMPANIES: 'companies',
  SHOWROOMS: 'showrooms',
  AUTHORITIES: 'authorities',
  VEHICLES: 'vehicles',
  VEHICLE_OWNERS: 'vehicleOwners',
  VEHICLE_DRIVERS: 'vehicleDrivers',
  FAMILY_MEMBERSHIPS: 'familyMemberships',
  EMERGENCY_CONTACTS: 'emergencyContacts',
  DEVICES: 'devices',
  DEVICE_ASSIGNMENTS: 'deviceAssignments',
  DEVICE_HEARTBEATS: 'deviceHeartbeats',
  TELEMETRY: 'telemetry',
  INCIDENTS: 'incidents',
  INCIDENT_UPDATES: 'incidentUpdates',
  ALERTS: 'alerts',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'auditLogs',
  SUPPORT_TICKETS: 'supportTickets',
  SYSTEM_CONFIGURATION: 'systemConfiguration'
} as const;

export const SERVER_ONLY_COLLECTIONS = {
  UNIQUE_LOCKS: '_uniqueLocks',
  AUTH_SECRETS: '_authSecrets',
  OTP_CHALLENGES: '_otpChallenges',
  DEVICE_KEY_VAULT: '_deviceKeyVault'
} as const;

export const FIRESTORE_COLLECTIONS = {
  ...DOMAIN_COLLECTIONS,
  ...SERVER_ONLY_COLLECTIONS
} as const;

export type FirestoreCollectionName =
  (typeof FIRESTORE_COLLECTIONS)[keyof typeof FIRESTORE_COLLECTIONS];

// ============================================================================
// 3. DETERMINISTIC UNIQUENESS LOCK KEY BUILDERS (_uniqueLocks/{lockKey})
// ============================================================================
export const normalizeRegistrationNumber = (raw: string): string =>
  raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export const normalizeVin = (raw: string): string =>
  raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export const normalizeDeviceSerial = (raw: string): string =>
  raw.trim().toUpperCase();

export const normalizePhoneE164 = (raw: string): string =>
  raw.replace(/[\s()-]/g, '').trim();

export const UNIQUE_LOCK_KEYS = {
  phone: (phoneE164: string) => `phone_${normalizePhoneE164(phoneE164)}`,
  vehicleRegistration: (regNumber: string) => `reg_${normalizeRegistrationNumber(regNumber)}`,
  vehicleVin: (vin: string) => `vin_${normalizeVin(vin)}`,
  deviceSerial: (serial: string) => `serial_${normalizeDeviceSerial(serial)}`,
  dealerCode: (companyId: string, dealerCode: string) =>
    `dealer_${companyId.trim()}_${dealerCode.trim().toUpperCase()}`
} as const;

// ============================================================================
// 4. STANDARDIZED LOCATION FRESHNESS THRESHOLDS & STATES
// ============================================================================
export const LOCATION_FRESHNESS_STATES = {
  LIVE: 'LIVE',
  RECENT: 'RECENT',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE'
} as const;

export type LocationFreshnessState =
  (typeof LOCATION_FRESHNESS_STATES)[keyof typeof LOCATION_FRESHNESS_STATES];

export const LOCATION_FRESHNESS_THRESHOLDS_SECONDS = {
  LIVE_MAX_LOCATION_AGE_SEC: 60,
  LIVE_MAX_HEARTBEAT_AGE_SEC: 90,
  RECENT_MAX_LOCATION_AGE_SEC: 300,
  OFFLINE_HEARTBEAT_AGE_SEC: 600
} as const;

// ============================================================================
// 5. INCIDENT TYPES, LIFECYCLE STATES & AUTHORITY ACCESS RULES
// ============================================================================
export const INCIDENT_TYPES = {
  ACCIDENT_DETECTED: 'ACCIDENT_DETECTED',
  MANUAL_SOS: 'MANUAL_SOS',
  PARKED_OCCUPANT_ALERT: 'PARKED_OCCUPANT_ALERT',
  THEFT_OR_INTRUSION_ALERT: 'THEFT_OR_INTRUSION_ALERT',
  ROAD_HAZARD: 'ROAD_HAZARD',
  DEVICE_POWER_FAILURE: 'DEVICE_POWER_FAILURE',
  DEVICE_DISCONNECTED: 'DEVICE_DISCONNECTED'
} as const;

export type IncidentTypeCode = (typeof INCIDENT_TYPES)[keyof typeof INCIDENT_TYPES];

/**
 * Strictly separates visibility on an authority portal from actual acknowledgement,
 * recorded dispatch, and confirmed on-scene emergency response.
 */
export const INCIDENT_LIFECYCLE_STATES = {
  REPORTED: 'REPORTED',
  OWNER_ACKNOWLEDGED: 'OWNER_ACKNOWLEDGED',
  FALSE_ALARM_CANCELLED: 'FALSE_ALARM_CANCELLED',
  VISIBLE_TO_AUTHORITY: 'VISIBLE_TO_AUTHORITY',
  AUTHORITY_ACKNOWLEDGED: 'AUTHORITY_ACKNOWLEDGED',
  DISPATCH_RECORDED_BY_AUTHORITY: 'DISPATCH_RECORDED_BY_AUTHORITY',
  RESPONSE_CONFIRMED: 'RESPONSE_CONFIRMED',
  RESOLVED: 'RESOLVED'
} as const;

export type IncidentLifecycleState =
  (typeof INCIDENT_LIFECYCLE_STATES)[keyof typeof INCIDENT_LIFECYCLE_STATES];

export const DEPARTMENT_PERMITTED_INCIDENT_TYPES: Record<
  AuthorityDepartment,
  readonly IncidentTypeCode[]
> = {
  MEDICAL: [
    INCIDENT_TYPES.ACCIDENT_DETECTED,
    INCIDENT_TYPES.MANUAL_SOS,
    INCIDENT_TYPES.PARKED_OCCUPANT_ALERT
  ],
  POLICE: [
    INCIDENT_TYPES.ACCIDENT_DETECTED,
    INCIDENT_TYPES.MANUAL_SOS,
    INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT,
    INCIDENT_TYPES.PARKED_OCCUPANT_ALERT
  ],
  ROAD: [
    INCIDENT_TYPES.ROAD_HAZARD,
    INCIDENT_TYPES.ACCIDENT_DETECTED
  ]
} as const;

// ============================================================================
// 6. NOTIFICATION LIFECYCLE STATES (Separating FCM Accept vs Confirmed Delivery)
// ============================================================================
export const NOTIFICATION_STATUSES = {
  QUEUED: 'QUEUED',
  FCM_ACCEPTED: 'FCM_ACCEPTED',
  CLIENT_DELIVERED_ACK: 'CLIENT_DELIVERED_ACK',
  READ: 'READ',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_PERMANENT: 'FAILED_PERMANENT'
} as const;

export type NotificationStatus =
  (typeof NOTIFICATION_STATUSES)[keyof typeof NOTIFICATION_STATUSES];

// ============================================================================
// 7. VEERXCAPE DESIGN SYSTEM TOKENS & VERCEL PROJECT IDENTIFIERS
// ============================================================================
export const VEERXCAPE_BRAND_PALETTE = {
  surfaceWhite: '#FFFFFF',
  borderSlate: '#E2E8F0',
  textPrimary: '#0F172A',
  accentSapphireDark: '#1E40AF',
  accentAutomotiveBlue: '#2563EB',
  emergencyCriticalRed: '#DC2626',
  warningAmber: '#D97706',
  safeEmerald: '#059669'
} as const;

export const VERCEL_PROJECTS = {
  MOBILE_APP: 'veerxcape-mobile-app',
  AUTHORITY_PORTAL: 'veerxcape-authority',
  DEALER_COMPANY_PORTAL: 'veerxcape-dealer-company',
  ADMIN_CONSOLE: 'veerxcape-admin',
  PUBLIC_WEBSITE: 'veerxcape-public'
} as const;

export const GENESIS_AUDIT_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

