import { randomUUID } from 'node:crypto';
import {
  AUTHORITY_DEPARTMENTS,
  FIRESTORE_COLLECTIONS,
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  type AuthorityDepartment,
  type IncidentTypeCode,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import { evaluateVehicleCustomerAccess } from '@veerxcape/shared-services';
import type {
  AlertDocument,
  EmergencyContactDocument,
  FamilyMembershipDocument,
  IncidentDocument,
  IncidentLocationInfo,
  IncidentSeverity,
  IncidentSource,
  IncidentUpdateDocument,
  UserDocument,
  UserProfileDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import { AuditService } from '../audit/auditService.js';
import { NotificationService } from '../notifications/notificationService.js';
import { AppError } from '../shared/errors.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

export interface CreateIncidentInput {
  idempotencyKey: string;
  vehicleId: string;
  deviceId?: string | null;
  triggeredByUserId?: string | null;
  incidentType: IncidentTypeCode;
  source: IncidentSource;
  isSimulated: boolean;
  severity: IncidentSeverity;
  confidenceScore: number;
  occurredAt: string;
  location: IncidentLocationInfo;
  environmentalSnapshot?: IncidentDocument['environmentalSnapshot'];
}

export class IncidentAndAlertEngine {
  private readonly audit: AuditService;
  private readonly notifications: NotificationService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
    this.notifications = new NotificationService(runtime);
  }

  private resolveAuthorizedDepartments(params: {
    incidentType: IncidentTypeCode;
    severity: IncidentSeverity;
    ownerPrivacy?: UserProfileDocument['privacySettings'];
  }): {
    departments: AuthorityDepartment[];
    policy: IncidentDocument['authoritySharingPolicy'];
  } {
    const { incidentType, severity, ownerPrivacy } = params;

    if (
      incidentType === INCIDENT_TYPES.DEVICE_POWER_FAILURE ||
      incidentType === INCIDENT_TYPES.DEVICE_DISCONNECTED
    ) {
      return { departments: [], policy: 'NOT_SHARED' };
    }

    if (incidentType === INCIDENT_TYPES.ROAD_HAZARD) {
      return {
        departments: [AUTHORITY_DEPARTMENTS.ROAD],
        policy: 'CONSENT_GRANTED'
      };
    }

    if (incidentType === INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT) {
      return {
        departments: [AUTHORITY_DEPARTMENTS.POLICE],
        policy: 'CONSENT_GRANTED'
      };
    }

    // Life-safety incidents: ACCIDENT_DETECTED, MANUAL_SOS, PARKED_OCCUPANT_ALERT
    const departments: AuthorityDepartment[] = [];
    const isCriticalLifeSafety = severity === 'CRITICAL' || severity === 'HIGH';

    if (isCriticalLifeSafety || ownerPrivacy?.shareWithMedicalOnSos !== false) {
      departments.push(AUTHORITY_DEPARTMENTS.MEDICAL);
    }
    if (isCriticalLifeSafety || ownerPrivacy?.shareWithPoliceOnSos !== false) {
      departments.push(AUTHORITY_DEPARTMENTS.POLICE);
    }
    if (incidentType === INCIDENT_TYPES.ACCIDENT_DETECTED) {
      departments.push(AUTHORITY_DEPARTMENTS.ROAD);
    }

    return {
      departments,
      policy: isCriticalLifeSafety
        ? 'CRITICAL_LIFE_SAFETY_RULE'
        : departments.length > 0
          ? 'CONSENT_GRANTED'
          : 'NOT_SHARED'
    };
  }

  /**
   * Idempotent, transaction-safe Incident & Alert processor.
   * - Deduplicates by `idempotencyKey`.
   * - Computes department sharing & family visibility.
   * - Separates portal visibility (`VISIBLE_TO_AUTHORITY`) from confirmed emergency dispatch.
   * - Dispatches role-scoped FCM notifications to Owner, Family Members, and Drivers.
   */
  async processIncidentEvent(input: CreateIncidentInput): Promise<{
    incident: IncidentDocument;
    duplicate: boolean;
    notificationsCount: number;
  }> {
    if (
      input.isSimulated &&
      this.runtime.config.environment === 'production'
    ) {
      throw new AppError(
        403,
        'PRODUCTION_SAFETY_GATE',
        'Simulated incidents are strictly forbidden in production.'
      );
    }

    // 1. Check idempotencyKey first
    const existingIncidents = await this.runtime.listDocs<IncidentDocument>(
      FIRESTORE_COLLECTIONS.INCIDENTS,
      (inc) => inc.idempotencyKey === input.idempotencyKey
    );
    if (existingIncidents.length > 0) {
      return {
        incident: existingIncidents[0],
        duplicate: true,
        notificationsCount: 0
      };
    }

    const vehicle = await this.runtime.getDoc<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      input.vehicleId
    );
    if (!vehicle) {
      throw new AppError(404, 'NOT_FOUND', 'Target vehicle not found.');
    }

    const ownerProfile = await this.runtime.getDoc<UserProfileDocument>(
      FIRESTORE_COLLECTIONS.USER_PROFILES,
      vehicle.primaryOwnerId
    );

    const emergencyContacts = await this.runtime.listDocs<EmergencyContactDocument>(
      FIRESTORE_COLLECTIONS.EMERGENCY_CONTACTS,
      (c) => c.vehicleId === vehicle.id
    );
    emergencyContacts.sort((a, b) => a.priorityOrder - b.priorityOrder);

    const activeFamilyMembers =
      await this.runtime.listDocs<FamilyMembershipDocument>(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        (m) => m.vehicleId === vehicle.id && m.status === 'ACTIVE'
      );

    const activeDrivers = await this.runtime.listDocs<VehicleDriverDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
      (d) => d.vehicleId === vehicle.id && d.status === 'ACTIVE'
    );

    const sharedWithFamilyIds = activeFamilyMembers
      .filter(
        (m) =>
          m.permissions.canReceiveCriticalAlerts ||
          m.permissions.canViewIncidentHistory
      )
      .map((m) => m.familyUserId);

    const { departments, policy } = this.resolveAuthorizedDepartments({
      incidentType: input.incidentType,
      severity: input.severity,
      ownerPrivacy: ownerPrivacyOrDefault(ownerProfile)
    });

    const initialLifecycleState =
      departments.length > 0
        ? INCIDENT_LIFECYCLE_STATES.VISIBLE_TO_AUTHORITY
        : INCIDENT_LIFECYCLE_STATES.REPORTED;

    const nowIso = this.runtime.now().toISOString();
    const incidentId = `inc_${randomUUID().slice(0, 12)}`;
    const alertId = `alt_${randomUUID().slice(0, 12)}`;

    const targetUserIds = Array.from(
      new Set([
        vehicle.primaryOwnerId,
        ...sharedWithFamilyIds,
        ...activeDrivers.map((d) => d.driverUserId)
      ])
    );

    const simPrefix = input.isSimulated ? '[DEMO/SIMULATED] ' : '';
    const sourceLabel =
      input.source === 'HARDWARE_STM32'
        ? 'Automated Hardware Sensor'
        : 'Manual SOS Trigger';

    const incidentDoc: IncidentDocument = {
      id: incidentId,
      idempotencyKey: input.idempotencyKey,
      vehicleId: vehicle.id,
      deviceId: input.deviceId ?? vehicle.assignedDeviceId ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      incidentType: input.incidentType,
      source: input.source,
      isSimulated: input.isSimulated,
      severity: input.severity,
      confidenceScore: input.confidenceScore,
      lifecycleState: initialLifecycleState,
      location: input.location,
      vehicleSnapshot: {
        registrationNumber: vehicle.registrationNumber,
        vin: vehicle.vin,
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        color: vehicle.color
      },
      environmentalSnapshot: input.environmentalSnapshot,
      ownerEmergencyContactPhone:
        emergencyContacts[0]?.phoneE164 ?? null,
      authorizedDepartments: departments,
      sharedWithFamilyIds,
      authoritySharingPolicy: policy,
      assignedAuthorityId: null,
      assignedOfficerName: null,
      dispatchReferenceCode: null,
      occurredAt: input.occurredAt,
      createdAt: nowIso,
      updatedAt: nowIso,
      resolvedAt: null
    };

    const alertDoc: AlertDocument = {
      id: alertId,
      incidentId,
      vehicleId: vehicle.id,
      targetUserIds,
      alertType: input.incidentType,
      severity: input.severity,
      title: `${simPrefix}${input.incidentType.replace(/_/g, ' ')} — ${vehicle.registrationNumber}`,
      message: `${simPrefix}${sourceLabel} reported at ${input.location.roadSegmentSummary}. Status: ${initialLifecycleState}.`,
      acknowledgedByUserId: null,
      acknowledgedAt: null,
      createdAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(FIRESTORE_COLLECTIONS.INCIDENTS, incidentId, incidentDoc);
      await tx.setDoc(FIRESTORE_COLLECTIONS.ALERTS, alertId, alertDoc);
    });

    // Dispatch role-scoped notifications to eligible recipients
    let notificationsCount = 0;

    // 1. Primary Owner
    await this.notifications.dispatchNotification({
      dedupeKey: `${incidentId}_${vehicle.primaryOwnerId}_INCIDENT`,
      recipientUserId: vehicle.primaryOwnerId,
      recipientRole: 'VEHICLE_OWNER',
      incidentId,
      vehicleId: vehicle.id,
      title: alertDoc.title,
      body: alertDoc.message
    });
    notificationsCount++;

    // 2. Authorised Family Members
    for (const famUid of sharedWithFamilyIds) {
      await this.notifications.dispatchNotification({
        dedupeKey: `${incidentId}_${famUid}_INCIDENT`,
        recipientUserId: famUid,
        recipientRole: 'FAMILY_MEMBER',
        incidentId,
        vehicleId: vehicle.id,
        title: alertDoc.title,
        body: alertDoc.message
      });
      notificationsCount++;
    }

    // 3. Active Assigned Drivers
    for (const drv of activeDrivers) {
      await this.notifications.dispatchNotification({
        dedupeKey: `${incidentId}_${drv.driverUserId}_INCIDENT`,
        recipientUserId: drv.driverUserId,
        recipientRole: 'DRIVER',
        incidentId,
        vehicleId: vehicle.id,
        title: alertDoc.title,
        body: alertDoc.message
      });
      notificationsCount++;
    }

    await this.audit.appendAuditLog({
      actorUserId:
        input.triggeredByUserId ?? input.deviceId ?? 'SYSTEM',
      actorRole:
        input.source === 'HARDWARE_STM32' ? 'HARDWARE_DEVICE' : 'VEHICLE_OWNER',
      action: 'INCIDENT_CREATED',
      severity: input.severity === 'CRITICAL' ? 'CRITICAL' : 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.INCIDENTS,
      targetDocumentId: incidentId,
      metadata: {
        incidentType: input.incidentType,
        source: input.source,
        isSimulated: input.isSimulated,
        lifecycleState: initialLifecycleState,
        authorizedDepartments: departments,
        jurisdictionCode: input.location.jurisdictionCode
      }
    });

    return {
      incident: incidentDoc,
      duplicate: false,
      notificationsCount
    };
  }

  /**
   * Triggers a Manual SOS from an authorised Vehicle Owner, Family Member, or Driver.
   */
  async triggerManualSos(params: {
    actorUser: UserDocument;
    vehicleId: string;
    location: IncidentLocationInfo;
    isSimulated?: boolean;
  }): Promise<IncidentDocument> {
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
      requiredCapability: 'TRIGGER_SOS'
    });

    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    const source: IncidentSource =
      ownership?.status === 'ACTIVE'
        ? 'OWNER_SOS'
        : driverAssignment?.status === 'ACTIVE'
          ? 'DRIVER_SOS'
          : 'FAMILY_SOS';

    const nowIso = this.runtime.now().toISOString();
    const result = await this.processIncidentEvent({
      idempotencyKey: `sos_${params.vehicleId}_${params.actorUser.uid}_${this.runtime.now().getTime()}`,
      vehicleId: params.vehicleId,
      deviceId: vehicle.assignedDeviceId ?? null,
      triggeredByUserId: params.actorUser.uid,
      incidentType: INCIDENT_TYPES.MANUAL_SOS,
      source,
      isSimulated: Boolean(params.isSimulated),
      severity: 'CRITICAL',
      confidenceScore: 1.0,
      occurredAt: nowIso,
      location: params.location
    });

    return result.incident;
  }

  /**
   * Allows the Vehicle Owner (or the user who triggered a Manual SOS) to cancel a false alarm
   * or acknowledge safety.
   */
  async cancelOrAcknowledgeIncidentByCustomer(params: {
    actorUser: UserDocument;
    incidentId: string;
    action: 'CANCEL_FALSE_ALARM' | 'ACKNOWLEDGE';
    note: string;
  }): Promise<IncidentDocument> {
    const incident = await this.runtime.getDoc<IncidentDocument>(
      FIRESTORE_COLLECTIONS.INCIDENTS,
      params.incidentId
    );
    if (!incident) {
      throw new AppError(404, 'NOT_FOUND', 'Incident not found.');
    }

    const ownership = await this.runtime.getDoc<VehicleOwnerDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
      `${incident.vehicleId}_${params.actorUser.uid}`
    );

    const isOwner = ownership?.status === 'ACTIVE';
    const isOriginalSosTrigger =
      incident.triggeredByUserId === params.actorUser.uid;

    if (!isOwner && !isOriginalSosTrigger) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the vehicle owner or the user who triggered the SOS can cancel or acknowledge this incident.'
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const newState =
      params.action === 'CANCEL_FALSE_ALARM'
        ? INCIDENT_LIFECYCLE_STATES.FALSE_ALARM_CANCELLED
        : INCIDENT_LIFECYCLE_STATES.OWNER_ACKNOWLEDGED;

    const updatedIncident: IncidentDocument = {
      ...incident,
      lifecycleState: newState,
      updatedAt: nowIso,
      ...(params.action === 'CANCEL_FALSE_ALARM' ? { resolvedAt: nowIso } : {})
    };

    const updateId = `iup_${randomUUID().slice(0, 12)}`;
    const updateDoc: IncidentUpdateDocument = {
      id: updateId,
      incidentId: incident.id,
      vehicleId: incident.vehicleId,
      actorUserId: params.actorUser.uid,
      actorRole: isOwner
        ? 'VEHICLE_OWNER'
        : (params.actorUser.primaryRole as UserRoleCode),
      authorityDepartment: null,
      previousState: incident.lifecycleState,
      newState,
      note: params.note,
      visibility: 'ALL_AUTHORIZED',
      createdAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.INCIDENTS,
        incident.id,
        updatedIncident
      );
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.INCIDENT_UPDATES,
        updateId,
        updateDoc
      );
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      action:
        params.action === 'CANCEL_FALSE_ALARM'
          ? 'INCIDENT_FALSE_ALARM_CANCELLED'
          : 'INCIDENT_OWNER_ACKNOWLEDGED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.INCIDENTS,
      targetDocumentId: incident.id,
      metadata: {
        previousState: incident.lifecycleState,
        newState
      }
    });

    return updatedIncident;
  }
}

function ownerPrivacyOrDefault(
  profile: UserProfileDocument | null
): UserProfileDocument['privacySettings'] {
  return (
    profile?.privacySettings ?? {
      shareWithMedicalOnSos: true,
      shareWithPoliceOnSos: true
    }
  );
}

