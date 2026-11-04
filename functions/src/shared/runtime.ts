import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  type FirestoreCollectionName
} from '@veerxcape/shared-constants';
import type {
  UniqueLockDocument,
  VeerXcapeCustomClaims
} from '@veerxcape/shared-types';
import { AppError } from './errors.js';

export interface TransactionContext {
  getDoc<T>(collection: FirestoreCollectionName, docId: string): Promise<T | null>;
  setDoc<T extends object>(
    collection: FirestoreCollectionName,
    docId: string,
    data: T
  ): Promise<void>;
  deleteDoc(collection: FirestoreCollectionName, docId: string): Promise<void>;
}

export interface AuthProviderAdapter {
  ensureUserByPhone(params: {
    uid?: string;
    phoneE164: string;
    email?: string | null;
    displayName?: string;
  }): Promise<{ uid: string }>;
  setCustomClaims(uid: string, claims: VeerXcapeCustomClaims): Promise<void>;
  createCustomToken(
    uid: string,
    claims: VeerXcapeCustomClaims
  ): Promise<string>;
  revokeRefreshTokens(uid: string): Promise<void>;
  verifyBearerToken(
    token: string
  ): Promise<{ uid: string; claims: VeerXcapeCustomClaims }>;
}

export interface FcmSendResult {
  accepted: boolean;
  fcmMessageId?: string;
  permanentFailure?: boolean;
  errorCode?: string;
}

export interface FcmAdapter {
  sendToUser(params: {
    recipientUserId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<FcmSendResult>;
}

export interface SecretManagerAdapter {
  storeDeviceKeyVersion(params: {
    deviceId: string;
    version: number;
    secretKeyHex: string;
  }): Promise<void>;
  getDeviceKeyVersion(params: {
    deviceId: string;
    version: number;
  }): Promise<string | null>;
}

export interface VeerXcapeRuntimeConfig {
  environment: 'development' | 'staging' | 'production';
  allowDemoOtp: boolean;
  allowSimulatedIot: boolean;
  deviceMasterKekHex: string;
  authServerPepper: string;
  secretManagerEnabled: boolean;
}

export interface VeerXcapeBackendRuntime {
  readonly config: VeerXcapeRuntimeConfig;
  readonly auth: AuthProviderAdapter;
  readonly fcm: FcmAdapter;
  readonly secretManager?: SecretManagerAdapter;
  now(): Date;
  getDoc<T>(collection: FirestoreCollectionName, docId: string): Promise<T | null>;
  setDoc<T extends object>(
    collection: FirestoreCollectionName,
    docId: string,
    data: T
  ): Promise<void>;
  listDocs<T>(
    collection: FirestoreCollectionName,
    predicate?: (doc: T) => boolean
  ): Promise<T[]>;
  runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}

/**
 * Helper to atomically reserve a deterministic uniqueness lock document inside a Firestore transaction.
 * Throws 409 CONFLICT if the lock is already owned by another entity.
 */
export async function claimUniqueLockInTx(params: {
  tx: TransactionContext;
  lockKey: string;
  entityCollection: FirestoreCollectionName;
  entityId: string;
  nowIso: string;
  conflictMessage: string;
}): Promise<void> {
  const existing = await params.tx.getDoc<UniqueLockDocument>(
    FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
    params.lockKey
  );
  if (existing && existing.entityId !== params.entityId) {
    throw new AppError(409, 'CONFLICT', params.conflictMessage, {
      lockKey: params.lockKey
    });
  }
  await params.tx.setDoc<UniqueLockDocument>(
    FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
    params.lockKey,
    {
      lockKey: params.lockKey,
      entityCollection: params.entityCollection,
      entityId: params.entityId,
      createdAt: params.nowIso
    }
  );
}

/**
 * Creates a deterministic, transaction-safe in-memory runtime used for fast Stage 2 & Stage 3
 * integration/security verification and local standalone development.
 */
export function createInMemoryTestRuntime(
  overrides: Partial<VeerXcapeRuntimeConfig> = {}
): VeerXcapeBackendRuntime & {
  advanceTimeMs(ms: number): void;
  setFcmBehavior(behavior: 'ACCEPT' | 'RETRYABLE_FAIL' | 'PERMANENT_FAIL'): void;
} {
  const config: VeerXcapeRuntimeConfig = {
    environment: overrides.environment ?? 'development',
    allowDemoOtp:
      overrides.environment === 'production'
        ? false
        : (overrides.allowDemoOtp ?? true),
    allowSimulatedIot:
      overrides.environment === 'production'
        ? false
        : (overrides.allowSimulatedIot ?? true),
    deviceMasterKekHex:
      overrides.deviceMasterKekHex ??
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    authServerPepper: overrides.authServerPepper ?? 'test-pepper-veerxcape-2026',
    secretManagerEnabled: overrides.secretManagerEnabled ?? false
  };

  let currentClockMs = Date.parse('2026-11-04T14:00:00.000Z');
  let fcmBehavior: 'ACCEPT' | 'RETRYABLE_FAIL' | 'PERMANENT_FAIL' = 'ACCEPT';

  const collections = new Map<string, Map<string, string>>();
  const authUsersByPhone = new Map<string, string>();
  const authClaimsByUid = new Map<string, VeerXcapeCustomClaims>();
  const revokedAfterVersion = new Map<string, number>();
  const secretManagerVault = new Map<string, string>();

  const ensureCollectionMap = (col: string): Map<string, string> => {
    let m = collections.get(col);
    if (!m) {
      m = new Map<string, string>();
      collections.set(col, m);
    }
    return m;
  };

  const cloneParse = <T>(raw: string | undefined): T | null =>
    raw ? (JSON.parse(raw) as T) : null;

  return {
    config,
    now: () => new Date(currentClockMs),
    advanceTimeMs: (ms: number) => {
      currentClockMs += ms;
    },
    setFcmBehavior: (b) => {
      fcmBehavior = b;
    },
    auth: {
      async ensureUserByPhone({ uid, phoneE164 }) {
        const existingUid = authUsersByPhone.get(phoneE164);
        if (existingUid) return { uid: existingUid };
        const assignedUid = uid ?? `usr_${randomUUID().slice(0, 12)}`;
        authUsersByPhone.set(phoneE164, assignedUid);
        return { uid: assignedUid };
      },
      async setCustomClaims(uid, claims) {
        authClaimsByUid.set(uid, { ...claims });
      },
      async createCustomToken(uid, claims) {
        authClaimsByUid.set(uid, { ...claims });
        const payload = Buffer.from(
          JSON.stringify({ uid, claims, issuedAt: currentClockMs }),
          'utf8'
        ).toString('base64url');
        return `vx_token.${payload}`;
      },
      async revokeRefreshTokens(uid) {
        const current = authClaimsByUid.get(uid);
        if (current) {
          revokedAfterVersion.set(uid, current.sv);
        }
      },
      async verifyBearerToken(token) {
        if (!token.startsWith('vx_token.')) {
          throw new AppError(401, 'UNAUTHORIZED', 'Invalid Bearer token format.');
        }
        try {
          const decoded = JSON.parse(
            Buffer.from(token.slice('vx_token.'.length), 'base64url').toString('utf8')
          ) as { uid: string; claims: VeerXcapeCustomClaims };
          const revokedSv = revokedAfterVersion.get(decoded.uid);
          if (typeof revokedSv === 'number' && decoded.claims.sv <= revokedSv) {
            throw new AppError(
              401,
              'UNAUTHORIZED',
              'Firebase refresh/session token has been revoked.'
            );
          }
          return decoded;
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(401, 'UNAUTHORIZED', 'Failed to decode Bearer token.');
        }
      }
    },
    fcm: {
      async sendToUser({ recipientUserId }) {
        if (fcmBehavior === 'ACCEPT') {
          return {
            accepted: true,
            fcmMessageId: `projects/veerxcape-01/messages/msg_${recipientUserId}_${currentClockMs}`
          };
        }
        if (fcmBehavior === 'RETRYABLE_FAIL') {
          return {
            accepted: false,
            permanentFailure: false,
            errorCode: 'messaging/internal-error'
          };
        }
        return {
          accepted: false,
          permanentFailure: true,
          errorCode: 'messaging/registration-token-not-registered'
        };
      }
    },
    secretManager: {
      async storeDeviceKeyVersion({ deviceId, version, secretKeyHex }) {
        secretManagerVault.set(`${deviceId}_v${version}`, secretKeyHex);
      },
      async getDeviceKeyVersion({ deviceId, version }) {
        return secretManagerVault.get(`${deviceId}_v${version}`) ?? null;
      }
    },
    async getDoc<T>(collection: FirestoreCollectionName, docId: string): Promise<T | null> {
      return cloneParse<T>(ensureCollectionMap(collection).get(docId));
    },
    async setDoc<T extends object>(
      collection: FirestoreCollectionName,
      docId: string,
      data: T
    ): Promise<void> {
      ensureCollectionMap(collection).set(docId, JSON.stringify(data));
    },
    async listDocs<T>(
      collection: FirestoreCollectionName,
      predicate?: (doc: T) => boolean
    ): Promise<T[]> {
      const col = ensureCollectionMap(collection);
      const results: T[] = [];
      for (const raw of col.values()) {
        const parsed = JSON.parse(raw) as T;
        if (!predicate || predicate(parsed)) {
          results.push(parsed);
        }
      }
      return results;
    },
    async runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
      // Snapshot all collections before executing the transaction; restore on error for atomic rollback
      const snapshot = new Map<string, Map<string, string>>();
      for (const [colName, colMap] of collections.entries()) {
        snapshot.set(colName, new Map(colMap));
      }

      const tx: TransactionContext = {
        async getDoc<T>(collection: FirestoreCollectionName, docId: string) {
          return cloneParse<T>(ensureCollectionMap(collection).get(docId));
        },
        async setDoc<T extends object>(
          collection: FirestoreCollectionName,
          docId: string,
          data: T
        ) {
          ensureCollectionMap(collection).set(docId, JSON.stringify(data));
        },
        async deleteDoc(collection: FirestoreCollectionName, docId: string) {
          ensureCollectionMap(collection).delete(docId);
        }
      };

      try {
        return await fn(tx);
      } catch (err) {
        collections.clear();
        for (const [colName, colMap] of snapshot.entries()) {
          collections.set(colName, colMap);
        }
        throw err;
      }
    }
  };
}

