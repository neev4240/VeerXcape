import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  LOCATION_FRESHNESS_STATES,
  UNIQUE_LOCK_KEYS
} from '@veerxcape/shared-constants';
import { evaluateShowroomOrCompanyAccess } from '@veerxcape/shared-services';
import type {
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
import { showroomVehicleRegistrationSchema } from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { AppError } from '../shared/errors.js';
import {
  claimUniqueLockInTx,
  type VeerXcapeBackendRuntime
} from '../shared/runtime.js';

export class DealerAndCompanyService {
  private readonly audit: AuditService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
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
}

