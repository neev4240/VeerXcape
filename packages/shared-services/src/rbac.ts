import type {
  CompanyDocument,
  DeviceDocument,
  FamilyMembershipDocument,
  ShowroomDocument,
  UserDocument,
  UserRoleCode,
  UserRoleDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';

export interface AccessDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Verifies live user account status and token sessionVersion (sv) so that
 * suspended accounts or revoked sessions are rejected immediately even if
 * a 1-hour Firebase ID token is still cached on the client.
 */
export function verifyLiveSessionActive(params: {
  user: UserDocument | null | undefined;
  tokenSessionVersion?: number;
}): AccessDecision {
  const { user, tokenSessionVersion } = params;
  if (!user) {
    return { allowed: false, reason: 'User account record does not exist.' };
  }
  if (user.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: `User account is ${user.status}. Access denied immediately.`
    };
  }
  if (
    typeof tokenSessionVersion === 'number' &&
    user.sessionVersion !== tokenSessionVersion
  ) {
    return {
      allowed: false,
      reason: 'Session token version has been superseded or revoked.'
    };
  }
  return { allowed: true, reason: 'Active session verified.' };
}

/**
 * Evaluates whether a showroom or company actor can access a target showroom/company resource,
 * enforcing strict tenant isolation and immediate denial when a showroom or parent company is suspended.
 */
export function evaluateShowroomOrCompanyAccess(params: {
  user: UserDocument;
  tokenSessionVersion?: number;
  activeRoles: UserRoleDocument[];
  company: CompanyDocument | null;
  showroom?: ShowroomDocument | null;
  requiredRoles: UserRoleCode[];
}): AccessDecision {
  const sessionCheck = verifyLiveSessionActive({
    user: params.user,
    tokenSessionVersion: params.tokenSessionVersion
  });
  if (!sessionCheck.allowed) return sessionCheck;

  if (!params.company || params.company.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: 'Parent company does not exist or is currently suspended.'
    };
  }

  if (params.showroom && params.showroom.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: 'Showroom is not active or has been suspended.'
    };
  }

  if (params.showroom && params.showroom.companyId !== params.company.id) {
    return {
      allowed: false,
      reason: 'Cross-company tenant boundary violation: showroom does not belong to company.'
    };
  }

  const matchingRole = params.activeRoles.find((r) => {
    if (r.userId !== params.user.uid || r.status !== 'ACTIVE') return false;
    if (!params.requiredRoles.includes(r.role)) return false;

    if (r.role === 'COMPANY_ADMIN') {
      return r.companyId === params.company?.id;
    }

    if (r.role === 'SHOWROOM_STAFF' || r.role === 'SHOWROOM_MANAGER') {
      if (!params.showroom) return false;
      return r.showroomId === params.showroom.id && r.companyId === params.company?.id;
    }

    return false;
  });

  if (!matchingRole) {
    return {
      allowed: false,
      reason: 'User lacks an active role scoped to the requested company/showroom.'
    };
  }

  return { allowed: true, reason: `Granted via active role ${matchingRole.role}.` };
}

/**
 * Evaluates vehicle access for Owner, Family Member, or Driver.
 * Immediately blocks removed family members or revoked drivers.
 */
export function evaluateVehicleCustomerAccess(params: {
  user: UserDocument;
  tokenSessionVersion?: number;
  vehicle: VehicleDocument;
  ownership?: VehicleOwnerDocument | null;
  familyMembership?: FamilyMembershipDocument | null;
  driverAssignment?: VehicleDriverDocument | null;
  requiredCapability:
    | 'VIEW_SUMMARY'
    | 'VIEW_LOCATION'
    | 'VIEW_TELEMETRY'
    | 'VIEW_INCIDENTS'
    | 'TRIGGER_SOS'
    | 'MANAGE_FAMILY_AND_DRIVERS';
}): AccessDecision {
  const sessionCheck = verifyLiveSessionActive({
    user: params.user,
    tokenSessionVersion: params.tokenSessionVersion
  });
  if (!sessionCheck.allowed) return sessionCheck;

  if (params.vehicle.registrationStatus === 'SUSPENDED') {
    return { allowed: false, reason: 'Vehicle record is currently suspended.' };
  }

  // 1. Primary/Active Vehicle Owner
  if (
    params.ownership &&
    params.ownership.userId === params.user.uid &&
    params.ownership.vehicleId === params.vehicle.id &&
    params.ownership.status === 'ACTIVE'
  ) {
    return { allowed: true, reason: 'Granted as active VEHICLE_OWNER.' };
  }

  // Only VEHICLE_OWNER can manage family members and drivers
  if (params.requiredCapability === 'MANAGE_FAMILY_AND_DRIVERS') {
    return {
      allowed: false,
      reason: 'Only an active VEHICLE_OWNER can manage family members or drivers.'
    };
  }

  // 2. Active Family Member (scoped to vehicleId and explicit permission flags)
  if (
    params.familyMembership &&
    params.familyMembership.familyUserId === params.user.uid &&
    params.familyMembership.vehicleId === params.vehicle.id
  ) {
    if (params.familyMembership.status !== 'ACTIVE') {
      return {
        allowed: false,
        reason: `Family membership status is ${params.familyMembership.status}; access denied.`
      };
    }

    const perms = params.familyMembership.permissions;
    if (params.requiredCapability === 'VIEW_SUMMARY') {
      return { allowed: true, reason: 'Granted as active FAMILY_MEMBER for summary.' };
    }
    if (params.requiredCapability === 'VIEW_LOCATION' && perms.canViewLocation) {
      return { allowed: true, reason: 'Granted via family permission canViewLocation.' };
    }
    if (params.requiredCapability === 'VIEW_TELEMETRY' && perms.canViewTelemetry) {
      return { allowed: true, reason: 'Granted via family permission canViewTelemetry.' };
    }
    if (params.requiredCapability === 'VIEW_INCIDENTS' && perms.canViewIncidentHistory) {
      return { allowed: true, reason: 'Granted via family permission canViewIncidentHistory.' };
    }
    if (params.requiredCapability === 'TRIGGER_SOS' && perms.canTriggerSos) {
      return { allowed: true, reason: 'Granted via family permission canTriggerSos.' };
    }

    return {
      allowed: false,
      reason: `Family member lacks permission for ${params.requiredCapability}.`
    };
  }

  // 3. Active Assigned Driver
  if (
    params.driverAssignment &&
    params.driverAssignment.driverUserId === params.user.uid &&
    params.driverAssignment.vehicleId === params.vehicle.id
  ) {
    if (params.driverAssignment.status !== 'ACTIVE') {
      return {
        allowed: false,
        reason: `Driver assignment is ${params.driverAssignment.status}; access denied.`
      };
    }

    if (
      params.requiredCapability === 'VIEW_SUMMARY' ||
      (params.requiredCapability === 'VIEW_LOCATION' &&
        params.driverAssignment.permissions.canViewLiveStatus) ||
      (params.requiredCapability === 'TRIGGER_SOS' &&
        params.driverAssignment.permissions.canTriggerSos)
    ) {
      return { allowed: true, reason: 'Granted as active assigned DRIVER.' };
    }

    return {
      allowed: false,
      reason: `Driver role is not permitted to perform ${params.requiredCapability}.`
    };
  }

  return {
    allowed: false,
    reason: 'User has no active owner, family, or driver relationship with this vehicle.'
  };
}

/**
 * Verifies whether an STM32U575 hardware device is permitted to submit events/telemetry
 * for a given vehicle. Rejects revoked/suspended devices or unassigned/mismatched vehicles.
 */
export function evaluateDeviceSubmissionPermission(params: {
  device: DeviceDocument | null | undefined;
  claimedVehicleId: string;
}): AccessDecision {
  const { device, claimedVehicleId } = params;
  if (!device) {
    return { allowed: false, reason: 'Device serial is not registered.' };
  }
  if (device.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: `Device status is ${device.status} (must be ACTIVE).`
    };
  }
  if (!device.assignedVehicleId || device.assignedVehicleId !== claimedVehicleId) {
    return {
      allowed: false,
      reason: 'Device is not assigned to the target vehicle.'
    };
  }
  return { allowed: true, reason: 'Active assigned device verified.' };
}

