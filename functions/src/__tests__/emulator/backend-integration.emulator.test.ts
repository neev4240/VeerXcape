import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import admin from 'firebase-admin';
import {
  FIRESTORE_COLLECTIONS,
  INCIDENT_TYPES,
  LOCATION_FRESHNESS_STATES,
  NOTIFICATION_STATUSES,
  USER_ROLES
} from '@veerxcape/shared-constants';
import {
  computeStm32HmacSignature,
  verifyAuditChainIntegrity
} from '@veerxcape/shared-services';
import type {
  AuditLogDocument,
  IncidentEventDocument,
  NotificationDocument,
  TelemetryRecordDocument,
  UserDocument,
  UserRoleDocument,
  VehicleDocument,
  VeerXcapeCustomClaims
} from '@veerxcape/shared-types';
import { createVeerXcapeExpressApp } from '../../app.js';
import { createFirebaseAdminRuntime } from '../../shared/firebaseAdmin.js';

const PROJECT_ID = 'veerxcape-01';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

interface ApiTestResponse<T = any> {
  status: number;
  body: {
    success: boolean;
    data?: T;
    error?: {
      code: string;
      message: string;
    };
  };
}

async function clearFirestoreAndAuthEmulators(): Promise<void> {
  const fsClearRes = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  expect(fsClearRes.ok).toBe(true);

  const authClearRes = await fetch(
    `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  expect(authClearRes.ok).toBe(true);
}

/**
 * Exchanges a Firebase Custom Token for a real signed Firebase ID Token (JWT)
 * against the live Firebase Authentication Emulator.
 */
async function exchangeCustomTokenForIdToken(
  customToken: string
): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true
      })
    }
  );
  const json = (await res.json()) as { idToken?: string; error?: unknown };
  if (!res.ok || !json.idToken) {
    throw new Error(
      `Failed to exchange custom token on Auth Emulator: ${JSON.stringify(json)}`
    );
  }
  return json.idToken;
}

describe('Stage 10B — Real Firebase Auth & Firestore Emulator Backend Integration, Pagination & Concurrency Suite', () => {
  let runtime: ReturnType<typeof createFirebaseAdminRuntime>;
  let server: http.Server;
  let baseUrl: string;

  async function requestJson<T = any>(params: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<ApiTestResponse<T>> {
    const headers: Record<string, string> = { ...(params.headers ?? {}) };
    if (params.token) {
      headers.Authorization = `Bearer ${params.token}`;
    }
    let bodyStr: string | undefined;
    if (params.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyStr =
        typeof params.body === 'string'
          ? params.body
          : JSON.stringify(params.body);
    }

    const res = await fetch(`${baseUrl}${params.path}`, {
      method: params.method,
      headers,
      ...(bodyStr !== undefined ? { body: bodyStr } : {})
    });

    const json = (await res.json()) as ApiTestResponse<T>['body'];
    return { status: res.status, body: json };
  }

  async function seedEmulatorUserAndGetIdToken(params: {
    uid: string;
    phoneE164: string;
    primaryRole: UserDocument['primaryRole'];
    tier: VeerXcapeCustomClaims['tier'];
    sessionVersion?: number;
    scopedRole?: Omit<UserRoleDocument, 'id' | 'createdAt'>;
  }): Promise<{ userDoc: UserDocument; idToken: string; customToken: string }> {
    const nowIso = runtime.now().toISOString();
    const sessionVersion = params.sessionVersion ?? 1;

    await runtime.auth.ensureUserByPhone({
      uid: params.uid,
      phoneE164: params.phoneE164,
      email: `${params.uid}@veerxcape.example`,
      displayName: `Emulator ${params.primaryRole}`
    });

    const userDoc: UserDocument = {
      uid: params.uid,
      phoneE164: params.phoneE164,
      email: `${params.uid}@veerxcape.example`,
      status: 'ACTIVE',
      primaryRole: params.primaryRole,
      sessionVersion,
      mfaEnrolled: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, params.uid, userDoc);

    if (params.scopedRole) {
      const roleDoc: UserRoleDocument = {
        ...params.scopedRole,
        id: `${params.uid}_${params.scopedRole.role}_${params.scopedRole.scopeId}`,
        createdAt: nowIso
      };
      await runtime.setDoc(
        FIRESTORE_COLLECTIONS.USER_ROLES,
        roleDoc.id,
        roleDoc
      );
    }

    const customToken = await runtime.auth.createCustomToken(params.uid, {
      sv: sessionVersion,
      tier: params.tier
    });
    const idToken = await exchangeCustomTokenForIdToken(customToken);

    return { userDoc, idToken, customToken };
  }

  beforeEach(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
    process.env.GCLOUD_PROJECT = PROJECT_ID;

    await clearFirestoreAndAuthEmulators();

    runtime = createFirebaseAdminRuntime({
      environment: 'development',
      allowDemoOtp: true,
      allowSimulatedIot: true
    });

    const { app } = createVeerXcapeExpressApp(runtime);
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await clearFirestoreAndAuthEmulators();
  });

  it('1. Section 2: verifies real Firebase Authentication Emulator ID tokens, custom claims, invalid/expired/tampered token rejection, account suspension, and immediate revocation', async () => {
    const superAdmin = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_emu_super',
      phoneE164: '+919100000001',
      primaryRole: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
      tier: 'ADMIN',
      scopedRole: {
        userId: 'usr_emu_super',
        role: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
        scopeType: 'PLATFORM',
        scopeId: 'PLATFORM',
        status: 'ACTIVE',
        grantedBy: 'SYSTEM'
      }
    });

    const customer = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_emu_cust',
      phoneE164: '+919100000002',
      primaryRole: USER_ROLES.VEHICLE_OWNER,
      tier: 'CUSTOMER'
    });

    // 1. Valid real Firebase ID token is accepted
    const validDashRes = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: customer.idToken
    });
    expect(validDashRes.status).toBe(200);
    expect(validDashRes.body.success).toBe(true);

    // 2. Malformed, tampered, and raw custom-token (non-ID-token) strings are rejected with 401
    for (const badToken of [
      'not-a-jwt-token',
      `${customer.idToken}tampered`,
      customer.customToken,
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfZW11X2N1c3QiLCJleHAiOjF9.invalid'
    ]) {
      const badRes = await requestJson({
        method: 'GET',
        path: '/api/v1/mobile/dashboard',
        token: badToken
      });
      expect(badRes.status).toBe(401);
      expect(badRes.body.error?.code).toBe('UNAUTHORIZED');
    }

    // 3. Customer cannot assign themselves privileged roles via /api/v1/admin/roles/assign -> 403 FORBIDDEN
    const selfPrivilegeRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/roles/assign',
      token: customer.idToken,
      body: {
        targetUserId: customer.userDoc.uid,
        role: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
        scopeType: 'PLATFORM',
        scopeId: 'PLATFORM'
      }
    });
    expect(selfPrivilegeRes.status).toBe(403);
    expect(selfPrivilegeRes.body.error?.code).toBe('FORBIDDEN');

    // 4. Suspending the customer account invalidates their existing valid Firebase ID token immediately
    const suspendRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/users/${customer.userDoc.uid}/suspend`,
      token: superAdmin.idToken,
      body: { reason: 'Security audit suspension verification' }
    });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe('SUSPENDED');
    expect(suspendRes.body.data.sessionVersion).toBe(2);

    const dashAfterSuspend = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: customer.idToken
    });
    expect([401, 403]).toContain(dashAfterSuspend.status);
    expect(dashAfterSuspend.body.success).toBe(false);

    // 5. Reactivating the customer account increments sessionVersion to 3; old token (sv=1) still fails, new token (sv=3) succeeds
    const reactivateRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/users/${customer.userDoc.uid}/reactivate`,
      token: superAdmin.idToken,
      body: { reason: 'Customer identity verified and cleared' }
    });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.sessionVersion).toBe(3);

    const oldTokenStillRejected = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: customer.idToken
    });
    expect([401, 403]).toContain(oldTokenStillRejected.status);

    const newCustomToken = await runtime.auth.createCustomToken(
      customer.userDoc.uid,
      { sv: 3, tier: 'CUSTOMER' }
    );
    const newIdToken = await exchangeCustomTokenForIdToken(newCustomToken);
    const dashWithNewToken = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: newIdToken
    });
    expect(dashWithNewToken.status).toBe(200);
  });

  it('2. Section 4: executes end-to-end real Firebase-backed workflows (onboarding, device provisioning/rotation/revocation, vehicle registration, family/driver access, STM32 heartbeat/telemetry/events, authority dispatch, notification retry, and audit verification)', async () => {
    const superAdmin = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_super_e2e',
      phoneE164: '+919200000001',
      primaryRole: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
      tier: 'ADMIN',
      scopedRole: {
        userId: 'usr_super_e2e',
        role: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
        scopeType: 'PLATFORM',
        scopeId: 'PLATFORM',
        status: 'ACTIVE',
        grantedBy: 'SYSTEM'
      }
    });

    // 1. Onboard Company, Showroom, and Medical + Road Authorities
    const cmpRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/companies',
      token: superAdmin.idToken,
      body: {
        brandName: 'Tata Motors Passenger Vehicles',
        oemCode: 'TATA',
        registrationNumber: 'CIN-TATA-EMU-01',
        headquartersAddress: 'Mumbai, Maharashtra',
        contactEmail: 'oem@tata.example',
        contactPhone: '+912266658282'
      }
    });
    expect(cmpRes.status).toBe(200);
    const companyId = cmpRes.body.data.company.id as string;

    const shwRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/showrooms',
      token: superAdmin.idToken,
      body: {
        companyId,
        name: 'Tata Motors Lucknow Flagship',
        dealerCode: 'TATA-LKO-EMU',
        city: 'Lucknow',
        stateCode: 'UP',
        address: 'Hazratganj, Lucknow',
        contactPhone: '+915224001122',
        contactEmail: 'lko@tata.example'
      }
    });
    expect(shwRes.status).toBe(200);
    const showroomId = shwRes.body.data.id as string;

    const medAuthRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/authorities',
      token: superAdmin.idToken,
      body: {
        name: 'Lucknow Emergency Medical Command',
        registrationNumber: 'GOV-UP-MED-EMU',
        department: 'MEDICAL',
        jurisdictionState: 'UP',
        jurisdictionDistrict: 'Lucknow',
        jurisdictionCode: 'IN-UP-LKO',
        contactControlRoomPhone: '+91522108108',
        contactEmail: 'ems@up.gov.example'
      }
    });
    expect(medAuthRes.status).toBe(200);
    const medAuthorityId = medAuthRes.body.data.id as string;

    const roadAuthRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/authorities',
      token: superAdmin.idToken,
      body: {
        name: 'NHAI Lucknow Highway Authority',
        registrationNumber: 'GOV-UP-ROAD-EMU',
        department: 'ROAD',
        jurisdictionState: 'UP',
        jurisdictionDistrict: 'Lucknow',
        jurisdictionCode: 'IN-UP-LKO',
        contactControlRoomPhone: '+91522103310',
        contactEmail: 'nhai@up.gov.example'
      }
    });
    expect(roadAuthRes.status).toBe(200);
    const roadAuthorityId = roadAuthRes.body.data.id as string;

    // Seed Showroom Staff, Medical Officer, and Road Officer
    const showroomStaff = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_staff_e2e',
      phoneE164: '+919200000002',
      primaryRole: USER_ROLES.SHOWROOM_STAFF,
      tier: 'DEALER',
      scopedRole: {
        userId: 'usr_staff_e2e',
        role: USER_ROLES.SHOWROOM_STAFF,
        scopeType: 'SHOWROOM',
        scopeId: showroomId,
        companyId,
        showroomId,
        status: 'ACTIVE',
        grantedBy: superAdmin.userDoc.uid
      }
    });

    const medOfficer = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_med_e2e',
      phoneE164: '+919200000003',
      primaryRole: USER_ROLES.AUTHORITY_MEDICAL,
      tier: 'AUTHORITY',
      scopedRole: {
        userId: 'usr_med_e2e',
        role: USER_ROLES.AUTHORITY_MEDICAL,
        scopeType: 'AUTHORITY',
        scopeId: medAuthorityId,
        authorityId: medAuthorityId,
        department: 'MEDICAL',
        jurisdictionCode: 'IN-UP-LKO',
        status: 'ACTIVE',
        grantedBy: superAdmin.userDoc.uid
      }
    });

    const roadOfficer = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_road_e2e',
      phoneE164: '+919200000004',
      primaryRole: USER_ROLES.AUTHORITY_ROAD,
      tier: 'AUTHORITY',
      scopedRole: {
        userId: 'usr_road_e2e',
        role: USER_ROLES.AUTHORITY_ROAD,
        scopeType: 'AUTHORITY',
        scopeId: roadAuthorityId,
        authorityId: roadAuthorityId,
        department: 'ROAD',
        jurisdictionCode: 'IN-UP-LKO',
        status: 'ACTIVE',
        grantedBy: superAdmin.userDoc.uid
      }
    });

    // 2. Provision STM32U575 Device & Rotate Key
    const provRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: superAdmin.idToken,
      body: {
        serialNumber: 'VX-STM32U575-E2E1',
        imei: '359881234569001',
        simIccid: '8991101200003209001',
        firmwareVersion: '2.2.0',
        allocatedCompanyId: companyId,
        allocatedShowroomId: showroomId
      }
    });
    expect(provRes.status).toBe(200);
    const deviceId = provRes.body.data.device.id as string;

    const rotateRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${deviceId}/rotate-key`,
      token: superAdmin.idToken,
      body: { reason: 'Initial key rotation verification on emulator' }
    });
    expect(rotateRes.status).toBe(200);
    const activeSecretHex = rotateRes.body.data
      .oneTimeNewHmacSecretHex as string;

    // 3. Showroom verifies customer OTP & registers vehicle
    const ownerPhone = '+919200000010';
    const otpVerifyReq = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/request-otp',
      body: {
        phoneE164: ownerPhone,
        purpose: 'SHOWROOM_CUSTOMER_VERIFY'
      }
    });
    expect(otpVerifyReq.status).toBe(200);

    const { services } = createVeerXcapeExpressApp(runtime);
    await services.authService.verifyOtpChallenge({
      phoneE164: ownerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: otpVerifyReq.body.data.demoOtpForTestingOnly
    });

    const regRes = await requestJson({
      method: 'POST',
      path: '/api/v1/dealer/vehicles/register',
      token: showroomStaff.idToken,
      body: {
        showroomId,
        registrationNumber: 'UP32EM1001',
        vin: 'MA3EUA61S00881001',
        manufacturer: 'Tata Motors',
        model: 'Nexon EV',
        variant: 'Empowered+ LR',
        manufacturingYear: 2026,
        color: 'White',
        fuelType: 'EV',
        customerFullName: 'Kabir Verma',
        customerPhoneE164: ownerPhone,
        customerEmail: 'kabir@example.com',
        customerOtpChallengeId: otpVerifyReq.body.data.challengeId,
        assignedDeviceSerial: 'VX-STM32U575-E2E1'
      }
    });
    expect(regRes.status).toBe(200);
    const vehicleId = regRes.body.data.vehicle.id as string;

    // 4. Customer activates account via OTP + password and signs in via /api/v1/auth/login-phone
    const actOtpReq = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/request-otp',
      body: {
        phoneE164: ownerPhone,
        purpose: 'CUSTOMER_ACTIVATION'
      }
    });
    const actRes = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/activate-account',
      body: {
        phoneE164: ownerPhone,
        otpCode: actOtpReq.body.data.demoOtpForTestingOnly,
        newPassword: 'KabirStrongPassword99'
      }
    });
    expect(actRes.status).toBe(200);

    const loginRes = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/login-phone',
      body: {
        phoneE164: ownerPhone,
        password: 'KabirStrongPassword99'
      }
    });
    expect(loginRes.status).toBe(200);
    const ownerIdToken = await exchangeCustomTokenForIdToken(
      loginRes.body.data.customToken
    );

    // 5. Owner invites Family Member, Family Member activates, and Owner assigns Driver
    const familyPhone = '+919200000011';
    const inviteRes = await requestJson({
      method: 'POST',
      path: '/api/v1/mobile/family/invite',
      token: ownerIdToken,
      body: {
        vehicleId,
        familyMemberName: 'Ananya Verma',
        familyMemberPhoneE164: familyPhone,
        relationship: 'Spouse',
        initialPassword: 'TempFamilyPassword88',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      }
    });
    expect(inviteRes.status).toBe(200);
    const membershipId = inviteRes.body.data.membership.id as string;

    const famOtpReq = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/request-otp',
      body: {
        phoneE164: familyPhone,
        purpose: 'FAMILY_ACTIVATION'
      }
    });
    const famActRes = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/activate-family',
      body: {
        phoneE164: familyPhone,
        otpCode: famOtpReq.body.data.demoOtpForTestingOnly,
        initialPassword: 'TempFamilyPassword88',
        newPermanentPassword: 'AnanyaPermanentPassword99'
      }
    });
    expect(famActRes.status).toBe(200);
    const familyIdToken = await exchangeCustomTokenForIdToken(
      famActRes.body.data.customToken
    );

    const driverAssignRes = await requestJson({
      method: 'POST',
      path: '/api/v1/mobile/drivers/assign',
      token: ownerIdToken,
      body: {
        vehicleId,
        driverPhoneE164: '+919200000012',
        driverFullName: 'Ramesh Kumar',
        action: 'ASSIGN'
      }
    });
    expect(driverAssignRes.status).toBe(200);

    // 6. STM32U575 Device ingests Heartbeat (seq 1), Telemetry (seq 2), and Crash Event (seq 3)
    const nowMs = Date.now();
    const hbBody = JSON.stringify({
      mcuUptimeSeconds: 1800,
      powerSource: 'VEHICLE_12V',
      backupBatteryPercent: 99,
      batteryVoltageMv: 13800,
      cellularRssiDbm: -65,
      gnssFixStatus: 'FIX_3D',
      firmwareVersion: '2.2.0'
    });
    const hbSig = computeStm32HmacSignature({
      deviceSecretKeyHex: activeSecretHex,
      serialNumber: 'VX-STM32U575-E2E1',
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/heartbeat',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 1,
      rawBody: hbBody
    });
    const hbRes = await requestJson({
      method: 'POST',
      path: '/api/v1/iot/heartbeat',
      headers: {
        'x-device-serial': 'VX-STM32U575-E2E1',
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '1',
        'x-device-signature': hbSig
      },
      body: hbBody
    });
    expect(hbRes.status).toBe(200);

    const telBody = JSON.stringify({
      isSimulated: false,
      gnss: {
        lat: 26.8467,
        lng: 80.9462,
        accuracyMeters: 2.5,
        speedKmh: 64,
        heading: 180,
        recordedAt: new Date(nowMs).toISOString()
      },
      imu: {
        accelXg: 0.01,
        accelYg: 0.02,
        accelZg: 0.99,
        peakImpactG: 1.0,
        tiltDegrees: 0.8
      },
      cabin: {
        occupantDetected: true,
        cabinTempCelsius: 25.0,
        smokeDetected: false,
        coPpm: 3
      },
      vehicleBus: {
        ignitionOn: true,
        doorsLocked: true,
        windowsClosed: true
      },
      power: {
        mainVoltageMv: 13900,
        backupBatteryPercent: 99,
        powerSource: 'VEHICLE_12V'
      }
    });
    const telSig = computeStm32HmacSignature({
      deviceSecretKeyHex: activeSecretHex,
      serialNumber: 'VX-STM32U575-E2E1',
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/telemetry',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 2,
      rawBody: telBody
    });
    const telRes = await requestJson({
      method: 'POST',
      path: '/api/v1/iot/telemetry',
      headers: {
        'x-device-serial': 'VX-STM32U575-E2E1',
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '2',
        'x-device-signature': telSig
      },
      body: telBody
    });
    expect(telRes.status).toBe(200);
    expect(telRes.body.data.liveStatusSummary.connectionStatus).toBe(
      LOCATION_FRESHNESS_STATES.LIVE
    );

    // Simulate transient FCM failure during crash event so we can also test notification retry
    runtime.setFcmBehavior('RETRYABLE_FAIL');
    const evBody = JSON.stringify({
      events: [
        {
          idempotencyKey: 'emu_crash_evt_001',
          eventSequenceNumber: 3,
          occurredAt: new Date(nowMs).toISOString(),
          offlineRetry: false,
          isSimulated: false,
          incidentType: INCIDENT_TYPES.ACCIDENT_DETECTED,
          severity: 'CRITICAL',
          confidenceScore: 0.99,
          location: {
            lat: 26.8467,
            lng: 80.9462,
            accuracyMeters: 3.0,
            roadSegmentSummary: 'Hazratganj Flyover KM 2, Lucknow',
            jurisdictionCode: 'IN-UP-LKO'
          },
          environmentalSnapshot: {
            peakImpactG: 7.4,
            cabinTempCelsius: 27.0,
            occupantDetected: true
          }
        }
      ]
    });
    const evSig = computeStm32HmacSignature({
      deviceSecretKeyHex: activeSecretHex,
      serialNumber: 'VX-STM32U575-E2E1',
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/events',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 3,
      rawBody: evBody
    });
    const evRes = await requestJson({
      method: 'POST',
      path: '/api/v1/iot/events',
      headers: {
        'x-device-serial': 'VX-STM32U575-E2E1',
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '3',
        'x-device-signature': evSig
      },
      body: evBody
    });
    expect(evRes.status).toBe(200);
    expect(evRes.body.data.processedCount).toBe(1);
    const incidentId = evRes.body.data.incidentIds[0] as string;

    // Restore FCM behavior to ACCEPT and retry failed notification via Admin endpoint
    runtime.setFcmBehavior('ACCEPT');
    const failedNotifs = await runtime.listDocs<NotificationDocument>(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      {
        where: [
          {
            field: 'status',
            op: '==',
            value: NOTIFICATION_STATUSES.FAILED_RETRYABLE
          }
        ]
      }
    );
    expect(failedNotifs.length).toBeGreaterThanOrEqual(1);

    const retryNotifRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/notifications/${failedNotifs[0]!.id}/retry`,
      token: superAdmin.idToken
    });
    expect(retryNotifRes.status).toBe(200);
    expect(retryNotifRes.body.data.status).toBe(
      NOTIFICATION_STATUSES.FCM_ACCEPTED
    );

    // 7. Medical Authority acknowledges & Road Authority receives strictly anonymized payload
    const medUpdateRes = await requestJson({
      method: 'POST',
      path: `/api/v1/authority/${medAuthorityId}/incidents/update`,
      token: medOfficer.idToken,
      body: {
        incidentId,
        newState: 'AUTHORITY_ACKNOWLEDGED',
        assignedOfficerName: 'Dr. S. Kapoor',
        dispatchReferenceCode: 'EMS-UP32-108',
        note: 'Trauma ambulance dispatched to Hazratganj Flyover',
        visibility: 'ALL_AUTHORIZED'
      }
    });
    expect(medUpdateRes.status).toBe(200);

    const roadInspectRes = await requestJson({
      method: 'GET',
      path: `/api/v1/authority/${roadAuthorityId}/incidents/${incidentId}`,
      token: roadOfficer.idToken
    });
    expect(roadInspectRes.status).toBe(200);
    const roadSerialized = JSON.stringify(roadInspectRes.body.data);
    expect(roadSerialized).not.toContain('UP32EM1001');
    expect(roadSerialized).not.toContain('MA3EUA61S00881001');
    expect(roadSerialized).not.toContain(ownerPhone);

    // 8. Verify incidentEvents history in real Firestore Emulator
    const incidentEvents = await runtime.listDocs<IncidentEventDocument>(
      FIRESTORE_COLLECTIONS.INCIDENT_EVENTS,
      {
        where: [{ field: 'incidentId', op: '==', value: incidentId }],
        orderBy: [{ field: 'occurredAt', direction: 'asc' }]
      }
    );
    expect(incidentEvents).toHaveLength(2);
    expect(incidentEvents[0]!.eventType).toBe('INCIDENT_REPORTED');
    expect(incidentEvents[1]!.eventType).toBe('STATUS_TRANSITION');

    // 9. Revoke Family Member access -> family member's existing ID token is immediately rejected
    const revokeFamRes = await requestJson({
      method: 'PATCH',
      path: `/api/v1/mobile/family/${membershipId}`,
      token: ownerIdToken,
      body: { action: 'REVOKE' }
    });
    expect(revokeFamRes.status).toBe(200);

    const famDashAfterRevoke = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: familyIdToken
    });
    expect([401, 403]).toContain(famDashAfterRevoke.status);

    // 10. Revoke Device & verify SHA-256 audit log chain integrity
    const revokeDevRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${deviceId}/revoke`,
      token: superAdmin.idToken,
      body: { reason: 'End of E2E test hardware decommission' }
    });
    expect(revokeDevRes.status).toBe(200);
    expect(revokeDevRes.body.data.status).toBe('REVOKED');

    const auditVerifyRes = await requestJson({
      method: 'GET',
      path: '/api/v1/admin/audit-logs/verify',
      token: superAdmin.idToken
    });
    expect(auditVerifyRes.status).toBe(200);
    expect(auditVerifyRes.body.data.valid).toBe(true);
    expect(auditVerifyRes.body.data.totalEntries).toBeGreaterThanOrEqual(12);
  });

  it('3. Section 5: verifies native Firestore queries, composite ordering, cursor pagination, empty collections, and deleted-record handling on the real emulator', async () => {
    // 1. Empty collection query behaviour
    const emptyPage = await runtime.queryDocsPaginated<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      {
        where: [{ field: 'registeredByShowroomId', op: '==', value: 'shw_none' }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 3
      }
    );
    expect(emptyPage.items).toEqual([]);
    expect(emptyPage.hasMore).toBe(false);
    expect(emptyPage.nextCursorDocId).toBeNull();

    // 2. Seed 7 vehicles in Showroom S1 and 2 vehicles in Showroom S2 with deterministic descending timestamps
    for (let i = 1; i <= 7; i++) {
      const ts = new Date(Date.parse('2026-11-05T10:00:00.000Z') + i * 1000).toISOString();
      const veh: VehicleDocument = {
        id: `veh_page_${i}`,
        registrationNumber: `UP32PG000${i}`,
        vin: `MA3EUA61S0077000${i}`,
        manufacturer: 'Tata Motors',
        model: 'Curvv EV',
        variant: 'LR',
        manufacturingYear: 2026,
        color: 'Grey',
        fuelType: 'EV',
        companyId: 'cmp_page',
        registeredByShowroomId: 'shw_page_1',
        registeredByStaffId: 'usr_staff',
        primaryOwnerId: 'usr_owner',
        registrationStatus: 'ACTIVE',
        registrationHistory: [],
        liveStatusSummary: { connectionStatus: 'LIVE' },
        createdAt: ts,
        updatedAt: ts
      };
      await runtime.setDoc(FIRESTORE_COLLECTIONS.VEHICLES, veh.id, veh);
    }

    for (let i = 1; i <= 2; i++) {
      const ts = new Date(Date.parse('2026-11-05T11:00:00.000Z') + i * 1000).toISOString();
      const veh: VehicleDocument = {
        id: `veh_other_${i}`,
        registrationNumber: `DL01OT000${i}`,
        vin: `MA3EUA61S0099000${i}`,
        manufacturer: 'Tata Motors',
        model: 'Punch EV',
        variant: 'MR',
        manufacturingYear: 2026,
        color: 'Blue',
        fuelType: 'EV',
        companyId: 'cmp_page',
        registeredByShowroomId: 'shw_page_2',
        registeredByStaffId: 'usr_staff',
        primaryOwnerId: 'usr_owner',
        registrationStatus: 'ACTIVE',
        registrationHistory: [],
        liveStatusSummary: { connectionStatus: 'LIVE' },
        createdAt: ts,
        updatedAt: ts
      };
      await runtime.setDoc(FIRESTORE_COLLECTIONS.VEHICLES, veh.id, veh);
    }

    // 3. Walk all 3 pages (limit=3) for shw_page_1 ordered by createdAt desc
    const page1 = await runtime.queryDocsPaginated<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      {
        where: [
          { field: 'registeredByShowroomId', op: '==', value: 'shw_page_1' }
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 3
      }
    );
    expect(page1.items.map((v) => v.id)).toEqual([
      'veh_page_7',
      'veh_page_6',
      'veh_page_5'
    ]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursorDocId).toBe('veh_page_5');

    const page2 = await runtime.queryDocsPaginated<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      {
        where: [
          { field: 'registeredByShowroomId', op: '==', value: 'shw_page_1' }
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 3,
        startAfterDocId: page1.nextCursorDocId!
      }
    );
    expect(page2.items.map((v) => v.id)).toEqual([
      'veh_page_4',
      'veh_page_3',
      'veh_page_2'
    ]);
    expect(page2.hasMore).toBe(true);
    expect(page2.nextCursorDocId).toBe('veh_page_2');

    const page3 = await runtime.queryDocsPaginated<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      {
        where: [
          { field: 'registeredByShowroomId', op: '==', value: 'shw_page_1' }
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 3,
        startAfterDocId: page2.nextCursorDocId!
      }
    );
    expect(page3.items.map((v) => v.id)).toEqual(['veh_page_1']);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursorDocId).toBeNull();

    // Verify zero duplicate or missing records across all pages
    const combinedIds = [
      ...page1.items.map((v) => v.id),
      ...page2.items.map((v) => v.id),
      ...page3.items.map((v) => v.id)
    ];
    expect(new Set(combinedIds).size).toBe(7);

    // 4. Delete veh_page_4 in Firestore and verify re-querying excludes the deleted record cleanly
    await admin
      .firestore()
      .collection(FIRESTORE_COLLECTIONS.VEHICLES)
      .doc('veh_page_4')
      .delete();

    const page2AfterDelete = await runtime.queryDocsPaginated<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      {
        where: [
          { field: 'registeredByShowroomId', op: '==', value: 'shw_page_1' }
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 3,
        startAfterDocId: 'veh_page_5'
      }
    );
    expect(page2AfterDelete.items.map((v) => v.id)).toEqual([
      'veh_page_3',
      'veh_page_2',
      'veh_page_1'
    ]);
    expect(page2AfterDelete.hasMore).toBe(false);
  });

  it('4. Section 6: verifies concurrent unique vehicle registration, concurrent device provisioning, incident idempotency, replay protection, and audit hash-chain tamper detection', async () => {
    const superAdmin = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_super_conc',
      phoneE164: '+919300000001',
      primaryRole: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
      tier: 'ADMIN',
      scopedRole: {
        userId: 'usr_super_conc',
        role: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
        scopeType: 'PLATFORM',
        scopeId: 'PLATFORM',
        status: 'ACTIVE',
        grantedBy: 'SYSTEM'
      }
    });

    const cmpRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/companies',
      token: superAdmin.idToken,
      body: {
        brandName: 'Hyundai India',
        oemCode: 'HYUN',
        registrationNumber: 'CIN-HYUN-CONC',
        headquartersAddress: 'Gurugram, HR',
        contactEmail: 'oem@hyundai.example',
        contactPhone: '+911244001122'
      }
    });
    const companyId = cmpRes.body.data.company.id as string;

    const shwRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/showrooms',
      token: superAdmin.idToken,
      body: {
        companyId,
        name: 'Hyundai Lucknow',
        dealerCode: 'HYU-LKO-01',
        city: 'Lucknow',
        stateCode: 'UP',
        address: 'Gomti Nagar, Lucknow',
        contactPhone: '+915224009988',
        contactEmail: 'lko@hyundai.example'
      }
    });
    const showroomId = shwRes.body.data.id as string;

    const staff = await seedEmulatorUserAndGetIdToken({
      uid: 'usr_staff_conc',
      phoneE164: '+919300000002',
      primaryRole: USER_ROLES.SHOWROOM_STAFF,
      tier: 'DEALER',
      scopedRole: {
        userId: 'usr_staff_conc',
        role: USER_ROLES.SHOWROOM_STAFF,
        scopeType: 'SHOWROOM',
        scopeId: showroomId,
        companyId,
        showroomId,
        status: 'ACTIVE',
        grantedBy: superAdmin.userDoc.uid
      }
    });

    // 1. Concurrent device provisioning with the exact same serialNumber -> exactly 1 succeeds (200) and 1 fails (409 CONFLICT)
    const concurrentProvisionPayload = {
      serialNumber: 'VX-STM32U575-CONC1',
      imei: '359881234567771',
      simIccid: '8991101200003207771',
      firmwareVersion: '2.2.0',
      allocatedCompanyId: companyId,
      allocatedShowroomId: showroomId
    };
    const [provA, provB] = await Promise.all([
      requestJson({
        method: 'POST',
        path: '/api/v1/admin/devices/provision',
        token: superAdmin.idToken,
        body: concurrentProvisionPayload
      }),
      requestJson({
        method: 'POST',
        path: '/api/v1/admin/devices/provision',
        token: superAdmin.idToken,
        body: concurrentProvisionPayload
      })
    ]);
    const provStatuses = [provA.status, provB.status].sort();
    expect(provStatuses).toEqual([200, 409]);

    const winningProv = provA.status === 200 ? provA : provB;
    const deviceSecretHex = winningProv.body.data
      .oneTimeProvisioningHmacSecretHex as string;

    // Provision a second distinct device so two concurrent vehicle registrations have valid hardware serials
    await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: superAdmin.idToken,
      body: {
        serialNumber: 'VX-STM32U575-CONC2',
        imei: '359881234567772',
        simIccid: '8991101200003207772',
        firmwareVersion: '2.2.0',
        allocatedCompanyId: companyId,
        allocatedShowroomId: showroomId
      }
    });

    // 2. Concurrent vehicle registration with the exact same registrationNumber & VIN -> 1 succeeds (200), 1 fails (409 CONFLICT)
    const { services } = createVeerXcapeExpressApp(runtime);
    const custPhone = '+919300000010';
    const otp1 = await services.authService.requestOtp({
      phoneE164: custPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY'
    });
    await services.authService.verifyOtpChallenge({
      phoneE164: custPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: otp1.demoOtpForTestingOnly!
    });

    const [regA, regB] = await Promise.all([
      requestJson({
        method: 'POST',
        path: '/api/v1/dealer/vehicles/register',
        token: staff.idToken,
        body: {
          showroomId,
          registrationNumber: 'UP32CN0001',
          vin: 'MA3EUA61S00660001',
          manufacturer: 'Hyundai',
          model: 'Ioniq 5',
          variant: 'RWD',
          manufacturingYear: 2026,
          color: 'Gold',
          fuelType: 'EV',
          customerFullName: 'Concurrent Owner',
          customerPhoneE164: custPhone,
          customerOtpChallengeId: otp1.challengeId,
          assignedDeviceSerial: 'VX-STM32U575-CONC1'
        }
      }),
      requestJson({
        method: 'POST',
        path: '/api/v1/dealer/vehicles/register',
        token: staff.idToken,
        body: {
          showroomId,
          registrationNumber: 'UP32CN0001',
          vin: 'MA3EUA61S00660001',
          manufacturer: 'Hyundai',
          model: 'Ioniq 5',
          variant: 'RWD',
          manufacturingYear: 2026,
          color: 'Gold',
          fuelType: 'EV',
          customerFullName: 'Concurrent Owner',
          customerPhoneE164: custPhone,
          customerOtpChallengeId: otp1.challengeId,
          assignedDeviceSerial: 'VX-STM32U575-CONC2'
        }
      })
    ]);
    const regStatuses = [regA.status, regB.status].sort();
    expect(regStatuses).toEqual([200, 409]);

    const winningReg = regA.status === 200 ? regA : regB;
    const winningVehicle = winningReg.body.data.vehicle as VehicleDocument;
    expect(winningVehicle.registrationNumber).toBe('UP32CN0001');

    // 3. Duplicate incident submission (idempotency) & STM32 replay protection
    const boundDeviceId = winningReg.body.data.deviceAssignment
      .deviceId as string;
    const rotateBound = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${boundDeviceId}/rotate-key`,
      token: superAdmin.idToken,
      body: { reason: 'Sync active key for idempotency & replay test' }
    });
    const boundSerial = rotateBound.body.data.device.serialNumber as string;
    const boundSecretHex = rotateBound.body.data
      .oneTimeNewHmacSecretHex as string;

    const nowMs = Date.now();
    const makeEventsReq = async (seq: number, idemKey: string) => {
      const bodyStr = JSON.stringify({
        events: [
          {
            idempotencyKey: idemKey,
            eventSequenceNumber: seq,
            occurredAt: new Date(nowMs).toISOString(),
            offlineRetry: true,
            isSimulated: false,
            incidentType: INCIDENT_TYPES.ACCIDENT_DETECTED,
            severity: 'CRITICAL',
            confidenceScore: 0.98,
            location: {
              lat: 26.85,
              lng: 80.95,
              accuracyMeters: 4,
              roadSegmentSummary: 'Gomti Nagar Bypass',
              jurisdictionCode: 'IN-UP-LKO'
            }
          }
        ]
      });
      const sig = computeStm32HmacSignature({
        deviceSecretKeyHex: boundSecretHex,
        serialNumber: boundSerial,
        httpMethod: 'POST',
        requestPath: '/api/v1/iot/events',
        deviceTimestampMs: nowMs,
        transmissionTimestampMs: nowMs,
        sequenceNumber: seq,
        rawBody: bodyStr
      });
      return requestJson({
        method: 'POST',
        path: '/api/v1/iot/events',
        headers: {
          'x-device-serial': boundSerial,
          'x-device-timestamp': String(nowMs),
          'x-transmission-timestamp': String(nowMs),
          'x-device-sequence': String(seq),
          'x-device-signature': sig
        },
        body: bodyStr
      });
    };

    // First submission (sequence 10, idempotencyKey 'idem_dup_test_01') -> processedCount: 1
    const firstEv = await makeEventsReq(10, 'idem_dup_test_01');
    expect(firstEv.status).toBe(200);
    expect(firstEv.body.data.processedCount).toBe(1);
    expect(firstEv.body.data.duplicateCount).toBe(0);

    // Second submission with new packet sequence 11 but SAME idempotencyKey 'idem_dup_test_01' -> deduplicated!
    const dupEv = await makeEventsReq(11, 'idem_dup_test_01');
    expect(dupEv.status).toBe(200);
    expect(dupEv.body.data.processedCount).toBe(0);
    expect(dupEv.body.data.duplicateCount).toBe(1);

    // Replay attack with already-used sequence number 10 -> rejected with 409 REPLAY_DETECTED
    const replayEv = await makeEventsReq(10, 'idem_new_key_02');
    expect(replayEv.status).toBe(409);
    expect(replayEv.body.error?.code).toBe('REPLAY_DETECTED');

    // 4. Audit hash-chain verification & tamper detection against real Firestore records
    const allLogs = await runtime.listDocs<AuditLogDocument>(
      FIRESTORE_COLLECTIONS.AUDIT_LOGS,
      { orderBy: [{ field: 'sequenceIndex', direction: 'asc' }] }
    );
    expect(allLogs.length).toBeGreaterThanOrEqual(5);
    expect(verifyAuditChainIntegrity(allLogs).valid).toBe(true);

    // Tamper with a middle audit log entry in memory and verify tamper detection flags the exact sequenceIndex
    const tamperedLogs = allLogs.map((entry, idx) =>
      idx === 1 ? { ...entry, action: 'TAMPERED_ACTION' } : entry
    );
    const tamperResult = verifyAuditChainIntegrity(tamperedLogs);
    expect(tamperResult.valid).toBe(false);
    expect(tamperResult.brokenAtSequenceIndex).toBe(allLogs[1]!.sequenceIndex);
  });
});
