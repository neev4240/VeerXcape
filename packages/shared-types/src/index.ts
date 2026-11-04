import type {
  AuthorityDepartment,
  IncidentLifecycleState,
  IncidentTypeCode,
  LocationFreshnessState,
  NotificationStatus,
  RoleScopeType,
  UserRoleCode
} from '@veerxcape/shared-constants';

export type {
  AuthorityDepartment,
  IncidentLifecycleState,
  IncidentTypeCode,
  LocationFreshnessState,
  NotificationStatus,
  RoleScopeType,
  UserRoleCode
};

// ============================================================================
// 1. MINIMAL FIREBASE CUSTOM CLAIMS & AUTH CONTEXT
// ============================================================================
export type PortalTier = 'CUSTOMER' | 'DEALER' | 'AUTHORITY' | 'ADMIN';

/**
 * Firebase Custom Claims are kept minimal so revocations take effect immediately
 * via server-side live Firestore lookup + sessionVersion (sv) checking.
 */
export interface VeerXcapeCustomClaims {
  sv: number;
  tier: PortalTier;
}

export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'LOCKED' | 'SUSPENDED';

export type OtpPurpose =
  | 'CUSTOMER_LOGIN'
  | 'CUSTOMER_ACTIVATION'
  | 'FAMILY_ACTIVATION'
  | 'SHOWROOM_CUSTOMER_VERIFY'
  | 'PASSWORD_RESET';

// ============================================================================
// 2. DOMAIN COLLECTIONS 1..3: IDENTITY & RBAC
// ============================================================================
export interface UserDocument {
  uid: string;
  phoneE164: string;
  email?: string | null;
  status: AccountStatus;
  primaryRole: UserRoleCode;
  sessionVersion: number;
  mfaEnrolled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface UserProfileDocument {
  uid: string;
  fullName: string;
  avatarUrl?: string | null;
  language: string;
  notificationPreferences: {
    pushEnabled: boolean;
    criticalAlertsOnly: boolean;
  };
  privacySettings: {
    shareWithMedicalOnSos: boolean;
    shareWithPoliceOnSos: boolean;
  };
  updatedAt: string;
}

export type RoleAssignmentStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'REVOKED';

export interface UserRoleDocument {
  id: string;
  userId: string;
  role: UserRoleCode;
  scopeType: RoleScopeType;
  scopeId: string; // 'PLATFORM' | companyId | showroomId | authorityId | vehicleId
  companyId?: string | null;
  showroomId?: string | null;
  authorityId?: string | null;
  vehicleId?: string | null;
  department?: AuthorityDepartment | null;
  jurisdictionCode?: string | null;
  status: RoleAssignmentStatus;
  grantedBy: string;
  createdAt: string;
  revokedAt?: string | null;
}

// ============================================================================
// 3. DOMAIN COLLECTIONS 4..7: MULTI-TENANT ORGANISATIONS & AUTHORITIES
// ============================================================================
export type OrganisationType =
  | 'AUTOMOTIVE_PARENT_COMPANY'
  | 'GOVERNMENT_AUTHORITY'
  | 'VEERXCAPE_INTERNAL';

export type TenantStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED';

export interface OrganisationDocument {
  id: string;
  name: string;
  type: OrganisationType;
  registrationNumber: string;
  status: TenantStatus;
  contactEmail: string;
  contactPhone: string;
  approvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDocument {
  id: string;
  organisationId: string;
  brandName: string;
  oemCode: string;
  headquartersAddress: string;
  status: 'ACTIVE' | 'SUSPENDED';
  totalShowrooms: number;
  totalVehiclesRegistered: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShowroomDocument {
  id: string;
  companyId: string;
  name: string;
  dealerCode: string;
  city: string;
  stateCode: string;
  address: string;
  contactPhone: string;
  contactEmail: string;
  status: TenantStatus;
  approvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorityDocument {
  id: string;
  organisationId: string;
  name: string;
  department: AuthorityDepartment;
  jurisdictionState: string;
  jurisdictionDistrict: string;
  jurisdictionCode: string; // e.g., 'IN-UP-LKO'
  verificationStatus: 'PENDING_VERIFICATION' | 'VERIFIED' | 'SUSPENDED';
  verifiedBySuperAdminId?: string | null;
  contactControlRoomPhone: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 4. DOMAIN COLLECTIONS 8..12: VEHICLES, OWNERS, DRIVERS, FAMILY & CONTACTS
// ============================================================================
export interface GeoPointSnapshot {
  lat: number;
  lng: number;
  accuracyMeters: number;
  speedKmh?: number;
  heading?: number;
  recordedAt: string;
}

export type PowerSourceType = 'VEHICLE_12V' | 'BACKUP_BATTERY';

export interface VehicleLiveStatusSummary {
  connectionStatus: LocationFreshnessState;
  lastSeenAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastLocation?: GeoPointSnapshot | null;
  batteryVoltageMv?: number | null;
  backupBatteryPercent?: number | null;
  powerSource?: PowerSourceType | null;
}

export interface VehicleRegistrationHistoryEntry {
  action: 'REGISTERED' | 'DEVICE_ASSIGNED' | 'CORRECTION_APPLIED' | 'CUSTOMER_ACTIVATED' | 'SUSPENDED';
  actorUserId: string;
  actorRole: UserRoleCode;
  timestamp: string;
  summary: string;
}

export type VehicleRegistrationStatus =
  | 'PENDING_CUSTOMER_ACTIVATION'
  | 'ACTIVE'
  | 'CORRECTION_REQUIRED'
  | 'SUSPENDED';

export interface VehicleDocument {
  id: string;
  registrationNumber: string;
  vin: string;
  manufacturer: string;
  model: string;
  variant: string;
  manufacturingYear: number;
  color: string;
  fuelType: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID' | 'CNG';
  companyId: string;
  registeredByShowroomId: string;
  registeredByStaffId: string;
  primaryOwnerId: string;
  assignedDeviceId?: string | null;
  registrationStatus: VehicleRegistrationStatus;
  registrationHistory: VehicleRegistrationHistoryEntry[];
  liveStatusSummary: VehicleLiveStatusSummary;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleOwnerDocument {
  id: string; // `${vehicleId}_${userId}`
  vehicleId: string;
  userId: string;
  ownershipType: 'PRIMARY_OWNER' | 'CO_OWNER';
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'REVOKED';
  activatedAt?: string | null;
  createdAt: string;
}

export interface VehicleDriverDocument {
  id: string; // `${vehicleId}_${driverUserId}`
  vehicleId: string;
  driverUserId: string;
  assignedByOwnerId: string;
  status: 'ACTIVE' | 'REVOKED';
  permissions: {
    canTriggerSos: boolean;
    canViewLiveStatus: boolean;
  };
  validFrom: string;
  validUntil?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface FamilyMemberPermissions {
  canViewLocation: boolean;
  canViewTelemetry: boolean;
  canReceiveCriticalAlerts: boolean;
  canViewIncidentHistory: boolean;
  canTriggerSos: boolean;
}

export interface FamilyMembershipDocument {
  id: string; // `${vehicleId}_${familyUserId}`
  vehicleId: string;
  ownerUserId: string;
  familyUserId: string;
  familyMemberName: string;
  familyMemberPhoneE164: string;
  relationship: string;
  status: 'PENDING_OTP_VERIFICATION' | 'ACTIVE' | 'REVOKED';
  permissions: FamilyMemberPermissions;
  createdAt: string;
  activatedAt?: string | null;
  revokedAt?: string | null;
}

export interface EmergencyContactDocument {
  id: string;
  vehicleId: string;
  ownerUserId: string;
  name: string;
  phoneE164: string;
  relationship: string;
  priorityOrder: 1 | 2 | 3 | 4 | 5;
  notifyOnAccident: boolean;
  notifyOnSos: boolean;
  notifyOnOccupantAlert: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 5. DOMAIN COLLECTIONS 13..16: STM32U575 HARDWARE & TELEMETRY
// ============================================================================
export type DeviceStatus =
  | 'IN_INVENTORY'
  | 'PROVISIONED'
  | 'ACTIVE'
  | 'FAULTY'
  | 'REVOKED'
  | 'SUSPENDED';

export interface DeviceDocument {
  id: string;
  serialNumber: string;
  mcuModel: 'STM32U575RIT6';
  firmwareVersion: string;
  imei: string;
  simIccid: string;
  secretVersion: number;
  allocatedCompanyId: string;
  allocatedShowroomId: string;
  assignedVehicleId?: string | null;
  status: DeviceStatus;
  lastSequenceNumber: number;
  replayWindowBitmap: string; // 16-char hex representing 64-bit sliding window
  lastHeartbeatAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceAssignmentDocument {
  id: string;
  deviceId: string;
  vehicleId: string;
  companyId: string;
  showroomId: string;
  assignedByUserId: string;
  installationStatus: 'INSTALLED_PENDING_TEST' | 'VERIFIED_ACTIVE' | 'UNASSIGNED';
  installedAt: string;
  unassignedAt?: string | null;
  notes?: string;
}

export interface DeviceHeartbeatDocument {
  id: string;
  deviceId: string;
  vehicleId: string;
  mcuUptimeSeconds: number;
  powerSource: PowerSourceType;
  backupBatteryPercent: number;
  batteryVoltageMv: number;
  cellularRssiDbm: number;
  gnssFixStatus: 'FIX_3D' | 'FIX_2D' | 'NO_FIX';
  firmwareVersion: string;
  sequenceNumber: number;
  deviceTimestamp: string;
  receivedAt: string;
  ttlExpireAt: string;
}

export interface TelemetryDocument {
  id: string;
  deviceId: string;
  vehicleId: string;
  sequenceNumber: number;
  isSimulated: boolean;
  gnss: GeoPointSnapshot | null;
  imu: {
    accelXg: number;
    accelYg: number;
    accelZg: number;
    peakImpactG: number;
    tiltDegrees: number;
  };
  cabin: {
    occupantDetected: boolean;
    cabinTempCelsius: number;
    smokeDetected: boolean;
    coPpm: number;
  };
  vehicleBus: {
    ignitionOn: boolean;
    doorsLocked: boolean;
    windowsClosed: boolean;
  };
  power: {
    mainVoltageMv: number;
    backupBatteryPercent: number;
    powerSource: PowerSourceType;
  };
  deviceTimestamp: string;
  receivedAt: string;
  ttlExpireAt: string;
}

// ============================================================================
// 6. DOMAIN COLLECTIONS 17..23: INCIDENTS, ALERTS, NOTIFICATIONS & GOVERNANCE
// ============================================================================
export type IncidentSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export type IncidentSource =
  | 'HARDWARE_STM32'
  | 'OWNER_SOS'
  | 'DRIVER_SOS'
  | 'FAMILY_SOS'
  | 'SERVER_WATCHDOG';

export type AuthoritySharingPolicy =
  | 'CONSENT_GRANTED'
  | 'CRITICAL_LIFE_SAFETY_RULE'
  | 'NOT_SHARED';

export interface IncidentLocationInfo {
  lat: number;
  lng: number;
  accuracyMeters: number;
  roadSegmentSummary: string;
  jurisdictionCode: string;
}

export interface IncidentDocument {
  id: string;
  idempotencyKey: string;
  vehicleId: string;
  deviceId?: string | null;
  triggeredByUserId?: string | null;
  incidentType: IncidentTypeCode;
  source: IncidentSource;
  isSimulated: boolean;
  severity: IncidentSeverity;
  confidenceScore: number;
  lifecycleState: IncidentLifecycleState;
  location: IncidentLocationInfo;
  vehicleSnapshot: {
    registrationNumber: string;
    vin: string;
    manufacturer: string;
    model: string;
    color: string;
  };
  environmentalSnapshot?: {
    cabinTempCelsius?: number;
    occupantDetected?: boolean;
    coPpm?: number;
    smokeDetected?: boolean;
    peakImpactG?: number;
  };
  ownerEmergencyContactPhone?: string | null;
  authorizedDepartments: AuthorityDepartment[];
  sharedWithFamilyIds: string[];
  authoritySharingPolicy: AuthoritySharingPolicy;
  assignedAuthorityId?: string | null;
  assignedOfficerName?: string | null;
  dispatchReferenceCode?: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface IncidentUpdateDocument {
  id: string;
  incidentId: string;
  vehicleId: string;
  actorUserId: string;
  actorRole: UserRoleCode;
  authorityDepartment?: AuthorityDepartment | null;
  previousState: IncidentLifecycleState;
  newState: IncidentLifecycleState;
  note: string;
  dispatchReferenceCode?: string | null;
  visibility: 'ALL_AUTHORIZED' | 'AUTHORITY_INTERNAL' | 'CUSTOMER_VISIBLE';
  createdAt: string;
}

export interface AlertDocument {
  id: string;
  incidentId: string;
  vehicleId: string;
  targetUserIds: string[];
  alertType: IncidentTypeCode;
  severity: IncidentSeverity;
  title: string;
  message: string;
  acknowledgedByUserId?: string | null;
  acknowledgedAt?: string | null;
  createdAt: string;
}

export interface NotificationDocument {
  id: string;
  dedupeKey: string;
  recipientUserId: string;
  recipientRole: UserRoleCode;
  incidentId?: string | null;
  vehicleId?: string | null;
  channel: 'FCM_PUSH' | 'IN_APP';
  title: string;
  body: string;
  status: NotificationStatus;
  retryCount: number;
  fcmMessageId?: string | null;
  lastError?: string | null;
  createdAt: string;
  fcmAcceptedAt?: string | null;
  deliveredAckAt?: string | null;
  readAt?: string | null;
}

export interface AuditLogDocument {
  id: string;
  sequenceIndex: number;
  prevAuditHash: string;
  entryHash: string;
  actorUserId: string;
  actorRole: UserRoleCode | 'SYSTEM' | 'HARDWARE_DEVICE';
  actorTenantId?: string | null;
  actorIpHash: string;
  action: string;
  severity: 'INFO' | 'SENSITIVE' | 'CRITICAL';
  targetCollection: string;
  targetDocumentId: string;
  reason?: string;
  metadata: Record<string, unknown>;
  retainUntil: string;
  createdAt: string;
}

export interface SupportTicketMessage {
  senderUserId: string;
  senderRole: UserRoleCode;
  body: string;
  createdAt: string;
}

export interface SupportTicketDocument {
  id: string;
  createdByUserId: string;
  vehicleId?: string | null;
  companyId?: string | null;
  showroomId?: string | null;
  category:
    | 'DEVICE_ISSUE'
    | 'ACCOUNT_RECOVERY'
    | 'REGISTRATION_CORRECTION'
    | 'GENERAL_INQUIRY';
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assignedSupportUserId?: string | null;
  messages: SupportTicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SystemConfigurationDocument {
  id: string;
  value: Record<string, unknown>;
  version: number;
  updatedBySuperAdminId: string;
  updatedAt: string;
}

// ============================================================================
// 7. SERVER-ONLY COLLECTIONS 24..26 (+ _deviceKeyVault)
// ============================================================================
export interface UniqueLockDocument {
  lockKey: string;
  entityCollection: string;
  entityId: string;
  createdAt: string;
}

export interface AuthSecretsDocument {
  uid: string;
  passwordSaltHex: string;
  passwordHashHex: string;
  passwordUpdatedAt: string;
  failedLoginAttempts: number;
  lockoutUntil?: string | null;
  pendingInviteSaltHex?: string | null;
  pendingInviteHashHex?: string | null;
  inviteExpiresAt?: string | null;
}

export interface OtpChallengeDocument {
  id: string;
  phoneE164: string;
  purpose: OtpPurpose;
  otpSaltHex: string;
  otpHashHex: string;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  verifiedAt?: string | null;
  expiresAt: string;
  rateLimitWindowStart: string;
  requestCountInWindow: number;
  createdAt: string;
}

export interface DeviceKeyVaultDocument {
  deviceId: string;
  activeKeyVersion: number;
  encryptedHmacKeyHex: string;
  ivHex: string;
  authTagHex: string;
  previousKeyVersion?: number | null;
  previousEncryptedHmacKeyHex?: string | null;
  previousIvHex?: string | null;
  previousAuthTagHex?: string | null;
  previousKeyExpiresAt?: string | null;
  status: 'ACTIVE' | 'REVOKED';
  rotatedAt: string;
}

// ============================================================================
// 8. AUTHORITY DEPARTMENT REDACTED DTOs & LOCATION FRESHNESS RESULT
// ============================================================================
export interface LocationFreshnessEvaluation {
  state: LocationFreshnessState;
  locationAgeSeconds: number | null;
  heartbeatAgeSeconds: number | null;
  isLive: boolean;
  displayLabel: string;
  warningBanner: string | null;
}

export interface MedicalAuthorityIncidentView {
  id: string;
  incidentType: IncidentTypeCode;
  severity: IncidentSeverity;
  lifecycleState: IncidentLifecycleState;
  location: IncidentLocationInfo;
  vehicleDescription: {
    registrationNumber: string;
    manufacturer: string;
    model: string;
    color: string;
  };
  environmentalSnapshot?: IncidentDocument['environmentalSnapshot'];
  emergencyContactPhone?: string | null;
  assignedOfficerName?: string | null;
  dispatchReferenceCode?: string | null;
  occurredAt: string;
}

export interface PoliceAuthorityIncidentView {
  id: string;
  incidentType: IncidentTypeCode;
  severity: IncidentSeverity;
  lifecycleState: IncidentLifecycleState;
  location: IncidentLocationInfo;
  vehicleIdentification: {
    registrationNumber: string;
    vin: string;
    manufacturer: string;
    model: string;
    color: string;
  };
  emergencyContactPhone?: string | null;
  assignedOfficerName?: string | null;
  dispatchReferenceCode?: string | null;
  occurredAt: string;
}

/**
 * Strictly anonymized view for AUTHORITY_ROAD: contains zero vehicle registration,
 * VIN, owner, or family PII.
 */
export interface RoadAuthorityAnonymizedIncidentView {
  id: string;
  incidentType: 'ROAD_HAZARD' | 'ACCIDENT_DETECTED';
  severity: IncidentSeverity;
  lifecycleState: IncidentLifecycleState;
  location: IncidentLocationInfo;
  peakImpactG?: number | null;
  assignedOfficerName?: string | null;
  occurredAt: string;
}
