import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import { evaluateAndRedactIncidentForAuthority } from '@veerxcape/shared-services';
import type {
  AuthorityDocument,
  IncidentDocument,
  IncidentEventDocument,
  IncidentUpdateDocument,
  MedicalAuthorityIncidentView,
  PoliceAuthorityIncidentView,
  RoadAuthorityAnonymizedIncidentView,
  UserDocument,
  UserRoleDocument
} from '@veerxcape/shared-types';
import { authorityIncidentUpdateSchema } from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { AppError } from '../shared/errors.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

export type RedactedAuthorityIncidentDTO =
  | MedicalAuthorityIncidentView
  | PoliceAuthorityIncidentView
  | RoadAuthorityAnonymizedIncidentView;

export class AuthorityService {
  private readonly audit: AuditService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
  }

  private async resolveVerifiedAuthorityContext(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    authorityId: string;
  }): Promise<{
    authority: AuthorityDocument;
    roleDoc: UserRoleDocument;
  }> {
    const authority = await this.runtime.getDoc<AuthorityDocument>(
      FIRESTORE_COLLECTIONS.AUTHORITIES,
      params.authorityId
    );
    if (!authority || authority.verificationStatus !== 'VERIFIED') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Authority organisation is not verified or is currently suspended.'
      );
    }

    const matchingRole = params.activeRoles.find(
      (r) =>
        r.userId === params.actorUser.uid &&
        r.status === 'ACTIVE' &&
        r.authorityId === authority.id &&
        (r.role === 'AUTHORITY_MEDICAL' ||
          r.role === 'AUTHORITY_POLICE' ||
          r.role === 'AUTHORITY_ROAD')
    );

    if (!matchingRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'User does not hold an active authority role for this department.'
      );
    }

    return { authority, roleDoc: matchingRole };
  }

  /**
   * Lists incidents visible to the caller's verified Authority Department & Jurisdiction.
   * - Automatically strips all PII/registration/VIN for `AUTHORITY_ROAD`.
   * - Blocks `AUTHORITY_MEDICAL` from accessing police-only theft incidents.
   * - Writes an immutable audit log entry for every query.
   */
  async listDepartmentIncidents(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    authorityId: string;
    limit?: number;
    startAfterDocId?: string;
  }): Promise<RedactedAuthorityIncidentDTO[]> {
    const { authority, roleDoc } = await this.resolveVerifiedAuthorityContext(
      params
    );

    const candidateIncidents = await this.runtime.listDocs<IncidentDocument>(
      FIRESTORE_COLLECTIONS.INCIDENTS,
      {
        where: [
          {
            field: 'location.jurisdictionCode',
            op: '==',
            value: authority.jurisdictionCode.toUpperCase()
          },
          {
            field: 'authorizedDepartments',
            op: 'array-contains',
            value: authority.department
          }
        ],
        orderBy: [{ field: 'occurredAt', direction: 'desc' }],
        limit: params.limit ?? 50,
        startAfterDocId: params.startAfterDocId
      }
    );

    const redactedResults: RedactedAuthorityIncidentDTO[] = [];

    for (const inc of candidateIncidents) {
      const evaluation = evaluateAndRedactIncidentForAuthority({
        incident: inc,
        authorityDepartment: authority.department,
        authorityJurisdictionCode: authority.jurisdictionCode,
        authorityVerificationStatus: authority.verificationStatus
      });

      if (evaluation.allowed) {
        redactedResults.push(evaluation.data);
      }
    }

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: roleDoc.role,
      actorTenantId: authority.id,
      action: 'AUTHORITY_INCIDENT_QUEUE_ACCESSED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.INCIDENTS,
      targetDocumentId: authority.jurisdictionCode,
      metadata: {
        authorityId: authority.id,
        department: authority.department,
        jurisdictionCode: authority.jurisdictionCode,
        returnedCount: redactedResults.length
      }
    });

    return redactedResults;
  }

  /**
   * Inspects a single incident and writes a mandatory audit log entry (`AUTHORITY_INCIDENT_VIEWED`).
   */
  async inspectIncidentByAuthority(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    authorityId: string;
    incidentId: string;
  }): Promise<RedactedAuthorityIncidentDTO> {
    const { authority, roleDoc } = await this.resolveVerifiedAuthorityContext(
      params
    );

    const incident = await this.runtime.getDoc<IncidentDocument>(
      FIRESTORE_COLLECTIONS.INCIDENTS,
      params.incidentId
    );
    if (!incident) {
      throw new AppError(404, 'NOT_FOUND', 'Incident not found.');
    }

    const evaluation = evaluateAndRedactIncidentForAuthority({
      incident,
      authorityDepartment: authority.department,
      authorityJurisdictionCode: authority.jurisdictionCode,
      authorityVerificationStatus: authority.verificationStatus
    });

    if (!evaluation.allowed) {
      await this.audit.appendAuditLog({
        actorUserId: params.actorUser.uid,
        actorRole: roleDoc.role,
        actorTenantId: authority.id,
        action: 'AUTHORITY_INCIDENT_ACCESS_DENIED',
        severity: 'CRITICAL',
        targetCollection: FIRESTORE_COLLECTIONS.INCIDENTS,
        targetDocumentId: incident.id,
        reason: evaluation.reason,
        metadata: {
          authorityId: authority.id,
          department: authority.department,
          jurisdictionCode: authority.jurisdictionCode
        }
      });
      throw new AppError(403, 'FORBIDDEN', evaluation.reason);
    }

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: roleDoc.role,
      actorTenantId: authority.id,
      action: 'AUTHORITY_INCIDENT_VIEWED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.INCIDENTS,
      targetDocumentId: incident.id,
      metadata: {
        authorityId: authority.id,
        department: authority.department,
        jurisdictionCode: authority.jurisdictionCode
      }
    });

    return evaluation.data;
  }

  /**
   * Updates response/investigation/hazard status on an incident within the authority's
   * jurisdiction and department scope, and logs the modification to `auditLogs`.
   */
  async updateIncidentByAuthority(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    authorityId: string;
    rawInput: unknown;
  }): Promise<{
    incident: RedactedAuthorityIncidentDTO;
    updateRecord: IncidentUpdateDocument;
  }> {
    const parsed = authorityIncidentUpdateSchema.parse(params.rawInput);
    const { authority, roleDoc } = await this.resolveVerifiedAuthorityContext(
      params
    );

    const incident = await this.runtime.getDoc<IncidentDocument>(
      FIRESTORE_COLLECTIONS.INCIDENTS,
      parsed.incidentId
    );
    if (!incident) {
      throw new AppError(404, 'NOT_FOUND', 'Incident not found.');
    }

    const evaluation = evaluateAndRedactIncidentForAuthority({
      incident,
      authorityDepartment: authority.department,
      authorityJurisdictionCode: authority.jurisdictionCode,
      authorityVerificationStatus: authority.verificationStatus
    });

    if (!evaluation.allowed) {
      throw new AppError(403, 'FORBIDDEN', evaluation.reason);
    }

    const nowIso = this.runtime.now().toISOString();
    const updatedIncident: IncidentDocument = {
      ...incident,
      lifecycleState: parsed.newState,
      assignedAuthorityId: authority.id,
      assignedOfficerName:
        parsed.assignedOfficerName ?? incident.assignedOfficerName ?? null,
      dispatchReferenceCode:
        parsed.dispatchReferenceCode ?? incident.dispatchReferenceCode ?? null,
      updatedAt: nowIso,
      ...(parsed.newState === 'RESOLVED' ? { resolvedAt: nowIso } : {})
    };

    const updateId = `iup_${randomUUID().slice(0, 12)}`;
    const updateDoc: IncidentUpdateDocument = {
      id: updateId,
      incidentId: incident.id,
      vehicleId: incident.vehicleId,
      actorUserId: params.actorUser.uid,
      actorRole: roleDoc.role as UserRoleCode,
      authorityDepartment: authority.department,
      previousState: incident.lifecycleState,
      newState: parsed.newState,
      note: parsed.note,
      dispatchReferenceCode: parsed.dispatchReferenceCode ?? null,
      visibility: parsed.visibility,
      createdAt: nowIso
    };

    const eventId = `iev_${randomUUID().slice(0, 12)}`;
    const eventDoc: IncidentEventDocument = {
      id: eventId,
      incidentId: incident.id,
      vehicleId: incident.vehicleId,
      deviceId: incident.deviceId ?? null,
      eventType:
        parsed.newState === 'RESOLVED' ? 'RESOLVED' : 'STATUS_TRANSITION',
      actorUserId: params.actorUser.uid,
      actorRole: roleDoc.role as UserRoleCode,
      summary: `Authority (${authority.department}) updated state from ${incident.lifecycleState} to ${parsed.newState}.`,
      metadata: {
        authorityId: authority.id,
        department: authority.department,
        previousState: incident.lifecycleState,
        newState: parsed.newState,
        dispatchReferenceCode: parsed.dispatchReferenceCode ?? null
      },
      occurredAt: nowIso,
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
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.INCIDENT_EVENTS,
        eventId,
        eventDoc
      );
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: roleDoc.role,
      actorTenantId: authority.id,
      action: 'AUTHORITY_INCIDENT_STATUS_UPDATED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.INCIDENTS,
      targetDocumentId: incident.id,
      reason: parsed.note,
      metadata: {
        authorityId: authority.id,
        department: authority.department,
        previousState: incident.lifecycleState,
        newState: parsed.newState,
        dispatchReferenceCode: parsed.dispatchReferenceCode ?? null
      }
    });

    const postEvaluation = evaluateAndRedactIncidentForAuthority({
      incident: updatedIncident,
      authorityDepartment: authority.department,
      authorityJurisdictionCode: authority.jurisdictionCode,
      authorityVerificationStatus: authority.verificationStatus
    });

    if (!postEvaluation.allowed) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Redaction failed after update.');
    }

    return {
      incident: postEvaluation.data,
      updateRecord: updateDoc
    };
  }

  /**
   * Returns the authenticated officer's verified AuthorityDocument(s) and recent IncidentUpdateDocument[] logs.
   */
  async getAuthorityWorkspace(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
  }): Promise<{
    authorities: AuthorityDocument[];
    recentUpdates: IncidentUpdateDocument[];
  }> {
    const authRoles = params.activeRoles.filter(
      (r) =>
        r.userId === params.actorUser.uid &&
        r.status === 'ACTIVE' &&
        (r.role === 'AUTHORITY_MEDICAL' ||
          r.role === 'AUTHORITY_POLICE' ||
          r.role === 'AUTHORITY_ROAD')
    );

    if (authRoles.length === 0) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Active AUTHORITY_MEDICAL, AUTHORITY_POLICE, or AUTHORITY_ROAD role is required.'
      );
    }

    const authorityIds = Array.from(
      new Set(
        authRoles
          .map((r) => r.authorityId || r.scopeId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const authorities: AuthorityDocument[] = [];
    for (const id of authorityIds) {
      const doc = await this.runtime.getDoc<AuthorityDocument>(
        FIRESTORE_COLLECTIONS.AUTHORITIES,
        id
      );
      if (doc && doc.verificationStatus === 'VERIFIED') {
        authorities.push(doc);
      }
    }

    if (authorities.length === 0) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Assigned authority organisation is not verified or is currently suspended.'
      );
    }

    const allowedDepts = new Set(authorities.map((a) => a.department));
    const allUpdates = await this.runtime.listDocs<IncidentUpdateDocument>(
      FIRESTORE_COLLECTIONS.INCIDENT_UPDATES,
      {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 50
      }
    );

    const recentUpdates = allUpdates.filter(
      (u) =>
        u.actorUserId === params.actorUser.uid ||
        (u.authorityDepartment && allowedDepts.has(u.authorityDepartment))
    );

    return {
      authorities,
      recentUpdates
    };
  }
}


