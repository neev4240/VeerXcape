import { describe, expect, it } from 'vitest';
import {
  FIRESTORE_COLLECTIONS,
  INCIDENT_TYPES
} from '@veerxcape/shared-constants';
import { computeStm32HmacSignature } from '@veerxcape/shared-services';
import type { UserDocument, UserRoleDocument } from '@veerxcape/shared-types';
import {
  AdminService,
  AuthService,
  AuthorityService,
  DealerAndCompanyService,
  DeviceAndIotService,
  FamilyAndDriverService,
  IncidentAndAlertEngine,
  MobileCustomerService,
  createInMemoryTestRuntime
} from '../index.js';

describe('Stage 3 — Phase 13 Mandatory Security & Multi-Tenant Penetration Tests', () => {
  async function setupMultiTenantFixture() {
    const runtime = createInMemoryTestRuntime();
    const nowIso = runtime.now().toISOString();

    const superAdmin: UserDocument = {
      uid: 'usr_super_root',
      phoneE164: '+919999999999',
      status: 'ACTIVE',
      primaryRole: 'VEERXCAPE_SUPER_ADMIN',
      sessionVersion: 1,
      mfaEnrolled: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const superRole: UserRoleDocument = {
      id: `${superAdmin.uid}_VEERXCAPE_SUPER_ADMIN_PLATFORM`,
      userId: superAdmin.uid,
      role: 'VEERXCAPE_SUPER_ADMIN',
      scopeType: 'PLATFORM',
      scopeId: 'PLATFORM',
      status: 'ACTIVE',
      grantedBy: 'BOOTSTRAP',
      createdAt: nowIso
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      superAdmin.uid,
      superAdmin
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.USER_ROLES,
      superRole.id,
      superRole
    );

    const adminService = new AdminService(runtime);
    const dealerService = new DealerAndCompanyService(runtime);
    const deviceService = new DeviceAndIotService(runtime);
    const authService = new AuthService(runtime);
    const familyService = new FamilyAndDriverService(runtime);
    const mobileService = new MobileCustomerService(runtime);
    const authorityService = new AuthorityService(runtime);
    const incidentEngine = new IncidentAndAlertEngine(runtime);

    // Create two distinct Parent Companies (Company A and Company B)
    const { company: companyA } = await adminService.createCompanyTenant({
      actorUser: superAdmin,
      activeRoles: [superRole],
      brandName: 'Company Alpha Motors',
      oemCode: 'ALFA',
      registrationNumber: 'CIN-ALFA-1',
      headquartersAddress: 'Mumbai',
      contactEmail: 'admin@alfa.example',
      contactPhone: '+912210000001'
    });
    const { company: companyB } = await adminService.createCompanyTenant({
      actorUser: superAdmin,
      activeRoles: [superRole],
      brandName: 'Company Beta Motors',
      oemCode: 'BETA',
      registrationNumber: 'CIN-BETA-1',
      headquartersAddress: 'Chennai',
      contactEmail: 'admin@beta.example',
      contactPhone: '+914410000002'
    });

    // Create Showroom A1, Showroom A2 (under Company A), and Showroom B1 (under Company B)
    const showroomA1 = await adminService.createAndApproveShowroom({
      actorUser: superAdmin,
      activeRoles: [superRole],
      companyId: companyA.id,
      name: 'Alpha Showroom 1',
      dealerCode: 'ALFA-01',
      city: 'Lucknow',
      stateCode: 'UP',
      address: 'Gomti Nagar',
      contactPhone: '+915221110001',
      contactEmail: 'a1@alfa.example'
    });
    const showroomA2 = await adminService.createAndApproveShowroom({
      actorUser: superAdmin,
      activeRoles: [superRole],
      companyId: companyA.id,
      name: 'Alpha Showroom 2',
      dealerCode: 'ALFA-02',
      city: 'Kanpur',
      stateCode: 'UP',
      address: 'Mall Road',
      contactPhone: '+915121110002',
      contactEmail: 'a2@alfa.example'
    });
    const showroomB1 = await adminService.createAndApproveShowroom({
      actorUser: superAdmin,
      activeRoles: [superRole],
      companyId: companyB.id,
      name: 'Beta Showroom 1',
      dealerCode: 'BETA-01',
      city: 'Pune',
      stateCode: 'MH',
      address: 'Baner',
      contactPhone: '+91201110003',
      contactEmail: 'b1@beta.example'
    });

    return {
      runtime,
      superAdmin,
      superRoles: [superRole],
      adminService,
      dealerService,
      deviceService,
      authService,
      familyService,
      mobileService,
      authorityService,
      incidentEngine,
      companyA,
      companyB,
      showroomA1,
      showroomA2,
      showroomB1
    };
  }

  it('Security Invariant 1: A family member cannot access another family’s vehicle, telemetry, or trigger SOS on it', async () => {
    const fx = await setupMultiTenantFixture();
    const nowIso = fx.runtime.now().toISOString();

    // Create Showroom A1 staff and provision two devices
    const staffA1: UserDocument = {
      uid: 'usr_staff_a1',
      phoneE164: '+919700000001',
      status: 'ACTIVE',
      primaryRole: 'SHOWROOM_STAFF',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await fx.runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, staffA1.uid, staffA1);
    const staffA1Role = await fx.adminService.assignScopedRole({
      actorUser: fx.superAdmin,
      activeRoles: fx.superRoles,
      rawInput: {
        targetUserId: staffA1.uid,
        role: 'SHOWROOM_STAFF',
        scopeType: 'SHOWROOM',
        scopeId: fx.showroomA1.id,
        companyId: fx.companyA.id,
        showroomId: fx.showroomA1.id
      }
    });

    const { device: dev1 } = await fx.deviceService.provisionDevice({
      actorUser: fx.superAdmin,
      serialNumber: 'VX-STM32U575-A001',
      imei: '350000000000001',
      simIccid: '8991000000000000001',
      firmwareVersion: '1.0.0',
      allocatedCompanyId: fx.companyA.id,
      allocatedShowroomId: fx.showroomA1.id
    });
    const { device: dev2 } = await fx.deviceService.provisionDevice({
      actorUser: fx.superAdmin,
      serialNumber: 'VX-STM32U575-A002',
      imei: '350000000000002',
      simIccid: '8991000000000000002',
      firmwareVersion: '1.0.0',
      allocatedCompanyId: fx.companyA.id,
      allocatedShowroomId: fx.showroomA1.id
    });

    // Register Vehicle 1 for Family 1 Owner, and Vehicle 2 for Family 2 Owner
    const owner1Phone = '+919600000001';
    const otp1 = await fx.authService.requestOtp({
      phoneE164: owner1Phone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY'
    });
    await fx.authService.verifyOtpChallenge({
      phoneE164: owner1Phone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: otp1.demoOtpForTestingOnly!
    });
    const { vehicle: vehicle1 } =
      await fx.dealerService.registerVehicleAndAssignDevice({
        actorUser: staffA1,
        activeRoles: [staffA1Role],
        rawInput: {
          showroomId: fx.showroomA1.id,
          registrationNumber: 'UP32FA0001',
          vin: 'MA3EUA61S00000001',
          manufacturer: 'Alpha',
          model: 'One',
          variant: 'V1',
          manufacturingYear: 2026,
          color: 'White',
          fuelType: 'EV',
          customerFullName: 'Owner Family 1',
          customerPhoneE164: owner1Phone,
          customerOtpChallengeId: otp1.challengeId,
          assignedDeviceSerial: dev1.serialNumber
        }
      });

    const owner2Phone = '+919600000002';
    const otp2 = await fx.authService.requestOtp({
      phoneE164: owner2Phone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY'
    });
    await fx.authService.verifyOtpChallenge({
      phoneE164: owner2Phone,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: otp2.demoOtpForTestingOnly!
    });
    const { vehicle: vehicle2 } =
      await fx.dealerService.registerVehicleAndAssignDevice({
        actorUser: staffA1,
        activeRoles: [staffA1Role],
        rawInput: {
          showroomId: fx.showroomA1.id,
          registrationNumber: 'UP32FB0002',
          vin: 'MA3EUA61S00000002',
          manufacturer: 'Alpha',
          model: 'Two',
          variant: 'V2',
          manufacturingYear: 2026,
          color: 'Blue',
          fuelType: 'EV',
          customerFullName: 'Owner Family 2',
          customerPhoneE164: owner2Phone,
          customerOtpChallengeId: otp2.challengeId,
          assignedDeviceSerial: dev2.serialNumber
        }
      });

    // Activate Owner 1 and invite Family Member 1
    const act1 = await fx.authService.requestOtp({
      phoneE164: owner1Phone,
      purpose: 'CUSTOMER_ACTIVATION'
    });
    const { user: owner1User } = await fx.authService.activateCustomerAccount({
      phoneE164: owner1Phone,
      otpCode: act1.demoOtpForTestingOnly!,
      newPassword: 'Owner1Password99'
    });

    const fam1Phone = '+919600000011';
    await fx.familyService.inviteFamilyMember({
      actorUser: owner1User,
      rawInput: {
        vehicleId: vehicle1.id,
        familyMemberName: 'Family 1 Member',
        familyMemberPhoneE164: fam1Phone,
        relationship: 'Parent',
        initialPassword: 'TempInvitePassword1',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      }
    });
    const famOtp1 = await fx.authService.requestOtp({
      phoneE164: fam1Phone,
      purpose: 'FAMILY_ACTIVATION'
    });
    const { user: fam1User } =
      await fx.familyService.activateFamilyMemberAccount({
        phoneE164: fam1Phone,
        otpCode: famOtp1.demoOtpForTestingOnly!,
        initialPassword: 'TempInvitePassword1',
        newPermanentPassword: 'Fam1PermanentPassword9'
      });

    // Family 1 Member CANNOT view Vehicle 2 on dashboard, CANNOT fetch Vehicle 2 telemetry, and CANNOT trigger SOS on Vehicle 2
    const fam1Dash = await fx.mobileService.getMobileDashboard({
      actorUser: fam1User
    });
    expect(fam1Dash.vehicles.map((v) => v.id)).toEqual([vehicle1.id]);

    await expect(
      fx.mobileService.getVehicleTelemetryHistory({
        actorUser: fam1User,
        vehicleId: vehicle2.id
      })
    ).rejects.toThrow(/no active owner, family, or driver relationship/);

    await expect(
      fx.incidentEngine.triggerManualSos({
        actorUser: fam1User,
        vehicleId: vehicle2.id,
        location: {
          lat: 26.8,
          lng: 80.9,
          accuracyMeters: 5,
          roadSegmentSummary: 'Test Road',
          jurisdictionCode: 'IN-UP-LKO'
        }
      })
    ).rejects.toThrow(/no active owner, family, or driver relationship/);
  });

  it('Security Invariants 2 & 3: A showroom cannot access another showroom’s customers/vehicles, and a company cannot access another company', async () => {
    const fx = await setupMultiTenantFixture();
    const nowIso = fx.runtime.now().toISOString();

    const staffA1: UserDocument = {
      uid: 'usr_staff_a1_iso',
      phoneE164: '+919500000001',
      status: 'ACTIVE',
      primaryRole: 'SHOWROOM_STAFF',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const companyAdminA: UserDocument = {
      uid: 'usr_cmp_admin_a',
      phoneE164: '+919500000002',
      status: 'ACTIVE',
      primaryRole: 'COMPANY_ADMIN',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await fx.runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, staffA1.uid, staffA1);
    await fx.runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      companyAdminA.uid,
      companyAdminA
    );

    const staffA1Role = await fx.adminService.assignScopedRole({
      actorUser: fx.superAdmin,
      activeRoles: fx.superRoles,
      rawInput: {
        targetUserId: staffA1.uid,
        role: 'SHOWROOM_STAFF',
        scopeType: 'SHOWROOM',
        scopeId: fx.showroomA1.id,
        companyId: fx.companyA.id,
        showroomId: fx.showroomA1.id
      }
    });
    const companyAdminARole = await fx.adminService.assignScopedRole({
      actorUser: fx.superAdmin,
      activeRoles: fx.superRoles,
      rawInput: {
        targetUserId: companyAdminA.uid,
        role: 'COMPANY_ADMIN',
        scopeType: 'COMPANY',
        scopeId: fx.companyA.id,
        companyId: fx.companyA.id
      }
    });

    // Showroom A1 staff CANNOT list Showroom A2 vehicles or Showroom B1 vehicles
    await expect(
      fx.dealerService.listShowroomVehicles({
        actorUser: staffA1,
        activeRoles: [staffA1Role],
        showroomId: fx.showroomA2.id
      })
    ).rejects.toThrow(/lacks an active role scoped/);

    await expect(
      fx.dealerService.listShowroomVehicles({
        actorUser: staffA1,
        activeRoles: [staffA1Role],
        showroomId: fx.showroomB1.id
      })
    ).rejects.toThrow(/lacks an active role scoped/);

    // Company A Admin CAN view Company A overview & Showroom A2, but CANNOT access Company B or Showroom B1
    const cmpAOverview = await fx.dealerService.getCompanyOverview({
      actorUser: companyAdminA,
      activeRoles: [companyAdminARole],
      companyId: fx.companyA.id
    });
    expect(cmpAOverview.company.id).toBe(fx.companyA.id);

    await expect(
      fx.dealerService.getCompanyOverview({
        actorUser: companyAdminA,
        activeRoles: [companyAdminARole],
        companyId: fx.companyB.id
      })
    ).rejects.toThrow(/lacks an active role scoped/);

    await expect(
      fx.dealerService.updateShowroomStatusByCompanyAdmin({
        actorUser: companyAdminA,
        activeRoles: [companyAdminARole],
        companyId: fx.companyA.id,
        showroomId: fx.showroomB1.id,
        newStatus: 'SUSPENDED',
        reason: 'Cross-tenant attempt'
      })
    ).rejects.toThrow(/does not belong to the specified parent company/);
  });

  it('Security Invariants 4, 5 & 6: Medical cannot access Police-only data, Road receives strictly anonymized data, and unauthorised users cannot access Admin endpoints', async () => {
    const fx = await setupMultiTenantFixture();
    const nowIso = fx.runtime.now().toISOString();

    const regularUser: UserDocument = {
      uid: 'usr_customer_regular',
      phoneE164: '+919400000099',
      status: 'ACTIVE',
      primaryRole: 'VEHICLE_OWNER',
      sessionVersion: 1,
      mfaEnrolled: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await fx.runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      regularUser.uid,
      regularUser
    );

    // Unauthorised user cannot access Admin portal overview or assign roles
    await expect(
      fx.adminService.getPlatformOverview({
        actorUser: regularUser,
        activeRoles: []
      })
    ).rejects.toThrow(/Requires active platform role/);

    await expect(
      fx.adminService.assignScopedRole({
        actorUser: regularUser,
        activeRoles: [],
        rawInput: {
          targetUserId: regularUser.uid,
          role: 'VEERXCAPE_SUPER_ADMIN',
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM'
        }
      })
    ).rejects.toThrow(/Requires active platform role/);
  });

  it('Security Invariant 7 & Production Gate: Unassigned/mismatched device cannot submit events, and production mode hard-disables Demo OTP and Simulated IoT', async () => {
    const fx = await setupMultiTenantFixture();

    // Provision an unassigned device
    const { device: unassignedDev, oneTimeProvisioningHmacSecretHex } =
      await fx.deviceService.provisionDevice({
        actorUser: fx.superAdmin,
        serialNumber: 'VX-STM32U575-UN99',
        imei: '350000000009999',
        simIccid: '8991000000000009999',
        firmwareVersion: '1.0.0',
        allocatedCompanyId: fx.companyA.id,
        allocatedShowroomId: fx.showroomA1.id
      });

    const nowMs = fx.runtime.now().getTime();
    const hbBody = JSON.stringify({
      mcuUptimeSeconds: 10,
      powerSource: 'VEHICLE_12V',
      backupBatteryPercent: 100,
      batteryVoltageMv: 12600,
      cellularRssiDbm: -70,
      gnssFixStatus: 'FIX_3D',
      firmwareVersion: '1.0.0'
    });
    const sig = computeStm32HmacSignature({
      deviceSecretKeyHex: oneTimeProvisioningHmacSecretHex,
      serialNumber: unassignedDev.serialNumber,
      httpMethod: 'POST',
      requestPath: '/api/v1/iot/heartbeat',
      deviceTimestampMs: nowMs,
      transmissionTimestampMs: nowMs,
      sequenceNumber: 1,
      rawBody: hbBody
    });

    // Unassigned device is blocked even with a valid cryptographic HMAC signature
    await expect(
      fx.deviceService.ingestHeartbeat({
        headers: {
          'x-device-serial': unassignedDev.serialNumber,
          'x-device-timestamp': String(nowMs),
          'x-transmission-timestamp': String(nowMs),
          'x-device-sequence': '1',
          'x-device-signature': sig
        },
        rawBody: hbBody,
        parsedBody: JSON.parse(hbBody)
      })
    ).rejects.toThrow(/not assigned to any active vehicle/);

    // Verify Production Safety Gate: Demo OTP is never returned and Simulated incidents are forbidden
    const prodRuntime = createInMemoryTestRuntime({
      environment: 'production',
      allowDemoOtp: true,
      allowSimulatedIot: true
    });
    const prodAuth = new AuthService(prodRuntime);
    const prodIncidentEngine = new IncidentAndAlertEngine(prodRuntime);

    const prodOtpRes = await prodAuth.requestOtp({
      phoneE164: '+919876543210',
      purpose: 'CUSTOMER_LOGIN'
    });
    expect(prodOtpRes.demoOtpForTestingOnly).toBeUndefined();

    await expect(
      prodIncidentEngine.processIncidentEvent({
        idempotencyKey: 'sim_prod_1',
        vehicleId: 'veh_1',
        incidentType: INCIDENT_TYPES.ACCIDENT_DETECTED,
        source: 'HARDWARE_STM32',
        isSimulated: true,
        severity: 'CRITICAL',
        confidenceScore: 0.99,
        occurredAt: prodRuntime.now().toISOString(),
        location: {
          lat: 26.8,
          lng: 80.9,
          accuracyMeters: 5,
          roadSegmentSummary: 'Test',
          jurisdictionCode: 'IN-UP-LKO'
        }
      })
    ).rejects.toThrow(/Simulated incidents are strictly forbidden in production/);
  });
});

