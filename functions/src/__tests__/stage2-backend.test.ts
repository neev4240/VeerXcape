import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_COLLECTIONS,
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  LOCATION_FRESHNESS_STATES,
  NOTIFICATION_STATUSES
} from '@veerxcape/shared-constants';
import { computeStm32HmacSignature } from '@veerxcape/shared-services';
import type {
  UserDocument,
  UserRoleDocument
} from '@veerxcape/shared-types';
import {
  AdminService,
  AuditService,
  AuthService,
  AuthorityService,
  DealerAndCompanyService,
  DeviceAndIotService,
  FamilyAndDriverService,
  IncidentAndAlertEngine,
  MobileCustomerService,
  NotificationService,
  createInMemoryTestRuntime
} from '../index.js';

describe('@veerxcape/functions — Stage 2 End-to-End Backend & Security Suite', () => {
  async function seedBootstrapSuperAdmin(
    runtime: ReturnType<typeof createInMemoryTestRuntime>
  ) {
    const uid = 'usr_super_admin_01';
    const nowIso = runtime.now().toISOString();
    const superUser: UserDocument = {
      uid,
      phoneE164: '+919999900001',
      email: 'admin@veerxcape.com',
      status: 'ACTIVE',
      primaryRole: 'VEERXCAPE_SUPER_ADMIN',
      sessionVersion: 1,
      mfaEnrolled: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const superRole: UserRoleDocument = {
      id: `${uid}_VEERXCAPE_SUPER_ADMIN_PLATFORM`,
      userId: uid,
      role: 'VEERXCAPE_SUPER_ADMIN',
      scopeType: 'PLATFORM',
      scopeId: 'PLATFORM',
      status: 'ACTIVE',
      grantedBy: 'SYSTEM_BOOTSTRAP',
      createdAt: nowIso
    };

    await runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, uid, superUser);
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.USER_ROLES,
      superRole.id,
      superRole
    );
    return { superUser, activeRoles: [superRole] };
  }

  it('1. executes full Showroom Vehicle Registration, Device Assignment, Customer OTP Activation, and Phone + Password Login with 5-attempt lockout', async () => {
    const runtime = createInMemoryTestRuntime();
    const { superUser, activeRoles: superRoles } =
      await seedBootstrapSuperAdmin(runtime);

    const adminService = new AdminService(runtime);
    const deviceService = new DeviceAndIotService(runtime);
    const dealerService = new DealerAndCompanyService(runtime);
    const authService = new AuthService(runtime);
    const mobileService = new MobileCustomerService(runtime);

    // 1. Super-Admin creates Parent Company A and Showroom A1
    const { company: companyA } = await adminService.createCompanyTenant({
      actorUser: superUser,
      activeRoles: superRoles,
      brandName: 'Tata Motors Passenger Vehicles',
      oemCode: 'TATA',
      registrationNumber: 'CIN-TATA-2026',
      headquartersAddress: 'Mumbai, MH',
      contactEmail: 'oem@tatamotors.example',
      contactPhone: '+912266658282'
    });

    const showroomA1 = await adminService.createAndApproveShowroom({
      actorUser: superUser,
      activeRoles: superRoles,
      companyId: companyA.id,
      name: 'Apex Tata Motors Lucknow',
      dealerCode: 'TATA-LKO-01',
      city: 'Lucknow',
      stateCode: 'UP',
      address: 'Hazratganj, Lucknow',
      contactPhone: '+915224001122',
      contactEmail: 'sales@apextata.example'
    });

    // Duplicate dealer code within same company is blocked by _uniqueLocks
    await expect(
      adminService.createAndApproveShowroom({
        actorUser: superUser,
        activeRoles: superRoles,
        companyId: companyA.id,
        name: 'Duplicate Code Showroom',
        dealerCode: 'TATA-LKO-01',
        city: 'Lucknow',
        stateCode: 'UP',
        address: 'Gomti Nagar',
        contactPhone: '+915224009999',
        contactEmail: 'dup@apextata.example'
      })
    ).rejects.toThrow(/already exists/);

    // 2. Super-Admin creates Showroom Staff user and assigns SHOWROOM_STAFF role
    const staffUser: UserDocument = {
      uid: 'usr_showroom_staff_a1',
      phoneE164: '+919800011111',
      status: 'ACTIVE',
      primaryRole: 'SHOWROOM_STAFF',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: runtime.now().toISOString(),
      updatedAt: runtime.now().toISOString()
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      staffUser.uid,
      staffUser
    );
    const staffRole = await adminService.assignScopedRole({
      actorUser: superUser,
      activeRoles: superRoles,
      rawInput: {
        targetUserId: staffUser.uid,
        role: 'SHOWROOM_STAFF',
        scopeType: 'SHOWROOM',
        scopeId: showroomA1.id,
        companyId: companyA.id,
        showroomId: showroomA1.id
      }
    });

    // 3. Super-Admin provisions STM32U575 device allocated to Showroom A1
    const { device, oneTimeProvisioningHmacSecretHex } =
      await deviceService.provisionDevice({
        actorUser: superUser,
        serialNumber: 'VX-STM32U575-0001',
        imei: '359881234567890',
        simIccid: '8991101200003204510',
        firmwareVersion: '1.2.0',
        allocatedCompanyId: companyA.id,
        allocatedShowroomId: showroomA1.id
      });
    expect(oneTimeProvisioningHmacSecretHex).toHaveLength(64);

    // 4. Showroom Staff verifies Customer's Phone via OTP before registration
    const customerPhone = '+919876543210';
    const otpReq = await authService.requestOtp({
      phoneE164: customerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY'
    });
    expect(otpReq.demoOtpForTestingOnly).toMatch(/^\d{6}$/);

    await authService.verifyOtpChallenge({
      phoneE164: customerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: otpReq.demoOtpForTestingOnly!
    });

    // 5. Showroom Staff registers Vehicle & assigns STM32U575 device (without setting customer password)
    const regResult = await dealerService.registerVehicleAndAssignDevice({
      actorUser: staffUser,
      activeRoles: [staffRole],
      rawInput: {
        showroomId: showroomA1.id,
        registrationNumber: 'up 32 ab 1234',
        vin: 'MA3EUA61S00123456',
        manufacturer: 'Tata Motors',
        model: 'Nexon EV',
        variant: 'Empowered Plus LR',
        manufacturingYear: 2026,
        color: 'Pristine White',
        fuelType: 'EV',
        customerFullName: 'Aarav Sharma',
        customerPhoneE164: customerPhone,
        customerEmail: 'aarav@example.com',
        customerOtpChallengeId: otpReq.challengeId,
        assignedDeviceSerial: device.serialNumber
      }
    });

    expect(regResult.vehicle.registrationNumber).toBe('UP32AB1234');
    expect(regResult.vehicle.registrationStatus).toBe(
      'PENDING_CUSTOMER_ACTIVATION'
    );

    // Duplicate vehicle registration number or VIN is rejected by _uniqueLocks
    await expect(
      dealerService.registerVehicleAndAssignDevice({
        actorUser: staffUser,
        activeRoles: [staffRole],
        rawInput: {
          showroomId: showroomA1.id,
          registrationNumber: 'UP32AB1234',
          vin: 'MA3EUA61S00999999',
          manufacturer: 'Tata Motors',
          model: 'Harrier EV',
          variant: 'AWD',
          manufacturingYear: 2026,
          color: 'Black',
          fuelType: 'EV',
          customerFullName: 'Aarav Sharma',
          customerPhoneE164: customerPhone,
          customerOtpChallengeId: otpReq.challengeId,
          assignedDeviceSerial: device.serialNumber
        }
      })
    ).rejects.toThrow(/already registered/);

    // 6. Customer activates their account in Mobile App via OTP + sets their own permanent password
    const custActOtp = await authService.requestOtp({
      phoneE164: customerPhone,
      purpose: 'CUSTOMER_ACTIVATION'
    });
    const activationRes = await authService.activateCustomerAccount({
      phoneE164: customerPhone,
      otpCode: custActOtp.demoOtpForTestingOnly!,
      newPassword: 'OwnerSecurePassword99'
    });
    expect(activationRes.user.status).toBe('ACTIVE');

    // 7. Customer signs in with Phone + Password
    const loginRes = await authService.loginWithPhoneAndPassword({
      phoneE164: customerPhone,
      password: 'OwnerSecurePassword99'
    });
    expect(loginRes.customToken).toContain('vx_token.');

    // Verify Owner Dashboard shows activated vehicle
    const dashboard = await mobileService.getMobileDashboard({
      actorUser: loginRes.user
    });
    expect(dashboard.vehicles).toHaveLength(1);
    expect(dashboard.vehicles[0].registrationStatus).toBe('ACTIVE');

    // 8. Verify 5 failed password attempts lock the account for 15 minutes
    for (let i = 1; i <= 4; i++) {
      await expect(
        authService.loginWithPhoneAndPassword({
          phoneE164: customerPhone,
          password: 'WrongPassword123'
        })
      ).rejects.toThrow(/Invalid phone number or password/);
    }
    await expect(
      authService.loginWithPhoneAndPassword({
        phoneE164: customerPhone,
        password: 'WrongPassword123'
      })
    ).rejects.toThrow(/locked for 15 minutes/);

    // Even with the right password, locked account rejects sign-in until lockout expires or password reset
    await expect(
      authService.loginWithPhoneAndPassword({
        phoneE164: customerPhone,
        password: 'OwnerSecurePassword99'
      })
    ).rejects.toThrow(/temporarily locked/);
  });

  it('2. enforces Family Member invitation, OTP + Initial Password activation, granular permission scoping, and immediate revocation', async () => {
    const runtime = createInMemoryTestRuntime();
    const { superUser, activeRoles: superRoles } =
      await seedBootstrapSuperAdmin(runtime);

    const adminService = new AdminService(runtime);
    const deviceService = new DeviceAndIotService(runtime);
    const dealerService = new DealerAndCompanyService(runtime);
    const authService = new AuthService(runtime);
    const familyService = new FamilyAndDriverService(runtime);
    const mobileService = new MobileCustomerService(runtime);

    // Setup Company, Showroom, Staff, Device, and Registered Vehicle for Owner A
    const { company } = await adminService.createCompanyTenant({
      actorUser: superUser,
      activeRoles: superRoles,
      brandName: 'Mahindra',
      oemCode: 'MM',
      registrationNumber: 'CIN-MM-01',
      headquartersAddress: 'Mumbai',
      contactEmail: 'oem@mahindra.example',
      contactPhone: '+912211112222'
    });
    const showroom = await adminService.createAndApproveShowroom({
      actorUser: superUser,
      activeRoles: superRoles,
      companyId: company.id,
      name: 'Mahindra Delhi',
      dealerCode: 'MM-DL-01',
      city: 'New Delhi',
      stateCode: 'DL',
      address: 'Connaught Place',
      contactPhone: '+911122223333',
      contactEmail: 'dl@mahindra.example'
    });
    const staffUser: UserDocument = {
      uid: 'usr_staff_dl',
      phoneE164: '+919811100001',
      status: 'ACTIVE',
      primaryRole: 'SHOWROOM_STAFF',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: runtime.now().toISOString(),
      updatedAt: runtime.now().toISOString()
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      staffUser.uid,
      staffUser
    );
    const staffRole = await adminService.assignScopedRole({
      actorUser: superUser,
      activeRoles: superRoles,
      rawInput: {
        targetUserId: staffUser.uid,
        role: 'SHOWROOM_STAFF',
        scopeType: 'SHOWROOM',
        scopeId: showroom.id,
        companyId: company.id,
        showroomId: showroom.id
      }
    });
    const { device } = await deviceService.provisionDevice({
      actorUser: superUser,
      serialNumber: 'VX-STM32U575-0002',
      imei: '359881234567891',
      simIccid: '8991101200003204511',
      firmwareVersion: '1.2.0',
      allocatedCompanyId: company.id,
      allocatedShowroomId: showroom.id
    });

    const ownerPhone = '+919810010001';
    const verifyOtp = await authService.requestOtp({
      phoneE164: ownerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY'
    });
    await authService.verifyOtpChallenge({
      phoneE164: ownerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: verifyOtp.demoOtpForTestingOnly!
    });

    const { vehicle } = await dealerService.registerVehicleAndAssignDevice({
      actorUser: staffUser,
      activeRoles: [staffRole],
      rawInput: {
        showroomId: showroom.id,
        registrationNumber: 'DL01CA1111',
        vin: 'MA3EUA61S00111111',
        manufacturer: 'Mahindra',
        model: 'XUV.e9',
        variant: 'Top',
        manufacturingYear: 2026,
        color: 'Silver',
        fuelType: 'EV',
        customerFullName: 'Owner One',
        customerPhoneE164: ownerPhone,
        customerOtpChallengeId: verifyOtp.challengeId,
        assignedDeviceSerial: device.serialNumber
      }
    });

    const actOtp = await authService.requestOtp({
      phoneE164: ownerPhone,
      purpose: 'CUSTOMER_ACTIVATION'
    });
    const { user: ownerUser } = await authService.activateCustomerAccount({
      phoneE164: ownerPhone,
      otpCode: actOtp.demoOtpForTestingOnly!,
      newPassword: 'OwnerPassword123'
    });

    // Owner invites Family Member (canViewLocation: true, canViewTelemetry: false)
    const familyPhone = '+919810020002';
    const inviteRes = await familyService.inviteFamilyMember({
      actorUser: ownerUser,
      rawInput: {
        vehicleId: vehicle.id,
        familyMemberName: 'Priya One',
        familyMemberPhoneE164: familyPhone,
        relationship: 'Spouse',
        initialPassword: 'InitialSetupPass88',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: false,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      }
    });
    expect(inviteRes.membership.status).toBe('PENDING_OTP_VERIFICATION');
    expect(JSON.stringify(inviteRes)).not.toContain('InitialSetupPass88');

    // Family member activates with OTP + initial password + sets their own permanent password
    const famOtp = await authService.requestOtp({
      phoneE164: familyPhone,
      purpose: 'FAMILY_ACTIVATION'
    });
    const famActivation = await familyService.activateFamilyMemberAccount({
      phoneE164: familyPhone,
      otpCode: famOtp.demoOtpForTestingOnly!,
      initialPassword: 'InitialSetupPass88',
      newPermanentPassword: 'PriyaPermanentPass99'
    });
    expect(famActivation.activatedVehicleIds).toContain(vehicle.id);

    // Family member can see the shared vehicle on their dashboard
    const famDashBefore = await mobileService.getMobileDashboard({
      actorUser: famActivation.user
    });
    expect(famDashBefore.vehicles).toHaveLength(1);
    expect(famDashBefore.vehicles[0].accessRole).toBe('FAMILY_MEMBER');

    // Family member CANNOT view raw telemetry because canViewTelemetry == false
    await expect(
      mobileService.getVehicleTelemetryHistory({
        actorUser: famActivation.user,
        vehicleId: vehicle.id
      })
    ).rejects.toThrow(/lacks permission for VIEW_TELEMETRY/);

    // Owner revokes Family Member's access -> takes effect immediately
    await familyService.updateOrRevokeFamilyMembership({
      actorUser: ownerUser,
      membershipId: inviteRes.membership.id,
      action: 'REVOKE'
    });

    // Family member's existing Bearer token is immediately rejected because sessionVersion incremented & refresh tokens revoked
    await expect(
      authService.authenticateBearerToken(`Bearer ${famActivation.customToken}`)
    ).rejects.toThrow();

    // Even if queried directly with updated user doc, shared vehicles list is now empty
    const updatedFamUser = await runtime.getDoc<UserDocument>(
      FIRESTORE_COLLECTIONS.USERS,
      famActivation.user.uid
    );
    const famDashAfter = await mobileService.getMobileDashboard({
      actorUser: updatedFamUser!
    });
    expect(famDashAfter.vehicles).toHaveLength(0);
  });

  it('3. verifies STM32U575 HMAC authentication, key rotation grace period, offline event batch deduplication, Authority department/jurisdiction isolation, ROAD PII anonymization, FCM state machine, and Audit Chain integrity', async () => {
    const runtime = createInMemoryTestRuntime();
    const { superUser, activeRoles: superRoles } =
      await seedBootstrapSuperAdmin(runtime);

    const adminService = new AdminService(runtime);
    const deviceService = new DeviceAndIotService(runtime);
    const dealerService = new DealerAndCompanyService(runtime);
    const authService = new AuthService(runtime);
    const authorityService = new AuthorityService(runtime);
    const notificationService = new NotificationService(runtime);
    const auditService = new AuditService(runtime);

    // 1. Setup Company, Showroom, Staff, Device & Vehicle in jurisdiction IN-UP-LKO
    const { company } = await adminService.createCompanyTenant({
      actorUser: superUser,
      activeRoles: superRoles,
      brandName: 'Hyundai India',
      oemCode: 'HYU',
      registrationNumber: 'CIN-HYU-01',
      headquartersAddress: 'Gurugram',
      contactEmail: 'oem@hyundai.example',
      contactPhone: '+911241112222'
    });
    const showroom = await adminService.createAndApproveShowroom({
      actorUser: superUser,
      activeRoles: superRoles,
      companyId: company.id,
      name: 'Hyundai Lucknow',
      dealerCode: 'HYU-LKO-01',
      city: 'Lucknow',
      stateCode: 'UP',
      address: 'Vibhuti Khand',
      contactPhone: '+915223334444',
      contactEmail: 'lko@hyundai.example'
    });
    const staffUser: UserDocument = {
      uid: 'usr_staff_hyu',
      phoneE164: '+919822200001',
      status: 'ACTIVE',
      primaryRole: 'SHOWROOM_STAFF',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: runtime.now().toISOString(),
      updatedAt: runtime.now().toISOString()
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      staffUser.uid,
      staffUser
    );
    const staffRole = await adminService.assignScopedRole({
      actorUser: superUser,
      activeRoles: superRoles,
      rawInput: {
        targetUserId: staffUser.uid,
        role: 'SHOWROOM_STAFF',
        scopeType: 'SHOWROOM',
        scopeId: showroom.id,
        companyId: company.id,
        showroomId: showroom.id
      }
    });

    const { device, oneTimeProvisioningHmacSecretHex: initialKeyHex } =
      await deviceService.provisionDevice({
        actorUser: superUser,
        serialNumber: 'VX-STM32U575-0099',
        imei: '359881234569999',
        simIccid: '8991101200003209999',
        firmwareVersion: '1.2.0',
        allocatedCompanyId: company.id,
        allocatedShowroomId: showroom.id
      });

    const ownerPhone = '+919833300001';
    const verifyOtp = await authService.requestOtp({
      phoneE164: ownerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY'
    });
    await authService.verifyOtpChallenge({
      phoneE164: ownerPhone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: verifyOtp.demoOtpForTestingOnly!
    });

    const { vehicle } = await dealerService.registerVehicleAndAssignDevice({
      actorUser: staffUser,
      activeRoles: [staffRole],
      rawInput: {
        showroomId: showroom.id,
        registrationNumber: 'UP32HY9999',
        vin: 'MA3EUA61S00999991',
        manufacturer: 'Hyundai',
        model: 'Ioniq 5',
        variant: 'RWD',
        manufacturingYear: 2026,
        color: 'Gravity Gold',
        fuelType: 'EV',
        customerFullName: 'Vikram Singh',
        customerPhoneE164: ownerPhone,
        customerOtpChallengeId: verifyOtp.challengeId,
        assignedDeviceSerial: device.serialNumber
      }
    });

    // 2. STM32U575 sends signed Heartbeat (sequence 1) and Telemetry (sequence 2)
    const nowMs = runtime.now().getTime();
    const hbBody = JSON.stringify({
      mcuUptimeSeconds: 3600,
      powerSource: 'VEHICLE_12V',
      backupBatteryPercent: 98,
      batteryVoltageMv: 13800,
      cellularRssiDbm: -68,
      gnssFixStatus: 'FIX_3D',
      firmwareVersion: '1.2.0'
    });
    const hbSig = computeStm32HmacSignature({
      deviceSecretKeyHex: initialKeyHex,
      serialNumber: device.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/heartbeat',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 1,
      rawBody: hbBody
    });

    await deviceService.ingestHeartbeat({
      headers: {
        'x-device-serial': device.serialNumber,
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '1',
        'x-device-signature': hbSig
      },
      rawBody: hbBody,
      parsedBody: JSON.parse(hbBody)
    });

    // Rotate device key -> old key still works during 24h grace period, and new key works too
    const { oneTimeNewHmacSecretHex: rotatedKeyHex } =
      await deviceService.rotateDeviceKey({
        actorUser: superUser,
        deviceId: device.id
      });

    const telPayload = {
      isSimulated: false,
      gnss: {
        lat: 26.8467,
        lng: 80.9462,
        accuracyMeters: 3.2,
        speedKmh: 62,
        heading: 90,
        recordedAt: runtime.now().toISOString()
      },
      imu: {
        accelXg: 0.02,
        accelYg: 0.01,
        accelZg: 0.99,
        peakImpactG: 1.0,
        tiltDegrees: 1.2
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
        mainVoltageMv: 13900,
        backupBatteryPercent: 99,
        powerSource: 'VEHICLE_12V'
      }
    };
    const telBody = JSON.stringify(telPayload);
    const telSigWithNewKey = computeStm32HmacSignature({
      deviceSecretKeyHex: rotatedKeyHex,
      serialNumber: device.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/telemetry',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 2,
      rawBody: telBody
    });

    const telRes = await deviceService.ingestTelemetry({
      headers: {
        'x-device-serial': device.serialNumber,
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '2',
        'x-device-signature': telSigWithNewKey
      },
      rawBody: telBody,
      parsedBody: telPayload
    });
    expect(telRes.liveStatusSummary.connectionStatus).toBe(
      LOCATION_FRESHNESS_STATES.LIVE
    );

    // 3. STM32U575 uploads an ACCIDENT_DETECTED event and a THEFT_OR_INTRUSION_ALERT event
    const eventsPayload = {
      events: [
        {
          idempotencyKey: 'evt_crash_001',
          eventSequenceNumber: 3,
          occurredAt: runtime.now().toISOString(),
          offlineRetry: false,
          isSimulated: false,
          incidentType: INCIDENT_TYPES.ACCIDENT_DETECTED,
          severity: 'CRITICAL',
          confidenceScore: 0.99,
          location: {
            lat: 26.8467,
            lng: 80.9462,
            accuracyMeters: 3.5,
            roadSegmentSummary: 'Shaheed Path KM 8, Lucknow',
            jurisdictionCode: 'IN-UP-LKO'
          },
          environmentalSnapshot: {
            peakImpactG: 6.8,
            cabinTempCelsius: 26.0,
            occupantDetected: true
          }
        },
        {
          idempotencyKey: 'evt_theft_002',
          eventSequenceNumber: 4,
          occurredAt: runtime.now().toISOString(),
          offlineRetry: false,
          isSimulated: false,
          incidentType: INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT,
          severity: 'HIGH',
          confidenceScore: 0.95,
          location: {
            lat: 26.8467,
            lng: 80.9462,
            accuracyMeters: 3.5,
            roadSegmentSummary: 'Shaheed Path KM 8, Lucknow',
            jurisdictionCode: 'IN-UP-LKO'
          }
        }
      ]
    };
    const eventsBody = JSON.stringify(eventsPayload);
    const eventsSig = computeStm32HmacSignature({
      deviceSecretKeyHex: rotatedKeyHex,
      serialNumber: device.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/events',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 4,
      rawBody: eventsBody
    });

    const evRes = await deviceService.ingestHardwareEvents({
      headers: {
        'x-device-serial': device.serialNumber,
        'x-device-timestamp': String(nowMs),
        'x-transmission-timestamp': String(nowMs),
        'x-device-sequence': '4',
        'x-device-signature': eventsSig
      },
      rawBody: eventsBody,
      parsedBody: eventsPayload
    });
    expect(evRes.processedCount).toBe(2);
    expect(evRes.duplicateCount).toBe(0);

    // Verify notification was created in FCM_ACCEPTED state (not falsely claimed as delivered until client acks)
    const ownerNotifications = await runtime.listDocs<{
      id: string;
      status: string;
      recipientUserId: string;
    }>(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      (n) => n.recipientUserId === vehicle.primaryOwnerId
    );
    expect(ownerNotifications.length).toBeGreaterThanOrEqual(2);
    expect(ownerNotifications[0].status).toBe(
      NOTIFICATION_STATUSES.FCM_ACCEPTED
    );

    const ackedNotif = await notificationService.acknowledgeClientDelivered({
      notificationId: ownerNotifications[0].id,
      actorUserId: vehicle.primaryOwnerId
    });
    expect(ackedNotif.status).toBe(NOTIFICATION_STATUSES.CLIENT_DELIVERED_ACK);

    // 4. Create Medical, Police, and Road authorities in IN-UP-LKO and verify strict access boundaries
    const medAuthority = await adminService.createAndVerifyAuthority({
      actorUser: superUser,
      activeRoles: superRoles,
      name: 'Lucknow Emergency Medical Services',
      registrationNumber: 'GOV-UP-MED-01',
      department: 'MEDICAL',
      jurisdictionState: 'UP',
      jurisdictionDistrict: 'Lucknow',
      jurisdictionCode: 'IN-UP-LKO',
      contactControlRoomPhone: '+91522108108',
      contactEmail: 'ems@up.gov.example'
    });
    const roadAuthority = await adminService.createAndVerifyAuthority({
      actorUser: superUser,
      activeRoles: superRoles,
      name: 'NHAI Lucknow Highway Authority',
      registrationNumber: 'GOV-UP-ROAD-01',
      department: 'ROAD',
      jurisdictionState: 'UP',
      jurisdictionDistrict: 'Lucknow',
      jurisdictionCode: 'IN-UP-LKO',
      contactControlRoomPhone: '+915221033',
      contactEmail: 'nhai@up.gov.example'
    });

    const medUser: UserDocument = {
      uid: 'usr_med_lko',
      phoneE164: '+919400011111',
      status: 'ACTIVE',
      primaryRole: 'AUTHORITY_MEDICAL',
      sessionVersion: 1,
      mfaEnrolled: true,
      createdAt: runtime.now().toISOString(),
      updatedAt: runtime.now().toISOString()
    };
    const roadUser: UserDocument = {
      uid: 'usr_road_lko',
      phoneE164: '+919400022222',
      status: 'ACTIVE',
      primaryRole: 'AUTHORITY_ROAD',
      sessionVersion: 1,
      mfaEnrolled: true,
      createdAt: runtime.now().toISOString(),
      updatedAt: runtime.now().toISOString()
    };
    await runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, medUser.uid, medUser);
    await runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, roadUser.uid, roadUser);

    const medRole = await adminService.assignScopedRole({
      actorUser: superUser,
      activeRoles: superRoles,
      rawInput: {
        targetUserId: medUser.uid,
        role: 'AUTHORITY_MEDICAL',
        scopeType: 'AUTHORITY',
        scopeId: medAuthority.id,
        authorityId: medAuthority.id,
        department: 'MEDICAL',
        jurisdictionCode: 'IN-UP-LKO'
      }
    });
    const roadRole = await adminService.assignScopedRole({
      actorUser: superUser,
      activeRoles: superRoles,
      rawInput: {
        targetUserId: roadUser.uid,
        role: 'AUTHORITY_ROAD',
        scopeType: 'AUTHORITY',
        scopeId: roadAuthority.id,
        authorityId: roadAuthority.id,
        department: 'ROAD',
        jurisdictionCode: 'IN-UP-LKO'
      }
    });

    // Medical authority sees ONLY the crash (1 incident), NOT the police-only theft incident
    const medIncidents = await authorityService.listDepartmentIncidents({
      actorUser: medUser,
      activeRoles: [medRole],
      authorityId: medAuthority.id
    });
    expect(medIncidents).toHaveLength(1);
    expect(medIncidents[0].incidentType).toBe(INCIDENT_TYPES.ACCIDENT_DETECTED);

    // Medical authority cannot inspect the theft incident directly
    const theftIncidentId = evRes.incidentIds[1];
    await expect(
      authorityService.inspectIncidentByAuthority({
        actorUser: medUser,
        activeRoles: [medRole],
        authorityId: medAuthority.id,
        incidentId: theftIncidentId
      })
    ).rejects.toThrow(/not authorised for department MEDICAL/);

    // Road authority sees anonymized crash data with ZERO registration number or VIN
    const roadIncidents = await authorityService.listDepartmentIncidents({
      actorUser: roadUser,
      activeRoles: [roadRole],
      authorityId: roadAuthority.id
    });
    expect(roadIncidents).toHaveLength(1);
    const roadJson = JSON.stringify(roadIncidents[0]);
    expect(roadJson).not.toContain('UP32HY9999');
    expect(roadJson).not.toContain('MA3EUA61S00999991');

    // Medical authority records dispatch -> transitions from VISIBLE_TO_AUTHORITY to DISPATCH_RECORDED_BY_AUTHORITY
    const updateRes = await authorityService.updateIncidentByAuthority({
      actorUser: medUser,
      activeRoles: [medRole],
      authorityId: medAuthority.id,
      rawInput: {
        incidentId: evRes.incidentIds[0],
        newState: INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY,
        note: 'ALS Ambulance Unit LKO-14 dispatched to Shaheed Path KM 8.',
        assignedOfficerName: 'Dr. R. Verma',
        dispatchReferenceCode: 'EMS-LKO-2026-881',
        visibility: 'ALL_AUTHORIZED'
      }
    });
    expect(updateRes.incident.lifecycleState).toBe(
      INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY
    );

    // 5. Verify append-only SHA-256 Audit Chain across all operations above
    const auditChainCheck = await auditService.verifyChain();
    expect(auditChainCheck.valid).toBe(true);
    expect(auditChainCheck.totalEntries).toBeGreaterThanOrEqual(8);
  });
});

