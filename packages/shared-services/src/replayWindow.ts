import {
  constantTimeHexEqual,
  hexToBytes,
  hmacSha256Hex,
  sha256Hex
} from './auditHash.js';

export interface ReplayWindowEvaluation {
  accepted: boolean;
  reason: string;
  nextLastSequenceNumber: number;
  nextReplayWindowBitmapHex: string;
}

const WINDOW_SIZE = 64n;
const MASK_64 = (1n << WINDOW_SIZE) - 1n;

/**
 * Evaluates a sequence number against a 64-slot sliding replay window + monotonic watermark.
 * - Supports strict monotonic advancement as well as safely bounded out-of-order offline retries
 *   within the 64-sequence sliding window without allowing replay of any already-seen sequence.
 */
export function evaluateSequenceReplayWindow(params: {
  incomingSequence: number;
  lastSequenceNumber: number;
  replayWindowBitmapHex: string;
  allowSlidingWindowForOfflineRetry: boolean;
}): ReplayWindowEvaluation {
  const {
    incomingSequence,
    lastSequenceNumber,
    replayWindowBitmapHex,
    allowSlidingWindowForOfflineRetry
  } = params;

  if (!Number.isInteger(incomingSequence) || incomingSequence <= 0) {
    return {
      accepted: false,
      reason: 'Sequence number must be a positive integer.',
      nextLastSequenceNumber: lastSequenceNumber,
      nextReplayWindowBitmapHex: replayWindowBitmapHex
    };
  }

  let bitmap = BigInt(`0x${replayWindowBitmapHex || '0000000000000000'}`) & MASK_64;
  const highest = BigInt(lastSequenceNumber);
  const seq = BigInt(incomingSequence);

  // Case 1: New highest sequence number
  if (seq > highest) {
    const shift = seq - highest;
    if (shift >= WINDOW_SIZE) {
      bitmap = 1n; // Bit 0 represents the new highest sequence
    } else {
      bitmap = ((bitmap << shift) | 1n) & MASK_64;
    }
    return {
      accepted: true,
      reason: 'Accepted new highest sequence number.',
      nextLastSequenceNumber: incomingSequence,
      nextReplayWindowBitmapHex: bitmap.toString(16).padStart(16, '0')
    };
  }

  // Case 2: Equal to or lower than highest
  if (!allowSlidingWindowForOfflineRetry) {
    return {
      accepted: false,
      reason: `Real-time request sequence (${incomingSequence}) must be strictly greater than lastSequenceNumber (${lastSequenceNumber}).`,
      nextLastSequenceNumber: lastSequenceNumber,
      nextReplayWindowBitmapHex: replayWindowBitmapHex
    };
  }

  const diff = highest - seq;
  if (diff >= WINDOW_SIZE) {
    return {
      accepted: false,
      reason: `Sequence (${incomingSequence}) is older than the 64-slot replay window from ${lastSequenceNumber}.`,
      nextLastSequenceNumber: lastSequenceNumber,
      nextReplayWindowBitmapHex: replayWindowBitmapHex
    };
  }

  const bitMask = 1n << diff;
  if ((bitmap & bitMask) !== 0n) {
    return {
      accepted: false,
      reason: `Duplicate/replayed sequence number (${incomingSequence}) detected in sliding window.`,
      nextLastSequenceNumber: lastSequenceNumber,
      nextReplayWindowBitmapHex: replayWindowBitmapHex
    };
  }

  bitmap = (bitmap | bitMask) & MASK_64;
  return {
    accepted: true,
    reason: 'Accepted unseen sequence within 64-slot offline retry window.',
    nextLastSequenceNumber: lastSequenceNumber,
    nextReplayWindowBitmapHex: bitmap.toString(16).padStart(16, '0')
  };
}

/**
 * Computes and verifies STM32U575 HMAC-SHA256 request signatures using the actual
 * 256-bit device secret key retrieved from Secret Manager / AES-256-GCM key vault.
 */
export function computeStm32HmacSignature(params: {
  deviceSecretKeyHex: string;
  serialNumber: string;
  httpMethod: string;
  requestPath: string;
  deviceTimestampMs: number;
  transmissionTimestampMs: number;
  sequenceNumber: number;
  rawBody: string;
}): string {
  const bodySha256 = sha256Hex(params.rawBody);
  const canonical = [
    params.serialNumber.trim().toUpperCase(),
    params.httpMethod.trim().toUpperCase(),
    params.requestPath.trim(),
    String(params.deviceTimestampMs),
    String(params.transmissionTimestampMs),
    String(params.sequenceNumber),
    bodySha256
  ].join('\n');

  const keyBytes = hexToBytes(params.deviceSecretKeyHex);
  return hmacSha256Hex(keyBytes, canonical);
}

export function verifyStm32HmacSignature(params: {
  deviceSecretKeyHex: string;
  serialNumber: string;
  httpMethod: string;
  requestPath: string;
  deviceTimestampMs: number;
  transmissionTimestampMs: number;
  sequenceNumber: number;
  rawBody: string;
  providedSignatureHex: string;
  nowMs?: number;
  maxTransmissionClockSkewMs?: number;
}): { valid: boolean; reason: string } {
  const nowMs = params.nowMs ?? Date.now();
  const maxSkew = params.maxTransmissionClockSkewMs ?? 300_000; // 5 minutes

  if (Math.abs(nowMs - params.transmissionTimestampMs) > maxSkew) {
    return {
      valid: false,
      reason: 'Transmission timestamp exceeds maximum allowed clock skew (±300s).'
    };
  }

  if (!/^[a-fA-F0-9]{64}$/.test(params.providedSignatureHex)) {
    return { valid: false, reason: 'Malformed signature hex format.' };
  }

  const expectedHex = computeStm32HmacSignature(params);
  if (!constantTimeHexEqual(expectedHex, params.providedSignatureHex)) {
    return { valid: false, reason: 'HMAC-SHA256 signature verification failed.' };
  }

  return { valid: true, reason: 'Valid STM32U575 HMAC-SHA256 signature.' };
}
