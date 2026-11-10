import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import { verifyLiveSessionActive } from '@veerxcape/shared-services';
import type {
  AuthSecretsDocument,
  OtpChallengeDocument,
  OtpPurpose,
  PortalTier,
  UniqueLockDocument,
  UserDocument,
  UserProfileDocument,
  UserRoleDocument,
  VehicleDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import {
  customerAccountActivationSchema,
  customerPhoneLoginSchema,
  otpCodeSchema,
  phoneE164Schema,
  requestOtpPayloadSchema,
  strongPasswordSchema
} from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import {
  generateSixDigitOtp,
  hashSecretWithScrypt,
  verifySecretWithScrypt
} from '../shared/cryptoUtils.js';
import { AppError } from '../shared/errors.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_REQUESTS_PER_WINDOW = 5;
const MAX_OTP_VERIFY_ATTEMPTS = 5;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function resolveTierForRole(role: UserRoleCode): PortalTier {
  if (
    role === 'VEERXCAPE_SUPPORT' ||
    role === 'VEERXCAPE_ADMIN' ||
    role === 'VEERXCAPE_SUPER_ADMIN'
  ) {
    return 'ADMIN';
  }
  if (
    role === 'AUTHORITY_MEDICAL' ||
    role === 'AUTHORITY_POLICE' ||
    role === 'AUTHORITY_ROAD'
  ) {
    return 'AUTHORITY';
  }
  if (
    role === 'COMPANY_ADMIN' ||
    role === 'SHOWROOM_MANAGER' ||
    role === 'SHOWROOM_STAFF'
  ) {
    return 'DEALER';
  }
  return 'CUSTOMER';
}

export interface AuthenticatedContext {
  user: UserDocument;
  activeRoles: UserRoleDocument[];
}

export class AuthService {
  private readonly audit: AuditService;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
  }

  /**
   * Generates a rate-limited 6-digit OTP challenge and stores only its scrypt hash.
   */
  async requestOtp(rawInput: unknown): Promise<{
    challengeId: string;
    expiresAt: string;
    demoOtpForTestingOnly?: string;
  }> {
    const parsed = requestOtpPayloadSchema.parse(rawInput);
    const challengeId = `${parsed.phoneE164}_${parsed.purpose}`;
    const now = this.runtime.now();
    const nowMs = now.getTime();

    const existing = await this.runtime.getDoc<OtpChallengeDocument>(
      FIRESTORE_COLLECTIONS.OTP_CHALLENGES,
      challengeId
    );

    let windowStartIso = now.toISOString();
    let requestCount = 1;

    if (existing) {
      const windowStartMs = Date.parse(existing.rateLimitWindowStart);
      if (nowMs - windowStartMs < OTP_RATE_WINDOW_MS) {
        if (existing.requestCountInWindow >= MAX_OTP_REQUESTS_PER_WINDOW) {
          throw new AppError(
            429,
            'RATE_LIMITED',
            'Too many OTP requests for this phone number. Please wait 15 minutes.'
          );
        }
        windowStartIso = existing.rateLimitWindowStart;
        requestCount = existing.requestCountInWindow + 1;
      }
    }

    const otpCode = generateSixDigitOtp();
    const { saltHex, hashHex } = hashSecretWithScrypt(otpCode);
    const expiresAt = new Date(nowMs + OTP_TTL_MS).toISOString();

    const challengeDoc: OtpChallengeDocument = {
      id: challengeId,
      phoneE164: parsed.phoneE164,
      purpose: parsed.purpose,
      otpSaltHex: saltHex,
      otpHashHex: hashHex,
      attempts: 0,
      maxAttempts: MAX_OTP_VERIFY_ATTEMPTS,
      verified: false,
      verifiedAt: null,
      expiresAt,
      rateLimitWindowStart: windowStartIso,
      requestCountInWindow: requestCount,
      createdAt: now.toISOString()
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.OTP_CHALLENGES,
      challengeId,
      challengeDoc
    );

    const canReturnDemoOtp =
      this.runtime.config.environment !== 'production' &&
      this.runtime.config.allowDemoOtp;

    return {
      challengeId,
      expiresAt,
      ...(canReturnDemoOtp ? { demoOtpForTestingOnly: otpCode } : {})
    };
  }

  /**
   * Verifies an OTP code for a given phone and purpose and marks it verified.
   */
  async verifyOtpChallenge(params: {
    phoneE164: string;
    purpose: OtpPurpose;
    otpCode: string;
    consumeImmediately?: boolean;
  }): Promise<OtpChallengeDocument> {
    const cleanPhone = phoneE164Schema.parse(params.phoneE164);
    const cleanOtp = otpCodeSchema.parse(params.otpCode);
    const challengeId = `${cleanPhone}_${params.purpose}`;

    const challenge = await this.runtime.getDoc<OtpChallengeDocument>(
      FIRESTORE_COLLECTIONS.OTP_CHALLENGES,
      challengeId
    );

    if (!challenge) {
      throw new AppError(400, 'BAD_REQUEST', 'No active OTP challenge found.');
    }

    const nowMs = this.runtime.now().getTime();
    if (nowMs > Date.parse(challenge.expiresAt)) {
      throw new AppError(400, 'BAD_REQUEST', 'OTP code has expired.');
    }

    if (challenge.verified && params.consumeImmediately !== false) {
      throw new AppError(400, 'BAD_REQUEST', 'OTP code has already been used.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Maximum OTP verification attempts exceeded. Request a new code.'
      );
    }

    const isValid = verifySecretWithScrypt({
      candidateSecret: cleanOtp,
      saltHex: challenge.otpSaltHex,
      expectedHashHex: challenge.otpHashHex
    });

    if (!isValid) {
      const updated: OtpChallengeDocument = {
        ...challenge,
        attempts: challenge.attempts + 1
      };
      await this.runtime.setDoc(
        FIRESTORE_COLLECTIONS.OTP_CHALLENGES,
        challengeId,
        updated
      );
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid OTP verification code.');
    }

    const verifiedDoc: OtpChallengeDocument = {
      ...challenge,
      attempts: challenge.attempts + 1,
      verified: true,
      verifiedAt: this.runtime.now().toISOString()
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.OTP_CHALLENGES,
      challengeId,
      verifiedDoc
    );
    return verifiedDoc;
  }

  private async resolveUidByPhoneE164(phoneE164: string): Promise<string | null> {
    const lockKey = UNIQUE_LOCK_KEYS.phone(phoneE164);
    const phoneLock = await this.runtime.getDoc<UniqueLockDocument>(
      FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
      lockKey
    );
    if (phoneLock) {
      return phoneLock.entityId;
    }

    const matchingUsers = await this.runtime.listDocs<UserDocument>(
      FIRESTORE_COLLECTIONS.USERS,
      {
        where: [{ field: 'phoneE164', op: '==', value: phoneE164 }],
        limit: 1
      }
    );
    if (matchingUsers.length === 0) {
      return null;
    }
    const foundUser = matchingUsers[0];
    await this.runtime.setDoc<UniqueLockDocument>(
      FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
      lockKey,
      {
        lockKey,
        entityCollection: FIRESTORE_COLLECTIONS.USERS,
        entityId: foundUser.uid,
        createdAt: this.runtime.now().toISOString()
      }
    );
    return foundUser.uid;
  }

  /**
   * Activates a showroom-provisioned customer account after OTP verification
   * and sets their permanent scrypt-hashed password.
   */
  async activateCustomerAccount(rawInput: unknown): Promise<{
    customToken: string;
    user: UserDocument;
  }> {
    const parsed = customerAccountActivationSchema.parse(rawInput);

    await this.verifyOtpChallenge({
      phoneE164: parsed.phoneE164,
      purpose: 'CUSTOMER_ACTIVATION',
      otpCode: parsed.otpCode
    });

    const uid = await this.resolveUidByPhoneE164(parsed.phoneE164);

    if (!uid) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'No pending vehicle owner account found for this phone number.'
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const { saltHex, hashHex } = hashSecretWithScrypt(parsed.newPassword);

    const updatedUser = await this.runtime.runTransaction(async (tx) => {
      const userDoc = await tx.getDoc<UserDocument>(
        FIRESTORE_COLLECTIONS.USERS,
        uid
      );
      if (!userDoc) {
        throw new AppError(404, 'NOT_FOUND', 'User document not found.');
      }
      if (userDoc.status === 'SUSPENDED') {
        throw new AppError(403, 'FORBIDDEN', 'Account is suspended.');
      }

      const nextSv = userDoc.sessionVersion + 1;
      const activeUser: UserDocument = {
        ...userDoc,
        status: 'ACTIVE',
        sessionVersion: nextSv,
        updatedAt: nowIso,
        lastLoginAt: nowIso
      };

      const secretsDoc: AuthSecretsDocument = {
        uid,
        passwordSaltHex: saltHex,
        passwordHashHex: hashHex,
        passwordUpdatedAt: nowIso,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        pendingInviteSaltHex: null,
        pendingInviteHashHex: null,
        inviteExpiresAt: null
      };

      await tx.setDoc(FIRESTORE_COLLECTIONS.USERS, uid, activeUser);
      await tx.setDoc(FIRESTORE_COLLECTIONS.AUTH_SECRETS, uid, secretsDoc);
      return activeUser;
    });

    // Activate any pending vehicle ownerships and vehicles for this owner
    const ownerships = await this.runtime.listDocs<VehicleOwnerDocument>(
      FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
      {
        where: [
          { field: 'userId', op: '==', value: uid },
          { field: 'status', op: '==', value: 'PENDING_ACTIVATION' }
        ]
      }
    );

    for (const ownership of ownerships) {
      await this.runtime.setDoc<VehicleOwnerDocument>(
        FIRESTORE_COLLECTIONS.VEHICLE_OWNERS,
        ownership.id,
        {
          ...ownership,
          status: 'ACTIVE',
          activatedAt: nowIso
        }
      );

      const vehicle = await this.runtime.getDoc<VehicleDocument>(
        FIRESTORE_COLLECTIONS.VEHICLES,
        ownership.vehicleId
      );
      if (vehicle && vehicle.registrationStatus === 'PENDING_CUSTOMER_ACTIVATION') {
        await this.runtime.setDoc<VehicleDocument>(
          FIRESTORE_COLLECTIONS.VEHICLES,
          vehicle.id,
          {
            ...vehicle,
            registrationStatus: 'ACTIVE',
            registrationHistory: [
              ...vehicle.registrationHistory,
              {
                action: 'CUSTOMER_ACTIVATED',
                actorUserId: uid,
                actorRole: 'VEHICLE_OWNER',
                timestamp: nowIso,
                summary: 'Customer verified phone OTP and activated vehicle ownership.'
              }
            ],
            updatedAt: nowIso
          }
        );
      }
    }

    const customToken = await this.runtime.auth.createCustomToken(uid, {
      sv: updatedUser.sessionVersion,
      tier: resolveTierForRole(updatedUser.primaryRole)
    });

    await this.audit.appendAuditLog({
      actorUserId: uid,
      actorRole: updatedUser.primaryRole,
      action: 'CUSTOMER_ACCOUNT_ACTIVATED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: uid,
      metadata: { activatedVehiclesCount: ownerships.length }
    });

    return { customToken, user: updatedUser };
  }

  /**
   * Standard Phone + Password sign-in with 5-attempt lockout protection.
   */
  async loginWithPhoneAndPassword(rawInput: unknown): Promise<{
    customToken: string;
    user: UserDocument;
    profile: UserProfileDocument | null;
    activeRoles: UserRoleDocument[];
  }> {
    const parsed = customerPhoneLoginSchema.parse(rawInput);
    const uid = await this.resolveUidByPhoneE164(parsed.phoneE164);

    if (!uid) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid phone number or password.');
    }

    const userDoc = await this.runtime.getDoc<UserDocument>(
      FIRESTORE_COLLECTIONS.USERS,
      uid
    );
    const secretsDoc = await this.runtime.getDoc<AuthSecretsDocument>(
      FIRESTORE_COLLECTIONS.AUTH_SECRETS,
      uid
    );

    if (!userDoc || !secretsDoc || !secretsDoc.passwordHashHex) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Account is not yet activated or credentials are invalid.'
      );
    }

    const now = this.runtime.now();
    const nowMs = now.getTime();

    if (secretsDoc.lockoutUntil && nowMs < Date.parse(secretsDoc.lockoutUntil)) {
      throw new AppError(
        429,
        'ACCOUNT_LOCKED',
        'Account is temporarily locked due to multiple failed sign-in attempts. Please try again later or reset your password.'
      );
    }

    const isPasswordValid = verifySecretWithScrypt({
      candidateSecret: parsed.password,
      saltHex: secretsDoc.passwordSaltHex,
      expectedHashHex: secretsDoc.passwordHashHex
    });

    if (!isPasswordValid) {
      const nextAttempts = secretsDoc.failedLoginAttempts + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockoutUntil = shouldLock
        ? new Date(nowMs + LOGIN_LOCKOUT_MS).toISOString()
        : null;

      await this.runtime.setDoc<AuthSecretsDocument>(
        FIRESTORE_COLLECTIONS.AUTH_SECRETS,
        uid,
        {
          ...secretsDoc,
          failedLoginAttempts: nextAttempts,
          lockoutUntil
        }
      );

      if (shouldLock) {
        await this.audit.appendAuditLog({
          actorUserId: uid,
          actorRole: userDoc.primaryRole,
          action: 'AUTH_ACCOUNT_LOCKED',
          severity: 'CRITICAL',
          targetCollection: FIRESTORE_COLLECTIONS.USERS,
          targetDocumentId: uid,
          metadata: { failedAttempts: nextAttempts }
        });
        throw new AppError(
          429,
          'ACCOUNT_LOCKED',
          'Account locked for 15 minutes after 5 failed password attempts.'
        );
      }

      throw new AppError(401, 'UNAUTHORIZED', 'Invalid phone number or password.');
    }

    if (userDoc.status !== 'ACTIVE') {
      throw new AppError(
        403,
        'FORBIDDEN',
        `Account status is ${userDoc.status}. Sign-in denied.`
      );
    }

    const nowIso = now.toISOString();
    await this.runtime.setDoc<AuthSecretsDocument>(
      FIRESTORE_COLLECTIONS.AUTH_SECRETS,
      uid,
      {
        ...secretsDoc,
        failedLoginAttempts: 0,
        lockoutUntil: null
      }
    );

    const updatedUser: UserDocument = {
      ...userDoc,
      lastLoginAt: nowIso,
      updatedAt: nowIso
    };
    await this.runtime.setDoc(FIRESTORE_COLLECTIONS.USERS, uid, updatedUser);

    const activeRoles = await this.runtime.listDocs<UserRoleDocument>(
      FIRESTORE_COLLECTIONS.USER_ROLES,
      {
        where: [
          { field: 'userId', op: '==', value: uid },
          { field: 'status', op: '==', value: 'ACTIVE' }
        ]
      }
    );

    const profile = await this.runtime.getDoc<UserProfileDocument>(
      FIRESTORE_COLLECTIONS.USER_PROFILES,
      uid
    );

    const customToken = await this.runtime.auth.createCustomToken(uid, {
      sv: updatedUser.sessionVersion,
      tier: resolveTierForRole(updatedUser.primaryRole)
    });

    await this.audit.appendAuditLog({
      actorUserId: uid,
      actorRole: updatedUser.primaryRole,
      action: 'USER_LOGIN_SUCCESS',
      severity: 'INFO',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: uid,
      metadata: { activeRolesCount: activeRoles.length }
    });

    return {
      customToken,
      user: updatedUser,
      profile,
      activeRoles
    };
  }

  /**
   * Resets a user's password after OTP verification, increments sessionVersion,
   * and revokes all existing refresh tokens so prior sessions are invalidated immediately.
   */
  async resetPasswordWithOtp(rawInput: {
    phoneE164: string;
    otpCode: string;
    newPassword: string;
  }): Promise<{ success: true }> {
    const cleanPhone = phoneE164Schema.parse(rawInput.phoneE164);
    const cleanPassword = strongPasswordSchema.parse(rawInput.newPassword);

    await this.verifyOtpChallenge({
      phoneE164: cleanPhone,
      purpose: 'PASSWORD_RESET',
      otpCode: rawInput.otpCode
    });

    const uid = await this.resolveUidByPhoneE164(cleanPhone);
    if (!uid) {
      throw new AppError(404, 'NOT_FOUND', 'Account not found.');
    }

    const nowIso = this.runtime.now().toISOString();
    const { saltHex, hashHex } = hashSecretWithScrypt(cleanPassword);

    const updatedUser = await this.runtime.runTransaction(async (tx) => {
      const userDoc = await tx.getDoc<UserDocument>(
        FIRESTORE_COLLECTIONS.USERS,
        uid
      );
      if (!userDoc) {
        throw new AppError(404, 'NOT_FOUND', 'User document not found.');
      }

      const nextUser: UserDocument = {
        ...userDoc,
        sessionVersion: userDoc.sessionVersion + 1,
        updatedAt: nowIso
      };

      const nextSecrets: AuthSecretsDocument = {
        uid,
        passwordSaltHex: saltHex,
        passwordHashHex: hashHex,
        passwordUpdatedAt: nowIso,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        pendingInviteSaltHex: null,
        pendingInviteHashHex: null,
        inviteExpiresAt: null
      };

      await tx.setDoc(FIRESTORE_COLLECTIONS.USERS, uid, nextUser);
      await tx.setDoc(FIRESTORE_COLLECTIONS.AUTH_SECRETS, uid, nextSecrets);
      return nextUser;
    });

    await this.runtime.auth.revokeRefreshTokens(uid);

    await this.audit.appendAuditLog({
      actorUserId: uid,
      actorRole: updatedUser.primaryRole,
      action: 'PASSWORD_RESET_COMPLETED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: uid,
      metadata: { newSessionVersion: updatedUser.sessionVersion }
    });

    return { success: true };
  }

  /**
   * Verifies a Bearer token AND checks live Firestore account status and sessionVersion.
   */
  async authenticateBearerToken(
    authorizationHeader?: string
  ): Promise<AuthenticatedContext> {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Missing or malformed Authorization Bearer header.'
      );
    }

    const rawToken = authorizationHeader.slice('Bearer '.length).trim();
    const decoded = await this.runtime.auth.verifyBearerToken(rawToken);

    const userDoc = await this.runtime.getDoc<UserDocument>(
      FIRESTORE_COLLECTIONS.USERS,
      decoded.uid
    );

    const liveCheck = verifyLiveSessionActive({
      user: userDoc,
      tokenSessionVersion: decoded.claims.sv
    });

    if (!liveCheck.allowed || !userDoc) {
      throw new AppError(403, 'FORBIDDEN', liveCheck.reason);
    }

    const activeRoles = await this.runtime.listDocs<UserRoleDocument>(
      FIRESTORE_COLLECTIONS.USER_ROLES,
      {
        where: [
          { field: 'userId', op: '==', value: userDoc.uid },
          { field: 'status', op: '==', value: 'ACTIVE' }
        ]
      }
    );

    return {
      user: userDoc,
      activeRoles
    };
  }

  /**
   * Returns the authenticated user's live identity, profile, and active roles.
   */
  async getSessionIdentity(authorizationHeader?: string): Promise<{
    user: UserDocument;
    profile: UserProfileDocument | null;
    activeRoles: UserRoleDocument[];
  }> {
    const ctx = await this.authenticateBearerToken(authorizationHeader);
    const profile = await this.runtime.getDoc<UserProfileDocument>(
      FIRESTORE_COLLECTIONS.USER_PROFILES,
      ctx.user.uid
    );
    return {
      user: ctx.user,
      profile,
      activeRoles: ctx.activeRoles
    };
  }

  /**
   * Invalidates the caller's current session by incrementing sessionVersion and revoking refresh tokens.
   */
  async logoutSession(authorizationHeader?: string): Promise<{ loggedOut: true }> {
    const ctx = await this.authenticateBearerToken(authorizationHeader);
    const nowIso = this.runtime.now().toISOString();
    const updatedUser: UserDocument = {
      ...ctx.user,
      sessionVersion: ctx.user.sessionVersion + 1,
      updatedAt: nowIso
    };
    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.USERS,
      ctx.user.uid,
      updatedUser
    );
    await this.runtime.auth.revokeRefreshTokens(ctx.user.uid);
    await this.audit.appendAuditLog({
      actorUserId: ctx.user.uid,
      actorRole: ctx.user.primaryRole,
      action: 'USER_LOGOUT',
      severity: 'INFO',
      targetCollection: FIRESTORE_COLLECTIONS.USERS,
      targetDocumentId: ctx.user.uid,
      metadata: { newSessionVersion: updatedUser.sessionVersion }
    });
    return { loggedOut: true };
  }
}


