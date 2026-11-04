import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS
} from '@veerxcape/shared-constants';
import { evaluateVehicleCustomerAccess } from '@veerxcape/shared-services';
import type {
  AuthSecretsDocument,
  FamilyMemberPermissions,
  FamilyMembershipDocument,
  UniqueLockDocument,
  UserDocument,
  UserProfileDocument,
  UserRoleDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import {
  familyMemberActivationSchema,
  familyMemberInviteSchema,
  phoneE164Schema
} from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { AuthService, resolveTierForRole } from '../auth/authService.js';
import {
  hashSecretWithScrypt,
  verifySecretWithScrypt
} from '../shared/cryptoUtils.js';
import { AppError } from '../shared/errors.js';
import {
  claimUniqueLockInTx,
  type VeerXcapeBackendRuntime
} from '../shared/runtime.js';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export class FamilyAndDriverService {
  private readonly audit: AuditService;
  private readonly authService: AuthService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
    this.authService = new AuthService(runtime);
  }

  /**
   * Vehicle Owner invites a family member with an initial setup password.
   * - Validates owner permission on `vehicleId`.
   * - Stores ONLY a scrypt hash of `initialPassword` in `_authSecrets.pendingInviteHashHex`.
   * - Never returns or logs the password in any response or audit record.
   */
  async inviteFamilyMember(params: {
    actorUser: UserDocument;
    rawInput: unknown;
  }): Promise<{ membership: FamilyMembershipDocument }> {
    const parsed = familyMemberInviteSchema.parse(params.rawInput);

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

    const { uid: familyUid } = await this.runtime.auth.ensureUserByPhone({
      phoneE164: parsed.familyMemberPhoneE164,
      displayName: parsed.familyMemberName
    });

    if (familyUid === params.actorUser.uid) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'Vehicle owner cannot invite their own phone number as a family member.'
      );
    }

    const now = this.runtime.now();
    const nowIso = now.toISOString();
    const inviteExpiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
    const { saltHex: inviteSaltHex, hashHex: inviteHashHex } =
      hashSecretWithScrypt(parsed.initialPassword);

    const membershipId = `${parsed.vehicleId}_${familyUid}`;
    const roleId = `${familyUid}_FAMILY_MEMBER_${parsed.vehicleId}`;

    const membership = await this.runtime.runTransaction(async (tx) => {
      await claimUniqueLockInTx({
        tx,
        lockKey: UNIQUE_LOCK_KEYS.phone(parsed.familyMemberPhoneE164),
        entityCollection: FIRESTORE_COLLECTIONS.USERS,
        entityId: familyUid,
        nowIso,
        conflictMessage: 'Phone number is already bound to another user identity.'
      });

      const existingUser = await tx.getDoc<UserDocument>(
        FIRESTORE_COLLECTIONS.USERS,
        familyUid
      );

      if (!existingUser) {
        const newUser: UserDocument = {
          uid: familyUid,
          phoneE164: parsed.familyMemberPhoneE164,
          status: 'PENDING_VERIFICATION',
          primaryRole: 'FAMILY_MEMBER',
          sessionVersion: 1,
          mfaEnrolled: false,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await tx.setDoc(FIRESTORE_COLLECTIONS.USERS, familyUid, newUser);

        const newProfile: UserProfileDocument = {
          uid: familyUid,
          fullName: parsed.familyMemberName,
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
          familyUid,
          newProfile
        );
      }

      const existingSecrets = await tx.getDoc<AuthSecretsDocument>(
        FIRESTORE_COLLECTIONS.AUTH_SECRETS,
        familyUid
      );

      const updatedSecrets: AuthSecretsDocument = {
        uid: familyUid,
        passwordSaltHex: existingSecrets?.passwordSaltHex ?? '',
        passwordHashHex: existingSecrets?.passwordHashHex ?? '',
        passwordUpdatedAt: existingSecrets?.passwordUpdatedAt ?? nowIso,
        failedLoginAttempts: existingSecrets?.failedLoginAttempts ?? 0,
        lockoutUntil: existingSecrets?.lockoutUntil ?? null,
        pendingInviteSaltHex: inviteSaltHex,
        pendingInviteHashHex: inviteHashHex,
        inviteExpiresAt
      };
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.AUTH_SECRETS,
        familyUid,
        updatedSecrets
      );

      const membershipDoc: FamilyMembershipDocument = {
        id: membershipId,
        vehicleId: parsed.vehicleId,
        ownerUserId: params.actorUser.uid,
        familyUserId: familyUid,
        familyMemberName: parsed.familyMemberName,
        familyMemberPhoneE164: parsed.familyMemberPhoneE164,
        relationship: parsed.relationship,
        status: 'PENDING_OTP_VERIFICATION',
        permissions: parsed.permissions,
        createdAt: nowIso,
        activatedAt: null,
        revokedAt: null
      };

      const roleDoc: UserRoleDocument = {
        id: roleId,
        userId: familyUid,
        role: 'FAMILY_MEMBER',
        scopeType: 'VEHICLE',
        scopeId: parsed.vehicleId,
        vehicleId: parsed.vehicleId,
        status: 'PENDING_APPROVAL',
        grantedBy: params.actorUser.uid,
        createdAt: nowIso
      };

      await tx.setDoc(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        membershipId,
        membershipDoc
      );
      await tx.setDoc(FIRESTORE_COLLECTIONS.USER_ROLES, roleId, roleDoc);

      return membershipDoc;
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: 'VEHICLE_OWNER',
      action: 'FAMILY_MEMBER_INVITED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
      targetDocumentId: membership.id,
      metadata: {
        vehicleId: parsed.vehicleId,
        familyUserId: familyUid,
        relationship: parsed.relationship,
        permissions: parsed.permissions
      }
    });

    return { membership };
  }

  /**
   * Family member verifies their phone OTP + the owner-supplied initial password,
   * sets their own permanent password, and activates their account.
   */
  async activateFamilyMemberAccount(rawInput: unknown): Promise<{
    customToken: string;
    user: UserDocument;
    activatedVehicleIds: string[];
  }> {
    const parsed = familyMemberActivationSchema.parse(rawInput);

    await this.authService.verifyOtpChallenge({
      phoneE164: parsed.phoneE164,
      purpose: 'FAMILY_ACTIVATION',
      otpCode: parsed.otpCode
    });

    const phoneLock = await this.runtime.getDoc<UniqueLockDocument>(
      FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
      UNIQUE_LOCK_KEYS.phone(parsed.phoneE164)
    );
    if (!phoneLock) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'No pending family member invitation found for this phone number.'
      );
    }

    const familyUid = phoneLock.entityId;
    const secrets = await this.runtime.getDoc<AuthSecretsDocument>(
      FIRESTORE_COLLECTIONS.AUTH_SECRETS,
      familyUid
    );

    if (
      !secrets ||
      !secrets.pendingInviteHashHex ||
      !secrets.pendingInviteSaltHex
    ) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'No pending family invitation secret exists for this account.'
      );
    }

    const now = this.runtime.now();
    if (
      secrets.inviteExpiresAt &&
      now.getTime() > Date.parse(secrets.inviteExpiresAt)
    ) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'Family invitation has expired. Ask the vehicle owner to send a new invite.'
      );
    }

    const isInitialValid = verifySecretWithScrypt({
      candidateSecret: parsed.initialPassword,
      saltHex: secrets.pendingInviteSaltHex,
      expectedHashHex: secrets.pendingInviteHashHex
    });

    if (!isInitialValid) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Invalid initial invitation password.'
      );
    }

    const nowIso = now.toISOString();
    const { saltHex: permSalt, hashHex: permHash } = hashSecretWithScrypt(
      parsed.newPermanentPassword
    );

    const updatedUser = await this.runtime.runTransaction(async (tx) => {
      const userDoc = await tx.getDoc<UserDocument>(
        FIRESTORE_COLLECTIONS.USERS,
        familyUid
      );
      if (!userDoc) {
        throw new AppError(404, 'NOT_FOUND', 'Family user record not found.');
      }

      const activeUser: UserDocument = {
        ...userDoc,
        status: 'ACTIVE',
        sessionVersion: userDoc.sessionVersion + 1,
        updatedAt: nowIso,
        lastLoginAt: nowIso
      };

      const nextSecrets: AuthSecretsDocument = {
        uid: familyUid,
        passwordSaltHex: permSalt,
        passwordHashHex: permHash,
        passwordUpdatedAt: nowIso,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        pendingInviteSaltHex: null,
        pendingInviteHashHex: null,
        inviteExpiresAt: null
      };

      await tx.setDoc(FIRESTORE_COLLECTIONS.USERS, familyUid, activeUser);
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.AUTH_SECRETS,
        familyUid,
        nextSecrets
      );
      return activeUser;
    });

    const pendingMemberships =
      await this.runtime.listDocs<FamilyMembershipDocument>(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        (m) =>
          m.familyUserId === familyUid &&
          m.status === 'PENDING_OTP_VERIFICATION'
      );

    const activatedVehicleIds: string[] = [];

    for (const m of pendingMemberships) {
      await this.runtime.setDoc<FamilyMembershipDocument>(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        m.id,
        {
          ...m,
          status: 'ACTIVE',
          activatedAt: nowIso
        }
      );

      const roleId = `${familyUid}_FAMILY_MEMBER_${m.vehicleId}`;
      const roleDoc = await this.runtime.getDoc<UserRoleDocument>(
        FIRESTORE_COLLECTIONS.USER_ROLES,
        roleId
      );
      if (roleDoc) {
        await this.runtime.setDoc<UserRoleDocument>(
          FIRESTORE_COLLECTIONS.USER_ROLES,
          roleId,
          {
            ...roleDoc,
            status: 'ACTIVE'
          }
        );
      }

      activatedVehicleIds.push(m.vehicleId);
    }

    const customToken = await this.runtime.auth.createCustomToken(familyUid, {
      sv: updatedUser.sessionVersion,
      tier: resolveTierForRole(updatedUser.primaryRole)
    });

    await this.audit.appendAuditLog({
      actorUserId: familyUid,
      actorRole: 'FAMILY_MEMBER',
      action: 'FAMILY_MEMBER_ACTIVATED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: familyUid,
      metadata: { activatedVehicleIds }
    });

    return {
      customToken,
      user: updatedUser,
      activatedVehicleIds
    };
  }

  /**
   * Vehicle Owner modifies permissions or revokes a family member's access.
   * When revoked, increments the family member's sessionVersion and revokes refresh tokens
   * so access is cut off immediately.
   */
  async updateOrRevokeFamilyMembership(params: {
    actorUser: UserDocument;
    membershipId: string;
    action: 'UPDATE_PERMISSIONS' | 'REVOKE';
    permissions?: FamilyMemberPermissions;
  }): Promise<FamilyMembershipDocument> {
    const membership = await this.runtime.getDoc<FamilyMembershipDocument>(
      FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
      params.membershipId
    );
    if (!membership) {
      throw new AppError(404, 'NOT_FOUND', 'Family membership not found.');
    }

    const vehicle = await this.runtime.getDoc<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      membership.vehicleId
    );
    const ownership = await this.runtime.getDoc<VehicleOwnerDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
      `${membership.vehicleId}_${params.actorUser.uid}`
    );

    if (!vehicle) {
      throw new AppError(404, 'NOT_FOUND', 'Vehicle not found.');
    }

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

    if (params.action === 'REVOKE') {
      const revokedMembership: FamilyMembershipDocument = {
        ...membership,
        status: 'REVOKED',
        revokedAt: nowIso
      };
      await this.runtime.setDoc(
        FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        membership.id,
        revokedMembership
      );

      const roleId = `${membership.familyUserId}_FAMILY_MEMBER_${membership.vehicleId}`;
      const roleDoc = await this.runtime.getDoc<UserRoleDocument>(
        FIRESTORE_COLLECTIONS.USER_ROLES,
        roleId
      );
      if (roleDoc) {
        await this.runtime.setDoc<UserRoleDocument>(
          FIRESTORE_COLLECTIONS.USER_ROLES,
          roleId,
          {
            ...roleDoc,
            status: 'REVOKED',
            revokedAt: nowIso
          }
        );
      }

      // Increment family member sessionVersion and revoke refresh tokens for immediate effect
      const familyUser = await this.runtime.getDoc<UserDocument>(
        FIRESTORE_COLLECTIONS.USERS,
        membership.familyUserId
      );
      if (familyUser) {
        await this.runtime.setDoc<UserDocument>(
          FIRESTORE_COLLECTIONS.USERS,
          familyUser.uid,
          {
            ...familyUser,
            sessionVersion: familyUser.sessionVersion + 1,
            updatedAt: nowIso
          }
        );
        await this.runtime.auth.revokeRefreshTokens(familyUser.uid);
      }

      await this.audit.appendAuditLog({
        actorUserId: params.actorUser.uid,
        actorRole: 'VEHICLE_OWNER',
        action: 'FAMILY_MEMBER_ACCESS_REVOKED',
        severity: 'SENSITIVE',
        targetCollection: FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
        targetDocumentId: membership.id,
        metadata: {
          vehicleId: membership.vehicleId,
          familyUserId: membership.familyUserId
        }
      });

      return revokedMembership;
    }

    if (!params.permissions) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'Permissions object is required for UPDATE_PERMISSIONS.'
      );
    }

    const updatedMembership: FamilyMembershipDocument = {
      ...membership,
      permissions: params.permissions
    };
    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
      membership.id,
      updatedMembership
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: 'VEHICLE_OWNER',
      action: 'FAMILY_MEMBER_PERMISSIONS_UPDATED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.FAMILY_MEMBERSHIPS,
      targetDocumentId: membership.id,
      metadata: {
        vehicleId: membership.vehicleId,
        permissions: params.permissions
      }
    });

    return updatedMembership;
  }

  /**
   * Vehicle Owner assigns or revokes an authorised Driver for a vehicle.
   */
  async assignOrRevokeDriver(params: {
    actorUser: UserDocument;
    vehicleId: string;
    driverPhoneE164: string;
    driverFullName: string;
    action: 'ASSIGN' | 'REVOKE';
  }): Promise<VehicleDriverDocument> {
    const cleanPhone = phoneE164Schema.parse(params.driverPhoneE164);
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

    const accessCheck = evaluateVehicleCustomerAccess({
      user: params.actorUser,
      vehicle,
      ownership,
      requiredCapability: 'MANAGE_FAMILY_AND_DRIVERS'
    });

    if (!accessCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', accessCheck.reason);
    }

    const { uid: driverUid } = await this.runtime.auth.ensureUserByPhone({
      phoneE164: cleanPhone,
      displayName: params.driverFullName
    });

    const assignmentId = `${params.vehicleId}_${driverUid}`;
    const roleId = `${driverUid}_DRIVER_${params.vehicleId}`;
    const nowIso = this.runtime.now().toISOString();

    const doc: VehicleDriverDocument = {
      id: assignmentId,
      vehicleId: params.vehicleId,
      driverUserId: driverUid,
      assignedByOwnerId: params.actorUser.uid,
      status: params.action === 'ASSIGN' ? 'ACTIVE' : 'REVOKED',
      permissions: {
        canTriggerSos: true,
        canViewLiveStatus: true
      },
      validFrom: nowIso,
      validUntil: null,
      createdAt: nowIso,
      revokedAt: params.action === 'REVOKE' ? nowIso : null
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
      assignmentId,
      doc
    );

    await this.runtime.setDoc<UserRoleDocument>(
      FIRESTORE_COLLECTIONS.USER_ROLES,
      roleId,
      {
        id: roleId,
        userId: driverUid,
        role: 'DRIVER',
        scopeType: 'VEHICLE',
        scopeId: params.vehicleId,
        vehicleId: params.vehicleId,
        status: params.action === 'ASSIGN' ? 'ACTIVE' : 'REVOKED',
        grantedBy: params.actorUser.uid,
        createdAt: nowIso,
        revokedAt: params.action === 'REVOKE' ? nowIso : null
      }
    );

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: 'VEHICLE_OWNER',
      action:
        params.action === 'ASSIGN' ? 'DRIVER_ASSIGNED' : 'DRIVER_REVOKED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.VEHICLE_DRIVERS,
      targetDocumentId: assignmentId,
      metadata: { vehicleId: params.vehicleId, driverUserId: driverUid }
    });

    return doc;
  }
}

