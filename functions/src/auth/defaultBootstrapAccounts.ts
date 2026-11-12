import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS,
  type AuthorityDepartment,
  type RoleScopeType,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import type {
  AuthorityDocument,
  AuthSecretsDocument,
  CompanyDocument,
  DeviceAssignmentDocument,
  DeviceDocument,
  EmergencyContactDocument,
  FamilyMembershipDocument,
  OrganisationDocument,
  ShowroomDocument,
  UniqueLockDocument,
  UserDocument,
  UserProfileDocument,
  UserRoleDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import { hashSecretWithScrypt } from '../shared/cryptoUtils.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

export interface DefaultBootstrapAccountSpec {
  uid: string;
  phoneE164: string;
  email: string;
  password: string;
  fullName: string;
  primaryRole: UserRoleCode;
  scopeType: RoleScopeType;
  scopeId: string;
  companyId?: string | null;
  showroomId?: string | null;
  authorityId?: string | null;
  vehicleId?: string | null;
  department?: AuthorityDepartment | null;
  jurisdictionCode?: string | null;
}

export const DEFAULT_BOOTSTRAP_IDS = {
  oemOrgId: 'org_default_tata',
  govOrgId: 'org_default_up_gov',
  companyId: 'comp_default_tata',
  showroomId: 'shw_default_lko',
  medicalAuthorityId: 'auth_default_med_lko',
  policeAuthorityId: 'auth_default_pol_lko',
  roadAuthorityId: 'auth_default_road_lko',
  activeDeviceId: 'dev_default_vx9501',
  spareProvisionedDeviceId: 'dev_default_vx9502',
  vehicleId: 'veh_default_up32vx9501',
  ownerUid: 'usr_default_owner',
  familyUid: 'usr_default_family',
  driverUid: 'usr_default_driver',
  superAdminUid: 'usr_default_super_admin'
} as const;

export const DEFAULT_BOOTSTRAP_ACCOUNTS: readonly DefaultBootstrapAccountSpec[] = [
  {
    uid: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
    phoneE164: '+919500000001',
    email: 'superadmin@veerxcape.in',
    password: 'Admin@VeerXcape2026',
    fullName: 'Dr. Vikramaditya Rathore',
    primaryRole: 'VEERXCAPE_SUPER_ADMIN',
    scopeType: 'PLATFORM',
    scopeId: 'PLATFORM'
  },
  {
    uid: 'usr_default_ops_admin',
    phoneE164: '+919500000002',
    email: 'opsadmin@veerxcape.in',
    password: 'OpsAdmin@VeerXcape2026',
    fullName: 'Siddharth Nair',
    primaryRole: 'VEERXCAPE_ADMIN',
    scopeType: 'PLATFORM',
    scopeId: 'PLATFORM'
  },
  {
    uid: 'usr_default_company_admin',
    phoneE164: '+919500000003',
    email: 'oem.admin@tatamotors.veerxcape.in',
    password: 'Company@VeerXcape2026',
    fullName: 'Rajeshwar Kulkarni',
    primaryRole: 'COMPANY_ADMIN',
    scopeType: 'COMPANY',
    scopeId: DEFAULT_BOOTSTRAP_IDS.companyId,
    companyId: DEFAULT_BOOTSTRAP_IDS.companyId
  },
  {
    uid: 'usr_default_showroom_manager',
    phoneE164: '+919500000004',
    email: 'manager.lko@tatamotors.veerxcape.in',
    password: 'Showroom@VeerXcape2026',
    fullName: 'Ananya Tiwari',
    primaryRole: 'SHOWROOM_MANAGER',
    scopeType: 'SHOWROOM',
    scopeId: DEFAULT_BOOTSTRAP_IDS.showroomId,
    companyId: DEFAULT_BOOTSTRAP_IDS.companyId,
    showroomId: DEFAULT_BOOTSTRAP_IDS.showroomId
  },
  {
    uid: 'usr_default_showroom_staff',
    phoneE164: '+919500000005',
    email: 'staff.lko@tatamotors.veerxcape.in',
    password: 'Staff@VeerXcape2026',
    fullName: 'Rohan Verma',
    primaryRole: 'SHOWROOM_STAFF',
    scopeType: 'SHOWROOM',
    scopeId: DEFAULT_BOOTSTRAP_IDS.showroomId,
    companyId: DEFAULT_BOOTSTRAP_IDS.companyId,
    showroomId: DEFAULT_BOOTSTRAP_IDS.showroomId
  },
  {
    uid: 'usr_default_authority_medical',
    phoneE164: '+919500000006',
    email: 'trauma.dispatch@sgpgi.up.gov.in',
    password: 'Medical@VeerXcape2026',
    fullName: 'Dr. Kavita Mishra',
    primaryRole: 'AUTHORITY_MEDICAL',
    scopeType: 'AUTHORITY',
    scopeId: DEFAULT_BOOTSTRAP_IDS.medicalAuthorityId,
    authorityId: DEFAULT_BOOTSTRAP_IDS.medicalAuthorityId,
    department: 'MEDICAL',
    jurisdictionCode: 'IN-UP-LKO'
  },
  {
    uid: 'usr_default_authority_police',
    phoneE164: '+919500000007',
    email: 'highway.patrol@up112.up.gov.in',
    password: 'Police@VeerXcape2026',
    fullName: 'Insp. Devendra Pratap Singh',
    primaryRole: 'AUTHORITY_POLICE',
    scopeType: 'AUTHORITY',
    scopeId: DEFAULT_BOOTSTRAP_IDS.policeAuthorityId,
    authorityId: DEFAULT_BOOTSTRAP_IDS.policeAuthorityId,
    department: 'POLICE',
    jurisdictionCode: 'IN-UP-LKO'
  },
  {
    uid: 'usr_default_authority_road',
    phoneE164: '+919500000008',
    email: 'corridor.ops@nhai.gov.in',
    password: 'Road@VeerXcape2026',
    fullName: 'Er. Alok Srivastava',
    primaryRole: 'AUTHORITY_ROAD',
    scopeType: 'AUTHORITY',
    scopeId: DEFAULT_BOOTSTRAP_IDS.roadAuthorityId,
    authorityId: DEFAULT_BOOTSTRAP_IDS.roadAuthorityId,
    department: 'ROAD',
    jurisdictionCode: 'IN-UP-LKO'
  },
  {
    uid: DEFAULT_BOOTSTRAP_IDS.ownerUid,
    phoneE164: '+919500000009',
    email: 'aarav.sharma@example.com',
    password: 'Owner@VeerXcape2026',
    fullName: 'Aarav Sharma',
    primaryRole: 'VEHICLE_OWNER',
    scopeType: 'VEHICLE',
    scopeId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
    vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId
  },
  {
    uid: DEFAULT_BOOTSTRAP_IDS.familyUid,
    phoneE164: '+919500000010',
    email: 'priya.sharma@example.com',
    password: 'Family@VeerXcape2026',
    fullName: 'Priya Sharma',
    primaryRole: 'FAMILY_MEMBER',
    scopeType: 'VEHICLE',
    scopeId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
    vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId
  },
  {
    uid: DEFAULT_BOOTSTRAP_IDS.driverUid,
    phoneE164: '+919500000011',
    email: 'mahesh.yadav@example.com',
    password: 'Driver@VeerXcape2026',
    fullName: 'Mahesh Yadav',
    primaryRole: 'DRIVER',
    scopeType: 'VEHICLE',
    scopeId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
    vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId
  }
];

async function seedSingleBootstrapAccount(
  runtime: VeerXcapeBackendRuntime,
  spec: DefaultBootstrapAccountSpec,
  nowIso: string
): Promise<void> {
  const existingUser = await runtime.getDoc<UserDocument>(
    FIRESTORE_COLLECTIONS.USERS,
    spec.uid
  );
  if (existingUser) {
    return;
  }

  const { saltHex, hashHex } = hashSecretWithScrypt(spec.password);

  const userDoc: UserDocument = {
    uid: spec.uid,
    phoneE164: spec.phoneE164,
    email: spec.email,
    status: 'ACTIVE',
    primaryRole: spec.primaryRole,
    sessionVersion: 1,
    mfaEnrolled: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastLoginAt: null
  };

  const profileDoc: UserProfileDocument = {
    uid: spec.uid,
    fullName: spec.fullName,
    avatarUrl: null,
    language: 'en-IN',
    notificationPreferences: {
      pushEnabled: true,
      criticalAlertsOnly: false
    },
    privacySettings: {
      shareWithMedicalOnSos: true,
      shareWithPoliceOnSos: true
    },
    updatedAt: nowIso
  };

  const roleDocId = `role_${spec.uid}_${spec.primaryRole.toLowerCase()}`;
  const roleDoc: UserRoleDocument = {
    id: roleDocId,
    userId: spec.uid,
    role: spec.primaryRole,
    scopeType: spec.scopeType,
    scopeId: spec.scopeId,
    companyId: spec.companyId ?? null,
    showroomId: spec.showroomId ?? null,
    authorityId: spec.authorityId ?? null,
    vehicleId: spec.vehicleId ?? null,
    department: spec.department ?? null,
    jurisdictionCode: spec.jurisdictionCode ?? null,
    status: 'ACTIVE',
    grantedBy: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
    createdAt: nowIso,
    revokedAt: null
  };

  const secretsDoc: AuthSecretsDocument = {
    uid: spec.uid,
    passwordSaltHex: saltHex,
    passwordHashHex: hashHex,
    passwordUpdatedAt: nowIso,
    failedLoginAttempts: 0,
    lockoutUntil: null,
    pendingInviteSaltHex: null,
    pendingInviteHashHex: null,
    inviteExpiresAt: null
  };

  const phoneLockKey = UNIQUE_LOCK_KEYS.phone(spec.phoneE164);
  const phoneLockDoc: UniqueLockDocument = {
    lockKey: phoneLockKey,
    entityCollection: FIRESTORE_COLLECTIONS.USERS,
    entityId: spec.uid,
    createdAt: nowIso
  };

  await runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, spec.uid, userDoc);
  await runtime.setDoc(FIRESTORE_COLLECTIONS.USER_PROFILES, spec.uid, profileDoc);
  await runtime.setDoc(FIRESTORE_COLLECTIONS.USER_ROLES, roleDocId, roleDoc);
  await runtime.setDoc(FIRESTORE_COLLECTIONS.AUTH_SECRETS, spec.uid, secretsDoc);
  await runtime.setDoc(
    FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
    phoneLockKey,
    phoneLockDoc
  );
}

async function ensureDefaultReferenceEntities(
  runtime: VeerXcapeBackendRuntime,
  nowIso: string
): Promise<void> {
  const existingCompany = await runtime.getDoc<CompanyDocument>(
    FIRESTORE_COLLECTIONS.COMPANIES,
    DEFAULT_BOOTSTRAP_IDS.companyId
  );
  if (!existingCompany) {
    const oemOrg: OrganisationDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.oemOrgId,
      name: 'Tata Motors Passenger Vehicles Ltd.',
      type: 'AUTOMOTIVE_PARENT_COMPANY',
      registrationNumber: 'CIN-L28920MH1945PLC004520',
      status: 'ACTIVE',
      contactEmail: 'oem.admin@tatamotors.veerxcape.in',
      contactPhone: '+919500000003',
      approvedBy: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const companyDoc: CompanyDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.companyId,
      organisationId: DEFAULT_BOOTSTRAP_IDS.oemOrgId,
      brandName: 'Tata Motors',
      oemCode: 'TATA-IN',
      headquartersAddress: 'Bombay House, 24 Homi Mody Street, Mumbai, MH',
      status: 'ACTIVE',
      totalShowrooms: 1,
      totalVehiclesRegistered: 1,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const showroomDoc: ShowroomDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.showroomId,
      companyId: DEFAULT_BOOTSTRAP_IDS.companyId,
      name: 'Tata Motors Flagship Showroom — Gomti Nagar',
      dealerCode: 'TATA-UP32-01',
      city: 'Lucknow',
      stateCode: 'UP',
      address: 'Vibhuti Khand, Gomti Nagar, Lucknow, UP 226010',
      contactPhone: '+919500000004',
      contactEmail: 'manager.lko@tatamotors.veerxcape.in',
      status: 'ACTIVE',
      approvedBy: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.ORGANISATIONS,
      oemOrg.id,
      oemOrg
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.COMPANIES,
      companyDoc.id,
      companyDoc
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.SHOWROOMS,
      showroomDoc.id,
      showroomDoc
    );
  }

  const existingMedAuth = await runtime.getDoc<AuthorityDocument>(
    FIRESTORE_COLLECTIONS.AUTHORITIES,
    DEFAULT_BOOTSTRAP_IDS.medicalAuthorityId
  );
  if (!existingMedAuth) {
    const govOrg: OrganisationDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.govOrgId,
      name: 'Uttar Pradesh Emergency Response & Highway Safety Directorate',
      type: 'GOVERNMENT_AUTHORITY',
      registrationNumber: 'GOV-UP-ERHSD-2026',
      status: 'ACTIVE',
      contactEmail: 'controlroom@up112.up.gov.in',
      contactPhone: '+919500000007',
      approvedBy: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const medAuth: AuthorityDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.medicalAuthorityId,
      organisationId: DEFAULT_BOOTSTRAP_IDS.govOrgId,
      name: 'SGPGI Apex Trauma & EMS Dispatch Center — Lucknow',
      department: 'MEDICAL',
      jurisdictionState: 'UP',
      jurisdictionDistrict: 'Lucknow',
      jurisdictionCode: 'IN-UP-LKO',
      verificationStatus: 'VERIFIED',
      verifiedBySuperAdminId: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
      contactControlRoomPhone: '+919500000006',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const polAuth: AuthorityDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.policeAuthorityId,
      organisationId: DEFAULT_BOOTSTRAP_IDS.govOrgId,
      name: 'UP-112 Police Highway Patrol Command — Lucknow',
      department: 'POLICE',
      jurisdictionState: 'UP',
      jurisdictionDistrict: 'Lucknow',
      jurisdictionCode: 'IN-UP-LKO',
      verificationStatus: 'VERIFIED',
      verifiedBySuperAdminId: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
      contactControlRoomPhone: '+919500000007',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const roadAuth: AuthorityDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.roadAuthorityId,
      organisationId: DEFAULT_BOOTSTRAP_IDS.govOrgId,
      name: 'NHAI Lucknow Corridor Incident Management Unit',
      department: 'ROAD',
      jurisdictionState: 'UP',
      jurisdictionDistrict: 'Lucknow',
      jurisdictionCode: 'IN-UP-LKO',
      verificationStatus: 'VERIFIED',
      verifiedBySuperAdminId: DEFAULT_BOOTSTRAP_IDS.superAdminUid,
      contactControlRoomPhone: '+919500000008',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.ORGANISATIONS,
      govOrg.id,
      govOrg
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.AUTHORITIES,
      medAuth.id,
      medAuth
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.AUTHORITIES,
      polAuth.id,
      polAuth
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.AUTHORITIES,
      roadAuth.id,
      roadAuth
    );
  }

  const existingVehicle = await runtime.getDoc<VehicleDocument>(
    FIRESTORE_COLLECTIONS.VEHICLES,
    DEFAULT_BOOTSTRAP_IDS.vehicleId
  );
  if (!existingVehicle) {
    // Ensure owner, family, and driver accounts exist so vehicle relationships are valid
    for (const targetUid of [
      DEFAULT_BOOTSTRAP_IDS.ownerUid,
      DEFAULT_BOOTSTRAP_IDS.familyUid,
      DEFAULT_BOOTSTRAP_IDS.driverUid
    ]) {
      const spec = DEFAULT_BOOTSTRAP_ACCOUNTS.find((a) => a.uid === targetUid);
      if (spec) {
        await seedSingleBootstrapAccount(runtime, spec, nowIso);
      }
    }

    const activeDevice: DeviceDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.activeDeviceId,
      serialNumber: 'VX-STM32U575-9501',
      mcuModel: 'STM32U575RIT6',
      firmwareVersion: '2.4.0-release',
      imei: '359881095009501',
      simIccid: '89911012000095009501',
      secretVersion: 1,
      allocatedCompanyId: DEFAULT_BOOTSTRAP_IDS.companyId,
      allocatedShowroomId: DEFAULT_BOOTSTRAP_IDS.showroomId,
      assignedVehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      status: 'ACTIVE',
      lastSequenceNumber: 1,
      replayWindowBitmap: '0000000000000001',
      lastHeartbeatAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const spareDevice: DeviceDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.spareProvisionedDeviceId,
      serialNumber: 'VX-STM32U575-9502',
      mcuModel: 'STM32U575RIT6',
      firmwareVersion: '2.4.0-release',
      imei: '359881095009502',
      simIccid: '89911012000095009502',
      secretVersion: 1,
      allocatedCompanyId: DEFAULT_BOOTSTRAP_IDS.companyId,
      allocatedShowroomId: DEFAULT_BOOTSTRAP_IDS.showroomId,
      assignedVehicleId: null,
      status: 'PROVISIONED',
      lastSequenceNumber: 0,
      replayWindowBitmap: '0000000000000000',
      lastHeartbeatAt: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const vehicleDoc: VehicleDocument = {
      id: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      registrationNumber: 'UP32VX9501',
      vin: 'MAT631500RP950101',
      manufacturer: 'Tata Motors',
      model: 'Safari Accomplished+',
      variant: 'Dark Edition 2.0L Kryotec',
      manufacturingYear: 2026,
      color: 'Oberon Black',
      fuelType: 'DIESEL',
      companyId: DEFAULT_BOOTSTRAP_IDS.companyId,
      registeredByShowroomId: DEFAULT_BOOTSTRAP_IDS.showroomId,
      registeredByStaffId: 'usr_default_showroom_staff',
      primaryOwnerId: DEFAULT_BOOTSTRAP_IDS.ownerUid,
      assignedDeviceId: DEFAULT_BOOTSTRAP_IDS.activeDeviceId,
      registrationStatus: 'ACTIVE',
      registrationHistory: [
        {
          action: 'REGISTERED',
          actorUserId: 'usr_default_showroom_staff',
          actorRole: 'SHOWROOM_STAFF',
          timestamp: nowIso,
          summary: 'Vehicle registered at Tata Motors Flagship Showroom — Gomti Nagar.'
        },
        {
          action: 'DEVICE_ASSIGNED',
          actorUserId: 'usr_default_showroom_staff',
          actorRole: 'SHOWROOM_STAFF',
          timestamp: nowIso,
          summary: 'Assigned STM32U575 unit VX-STM32U575-9501.'
        },
        {
          action: 'CUSTOMER_ACTIVATED',
          actorUserId: DEFAULT_BOOTSTRAP_IDS.ownerUid,
          actorRole: 'VEHICLE_OWNER',
          timestamp: nowIso,
          summary: 'Primary owner verified and activated vehicle.'
        }
      ],
      liveStatusSummary: {
        connectionStatus: 'LIVE',
        lastSeenAt: nowIso,
        lastHeartbeatAt: nowIso,
        lastLocation: {
          lat: 26.8467,
          lng: 80.9462,
          accuracyMeters: 3.8,
          speedKmh: 48,
          heading: 115,
          recordedAt: nowIso
        },
        batteryVoltageMv: 13850,
        backupBatteryPercent: 98,
        powerSource: 'VEHICLE_12V'
      },
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const assignmentDoc: DeviceAssignmentDocument = {
      id: `asg_${DEFAULT_BOOTSTRAP_IDS.activeDeviceId}_${DEFAULT_BOOTSTRAP_IDS.vehicleId}`,
      deviceId: DEFAULT_BOOTSTRAP_IDS.activeDeviceId,
      vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      companyId: DEFAULT_BOOTSTRAP_IDS.companyId,
      showroomId: DEFAULT_BOOTSTRAP_IDS.showroomId,
      assignedByUserId: 'usr_default_showroom_staff',
      installationStatus: 'VERIFIED_ACTIVE',
      installedAt: nowIso,
      unassignedAt: null,
      notes: 'Factory-verified STM32U575 harness installation.'
    };

    const ownerDoc: VehicleOwnerDocument = {
      id: `${DEFAULT_BOOTSTRAP_IDS.vehicleId}_${DEFAULT_BOOTSTRAP_IDS.ownerUid}`,
      vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      userId: DEFAULT_BOOTSTRAP_IDS.ownerUid,
      ownershipType: 'PRIMARY_OWNER',
      status: 'ACTIVE',
      activatedAt: nowIso,
      createdAt: nowIso
    };

    const familyDoc: FamilyMembershipDocument = {
      id: `${DEFAULT_BOOTSTRAP_IDS.vehicleId}_${DEFAULT_BOOTSTRAP_IDS.familyUid}`,
      vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      ownerUserId: DEFAULT_BOOTSTRAP_IDS.ownerUid,
      familyUserId: DEFAULT_BOOTSTRAP_IDS.familyUid,
      familyMemberName: 'Priya Sharma',
      familyMemberPhoneE164: '+919500000010',
      relationship: 'Spouse',
      status: 'ACTIVE',
      permissions: {
        canViewLocation: true,
        canViewTelemetry: true,
        canReceiveCriticalAlerts: true,
        canViewIncidentHistory: true,
        canTriggerSos: true
      },
      createdAt: nowIso,
      activatedAt: nowIso,
      revokedAt: null
    };

    const driverDoc: VehicleDriverDocument = {
      id: `${DEFAULT_BOOTSTRAP_IDS.vehicleId}_${DEFAULT_BOOTSTRAP_IDS.driverUid}`,
      vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      driverUserId: DEFAULT_BOOTSTRAP_IDS.driverUid,
      assignedByOwnerId: DEFAULT_BOOTSTRAP_IDS.ownerUid,
      status: 'ACTIVE',
      permissions: {
        canTriggerSos: true,
        canViewLiveStatus: true
      },
      validFrom: nowIso,
      validUntil: null,
      createdAt: nowIso,
      revokedAt: null
    };

    const emergencyContactDoc: EmergencyContactDocument = {
      id: `ec_${DEFAULT_BOOTSTRAP_IDS.vehicleId}_1`,
      vehicleId: DEFAULT_BOOTSTRAP_IDS.vehicleId,
      ownerUserId: DEFAULT_BOOTSTRAP_IDS.ownerUid,
      name: 'Priya Sharma',
      phoneE164: '+919500000010',
      relationship: 'Spouse',
      priorityOrder: 1,
      notifyOnAccident: true,
      notifyOnSos: true,
      notifyOnOccupantAlert: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.DEVICES,
      activeDevice.id,
      activeDevice
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.DEVICES,
      spareDevice.id,
      spareDevice
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.VEHICLES,
      vehicleDoc.id,
      vehicleDoc
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.DEVICE_ASSIGNMENTS,
      assignmentDoc.id,
      assignmentDoc
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
      ownerDoc.id,
      ownerDoc
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
      familyDoc.id,
      familyDoc
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
      driverDoc.id,
      driverDoc
    );
    await runtime.setDoc(
      FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
      emergencyContactDoc.id,
      emergencyContactDoc
    );
  }
}

/**
 * Idempotently provisions the requested default bootstrap account (and its reference
 * organisation/showroom/authority/vehicle documents) if the phoneE164 matches one of
 * the dedicated default bootstrap accounts (`+919500000001`..`+919500000011`).
 */
export async function ensureDefaultBootstrapAccountIfMatching(
  runtime: VeerXcapeBackendRuntime,
  phoneE164: string
): Promise<string | null> {
  const matchedSpec = DEFAULT_BOOTSTRAP_ACCOUNTS.find(
    (item) => item.phoneE164 === phoneE164
  );
  if (!matchedSpec) {
    return null;
  }

  const nowIso = runtime.now().toISOString();
  await ensureDefaultReferenceEntities(runtime, nowIso);
  await seedSingleBootstrapAccount(runtime, matchedSpec, nowIso);
  return matchedSpec.uid;
}

