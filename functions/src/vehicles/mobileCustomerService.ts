import { FIRESTORE_COLLECTIONS } from '@veerxcape/shared-constants';
import {
  computeLocationFreshness,
  evaluateVehicleCustomerAccess
} from '@veerxcape/shared-services';
import type {
  EmergencyContactDocument,
  FamilyMembershipDocument,
  IncidentDocument,
  LocationFreshnessEvaluation,
  TelemetryDocument,
  UserDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import { AppError } from '../shared/errors.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

export interface MobileVehicleCardView {
  id: string;
  registrationNumber: string;
  manufacturer: string;
  model: string;
  variant: string;
  color: string;
  fuelType: VehicleDocument['fuelType'];
  accessRole: 'VEHICLE_OWNER' | 'FAMILY_MEMBER' | 'DRIVER';
  registrationStatus: VehicleDocument['registrationStatus'];
  locationFreshness: LocationFreshnessEvaluation;
  liveStatusSummary: VehicleDocument['liveStatusSummary'];
}

export class MobileCustomerService {
  constructor(private readonly runtime: VeerXcapeBackendRuntime) {}

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
    incidents: IncidentDocument[];
    emergencyContacts: EmergencyContactDocument[];
  }> {
    const uid = params.actorUser.uid;
    const nowMs = this.runtime.now().getTime();

    const [
      activeOwnerships,
      activeFamilyMemberships,
      activeDriverAssignments
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

      const freshness = computeLocationFreshness({
        lastLocationRecordedAt:
          v.liveStatusSummary.lastLocation?.recordedAt ?? null,
        lastHeartbeatAt: v.liveStatusSummary.lastHeartbeatAt ?? null,
        nowMs
      });

      vehicleCards.push({
        id: v.id,
        registrationNumber: v.registrationNumber,
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant,
        color: v.color,
        fuelType: v.fuelType,
        accessRole: 'VEHICLE_OWNER',
        registrationStatus: v.registrationStatus,
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
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant,
        color: v.color,
        fuelType: v.fuelType,
        accessRole: 'FAMILY_MEMBER',
        registrationStatus: v.registrationStatus,
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

      const freshness = computeLocationFreshness({
        lastLocationRecordedAt:
          v.liveStatusSummary.lastLocation?.recordedAt ?? null,
        lastHeartbeatAt: v.liveStatusSummary.lastHeartbeatAt ?? null,
        nowMs
      });

      vehicleCards.push({
        id: v.id,
        registrationNumber: v.registrationNumber,
        manufacturer: v.manufacturer,
        model: v.model,
        variant: v.variant,
        color: v.color,
        fuelType: v.fuelType,
        accessRole: 'DRIVER',
        registrationStatus: v.registrationStatus,
        locationFreshness: freshness,
        liveStatusSummary: {
          ...v.liveStatusSummary,
          connectionStatus: freshness.state
        }
      });
    }

    const ownedVehicleIdList = Array.from(ownedVehicleIds);
    const incidentEligibleVehicleIdList = Array.from(incidentEligibleVehicleIds);

    const [familyMembershipsForOwnedVehicles, incidents, emergencyContacts] =
      await Promise.all([
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

    return {
      vehicles: vehicleCards,
      familyMembershipsForOwnedVehicles,
      incidents,
      emergencyContacts
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
}

