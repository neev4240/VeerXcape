import admin from 'firebase-admin';
import type { FirestoreCollectionName } from '@veerxcape/shared-constants';
import type { VeerXcapeCustomClaims } from '@veerxcape/shared-types';
import { AppError } from './errors.js';
import type {
  TransactionContext,
  VeerXcapeBackendRuntime,
  VeerXcapeRuntimeConfig
} from './runtime.js';

/**
 * Production / Emulator Firebase Admin SDK implementation of VeerXcapeBackendRuntime.
 */
export function createFirebaseAdminRuntime(
  configOverrides: Partial<VeerXcapeRuntimeConfig> = {}
): VeerXcapeBackendRuntime {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const messaging = admin.messaging();

  const envMode = (process.env.VEERXCAPE_ENV ||
    configOverrides.environment ||
    'development') as 'development' | 'staging' | 'production';

  const config: VeerXcapeRuntimeConfig = {
    environment: envMode,
    allowDemoOtp:
      envMode === 'production'
        ? false
        : process.env.ALLOW_DEMO_OTP === 'true' ||
          Boolean(configOverrides.allowDemoOtp),
    allowSimulatedIot:
      envMode === 'production'
        ? false
        : process.env.ALLOW_SIMULATED_IOT === 'true' ||
          Boolean(configOverrides.allowSimulatedIot),
    deviceMasterKekHex:
      configOverrides.deviceMasterKekHex ||
      process.env.DEVICE_MASTER_KEK_HEX ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    authServerPepper:
      configOverrides.authServerPepper ||
      process.env.AUTH_SERVER_PEPPER ||
      'veerxcape-default-dev-pepper',
    secretManagerEnabled:
      configOverrides.secretManagerEnabled ??
      process.env.SECRET_MANAGER_ENABLED === 'true'
  };

  return {
    config,
    now: () => new Date(),
    auth: {
      async ensureUserByPhone({ uid, phoneE164, email, displayName }) {
        try {
          const existing = await auth.getUserByPhoneNumber(phoneE164);
          return { uid: existing.uid };
        } catch {
          const created = await auth.createUser({
            ...(uid ? { uid } : {}),
            phoneNumber: phoneE164,
            ...(email ? { email } : {}),
            ...(displayName ? { displayName } : {})
          });
          return { uid: created.uid };
        }
      },
      async setCustomClaims(uid, claims) {
        await auth.setCustomUserClaims(uid, claims);
      },
      async createCustomToken(uid, claims) {
        await auth.setCustomUserClaims(uid, claims);
        return auth.createCustomToken(uid, claims);
      },
      async revokeRefreshTokens(uid) {
        await auth.revokeRefreshTokens(uid);
      },
      async verifyBearerToken(token) {
        try {
          const decoded = await auth.verifyIdToken(token, true);
          return {
            uid: decoded.uid,
            claims: {
              sv: typeof decoded.sv === 'number' ? decoded.sv : 1,
              tier: (decoded.tier as VeerXcapeCustomClaims['tier']) || 'CUSTOMER'
            }
          };
        } catch {
          throw new AppError(
            401,
            'UNAUTHORIZED',
            'Invalid, expired, or revoked Firebase ID token.'
          );
        }
      }
    },
    fcm: {
      async sendToUser({ recipientUserId, title, body, data }) {
        try {
          const msgId = await messaging.send({
            topic: `user_${recipientUserId}`,
            notification: { title, body },
            data: data ?? {}
          });
          return {
            accepted: true,
            fcmMessageId: msgId
          };
        } catch (err: unknown) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code: unknown }).code)
              : 'messaging/unknown';
          const permanent =
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-argument');
          return {
            accepted: false,
            permanentFailure: permanent,
            errorCode: code
          };
        }
      }
    },
    async getDoc<T>(collection: FirestoreCollectionName, docId: string): Promise<T | null> {
      const snap = await db.collection(collection).doc(docId).get();
      return snap.exists ? (snap.data() as T) : null;
    },
    async setDoc<T extends object>(
      collection: FirestoreCollectionName,
      docId: string,
      data: T
    ): Promise<void> {
      await db.collection(collection).doc(docId).set(data);
    },
    async listDocs<T>(
      collection: FirestoreCollectionName,
      predicate?: (doc: T) => boolean
    ): Promise<T[]> {
      const snap = await db.collection(collection).get();
      const docs = snap.docs.map((d) => d.data() as T);
      return predicate ? docs.filter(predicate) : docs;
    },
    async runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
      return db.runTransaction(async (firestoreTx) => {
        const tx: TransactionContext = {
          async getDoc<T>(collection: FirestoreCollectionName, docId: string) {
            const snap = await firestoreTx.get(db.collection(collection).doc(docId));
            return snap.exists ? (snap.data() as T) : null;
          },
          async setDoc<T extends object>(
            collection: FirestoreCollectionName,
            docId: string,
            data: T
          ) {
            firestoreTx.set(db.collection(collection).doc(docId), data);
          },
          async deleteDoc(collection: FirestoreCollectionName, docId: string) {
            firestoreTx.delete(db.collection(collection).doc(docId));
          }
        };
        return fn(tx);
      });
    }
  };
}

