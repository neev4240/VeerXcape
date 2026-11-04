import { z } from 'zod';
import {
  ALL_USER_ROLES,
  AUTHORITY_DEPARTMENTS,
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  normalizeDeviceSerial,
  normalizePhoneE164,
  normalizeRegistrationNumber,
  normalizeVin
} from '@veerxcape/shared-constants';

// ============================================================================
// 1. PRIMITIVE IDENTITY & VEHICLE IDENTIFIER SCHEMAS
// ============================================================================
export const phoneE164Schema = z
  .string()
  .transform(normalizePhoneE164)
  .refine((val) => /^\+[1-9]\d{7,14}$/.test(val), {
    message: 'Phone number must be in valid E.164 format (e.g. +919876543210).'
  });

/**
 * Strong password schema:
 * - Minimum 8 characters, maximum 128 characters
 * - At least one uppercase letter, one lowercase letter, and one digit
 * - Explicitly forbids vehicle registration patterns as standalone secrets
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long.')
  .max(128, 'Password must not exceed 128 characters.')
  .refine((val) => /[A-Z]/.test(val), 'Password must include at least one uppercase letter.')
  .refine((val) => /[a-z]/.test(val), 'Password must include at least one lowercase letter.')
  .refine((val) => /\d/.test(val), 'Password must include at least one number.');

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'OTP code must be an exact 6-digit numeric code.');

export const vehicleRegistrationSchema = z
  .string()
  .transform(normalizeRegistrationNumber)
  .refine((val) => /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(val), {
    message: 'Vehicle registration number must match standard format (e.g. UP32AB1234).'
  });

export const vinSchema = z
  .string()
  .transform(normalizeVin)
  .refine((val) => /^[A-HJ-NPR-Z0-9]{17}$/.test(val), {
    message: 'VIN must be 17 alphanumeric characters (excluding I, O, Q).'
  });

export const deviceSerialSchema = z
  .string()
  .transform(normalizeDeviceSerial)
  .refine((val) => /^VX-STM32U575-[A-Z0-9]{4,12}$/.test(val), {
    message: 'Device serial must follow VX-STM32U575-<ID> format.'
  });

export const jurisdictionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}-[A-Z]{2}-[A-Z0-9]{2,6}$/, 'Jurisdiction code must match COUNTRY-STATE-DISTRICT (e.g. IN-UP-LKO).');

// ============================================================================
// 2. AUTHENTICATION & FAMILY INVITE SCHEMAS
// ============================================================================
export const requestOtpPayloadSchema = z.object({
  phoneE164: phoneE164Schema,
  purpose: z.enum([
    'CUSTOMER_LOGIN',
    'CUSTOMER_ACTIVATION',
    'FAMILY_ACTIVATION',
    'SHOWROOM_CUSTOMER_VERIFY',
    'PASSWORD_RESET'
  ])
});

export const customerPhoneLoginSchema = z.object({
  phoneE164: phoneE164Schema,
  password: z.string().min(1, 'Password is required.')
});

export const customerAccountActivationSchema = z.object({
  phoneE164: phoneE164Schema,
  otpCode: otpCodeSchema,
  newPassword: strongPasswordSchema
});

export const familyMemberInviteSchema = z.object({
  vehicleId: z.string().min(4),
  familyMemberName: z.string().trim().min(2).max(100),
  familyMemberPhoneE164: phoneE164Schema,
  relationship: z.string().trim().min(2).max(50),
  initialPassword: strongPasswordSchema,
  permissions: z.object({
    canViewLocation: z.boolean(),
    canViewTelemetry: z.boolean(),
    canReceiveCriticalAlerts: z.boolean(),
    canViewIncidentHistory: z.boolean(),
    canTriggerSos: z.boolean()
  })
});

export const familyMemberActivationSchema = z.object({
  phoneE164: phoneE164Schema,
  otpCode: otpCodeSchema,
  initialPassword: z.string().min(8),
  newPermanentPassword: strongPasswordSchema
});

// ============================================================================
// 3. SHOWROOM VEHICLE REGISTRATION WORKFLOW SCHEMA
// ============================================================================
export const showroomVehicleRegistrationSchema = z.object({
  showroomId: z.string().min(4),
  registrationNumber: vehicleRegistrationSchema,
  vin: vinSchema,
  manufacturer: z.string().trim().min(2).max(80),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().min(1).max(80),
  manufacturingYear: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  color: z.string().trim().min(2).max(40),
  fuelType: z.enum(['PETROL', 'DIESEL', 'EV', 'HYBRID', 'CNG']),
  customerFullName: z.string().trim().min(2).max(100),
  customerPhoneE164: phoneE164Schema,
  customerEmail: z.string().email().optional().nullable(),
  customerOtpChallengeId: z.string().min(4),
  assignedDeviceSerial: deviceSerialSchema
});

// ============================================================================
// 4. STM32U575 HARDWARE IOT GATEWAY SCHEMAS
// ============================================================================
export const iotSignedHeadersSchema = z.object({
  'x-device-serial': deviceSerialSchema,
  'x-device-timestamp': z.coerce.number().int().positive(),
  'x-transmission-timestamp': z.coerce.number().int().positive(),
  'x-device-sequence': z.coerce.number().int().nonnegative(),
  'x-device-signature': z.string().regex(/^[a-fA-F0-9]{64}$/, 'HMAC-SHA256 signature must be 64 hex characters.')
});

export const iotHeartbeatPayloadSchema = z.object({
  mcuUptimeSeconds: z.number().int().nonnegative(),
  powerSource: z.enum(['VEHICLE_12V', 'BACKUP_BATTERY']),
  backupBatteryPercent: z.number().min(0).max(100),
  batteryVoltageMv: z.number().int().min(0).max(36000),
  cellularRssiDbm: z.number().min(-140).max(-30),
  gnssFixStatus: z.enum(['FIX_3D', 'FIX_2D', 'NO_FIX']),
  firmwareVersion: z.string().trim().min(3).max(32)
});

export const iotTelemetryPayloadSchema = z.object({
  isSimulated: z.boolean().default(false),
  gnss: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyMeters: z.number().nonnegative(),
      speedKmh: z.number().nonnegative().optional(),
      heading: z.number().min(0).max(360).optional(),
      recordedAt: z.string().datetime()
    })
    .nullable(),
  imu: z.object({
    accelXg: z.number(),
    accelYg: z.number(),
    accelZg: z.number(),
    peakImpactG: z.number().nonnegative(),
    tiltDegrees: z.number().min(-180).max(180)
  }),
  cabin: z.object({
    occupantDetected: z.boolean(),
    cabinTempCelsius: z.number().min(-50).max(125),
    smokeDetected: z.boolean(),
    coPpm: z.number().nonnegative()
  }),
  vehicleBus: z.object({
    ignitionOn: z.boolean(),
    doorsLocked: z.boolean(),
    windowsClosed: z.boolean()
  }),
  power: z.object({
    mainVoltageMv: z.number().int().nonnegative(),
    backupBatteryPercent: z.number().min(0).max(100),
    powerSource: z.enum(['VEHICLE_12V', 'BACKUP_BATTERY'])
  })
});

export const iotHardwareEventItemSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  eventSequenceNumber: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  offlineRetry: z.boolean().default(false),
  isSimulated: z.boolean().default(false),
  incidentType: z.enum([
    INCIDENT_TYPES.ACCIDENT_DETECTED,
    INCIDENT_TYPES.PARKED_OCCUPANT_ALERT,
    INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT,
    INCIDENT_TYPES.ROAD_HAZARD,
    INCIDENT_TYPES.DEVICE_POWER_FAILURE
  ]),
  severity: z.enum(['INFO', 'WARNING', 'HIGH', 'CRITICAL']),
  confidenceScore: z.number().min(0).max(1),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative(),
    roadSegmentSummary: z.string().trim().min(2).max(200),
    jurisdictionCode: jurisdictionCodeSchema
  }),
  environmentalSnapshot: z
    .object({
      cabinTempCelsius: z.number().optional(),
      occupantDetected: z.boolean().optional(),
      coPpm: z.number().optional(),
      smokeDetected: z.boolean().optional(),
      peakImpactG: z.number().optional()
    })
    .optional()
});

export const iotEventsBatchPayloadSchema = z.object({
  events: z.array(iotHardwareEventItemSchema).min(1).max(25)
});

// ============================================================================
// 5. AUTHORITY INCIDENT UPDATE & ADMIN ROLE ASSIGNMENT SCHEMAS
// ============================================================================
export const authorityIncidentUpdateSchema = z.object({
  incidentId: z.string().min(4),
  newState: z.enum([
    INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED,
    INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY,
    INCIDENT_LIFECYCLE_STATES.RESPONSE_CONFIRMED,
    INCIDENT_LIFECYCLE_STATES.RESOLVED
  ]),
  note: z.string().trim().min(5).max(1000),
  assignedOfficerName: z.string().trim().min(2).max(100).optional(),
  dispatchReferenceCode: z.string().trim().min(2).max(60).optional(),
  visibility: z.enum(['ALL_AUTHORIZED', 'AUTHORITY_INTERNAL', 'CUSTOMER_VISIBLE'])
});

export const roleAssignmentPayloadSchema = z.object({
  targetUserId: z.string().min(4),
  role: z.enum(ALL_USER_ROLES as [string, ...string[]]),
  scopeType: z.enum(['PLATFORM', 'COMPANY', 'SHOWROOM', 'AUTHORITY', 'VEHICLE']),
  scopeId: z.string().min(2),
  companyId: z.string().optional().nullable(),
  showroomId: z.string().optional().nullable(),
  authorityId: z.string().optional().nullable(),
  vehicleId: z.string().optional().nullable(),
  department: z
    .enum([
      AUTHORITY_DEPARTMENTS.MEDICAL,
      AUTHORITY_DEPARTMENTS.POLICE,
      AUTHORITY_DEPARTMENTS.ROAD
    ])
    .optional()
    .nullable(),
  jurisdictionCode: jurisdictionCodeSchema.optional().nullable()
});

