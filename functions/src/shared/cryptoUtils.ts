import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'node:crypto';
import { AppError } from './errors.js';

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/**
 * Generates a cryptographically random 32-byte salt and derives a 64-byte scrypt hash.
 * Plaintext passwords or OTP codes are never stored or logged.
 */
export function hashSecretWithScrypt(
  secret: string,
  existingSaltHex?: string
): { saltHex: string; hashHex: string } {
  const saltHex = existingSaltHex ?? randomBytes(32).toString('hex');
  const saltBuf = Buffer.from(saltHex, 'hex');
  const derived = scryptSync(secret, saltBuf, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return {
    saltHex,
    hashHex: derived.toString('hex')
  };
}

/**
 * Constant-time verification of a password or OTP code against a stored scrypt hash.
 */
export function verifySecretWithScrypt(params: {
  candidateSecret: string;
  saltHex: string;
  expectedHashHex: string;
}): boolean {
  if (!params.saltHex || !params.expectedHashHex) return false;
  const { hashHex } = hashSecretWithScrypt(params.candidateSecret, params.saltHex);
  const candidateBuf = Buffer.from(hashHex, 'hex');
  const expectedBuf = Buffer.from(params.expectedHashHex, 'hex');
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}

/**
 * Generates a 6-digit numeric OTP code using cryptographically secure random bytes.
 */
export function generateSixDigitOtp(): string {
  const num = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(num).padStart(6, '0');
}

/**
 * Generates a 256-bit (32-byte, 64 hex chars) secret key for STM32U575 HMAC-SHA256 signing.
 */
export function generateDeviceHmacSecretHex(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Encrypts a 256-bit device HMAC secret using AES-256-GCM under the server Master Key Encryption Key (KEK).
 * Used when storing wrapped keys in the server-only `_deviceKeyVault` collection.
 */
export function encryptDeviceSecretAesGcm(params: {
  plaintextKeyHex: string;
  masterKekHex: string;
}): { encryptedHmacKeyHex: string; ivHex: string; authTagHex: string } {
  const kekBuf = Buffer.from(params.masterKekHex, 'hex');
  if (kekBuf.length !== 32) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      'DEVICE_MASTER_KEK_HEX must be an exact 32-byte (64 hex character) key.'
    );
  }
  const ivBuf = randomBytes(12); // 96-bit IV for AES-256-GCM
  const cipher = createCipheriv('aes-256-gcm', kekBuf, ivBuf);
  const plaintextBuf = Buffer.from(params.plaintextKeyHex, 'hex');
  const encryptedBuf = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const authTagBuf = cipher.getAuthTag();

  return {
    encryptedHmacKeyHex: encryptedBuf.toString('hex'),
    ivHex: ivBuf.toString('hex'),
    authTagHex: authTagBuf.toString('hex')
  };
}

/**
 * Decrypts a wrapped 256-bit device HMAC secret using AES-256-GCM under the server Master KEK.
 */
export function decryptDeviceSecretAesGcm(params: {
  encryptedHmacKeyHex: string;
  ivHex: string;
  authTagHex: string;
  masterKekHex: string;
}): string {
  const kekBuf = Buffer.from(params.masterKekHex, 'hex');
  if (kekBuf.length !== 32) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      'DEVICE_MASTER_KEK_HEX must be an exact 32-byte (64 hex character) key.'
    );
  }
  const ivBuf = Buffer.from(params.ivHex, 'hex');
  const authTagBuf = Buffer.from(params.authTagHex, 'hex');
  const encryptedBuf = Buffer.from(params.encryptedHmacKeyHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', kekBuf, ivBuf);
  decipher.setAuthTag(authTagBuf);
  const decryptedBuf = Buffer.concat([
    decipher.update(encryptedBuf),
    decipher.final()
  ]);
  return decryptedBuf.toString('hex');
}

/**
 * Anonymizes an IP address with the server pepper for privacy-preserving audit logs.
 */
export function hashActorIp(ip: string, serverPepper: string): string {
  return createHash('sha256')
    .update(`${ip}|${serverPepper}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

