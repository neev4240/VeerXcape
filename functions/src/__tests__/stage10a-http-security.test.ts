import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DOMAIN_COLLECTIONS,
  FIRESTORE_COLLECTIONS,
  INCIDENT_TYPES,
  SERVER_ONLY_COLLECTIONS,
  USER_ROLES
} from '@veerxcape/shared-constants';
import { computeStm32HmacSignature } from '@veerxcape/shared-services';
import type {
  CompanyDocument,
  GovernmentAuthorityDocument,
  IncidentEventDocument,
  NotificationDocument,
  ShowroomDocument,
  UserDocument,
  UserRoleDocument
} from '@veerxcape/shared-types';
import { createVeerXcapeExpressApp } from '../app.js';
import { createInMemoryTestRuntime } from '../shared/runtime.js';

interface TestApiResponse<T = any> {
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

describe('Stage 10A — HTTP Security Hardening, Admin API Completion, Schema & Query Verification', () => {
  let runtime: ReturnType<typeof createInMemoryTestRuntime>;
  let server: http.Server;
  let baseUrl: string;

  const tokens = {
    superAdmin: '',
    opsAdmin: '',
    supportAdmin: '',
    customerOwner: '',
    familyMember: '',
    driver: '',
    showroomStaffA: '',
    companyAdminA: '',
    authorityMedical: ''
  };

  async function seedUserWithRole(params: {
    uid: string;
    phoneE164: string;
    primaryRole: UserDocument['primaryRole'];
    tier: 'CUSTOMER' | 'DEALER' | 'AUTHORITY' | 'ADMIN';
    sessionVersion?: number;
    scopedRole?: Omit<UserRoleDocument, 'id' | 'createdAt'>;
  }): Promise<{ userDoc: UserDocument; bearerToken: string }> {
    const nowIso = runtime.now().toISOString();
    const sessionVersion = params.sessionVersion ?? 1;
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

    const bearerToken = await runtime.auth.createCustomToken(params.uid, {
      sv: sessionVersion,
      tier: params.tier
    });

    return { userDoc, bearerToken };
  }

  async function requestJson<T = any>(params: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    token?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<TestApiResponse<T>> {
    const reqHeaders: Record<string, string> = {
      ...(params.headers ?? {})
    };
    if (params.token) {
      reqHeaders.Authorization = `Bearer ${params.token}`;
    }
    let bodyStr: string | undefined;
    if (params.body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
      bodyStr =
        typeof params.body === 'string'
          ? params.body
          : JSON.stringify(params.body);
    }

    const res = await fetch(`${baseUrl}${params.path}`, {
      method: params.method,
      headers: reqHeaders,
      ...(bodyStr !== undefined ? { body: bodyStr } : {})
    });

    const json = (await res.json()) as TestApiResponse<T>['body'];
    return {
      status: res.status,
      body: json
    };
  }

  beforeEach(async () => {
    runtime = createInMemoryTestRuntime();
    const { app } = createVeerXcapeExpressApp(runtime);
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Seed all role identities
    tokens.superAdmin = (
      await seedUserWithRole({
        uid: 'usr_super_admin',
        phoneE164: '+919000000001',
        primaryRole: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
        tier: 'ADMIN',
        scopedRole: {
          userId: 'usr_super_admin',
          role: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE',
          grantedBy: 'SYSTEM'
        }
      })
    ).bearerToken;

    tokens.opsAdmin = (
      await seedUserWithRole({
        uid: 'usr_ops_admin',
        phoneE164: '+919000000002',
        primaryRole: USER_ROLES.VEERXCAPE_ADMIN,
        tier: 'ADMIN',
        scopedRole: {
          userId: 'usr_ops_admin',
          role: USER_ROLES.VEERXCAPE_ADMIN,
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE',
          grantedBy: 'usr_super_admin'
        }
      })
    ).bearerToken;

    tokens.supportAdmin = (
      await seedUserWithRole({
        uid: 'usr_support_admin',
        phoneE164: '+919000000003',
        primaryRole: USER_ROLES.VEERXCAPE_SUPPORT,
        tier: 'ADMIN',
        scopedRole: {
          userId: 'usr_support_admin',
          role: USER_ROLES.VEERXCAPE_SUPPORT,
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE',
          grantedBy: 'usr_super_admin'
        }
      })
    ).bearerToken;

    tokens.customerOwner = (
      await seedUserWithRole({
        uid: 'usr_customer_owner',
        phoneE164: '+919000000004',
        primaryRole: USER_ROLES.VEHICLE_OWNER,
        tier: 'CUSTOMER'
      })
    ).bearerToken;

    tokens.familyMember = (
      await seedUserWithRole({
        uid: 'usr_family_member',
        phoneE164: '+919000000005',
        primaryRole: USER_ROLES.FAMILY_MEMBER,
        tier: 'CUSTOMER'
      })
    ).bearerToken;

    tokens.driver = (
      await seedUserWithRole({
        uid: 'usr_driver',
        phoneE164: '+919000000006',
        primaryRole: USER_ROLES.DRIVER,
        tier: 'CUSTOMER'
      })
    ).bearerToken;

    // Create OEM Company A & Showroom A & Medical Authority via HTTP as Super Admin
    const companyARes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/companies',
      token: tokens.superAdmin,
      body: {
        brandName: 'Tata Motors',
        oemCode: 'TATA',
        registrationNumber: 'CIN-TATA-2026',
        headquartersAddress: 'Mumbai, Maharashtra, India',
        contactEmail: 'oem@tatamotors.example',
        contactPhone: '+912266658282'
      }
    });
    expect(companyARes.status).toBe(200);
    const companyAId = companyARes.body.data.company.id as string;

    const showroomARes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/showrooms',
      token: tokens.superAdmin,
      body: {
        companyId: companyAId,
        name: 'Tata Lucknow Central',
        dealerCode: 'TATA-LKO-01',
        city: 'Lucknow',
        stateCode: 'UP',
        address: 'Hazratganj Main Road, Lucknow',
        contactPhone: '+915222223333',
        contactEmail: 'lko@tatadealer.example'
      }
    });
    expect(showroomARes.status).toBe(200);
    const showroomAId = showroomARes.body.data.id as string;

    const authorityMedRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/authorities',
      token: tokens.superAdmin,
      body: {
        name: 'Lucknow Emergency Medical Command',
        registrationNumber: 'GOV-UP-MED-108',
        department: 'MEDICAL',
        jurisdictionState: 'UP',
        jurisdictionDistrict: 'Lucknow',
        jurisdictionCode: 'IN-UP-LKO',
        contactControlRoomPhone: '+915221081088',
        contactEmail: 'ems@up.gov.example'
      }
    });
    expect(authorityMedRes.status).toBe(200);
    const authorityMedId = authorityMedRes.body.data.id as string;

    tokens.showroomStaffA = (
      await seedUserWithRole({
        uid: 'usr_showroom_staff_a',
        phoneE164: '+919000000007',
        primaryRole: USER_ROLES.SHOWROOM_STAFF,
        tier: 'DEALER',
        scopedRole: {
          userId: 'usr_showroom_staff_a',
          role: USER_ROLES.SHOWROOM_STAFF,
          scopeType: 'SHOWROOM',
          scopeId: showroomAId,
          companyId: companyAId,
          showroomId: showroomAId,
          status: 'ACTIVE',
          grantedBy: 'usr_super_admin'
        }
      })
    ).bearerToken;

    tokens.companyAdminA = (
      await seedUserWithRole({
        uid: 'usr_company_admin_a',
        phoneE164: '+919000000008',
        primaryRole: USER_ROLES.COMPANY_ADMIN,
        tier: 'DEALER',
        scopedRole: {
          userId: 'usr_company_admin_a',
          role: USER_ROLES.COMPANY_ADMIN,
          scopeType: 'COMPANY',
          scopeId: companyAId,
          companyId: companyAId,
          status: 'ACTIVE',
          grantedBy: 'usr_super_admin'
        }
      })
    ).bearerToken;

    tokens.authorityMedical = (
      await seedUserWithRole({
        uid: 'usr_authority_medical',
        phoneE164: '+919000000009',
        primaryRole: USER_ROLES.AUTHORITY_MEDICAL,
        tier: 'AUTHORITY',
        scopedRole: {
          userId: 'usr_authority_medical',
          role: USER_ROLES.AUTHORITY_MEDICAL,
          scopeType: 'AUTHORITY',
          scopeId: authorityMedId,
          authorityId: authorityMedId,
          jurisdictionCode: 'IN-UP-LKO',
          status: 'ACTIVE',
          grantedBy: 'usr_super_admin'
        }
      })
    ).bearerToken;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('Task 1: enforces strict server-side role authorization on POST /api/v1/admin/devices/provision across all 8 role cases', async () => {
    const companies = await runtime.listDocs<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES
    );
    const showrooms = await runtime.listDocs<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS
    );
    const allocatedCompanyId = companies[0]!.id;
    const allocatedShowroomId = showrooms[0]!.id;

    const makeProvisionPayload = (suffix: string) => ({
      serialNumber: `VX-STM32U575-${suffix}`,
      imei: `35988123456${suffix}`,
      simIccid: `899110120000320${suffix}`,
      firmwareVersion: '2.1.0-stm32u575',
      allocatedCompanyId,
      allocatedShowroomId
    });

    // 1. Unauthenticated request -> 401
    const unauthRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      body: makeProvisionPayload('0101')
    });
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.success).toBe(false);
    expect(unauthRes.body.error?.code).toBe('UNAUTHORIZED');

    // 2. Ordinary customer (VEHICLE_OWNER) -> 403
    const customerRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.customerOwner,
      body: makeProvisionPayload('0102')
    });
    expect(customerRes.status).toBe(403);
    expect(customerRes.body.error?.code).toBe('FORBIDDEN');

    // 3. Family member (FAMILY_MEMBER) -> 403
    const familyRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.familyMember,
      body: makeProvisionPayload('0103')
    });
    expect(familyRes.status).toBe(403);
    expect(familyRes.body.error?.code).toBe('FORBIDDEN');

    // 4. Driver (DRIVER) -> 403
    const driverRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.driver,
      body: makeProvisionPayload('0104')
    });
    expect(driverRes.status).toBe(403);
    expect(driverRes.body.error?.code).toBe('FORBIDDEN');

    // 5. Showroom staff (SHOWROOM_STAFF) -> 403
    const showroomRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.showroomStaffA,
      body: makeProvisionPayload('0105')
    });
    expect(showroomRes.status).toBe(403);
    expect(showroomRes.body.error?.code).toBe('FORBIDDEN');

    // 6. Authority user (AUTHORITY_MEDICAL) -> 403
    const authorityRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.authorityMedical,
      body: makeProvisionPayload('0106')
    });
    expect(authorityRes.status).toBe(403);
    expect(authorityRes.body.error?.code).toBe('FORBIDDEN');

    // Support admin (VEERXCAPE_SUPPORT) is read-only / triage -> 403 for hardware provisioning
    const supportRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.supportAdmin,
      body: makeProvisionPayload('0107')
    });
    expect(supportRes.status).toBe(403);
    expect(supportRes.body.error?.code).toBe('FORBIDDEN');

    // 7. Authorized operations administrator (VEERXCAPE_ADMIN) -> 200 allowed
    const opsAdminRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.opsAdmin,
      body: makeProvisionPayload('0108')
    });
    expect(opsAdminRes.status).toBe(200);
    expect(opsAdminRes.body.success).toBe(true);
    expect(opsAdminRes.body.data.device.serialNumber).toBe('VX-STM32U575-0108');
    expect(opsAdminRes.body.data.oneTimeProvisioningHmacSecretHex).toMatch(
      /^[0-9a-f]{64}$/
    );

    // 8. Authorized super administrator (VEERXCAPE_SUPER_ADMIN) -> 200 allowed
    const superAdminRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.superAdmin,
      body: makeProvisionPayload('0109')
    });
    expect(superAdminRes.status).toBe(200);
    expect(superAdminRes.body.success).toBe(true);
    expect(superAdminRes.body.data.device.serialNumber).toBe(
      'VX-STM32U575-0109'
    );
  });

  it('Task 2: secures device key rotation & device revocation HTTP endpoints and blocks revoked hardware immediately', async () => {
    const companies = await runtime.listDocs<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES
    );
    const showrooms = await runtime.listDocs<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS
    );
    const allocatedCompanyId = companies[0]!.id;
    const allocatedShowroomId = showrooms[0]!.id;

    // Provision a device as operations admin
    const provRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.opsAdmin,
      body: {
        serialNumber: 'VX-STM32U575-0201',
        imei: '359881234560201',
        simIccid: '8991101200003200201',
        firmwareVersion: '2.1.0',
        allocatedCompanyId,
        allocatedShowroomId
      }
    });
    expect(provRes.status).toBe(200);
    const deviceId = provRes.body.data.device.id as string;

    // Verify customer OTP and register vehicle via Showroom Staff
    const customerPhone = '+919811110201';
    const otpRes = await requestJson({
      method: 'POST',
      path: '/api/v1/auth/request-otp',
      body: {
        phoneE164: customerPhone,
        purpose: 'SHOWROOM_CUSTOMER_VERIFY'
      }
    });
    expect(otpRes.status).toBe(200);
    const challengeId = otpRes.body.data.challengeId as string;
    const otpCode = otpRes.body.data.demoOtpForTestingOnly as string;

    // Verify the OTP challenge via AuthService before showroom registration
    const { services } = createVeerXcapeExpressApp(runtime);
    await services.authService.verifyOtpChallenge({
      phoneE164: customerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode
    });

    const regRes = await requestJson({
      method: 'POST',
      path: '/api/v1/dealer/vehicles/register',
      token: tokens.showroomStaffA,
      body: {
        showroomId: allocatedShowroomId,
        registrationNumber: 'UP32VX0201',
        vin: 'MAT12345678900201',
        manufacturer: 'Tata Motors',
        model: 'Harrier EV',
        variant: 'Empowered+',
        manufacturingYear: 2026,
        color: 'Emerald',
        fuelType: 'EV',
        customerFullName: 'Rohan Sharma',
        customerPhoneE164: customerPhone,
        customerEmail: 'rohan@example.com',
        customerOtpChallengeId: challengeId,
        assignedDeviceSerial: 'VX-STM32U575-0201'
      }
    });
    expect(regRes.status).toBe(200);

    // Unauthorized key rotation attempts -> 401 and 403
    expect(
      (
        await requestJson({
          method: 'POST',
          path: `/api/v1/admin/devices/${deviceId}/rotate-key`,
          body: { reason: 'Routine rotation' }
        })
      ).status
    ).toBe(401);

    for (const forbiddenToken of [
      tokens.customerOwner,
      tokens.familyMember,
      tokens.driver,
      tokens.showroomStaffA,
      tokens.authorityMedical,
      tokens.supportAdmin
    ]) {
      const res = await requestJson({
        method: 'POST',
        path: `/api/v1/admin/devices/${deviceId}/rotate-key`,
        token: forbiddenToken,
        body: { reason: 'Unauthorized attempt' }
      });
      expect(res.status).toBe(403);
    }

    // Valid key rotation by VEERXCAPE_ADMIN -> increments secretVersion to 2
    const rotateRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${deviceId}/rotate-key`,
      token: tokens.opsAdmin,
      body: { reason: 'Scheduled quarterly HMAC key rotation' }
    });
    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.data.device.secretVersion).toBe(2);
    const rotatedSecretHex = rotateRes.body.data
      .oneTimeNewHmacSecretHex as string;
    expect(rotatedSecretHex).toMatch(/^[0-9a-f]{64}$/);

    // Unauthorized device revocation attempts -> 401 and 403
    expect(
      (
        await requestJson({
          method: 'POST',
          path: `/api/v1/admin/devices/${deviceId}/revoke`,
          body: { reason: 'Compromised unit' }
        })
      ).status
    ).toBe(401);

    expect(
      (
        await requestJson({
          method: 'POST',
          path: `/api/v1/admin/devices/${deviceId}/revoke`,
          token: tokens.showroomStaffA,
          body: { reason: 'Showroom trying to revoke' }
        })
      ).status
    ).toBe(403);

    // Invalid revocation reason (< 5 chars) -> 400 VALIDATION_ERROR
    const invalidRevokeRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${deviceId}/revoke`,
      token: tokens.opsAdmin,
      body: { reason: 'no' }
    });
    expect(invalidRevokeRes.status).toBe(400);
    expect(invalidRevokeRes.body.error?.code).toBe('VALIDATION_ERROR');

    // Valid device revocation by VEERXCAPE_SUPER_ADMIN -> 200
    const revokeRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${deviceId}/revoke`,
      token: tokens.superAdmin,
      body: { reason: 'Hardware tamper sensor triggered in field' }
    });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('REVOKED');

    // Rotating a key on an already-revoked device -> 409 CONFLICT
    const rotateRevokedRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/devices/${deviceId}/rotate-key`,
      token: tokens.superAdmin,
      body: { reason: 'Try rotating revoked device' }
    });
    expect(rotateRevokedRes.status).toBe(409);

    // Verify revoked device is immediately blocked from submitting STM32 heartbeats
    const nowMs = runtime.now().getTime();
    const hbBody = JSON.stringify({
      mcuUptimeSeconds: 600,
      powerSource: 'VEHICLE_12V',
      backupBatteryPercent: 98,
      batteryVoltageMv: 12500,
      cellularRssiDbm: -68,
      gnssFixStatus: 'FIX_3D',
      firmwareVersion: '2.1.0'
    });
    const sig = computeStm32HmacSignature({
      deviceSecretKeyHex: rotatedSecretHex,
      serialNumber: 'VX-STM32U575-0201',
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
        'x-device-serial': 'VX-STM32U575-0201',
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '1',
        'x-device-signature': sig
      },
      body: hbBody
    });
    expect(hbRes.status).toBe(403);
    expect(hbRes.body.error?.code).toBe('FORBIDDEN');
  });

  it('Task 2: secures user suspension, reactivation, system-config, and notification-retry endpoints with privilege hierarchy enforcement', async () => {
    // 1. Non-admin cannot suspend or reactivate users -> 403
    const customerSuspendRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/users/usr_driver/suspend',
      token: tokens.customerOwner,
      body: { reason: 'Customer trying to suspend driver account' }
    });
    expect(customerSuspendRes.status).toBe(403);

    // 2. Operations Admin (VEERXCAPE_ADMIN) cannot suspend a Super Admin -> 403 FORBIDDEN
    const opsSuspendSuperRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/users/usr_super_admin/suspend',
      token: tokens.opsAdmin,
      body: { reason: 'Attempt to suspend super administrator' }
    });
    expect(opsSuspendSuperRes.status).toBe(403);
    expect(opsSuspendSuperRes.body.error?.code).toBe('FORBIDDEN');

    // 3. Operations Admin suspends customer account -> 200, increments sessionVersion, revokes live token immediately
    const validSuspendRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/users/usr_customer_owner/suspend',
      token: tokens.opsAdmin,
      body: { reason: 'Fraudulent SOS activity under investigation' }
    });
    expect(validSuspendRes.status).toBe(200);
    expect(validSuspendRes.body.data.status).toBe('SUSPENDED');
    expect(validSuspendRes.body.data.sessionVersion).toBe(2);

    // Suspended customer's existing Bearer token is immediately rejected on mobile dashboard (401/403)
    const dashWhileSuspended = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: tokens.customerOwner
    });
    expect([401, 403]).toContain(dashWhileSuspended.status);
    expect(dashWhileSuspended.body.success).toBe(false);

    // 4. Reactivate customer account via POST /api/v1/admin/users/:userId/reactivate
    const reactivateRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/users/usr_customer_owner/reactivate',
      token: tokens.opsAdmin,
      body: { reason: 'Investigation cleared customer identity' }
    });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe('ACTIVE');
    expect(reactivateRes.body.data.sessionVersion).toBe(3);

    // Re-issue token with new sessionVersion 3 and verify customer access works again
    const newCustomerToken = await runtime.auth.createCustomToken(
      'usr_customer_owner',
      {
        sv: 3,
        tier: 'CUSTOMER'
      }
    );
    const dashAfterReactivate = await requestJson({
      method: 'GET',
      path: '/api/v1/mobile/dashboard',
      token: newCustomerToken
    });
    expect(dashAfterReactivate.status).toBe(200);

    // 5. PUT /api/v1/admin/system-config/:configKey requires VEERXCAPE_SUPER_ADMIN
    const opsConfigRes = await requestJson({
      method: 'PUT',
      path: '/api/v1/admin/system-config/ALERT_ROUTING_POLICY',
      token: tokens.opsAdmin,
      body: {
        value: { cancelWindowSeconds: 15 },
        reason: 'Ops admin trying to alter global routing policy'
      }
    });
    expect(opsConfigRes.status).toBe(403);

    const superConfigRes = await requestJson({
      method: 'PUT',
      path: '/api/v1/admin/system-config/ALERT_ROUTING_POLICY',
      token: tokens.superAdmin,
      body: {
        value: { cancelWindowSeconds: 15, maxSmsRetries: 3 },
        reason: 'Super admin updating global cancel window policy'
      }
    });
    expect(superConfigRes.status).toBe(200);
    expect(superConfigRes.body.data.version).toBe(1);

    // 6. POST /api/v1/admin/notifications/:notificationId/retry
    const failedNotif: NotificationDocument = {
      id: 'ntf_failed_01',
      recipientUserId: 'usr_customer_owner',
      recipientPhoneE164: '+919000000004',
      channel: 'SMS_FALLBACK',
      priority: 'CRITICAL_EMERGENCY',
      title: 'Emergency Crash Alert',
      body: 'Crash detected',
      status: 'FAILED_RETRYABLE',
      retryCount: 1,
      failureReason: 'Gateway timeout',
      createdAt: runtime.now().toISOString()
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      failedNotif.id,
      failedNotif
    );

    const customerRetryRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/notifications/${failedNotif.id}/retry`,
      token: newCustomerToken
    });
    expect(customerRetryRes.status).toBe(403);

    const supportRetryRes = await requestJson({
      method: 'POST',
      path: `/api/v1/admin/notifications/${failedNotif.id}/retry`,
      token: tokens.supportAdmin
    });
    expect(supportRetryRes.status).toBe(200);
    expect(supportRetryRes.body.data.status).toBe('FCM_ACCEPTED');
    expect(supportRetryRes.body.data.retryCount).toBe(2);
  });

  it('Task 2 & Task 5: blocks cross-tenant administrative role assignment and cross-tenant hardware allocation', async () => {
    const companies = await runtime.listDocs<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES
    );
    const showrooms = await runtime.listDocs<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS
    );
    const companyAId = companies[0]!.id;
    const showroomAId = showrooms[0]!.id;

    // Create a second independent OEM tenant Company B
    const companyBRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/companies',
      token: tokens.superAdmin,
      body: {
        brandName: 'Mahindra Electric',
        oemCode: 'MAHI',
        registrationNumber: 'CIN-MAHI-2026',
        headquartersAddress: 'Pune, Maharashtra, India',
        contactEmail: 'oem@mahindra.example',
        contactPhone: '+912066658282'
      }
    });
    expect(companyBRes.status).toBe(200);
    const companyBId = companyBRes.body.data.company.id as string;

    // 1. Cross-tenant hardware provisioning: Showroom A belongs to Company A, not Company B -> 403 TENANT_ISOLATION_VIOLATION
    const crossTenantDeviceRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/devices/provision',
      token: tokens.superAdmin,
      body: {
        serialNumber: 'VX-STM32U575-0999',
        imei: '359881234560999',
        simIccid: '8991101200003200999',
        firmwareVersion: '2.1.0',
        allocatedCompanyId: companyBId,
        allocatedShowroomId: showroomAId
      }
    });
    expect(crossTenantDeviceRes.status).toBe(403);
    expect(crossTenantDeviceRes.body.error?.code).toBe(
      'TENANT_ISOLATION_VIOLATION'
    );

    // 2. Cross-tenant role assignment: assigning SHOWROOM_MANAGER on Showroom A but specifying companyId = Company B -> 403 TENANT_ISOLATION_VIOLATION
    const crossTenantRoleRes = await requestJson({
      method: 'POST',
      path: '/api/v1/admin/roles/assign',
      token: tokens.superAdmin,
      body: {
        targetUserId: 'usr_showroom_staff_a',
        role: USER_ROLES.SHOWROOM_MANAGER,
        scopeType: 'SHOWROOM',
        scopeId: showroomAId,
        companyId: companyBId,
        showroomId: showroomAId
      }
    });
    expect(crossTenantRoleRes.status).toBe(403);
    expect(crossTenantRoleRes.body.error?.code).toBe(
      'TENANT_ISOLATION_VIOLATION'
    );

    // 3. Company A Admin attempting to access Company B overview -> 403
    const crossCompanyOverviewRes = await requestJson({
      method: 'GET',
      path: `/api/v1/company/${companyBId}/overview`,
      token: tokens.companyAdminA
    });
    expect(crossCompanyOverviewRes.status).toBe(403);

    // Company A Admin accessing their own Company A overview -> 200
    const ownCompanyOverviewRes = await requestJson({
      method: 'GET',
      path: `/api/v1/company/${companyAId}/overview`,
      token: tokens.companyAdminA
    });
    expect(ownCompanyOverviewRes.status).toBe(200);
  });

  it('Task 3, 4 & 5: verifies 28 canonical collections (including incidentEvents), indexed pagination, and full SHA-256 audit chain integrity', async () => {
    expect(Object.keys(DOMAIN_COLLECTIONS)).toHaveLength(24);
    expect(Object.keys(SERVER_ONLY_COLLECTIONS)).toHaveLength(4);
    expect(Object.keys(FIRESTORE_COLLECTIONS)).toHaveLength(28);
    expect(FIRESTORE_COLLECTIONS.INCIDENT_EVENTS).toBe('incidentEvents');

    const companies = await runtime.listDocs<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES
    );
    const showrooms = await runtime.listDocs<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS
    );
    const authorities = await runtime.listDocs<GovernmentAuthorityDocument>(
      FIRESTORE_COLLECTIONS.AUTHORITIES
    );
    const companyAId = companies[0]!.id;
    const showroomAId = showrooms[0]!.id;
    const authorityMedId = authorities[0]!.id;

    const { services } = createVeerXcapeExpressApp(runtime);
    const customerPhone = '+919000000004';

    // Provision 2 devices and register 2 vehicles in Showroom A to test cursor pagination
    for (const idx of ['1', '2']) {
      const prov = await requestJson({
        method: 'POST',
        path: '/api/v1/admin/devices/provision',
        token: tokens.opsAdmin,
        body: {
          serialNumber: `VX-STM32U575-030${idx}`,
          imei: `35988123456030${idx}`,
          simIccid: `899110120000320030${idx}`,
          firmwareVersion: '2.1.0',
          allocatedCompanyId: companyAId,
          allocatedShowroomId: showroomAId
        }
      });
      expect(prov.status).toBe(200);

      const otpReq = await services.authService.requestOtp({
        phoneE164: customerPhone,
        purpose: 'SHOWROOM_CUSTOMER_VERIFY'
      });
      await services.authService.verifyOtpChallenge({
        phoneE164: customerPhone,
        purpose: 'SHOWROOM_CUSTOMER_VERIFY',
        otpCode: otpReq.demoOtpForTestingOnly!
      });

      const reg = await requestJson({
        method: 'POST',
        path: '/api/v1/dealer/vehicles/register',
        token: tokens.showroomStaffA,
        body: {
          showroomId: showroomAId,
          registrationNumber: `UP32VX030${idx}`,
          vin: `MAT1234567890030${idx}`,
          manufacturer: 'Tata Motors',
          model: 'Curvv EV',
          variant: 'Accomplished',
          manufacturingYear: 2026,
          color: 'White',
          fuelType: 'EV',
          customerFullName: 'Test Customer',
          customerPhoneE164: customerPhone,
          customerOtpChallengeId: otpReq.challengeId,
          assignedDeviceSerial: `VX-STM32U575-030${idx}`
        }
      });
      expect(reg.status).toBe(200);
    }

    // Activate customer account so ownership & vehicles transition to ACTIVE
    const actOtp = await services.authService.requestOtp({
      phoneE164: customerPhone,
      purpose: 'CUSTOMER_ACTIVATION'
    });
    const actRes = await services.authService.activateCustomerAccount({
      phoneE164: customerPhone,
      otpCode: actOtp.demoOtpForTestingOnly!,
      newPassword: 'CustomerStrongPassword99'
    });

    // Paginate showroom vehicles with limit=1
    const page1Res = await requestJson({
      method: 'GET',
      path: `/api/v1/dealer/showrooms/${showroomAId}/vehicles?limit=1`,
      token: tokens.showroomStaffA
    });
    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data).toHaveLength(1);

    const firstVehicleId = page1Res.body.data[0].id as string;
    const page2Res = await requestJson({
      method: 'GET',
      path: `/api/v1/dealer/showrooms/${showroomAId}/vehicles?limit=1&cursor=${firstVehicleId}`,
      token: tokens.showroomStaffA
    });
    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data).toHaveLength(1);
    expect(page2Res.body.data[0].id).not.toBe(firstVehicleId);

    // Trigger Manual SOS as the activated vehicle owner -> creates incident AND canonical incidentEvents record
    const sosRes = await requestJson({
      method: 'POST',
      path: '/api/v1/mobile/sos/trigger',
      token: actRes.customToken,
      body: {
        vehicleId: firstVehicleId,
        location: {
          lat: 26.8467,
          lng: 80.9462,
          accuracyMeters: 5,
          jurisdictionCode: 'IN-UP-LKO',
          roadSegmentSummary: 'Hazratganj Crossing'
        },
        isSimulated: false
      }
    });
    expect(sosRes.status).toBe(200);
    const incidentId = sosRes.body.data.id as string;

    // Update incident status by Medical Authority -> appends second incidentEvents transition
    const authUpdateRes = await requestJson({
      method: 'POST',
      path: `/api/v1/authority/${authorityMedId}/incidents/update`,
      token: tokens.authorityMedical,
      body: {
        incidentId,
        newState: 'AUTHORITY_ACKNOWLEDGED',
        dispatchReferenceCode: 'AMB-UP32-09',
        assignedOfficerName: 'Dr. R. Verma',
        note: 'ALS ambulance dispatched from Hazratganj base',
        visibility: 'ALL_AUTHORIZED'
      }
    });
    expect(authUpdateRes.status).toBe(200);

    // Verify incidentEvents collection contains both transition events ordered by occurredAt
    const incidentEvents = await runtime.listDocs<IncidentEventDocument>(
      FIRESTORE_COLLECTIONS.INCIDENT_EVENTS,
      {
        where: [{ field: 'incidentId', op: '==', value: incidentId }],
        orderBy: [{ field: 'occurredAt', direction: 'asc' }]
      }
    );
    expect(incidentEvents).toHaveLength(2);
    expect(incidentEvents[0]!.eventType).toBe('INCIDENT_REPORTED');
    expect(incidentEvents[0]!.metadata?.lifecycleState).toBe(
      'VISIBLE_TO_AUTHORITY'
    );
    expect(incidentEvents[1]!.eventType).toBe('STATUS_TRANSITION');
    expect(incidentEvents[1]!.metadata?.newState).toBe(
      'AUTHORITY_ACKNOWLEDGED'
    );

    // Verify cryptographic SHA-256 audit chain integrity across all Stage 10A actions
    const auditVerifyRes = await requestJson({
      method: 'GET',
      path: '/api/v1/admin/audit-logs/verify',
      token: tokens.superAdmin
    });
    expect(auditVerifyRes.status).toBe(200);
    expect(auditVerifyRes.body.data.valid).toBe(true);
    expect(auditVerifyRes.body.data.totalEntries).toBeGreaterThanOrEqual(8);
  });
});
