import {
  AUTHORITY_DEPARTMENTS,
  DEPARTMENT_PERMITTED_INCIDENT_TYPES
} from '@veerxcape/shared-constants';
import type {
  AuthorityDepartment,
  IncidentDocument,
  MedicalAuthorityIncidentView,
  PoliceAuthorityIncidentView,
  RoadAuthorityAnonymizedIncidentView
} from '@veerxcape/shared-types';

export type AuthorityRedactedIncidentResult =
  | {
      allowed: true;
      department: 'MEDICAL';
      data: MedicalAuthorityIncidentView;
    }
  | {
      allowed: true;
      department: 'POLICE';
      data: PoliceAuthorityIncidentView;
    }
  | {
      allowed: true;
      department: 'ROAD';
      data: RoadAuthorityAnonymizedIncidentView;
    }
  | {
      allowed: false;
      reason: string;
    };

/**
 * Enforces department, jurisdiction, verification status, sharing policy, and
 * field-level redaction rules for Government Authorities:
 * - AUTHORITY_MEDICAL: only medical-relevant incident types in matching jurisdiction
 * - AUTHORITY_POLICE: only police-relevant incident types in matching jurisdiction
 * - AUTHORITY_ROAD: only ROAD_HAZARD and ACCIDENT_DETECTED in matching jurisdiction,
 *   with ALL vehicle registration, VIN, owner, and contact PII stripped.
 */
export function evaluateAndRedactIncidentForAuthority(params: {
  incident: IncidentDocument;
  authorityDepartment: AuthorityDepartment;
  authorityJurisdictionCode: string;
  authorityVerificationStatus: 'PENDING_VERIFICATION' | 'VERIFIED' | 'SUSPENDED';
}): AuthorityRedactedIncidentResult {
  const {
    incident,
    authorityDepartment,
    authorityJurisdictionCode,
    authorityVerificationStatus
  } = params;

  if (authorityVerificationStatus !== 'VERIFIED') {
    return {
      allowed: false,
      reason: 'Authority organisation is not verified or is currently suspended.'
    };
  }

  if (
    incident.location.jurisdictionCode.toUpperCase() !==
    authorityJurisdictionCode.toUpperCase()
  ) {
    return {
      allowed: false,
      reason: `Jurisdiction mismatch: incident is in ${incident.location.jurisdictionCode}, authority is scoped to ${authorityJurisdictionCode}.`
    };
  }

  if (incident.authoritySharingPolicy === 'NOT_SHARED') {
    return {
      allowed: false,
      reason: 'Incident sharing policy does not authorise external authority visibility.'
    };
  }

  if (!incident.authorizedDepartments.includes(authorityDepartment)) {
    return {
      allowed: false,
      reason: `Incident is not authorised for department ${authorityDepartment}.`
    };
  }

  const permittedTypes = DEPARTMENT_PERMITTED_INCIDENT_TYPES[authorityDepartment];
  if (!permittedTypes.includes(incident.incidentType)) {
    return {
      allowed: false,
      reason: `Department ${authorityDepartment} is not permitted to access incident type ${incident.incidentType}.`
    };
  }

  if (authorityDepartment === AUTHORITY_DEPARTMENTS.MEDICAL) {
    return {
      allowed: true,
      department: 'MEDICAL',
      data: {
        id: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        lifecycleState: incident.lifecycleState,
        location: incident.location,
        vehicleDescription: {
          registrationNumber: incident.vehicleSnapshot.registrationNumber,
          manufacturer: incident.vehicleSnapshot.manufacturer,
          model: incident.vehicleSnapshot.model,
          color: incident.vehicleSnapshot.color
        },
        environmentalSnapshot: incident.environmentalSnapshot,
        emergencyContactPhone:
          incident.severity === 'CRITICAL' ||
          incident.authoritySharingPolicy === 'CONSENT_GRANTED'
            ? incident.ownerEmergencyContactPhone ?? null
            : null,
        assignedOfficerName: incident.assignedOfficerName ?? null,
        dispatchReferenceCode: incident.dispatchReferenceCode ?? null,
        occurredAt: incident.occurredAt
      }
    };
  }

  if (authorityDepartment === AUTHORITY_DEPARTMENTS.POLICE) {
    return {
      allowed: true,
      department: 'POLICE',
      data: {
        id: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        lifecycleState: incident.lifecycleState,
        location: incident.location,
        vehicleIdentification: {
          registrationNumber: incident.vehicleSnapshot.registrationNumber,
          vin: incident.vehicleSnapshot.vin,
          manufacturer: incident.vehicleSnapshot.manufacturer,
          model: incident.vehicleSnapshot.model,
          color: incident.vehicleSnapshot.color
        },
        emergencyContactPhone: incident.ownerEmergencyContactPhone ?? null,
        assignedOfficerName: incident.assignedOfficerName ?? null,
        dispatchReferenceCode: incident.dispatchReferenceCode ?? null,
        occurredAt: incident.occurredAt
      }
    };
  }

  // AUTHORITY_ROAD: Strictly anonymized — zero registration number, VIN, or personal contact data
  return {
    allowed: true,
    department: 'ROAD',
    data: {
      id: incident.id,
      incidentType: incident.incidentType as 'ROAD_HAZARD' | 'ACCIDENT_DETECTED',
      severity: incident.severity,
      lifecycleState: incident.lifecycleState,
      location: incident.location,
      peakImpactG: incident.environmentalSnapshot?.peakImpactG ?? null,
      assignedOfficerName: incident.assignedOfficerName ?? null,
      occurredAt: incident.occurredAt
    }
  };
}

