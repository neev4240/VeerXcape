import { createHash } from 'node:crypto';
import { GENESIS_AUDIT_HASH } from '@veerxcape/shared-constants';
import type { AuditLogDocument } from '@veerxcape/shared-types';

export interface AuditHashInput {
  sequenceIndex: number;
  prevAuditHash: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetDocumentId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Deterministic canonical JSON serializer so SHA-256 audit hash chaining is
 * reproducible regardless of object key insertion order.
 */
export function canonicalizeMetadata(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeMetadata).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  return (
    '{' +
    sortedKeys
      .map((k) => `${JSON.stringify(k)}:${canonicalizeMetadata(record[k])}`)
      .join(',') +
    '}'
  );
}

/**
 * Computes the tamper-evident SHA-256 hash chain entry for an append-only audit log record.
 */
export function computeAuditEntryHash(input: AuditHashInput): string {
  const canonicalPayload = [
    input.prevAuditHash,
    String(input.sequenceIndex),
    input.actorUserId,
    input.actorRole,
    input.action,
    input.targetCollection,
    input.targetDocumentId,
    input.createdAt,
    canonicalizeMetadata(input.metadata)
  ].join('|');

  return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}

/**
 * Verifies an ordered sequence of audit log records from genesis (or a known anchor)
 * to detect any modification, deletion, or out-of-order tampering.
 */
export function verifyAuditChainIntegrity(
  entries: readonly AuditLogDocument[],
  expectedStartPrevHash: string = GENESIS_AUDIT_HASH
): { valid: boolean; brokenAtSequenceIndex: number | null; reason: string | null } {
  let expectedPrev = expectedStartPrevHash;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.prevAuditHash !== expectedPrev) {
      return {
        valid: false,
        brokenAtSequenceIndex: entry.sequenceIndex,
        reason: `Broken prevAuditHash link at sequence ${entry.sequenceIndex}.`
      };
    }

    const recomputed = computeAuditEntryHash({
      sequenceIndex: entry.sequenceIndex,
      prevAuditHash: entry.prevAuditHash,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      action: entry.action,
      targetCollection: entry.targetCollection,
      targetDocumentId: entry.targetDocumentId,
      createdAt: entry.createdAt,
      metadata: entry.metadata
    });

    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        brokenAtSequenceIndex: entry.sequenceIndex,
        reason: `Entry hash mismatch at sequence ${entry.sequenceIndex} (record tampered).`
      };
    }

    expectedPrev = entry.entryHash;
  }

  return { valid: true, brokenAtSequenceIndex: null, reason: null };
}

