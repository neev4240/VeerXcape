import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS,
  USER_ROLES
} from '@veerxcape/shared-constants';
import {
  VeerXcapeApiClient,
  VeerXcapeApiError,
  computeStm32HmacSignature,
  unwrapApiResponse
} from '@veerxcape/shared-services';
import type {
  AuthSecretsDocument,
  UniqueLockDocument,
  UserDocument,
  UserRoleDocument
} from '@veerxcape/shared-types';
import { createVeerXcapeExpressApp } from '../app.js';
import { DEFAULT_BOOTSTRAP_ACCOUNTS } from '../auth/defaultBootstrapAccounts.js';
import { hashSecretWithScrypt } from '../shared/cryptoUtils.js';
import { createInMemoryTestRuntime } from '../shared/runtime.js';

describe('Stage 11 — Frontend-to-Backend Integration Suite (All 5 Applications via VeerXcapeApiClient)', () => {
  let runtime: ReturnType<typeof createInMemoryTestRuntime>;
  let server: http.Server;
  let baseUrl: string;

  async function seedUserWithPasswordAndRole(params: {
    uid: string;
    phoneE164: string;
    password: string;
    primaryRole: UserDocument['primaryRole'];
    scopedRole?: Omit<UserRoleDocument, 'id' | 'createdAt'>;
  }): Promise<UserDocument> {
    const nowIso = runtime.now().toISOString();
    const userDoc: UserDocument = {
      uid: params.uid,
      phoneE164: params.phoneE164,
      email: `${params.uid}@veerxcape.example`,
      status: 'ACTIVE',
      primaryRole: params.primaryRole,
      sessionVersion: 1,
      mfaEnrolled: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, params.uid, userDoc);

    const lockKey = UNIQUE_LOCK_KEYS.phone(params.phoneE164);
    await runtime.setDoc<UniqueLockDocument>(
      FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
      lockKey,
      {
        lockKey,
        entityCollection: FIRESTORE_COLLECTIONS.USERS,
        entityId: params.uid,
        createdAt: nowIso
      }
    );

    const { saltHex, hashHex } = hashSecretWithScrypt(params.password);
    const secretsDoc: AuthSecretsDocument = {
      uid: params.uid,
      passwordSaltHex: saltHex,
      passwordHashHex: hashHex,
      passwordUpdatedAt: nowIso,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      pendingInviteSaltHex: null,
      pendingInviteHashHex: null,
      inviteExpiresAt: null
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.AUTH_SECRETS,
      params.uid,
      secretsDoc
    );

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

    return userDoc;
  }

  function createClient(options?: {
    timeoutMs?: number;
    baseUrlOverride?: string;
    onSessionExpired?: (reason: string) => void;
    fetchImpl?: typeof fetch;
  }): VeerXcapeApiClient {
    return new VeerXcapeApiClient({
      baseUrl: options?.baseUrlOverride ?? baseUrl,
      timeoutMs: options?.timeoutMs ?? 8000,
      onSessionExpired: options?.onSessionExpired,
      fetchImpl: options?.fetchImpl
    });
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

    await seedUserWithPasswordAndRole({
      uid: 'usr_super_admin_11',
      phoneE164: '+919900000001',
      password: 'AdminPassword#2026',
      primaryRole: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
      scopedRole: {
        userId: 'usr_super_admin_11',
        role: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
        scopeType: 'PLATFORM',
        scopeId: 'GLOBAL',
        status: 'ACTIVE',
        grantedBy: 'SYSTEM'
      }
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('1–8. End-to-end multi-portal workflow across Super-Admin, Dealer/Showroom, Customer Owner, Family Member, Driver, and Government Authorities', async () => {
    // =========================================================================
    // STEP A: SUPER-ADMIN PORTAL — Login, Onboard Company, Showroom,
    // Government Authorities (Medical, Police, Road), and Provision Hardware
    // =========================================================================
    const adminClient = createClient();
    const adminSession = unwrapApiResponse(
      await adminClient.loginWithPhone({
        phoneE164: '+919900000001',
        password: 'AdminPassword#2026'
      })
    );
    expect(adminSession.user.uid).toBe('usr_super_admin_11');
    expect(adminClient.hasActiveSession()).toBe(true);

    const adminMe = unwrapApiResponse(await adminClient.getMe());
    expect(adminMe.user.primaryRole).toBe(USER_ROLES.VEERXCAPE_SUPER_ADMIN);

    // Onboard Company A & Showroom A1 + Company B & Showroom B1 for tenant isolation
    const companyARes = unwrapApiResponse(
      await adminClient.createCompanyTenant({
        brandName: 'Apex Motors India',
        oemCode: 'APEXIN',
        registrationNumber: 'CIN-U34100KA2026PTC001',
        headquartersAddress: 'MG Road, Bengaluru, KA',
        contactEmail: 'ops@apexmotors.in',
        contactPhone: '+919845011111'
      })
    );
    const companyA = companyARes.company;

    const showroomA1 = unwrapApiResponse(
      await adminClient.createShowroom({
        companyId: companyA.id,
        name: 'Apex Indiranagar Showroom',
        dealerCode: 'APEX-BLR-01',
        city: 'Bengaluru',
        stateCode: 'KA',
        address: '100 Feet Road, Indiranagar, Bengaluru',
        contactPhone: '+919845011112',
        contactEmail: 'indiranagar@apexmotors.in'
      })
    );

    const companyBRes = unwrapApiResponse(
      await adminClient.createCompanyTenant({
        brandName: 'Horizon Auto Corp',
        oemCode: 'HRZNAU',
        registrationNumber: 'CIN-U34100MH2026PTC002',
        headquartersAddress: 'BKC, Mumbai, MH',
        contactEmail: 'ops@horizonauto.in',
        contactPhone: '+919820022221'
      })
    );
    const companyB = companyBRes.company;

    const showroomB1 = unwrapApiResponse(
      await adminClient.createShowroom({
        companyId: companyB.id,
        name: 'Horizon Andheri Showroom',
        dealerCode: 'HRZN-MUM-01',
        city: 'Mumbai',
        stateCode: 'MH',
        address: 'Link Road, Andheri West, Mumbai',
        contactPhone: '+919820022222',
        contactEmail: 'andheri@horizonauto.in'
      })
    );

    // Provision hardware device allocated to Company A / Showroom A1
    const provisionRes = unwrapApiResponse(
      await adminClient.provisionDevice({
        serialNumber: 'VX-STM32U575-STAGE1101',
        imei: '358901234567890',
        simIccid: '8991101200003204510',
        firmwareVersion: '2.4.0',
        allocatedCompanyId: companyA.id,
        allocatedShowroomId: showroomA1.id
      })
    );
    const provisionedDevice = provisionRes.device;
    const deviceSecretHex = provisionRes.provisioningSecretForFactoryFlashOnly;
    expect(provisionedDevice.serialNumber).toBe('VX-STM32U575-STAGE1101');
    expect(deviceSecretHex).toMatch(/^[0-9a-f]{64}$/i);

    // Seed Company Admin A, Showroom Staff A1, and Showroom Staff B1
    await seedUserWithPasswordAndRole({
      uid: 'usr_company_admin_a',
      phoneE164: '+919845090001',
      password: 'CompanyPassword#2026',
      primaryRole: USER_ROLES.COMPANY_ADMIN,
      scopedRole: {
        userId: 'usr_company_admin_a',
        role: USER_ROLES.COMPANY_ADMIN,
        scopeType: 'COMPANY',
        scopeId: companyA.id,
        companyId: companyA.id,
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });
    await seedUserWithPasswordAndRole({
      uid: 'usr_showroom_staff_a1',
      phoneE164: '+919845090002',
      password: 'ShowroomPassword#2026',
      primaryRole: USER_ROLES.SHOWROOM_STAFF,
      scopedRole: {
        userId: 'usr_showroom_staff_a1',
        role: USER_ROLES.SHOWROOM_STAFF,
        scopeType: 'SHOWROOM',
        scopeId: showroomA1.id,
        companyId: companyA.id,
        showroomId: showroomA1.id,
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });
    await seedUserWithPasswordAndRole({
      uid: 'usr_showroom_staff_b1',
      phoneE164: '+919820090003',
      password: 'ShowroomBPassword#2026',
      primaryRole: USER_ROLES.SHOWROOM_STAFF,
      scopedRole: {
        userId: 'usr_showroom_staff_b1',
        role: USER_ROLES.SHOWROOM_STAFF,
        scopeType: 'SHOWROOM',
        scopeId: showroomB1.id,
        companyId: companyB.id,
        showroomId: showroomB1.id,
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });

    // Onboard Medical, Police, Road Authorities in KA-BLR + Out-of-jurisdiction MH-MUM Authority
    const authMed = unwrapApiResponse(
      await adminClient.createAndVerifyAuthority({
        name: 'BLR 108 Emergency Medical Command',
        registrationNumber: 'GOV-KA-MED-108',
        department: 'MEDICAL',
        jurisdictionState: 'KA',
        jurisdictionDistrict: 'Bengaluru Urban',
        jurisdictionCode: 'IN-KA-BLR',
        contactControlRoomPhone: '+918022221108',
        contactEmail: 'command.med@ka108.gov.in'
      })
    );
    const authPol = unwrapApiResponse(
      await adminClient.createAndVerifyAuthority({
        name: 'Bengaluru City Police ERSS 112',
        registrationNumber: 'GOV-KA-POL-112',
        department: 'POLICE',
        jurisdictionState: 'KA',
        jurisdictionDistrict: 'Bengaluru Urban',
        jurisdictionCode: 'IN-KA-BLR',
        contactControlRoomPhone: '+918022221112',
        contactEmail: 'command.pol@ksp.gov.in'
      })
    );
    const authRoad = unwrapApiResponse(
      await adminClient.createAndVerifyAuthority({
        name: 'NHAI Corridor Patrol KA-BLR',
        registrationNumber: 'GOV-KA-ROAD-1033',
        department: 'ROAD',
        jurisdictionState: 'KA',
        jurisdictionDistrict: 'Bengaluru Urban',
        jurisdictionCode: 'IN-KA-BLR',
        contactControlRoomPhone: '+918022221033',
        contactEmail: 'corridor.road@nhai.gov.in'
      })
    );
    const authMumbaiMed = unwrapApiResponse(
      await adminClient.createAndVerifyAuthority({
        name: 'Mumbai EMS Command',
        registrationNumber: 'GOV-MH-MED-108',
        department: 'MEDICAL',
        jurisdictionState: 'MH',
        jurisdictionDistrict: 'Mumbai Suburban',
        jurisdictionCode: 'IN-MH-MUM',
        contactControlRoomPhone: '+912222221108',
        contactEmail: 'command.med@mh108.gov.in'
      })
    );

    // Super-admin can suspend & re-verify an authority
    const suspendedAuth = unwrapApiResponse(
      await adminClient.updateAuthorityVerification(authMed.id, {
        verificationStatus: 'SUSPENDED',
        reason: 'Routine compliance drill check'
      })
    );
    expect(suspendedAuth.verificationStatus).toBe('SUSPENDED');
    const reverifiedAuth = unwrapApiResponse(
      await adminClient.updateAuthorityVerification(authMed.id, {
        verificationStatus: 'VERIFIED',
        reason: 'Drill check passed'
      })
    );
    expect(reverifiedAuth.verificationStatus).toBe('VERIFIED');

    // Seed authority operators
    await seedUserWithPasswordAndRole({
      uid: 'usr_auth_med_blr',
      phoneE164: '+918011110001',
      password: 'AuthMedPassword#2026',
      primaryRole: USER_ROLES.AUTHORITY_MEDICAL,
      scopedRole: {
        userId: 'usr_auth_med_blr',
        role: USER_ROLES.AUTHORITY_MEDICAL,
        scopeType: 'AUTHORITY',
        scopeId: authMed.id,
        authorityId: authMed.id,
        department: 'MEDICAL',
        jurisdictionCode: 'IN-KA-BLR',
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });
    await seedUserWithPasswordAndRole({
      uid: 'usr_auth_pol_blr',
      phoneE164: '+918011110002',
      password: 'AuthPolPassword#2026',
      primaryRole: USER_ROLES.AUTHORITY_POLICE,
      scopedRole: {
        userId: 'usr_auth_pol_blr',
        role: USER_ROLES.AUTHORITY_POLICE,
        scopeType: 'AUTHORITY',
        scopeId: authPol.id,
        authorityId: authPol.id,
        department: 'POLICE',
        jurisdictionCode: 'IN-KA-BLR',
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });
    await seedUserWithPasswordAndRole({
      uid: 'usr_auth_road_blr',
      phoneE164: '+918011110003',
      password: 'AuthRoadPassword#2026',
      primaryRole: USER_ROLES.AUTHORITY_ROAD,
      scopedRole: {
        userId: 'usr_auth_road_blr',
        role: USER_ROLES.AUTHORITY_ROAD,
        scopeType: 'AUTHORITY',
        scopeId: authRoad.id,
        authorityId: authRoad.id,
        department: 'ROAD',
        jurisdictionCode: 'IN-KA-BLR',
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });
    await seedUserWithPasswordAndRole({
      uid: 'usr_auth_med_mum',
      phoneE164: '+912211110004',
      password: 'AuthMumPassword#2026',
      primaryRole: USER_ROLES.AUTHORITY_MEDICAL,
      scopedRole: {
        userId: 'usr_auth_med_mum',
        role: USER_ROLES.AUTHORITY_MEDICAL,
        scopeType: 'AUTHORITY',
        scopeId: authMumbaiMed.id,
        authorityId: authMumbaiMed.id,
        department: 'MEDICAL',
        jurisdictionCode: 'IN-MH-MUM',
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });

    // =========================================================================
    // STEP B: DEALER & SHOWROOM PORTAL — Showroom Login, Zero-Knowledge
    // Customer OTP Verification, 9-Step Vehicle Registration, Permitted
    // Correction, and Tenant Isolation
    // =========================================================================
    const showroomAClient = createClient();
    unwrapApiResponse(
      await showroomAClient.loginWithPhone({
        phoneE164: '+919845090002',
        password: 'ShowroomPassword#2026'
      })
    );

    const customerPhone = '+919700011111';
    // Step 1: Request & verify customer's showroom OTP (showroom never sets password)
    const showroomOtpChallenge = unwrapApiResponse(
      await showroomAClient.requestOtp({
        phoneE164: customerPhone,
        purpose: 'SHOWROOM_CUSTOMER_VERIFY'
      })
    );
    expect(showroomOtpChallenge.demoOtpForTestingOnly).toBeTruthy();

    const verifiedShowroomOtp = unwrapApiResponse(
      await showroomAClient.verifyCustomerShowroomOtp({
        phoneE164: customerPhone,
        otpCode: showroomOtpChallenge.demoOtpForTestingOnly!
      })
    );
    expect(verifiedShowroomOtp.challengeId).toBe(showroomOtpChallenge.challengeId);

    // Step 2: Showroom completes 9-step vehicle registration & device assignment
    const registrationRes = unwrapApiResponse(
      await showroomAClient.registerVehicleAndAssignDevice({
        showroomId: showroomA1.id,
        registrationNumber: 'KA01VX2026',
        vin: 'MA1VX202600001234',
        manufacturer: 'Apex',
        model: 'X1 Pro EV',
        variant: 'AWD Long Range',
        manufacturingYear: 2026,
        color: 'Glacier White',
        fuelType: 'EV',
        customerFullName: 'Aarav Sharma',
        customerPhoneE164: customerPhone,
        customerEmail: 'aarav.sharma@example.com',
        customerOtpChallengeId: verifiedShowroomOtp.challengeId,
        assignedDeviceSerial: provisionedDevice.serialNumber
      })
    );
    expect(registrationRes.vehicle.registrationNumber).toBe('KA01VX2026');
    expect(registrationRes.ownership.status).toBe('PENDING_ACTIVATION');

    // Showroom applies a permitted correction (color & variant)
    const correctedVehicle = unwrapApiResponse(
      await showroomAClient.applyVehicleCorrection(registrationRes.vehicle.id, {
        color: 'Titanium Matte Grey',
        variant: 'AWD Performance',
        reason: 'Updated paint code from delivery invoice'
      })
    );
    expect(correctedVehicle.color).toBe('Titanium Matte Grey');
    expect(correctedVehicle.variant).toBe('AWD Performance');

    // Verify Dealer Workspace returns scoped vehicles, devices, staff, and audits
    const dealerWorkspaceA = unwrapApiResponse(
      await showroomAClient.getDealerWorkspace()
    );
    expect(
      dealerWorkspaceA.vehicles.some((v) => v.id === registrationRes.vehicle.id)
    ).toBe(true);

    // Tenant Isolation: Showroom B1 cannot modify Showroom A1's vehicle or view its records
    const showroomBClient = createClient();
    unwrapApiResponse(
      await showroomBClient.loginWithPhone({
        phoneE164: '+919820090003',
        password: 'ShowroomBPassword#2026'
      })
    );
    const dealerWorkspaceB = unwrapApiResponse(
      await showroomBClient.getDealerWorkspace()
    );
    expect(
      dealerWorkspaceB.vehicles.some((v) => v.id === registrationRes.vehicle.id)
    ).toBe(false);

    const crossTenantCorrection = await showroomBClient.applyVehicleCorrection(
      registrationRes.vehicle.id,
      {
        color: 'Unauthorized Red',
        reason: 'Cross-tenant attempt'
      }
    );
    expect(crossTenantCorrection.success).toBe(false);

    // Company Admin A cannot suspend Showroom B1 in Company B
    const companyAClient = createClient();
    unwrapApiResponse(
      await companyAClient.loginWithPhone({
        phoneE164: '+919845090001',
        password: 'CompanyPassword#2026'
      })
    );
    const crossCompanyToggle = await companyAClient.updateShowroomStatus(
      companyB.id,
      showroomB1.id,
      {
        newStatus: 'SUSPENDED',
        reason: 'Cross-company unauthorized attempt'
      }
    );
    expect(crossCompanyToggle.success).toBe(false);

    // =========================================================================
    // STEP C: CUSTOMER MOBILE APPLICATION — Customer Self-Activation, Login,
    // Vehicle Dashboard, Live Telemetry, Emergency Contacts, Profile & Support
    // =========================================================================
    const ownerClient = createClient();
    const ownerOtpReq = unwrapApiResponse(
      await ownerClient.requestOtp({
        phoneE164: customerPhone,
        purpose: 'CUSTOMER_ACTIVATION'
      })
    );
    const ownerActivation = unwrapApiResponse(
      await ownerClient.activateCustomerAccount({
        phoneE164: customerPhone,
        otpCode: ownerOtpReq.demoOtpForTestingOnly!,
        newPassword: 'OwnerPassword#2026'
      })
    );
    expect(ownerActivation.user.uid).toBe(registrationRes.ownership.userId);

    // Owner logs in with phone + password
    unwrapApiResponse(
      await ownerClient.loginWithPhone({
        phoneE164: customerPhone,
        password: 'OwnerPassword#2026'
      })
    );

    // Device sends signed heartbeat (seq 1) and telemetry (seq 2) so live telemetry is fresh
    const nowMs = runtime.now().getTime();
    const hbBody = JSON.stringify({
      mcuUptimeSeconds: 1200,
      powerSource: 'VEHICLE_12V',
      backupBatteryPercent: 98,
      batteryVoltageMv: 13800,
      cellularRssiDbm: -68,
      gnssFixStatus: 'FIX_3D',
      firmwareVersion: '2.4.0'
    });
    const hbSig = computeStm32HmacSignature({
      deviceSecretKeyHex: deviceSecretHex,
      serialNumber: provisionedDevice.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/heartbeat',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 1,
      rawBody: hbBody
    });
    const hbRes = await fetch(`${baseUrl}/api/v1/iot/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-serial': provisionedDevice.serialNumber,
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
        lat: 12.9716,
        lng: 77.5946,
        accuracyMeters: 4.5,
        speedKmh: 46.5,
        heading: 90,
        recordedAt: runtime.now().toISOString()
      },
      imu: {
        accelXg: 0.01,
        accelYg: 0.02,
        accelZg: 0.99,
        peakImpactG: 1.0,
        tiltDegrees: 1.1
      },
      cabin: {
        occupantDetected: true,
        cabinTempCelsius: 24.5,
        smokeDetected: false,
        coPpm: 4
      },
      vehicleBus: {
        ignitionOn: true,
        doorsLocked: true,
        windowsClosed: true
      },
      power: {
        mainVoltageMv: 13850,
        backupBatteryPercent: 98,
        powerSource: 'VEHICLE_12V'
      }
    });
    const telSig = computeStm32HmacSignature({
      deviceSecretKeyHex: deviceSecretHex,
      serialNumber: provisionedDevice.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/telemetry',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 2,
      rawBody: telBody
    });
    const telRes = await fetch(`${baseUrl}/api/v1/iot/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-serial': provisionedDevice.serialNumber,
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '2',
        'x-device-signature': telSig
      },
      body: telBody
    });
    expect(telRes.status).toBe(200);

    // Fetch Owner Mobile Dashboard
    const ownerDashboard = unwrapApiResponse(
      await ownerClient.getMobileDashboard()
    );
    expect(ownerDashboard.vehicles.length).toBe(1);
    const ownerVeh = ownerDashboard.vehicles[0]!;
    expect(ownerVeh.id).toBe(registrationRes.vehicle.id);
    expect(ownerVeh.accessRole).toBe('VEHICLE_OWNER');
    expect(ownerVeh.liveStatusSummary.lastLocation?.lat).toBeCloseTo(12.9716, 4);
    expect(ownerVeh.locationFreshness.state).toBe('LIVE');

    // Add & Delete Emergency Contact
    const addedContact = unwrapApiResponse(
      await ownerClient.upsertEmergencyContact({
        vehicleId: registrationRes.vehicle.id,
        name: 'Dr. Rohan Mehta',
        phoneE164: '+919700033333',
        relationship: 'Family Physician',
        priorityOrder: 1,
        notifyOnAccident: true,
        notifyOnSos: true,
        notifyOnOccupantAlert: true
      })
    );
    expect(addedContact.name).toBe('Dr. Rohan Mehta');

    const delContact = unwrapApiResponse(
      await ownerClient.deleteEmergencyContact(addedContact.id)
    );
    expect(delContact.deletedId).toBe(addedContact.id);

    // Update Profile & Privacy Settings + Create Support Ticket
    const updatedProfile = unwrapApiResponse(
      await ownerClient.updateUserProfile({
        fullName: 'Aarav R. Sharma',
        language: 'en',
        notificationPreferences: {
          pushEnabled: true,
          criticalAlertsOnly: false
        },
        privacySettings: {
          shareWithMedicalOnSos: true,
          shareWithPoliceOnSos: true
        }
      })
    );
    expect(updatedProfile.fullName).toBe('Aarav R. Sharma');

    const ticket = unwrapApiResponse(
      await ownerClient.createSupportTicket({
        vehicleId: registrationRes.vehicle.id,
        category: 'DEVICE_ISSUE',
        subject: 'Verify quarterly STM32 calibration',
        description: 'Requesting remote diagnostic check on sensor status during next service.'
      })
    );
    expect(ticket.status).toBe('OPEN');

    // =========================================================================
    // STEP D: FAMILY INVITATION, ACTIVATION & PERMISSION-GOVERNED ACCESS
    // =========================================================================
    const familyPhone = '+919700022222';
    const inviteRes = unwrapApiResponse(
      await ownerClient.inviteFamilyMember({
        vehicleId: registrationRes.vehicle.id,
        familyMemberName: 'Priya Sharma',
        familyMemberPhoneE164: familyPhone,
        relationship: 'Spouse',
        initialPassword: 'TempInvite#2026',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      })
    );
    expect(inviteRes.membership.status).toBe('PENDING_OTP_VERIFICATION');

    const familyClient = createClient();
    const famOtp = unwrapApiResponse(
      await familyClient.requestOtp({
        phoneE164: familyPhone,
        purpose: 'FAMILY_ACTIVATION'
      })
    );
    const famAccept = unwrapApiResponse(
      await familyClient.activateFamilyAccount({
        phoneE164: familyPhone,
        otpCode: famOtp.demoOtpForTestingOnly!,
        initialPassword: 'TempInvite#2026',
        newPermanentPassword: 'FamilyPassword#2026'
      })
    );
    expect(famAccept.activatedVehicleIds).toContain(registrationRes.vehicle.id);

    unwrapApiResponse(
      await familyClient.loginWithPhone({
        phoneE164: familyPhone,
        password: 'FamilyPassword#2026'
      })
    );

    const familyDash = unwrapApiResponse(await familyClient.getMobileDashboard());
    expect(familyDash.vehicles.length).toBe(1);
    expect(familyDash.vehicles[0]!.accessRole).toBe('FAMILY_MEMBER');
    expect(
      familyDash.vehicles[0]!.liveStatusSummary.lastLocation?.lat
    ).toBeCloseTo(12.9716, 4);

    // Family member cannot invite other family members (Owner-only check)
    const unauthorizedInviteByFamily = await familyClient.inviteFamilyMember({
      vehicleId: registrationRes.vehicle.id,
      familyMemberName: 'Unauthorized Guest',
      familyMemberPhoneE164: '+919700099999',
      relationship: 'Other',
      initialPassword: 'GuestInvite#2026',
      permissions: {
        canViewLocation: true,
        canViewTelemetry: false,
        canReceiveCriticalAlerts: true,
        canViewIncidentHistory: true,
        canTriggerSos: false
      }
    });
    expect(unauthorizedInviteByFamily.success).toBe(false);

    // Owner updates family member permissions to disable live location
    unwrapApiResponse(
      await ownerClient.updateFamilyMembership(inviteRes.membership.id, {
        action: 'UPDATE_PERMISSIONS',
        permissions: {
          canViewLocation: false,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      })
    );
    const familyDashAfterPermChange = unwrapApiResponse(
      await familyClient.getMobileDashboard()
    );
    expect(
      familyDashAfterPermChange.vehicles[0]!.liveStatusSummary.lastLocation
    ).toBeNull();

    // Re-enable live location for family member
    unwrapApiResponse(
      await ownerClient.updateFamilyMembership(inviteRes.membership.id, {
        action: 'UPDATE_PERMISSIONS',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      })
    );

    // =========================================================================
    // STEP E: DRIVER ASSIGNMENT, LOGIN & RESTRICTED VEHICLE ACCESS
    // =========================================================================
    const driverPhone = '+919700044444';
    const driverAssign = unwrapApiResponse(
      await ownerClient.assignOrRevokeDriver({
        vehicleId: registrationRes.vehicle.id,
        driverFullName: 'Ramesh Kumar',
        driverPhoneE164: driverPhone,
        action: 'ASSIGN'
      })
    );
    expect(driverAssign.status).toBe('ACTIVE');

    // Driver activates credentials via OTP + password and logs in
    const driverClient = createClient();
    const drvOtp = unwrapApiResponse(
      await driverClient.requestOtp({
        phoneE164: driverPhone,
        purpose: 'CUSTOMER_ACTIVATION'
      })
    );
    unwrapApiResponse(
      await driverClient.activateCustomerAccount({
        phoneE164: driverPhone,
        otpCode: drvOtp.demoOtpForTestingOnly!,
        newPassword: 'DriverPassword#2026'
      })
    );
    unwrapApiResponse(
      await driverClient.loginWithPhone({
        phoneE164: driverPhone,
        password: 'DriverPassword#2026'
      })
    );

    const driverDash = unwrapApiResponse(await driverClient.getMobileDashboard());
    expect(driverDash.vehicles.length).toBe(1);
    expect(driverDash.vehicles[0]!.accessRole).toBe('DRIVER');
    // Driver does not receive owner's emergency contacts or family roster management
    expect(driverDash.emergencyContacts.length).toBe(0);
    expect(driverDash.familyMembershipsForOwnedVehicles.length).toBe(0);

    // =========================================================================
    // STEP F: INCIDENT CREATION (MANUAL SOS), NOTIFICATION DISPLAY &
    // ACKNOWLEDGEMENT, AND GOVERNMENT AUTHORITY DEPARTMENT / JURISDICTION
    // RESTRICTIONS & RESPONSE WORKFLOW
    // =========================================================================
    const sosIncident = unwrapApiResponse(
      await ownerClient.triggerManualSos({
        vehicleId: registrationRes.vehicle.id,
        location: {
          lat: 12.9716,
          lng: 77.5946,
          accuracyMeters: 5,
          roadSegmentSummary: '100 Feet Road, Indiranagar, Bengaluru',
          jurisdictionCode: 'IN-KA-BLR'
        },
        isSimulated: false
      })
    );
    const incidentId = sosIncident.id;
    expect(incidentId).toBeTruthy();

    // Also submit a hardware ACCIDENT_DETECTED event so Medical, Police, and Road all receive it
    const crashPayload = {
      events: [
        {
          idempotencyKey: 'evt_stage11_crash_01',
          eventSequenceNumber: 3,
          occurredAt: runtime.now().toISOString(),
          offlineRetry: false,
          isSimulated: false,
          incidentType: 'ACCIDENT_DETECTED',
          severity: 'CRITICAL',
          confidenceScore: 0.98,
          location: {
            lat: 12.9716,
            lng: 77.5946,
            accuracyMeters: 4,
            roadSegmentSummary: '100 Feet Road, Indiranagar, Bengaluru',
            jurisdictionCode: 'IN-KA-BLR'
          },
          environmentalSnapshot: {
            peakImpactG: 6.4,
            cabinTempCelsius: 25.0,
            occupantDetected: true
          }
        }
      ]
    };
    const crashRawBody = JSON.stringify(crashPayload);
    const crashSig = computeStm32HmacSignature({
      deviceSecretKeyHex: deviceSecretHex,
      serialNumber: provisionedDevice.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/events',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 3,
      rawBody: crashRawBody
    });
    const crashRes = await fetch(`${baseUrl}/api/v1/iot/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-serial': provisionedDevice.serialNumber,
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '3',
        'x-device-signature': crashSig
      },
      body: crashRawBody
    });
    expect(crashRes.status).toBe(200);
    const crashBodyJson = (await crashRes.json()) as {
      data: { incidentIds: string[] };
    };
    const crashIncidentId = crashBodyJson.data.incidentIds[0]!;
    expect(crashIncidentId).toBeTruthy();

    // Family member sees notification in dashboard and acknowledges delivery + marks read
    const familyDashWithSos = unwrapApiResponse(
      await familyClient.getMobileDashboard()
    );
    expect(familyDashWithSos.notifications.length).toBeGreaterThan(0);
    const familyNotification = familyDashWithSos.notifications[0]!;
    const ackDeliv = unwrapApiResponse(
      await familyClient.ackNotificationDelivered(familyNotification.id)
    );
    expect(ackDeliv.status).toBe('CLIENT_DELIVERED_ACK');
    const markRead = unwrapApiResponse(
      await familyClient.markNotificationRead(familyNotification.id)
    );
    expect(markRead.status).toBe('READ');

    // Authority Medical (IN-KA-BLR) logs in and sees full emergency medical & vehicle description details
    const medAuthClient = createClient();
    unwrapApiResponse(
      await medAuthClient.loginWithPhone({
        phoneE164: '+918011110001',
        password: 'AuthMedPassword#2026'
      })
    );
    const medWorkspace = unwrapApiResponse(
      await medAuthClient.getAuthorityWorkspace()
    );
    expect(medWorkspace.authorities[0]?.department).toBe('MEDICAL');
    const medIncidents = unwrapApiResponse(
      await medAuthClient.listAuthorityIncidents(authMed.id)
    );
    expect(medIncidents.some((inc) => inc.id === crashIncidentId)).toBe(true);
    const medIncView = medIncidents.find(
      (inc) => inc.id === crashIncidentId
    ) as unknown as {
      id: string;
      vehicleDescription: { registrationNumber: string };
      environmentalSnapshot?: { peakImpactG?: number };
    };
    expect(medIncView.vehicleDescription.registrationNumber).toBe('KA01VX2026');
    expect(medIncView.environmentalSnapshot?.peakImpactG).toBeCloseTo(6.4, 1);

    // Authority Road (IN-KA-BLR) logs in and receives REDACTED incident view (no owner PII, no reg number, no VIN)
    const roadAuthClient = createClient();
    unwrapApiResponse(
      await roadAuthClient.loginWithPhone({
        phoneE164: '+918011110003',
        password: 'AuthRoadPassword#2026'
      })
    );
    const roadWorkspace = unwrapApiResponse(
      await roadAuthClient.getAuthorityWorkspace()
    );
    expect(roadWorkspace.authorities[0]?.department).toBe('ROAD');
    const roadIncidents = unwrapApiResponse(
      await roadAuthClient.listAuthorityIncidents(authRoad.id)
    );
    const roadIncView = roadIncidents.find(
      (inc) => inc.id === crashIncidentId
    ) as unknown as Record<string, unknown>;
    expect(roadIncView).toBeDefined();
    expect(roadIncView.vehicleDescription).toBeUndefined();
    expect(roadIncView.vehicleIdentification).toBeUndefined();
    expect(roadIncView.emergencyContactPhone).toBeUndefined();

    // Out-of-jurisdiction Authority (IN-MH-MUM) receives 0 incidents for IN-KA-BLR
    const mumAuthClient = createClient();
    unwrapApiResponse(
      await mumAuthClient.loginWithPhone({
        phoneE164: '+912211110004',
        password: 'AuthMumPassword#2026'
      })
    );
    const mumIncidents = unwrapApiResponse(
      await mumAuthClient.listAuthorityIncidents(authMumbaiMed.id)
    );
    expect(mumIncidents.length).toBe(0);

    // Authority Medical progresses incident through Acknowledge -> Dispatch -> Confirm Response -> Resolve
    const ackInc = unwrapApiResponse(
      await medAuthClient.updateAuthorityIncident(authMed.id, {
        incidentId: crashIncidentId,
        newState: 'AUTHORITY_ACKNOWLEDGED',
        note: 'BLR 108 Command Desk acknowledged crash alert.',
        visibility: 'ALL_AUTHORIZED'
      })
    );
    expect(ackInc.incident.lifecycleState).toBe('AUTHORITY_ACKNOWLEDGED');

    const dispInc = unwrapApiResponse(
      await medAuthClient.updateAuthorityIncident(authMed.id, {
        incidentId: crashIncidentId,
        newState: 'DISPATCH_RECORDED_BY_AUTHORITY',
        assignedOfficerName: 'Paramedic Unit KA-01-AMB-42',
        dispatchReferenceCode: 'CAD-BLR-108-9001',
        note: 'ALS Ambulance dispatched from Indiranagar base.',
        visibility: 'ALL_AUTHORIZED'
      })
    );
    expect(dispInc.incident.lifecycleState).toBe(
      'DISPATCH_RECORDED_BY_AUTHORITY'
    );

    const confInc = unwrapApiResponse(
      await medAuthClient.updateAuthorityIncident(authMed.id, {
        incidentId: crashIncidentId,
        newState: 'RESPONSE_CONFIRMED',
        assignedOfficerName: 'Paramedic Unit KA-01-AMB-42',
        dispatchReferenceCode: 'CAD-BLR-108-9001',
        note: 'Paramedic unit arrived on scene.',
        visibility: 'ALL_AUTHORIZED'
      })
    );
    expect(confInc.incident.lifecycleState).toBe('RESPONSE_CONFIRMED');

    const resInc = unwrapApiResponse(
      await medAuthClient.updateAuthorityIncident(authMed.id, {
        incidentId: crashIncidentId,
        newState: 'RESOLVED',
        note: 'Patient stabilized and incident closed.',
        visibility: 'ALL_AUTHORIZED'
      })
    );
    expect(resInc.incident.lifecycleState).toBe('RESOLVED');

    // Verify incident update history in Authority Workspace
    const medWorkspaceAfter = unwrapApiResponse(
      await medAuthClient.getAuthorityWorkspace()
    );
    expect(
      medWorkspaceAfter.recentUpdates.filter(
        (u) => u.incidentId === crashIncidentId
      ).length
    ).toBeGreaterThanOrEqual(4);

    // Verify Super-Admin Workspace sees full incident, notification, and verified SHA-256 audit chain
    const adminWorkspace = unwrapApiResponse(
      await adminClient.getAdminWorkspace()
    );
    expect(adminWorkspace.auditVerification.valid).toBe(true);
    expect(adminWorkspace.auditVerification.checkedCount).toBeGreaterThan(0);
    expect(
      adminWorkspace.incidents.some((inc) => inc.id === crashIncidentId)
    ).toBe(true);
  }, 20000);

  it('9. Session expiration, user suspension, and logout invalidate active sessions and trigger onSessionExpired', async () => {
    let sessionExpiredCount = 0;
    const customerPhone = '+919711122233';
    await seedUserWithPasswordAndRole({
      uid: 'usr_session_test_01',
      phoneE164: customerPhone,
      password: 'SessionPassword#2026',
      primaryRole: USER_ROLES.VEHICLE_OWNER,
      scopedRole: {
        userId: 'usr_session_test_01',
        role: USER_ROLES.VEHICLE_OWNER,
        scopeType: 'PLATFORM',
        scopeId: 'GLOBAL',
        status: 'ACTIVE',
        grantedBy: 'usr_super_admin_11'
      }
    });

    const clientA = createClient({
      onSessionExpired: () => {
        sessionExpiredCount += 1;
      }
    });
    const loginSession = unwrapApiResponse(
      await clientA.loginWithPhone({
        phoneE164: customerPhone,
        password: 'SessionPassword#2026'
      })
    );

    // Logout on clientA increments sessionVersion on the server
    const logoutRes = unwrapApiResponse(await clientA.logout());
    expect(logoutRes.loggedOut).toBe(true);
    expect(clientA.hasActiveSession()).toBe(false);

    // Attempting to reuse the old session token in another client fails and triggers onSessionExpired
    const clientWithStaleToken = createClient({
      onSessionExpired: () => {
        sessionExpiredCount += 1;
      }
    });
    clientWithStaleToken.setSession(loginSession);
    const staleMeRes = await clientWithStaleToken.getMe();
    expect(staleMeRes.success).toBe(false);
    expect(sessionExpiredCount).toBe(1);

    // Log back in, then have Super-Admin suspend the user -> session immediately rejected
    const clientB = createClient({
      onSessionExpired: () => {
        sessionExpiredCount += 1;
      }
    });
    unwrapApiResponse(
      await clientB.loginWithPhone({
        phoneE164: customerPhone,
        password: 'SessionPassword#2026'
      })
    );

    const adminClient = createClient();
    unwrapApiResponse(
      await adminClient.loginWithPhone({
        phoneE164: '+919900000001',
        password: 'AdminPassword#2026'
      })
    );
    unwrapApiResponse(
      await adminClient.suspendUserAccount('usr_session_test_01', {
        reason: 'Security test suspension'
      })
    );

    const suspendedCall = await clientB.getMobileDashboard();
    expect(suspendedCall.success).toBe(false);
    expect(sessionExpiredCount).toBe(2);
  });

  it('10. Offline / network failure, request timeout, and public website contact form submission', async () => {
    // Public contact submission works without login
    const publicClient = createClient();
    const contactRes = unwrapApiResponse(
      await publicClient.submitPublicContactInquiry({
        fullName: 'Dr. Kavita Nair',
        organisation: 'Metro Trauma Center',
        email: 'kavita.nair@hospital.org',
        inquiryType: 'AUTHORITY',
        message: 'We would like to integrate our emergency trauma bay with VeerXcape CAD.'
      })
    );
    expect(contactRes.status).toBe('OPEN');
    expect(contactRes.ticketId).toBeTruthy();

    // Unreachable endpoint returns NETWORK_ERROR cleanly (never fake success)
    const offlineClient = createClient({
      baseUrlOverride: 'http://127.0.0.1:1'
    });
    const offlineRes = await offlineClient.submitPublicContactInquiry({
      fullName: 'Offline User',
      email: 'offline@example.com',
      inquiryType: 'CUSTOMER',
      message: 'Testing network error handling when backend is unreachable.'
    });
    expect(offlineRes.success).toBe(false);
    expect(offlineRes.error?.code).toBe('NETWORK_ERROR');
    expect(() => unwrapApiResponse(offlineRes)).toThrow(VeerXcapeApiError);

    // Slow endpoint exceeding timeoutMs returns REQUEST_TIMEOUT cleanly
    const timeoutClient = createClient({
      timeoutMs: 25,
      fetchImpl: ((_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        })) as typeof fetch
    });
    const timeoutRes = await timeoutClient.getMe();
    expect(timeoutRes.success).toBe(false);
    expect(timeoutRes.error?.code).toBe('REQUEST_TIMEOUT');
  });

  it('11. Default bootstrap accounts (+919500000001..11) authenticate idempotently across all portals on a fresh database', async () => {
    for (const spec of DEFAULT_BOOTSTRAP_ACCOUNTS) {
      const client = createClient();
      const loginRes = unwrapApiResponse(
        await client.loginWithPhone({
          phoneE164: spec.phoneE164,
          password: spec.password
        })
      );
      expect(loginRes.user.uid).toBe(spec.uid);
      expect(loginRes.user.primaryRole).toBe(spec.primaryRole);
      expect(loginRes.activeRoles.length).toBeGreaterThanOrEqual(1);
    }
  });
});