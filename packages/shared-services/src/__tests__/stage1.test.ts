import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_USER_ROLES,
  DOMAIN_COLLECTIONS,
  FIRESTORE_COLLECTIONS,
  GENESIS_AUDIT_HASH,
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  LOCATION_FRESHNESS_STATES,
  SERVER_ONLY_COLLECTIONS,
  UNIQUE_LOCK_KEYS
} from '@veerxcape/shared-constants';
import type {
  AuditLogDocument,
  CompanyDocument,
  DeviceDocument,
  FamilyMembershipDocument,
  IncidentDocument,
  ShowroomDocument,
  UserDocument,
  UserRoleDocument,
  VehicleDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import {
  computeAuditEntryHash,
  computeLocationFreshness,
  computeStm32HmacSignature,
  evaluateAndRedactIncidentForAuthority,
  evaluateDeviceSubmissionPermission,
  evaluateSequenceReplayWindow,
  evaluateShowroomOrCompanyAccess,
  evaluateVehicleCustomerAccess,
  verifyAuditChainIntegrity,
  verifyLiveSessionActive,
  verifyStm32HmacSignature
} from '../index.js';

describe('@veerxcape/shared-services — Stage 1 Architecture & Security Verification', () => {
  it('1. verifies the reconciled 27 Firestore collection constants (23 domain/config + 4 server-only) and deterministic unique lock keys', () => {
    expect(ALL_USER_ROLES).toHaveLength(12);
    expect(Object.keys(DOMAIN_COLLECTIONS)).toHaveLength(23);
    expect(Object.keys(SERVER_ONLY_COLLECTIONS)).toHaveLength(4);
    expect(Object.keys(FIRESTORE_COLLECTIONS)).toHaveLength(27);

    expect(UNIQUE_LOCK_KEYS.phone('+91 98765-43210')).toBe('phone_+919876543210');
    expect(UNIQUE_LOCK_KEYS.vehicleRegistration('up 32 ab 1234')).toBe('reg_UP32AB1234');
    expect(UNIQUE_LOCK_KEYS.vehicleVin('ma3eua61s00123456')).toBe('vin_MA3EUA61S00123456');
    expect(UNIQUE_LOCK_KEYS.deviceSerial('vx-stm32u575-0001')).toBe(
      'serial_VX-STM32U575-0001'
    );
    expect(UNIQUE_LOCK_KEYS.dealerCode('cmp_tata', 'dlr-lko-01')).toBe(
      'dealer_cmp_tata_DLR-LKO-01'
    );
  });

  it('2. standardizes LIVE, RECENT, STALE, and OFFLINE location freshness states', () => {
    const nowMs = Date.parse('2026-11-04T12:10:00.000Z');

    // LIVE: 20s old location, 25s old heartbeat
    const live = computeLocationFreshness({
      lastLocationRecordedAt: '2026-11-04T12:09:40.000Z',
      lastHeartbeatAt: '2026-11-04T12:09:35.000Z',
      nowMs
    });
    expect(live.state).toBe(LOCATION_FRESHNESS_STATES.LIVE);
    expect(live.isLive).toBe(true);
    expect(live.warningBanner).toBeNull();

    // RECENT: 180s (3m) old location, 30s old heartbeat
    const recent = computeLocationFreshness({
      lastLocationRecordedAt: '2026-11-04T12:07:00.000Z',
      lastHeartbeatAt: '2026-11-04T12:09:30.000Z',
      nowMs
    });
    expect(recent.state).toBe(LOCATION_FRESHNESS_STATES.RECENT);
    expect(recent.isLive).toBe(false);

    // STALE: 420s (7m) old location, 60s old heartbeat -> never presented as live
    const stale = computeLocationFreshness({
      lastLocationRecordedAt: '2026-11-04T12:03:00.000Z',
      lastHeartbeatAt: '2026-11-04T12:09:00.000Z',
      nowMs
    });
    expect(stale.state).toBe(LOCATION_FRESHNESS_STATES.STALE);
    expect(stale.isLive).toBe(false);
    expect(stale.warningBanner).toContain('stale');

    // OFFLINE: Heartbeat > 10 minutes old
    const offline = computeLocationFreshness({
      lastLocationRecordedAt: '2026-11-04T12:09:50.000Z',
      lastHeartbeatAt: '2026-11-04T11:55:00.000Z',
      nowMs
    });
    expect(offline.state).toBe(LOCATION_FRESHNESS_STATES.OFFLINE);
    expect(offline.isLive).toBe(false);
  });

  it('3. enforces immediate revocation when user is suspended, sessionVersion mismatches, family member is removed, or showroom is suspended', () => {
    const activeUser: UserDocument = {
      uid: 'usr_1',
      phoneE164: '+919876543210',
      status: 'ACTIVE',
      primaryRole: 'FAMILY_MEMBER',
      sessionVersion: 3,
      mfaEnrolled: false,
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z'
    };

    // Stale token sessionVersion (e.g. after password reset or role revocation)
    expect(
      verifyLiveSessionActive({ user: activeUser, tokenSessionVersion: 2 }).allowed
    ).toBe(false);

    // Suspended user account
    expect(
      verifyLiveSessionActive({
        user: { ...activeUser, status: 'SUSPENDED' },
        tokenSessionVersion: 3
      }).allowed
    ).toBe(false);

    const vehicle: VehicleDocument = {
      id: 'veh_1',
      registrationNumber: 'UP32AB1234',
      vin: 'MA3EUA61S00123456',
      manufacturer: 'Tata',
      model: 'Nexon EV',
      variant: 'LR',
      manufacturingYear: 2026,
      color: 'White',
      fuelType: 'EV',
      companyId: 'cmp_1',
      registeredByShowroomId: 'shw_1',
      registeredByStaffId: 'usr_staff',
      primaryOwnerId: 'usr_owner',
      registrationStatus: 'ACTIVE',
      registrationHistory: [],
      liveStatusSummary: { connectionStatus: 'LIVE' },
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z'
    };

    const familyMembership: FamilyMembershipDocument = {
      id: 'veh_1_usr_1',
      vehicleId: 'veh_1',
      ownerUserId: 'usr_owner',
      familyUserId: 'usr_1',
      familyMemberName: 'Member',
      familyMemberPhoneE164: '+919876543210',
      relationship: 'Sibling',
      status: 'ACTIVE',
      permissions: {
        canViewLocation: true,
        canViewTelemetry: false,
        canReceiveCriticalAlerts: true,
        canViewIncidentHistory: false,
        canTriggerSos: true
      },
      createdAt: '2026-11-04T10:00:00Z'
    };

    // Permitted capability (canViewLocation == true)
    expect(
      evaluateVehicleCustomerAccess({
        user: activeUser,
        tokenSessionVersion: 3,
        vehicle,
        familyMembership,
        requiredCapability: 'VIEW_LOCATION'
      }).allowed
    ).toBe(true);

    // Unpermitted capability (canViewTelemetry == false)
    expect(
      evaluateVehicleCustomerAccess({
        user: activeUser,
        tokenSessionVersion: 3,
        vehicle,
        familyMembership,
        requiredCapability: 'VIEW_TELEMETRY'
      }).allowed
    ).toBe(false);

    // Family member cannot perform owner-level management
    expect(
      evaluateVehicleCustomerAccess({
        user: activeUser,
        tokenSessionVersion: 3,
        vehicle,
        familyMembership,
        requiredCapability: 'MANAGE_FAMILY_AND_DRIVERS'
      }).allowed
    ).toBe(false);

    // Revoked family member loses access immediately
    expect(
      evaluateVehicleCustomerAccess({
        user: activeUser,
        tokenSessionVersion: 3,
        vehicle,
        familyMembership: { ...familyMembership, status: 'REVOKED' },
        requiredCapability: 'VIEW_LOCATION'
      }).allowed
    ).toBe(false);

    // Showroom tenant isolation & immediate showroom suspension enforcement
    const companyA: CompanyDocument = {
      id: 'cmp_A',
      organisationId: 'org_A',
      brandName: 'Apex OEM',
      oemCode: 'APX',
      headquartersAddress: 'Mumbai',
      status: 'ACTIVE',
      totalShowrooms: 1,
      totalVehiclesRegistered: 10,
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z'
    };
    const showroomA1: ShowroomDocument = {
      id: 'shw_A1',
      companyId: 'cmp_A',
      name: 'Apex Lucknow',
      dealerCode: 'APX-LKO',
      city: 'Lucknow',
      stateCode: 'UP',
      address: 'Hazratganj',
      contactPhone: '+91522111222',
      contactEmail: 'lko@apex.example',
      status: 'ACTIVE',
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z'
    };
    const staffRole: UserRoleDocument = {
      id: 'usr_1_SHOWROOM_STAFF_shw_A1',
      userId: 'usr_1',
      role: 'SHOWROOM_STAFF',
      scopeType: 'SHOWROOM',
      scopeId: 'shw_A1',
      companyId: 'cmp_A',
      showroomId: 'shw_A1',
      status: 'ACTIVE',
      grantedBy: 'usr_admin',
      createdAt: '2026-11-04T10:00:00Z'
    };

    expect(
      evaluateShowroomOrCompanyAccess({
        user: activeUser,
        tokenSessionVersion: 3,
        activeRoles: [staffRole],
        company: companyA,
        showroom: showroomA1,
        requiredRoles: ['SHOWROOM_STAFF']
      }).allowed
    ).toBe(true);

    // Suspended showroom immediately blocks staff operations
    expect(
      evaluateShowroomOrCompanyAccess({
        user: activeUser,
        tokenSessionVersion: 3,
        activeRoles: [staffRole],
        company: companyA,
        showroom: { ...showroomA1, status: 'SUSPENDED' },
        requiredRoles: ['SHOWROOM_STAFF']
      }).allowed
    ).toBe(false);
  });

  it('4. enforces Authority department, jurisdiction, and ROAD anonymization rules', () => {
    const crashIncident: IncidentDocument = {
      id: 'inc_101',
      idempotencyKey: 'idem_101',
      vehicleId: 'veh_1',
      deviceId: 'dev_1',
      incidentType: INCIDENT_TYPES.ACCIDENT_DETECTED,
      source: 'HARDWARE_STM32',
      isSimulated: false,
      severity: 'CRITICAL',
      confidenceScore: 0.99,
      lifecycleState: INCIDENT_LIFECYCLE_STATES.VISIBLE_TO_AUTHORITY,
      location: {
        lat: 26.85,
        lng: 80.95,
        accuracyMeters: 5,
        roadSegmentSummary: 'NH-27 KM 14',
        jurisdictionCode: 'IN-UP-LKO'
      },
      vehicleSnapshot: {
        registrationNumber: 'UP32AB1234',
        vin: 'MA3EUA61S00123456',
        manufacturer: 'Tata',
        model: 'Nexon EV',
        color: 'White'
      },
      environmentalSnapshot: {
        peakImpactG: 7.2,
        cabinTempCelsius: 31,
        occupantDetected: true
      },
      ownerEmergencyContactPhone: '+919876543210',
      authorizedDepartments: ['MEDICAL', 'POLICE', 'ROAD'],
      sharedWithFamilyIds: [],
      authoritySharingPolicy: 'CRITICAL_LIFE_SAFETY_RULE',
      occurredAt: '2026-11-04T12:00:00Z',
      createdAt: '2026-11-04T12:00:01Z',
      updatedAt: '2026-11-04T12:00:01Z'
    };

    // Wrong jurisdiction rejected
    expect(
      evaluateAndRedactIncidentForAuthority({
        incident: crashIncident,
        authorityDepartment: 'MEDICAL',
        authorityJurisdictionCode: 'IN-DL-NEW',
        authorityVerificationStatus: 'VERIFIED'
      }).allowed
    ).toBe(false);

    // Medical authority cannot access police-only THEFT_OR_INTRUSION_ALERT
    const theftIncident: IncidentDocument = {
      ...crashIncident,
      id: 'inc_102',
      incidentType: INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT,
      authorizedDepartments: ['POLICE']
    };
    expect(
      evaluateAndRedactIncidentForAuthority({
        incident: theftIncident,
        authorityDepartment: 'MEDICAL',
        authorityJurisdictionCode: 'IN-UP-LKO',
        authorityVerificationStatus: 'VERIFIED'
      }).allowed
    ).toBe(false);

    // Road authority receives strictly anonymized view (no registrationNumber, no VIN, no contact phone)
    const roadResult = evaluateAndRedactIncidentForAuthority({
      incident: crashIncident,
      authorityDepartment: 'ROAD',
      authorityJurisdictionCode: 'IN-UP-LKO',
      authorityVerificationStatus: 'VERIFIED'
    });
    expect(roadResult.allowed).toBe(true);
    if (roadResult.allowed && roadResult.department === 'ROAD') {
      const serialized = JSON.stringify(roadResult.data);
      expect(serialized).not.toContain('UP32AB1234');
      expect(serialized).not.toContain('MA3EUA61S00123456');
      expect(serialized).not.toContain('+919876543210');
      expect(roadResult.data.peakImpactG).toBe(7.2);
    }
  });

  it('5. verifies STM32U575 HMAC-SHA256 signatures, 64-slot replay window, and device assignment checks', () => {
    const secretKeyHex =
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const nowMs = 1762257600000;
    const rawBody = JSON.stringify({ mcuUptimeSeconds: 120 });

    const sig = computeStm32HmacSignature({
      deviceSecretKeyHex: secretKeyHex,
      serialNumber: 'VX-STM32U575-0001',
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/heartbeat',
      deviceTimestampMs: nowMs - 1000,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 10,
      rawBody
    });

    expect(
      verifyStm32HmacSignature({
        deviceSecretKeyHex: secretKeyHex,
        serialNumber: 'VX-STM32U575-0001',
        httpMethod: 'POST',
        requestPath: '/api/v1/iot/heartbeat',
        deviceTimestampMs: nowMs - 1000,
        transmissionTimestampMs: nowMs,
        sequenceNumber: 10,
        rawBody,
        providedSignatureHex: sig,
        nowMs
      }).valid
    ).toBe(true);

    // Tampered payload rejected
    expect(
      verifyStm32HmacSignature({
        deviceSecretKeyHex: secretKeyHex,
        serialNumber: 'VX-STM32U575-0001',
        httpMethod: 'POST',
        requestPath: '/api/v1/iot/heartbeat',
        deviceTimestampMs: nowMs - 1000,
        transmissionTimestampMs: nowMs,
        sequenceNumber: 10,
        rawBody: JSON.stringify({ mcuUptimeSeconds: 999 }),
        providedSignatureHex: sig,
        nowMs
      }).valid
    ).toBe(false);

    // Sliding window replay protection: advance to 10, then accept out-of-order offline retry 8, then reject replay of 8
    const step1 = evaluateSequenceReplayWindow({
      incomingSequence: 10,
      lastSequenceNumber: 0,
      replayWindowBitmapHex: '0000000000000000',
      allowSlidingWindowForOfflineRetry: false
    });
    expect(step1.accepted).toBe(true);

    const step2 = evaluateSequenceReplayWindow({
      incomingSequence: 8,
      lastSequenceNumber: step1.nextLastSequenceNumber,
      replayWindowBitmapHex: step1.nextReplayWindowBitmapHex,
      allowSlidingWindowForOfflineRetry: true
    });
    expect(step2.accepted).toBe(true);

    const step3Replay = evaluateSequenceReplayWindow({
      incomingSequence: 8,
      lastSequenceNumber: step2.nextLastSequenceNumber,
      replayWindowBitmapHex: step2.nextReplayWindowBitmapHex,
      allowSlidingWindowForOfflineRetry: true
    });
    expect(step3Replay.accepted).toBe(false);

    // Device cannot submit events for a vehicle to which it is not assigned
    const device: DeviceDocument = {
      id: 'dev_1',
      serialNumber: 'VX-STM32U575-0001',
      mcuModel: 'STM32U575RIT6',
      firmwareVersion: '1.0.0',
      imei: '123456789012345',
      simIccid: '8991000000000000001',
      secretVersion: 1,
      allocatedCompanyId: 'cmp_1',
      allocatedShowroomId: 'shw_1',
      assignedVehicleId: 'veh_1',
      status: 'ACTIVE',
      lastSequenceNumber: 10,
      replayWindowBitmap: step2.nextReplayWindowBitmapHex,
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z'
    };
    expect(
      evaluateDeviceSubmissionPermission({ device, claimedVehicleId: 'veh_1' }).allowed
    ).toBe(true);
    expect(
      evaluateDeviceSubmissionPermission({ device, claimedVehicleId: 'veh_OTHER' })
        .allowed
    ).toBe(false);
    expect(
      evaluateDeviceSubmissionPermission({
        device: { ...device, status: 'REVOKED' },
        claimedVehicleId: 'veh_1'
      }).allowed
    ).toBe(false);
  });

  it('6. verifies append-only cryptographic SHA-256 audit log chain and detects tampering', () => {
    const hash1 = computeAuditEntryHash({
      sequenceIndex: 1,
      prevAuditHash: GENESIS_AUDIT_HASH,
      actorUserId: 'usr_staff',
      actorRole: 'SHOWROOM_STAFF',
      action: 'VEHICLE_REGISTERED',
      targetCollection: 'vehicles',
      targetDocumentId: 'veh_1',
      createdAt: '2026-11-04T10:00:00.000Z',
      metadata: { registrationNumber: 'UP32AB1234' }
    });

    const entry1: AuditLogDocument = {
      id: 'aud_1',
      sequenceIndex: 1,
      prevAuditHash: GENESIS_AUDIT_HASH,
      entryHash: hash1,
      actorUserId: 'usr_staff',
      actorRole: 'SHOWROOM_STAFF',
      actorIpHash: 'ip_hash_1',
      action: 'VEHICLE_REGISTERED',
      severity: 'SENSITIVE',
      targetCollection: 'vehicles',
      targetDocumentId: 'veh_1',
      metadata: { registrationNumber: 'UP32AB1234' },
      retainUntil: '2033-11-04T10:00:00.000Z',
      createdAt: '2026-11-04T10:00:00.000Z'
    };

    const hash2 = computeAuditEntryHash({
      sequenceIndex: 2,
      prevAuditHash: hash1,
      actorUserId: 'usr_med_1',
      actorRole: 'AUTHORITY_MEDICAL',
      action: 'AUTHORITY_INCIDENT_ACCESSED',
      targetCollection: 'incidents',
      targetDocumentId: 'inc_101',
      createdAt: '2026-11-04T12:01:00.000Z',
      metadata: { jurisdictionCode: 'IN-UP-LKO' }
    });

    const entry2: AuditLogDocument = {
      id: 'aud_2',
      sequenceIndex: 2,
      prevAuditHash: hash1,
      entryHash: hash2,
      actorUserId: 'usr_med_1',
      actorRole: 'AUTHORITY_MEDICAL',
      actorIpHash: 'ip_hash_2',
      action: 'AUTHORITY_INCIDENT_ACCESSED',
      severity: 'SENSITIVE',
      targetCollection: 'incidents',
      targetDocumentId: 'inc_101',
      metadata: { jurisdictionCode: 'IN-UP-LKO' },
      retainUntil: '2033-11-04T12:01:00.000Z',
      createdAt: '2026-11-04T12:01:00.000Z'
    };

    expect(verifyAuditChainIntegrity([entry1, entry2]).valid).toBe(true);

    // Tamper with entry1 metadata -> detected immediately
    const tamperedEntry1: AuditLogDocument = {
      ...entry1,
      metadata: { registrationNumber: 'DL01AA0000' }
    };
    const tamperedCheck = verifyAuditChainIntegrity([tamperedEntry1, entry2]);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.brokenAtSequenceIndex).toBe(1);
  });

  it('7. verifies firestore.rules and firestore.indexes.json structure and security invariants', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const rulesText = fs.readFileSync(
      path.join(repoRoot, 'firebase/firestore.rules'),
      'utf8'
    );
    const indexesJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'firebase/firestore.indexes.json'), 'utf8')
    );

    // Server-only collections are locked down
    expect(rulesText).toContain('match /_uniqueLocks/{lockKey}');
    expect(rulesText).toContain('match /_authSecrets/{uid}');
    expect(rulesText).toContain('match /_otpChallenges/{challengeId}');
    expect(rulesText).toContain('match /_deviceKeyVault/{deviceId}');

    // Audit logs cannot be created, updated, or deleted by any client
    expect(rulesText).toContain('match /auditLogs/{auditId}');
    expect(rulesText).toContain('allow create, update, delete: if false;');

    // TTL field overrides exist for high-volume telemetry and heartbeats
    expect(indexesJson.fieldOverrides).toHaveLength(2);
    expect(indexesJson.indexes.length).toBeGreaterThanOrEqual(20);
  });
});

