import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  DOMAIN_COLLECTIONS,
  FIRESTORE_COLLECTIONS,
  SERVER_ONLY_COLLECTIONS
} from '@veerxcape/shared-constants';

const PROJECT_ID = 'veerxcape-01';

describe('Stage 10B — Firestore Security Rules Verification Across All 28 Collections (Real Firestore Emulator)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const rules = fs.readFileSync(
      path.join(repoRoot, 'firebase/firestore.rules'),
      'utf8'
    );

    const hostPort = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: hostPort[0] || '127.0.0.1',
        port: Number.parseInt(hostPort[1] || '8080', 10),
        rules
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Seed baseline documents across all 28 collections inside security-rules-disabled context
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();

      // 1. Users
      await setDoc(doc(db, 'users', 'usr_owner_1'), {
        uid: 'usr_owner_1',
        phoneE164: '+919000000001',
        status: 'ACTIVE',
        primaryRole: 'VEHICLE_OWNER',
        sessionVersion: 2
      });
      await setDoc(doc(db, 'users', 'usr_owner_2'), {
        uid: 'usr_owner_2',
        phoneE164: '+919000000002',
        status: 'ACTIVE',
        primaryRole: 'VEHICLE_OWNER',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_suspended'), {
        uid: 'usr_suspended',
        phoneE164: '+919000000099',
        status: 'SUSPENDED',
        primaryRole: 'VEHICLE_OWNER',
        sessionVersion: 2
      });
      await setDoc(doc(db, 'users', 'usr_family_1'), {
        uid: 'usr_family_1',
        phoneE164: '+919000000003',
        status: 'ACTIVE',
        primaryRole: 'FAMILY_MEMBER',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_family_no_tel'), {
        uid: 'usr_family_no_tel',
        phoneE164: '+919000000004',
        status: 'ACTIVE',
        primaryRole: 'FAMILY_MEMBER',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_family_revoked'), {
        uid: 'usr_family_revoked',
        phoneE164: '+919000000005',
        status: 'ACTIVE',
        primaryRole: 'FAMILY_MEMBER',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_driver_1'), {
        uid: 'usr_driver_1',
        phoneE164: '+919000000006',
        status: 'ACTIVE',
        primaryRole: 'DRIVER',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_staff_shwA'), {
        uid: 'usr_staff_shwA',
        phoneE164: '+919000000007',
        status: 'ACTIVE',
        primaryRole: 'SHOWROOM_STAFF',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_staff_shwB'), {
        uid: 'usr_staff_shwB',
        phoneE164: '+919000000008',
        status: 'ACTIVE',
        primaryRole: 'SHOWROOM_STAFF',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_cmp_adminA'), {
        uid: 'usr_cmp_adminA',
        phoneE164: '+919000000009',
        status: 'ACTIVE',
        primaryRole: 'COMPANY_ADMIN',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_med_lko'), {
        uid: 'usr_med_lko',
        phoneE164: '+919000000010',
        status: 'ACTIVE',
        primaryRole: 'AUTHORITY_MEDICAL',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_med_dl'), {
        uid: 'usr_med_dl',
        phoneE164: '+919000000011',
        status: 'ACTIVE',
        primaryRole: 'AUTHORITY_MEDICAL',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_road_lko'), {
        uid: 'usr_road_lko',
        phoneE164: '+919000000012',
        status: 'ACTIVE',
        primaryRole: 'AUTHORITY_ROAD',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_support'), {
        uid: 'usr_support',
        phoneE164: '+919000000013',
        status: 'ACTIVE',
        primaryRole: 'VEERXCAPE_SUPPORT',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_ops_admin'), {
        uid: 'usr_ops_admin',
        phoneE164: '+919000000014',
        status: 'ACTIVE',
        primaryRole: 'VEERXCAPE_ADMIN',
        sessionVersion: 1
      });
      await setDoc(doc(db, 'users', 'usr_super_admin'), {
        uid: 'usr_super_admin',
        phoneE164: '+919000000015',
        status: 'ACTIVE',
        primaryRole: 'VEERXCAPE_SUPER_ADMIN',
        sessionVersion: 1
      });

      // 2. UserProfiles
      await setDoc(doc(db, 'userProfiles', 'usr_owner_1'), {
        uid: 'usr_owner_1',
        fullName: 'Aarav Sharma',
        phoneE164: '+919000000001'
      });

      // 3. UserRoles
      await setDoc(
        doc(db, 'userRoles', 'usr_staff_shwA_SHOWROOM_STAFF_shw_A'),
        {
          id: 'usr_staff_shwA_SHOWROOM_STAFF_shw_A',
          userId: 'usr_staff_shwA',
          role: 'SHOWROOM_STAFF',
          scopeType: 'SHOWROOM',
          scopeId: 'shw_A',
          companyId: 'cmp_A',
          showroomId: 'shw_A',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_staff_shwB_SHOWROOM_STAFF_shw_B'),
        {
          id: 'usr_staff_shwB_SHOWROOM_STAFF_shw_B',
          userId: 'usr_staff_shwB',
          role: 'SHOWROOM_STAFF',
          scopeType: 'SHOWROOM',
          scopeId: 'shw_B',
          companyId: 'cmp_B',
          showroomId: 'shw_B',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_cmp_adminA_COMPANY_ADMIN_cmp_A'),
        {
          id: 'usr_cmp_adminA_COMPANY_ADMIN_cmp_A',
          userId: 'usr_cmp_adminA',
          role: 'COMPANY_ADMIN',
          scopeType: 'COMPANY',
          scopeId: 'cmp_A',
          companyId: 'cmp_A',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_med_lko_AUTHORITY_MEDICAL_auth_med_lko'),
        {
          id: 'usr_med_lko_AUTHORITY_MEDICAL_auth_med_lko',
          userId: 'usr_med_lko',
          role: 'AUTHORITY_MEDICAL',
          scopeType: 'AUTHORITY',
          scopeId: 'auth_med_lko',
          authorityId: 'auth_med_lko',
          department: 'MEDICAL',
          jurisdictionCode: 'IN-UP-LKO',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_med_lko_AUTHORITY_MEDICAL_IN-UP-LKO'),
        {
          id: 'usr_med_lko_AUTHORITY_MEDICAL_IN-UP-LKO',
          userId: 'usr_med_lko',
          role: 'AUTHORITY_MEDICAL',
          scopeType: 'AUTHORITY',
          scopeId: 'IN-UP-LKO',
          authorityId: 'auth_med_lko',
          department: 'MEDICAL',
          jurisdictionCode: 'IN-UP-LKO',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_med_dl_AUTHORITY_MEDICAL_IN-DL-NEW'),
        {
          id: 'usr_med_dl_AUTHORITY_MEDICAL_IN-DL-NEW',
          userId: 'usr_med_dl',
          role: 'AUTHORITY_MEDICAL',
          scopeType: 'AUTHORITY',
          scopeId: 'IN-DL-NEW',
          authorityId: 'auth_med_dl',
          department: 'MEDICAL',
          jurisdictionCode: 'IN-DL-NEW',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_road_lko_AUTHORITY_ROAD_auth_road_lko'),
        {
          id: 'usr_road_lko_AUTHORITY_ROAD_auth_road_lko',
          userId: 'usr_road_lko',
          role: 'AUTHORITY_ROAD',
          scopeType: 'AUTHORITY',
          scopeId: 'auth_road_lko',
          authorityId: 'auth_road_lko',
          department: 'ROAD',
          jurisdictionCode: 'IN-UP-LKO',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_road_lko_AUTHORITY_ROAD_IN-UP-LKO'),
        {
          id: 'usr_road_lko_AUTHORITY_ROAD_IN-UP-LKO',
          userId: 'usr_road_lko',
          role: 'AUTHORITY_ROAD',
          scopeType: 'AUTHORITY',
          scopeId: 'IN-UP-LKO',
          authorityId: 'auth_road_lko',
          department: 'ROAD',
          jurisdictionCode: 'IN-UP-LKO',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_support_VEERXCAPE_SUPPORT_PLATFORM'),
        {
          id: 'usr_support_VEERXCAPE_SUPPORT_PLATFORM',
          userId: 'usr_support',
          role: 'VEERXCAPE_SUPPORT',
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_ops_admin_VEERXCAPE_ADMIN_PLATFORM'),
        {
          id: 'usr_ops_admin_VEERXCAPE_ADMIN_PLATFORM',
          userId: 'usr_ops_admin',
          role: 'VEERXCAPE_ADMIN',
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE'
        }
      );
      await setDoc(
        doc(db, 'userRoles', 'usr_super_admin_VEERXCAPE_SUPER_ADMIN_PLATFORM'),
        {
          id: 'usr_super_admin_VEERXCAPE_SUPER_ADMIN_PLATFORM',
          userId: 'usr_super_admin',
          role: 'VEERXCAPE_SUPER_ADMIN',
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE'
        }
      );

      // 4..7. Organisations, Companies, Showrooms, Authorities
      await setDoc(doc(db, 'organisations', 'org_A'), {
        id: 'org_A',
        name: 'Tata Motors Organisation',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'companies', 'cmp_A'), {
        id: 'cmp_A',
        organisationId: 'org_A',
        brandName: 'Tata Motors',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'companies', 'cmp_B'), {
        id: 'cmp_B',
        organisationId: 'org_B',
        brandName: 'Mahindra',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'showrooms', 'shw_A'), {
        id: 'shw_A',
        companyId: 'cmp_A',
        name: 'Tata Lucknow',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'showrooms', 'shw_B'), {
        id: 'shw_B',
        companyId: 'cmp_B',
        name: 'Mahindra Pune',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'authorities', 'auth_med_lko'), {
        id: 'auth_med_lko',
        name: 'Lucknow EMS',
        department: 'MEDICAL',
        jurisdictionCode: 'IN-UP-LKO',
        verificationStatus: 'VERIFIED'
      });
      await setDoc(doc(db, 'authorities', 'auth_road_lko'), {
        id: 'auth_road_lko',
        name: 'Lucknow Highway Dept',
        department: 'ROAD',
        jurisdictionCode: 'IN-UP-LKO',
        verificationStatus: 'VERIFIED'
      });

      // 8..12. Vehicles, Owners, Drivers, FamilyMemberships, EmergencyContacts
      await setDoc(doc(db, 'vehicles', 'veh_A1'), {
        id: 'veh_A1',
        registrationNumber: 'UP32AA1111',
        companyId: 'cmp_A',
        registeredByShowroomId: 'shw_A',
        primaryOwnerId: 'usr_owner_1',
        registrationStatus: 'ACTIVE'
      });
      await setDoc(doc(db, 'vehicleOwners', 'veh_A1_usr_owner_1'), {
        id: 'veh_A1_usr_owner_1',
        vehicleId: 'veh_A1',
        userId: 'usr_owner_1',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'vehicleDrivers', 'veh_A1_usr_driver_1'), {
        id: 'veh_A1_usr_driver_1',
        vehicleId: 'veh_A1',
        driverUserId: 'usr_driver_1',
        assignedByOwnerId: 'usr_owner_1',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'familyMemberships', 'veh_A1_usr_family_1'), {
        id: 'veh_A1_usr_family_1',
        vehicleId: 'veh_A1',
        ownerUserId: 'usr_owner_1',
        familyUserId: 'usr_family_1',
        status: 'ACTIVE',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      });
      await setDoc(doc(db, 'familyMemberships', 'veh_A1_usr_family_no_tel'), {
        id: 'veh_A1_usr_family_no_tel',
        vehicleId: 'veh_A1',
        ownerUserId: 'usr_owner_1',
        familyUserId: 'usr_family_no_tel',
        status: 'ACTIVE',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: false,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: false,
          canTriggerSos: false
        }
      });
      await setDoc(doc(db, 'familyMemberships', 'veh_A1_usr_family_revoked'), {
        id: 'veh_A1_usr_family_revoked',
        vehicleId: 'veh_A1',
        ownerUserId: 'usr_owner_1',
        familyUserId: 'usr_family_revoked',
        status: 'REVOKED',
        permissions: {
          canViewLocation: true,
          canViewTelemetry: true,
          canReceiveCriticalAlerts: true,
          canViewIncidentHistory: true,
          canTriggerSos: true
        }
      });
      await setDoc(doc(db, 'emergencyContacts', 'ec_1'), {
        id: 'ec_1',
        vehicleId: 'veh_A1',
        ownerUserId: 'usr_owner_1',
        name: 'Emergency Contact 1',
        phoneE164: '+919999988888'
      });

      // 13..16. Devices, DeviceAssignments, DeviceHeartbeats, Telemetry
      await setDoc(doc(db, 'devices', 'dev_A1'), {
        id: 'dev_A1',
        serialNumber: 'VX-STM32U575-0001',
        allocatedCompanyId: 'cmp_A',
        allocatedShowroomId: 'shw_A',
        assignedVehicleId: 'veh_A1',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'deviceAssignments', 'asg_A1'), {
        id: 'asg_A1',
        deviceId: 'dev_A1',
        vehicleId: 'veh_A1',
        companyId: 'cmp_A',
        showroomId: 'shw_A',
        status: 'ACTIVE'
      });
      await setDoc(doc(db, 'deviceHeartbeats', 'hb_A1'), {
        id: 'hb_A1',
        deviceId: 'dev_A1',
        vehicleId: 'veh_A1',
        mcuUptimeSeconds: 120
      });
      await setDoc(doc(db, 'telemetry', 'tel_A1'), {
        id: 'tel_A1',
        deviceId: 'dev_A1',
        vehicleId: 'veh_A1',
        speedKmh: 55
      });

      // 17..21. Incidents, IncidentEvents, IncidentUpdates, Alerts, Notifications
      await setDoc(doc(db, 'incidents', 'inc_crash_lko'), {
        id: 'inc_crash_lko',
        vehicleId: 'veh_A1',
        incidentType: 'ACCIDENT_DETECTED',
        lifecycleState: 'VISIBLE_TO_AUTHORITY',
        location: {
          lat: 26.85,
          lng: 80.95,
          jurisdictionCode: 'IN-UP-LKO'
        },
        authorizedDepartments: ['MEDICAL', 'POLICE', 'ROAD'],
        sharedWithFamilyIds: ['usr_family_1', 'usr_family_no_tel']
      });
      await setDoc(doc(db, 'incidents', 'inc_theft_lko'), {
        id: 'inc_theft_lko',
        vehicleId: 'veh_A1',
        incidentType: 'THEFT_OR_INTRUSION_ALERT',
        lifecycleState: 'VISIBLE_TO_AUTHORITY',
        location: {
          lat: 26.85,
          lng: 80.95,
          jurisdictionCode: 'IN-UP-LKO'
        },
        authorizedDepartments: ['POLICE'],
        sharedWithFamilyIds: []
      });
      await setDoc(doc(db, 'incidentEvents', 'iev_1'), {
        id: 'iev_1',
        incidentId: 'inc_crash_lko',
        vehicleId: 'veh_A1',
        eventType: 'INCIDENT_REPORTED',
        summary: 'Crash detected by STM32U575'
      });
      await setDoc(doc(db, 'incidentUpdates', 'iup_public'), {
        id: 'iup_public',
        incidentId: 'inc_crash_lko',
        vehicleId: 'veh_A1',
        visibility: 'CUSTOMER_VISIBLE',
        note: 'Ambulance dispatched'
      });
      await setDoc(doc(db, 'incidentUpdates', 'iup_internal'), {
        id: 'iup_internal',
        incidentId: 'inc_crash_lko',
        vehicleId: 'veh_A1',
        visibility: 'AUTHORITY_INTERNAL',
        note: 'Internal police dispatch note'
      });
      await setDoc(doc(db, 'alerts', 'alt_1'), {
        id: 'alt_1',
        incidentId: 'inc_crash_lko',
        vehicleId: 'veh_A1',
        targetUserIds: ['usr_owner_1', 'usr_family_1']
      });
      await setDoc(doc(db, 'notifications', 'ntf_1'), {
        id: 'ntf_1',
        recipientUserId: 'usr_owner_1',
        status: 'FCM_ACCEPTED'
      });

      // 22..24. AuditLogs, SupportTickets, SystemConfiguration
      await setDoc(doc(db, 'auditLogs', 'aud_1'), {
        id: 'aud_1',
        sequenceIndex: 1,
        action: 'VEHICLE_REGISTERED'
      });
      await setDoc(doc(db, 'supportTickets', 'tkt_1'), {
        id: 'tkt_1',
        createdByUserId: 'usr_owner_1',
        subject: 'GPS calibration check'
      });
      await setDoc(doc(db, 'systemConfiguration', 'ALERT_POLICY'), {
        id: 'ALERT_POLICY',
        version: 1,
        value: { cancelWindowSeconds: 15 }
      });

      // 25..28. Server-only collections (_uniqueLocks, _authSecrets, _otpChallenges, _deviceKeyVault)
      await setDoc(doc(db, '_uniqueLocks', 'phone_+919000000001'), {
        lockKey: 'phone_+919000000001',
        entityId: 'usr_owner_1'
      });
      await setDoc(doc(db, '_authSecrets', 'usr_owner_1'), {
        uid: 'usr_owner_1',
        passwordHashHex: 'secret_hash'
      });
      await setDoc(doc(db, '_otpChallenges', 'ch_1'), {
        id: 'ch_1',
        otpHashHex: 'otp_hash'
      });
      await setDoc(doc(db, '_deviceKeyVault', 'dev_A1'), {
        deviceId: 'dev_A1',
        encryptedCurrentKeyHex: 'enc_key'
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('1. locks down all 4 server-only collections (_uniqueLocks, _authSecrets, _otpChallenges, _deviceKeyVault) against every client role including Super Admin', async () => {
    expect(Object.keys(SERVER_ONLY_COLLECTIONS)).toHaveLength(4);
    expect(Object.keys(DOMAIN_COLLECTIONS)).toHaveLength(24);
    expect(Object.keys(FIRESTORE_COLLECTIONS)).toHaveLength(28);

    const superAdminDb = testEnv
      .authenticatedContext('usr_super_admin', { sv: 1, tier: 'ADMIN' })
      .firestore();
    const ownerDb = testEnv
      .authenticatedContext('usr_owner_1', { sv: 2, tier: 'CUSTOMER' })
      .firestore();
    const unauthDb = testEnv.unauthenticatedContext().firestore();

    const serverCollectionDocs: Array<[string, string]> = [
      ['_uniqueLocks', 'phone_+919000000001'],
      ['_authSecrets', 'usr_owner_1'],
      ['_otpChallenges', 'ch_1'],
      ['_deviceKeyVault', 'dev_A1']
    ];

    for (const [col, docId] of serverCollectionDocs) {
      for (const db of [superAdminDb, ownerDb, unauthDb]) {
        await assertFails(getDoc(doc(db, col, docId)));
        await assertFails(setDoc(doc(db, col, 'tamper_doc'), { hacked: true }));
      }
    }
  });

  it('2. enforces identity, sessionVersion revocation, account suspension, and prevents self-assigning privileged roles on users, userProfiles, and userRoles', async () => {
    const owner1Db = testEnv
      .authenticatedContext('usr_owner_1', { sv: 2, tier: 'CUSTOMER' })
      .firestore();
    const staleOwner1Db = testEnv
      .authenticatedContext('usr_owner_1', { sv: 1, tier: 'CUSTOMER' })
      .firestore();
    const suspendedDb = testEnv
      .authenticatedContext('usr_suspended', { sv: 2, tier: 'CUSTOMER' })
      .firestore();

    // Owner 1 with current sessionVersion (sv: 2) can read their own user & profile
    await assertSucceeds(getDoc(doc(owner1Db, 'users', 'usr_owner_1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'userProfiles', 'usr_owner_1')));

    // Owner 1 cannot read Owner 2's user document
    await assertFails(getDoc(doc(owner1Db, 'users', 'usr_owner_2')));

    // Stale token (sv: 1 != sessionVersion: 2) or suspended account is immediately denied on userProfiles
    await assertFails(getDoc(doc(staleOwner1Db, 'userProfiles', 'usr_owner_1')));
    await assertFails(getDoc(doc(suspendedDb, 'userProfiles', 'usr_suspended')));

    // No user can write/update their user doc or assign themselves a privileged role in userRoles
    await assertFails(
      updateDoc(doc(owner1Db, 'users', 'usr_owner_1'), {
        primaryRole: 'VEERXCAPE_SUPER_ADMIN'
      })
    );
    await assertFails(
      setDoc(
        doc(owner1Db, 'userRoles', 'usr_owner_1_VEERXCAPE_SUPER_ADMIN_PLATFORM'),
        {
          userId: 'usr_owner_1',
          role: 'VEERXCAPE_SUPER_ADMIN',
          scopeType: 'PLATFORM',
          scopeId: 'PLATFORM',
          status: 'ACTIVE'
        }
      )
    );
  });

  it('3. enforces customer ownership, family-member granular permissions, and driver restrictions across vehicles, vehicleOwners, vehicleDrivers, familyMemberships, emergencyContacts, devices, deviceAssignments, deviceHeartbeats, and telemetry', async () => {
    const owner1Db = testEnv
      .authenticatedContext('usr_owner_1', { sv: 2, tier: 'CUSTOMER' })
      .firestore();
    const owner2Db = testEnv
      .authenticatedContext('usr_owner_2', { sv: 1, tier: 'CUSTOMER' })
      .firestore();
    const famWithTelDb = testEnv
      .authenticatedContext('usr_family_1', { sv: 1, tier: 'CUSTOMER' })
      .firestore();
    const famNoTelDb = testEnv
      .authenticatedContext('usr_family_no_tel', { sv: 1, tier: 'CUSTOMER' })
      .firestore();
    const famRevokedDb = testEnv
      .authenticatedContext('usr_family_revoked', { sv: 1, tier: 'CUSTOMER' })
      .firestore();
    const driver1Db = testEnv
      .authenticatedContext('usr_driver_1', { sv: 1, tier: 'CUSTOMER' })
      .firestore();

    // Vehicle owner can read their vehicle, ownership, driver assignment, family membership, emergency contact, device, assignment, heartbeat, and telemetry
    await assertSucceeds(getDoc(doc(owner1Db, 'vehicles', 'veh_A1')));
    await assertSucceeds(
      getDoc(doc(owner1Db, 'vehicleOwners', 'veh_A1_usr_owner_1'))
    );
    await assertSucceeds(
      getDoc(doc(owner1Db, 'vehicleDrivers', 'veh_A1_usr_driver_1'))
    );
    await assertSucceeds(
      getDoc(doc(owner1Db, 'familyMemberships', 'veh_A1_usr_family_1'))
    );
    await assertSucceeds(getDoc(doc(owner1Db, 'emergencyContacts', 'ec_1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'devices', 'dev_A1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'deviceAssignments', 'asg_A1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'deviceHeartbeats', 'hb_A1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'telemetry', 'tel_A1')));

    // Unrelated Owner 2 cannot read Owner 1's vehicle, telemetry, device, or emergency contacts
    await assertFails(getDoc(doc(owner2Db, 'vehicles', 'veh_A1')));
    await assertFails(
      getDoc(doc(owner2Db, 'vehicleOwners', 'veh_A1_usr_owner_1'))
    );
    await assertFails(getDoc(doc(owner2Db, 'emergencyContacts', 'ec_1')));
    await assertFails(getDoc(doc(owner2Db, 'devices', 'dev_A1')));
    await assertFails(getDoc(doc(owner2Db, 'telemetry', 'tel_A1')));

    // Family member with canViewTelemetry: true can read vehicle and telemetry, but NOT emergencyContacts or deviceHeartbeats
    await assertSucceeds(getDoc(doc(famWithTelDb, 'vehicles', 'veh_A1')));
    await assertSucceeds(
      getDoc(doc(famWithTelDb, 'familyMemberships', 'veh_A1_usr_family_1'))
    );
    await assertSucceeds(getDoc(doc(famWithTelDb, 'telemetry', 'tel_A1')));
    await assertFails(getDoc(doc(famWithTelDb, 'emergencyContacts', 'ec_1')));
    await assertFails(getDoc(doc(famWithTelDb, 'deviceHeartbeats', 'hb_A1')));

    // Family member with canViewTelemetry: false can read vehicle, but is DENIED on telemetry
    await assertSucceeds(getDoc(doc(famNoTelDb, 'vehicles', 'veh_A1')));
    await assertFails(getDoc(doc(famNoTelDb, 'telemetry', 'tel_A1')));

    // Revoked family member is immediately DENIED on vehicle, familyMemberships, and telemetry
    await assertFails(getDoc(doc(famRevokedDb, 'vehicles', 'veh_A1')));
    await assertFails(
      getDoc(doc(famRevokedDb, 'familyMemberships', 'veh_A1_usr_family_revoked'))
    );
    await assertFails(getDoc(doc(famRevokedDb, 'telemetry', 'tel_A1')));

    // Assigned driver can read vehicle and their driver assignment, but NOT telemetry, familyMemberships, or emergencyContacts
    await assertSucceeds(getDoc(doc(driver1Db, 'vehicles', 'veh_A1')));
    await assertSucceeds(
      getDoc(doc(driver1Db, 'vehicleDrivers', 'veh_A1_usr_driver_1'))
    );
    await assertFails(getDoc(doc(driver1Db, 'telemetry', 'tel_A1')));
    await assertFails(
      getDoc(doc(driver1Db, 'familyMemberships', 'veh_A1_usr_family_1'))
    );
    await assertFails(getDoc(doc(driver1Db, 'emergencyContacts', 'ec_1')));
  });

  it('4. enforces showroom and parent-company tenant isolation across companies, showrooms, vehicles, devices, and deviceAssignments', async () => {
    const staffShwADb = testEnv
      .authenticatedContext('usr_staff_shwA', { sv: 1, tier: 'DEALER' })
      .firestore();
    const staffShwBDb = testEnv
      .authenticatedContext('usr_staff_shwB', { sv: 1, tier: 'DEALER' })
      .firestore();
    const cmpAdminADb = testEnv
      .authenticatedContext('usr_cmp_adminA', { sv: 1, tier: 'DEALER' })
      .firestore();

    // Showroom A staff can read Showroom A, Vehicle A1, Device A1, Assignment A1
    await assertSucceeds(getDoc(doc(staffShwADb, 'showrooms', 'shw_A')));
    await assertSucceeds(getDoc(doc(staffShwADb, 'vehicles', 'veh_A1')));
    await assertSucceeds(getDoc(doc(staffShwADb, 'devices', 'dev_A1')));
    await assertSucceeds(getDoc(doc(staffShwADb, 'deviceAssignments', 'asg_A1')));

    // Showroom A staff CANNOT read Showroom B or Company A/B tenant docs
    await assertFails(getDoc(doc(staffShwADb, 'showrooms', 'shw_B')));
    await assertFails(getDoc(doc(staffShwADb, 'companies', 'cmp_A')));
    await assertFails(getDoc(doc(staffShwADb, 'companies', 'cmp_B')));

    // Showroom B staff CANNOT read Showroom A, Vehicle A1, Device A1, or Assignment A1
    await assertFails(getDoc(doc(staffShwBDb, 'showrooms', 'shw_A')));
    await assertFails(getDoc(doc(staffShwBDb, 'vehicles', 'veh_A1')));
    await assertFails(getDoc(doc(staffShwBDb, 'devices', 'dev_A1')));
    await assertFails(getDoc(doc(staffShwBDb, 'deviceAssignments', 'asg_A1')));

    // Company A Admin can read Company A, Showroom A, Vehicle A1, Device A1, Assignment A1, but NOT Company B or Showroom B
    await assertSucceeds(getDoc(doc(cmpAdminADb, 'companies', 'cmp_A')));
    await assertSucceeds(getDoc(doc(cmpAdminADb, 'showrooms', 'shw_A')));
    await assertSucceeds(getDoc(doc(cmpAdminADb, 'vehicles', 'veh_A1')));
    await assertFails(getDoc(doc(cmpAdminADb, 'companies', 'cmp_B')));
    await assertFails(getDoc(doc(cmpAdminADb, 'showrooms', 'shw_B')));
  });

  it('5. enforces authority department and jurisdiction restrictions and blocks direct client mutation of incidents, incidentEvents, incidentUpdates, alerts, notifications, auditLogs, supportTickets, and systemConfiguration', async () => {
    const medLkoDb = testEnv
      .authenticatedContext('usr_med_lko', { sv: 1, tier: 'AUTHORITY' })
      .firestore();
    const medDlDb = testEnv
      .authenticatedContext('usr_med_dl', { sv: 1, tier: 'AUTHORITY' })
      .firestore();
    const roadLkoDb = testEnv
      .authenticatedContext('usr_road_lko', { sv: 1, tier: 'AUTHORITY' })
      .firestore();
    const owner1Db = testEnv
      .authenticatedContext('usr_owner_1', { sv: 2, tier: 'CUSTOMER' })
      .firestore();
    const supportDb = testEnv
      .authenticatedContext('usr_support', { sv: 1, tier: 'ADMIN' })
      .firestore();
    const opsAdminDb = testEnv
      .authenticatedContext('usr_ops_admin', { sv: 1, tier: 'ADMIN' })
      .firestore();
    const superAdminDb = testEnv
      .authenticatedContext('usr_super_admin', { sv: 1, tier: 'ADMIN' })
      .firestore();

    // Medical authority in IN-UP-LKO can read their own authority doc and MEDICAL-authorized crash incident in IN-UP-LKO
    await assertSucceeds(getDoc(doc(medLkoDb, 'authorities', 'auth_med_lko')));
    await assertFails(getDoc(doc(medLkoDb, 'authorities', 'auth_road_lko')));
    await assertSucceeds(getDoc(doc(medLkoDb, 'incidents', 'inc_crash_lko')));

    // Medical authority in IN-UP-LKO CANNOT read POLICE-only theft incident
    await assertFails(getDoc(doc(medLkoDb, 'incidents', 'inc_theft_lko')));

    // Medical authority in IN-DL-NEW (different jurisdiction) CANNOT read IN-UP-LKO crash incident
    await assertFails(getDoc(doc(medDlDb, 'incidents', 'inc_crash_lko')));

    // Road authority in IN-UP-LKO can read their own authority doc, but CANNOT read raw /incidents/{id} (must use anonymized Cloud Function API)
    await assertSucceeds(getDoc(doc(roadLkoDb, 'authorities', 'auth_road_lko')));
    await assertFails(getDoc(doc(roadLkoDb, 'incidents', 'inc_crash_lko')));

    // Owner 1 can read incident, incidentEvents, public incidentUpdates, alerts, notifications, and supportTickets, but NOT AUTHORITY_INTERNAL incidentUpdates
    await assertSucceeds(getDoc(doc(owner1Db, 'incidents', 'inc_crash_lko')));
    await assertSucceeds(getDoc(doc(owner1Db, 'incidentEvents', 'iev_1')));
    await assertSucceeds(
      getDoc(doc(owner1Db, 'incidentUpdates', 'iup_public'))
    );
    await assertFails(
      getDoc(doc(owner1Db, 'incidentUpdates', 'iup_internal'))
    );
    await assertSucceeds(getDoc(doc(owner1Db, 'alerts', 'alt_1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'notifications', 'ntf_1')));
    await assertSucceeds(getDoc(doc(owner1Db, 'supportTickets', 'tkt_1')));

    // Governance collections: organisations & systemConfiguration readable by VeerXcape staff; auditLogs readable ONLY by VEERXCAPE_ADMIN and VEERXCAPE_SUPER_ADMIN
    await assertFails(getDoc(doc(owner1Db, 'organisations', 'org_A')));
    await assertFails(
      getDoc(doc(owner1Db, 'systemConfiguration', 'ALERT_POLICY'))
    );
    await assertFails(getDoc(doc(owner1Db, 'auditLogs', 'aud_1')));

    await assertSucceeds(getDoc(doc(supportDb, 'organisations', 'org_A')));
    await assertSucceeds(
      getDoc(doc(supportDb, 'systemConfiguration', 'ALERT_POLICY'))
    );
    await assertFails(getDoc(doc(supportDb, 'auditLogs', 'aud_1')));

    await assertSucceeds(getDoc(doc(opsAdminDb, 'auditLogs', 'aud_1')));
    await assertSucceeds(getDoc(doc(superAdminDb, 'auditLogs', 'aud_1')));

    // Immutable incidentEvents and auditLogs cannot be created, updated, or deleted by ANY client (even Super Admin)
    for (const db of [owner1Db, opsAdminDb, superAdminDb]) {
      await assertFails(
        setDoc(doc(db, 'incidentEvents', 'iev_forged'), {
          incidentId: 'inc_crash_lko',
          eventType: 'RESOLVED'
        })
      );
      await assertFails(
        updateDoc(doc(db, 'incidentEvents', 'iev_1'), {
          summary: 'Tampered summary'
        })
      );
      await assertFails(deleteDoc(doc(db, 'incidentEvents', 'iev_1')));

      await assertFails(
        setDoc(doc(db, 'auditLogs', 'aud_forged'), {
          sequenceIndex: 99,
          action: 'FORGED'
        })
      );
      await assertFails(
        updateDoc(doc(db, 'auditLogs', 'aud_1'), {
          action: 'TAMPERED'
        })
      );
      await assertFails(deleteDoc(doc(db, 'auditLogs', 'aud_1')));
    }
  });
});

