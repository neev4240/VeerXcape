import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  GENESIS_AUDIT_HASH,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import {
  computeAuditEntryHash,
  verifyAuditChainIntegrity
} from '@veerxcape/shared-services';
import type { AuditLogDocument } from '@veerxcape/shared-types';
import { hashActorIp } from '../shared/cryptoUtils.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

const SEVEN_YEARS_MS = 7 * 365 * 24 * 60 * 60 * 1000;

export interface AppendAuditLogParams {
  actorUserId: string;
  actorRole: UserRoleCode | 'SYSTEM' | 'HARDWARE_DEVICE';
  actorTenantId?: string | null;
  actorIp?: string;
  action: string;
  severity?: 'INFO' | 'SENSITIVE' | 'CRITICAL';
  targetCollection: string;
  targetDocumentId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only, tamper-evident Audit Service.
 * - Intentionally exposes ONLY `appendAuditLog` and `verifyAuditChain` (no update or delete).
 * - Chains each entry cryptographically (`prevAuditHash` -> `entryHash`) using SHA-256.
 * - Automatically strips any accidental secret/password keys from `metadata`.
 */
export class AuditService {
  constructor(private readonly runtime: VeerXcapeBackendRuntime) {}

  private sanitizeMetadata(
    raw: Record<string, unknown> = {}
  ): Record<string, unknown> {
    const forbiddenPattern = /password|secret|otp|token|signature|kek/i;
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (forbiddenPattern.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }

  async appendAuditLog(params: AppendAuditLogParams): Promise<AuditLogDocument> {
    const latestLogs = await this.runtime.listDocs<AuditLogDocument>(
      FIRESTORE_COLLECTIONS.AUDIT_LOGS,
      {
        orderBy: [{ field: 'sequenceIndex', direction: 'desc' }],
        limit: 1
      }
    );

    const lastEntry = latestLogs.length > 0 ? latestLogs[0] : null;
    const sequenceIndex = lastEntry ? lastEntry.sequenceIndex + 1 : 1;
    const prevAuditHash = lastEntry ? lastEntry.entryHash : GENESIS_AUDIT_HASH;

    const now = this.runtime.now();
    const createdAt = now.toISOString();
    const retainUntil = new Date(now.getTime() + SEVEN_YEARS_MS).toISOString();
    const sanitizedMetadata = this.sanitizeMetadata(params.metadata);

    const entryHash = computeAuditEntryHash({
      sequenceIndex,
      prevAuditHash,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: params.action,
      targetCollection: params.targetCollection,
      targetDocumentId: params.targetDocumentId,
      createdAt,
      metadata: sanitizedMetadata
    });

    const id = `aud_${String(sequenceIndex).padStart(8, '0')}_${randomUUID().slice(0, 8)}`;
    const doc: AuditLogDocument = {
      id,
      sequenceIndex,
      prevAuditHash,
      entryHash,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      actorTenantId: params.actorTenantId ?? null,
      actorIpHash: hashActorIp(
        params.actorIp || '0.0.0.0',
        this.runtime.config.authServerPepper
      ),
      action: params.action,
      severity: params.severity ?? 'INFO',
      targetCollection: params.targetCollection,
      targetDocumentId: params.targetDocumentId,
      reason: params.reason,
      metadata: sanitizedMetadata,
      retainUntil,
      createdAt
    };

    await this.runtime.setDoc(FIRESTORE_COLLECTIONS.AUDIT_LOGS, id, doc);
    return doc;
  }

  async verifyChain(): Promise<{
    valid: boolean;
    totalEntries: number;
    brokenAtSequenceIndex: number | null;
    reason: string | null;
  }> {
    const entries = await this.runtime.listDocs<AuditLogDocument>(
      FIRESTORE_COLLECTIONS.AUDIT_LOGS,
      {
        orderBy: [{ field: 'sequenceIndex', direction: 'asc' }]
      }
    );
    const result = verifyAuditChainIntegrity(entries, GENESIS_AUDIT_HASH);
    return {
      valid: result.valid,
      totalEntries: entries.length,
      brokenAtSequenceIndex: result.brokenAtSequenceIndex,
      reason: result.reason
    };
  }
}

