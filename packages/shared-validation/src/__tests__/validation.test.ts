import { describe, expect, it } from 'vitest';
import {
  customerAccountActivationSchema,
  deviceSerialSchema,
  familyMemberInviteSchema,
  iotEventsBatchPayloadSchema,
  phoneE164Schema,
  showroomVehicleRegistrationSchema,
  strongPasswordSchema,
  vehicleRegistrationSchema,
  vinSchema
} from '../index.js';

describe('@veerxcape/shared-validation — Stage 1 Schema Verification', () => {
  it('validates and normalizes E.164 phone numbers and rejects invalid formats', () => {
    expect(phoneE164Schema.parse('+91 98765-43210')).toBe('+919876543210');
    expect(() => phoneE164Schema.parse('9876543210')).toThrow();
    expect(() => phoneE164Schema.parse('invalid-phone')).toThrow();
  });

  it('enforces strong password rules (min 8 chars, upper, lower, digit)', () => {
    expect(strongPasswordSchema.parse('VeerXcape99')).toBe('VeerXcape99');
    expect(() => strongPasswordSchema.parse('short1A')).toThrow();
    expect(() => strongPasswordSchema.parse('alllowercase123')).toThrow();
    expect(() => strongPasswordSchema.parse('ALLUPPERCASE123')).toThrow();
    expect(() => strongPasswordSchema.parse('NoDigitsHere')).toThrow();
  });

  it('normalizes and validates vehicle registration numbers, VINs, and STM32U575 serials', () => {
    expect(vehicleRegistrationSchema.parse('up 32 ab 1234')).toBe('UP32AB1234');
    expect(() => vehicleRegistrationSchema.parse('INVALID')).toThrow();

    expect(vinSchema.parse('ma3eua61s00123456')).toBe('MA3EUA61S00123456');
    expect(() => vinSchema.parse('MA3EUA61I00123456')).toThrow(); // 'I' is illegal in VIN

    expect(deviceSerialSchema.parse('vx-stm32u575-00a1')).toBe('VX-STM32U575-00A1');
    expect(() => deviceSerialSchema.parse('ESP32-1234')).toThrow();
  });

  it('validates showroom vehicle registration without allowing any customer password field', () => {
    const valid = showroomVehicleRegistrationSchema.parse({
      showroomId: 'shw_001',
      registrationNumber: 'DL 01 CA 9999',
      vin: 'MA3EUA61S00123456',
      manufacturer: 'Tata Motors',
      model: 'Nexon EV',
      variant: 'Empowered Plus LR',
      manufacturingYear: 2026,
      color: 'Pristine White',
      fuelType: 'EV',
      customerFullName: 'Aarav Sharma',
      customerPhoneE164: '+919811122233',
      customerEmail: 'aarav@example.com',
      customerOtpChallengeId: 'chg_12345',
      assignedDeviceSerial: 'VX-STM32U575-0001'
    });
    expect(valid.registrationNumber).toBe('DL01CA9999');
    expect('customerPassword' in valid).toBe(false);
  });

  it('validates family member invite payload with explicit permission flags', () => {
    const parsed = familyMemberInviteSchema.parse({
      vehicleId: 'veh_1001',
      familyMemberName: 'Priya Sharma',
      familyMemberPhoneE164: '+919876500001',
      relationship: 'Spouse',
      initialPassword: 'TempPassword123',
      permissions: {
        canViewLocation: true,
        canViewTelemetry: true,
        canReceiveCriticalAlerts: true,
        canViewIncidentHistory: true,
        canTriggerSos: true
      }
    });
    expect(parsed.familyMemberPhoneE164).toBe('+919876500001');
  });

  it('validates customer account activation and STM32U575 offline event batch payloads', () => {
    expect(
      customerAccountActivationSchema.parse({
        phoneE164: '+919876543210',
        otpCode: '482910',
        newPassword: 'SecurePassword2026'
      }).otpCode
    ).toBe('482910');

    const batch = iotEventsBatchPayloadSchema.parse({
      events: [
        {
          idempotencyKey: 'dev_01_boot_4_seq_19',
          eventSequenceNumber: 19,
          occurredAt: '2026-11-04T12:00:00.000Z',
          offlineRetry: true,
          isSimulated: false,
          incidentType: 'ACCIDENT_DETECTED',
          severity: 'CRITICAL',
          confidenceScore: 0.98,
          location: {
            lat: 26.8467,
            lng: 80.9462,
            accuracyMeters: 4.5,
            roadSegmentSummary: 'NH-27 Gomti Nagar Bypass',
            jurisdictionCode: 'IN-UP-LKO'
          },
          environmentalSnapshot: {
            peakImpactG: 6.4,
            cabinTempCelsius: 29.5,
            occupantDetected: true
          }
        }
      ]
    });
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0].offlineRetry).toBe(true);
  });
});

