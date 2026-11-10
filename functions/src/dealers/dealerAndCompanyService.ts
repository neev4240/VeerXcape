import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  LOCATION_FRESHNESS_STATES,
  UNIQUE_LOCK_KEYS
} from '@veerxcape/shared-constants';
import { evaluateShowroomOrCompanyAccess } from '@veerxcape/shared-services';
import type {
  AuditLogDocument,
  CompanyDocument,
  DeviceAssignmentDocument,
  DeviceDocument,
  OtpChallengeDocument,
  ShowroomDocument,
  UniqueLockDocument,
  UserDocument,
  UserProfileDocument,
  UserRoleDocument,
  VehicleDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import {
  showroomCustomerOtpVerifyPayloadSchema,
  showroomVehicleRegistrationSchema,
  vehiclePermittedCorrectionPayloadSchema
} from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { AuthService } from '../auth/authService.js';
import { AppError } from '../shared/errors.js';
import {
  claimUniqueLockInTx,
  type VeerXcapeBackendRuntime
} from '../shared/runtime.js';

export class DealerAndCompanyService {
  private readonly audit: AuditService;
  private readonly authService: AuthService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
    this.authService = new AuthService(runtime);
  }

  /**
   * 9-Step Showroom Vehicle Registration & STM32U575 Device Assignment Workflow.
   * - Enforces active showroom & company tenant access.
   * - Requires verified customer phone OTP (`SHOWROOM_CUSTOMER_VERIFY`).
   * - Transactionally reserves `_uniqueLocks` for `reg_*`, `vin_*`, and `phone_*`.
   * - Assigns the showroom's STM32U575 device in 1:1 relation.
   * - Never allows showroom staff to set or view the customer's password.
   */
  async registerVehicleAndAssignDevice(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    rawInput: unknown;
  }): Promise<{
    vehicle: VehicleDocument;
    ownership: VehicleOwnerDocument;
    deviceAssignment: DeviceAssignmentDocument;
  }> {
    const parsed = showroomVehicleRegistrationSchema.parse(params.rawInput);

    const showroom = await this.runtime.getDoc<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS,
      parsed.showroomId
    );
    if (!showroom) {
      throw new AppError(404, 'NOT_FOUND', 'Showroom not found.');
    }

    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      showroom.companyId
    );

    const accessCheck = evaluateShowroomOrCompanyAccess({
      user: params.actorUser,
      activeRoles: params.activeRoles,
      company,
      showroom,
      requiredRoles: ['SHOWROOM_STAFF', 'SHOWROOM_MANAGER']
    });

    if (!accessCheck.allowed || !company) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    // Verify that customer's phone number was verified via OTP in the showroom workflow
    const expectedChallengeId = `${parsed.customerPhoneE164}_SHOWROOM_CUSTOMER_VERIFY`;
    const otpChallenge = await this.runtime.getDoc<OtpChallengeDocument>(
      FIRESTORE_COLLECTIONS.OTP_CHALLENGES,
      parsed.customerOtpChallengeId
    );

    if (
      !otpChallenge ||
      otpChallenge.id !== expectedChallengeId ||
      !otpChallenge.verified ||
      otpChallenge.phoneE164 !== parsed.customerPhoneE164
    ) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'Customer phone number must be verified via OTP before completing vehicle registration.'
      );
    }

    // Resolve or create customer identity in Firebase Auth (without setting any password)
    const { uid: customerUid } = await this.runtime.auth.ensureUserByPhone({
      phoneE164: parsed.customerPhoneE164,
      email: parsed.customerEmail ?? null,
      displayName: parsed.customerFullName
    });

    const serialLock = await this.runtime.getDoc<UniqueLockDocument>(
      FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
      UNIQUE_LOCK_KEYS.deviceSerial(parsed.assignedDeviceSerial)
    );
    if (!serialLock) {
      throw new AppError(
        404,
        'NOT_FOUND',
        `Device serial ${parsed.assignedDeviceSerial} is not provisioned in VeerXcape inventory.`
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const vehicleId = `veh_${randomUUID().slice(0, 12)}`;
    const assignmentId = `das_${randomUUID().slice(0, 12)}`;
    const ownershipId = `${vehicleId}_${customerUid}`;
    const ownerRoleId = `${customerUid}_VEHICLE_OWNER_${vehicleId}`;

    const result = await this.runtime.runTransaction(async (tx) => {
      // 1. Deterministic uniqueness locks for Registration Number, VIN, and Customer Phone
      await claimUniqueLockInTx({
        tx,
        lockKey: UNIQUE_LOCK_KEYS.vehicleRegistration(parsed.registrationNumber),
        entityCollection: FIRESTORE_COLLECTIONS.VEHICLES,
        entityId: vehicleId,
        nowIso,
        conflictMessage: `Vehicle registration number ${parsed.registrationNumber} is already registered.`
      });

      await claimUniqueLockInTx({
        tx,
        lockKey: UNIQUE_LOCK_KEYS.vehicleVin(parsed.vin),
        entityCollection: FIRESTORE_COLLECTIONS.VEHICLES,
        entityId: vehicleId,
        nowIso,
        conflictMessage: `Vehicle VIN ${parsed.vin} is already registered.`
      });

      await claimUniqueLockInTx({
        tx,
        lockKey: UNIQUE_LOCK_KEYS.phone(parsed.customerPhoneE164),
        entityCollection: FIRESTORE_COLLECTIONS.USERS,
        entityId: customerUid,
        nowIso,
        conflictMessage: `Customer phone ${parsed.customerPhoneE164} is bound to a conflicting identity.`
      });

      // 2. Verify device belongs to this showroom and is unassigned
      const deviceDoc = await tx.getDoc<DeviceDocument>(
        FIRESTORE_COLLECTIONS.DEVICES,
        serialLock.entityId
      );
      if (!deviceDoc) {
        throw new AppError(404, 'NOT_FOUND', 'Device record not found.');
      }
      if (
        deviceDoc.allocatedShowroomId !== showroom.id ||
        deviceDoc.allocatedCompanyId !== company.id
      ) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Device serial is not allocated to this showroom.'
        );
      }
      if (deviceDoc.assignedVehicleId) {
        throw new AppError(
          409,
          'CONFLICT',
          'Device is already assigned to another vehicle (1:1 hardware constraint).'
        );
      }
      if (
        deviceDoc.status !== 'PROVISIONED' &&
        deviceDoc.status !== 'IN_INVENTORY'
      ) {
        throw new AppError(
          400,
          'BAD_REQUEST',
          `Device cannot be assigned while in status ${deviceDoc.status}.`
        );
      }

      // 3. Create or preserve Customer User record (PENDING_VERIFICATION until they activate in mobile app)
      const existingCustomer = await tx.getDoc<UserDocument>(
        FIRESTORE_COLLECTIONS.USERS,
        customerUid
      );
      if (!existingCustomer) {
        const newCustomer: UserDocument = {
          uid: customerUid,
          phoneE164: parsed.customerPhoneE164,
          email: parsed.customerEmail ?? null,
          status: 'PENDING_VERIFICATION',
          primaryRole: 'VEHICLE_OWNER',
          sessionVersion: 1,
          mfaEnrolled: false,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await tx.setDoc(FIRESTORE_COLLECTIONS.USERS, customerUid, newCustomer);

        const customerProfile: UserProfileDocument = {
          uid: customerUid,
          fullName: parsed.customerFullName,
          language: 'en',
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
        await tx.setDoc(
          FIRESTORE_COLLECTIONS.USER_PROFILES,
          customerUid,
          customerProfile
        );
      }

      // 4. Create Vehicle, Ownership, Owner Role, and Device Assignment
      const vehicleDoc: VehicleDocument = {
        id: vehicleId,
        registrationNumber: parsed.registrationNumber,
        vin: parsed.vin,
        manufacturer: parsed.manufacturer,
        model: parsed.model,
        variant: parsed.variant,
        manufacturingYear: parsed.manufacturingYear,
        color: parsed.color,
        fuelType: parsed.fuelType,
        companyId: company.id,
        registeredByShowroomId: showroom.id,
        registeredByStaffId: params.actorUser.uid,
        primaryOwnerId: customerUid,
        assignedDeviceId: deviceDoc.id,
        registrationStatus: 'PENDING_CUSTOMER_ACTIVATION',
        registrationHistory: [
          {
            action: 'REGISTERED',
            actorUserId: params.actorUser.uid,
            actorRole: 'SHOWROOM_STAFF',
            timestamp: nowIso,
            summary: `Registered at showroom ${showroom.name} (${showroom.dealerCode}) with device ${deviceDoc.serialNumber}.`
          }
        ],
        liveStatusSummary: {
          connectionStatus: LOCATION_FRESHNESS_STATES.OFFLINE,
          lastSeenAt: null,
          lastHeartbeatAt: null,
          lastLocation: null,
          batteryVoltageMv: null,
          backupBatteryPercent: null,
          powerSource: null
        },
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const ownershipDoc: VehicleOwnerDocument = {
        id: ownershipId,
        vehicleId,
        userId: customerUid,
        ownershipType: 'PRIMARY_OWNER',
        status: 'PENDING_ACTIVATION',
        activatedAt: null,
        createdAt: nowIso
      };

      const ownerRoleDoc: UserRoleDocument = {
        id: ownerRoleId,
        userId: customerUid,
        role: 'VEHICLE_OWNER',
        scopeType: 'VEHICLE',
        scopeId: vehicleId,
        vehicleId,
        status: 'ACTIVE',
        grantedBy: params.actorUser.uid,
        createdAt: nowIso
      };

      const assignmentDoc: DeviceAssignmentDocument = {
        id: assignmentId,
        deviceId: deviceDoc.id,
        vehicleId,
        companyId: company.id,
        showroomId: showroom.id,
        assignedByUserId: params.actorUser.uid,
        installationStatus: 'VERIFIED_ACTIVE',
        installedAt: nowIso,
        unassignedAt: null
      };

      const activeDeviceDoc: DeviceDocument = {
        ...deviceDoc,
        assignedVehicleId: vehicleId,
        status: 'ACTIVE',
        updatedAt: nowIso
      };

      await tx.setDoc(FIRESTORE_COLLECTIONS.VEHICLES, vehicleId, vehicleDoc);
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
        ownershipId,
        ownershipDoc
      );
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.USER_ROLES,
        ownerRoleId,
        ownerRoleDoc
      );
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.DEVICE_ASSIGNMENTS,
        assignmentId,
        assignmentDoc
      );
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.DEVICES,
        deviceDoc.id,
        activeDeviceDoc
      );
      await tx.setDoc<CompanyDocument>(
        FIRESTORE_COLLECTIONS.COMPANIES,
        company.id,
        {
          ...company,
          totalVehiclesRegistered: company.totalVehiclesRegistered + 1,
          updatedAt: nowIso
        }
      );

      return {
        vehicle: vehicleDoc,
        ownership: ownershipDoc,
        deviceAssignment: assignmentDoc
      };
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      actorTenantId: showroom.id,
      action: 'VEHICLE_REGISTERED_AND_DEVICE_ASSIGNED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.VEHICLES,
      targetDocumentId: vehicleId,
      metadata: {
        companyId: company.id,
        showroomId: showroom.id,
        registrationNumber: parsed.registrationNumber,
        vin: parsed.vin,
        assignedDeviceSerial: parsed.assignedDeviceSerial,
        customerUserId: customerUid
      }
    });

    return result;
  }

  /**
   * Lists vehicles registered by a showroom (strictly isolated to `showroomId` or parent `companyId`).
   */
  async listShowroomVehicles(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    showroomId: string;
    limit?: number;
    startAfterDocId?: string;
  }): Promise<VehicleDocument[]> {
    const showroom = await this.runtime.getDoc<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS,
      params.showroomId
    );
    if (!showroom) {
      throw new AppError(404, 'NOT_FOUND', 'Showroom not found.');
    }

    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      showroom.companyId
    );

    const accessCheck = evaluateShowroomOrCompanyAccess({
      user: params.actorUser,
      activeRoles: params.activeRoles,
      company,
      showroom,
      requiredRoles: ['SHOWROOM_STAFF', 'SHOWROOM_MANAGER', 'COMPANY_ADMIN']
    });

    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    return this.runtime.listDocs<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      {
        where: [
          { field: 'registeredByShowroomId', op: '==', value: showroom.id }
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: params.limit ?? 100,
        startAfterDocId: params.startAfterDocId
      }
    );
  }

  /**
   * Parent Company Overview (`COMPANY_ADMIN` strictly isolated to `companyId`).
   */
  async getCompanyOverview(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    companyId: string;
  }): Promise<{
    company: CompanyDocument;
    showrooms: ShowroomDocument[];
    vehiclesCount: number;
    activeDevicesCount: number;
  }> {
    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      params.companyId
    );

    const accessCheck = evaluateShowroomOrCompanyAccess({
      user: params.actorUser,
      activeRoles: params.activeRoles,
      company,
      requiredRoles: ['COMPANY_ADMIN']
    });

    if (!accessCheck.allowed || !company) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    const [showrooms, vehicles, devices] = await Promise.all([
      this.runtime.listDocs<ShowroomDocument>(FIRESTORE_COLLECTIONS.SHOWROOMS, {
        where: [{ field: 'companyId', op: '==', value: company.id }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }]
      }),
      this.runtime.listDocs<VehicleDocument>(FIRESTORE_COLLECTIONS.VEHICLES, {
        where: [{ field: 'companyId', op: '==', value: company.id }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }]
      }),
      this.runtime.listDocs<DeviceDocument>(FIRESTORE_COLLECTIONS.DEVICES, {
        where: [
          { field: 'allocatedCompanyId', op: '==', value: company.id },
          { field: 'status', op: '==', value: 'ACTIVE' }
        ]
      })
    ]);

    return {
      company,
      showrooms,
      vehiclesCount: vehicles.length,
      activeDevicesCount: devices.length
    };
  }

  /**
   * Allows a Parent Company Admin (`COMPANY_ADMIN`) to suspend or reactivate one of their showrooms.
   * Suspending a showroom immediately cuts off all showroom staff operations.
   */
  async updateShowroomStatusByCompanyAdmin(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    companyId: string;
    showroomId: string;
    newStatus: 'ACTIVE' | 'SUSPENDED';
    reason: string;
  }): Promise<ShowroomDocument> {
    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      params.companyId
    );
    const showroom = await this.runtime.getDoc<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS,
      params.showroomId
    );

    if (!showroom || showroom.companyId !== params.companyId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Showroom does not belong to the specified parent company.'
      );
    }

    const accessCheck = evaluateShowroomOrCompanyAccess({
      user: params.actorUser,
      activeRoles: params.activeRoles,
      company,
      requiredRoles: ['COMPANY_ADMIN']
    });

    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    const nowIso = this.runtime.now().toISOString();
    const updatedShowroom: ShowroomDocument = {
      ...showroom,
      status: params.newStatus,
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.SHOWROOMS,
      showroom.id,
      updatedShowroom
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: 'COMPANY_ADMIN',
      actorTenantId: params.companyId,
      action:
        params.newStatus === 'SUSPENDED'
          ? 'SHOWROOM_SUSPENDED'
          : 'SHOWROOM_REACTIVATED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.SHOWROOMS,
      targetDocumentId: showroom.id,
      reason: params.reason,
      metadata: { companyId: params.companyId, newStatus: params.newStatus }
    });

    return updatedShowroom;
  }

  /**
   * Verifies a customer's 6-digit SMS OTP for showroom vehicle registration (`SHOWROOM_CUSTOMER_VERIFY`).
   * Zero-knowledge password guarantee: Showroom staff only verify phone ownership; they never set or view the customer's password.
   */
  async verifyCustomerOtpForShowroom(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    rawInput: unknown;
  }): Promise<{
    challengeId: string;
    phoneE164: string;
    verifiedAt: string | null;
  }> {
    const dealerRole = params.activeRoles.find(
      (r) =>
        r.userId === params.actorUser.uid &&
        r.status === 'ACTIVE' &&
        (r.role === 'SHOWROOM_STAFF' ||
          r.role === 'SHOWROOM_MANAGER' ||
          r.role === 'COMPANY_ADMIN')
    );
    if (!dealerRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Active showroom or company role is required to verify customer registration OTPs.'
      );
    }

    const parsed = showroomCustomerOtpVerifyPayloadSchema.parse(params.rawInput);
    const verifiedDoc = await this.authService.verifyOtpChallenge({
      phoneE164: parsed.phoneE164,
      purpose: 'SHOWROOM_CUSTOMER_VERIFY',
      otpCode: parsed.otpCode,
      consumeImmediately: false
    });

    return {
      challengeId: verifiedDoc.id,
      phoneE164: verifiedDoc.phoneE164,
      verifiedAt: verifiedDoc.verifiedAt ?? null
    };
  }

  /**
   * Applies a permitted non-destructive correction (`color`, `variant`) to a showroom-registered vehicle
   * with a mandatory audit reason.
   */
  async applyPermittedVehicleCorrection(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    vehicleId: string;
    rawInput: unknown;
  }): Promise<VehicleDocument> {
    const parsed = vehiclePermittedCorrectionPayloadSchema.parse(params.rawInput);

    const vehicle = await this.runtime.getDoc<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      params.vehicleId
    );
    if (!vehicle) {
      throw new AppError(404, 'NOT_FOUND', 'Vehicle not found.');
    }

    const showroom = await this.runtime.getDoc<ShowroomDocument>(
      FIRESTORE_COLLECTIONS.SHOWROOMS,
      vehicle.registeredByShowroomId
    );
    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      vehicle.companyId
    );

    const accessCheck = evaluateShowroomOrCompanyAccess({
      user: params.actorUser,
      activeRoles: params.activeRoles,
      company,
      showroom,
      requiredRoles: ['SHOWROOM_STAFF', 'SHOWROOM_MANAGER', 'COMPANY_ADMIN']
    });
    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    const nowIso = this.runtime.now().toISOString();
    const updatedVehicle: VehicleDocument = {
      ...vehicle,
      color: parsed.color ?? vehicle.color,
      variant: parsed.variant ?? vehicle.variant,
      registrationHistory: [
        ...vehicle.registrationHistory,
        {
          action: 'CORRECTION_APPLIED',
          actorUserId: params.actorUser.uid,
          actorRole: params.actorUser.primaryRole,
          timestamp: nowIso,
          summary: `Permitted correction applied: ${parsed.reason}`
        }
      ],
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.VEHICLES,
      vehicle.id,
      updatedVehicle
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      actorTenantId: showroom?.id ?? vehicle.companyId,
      action: 'VEHICLE_PERMITTED_CORRECTION_APPLIED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.VEHICLES,
      targetDocumentId: vehicle.id,
      reason: parsed.reason,
      metadata: {
        previousColor: vehicle.color,
        newColor: updatedVehicle.color,
        previousVariant: vehicle.variant,
        newVariant: updatedVehicle.variant
      }
    });

    return updatedVehicle;
  }

  /**
   * Returns a strictly tenant-isolated workspace for `COMPANY_ADMIN`, `SHOWROOM_MANAGER`, or `SHOWROOM_STAFF`.
   */
  async getDealerWorkspace(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
  }) {
    const companyAdminRole = params.activeRoles.find(
      (r) =>
        r.userId === params.actorUser.uid &&
        r.status === 'ACTIVE' &&
        r.role === 'COMPANY_ADMIN'
    );
    const showroomRole = params.activeRoles.find(
      (r) =>
        r.userId === params.actorUser.uid &&
        r.status === 'ACTIVE' &&
        (r.role === 'SHOWROOM_MANAGER' || r.role === 'SHOWROOM_STAFF')
    );

    if (!companyAdminRole && !showroomRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Active COMPANY_ADMIN, SHOWROOM_MANAGER, or SHOWROOM_STAFF role is required.'
      );
    }

    let company: CompanyDocument | null = null;
    let showrooms: ShowroomDocument[] = [];
    let rawVehicles: VehicleDocument[] = [];
    let devices: DeviceDocument[] = [];
    let deviceAssignments: DeviceAssignmentDocument[] = [];
    let roleDocs: UserRoleDocument[] = [];
    let auditLogs: AuditLogDocument[] = [];

    if (companyAdminRole) {
      const companyId = companyAdminRole.companyId || companyAdminRole.scopeId;
      company = await this.runtime.getDoc<CompanyDocument>(
        FIRESTORE_COLLECTIONS.COMPANIES,
        companyId
      );
      const accessCheck = evaluateShowroomOrCompanyAccess({
        user: params.actorUser,
        activeRoles: params.activeRoles,
        company,
        requiredRoles: ['COMPANY_ADMIN']
      });
      if (!accessCheck.allowed || !company) {
        throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
      }

      [showrooms, rawVehicles, devices, deviceAssignments, roleDocs, auditLogs] =
        await Promise.all([
          this.runtime.listDocs<ShowroomDocument>(
            FIRESTORE_COLLECTIONS.SHOWROOMS,
            {
              where: [{ field: 'companyId', op: '==', value: company.id }],
              orderBy: [{ field: 'createdAt', direction: 'desc' }]
            }
          ),
          this.runtime.listDocs<VehicleDocument>(
            FIRESTORE_COLLECTIONS.VEHICLES,
            {
              where: [{ field: 'companyId', op: '==', value: company.id }],
              orderBy: [{ field: 'createdAt', direction: 'desc' }],
              limit: 100
            }
          ),
          this.runtime.listDocs<DeviceDocument>(FIRESTORE_COLLECTIONS.DEVICES, {
            where: [{ field: 'allocatedCompanyId', op: '==', value: company.id }]
          }),
          this.runtime.listDocs<DeviceAssignmentDocument>(
            FIRESTORE_COLLECTIONS.DEVICE_ASSIGNMENTS,
            {
              where: [{ field: 'companyId', op: '==', value: company.id }]
            }
          ),
          this.runtime.listDocs<UserRoleDocument>(
            FIRESTORE_COLLECTIONS.USER_ROLES,
            {
              where: [{ field: 'companyId', op: '==', value: company.id }]
            }
          ),
          this.runtime.listDocs<AuditLogDocument>(
            FIRESTORE_COLLECTIONS.AUDIT_LOGS,
            {
              orderBy: [{ field: 'sequenceIndex', direction: 'desc' }],
              limit: 50
            }
          )
        ]);
      const showroomIdSet = new Set(showrooms.map((s) => s.id));
      auditLogs = auditLogs.filter(
        (l) =>
          l.actorTenantId === company?.id ||
          (l.actorTenantId && showroomIdSet.has(l.actorTenantId)) ||
          l.metadata?.companyId === company?.id
      );
    } else if (showroomRole) {
      const showroomId = showroomRole.showroomId || showroomRole.scopeId;
      const showroom = await this.runtime.getDoc<ShowroomDocument>(
        FIRESTORE_COLLECTIONS.SHOWROOMS,
        showroomId
      );
      if (!showroom) {
        throw new AppError(404, 'NOT_FOUND', 'Assigned showroom not found.');
      }
      company = await this.runtime.getDoc<CompanyDocument>(
        FIRESTORE_COLLECTIONS.COMPANIES,
        showroom.companyId
      );
      const accessCheck = evaluateShowroomOrCompanyAccess({
        user: params.actorUser,
        activeRoles: params.activeRoles,
        company,
        showroom,
        requiredRoles: ['SHOWROOM_STAFF', 'SHOWROOM_MANAGER']
      });
      if (!accessCheck.allowed || !company) {
        throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
      }

      showrooms = [showroom];
      [rawVehicles, devices, deviceAssignments, roleDocs, auditLogs] =
        await Promise.all([
          this.runtime.listDocs<VehicleDocument>(
            FIRESTORE_COLLECTIONS.VEHICLES,
            {
              where: [
                { field: 'registeredByShowroomId', op: '==', value: showroom.id }
              ],
              orderBy: [{ field: 'createdAt', direction: 'desc' }],
              limit: 100
            }
          ),
          this.runtime.listDocs<DeviceDocument>(FIRESTORE_COLLECTIONS.DEVICES, {
            where: [
              { field: 'allocatedShowroomId', op: '==', value: showroom.id }
            ]
          }),
          this.runtime.listDocs<DeviceAssignmentDocument>(
            FIRESTORE_COLLECTIONS.DEVICE_ASSIGNMENTS,
            {
              where: [{ field: 'showroomId', op: '==', value: showroom.id }]
            }
          ),
          this.runtime.listDocs<UserRoleDocument>(
            FIRESTORE_COLLECTIONS.USER_ROLES,
            {
              where: [{ field: 'showroomId', op: '==', value: showroom.id }]
            }
          ),
          this.runtime.listDocs<AuditLogDocument>(
            FIRESTORE_COLLECTIONS.AUDIT_LOGS,
            {
              orderBy: [{ field: 'sequenceIndex', direction: 'desc' }],
              limit: 50
            }
          )
        ]);
      auditLogs = auditLogs.filter(
        (l) =>
          l.actorTenantId === showroom.id ||
          l.metadata?.showroomId === showroom.id
      );
    }

    const showroomMap = new Map(showrooms.map((s) => [s.id, s]));
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    const vehicles = await Promise.all(
      rawVehicles.map(async (v) => {
        const [ownerUser, ownerProfile] = await Promise.all([
          this.runtime.getDoc<UserDocument>(
            FIRESTORE_COLLECTIONS.USERS,
            v.primaryOwnerId
          ),
          this.runtime.getDoc<UserProfileDocument>(
            FIRESTORE_COLLECTIONS.USER_PROFILES,
            v.primaryOwnerId
          )
        ]);
        const shw = showroomMap.get(v.registeredByShowroomId);
        const dev = v.assignedDeviceId
          ? deviceMap.get(v.assignedDeviceId)
          : undefined;
        return {
          ...v,
          dealerCode: shw?.dealerCode ?? v.registeredByShowroomId,
          customerFullName: ownerProfile?.fullName ?? v.primaryOwnerId,
          customerPhoneE164: ownerUser?.phoneE164 ?? '',
          customerEmail: ownerUser?.email ?? null,
          assignedDeviceSerial: dev?.serialNumber ?? v.assignedDeviceId ?? null
        };
      })
    );

    const staff = await Promise.all(
      roleDocs
        .filter(
          (r) =>
            r.role === 'COMPANY_ADMIN' ||
            r.role === 'SHOWROOM_MANAGER' ||
            r.role === 'SHOWROOM_STAFF'
        )
        .map(async (r) => {
          const [u, p] = await Promise.all([
            this.runtime.getDoc<UserDocument>(
              FIRESTORE_COLLECTIONS.USERS,
              r.userId
            ),
            this.runtime.getDoc<UserProfileDocument>(
              FIRESTORE_COLLECTIONS.USER_PROFILES,
              r.userId
            )
          ]);
          return {
            id: r.id,
            userId: r.userId,
            fullName: p?.fullName ?? r.userId,
            phoneE164: u?.phoneE164 ?? '',
            email: u?.email ?? null,
            role: r.role as
              | 'COMPANY_ADMIN'
              | 'SHOWROOM_MANAGER'
              | 'SHOWROOM_STAFF',
            showroomId: r.showroomId ?? null,
            companyId: r.companyId ?? null,
            status: r.status
          };
        })
    );

    return {
      company,
      showrooms,
      vehicles,
      devices,
      deviceAssignments,
      staff,
      auditLogs
    };
  }
}


