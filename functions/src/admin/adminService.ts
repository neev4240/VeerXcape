import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS,
  type AuthorityDepartment,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import type {
  AuthSecretsDocument,
  AuthorityDocument,
  CompanyDocument,
  DeviceDocument,
  IncidentDocument,
  OrganisationDocument,
  ShowroomDocument,
  SystemConfigurationDocument,
  UserDocument,
  UserRoleDocument,
  VehicleDocument
} from '@veerxcape/shared-types';
import {
  authorityCreateSchema,
  companyTenantCreateSchema,
  roleAssignmentPayloadSchema,
  showroomCreateSchema,
  systemConfigurationUpdatePayloadSchema,
  userAccountStatusPayloadSchema
} from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { AppError } from '../shared/errors.js';
import {
  claimUniqueLockInTx,
  type VeerXcapeBackendRuntime
} from '../shared/runtime.js';

export class AdminService {
  private readonly audit: AuditService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
  }

  public assertVeerXcapeRole(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    allowedRoles: Array<
      'VEERXCAPE_SUPPORT' | 'VEERXCAPE_ADMIN' | 'VEERXCAPE_SUPER_ADMIN'
    >;
  }): UserRoleDocument {
    const match = params.activeRoles.find(
      (r) =>
        r.userId === params.actorUser.uid &&
        r.status === 'ACTIVE' &&
        r.scopeType === 'PLATFORM' &&
        params.allowedRoles.includes(
          r.role as
            | 'VEERXCAPE_SUPPORT'
            | 'VEERXCAPE_ADMIN'
            | 'VEERXCAPE_SUPER_ADMIN'
        )
    );
    if (!match) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `Requires active platform role in [${params.allowedRoles.join(', ')}].`
      );
    }
    return match;
  }

  /**
   * Platform Overview Dashboard metrics for VeerXcape internal staff.
   */
  async getPlatformOverview(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
  }) {
    this.assertVeerXcapeRole({
      ...params,
      allowedRoles: [
        'VEERXCAPE_SUPPORT',
        'VEERXCAPE_ADMIN',
        'VEERXCAPE_SUPER_ADMIN'
      ]
    });

    const [
      users,
      vehicles,
      devices,
      companies,
      showrooms,
      authorities,
      incidents
    ] = await Promise.all([
      this.runtime.listDocs<UserDocument>(FIRESTORE_COLLECTIONS.USERS),
      this.runtime.listDocs<VehicleDocument>(FIRESTORE_COLLECTIONS.VEHICLES),
      this.runtime.listDocs<DeviceDocument>(FIRESTORE_COLLECTIONS.DEVICES),
      this.runtime.listDocs<CompanyDocument>(FIRESTORE_COLLECTIONS.COMPANIES),
      this.runtime.listDocs<ShowroomDocument>(FIRESTORE_COLLECTIONS.SHOWROOMS),
      this.runtime.listDocs<AuthorityDocument>(
        FIRESTORE_COLLECTIONS.AUTHORITIES
      ),
      this.runtime.listDocs<IncidentDocument>(FIRESTORE_COLLECTIONS.INCIDENTS)
    ]);

    return {
      totalUsers: users.length,
      totalVehicles: vehicles.length,
      activeDevices: devices.filter((d) => d.status === 'ACTIVE').length,
      inactiveOrProvisionedDevices: devices.filter(
        (d) => d.status !== 'ACTIVE'
      ).length,
      registeredCompanies: companies.length,
      registeredShowrooms: showrooms.length,
      verifiedAuthorities: authorities.filter(
        (a) => a.verificationStatus === 'VERIFIED'
      ).length,
      totalIncidents: incidents.length
    };
  }

  /**
   * Onboards and activates a Parent Automotive Company (`VEERXCAPE_ADMIN` or `VEERXCAPE_SUPER_ADMIN`).
   */
  async createCompanyTenant(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    brandName: string;
    oemCode: string;
    registrationNumber: string;
    headquartersAddress: string;
    contactEmail: string;
    contactPhone: string;
  }): Promise<{ organisation: OrganisationDocument; company: CompanyDocument }> {
    const adminRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
    });

    const parsed = companyTenantCreateSchema.parse({
      brandName: params.brandName,
      oemCode: params.oemCode,
      registrationNumber: params.registrationNumber,
      headquartersAddress: params.headquartersAddress,
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone
    });

    const nowIso = this.runtime.now().toISOString();
    const orgId = `org_${randomUUID().slice(0, 12)}`;
    const companyId = `cmp_${randomUUID().slice(0, 12)}`;

    const orgDoc: OrganisationDocument = {
      id: orgId,
      name: parsed.brandName,
      type: 'AUTOMOTIVE_PARENT_COMPANY',
      registrationNumber: parsed.registrationNumber,
      status: 'ACTIVE',
      contactEmail: parsed.contactEmail,
      contactPhone: parsed.contactPhone,
      approvedBy: params.actorUser.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const companyDoc: CompanyDocument = {
      id: companyId,
      organisationId: orgId,
      brandName: parsed.brandName,
      oemCode: parsed.oemCode.trim().toUpperCase(),
      headquartersAddress: parsed.headquartersAddress,
      status: 'ACTIVE',
      totalShowrooms: 0,
      totalVehiclesRegistered: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(FIRESTORE_COLLECTIONS.ORGANISATIONS, orgId, orgDoc);
      await tx.setDoc(FIRESTORE_COLLECTIONS.COMPANIES, companyId, companyDoc);
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: adminRole.role,
      action: 'COMPANY_TENANT_CREATED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.COMPANIES,
      targetDocumentId: companyId,
      metadata: { brandName: params.brandName, oemCode: companyDoc.oemCode }
    });

    return { organisation: orgDoc, company: companyDoc };
  }

  /**
   * Creates and approves a Showroom under a Parent Company (`VEERXCAPE_ADMIN` / `VEERXCAPE_SUPER_ADMIN`).
   */
  async createAndApproveShowroom(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    companyId: string;
    name: string;
    dealerCode: string;
    city: string;
    stateCode: string;
    address: string;
    contactPhone: string;
    contactEmail: string;
  }): Promise<ShowroomDocument> {
    const adminRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
    });

    const parsed = showroomCreateSchema.parse({
      companyId: params.companyId,
      name: params.name,
      dealerCode: params.dealerCode,
      city: params.city,
      stateCode: params.stateCode,
      address: params.address,
      contactPhone: params.contactPhone,
      contactEmail: params.contactEmail
    });

    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      parsed.companyId
    );
    if (!company) {
      throw new AppError(404, 'NOT_FOUND', 'Parent company not found.');
    }

    const nowIso = this.runtime.now().toISOString();
    const showroomId = `shw_${randomUUID().slice(0, 12)}`;
    const cleanDealerCode = parsed.dealerCode.trim().toUpperCase();

    const showroomDoc: ShowroomDocument = {
      id: showroomId,
      companyId: company.id,
      name: parsed.name,
      dealerCode: cleanDealerCode,
      city: parsed.city,
      stateCode: parsed.stateCode.trim().toUpperCase(),
      address: parsed.address,
      contactPhone: parsed.contactPhone,
      contactEmail: parsed.contactEmail,
      status: 'ACTIVE',
      approvedBy: params.actorUser.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await claimUniqueLockInTx({
        tx,
        lockKey: UNIQUE_LOCK_KEYS.dealerCode(company.id, cleanDealerCode),
        entityCollection: FIRESTORE_COLLECTIONS.SHOWROOMS,
        entityId: showroomId,
        nowIso,
        conflictMessage: `Dealer code ${cleanDealerCode} already exists for company ${company.brandName}.`
      });

      await tx.setDoc(FIRESTORE_COLLECTIONS.SHOWROOMS, showroomId, showroomDoc);
      await tx.setDoc<CompanyDocument>(
        FIRESTORE_COLLECTIONS.COMPANIES,
        company.id,
        {
          ...company,
          totalShowrooms: company.totalShowrooms + 1,
          updatedAt: nowIso
        }
      );
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: adminRole.role,
      action: 'SHOWROOM_APPROVED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.SHOWROOMS,
      targetDocumentId: showroomId,
      metadata: {
        companyId: company.id,
        dealerCode: cleanDealerCode,
        city: params.city
      }
    });

    return showroomDoc;
  }

  /**
   * Verifies organisational identity and creates an approved Government Authority (`VEERXCAPE_ADMIN` / `SUPER_ADMIN`).
   */
  async createAndVerifyAuthority(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    name: string;
    registrationNumber: string;
    department: AuthorityDepartment;
    jurisdictionState: string;
    jurisdictionDistrict: string;
    jurisdictionCode: string;
    contactControlRoomPhone: string;
    contactEmail: string;
  }): Promise<AuthorityDocument> {
    const adminRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
    });

    const parsed = authorityCreateSchema.parse({
      name: params.name,
      registrationNumber: params.registrationNumber,
      department: params.department,
      jurisdictionState: params.jurisdictionState,
      jurisdictionDistrict: params.jurisdictionDistrict,
      jurisdictionCode: params.jurisdictionCode,
      contactControlRoomPhone: params.contactControlRoomPhone,
      contactEmail: params.contactEmail
    });

    const nowIso = this.runtime.now().toISOString();
    const orgId = `org_${randomUUID().slice(0, 12)}`;
    const authorityId = `aut_${randomUUID().slice(0, 12)}`;
    const cleanJurisdiction = parsed.jurisdictionCode.trim().toUpperCase();

    const orgDoc: OrganisationDocument = {
      id: orgId,
      name: parsed.name,
      type: 'GOVERNMENT_AUTHORITY',
      registrationNumber: parsed.registrationNumber,
      status: 'ACTIVE',
      contactEmail: parsed.contactEmail,
      contactPhone: parsed.contactControlRoomPhone,
      approvedBy: params.actorUser.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const authorityDoc: AuthorityDocument = {
      id: authorityId,
      organisationId: orgId,
      name: parsed.name,
      department: parsed.department,
      jurisdictionState: parsed.jurisdictionState,
      jurisdictionDistrict: parsed.jurisdictionDistrict,
      jurisdictionCode: cleanJurisdiction,
      verificationStatus: 'VERIFIED',
      verifiedBySuperAdminId: params.actorUser.uid,
      contactControlRoomPhone: parsed.contactControlRoomPhone,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(FIRESTORE_COLLECTIONS.ORGANISATIONS, orgId, orgDoc);
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.AUTHORITIES,
        authorityId,
        authorityDoc
      );
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: adminRole.role,
      action: 'AUTHORITY_VERIFIED_AND_CREATED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.AUTHORITIES,
      targetDocumentId: authorityId,
      metadata: {
        name: params.name,
        department: params.department,
        jurisdictionCode: cleanJurisdiction
      }
    });

    return authorityDoc;
  }

  /**
   * Assigns an explicit scoped role to a user.
   * Granting `VEERXCAPE_ADMIN` or `VEERXCAPE_SUPER_ADMIN` requires `VEERXCAPE_SUPER_ADMIN`.
   */
  async assignScopedRole(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    rawInput: unknown;
  }): Promise<UserRoleDocument> {
    const parsed = roleAssignmentPayloadSchema.parse(params.rawInput);
    const isTargetInternalAdmin =
      parsed.role === 'VEERXCAPE_ADMIN' ||
      parsed.role === 'VEERXCAPE_SUPER_ADMIN' ||
      parsed.role === 'VEERXCAPE_SUPPORT';

    const adminRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: isTargetInternalAdmin
        ? ['VEERXCAPE_SUPER_ADMIN']
        : ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
    });

    // Enforce tenant & resource consistency for scoped role assignments
    if (parsed.scopeType === 'SHOWROOM') {
      const showroom = await this.runtime.getDoc<ShowroomDocument>(
        FIRESTORE_COLLECTIONS.SHOWROOMS,
        parsed.scopeId
      );
      if (showroom && parsed.companyId && showroom.companyId !== parsed.companyId) {
        throw new AppError(
          403,
          'TENANT_ISOLATION_VIOLATION',
          'Cross-tenant role assignment blocked: showroom does not belong to the specified parent company.'
        );
      }
      if (showroom && parsed.showroomId && parsed.showroomId !== parsed.scopeId) {
        throw new AppError(
          403,
          'TENANT_ISOLATION_VIOLATION',
          'Showroom role assignment scopeId must match showroomId.'
        );
      }
    } else if (parsed.scopeType === 'COMPANY') {
      if (parsed.companyId && parsed.companyId !== parsed.scopeId) {
        throw new AppError(
          403,
          'TENANT_ISOLATION_VIOLATION',
          'Company role assignment scopeId must match companyId.'
        );
      }
    } else if (parsed.scopeType === 'AUTHORITY') {
      const authority = await this.runtime.getDoc<AuthorityDocument>(
        FIRESTORE_COLLECTIONS.AUTHORITIES,
        parsed.scopeId
      );
      if (
        authority &&
        parsed.department &&
        authority.department !== parsed.department
      ) {
        throw new AppError(
          403,
          'TENANT_ISOLATION_VIOLATION',
          'Authority role department does not match the target authority organisation.'
        );
      }
      if (
        authority &&
        parsed.jurisdictionCode &&
        authority.jurisdictionCode !== parsed.jurisdictionCode
      ) {
        throw new AppError(
          403,
          'TENANT_ISOLATION_VIOLATION',
          'Authority role jurisdictionCode does not match the target authority organisation.'
        );
      }
    }

    const nowIso = this.runtime.now().toISOString();
    const roleId = `${parsed.targetUserId}_${parsed.role}_${parsed.scopeId}`;

    const roleDoc: UserRoleDocument = {
      id: roleId,
      userId: parsed.targetUserId,
      role: parsed.role as UserRoleCode,
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      companyId: parsed.companyId ?? null,
      showroomId: parsed.showroomId ?? null,
      authorityId: parsed.authorityId ?? null,
      vehicleId: parsed.vehicleId ?? null,
      department: parsed.department ?? null,
      jurisdictionCode: parsed.jurisdictionCode ?? null,
      status: 'ACTIVE',
      grantedBy: params.actorUser.uid,
      createdAt: nowIso
    };

    await this.runtime.setDoc(FIRESTORE_COLLECTIONS.USER_ROLES, roleId, roleDoc);

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: adminRole.role,
      action: 'ROLE_ASSIGNED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.USER_ROLES,
      targetDocumentId: roleId,
      metadata: {
        targetUserId: parsed.targetUserId,
        role: parsed.role,
        scopeType: parsed.scopeType,
        scopeId: parsed.scopeId
      }
    });

    return roleDoc;
  }

  /**
   * Immediately suspends a user account, increments sessionVersion, and revokes refresh tokens.
   */
  async suspendUserAccount(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    targetUserId: string;
    reason: string;
  }): Promise<UserDocument> {
    const { reason: cleanReason } = userAccountStatusPayloadSchema.parse({
      reason: params.reason
    });

    const adminRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
    });

    const targetUser = await this.runtime.getDoc<UserDocument>(
      FIRESTORE_COLLECTIONS.USERS,
      params.targetUserId
    );
    if (!targetUser) {
      throw new AppError(404, 'NOT_FOUND', 'Target user not found.');
    }

    if (
      targetUser.primaryRole === 'VEERXCAPE_SUPER_ADMIN' &&
      adminRole.role !== 'VEERXCAPE_SUPER_ADMIN'
    ) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only a VEERXCAPE_SUPER_ADMIN may suspend a super-administrator account.'
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const suspendedUser: UserDocument = {
      ...targetUser,
      status: 'SUSPENDED',
      sessionVersion: targetUser.sessionVersion + 1,
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      targetUser.uid,
      suspendedUser
    );
    await this.runtime.auth.revokeRefreshTokens(targetUser.uid);

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: adminRole.role,
      action: 'USER_ACCOUNT_SUSPENDED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: targetUser.uid,
      reason: cleanReason,
      metadata: { newSessionVersion: suspendedUser.sessionVersion }
    });

    return suspendedUser;
  }

  /**
   * Reactivates a suspended or locked user account, increments sessionVersion,
   * clears failed login lockouts, and writes a critical audit log entry.
   */
  async reactivateUserAccount(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    targetUserId: string;
    reason: string;
  }): Promise<UserDocument> {
    const { reason: cleanReason } = userAccountStatusPayloadSchema.parse({
      reason: params.reason
    });

    const adminRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
    });

    const targetUser = await this.runtime.getDoc<UserDocument>(
      FIRESTORE_COLLECTIONS.USERS,
      params.targetUserId
    );
    if (!targetUser) {
      throw new AppError(404, 'NOT_FOUND', 'Target user not found.');
    }

    if (
      targetUser.primaryRole === 'VEERXCAPE_SUPER_ADMIN' &&
      adminRole.role !== 'VEERXCAPE_SUPER_ADMIN'
    ) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only a VEERXCAPE_SUPER_ADMIN may reactivate a super-administrator account.'
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const reactivatedUser: UserDocument = {
      ...targetUser,
      status: 'ACTIVE',
      sessionVersion: targetUser.sessionVersion + 1,
      updatedAt: nowIso
    };

    const existingSecrets = await this.runtime.getDoc<AuthSecretsDocument>(
      FIRESTORE_COLLECTIONS.AUTH_SECRETS,
      targetUser.uid
    );

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.USERS,
        targetUser.uid,
        reactivatedUser
      );
      if (existingSecrets) {
        await tx.setDoc<AuthSecretsDocument>(
          FIRESTORE_COLLECTIONS.AUTH_SECRETS,
          targetUser.uid,
          {
            ...existingSecrets,
            failedLoginAttempts: 0,
            lockoutUntil: null
          }
        );
      }
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: adminRole.role,
      action: 'USER_ACCOUNT_REACTIVATED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: targetUser.uid,
      reason: cleanReason,
      metadata: {
        previousStatus: targetUser.status,
        newSessionVersion: reactivatedUser.sessionVersion
      }
    });

    return reactivatedUser;
  }

  /**
   * Updates platform system configuration (`VEERXCAPE_SUPER_ADMIN` only).
   */
  async updateSystemConfiguration(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    configKey: string;
    value: Record<string, unknown>;
    reason?: string;
  }): Promise<SystemConfigurationDocument> {
    if (!params.configKey || params.configKey.trim().length < 3) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Valid configKey is required.');
    }
    const parsed = systemConfigurationUpdatePayloadSchema.parse({
      value: params.value,
      reason: params.reason
    });

    const superRole = this.assertVeerXcapeRole({
      ...params,
      allowedRoles: ['VEERXCAPE_SUPER_ADMIN']
    });

    const existing = await this.runtime.getDoc<SystemConfigurationDocument>(
      FIRESTORE_COLLECTIONS.SYSTEM_CONFIGURATION,
      params.configKey
    );

    const nowIso = this.runtime.now().toISOString();
    const doc: SystemConfigurationDocument = {
      id: params.configKey,
      value: parsed.value,
      version: existing ? existing.version + 1 : 1,
      updatedBySuperAdminId: params.actorUser.uid,
      updatedAt: nowIso
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.SYSTEM_CONFIGURATION,
      params.configKey,
      doc
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: superRole.role,
      action: 'SYSTEM_CONFIGURATION_UPDATED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.SYSTEM_CONFIGURATION,
      targetDocumentId: params.configKey,
      reason: parsed.reason,
      metadata: { version: doc.version }
    });

    return doc;
  }
}

