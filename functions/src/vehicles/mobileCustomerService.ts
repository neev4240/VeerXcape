import { randomUUID } from 'node:crypto';
import { FIRESTORE_COLLECTIONS } from '@veerxcape/shared-constants';
import {
  computeLocationFreshness,
  evaluateVehicleCustomerAccess
} from '@veerxcape/shared-services';
import type {
  DeviceDocument,
  EmergencyContactDocument,
  FamilyMembershipDocument,
  IncidentDocument,
  LocationFreshnessEvaluation,
  NotificationDocument,
  ShowroomDocument,
  SupportTicketDocument,
  TelemetryDocument,
  UserDocument,
  UserProfileDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import {
  emergencyContactPayloadSchema,
  supportTicketCreatePayloadSchema,
  userProfileUpdatePayloadSchema
} from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { AppError } from '../shared/errors.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

export interface MobileVehicleCardView {
  id: string;
  registrationNumber: string;
  vin: string;
  manufacturer: string;
  model: string;
  variant: string;
  manufacturingYear: number;
  color: string;
  fuelType: VehicleDocument['fuelType'];
  accessRole: 'VEHICLE_OWNER' | 'FAMILY_MEMBER' | 'DRIVER';
  registrationStatus: VehicleDocument['registrationStatus'];
  registeredByShowroomId: string;
  registeredByShowroomName?: string;
  registeredByDealerCode?: string;
  assignedDeviceId?: string | null;
  assignedDeviceSerial?: string | null;
  firmwareVersion?: string | null;
  locationFreshness: LocationFreshnessEvaluation;
  liveStatusSummary: VehicleDocument['liveStatusSummary'];
}

export class MobileCustomerService {
  private readonly audit: AuditService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
  }

  private async enrichVehicleProvenance(v: VehicleDocument): Promise<{
    registeredByShowroomName: string;
    registeredByDealerCode: string;
    assignedDeviceSerial: string | null;
    firmwareVersion: string | null;
  }> {
    const [showroom, device] = await Promise.all([
      v.registeredByShowroomId
        ? this.runtime.getDoc<ShowroomDocument>(
            FIRESTORE_COLLECTIONS.SHOWROOMS,
            v.registeredByShowroomId
          )
        : Promise.resolve(null),
      v.assignedDeviceId
        ? this.runtime.getDoc<DeviceDocument>(
            FIRESTORE_COLLECTIONS.DEVICES,
            v.assignedDeviceId
          )
        : Promise.resolve(null)
    ]);

    return {
      registeredByShowroomName: showroom?.name ?? v.registeredByShowroomId,
      registeredByDealerCode: showroom?.dealerCode ?? v.registeredByShowroomId,
      assignedDeviceSerial: device?.serialNumber ?? v.assignedDeviceId ?? null,
      firmwareVersion: device?.firmwareVersion ?? null
    };
  }

  /**
   * Returns a strictly role-scoped mobile dashboard for Owner, Family Member, or Driver.
   * - Never displays stale location as live (`computeLocationFreshness`).
   * - Redacts location from family members if `canViewLocation == false`.
   * - Immediately excludes vehicles where family membership or driver assignment was revoked.
   */
  async getMobileDashboard(params: {
    actorUser: UserDocument;
  }): Promise<{
    vehicles: MobileVehicleCardView[];
    familyMembershipsForOwnedVehicles: FamilyMembershipDocument[];
    myFamilyMemberships: FamilyMembershipDocument[];
    drivers: Array<
      VehicleDriverDocument & {
        driverFullName?: string;
        driverPhoneE164?: string;
      }
    >;
    incidents: IncidentDocument[];
    emergencyContacts: EmergencyContactDocument[];
    notifications: NotificationDocument[];
    supportTickets: SupportTicketDocument[];
    profile: UserProfileDocument | null;
  }> {
    const uid = params.actorUser.uid;
    const nowMs = this.runtime.now().getTime();

    const [
      activeOwnerships,
      activeFamilyMemberships,
      activeDriverAssignments,
      profile,
      notifications,
      supportTickets
    ] = await Promise.all([
      this.runtime.listDocs<VehicleOwnerDocument>(
        FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
        {
          where: [
            { field: 'userId', op: '==', value: uid },
            { field: 'status', op: '==', value: 'ACTIVE' }
          ]
        }
      ),
      this.runtime.listDocs<FamilyMembershipDocument>(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        {
          where: [
            { field: 'familyUserId', op: '==', value: uid },
            { field: 'status', op: '==', value: 'ACTIVE' }
          ]
        }
      ),
      this.runtime.listDocs<VehicleDriverDocument>(
        FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
        {
          where: [
            { field: 'driverUserId', op: '==', value: uid },
            { field: 'status', op: '==', value: 'ACTIVE' }
          ]
        }
      ),
      this.runtime.getDoc<UserProfileDocument>(
        FIRESTORE_COLLECTIONS.USER_PROFILES,
        uid
      ),
      this.runtime.listDocs<NotificationDocument>(
        FIRESTORE_COLLECTIONS.NOTIFICATIONS,
        {
          where: [{ field: 'recipientUserId', op: '==', value: uid }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
          limit: 50
        }
      ),
      this.runtime.listDocs<SupportTicketDocument>(
        FIRESTORE_COLLECTIONS.SUPPORT_TICKETS,
        {
          where: [{ field: 'createdByUserId', op: '==', value: uid }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
          limit: 50
        }
      )
    ]);

    const vehicleCards: MobileVehicleCardView[] = [];
    const ownedVehicleIds = new Set<string>();
    const incidentEligibleVehicleIds = new Set<string>();

    // 1. Owned Vehicles
    for (const own of activeOwnerships) {
      const v = await this.runtime.getDoc<VehicleDocument>(
        FIRESTORE_COLLECTIONS.VEHICLES,
        own.vehicleId
      );
      if (!v || v.registrationStatus === 'SUSPENDED') continue;

      ownedVehicleIds.add(v.id);
      incidentEligibleVehicleIds.add(v.id);

      const provenance = await this.enrichVehicleProvenance(v);
      const freshness = computeLocationFreshness({
        lastLocationRecordedAt:
          v.liveStatusSummary.lastLocation?.recordedAt ?? null,
        lastHeartbeatAt: v.liveStatusSummary.lastHeartbeatAt ?? null,
        nowMs
      });

      vehicleCards.push({
        id: v.id,
        registrationNumber: v.registrationNumber,
        vin: v.vin,
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant,
        manufacturingYear: v.manufacturingYear,
        color: v.color,
        fuelType: v.fuelType,
        accessRole: 'VEHICLE_OWNER',
        registrationStatus: v.registrationStatus,
        registeredByShowroomId: v.registeredByShowroomId,
        registeredByShowroomName: provenance.registeredByShowroomName,
        registeredByDealerCode: provenance.registeredByDealerCode,
        assignedDeviceId: v.assignedDeviceId,
        assignedDeviceSerial: provenance.assignedDeviceSerial,
        firmwareVersion: provenance.firmwareVersion,
        locationFreshness: freshness,
        liveStatusSummary: {
          ...v.liveStatusSummary,
          connectionStatus: freshness.state
        }
      });
    }

    // 2. Shared Vehicles (Family Member)
    for (const fam of activeFamilyMemberships) {
      if (ownedVehicleIds.has(fam.vehicleId)) continue;
      const v = await this.runtime.getDoc<VehicleDocument>(
        FIRESTORE_COLLECTIONS.VEHICLES,
        fam.vehicleId
      );
      if (!v || v.registrationStatus === 'SUSPENDED') continue;

      if (fam.permissions.canViewIncidentHistory) {
        incidentEligibleVehicleIds.add(v.id);
      }

      const provenance = await this.enrichVehicleProvenance(v);
      const freshness = computeLocationFreshness({
        lastLocationRecordedAt: fam.permissions.canViewLocation
          ? v.liveStatusSummary.lastLocation?.recordedAt ?? null
          : null,
        lastHeartbeatAt: v.liveStatusSummary.lastHeartbeatAt ?? null,
        nowMs
      });

      vehicleCards.push({
        id: v.id,
        registrationNumber: v.registrationNumber,
        vin: v.vin,
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant,
        manufacturingYear: v.manufacturingYear,
        color: v.color,
        fuelType: v.fuelType,
        accessRole: 'FAMILY_MEMBER',
        registrationStatus: v.registrationStatus,
        registeredByShowroomId: v.registeredByShowroomId,
        registeredByShowroomName: provenance.registeredByShowroomName,
        registeredByDealerCode: provenance.registeredByDealerCode,
        assignedDeviceId: v.assignedDeviceId,
        assignedDeviceSerial: provenance.assignedDeviceSerial,
        firmwareVersion: provenance.firmwareVersion,
        locationFreshness: freshness,
        liveStatusSummary: {
          ...v.liveStatusSummary,
          connectionStatus: freshness.state,
          lastLocation: fam.permissions.canViewLocation
            ? v.liveStatusSummary.lastLocation
            : null
        }
      });
    }

    // 3. Assigned Vehicles (Driver)
    for (const drv of activeDriverAssignments) {
      if (
        ownedVehicleIds.has(drv.vehicleId) ||
        vehicleCards.some((c) => c.id === drv.vehicleId)
      ) {
        continue;
      }
      const v = await this.runtime.getDoc<VehicleDocument>(
        FIRESTORE_COLLECTIONS.VEHICLES,
        drv.vehicleId
      );
      if (!v || v.registrationStatus === 'SUSPENDED') continue;

      const provenance = await this.enrichVehicleProvenance(v);
      const freshness = computeLocationFreshness({
        lastLocationRecordedAt:
          v.liveStatusSummary.lastLocation?.recordedAt ?? null,
        lastHeartbeatAt: v.liveStatusSummary.lastHeartbeatAt ?? null,
        nowMs
      });

      vehicleCards.push({
        id: v.id,
        registrationNumber: v.registrationNumber,
        vin: v.vin,
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant,
        manufacturingYear: v.manufacturingYear,
        color: v.color,
        fuelType: v.fuelType,
        accessRole: 'DRIVER',
        registrationStatus: v.registrationStatus,
        registeredByShowroomId: v.registeredByShowroomId,
        registeredByShowroomName: provenance.registeredByShowroomName,
        registeredByDealerCode: provenance.registeredByDealerCode,
        assignedDeviceId: v.assignedDeviceId,
        assignedDeviceSerial: provenance.assignedDeviceSerial,
        firmwareVersion: provenance.firmwareVersion,
        locationFreshness: freshness,
        liveStatusSummary: {
          ...v.liveStatusSummary,
          connectionStatus: freshness.state
        }
      });
    }

    const ownedVehicleIdList = Array.from(ownedVehicleIds);
    const incidentEligibleVehicleIdList = Array.from(incidentEligibleVehicleIds);

    const [
      familyMembershipsForOwnedVehicles,
      rawDriversForOwnedVehicles,
      incidents,
      emergencyContacts
    ] = await Promise.all([
      ownedVehicleIdList.length > 0
        ? this.runtime.listDocs<FamilyMembershipDocument>(
            FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
            {
              where: [
                { field: 'vehicleId', op: 'in', value: ownedVehicleIdList }
              ]
            }
          )
        : Promise.resolve([]),
      ownedVehicleIdList.length > 0
        ? this.runtime.listDocs<VehicleDriverDocument>(
            FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
            {
              where: [
                { field: 'vehicleId', op: 'in', value: ownedVehicleIdList }
              ]
            }
          )
        : Promise.resolve(activeDriverAssignments),
      incidentEligibleVehicleIdList.length > 0
        ? this.runtime.listDocs<IncidentDocument>(
            FIRESTORE_COLLECTIONS.INCIDENTS,
            {
              where: [
                {
                  field: 'vehicleId',
                  op: 'in',
                  value: incidentEligibleVehicleIdList
                }
              ],
              orderBy: [{ field: 'occurredAt', direction: 'desc' }],
              limit: 50
            }
          )
        : Promise.resolve([]),
      ownedVehicleIdList.length > 0
        ? this.runtime.listDocs<EmergencyContactDocument>(
            FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
            {
              where: [
                { field: 'vehicleId', op: 'in', value: ownedVehicleIdList }
              ]
            }
          )
        : Promise.resolve([])
    ]);

    const enrichedDrivers: Array<
      VehicleDriverDocument & {
        driverFullName?: string;
        driverPhoneE164?: string;
      }
    > = [];
    for (const d of rawDriversForOwnedVehicles) {
      const [drvUser, drvProfile] = await Promise.all([
        this.runtime.getDoc<UserDocument>(
          FIRESTORE_COLLECTIONS.USERS,
          d.driverUserId
        ),
        this.runtime.getDoc<UserProfileDocument>(
          FIRESTORE_COLLECTIONS.USER_PROFILES,
          d.driverUserId
        )
      ]);
      enrichedDrivers.push({
        ...d,
        driverFullName: drvProfile?.fullName ?? d.driverUserId,
        driverPhoneE164: drvUser?.phoneE164 ?? ''
      });
    }

    return {
      vehicles: vehicleCards,
      familyMembershipsForOwnedVehicles,
      myFamilyMemberships: activeFamilyMemberships,
      drivers: enrichedDrivers,
      incidents,
      emergencyContacts,
      notifications,
      supportTickets,
      profile
    };
  }

  /**
   * Returns bounded recent telemetry for a vehicle if and only if the caller
   * is the active owner or an active family member with `canViewTelemetry == true`.
   */
  async getVehicleTelemetryHistory(params: {
    actorUser: UserDocument;
    vehicleId: string;
    limit?: number;
    startAfterDocId?: string;
  }): Promise<TelemetryDocument[]> {
    const vehicle = await this.runtime.getDoc<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      params.vehicleId
    );
    if (!vehicle) {
      throw new AppError(404, 'NOT_FOUND', 'Vehicle not found.');
    }

    const ownership = await this.runtime.getDoc<VehicleOwnerDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
      `${params.vehicleId}_${params.actorUser.uid}`
    );
    const familyMembership =
      await this.runtime.getDoc<FamilyMembershipDocument>(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        `${params.vehicleId}_${params.actorUser.uid}`
      );
    const driverAssignment = await this.runtime.getDoc<VehicleDriverDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
      `${params.vehicleId}_${params.actorUser.uid}`
    );

    const accessCheck = evaluateVehicleCustomerAccess({
      user: params.actorUser,
      vehicle,
      ownership,
      familyMembership,
      driverAssignment,
      requiredCapability: 'VIEW_TELEMETRY'
    });

    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    return this.runtime.listDocs<TelemetryDocument>(
      FIRESTORE_COLLECTIONS.TELEMETRY,
      {
        where: [{ field: 'vehicleId', op: '==', value: params.vehicleId }],
        orderBy: [{ field: 'receivedAt', direction: 'desc' }],
        limit: params.limit ?? 20,
        startAfterDocId: params.startAfterDocId
      }
    );
  }

  /**
   * Creates or updates an Emergency Contact for a vehicle owned by the caller.
   */
  async upsertEmergencyContact(params: {
    actorUser: UserDocument;
    rawInput: unknown;
  }): Promise<EmergencyContactDocument> {
    const parsed = emergencyContactPayloadSchema.parse(params.rawInput);
    const vehicle = await this.runtime.getDoc<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      parsed.vehicleId
    );
    if (!vehicle) {
      throw new AppError(404, 'NOT_FOUND', 'Vehicle not found.');
    }

    const ownership = await this.runtime.getDoc<VehicleOwnerDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
      `${parsed.vehicleId}_${params.actorUser.uid}`
    );
    const accessCheck = evaluateVehicleCustomerAccess({
      user: params.actorUser,
      vehicle,
      ownership,
      requiredCapability: 'MANAGE_FAMILY_AND_DRIVERS'
    });
    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    const nowIso = this.runtime.now().toISOString();
    const contactId = `emc_${randomUUID().slice(0, 12)}`;
    const doc: EmergencyContactDocument = {
      id: contactId,
      vehicleId: parsed.vehicleId,
      ownerUserId: params.actorUser.uid,
      name: parsed.name,
      phoneE164: parsed.phoneE164,
      relationship: parsed.relationship,
      priorityOrder: parsed.priorityOrder,
      notifyOnAccident: parsed.notifyOnAccident,
      notifyOnSos: parsed.notifyOnSos,
      notifyOnOccupantAlert: parsed.notifyOnOccupantAlert,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
      contactId,
      doc
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: 'VEHICLE_OWNER',
      action: 'EMERGENCY_CONTACT_CREATED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
      targetDocumentId: contactId,
      metadata: {
        vehicleId: parsed.vehicleId,
        relationship: parsed.relationship,
        priorityOrder: parsed.priorityOrder
      }
    });

    return doc;
  }

  /**
   * Deletes an Emergency Contact owned by the caller.
   */
  async deleteEmergencyContact(params: {
    actorUser: UserDocument;
    contactId: string;
  }): Promise<{ deletedId: string }> {
    const existing = await this.runtime.getDoc<EmergencyContactDocument>(
      FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
      params.contactId
    );
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Emergency contact not found.');
    }
    if (existing.ownerUserId !== params.actorUser.uid) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the vehicle owner may delete this emergency contact.'
      );
    }

    await this.runtime.runTransaction(async (tx) => {
      await tx.deleteDoc(
        FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
        params.contactId
      );
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: 'VEHICLE_OWNER',
      action: 'EMERGENCY_CONTACT_DELETED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
      targetDocumentId: params.contactId,
      metadata: { vehicleId: existing.vehicleId }
    });

    return { deletedId: params.contactId };
  }

  /**
   * Updates the caller's UserProfileDocument (notification & emergency data-sharing preferences).
   */
  async updateUserProfile(params: {
    actorUser: UserDocument;
    rawInput: unknown;
  }): Promise<UserProfileDocument> {
    const parsed = userProfileUpdatePayloadSchema.parse(params.rawInput);
    const uid = params.actorUser.uid;
    const nowIso = this.runtime.now().toISOString();

    const existing = await this.runtime.getDoc<UserProfileDocument>(
      FIRESTORE_COLLECTIONS.USER_PROFILES,
      uid
    );

    const updated: UserProfileDocument = {
      uid,
      fullName: parsed.fullName ?? existing?.fullName ?? params.actorUser.phoneE164,
      avatarUrl: existing?.avatarUrl ?? null,
      language: parsed.language ?? existing?.language ?? 'en',
      notificationPreferences:
        parsed.notificationPreferences ??
        existing?.notificationPreferences ?? {
          pushEnabled: true,
          criticalAlertsOnly: false
        },
      privacySettings:
        parsed.privacySettings ??
        existing?.privacySettings ?? {
          shareWithMedicalOnSos: true,
          shareWithPoliceOnSos: true
        },
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.USER_PROFILES,
      uid,
      updated
    );

    await this.audit.appendAuditLog({
      actorUserId: uid,
      actorRole: params.actorUser.primaryRole,
      action: 'USER_PROFILE_UPDATED',
      severity: 'INFO',
      targetCollection: FIRESTORE_COLLECTIONS.USER_PROFILES,
      targetDocumentId: uid,
      metadata: {
        privacySettings: updated.privacySettings,
        notificationPreferences: updated.notificationPreferences
      }
    });

    return updated;
  }

  /**
   * Creates a SupportTicketDocument for an authenticated user.
   */
  async createSupportTicket(params: {
    actorUser: UserDocument;
    rawInput: unknown;
  }): Promise<SupportTicketDocument> {
    const parsed = supportTicketCreatePayloadSchema.parse(params.rawInput);
    const nowIso = this.runtime.now().toISOString();
    const ticketId = `tkt_${randomUUID().slice(0, 12)}`;

    const ticketDoc: SupportTicketDocument = {
      id: ticketId,
      createdByUserId: params.actorUser.uid,
      vehicleId: parsed.vehicleId ?? null,
      companyId: null,
      showroomId: null,
      category: parsed.category,
      subject: parsed.subject,
      description: parsed.description,
      status: 'OPEN',
      assignedSupportUserId: null,
      messages: [
        {
          senderUserId: params.actorUser.uid,
          senderRole: params.actorUser.primaryRole,
          body: parsed.description,
          createdAt: nowIso
        }
      ],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.SUPPORT_TICKETS,
      ticketId,
      ticketDoc
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      action: 'SUPPORT_TICKET_CREATED',
      severity: 'INFO',
      targetCollection: FIRESTORE_COLLECTIONS.SUPPORT_TICKETS,
      targetDocumentId: ticketId,
      metadata: { category: parsed.category, vehicleId: parsed.vehicleId ?? null }
    });

    return ticketDoc;
  }
}
