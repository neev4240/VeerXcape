import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS,
  type AuthorityDepartment,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import type {
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
import { roleAssignmentPayloadSchema } from '@veerxcape/shared-validation';
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

  private assertVeerXcapeRole(params: {
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

    const nowIso = this.runtime.now().toISOString();
    const orgId = `org_${randomUUID().slice(0, 12)}`;
    const companyId = `cmp_${randomUUID().slice(0, 12)}`;

    const orgDoc: OrganisationDocument = {
      id: orgId,
      name: params.brandName,
      type: 'AUTOMOTIVE_PARENT_COMPANY',
      registrationNumber: params.registrationNumber,
      status: 'ACTIVE',
      contactEmail: params.contactEmail,
      contactPhone: params.contactPhone,
      approvedBy: params.actorUser.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const companyDoc: CompanyDocument = {
      id: companyId,
      organisationId: orgId,
      brandName: params.brandName,
      oemCode: params.oemCode.trim().toUpperCase(),
      headquartersAddress: params.headquartersAddress,
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

    const company = await this.runtime.getDoc<CompanyDocument>(
      FIRESTORE_COLLECTIONS.COMPANIES,
      params.companyId
    );
    if (!company) {
      throw new AppError(404, 'NOT_FOUND', 'Parent company not found.');
    }

    const nowIso = this.runtime.now().toISOString();
    const showroomId = `shw_${randomUUID().slice(0, 12)}`;
    const cleanDealerCode = params.dealerCode.trim().toUpperCase();

    const showroomDoc: ShowroomDocument = {
      id: showroomId,
      companyId: company.id,
      name: params.name,
      dealerCode: cleanDealerCode,
      city: params.city,
      stateCode: params.stateCode.trim().toUpperCase(),
      address: params.address,
      contactPhone: params.contactPhone,
      contactEmail: params.contactEmail,
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

    const nowIso = this.runtime.now().toISOString();
    const orgId = `org_${randomUUID().slice(0, 12)}`;
    const authorityId = `aut_${randomUUID().slice(0, 12)}`;
    const cleanJurisdiction = params.jurisdictionCode.trim().toUpperCase();

    const orgDoc: OrganisationDocument = {
      id: orgId,
      name: params.name,
      type: 'GOVERNMENT_AUTHORITY',
      registrationNumber: params.registrationNumber,
      status: 'ACTIVE',
      contactEmail: params.contactEmail,
      contactPhone: params.contactControlRoomPhone,
      approvedBy: params.actorUser.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const authorityDoc: AuthorityDocument = {
      id: authorityId,
      organisationId: orgId,
      name: params.name,
      department: params.department,
      jurisdictionState: params.jurisdictionState,
      jurisdictionDistrict: params.jurisdictionDistrict,
      jurisdictionCode: cleanJurisdiction,
      verificationStatus: 'VERIFIED',
      verifiedBySuperAdminId: params.actorUser.uid,
      contactControlRoomPhone: params.contactControlRoomPhone,
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
      reason: params.reason,
      metadata: { newSessionVersion: suspendedUser.sessionVersion }
    });

    return suspendedUser;
  }

  /**
   * Updates platform system configuration (`VEERXCAPE_SUPER_ADMIN` only).
   */
  async updateSystemConfiguration(params: {
    actorUser: UserDocument;
    activeRoles: UserRoleDocument[];
    configKey: string;
    value: Record<string, unknown>;
  }): Promise<SystemConfigurationDocument> {
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
      value: params.value,
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
      metadata: { version: doc.version }
    });

    return doc;
  }
}

