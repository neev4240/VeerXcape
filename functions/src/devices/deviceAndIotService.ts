import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  UNIQUE_LOCK_KEYS
} from '@veerxcape/shared-constants';
import {
  computeLocationFreshness,
  evaluateDeviceSubmissionPermission,
  evaluateSequenceReplayWindow,
  verifyStm32HmacSignature
} from '@veerxcape/shared-services';
import type {
  DeviceDocument,
  DeviceHeartbeatDocument,
  DeviceKeyVaultDocument,
  SystemConfigurationDocument,
  TelemetryDocument,
  UniqueLockDocument,
  UserDocument,
  VehicleDocument
} from '@veerxcape/shared-types';
import {
  deviceSerialSchema,
  iotEventsBatchPayloadSchema,
  iotHeartbeatPayloadSchema,
  iotSignedHeadersSchema,
  iotTelemetryPayloadSchema
} from '@veerxcape/shared-validation';
import { AuditService } from '../audit/auditService.js';
import { IncidentAndAlertEngine } from '../incidents/incidentAndAlertEngine.js';
import {
  decryptDeviceSecretAesGcm,
  encryptDeviceSecretAesGcm,
  generateDeviceHmacSecretHex
} from '../shared/cryptoUtils.js';
import { AppError } from '../shared/errors.js';
import {
  claimUniqueLockInTx,
  type VeerXcapeBackendRuntime
} from '../shared/runtime.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const KEY_ROTATION_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

export class DeviceAndIotService {
  private readonly audit: AuditService;
  private readonly incidentEngine: IncidentAndAlertEngine;

  constructor(private readonly runtime: VeerXcapeBackendRuntime) {
    this.audit = new AuditService(runtime);
    this.incidentEngine = new IncidentAndAlertEngine(runtime);
  }

  /**
   * Provisions a new STM32U575 device, generates its 256-bit HMAC secret key,
   * stores it in Secret Manager / AES-256-GCM `_deviceKeyVault`, and returns
   * the provisioning secret ONCE for factory flashing.
   */
  async provisionDevice(params: {
    actorUser: UserDocument;
    serialNumber: string;
    imei: string;
    simIccid: string;
    firmwareVersion: string;
    allocatedCompanyId: string;
    allocatedShowroomId: string;
  }): Promise<{
    device: DeviceDocument;
    oneTimeProvisioningHmacSecretHex: string;
  }> {
    const cleanSerial = deviceSerialSchema.parse(params.serialNumber);
    const deviceId = `dev_${randomUUID().slice(0, 12)}`;
    const nowIso = this.runtime.now().toISOString();

    const secretKeyHex = generateDeviceHmacSecretHex();
    const wrapped = encryptDeviceSecretAesGcm({
      plaintextKeyHex: secretKeyHex,
      masterKekHex: this.runtime.config.deviceMasterKekHex
    });

    const deviceDoc: DeviceDocument = {
      id: deviceId,
      serialNumber: cleanSerial,
      mcuModel: 'STM32U575RIT6',
      firmwareVersion: params.firmwareVersion,
      imei: params.imei,
      simIccid: params.simIccid,
      secretVersion: 1,
      allocatedCompanyId: params.allocatedCompanyId,
      allocatedShowroomId: params.allocatedShowroomId,
      assignedVehicleId: null,
      status: 'PROVISIONED',
      lastSequenceNumber: 0,
      replayWindowBitmap: '0000000000000000',
      lastHeartbeatAt: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const keyVaultDoc: DeviceKeyVaultDocument = {
      deviceId,
      activeKeyVersion: 1,
      encryptedHmacKeyHex: wrapped.encryptedHmacKeyHex,
      ivHex: wrapped.ivHex,
      authTagHex: wrapped.authTagHex,
      previousKeyVersion: null,
      previousEncryptedHmacKeyHex: null,
      previousIvHex: null,
      previousAuthTagHex: null,
      previousKeyExpiresAt: null,
      status: 'ACTIVE',
      rotatedAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await claimUniqueLockInTx({
        tx,
        lockKey: UNIQUE_LOCK_KEYS.deviceSerial(cleanSerial),
        entityCollection: FIRESTORE_COLLECTIONS.DEVICES,
        entityId: deviceId,
        nowIso,
        conflictMessage: `Device serial ${cleanSerial} is already registered.`
      });

      await tx.setDoc(FIRESTORE_COLLECTIONS.DEVICES, deviceId, deviceDoc);
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.DEVICE_KEY_VAULT,
        deviceId,
        keyVaultDoc
      );
    });

    if (this.runtime.secretManager) {
      await this.runtime.secretManager.storeDeviceKeyVersion({
        deviceId,
        version: 1,
        secretKeyHex
      });
    }

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      action: 'DEVICE_PROVISIONED',
      severity: 'SENSITIVE',
      targetCollection: FIRESTORE_COLLECTIONS.DEVICES,
      targetDocumentId: deviceId,
      metadata: {
        serialNumber: cleanSerial,
        allocatedCompanyId: params.allocatedCompanyId,
        allocatedShowroomId: params.allocatedShowroomId
      }
    });

    return {
      device: deviceDoc,
      oneTimeProvisioningHmacSecretHex: secretKeyHex
    };
  }

  /**
   * Rotates a device's 256-bit HMAC secret key with a 24-hour dual-key grace window.
   */
  async rotateDeviceKey(params: {
    actorUser: UserDocument;
    deviceId: string;
  }): Promise<{
    device: DeviceDocument;
    newSecretVersion: number;
    oneTimeNewHmacSecretHex: string;
  }> {
    const device = await this.runtime.getDoc<DeviceDocument>(
      FIRESTORE_COLLECTIONS.DEVICES,
      params.deviceId
    );
    const vault = await this.runtime.getDoc<DeviceKeyVaultDocument>(
      FIRESTORE_COLLECTIONS.DEVICE_KEY_VAULT,
      params.deviceId
    );

    if (!device || !vault) {
      throw new AppError(404, 'NOT_FOUND', 'Device or key vault not found.');
    }

    const now = this.runtime.now();
    const nowIso = now.toISOString();
    const graceExpiresIso = new Date(
      now.getTime() + KEY_ROTATION_GRACE_MS
    ).toISOString();

    const newVersion = vault.activeKeyVersion + 1;
    const newSecretHex = generateDeviceHmacSecretHex();
    const wrapped = encryptDeviceSecretAesGcm({
      plaintextKeyHex: newSecretHex,
      masterKekHex: this.runtime.config.deviceMasterKekHex
    });

    const updatedVault: DeviceKeyVaultDocument = {
      deviceId: device.id,
      activeKeyVersion: newVersion,
      encryptedHmacKeyHex: wrapped.encryptedHmacKeyHex,
      ivHex: wrapped.ivHex,
      authTagHex: wrapped.authTagHex,
      previousKeyVersion: vault.activeKeyVersion,
      previousEncryptedHmacKeyHex: vault.encryptedHmacKeyHex,
      previousIvHex: vault.ivHex,
      previousAuthTagHex: vault.authTagHex,
      previousKeyExpiresAt: graceExpiresIso,
      status: vault.status,
      rotatedAt: nowIso
    };

    const updatedDevice: DeviceDocument = {
      ...device,
      secretVersion: newVersion,
      updatedAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.DEVICES,
        device.id,
        updatedDevice
      );
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.DEVICE_KEY_VAULT,
        device.id,
        updatedVault
      );
    });

    if (this.runtime.secretManager) {
      await this.runtime.secretManager.storeDeviceKeyVersion({
        deviceId: device.id,
        version: newVersion,
        secretKeyHex: newSecretHex
      });
    }

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      action: 'DEVICE_KEY_ROTATED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.DEVICES,
      targetDocumentId: device.id,
      metadata: {
        previousVersion: vault.activeKeyVersion,
        newVersion
      }
    });

    return {
      device: updatedDevice,
      newSecretVersion: newVersion,
      oneTimeNewHmacSecretHex: newSecretHex
    };
  }

  /**
   * Immediately revokes a device and disables its signing keys.
   */
  async revokeDevice(params: {
    actorUser: UserDocument;
    deviceId: string;
    reason: string;
  }): Promise<DeviceDocument> {
    const device = await this.runtime.getDoc<DeviceDocument>(
      FIRESTORE_COLLECTIONS.DEVICES,
      params.deviceId
    );
    const vault = await this.runtime.getDoc<DeviceKeyVaultDocument>(
      FIRESTORE_COLLECTIONS.DEVICE_KEY_VAULT,
      params.deviceId
    );

    if (!device) {
      throw new AppError(404, 'NOT_FOUND', 'Device not found.');
    }

    const nowIso = this.runtime.now().toISOString();
    const revokedDevice: DeviceDocument = {
      ...device,
      status: 'REVOKED',
      updatedAt: nowIso
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(FIRESTORE_COLLECTIONS.DEVICES, device.id, revokedDevice);
      if (vault) {
        await tx.setDoc<DeviceKeyVaultDocument>(
          FIRESTORE_COLLECTIONS.DEVICE_KEY_VAULT,
          device.id,
          {
            ...vault,
            status: 'REVOKED',
            rotatedAt: nowIso
          }
        );
      }
    });

    await this.audit.appendAuditLog({
      actorUserId: params.actorUser.uid,
      actorRole: params.actorUser.primaryRole,
      action: 'DEVICE_REVOKED',
      severity: 'CRITICAL',
      targetCollection: FIRESTORE_COLLECTIONS.DEVICES,
      targetDocumentId: device.id,
      reason: params.reason,
      metadata: { serialNumber: device.serialNumber }
    });

    return revokedDevice;
  }

  /**
   * Internal helper to authenticate an incoming STM32U575 HTTP request,
   * verify its HMAC-SHA256 signature (supporting Secret Manager + AES-256-GCM key vault + rotation grace period),
   * enforce active status and vehicle assignment, and advance the sequence replay window.
   */
  private async authenticateAndAdvanceDeviceSequence(params: {
    headers: Record<string, unknown>;
    httpMethod: string;
    requestPath: string;
    rawBody: string;
    allowSlidingWindowForOfflineRetry: boolean;
  }): Promise<{
    device: DeviceDocument;
    vehicle: VehicleDocument;
    sequenceNumber: number;
    deviceTimestampIso: string;
  }> {
    const normalizedHeaders: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params.headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }

    const parsedHeaders = iotSignedHeadersSchema.parse(normalizedHeaders);
    const serial = parsedHeaders['x-device-serial'];

    const serialLock = await this.runtime.getDoc<UniqueLockDocument>(
      FIRESTORE_COLLECTIONS.UNIQUE_LOCKS,
      UNIQUE_LOCK_KEYS.deviceSerial(serial)
    );
    if (!serialLock) {
      throw new AppError(401, 'UNAUTHORIZED', 'Unknown device serial number.');
    }

    const device = await this.runtime.getDoc<DeviceDocument>(
      FIRESTORE_COLLECTIONS.DEVICES,
      serialLock.entityId
    );
    const vault = await this.runtime.getDoc<DeviceKeyVaultDocument>(
      FIRESTORE_COLLECTIONS.DEVICE_KEY_VAULT,
      serialLock.entityId
    );

    if (!device || !vault || vault.status !== 'ACTIVE') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Device is not active or its signing key has been revoked.'
      );
    }

    if (!device.assignedVehicleId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Device is not assigned to any active vehicle.'
      );
    }

    const permCheck = evaluateDeviceSubmissionPermission({
      device,
      claimedVehicleId: device.assignedVehicleId
    });
    if (!permCheck.allowed) {
      throw new AppError(403, 'FORBIDDEN', permCheck.reason);
    }

    const vehicle = await this.runtime.getDoc<VehicleDocument>(
      FIRESTORE_COLLECTIONS.VEHICLES,
      device.assignedVehicleId
    );
    if (!vehicle || vehicle.registrationStatus === 'SUSPENDED') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Assigned vehicle does not exist or is suspended.'
      );
    }

    // Retrieve active key (prefer Secret Manager when enabled, fallback to AES-256-GCM vault)
    let activeKeyHex: string | null = null;
    if (this.runtime.config.secretManagerEnabled && this.runtime.secretManager) {
      activeKeyHex = await this.runtime.secretManager.getDeviceKeyVersion({
        deviceId: device.id,
        version: vault.activeKeyVersion
      });
    }
    if (!activeKeyHex) {
      activeKeyHex = decryptDeviceSecretAesGcm({
        encryptedHmacKeyHex: vault.encryptedHmacKeyHex,
        ivHex: vault.ivHex,
        authTagHex: vault.authTagHex,
        masterKekHex: this.runtime.config.deviceMasterKekHex
      });
    }

    const nowMs = this.runtime.now().getTime();
    let sigResult = verifyStm32HmacSignature({
      deviceSecretKeyHex: activeKeyHex,
      serialNumber: serial,
      httpMethod: params.httpMethod,
      requestPath: params.requestPath,
      deviceTimestampMs: parsedHeaders['x-device-timestamp'],
      transmissionTimestampMs: parsedHeaders['x-transmission-timestamp'],
      sequenceNumber: parsedHeaders['x-device-sequence'],
      rawBody: params.rawBody,
      providedSignatureHex: parsedHeaders['x-device-signature'],
      nowMs
    });

    // If active key did not match and a grace-window previous key is still valid, check previous key
    if (
      !sigResult.valid &&
      vault.previousEncryptedHmacKeyHex &&
      vault.previousIvHex &&
      vault.previousAuthTagHex &&
      vault.previousKeyExpiresAt &&
      nowMs <= Date.parse(vault.previousKeyExpiresAt)
    ) {
      const prevKeyHex = decryptDeviceSecretAesGcm({
        encryptedHmacKeyHex: vault.previousEncryptedHmacKeyHex,
        ivHex: vault.previousIvHex,
        authTagHex: vault.previousAuthTagHex,
        masterKekHex: this.runtime.config.deviceMasterKekHex
      });
      sigResult = verifyStm32HmacSignature({
        deviceSecretKeyHex: prevKeyHex,
        serialNumber: serial,
        httpMethod: params.httpMethod,
        requestPath: params.requestPath,
        deviceTimestampMs: parsedHeaders['x-device-timestamp'],
        transmissionTimestampMs: parsedHeaders['x-transmission-timestamp'],
        sequenceNumber: parsedHeaders['x-device-sequence'],
        rawBody: params.rawBody,
        providedSignatureHex: parsedHeaders['x-device-signature'],
        nowMs
      });
    }

    if (!sigResult.valid) {
      throw new AppError(401, 'UNAUTHORIZED', sigResult.reason);
    }

    // For non-offline-retry requests, deviceTimestampMs must also be within ±300s of server time
    if (
      !params.allowSlidingWindowForOfflineRetry &&
      Math.abs(nowMs - parsedHeaders['x-device-timestamp']) > 300_000
    ) {
      throw new AppError(
        400,
        'REPLAY_DETECTED',
        'Real-time device timestamp exceeds maximum allowed clock skew (±300s).'
      );
    }

    const replayCheck = evaluateSequenceReplayWindow({
      incomingSequence: parsedHeaders['x-device-sequence'],
      lastSequenceNumber: device.lastSequenceNumber,
      replayWindowBitmapHex: device.replayWindowBitmap,
      allowSlidingWindowForOfflineRetry: params.allowSlidingWindowForOfflineRetry
    });

    if (!replayCheck.accepted) {
      throw new AppError(409, 'REPLAY_DETECTED', replayCheck.reason);
    }

    const updatedDevice: DeviceDocument = {
      ...device,
      lastSequenceNumber: replayCheck.nextLastSequenceNumber,
      replayWindowBitmap: replayCheck.nextReplayWindowBitmapHex,
      updatedAt: new Date(nowMs).toISOString()
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.DEVICES,
      device.id,
      updatedDevice
    );

    return {
      device: updatedDevice,
      vehicle,
      sequenceNumber: parsedHeaders['x-device-sequence'],
      deviceTimestampIso: new Date(
        parsedHeaders['x-device-timestamp']
      ).toISOString()
    };
  }

  /**
   * POST /api/v1/iot/heartbeat
   */
  async ingestHeartbeat(params: {
    headers: Record<string, unknown>;
    rawBody: string;
    parsedBody: unknown;
  }): Promise<{ heartbeat: DeviceHeartbeatDocument }> {
    const payload = iotHeartbeatPayloadSchema.parse(params.parsedBody);
    const { device, vehicle, sequenceNumber, deviceTimestampIso } =
      await this.authenticateAndAdvanceDeviceSequence({
        headers: params.headers,
        httpMethod: 'POST',
        requestPath: '/api/v1/iot/heartbeat',
        rawBody: params.rawBody,
        allowSlidingWindowForOfflineRetry: false
      });

    const now = this.runtime.now();
    const nowIso = now.toISOString();
    const ttlExpireAt = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();
    const heartbeatId = `${device.id}_${sequenceNumber}`;

    const heartbeatDoc: DeviceHeartbeatDocument = {
      id: heartbeatId,
      deviceId: device.id,
      vehicleId: vehicle.id,
      mcuUptimeSeconds: payload.mcuUptimeSeconds,
      powerSource: payload.powerSource,
      backupBatteryPercent: payload.backupBatteryPercent,
      batteryVoltageMv: payload.batteryVoltageMv,
      cellularRssiDbm: payload.cellularRssiDbm,
      gnssFixStatus: payload.gnssFixStatus,
      firmwareVersion: payload.firmwareVersion,
      sequenceNumber,
      deviceTimestamp: deviceTimestampIso,
      receivedAt: nowIso,
      ttlExpireAt
    };

    const freshness = computeLocationFreshness({
      lastLocationRecordedAt:
        vehicle.liveStatusSummary.lastLocation?.recordedAt ?? null,
      lastHeartbeatAt: nowIso,
      nowMs: now.getTime()
    });

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.DEVICE_HEARTBEATS,
        heartbeatId,
        heartbeatDoc
      );
      await tx.setDoc<DeviceDocument>(FIRESTORE_COLLECTIONS.DEVICES, device.id, {
        ...device,
        firmwareVersion: payload.firmwareVersion,
        lastHeartbeatAt: nowIso,
        updatedAt: nowIso
      });
      await tx.setDoc<VehicleDocument>(
        FIRESTORE_COLLECTIONS.VEHICLES,
        vehicle.id,
        {
          ...vehicle,
          liveStatusSummary: {
            ...vehicle.liveStatusSummary,
            connectionStatus: freshness.state,
            lastSeenAt: nowIso,
            lastHeartbeatAt: nowIso,
            batteryVoltageMv: payload.batteryVoltageMv,
            backupBatteryPercent: payload.backupBatteryPercent,
            powerSource: payload.powerSource
          },
          updatedAt: nowIso
        }
      );
    });

    return { heartbeat: heartbeatDoc };
  }

  /**
   * POST /api/v1/iot/telemetry
   * Separates high-volume time-series telemetry (with 90-day TTL) from `vehicle.liveStatusSummary`.
   */
  async ingestTelemetry(params: {
    headers: Record<string, unknown>;
    rawBody: string;
    parsedBody: unknown;
  }): Promise<{
    telemetry: TelemetryDocument;
    liveStatusSummary: VehicleDocument['liveStatusSummary'];
  }> {
    const payload = iotTelemetryPayloadSchema.parse(params.parsedBody);

    if (
      payload.isSimulated &&
      this.runtime.config.environment === 'production'
    ) {
      throw new AppError(
        403,
        'PRODUCTION_SAFETY_GATE',
        'Simulated telemetry payloads are hard-disabled in production.'
      );
    }

    const { device, vehicle, sequenceNumber, deviceTimestampIso } =
      await this.authenticateAndAdvanceDeviceSequence({
        headers: params.headers,
        httpMethod: 'POST',
        requestPath: '/api/v1/iot/telemetry',
        rawBody: params.rawBody,
        allowSlidingWindowForOfflineRetry: false
      });

    const now = this.runtime.now();
    const nowIso = now.toISOString();
    const ttlExpireAt = new Date(now.getTime() + NINETY_DAYS_MS).toISOString();
    const telemetryId = `${device.id}_${sequenceNumber}`;

    const telemetryDoc: TelemetryDocument = {
      id: telemetryId,
      deviceId: device.id,
      vehicleId: vehicle.id,
      sequenceNumber,
      isSimulated: payload.isSimulated,
      gnss: payload.gnss,
      imu: payload.imu,
      cabin: payload.cabin,
      vehicleBus: payload.vehicleBus,
      power: payload.power,
      deviceTimestamp: deviceTimestampIso,
      receivedAt: nowIso,
      ttlExpireAt
    };

    const nextLocation =
      payload.gnss ?? vehicle.liveStatusSummary.lastLocation ?? null;

    const freshness = computeLocationFreshness({
      lastLocationRecordedAt: nextLocation?.recordedAt ?? null,
      lastHeartbeatAt: nowIso,
      nowMs: now.getTime()
    });

    const nextLiveSummary: VehicleDocument['liveStatusSummary'] = {
      connectionStatus: freshness.state,
      lastSeenAt: nowIso,
      lastHeartbeatAt: nowIso,
      lastLocation: nextLocation,
      batteryVoltageMv: payload.power.mainVoltageMv,
      backupBatteryPercent: payload.power.backupBatteryPercent,
      powerSource: payload.power.powerSource
    };

    await this.runtime.runTransaction(async (tx) => {
      await tx.setDoc(
        FIRESTORE_COLLECTIONS.TELEMETRY,
        telemetryId,
        telemetryDoc
      );
      await tx.setDoc<VehicleDocument>(
        FIRESTORE_COLLECTIONS.VEHICLES,
        vehicle.id,
        {
          ...vehicle,
          liveStatusSummary: nextLiveSummary,
          updatedAt: nowIso
        }
      );
    });

    return {
      telemetry: telemetryDoc,
      liveStatusSummary: nextLiveSummary
    };
  }

  /**
   * POST /api/v1/iot/events
   * Processes single or offline-buffered batches of safety events from the STM32U575.
   */
  async ingestHardwareEvents(params: {
    headers: Record<string, unknown>;
    rawBody: string;
    parsedBody: unknown;
  }): Promise<{
    processedCount: number;
    duplicateCount: number;
    incidentIds: string[];
  }> {
    const batch = iotEventsBatchPayloadSchema.parse(params.parsedBody);
    const hasOfflineRetry = batch.events.some((e) => e.offlineRetry);

    const { device, vehicle } =
      await this.authenticateAndAdvanceDeviceSequence({
        headers: params.headers,
        httpMethod: 'POST',
        requestPath: '/api/v1/iot/events',
        rawBody: params.rawBody,
        allowSlidingWindowForOfflineRetry: hasOfflineRetry
      });

    // Sort events chronologically by occurredAt so offline buffered events are recorded in order
    const orderedEvents = [...batch.events].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    );

    let processedCount = 0;
    let duplicateCount = 0;
    const incidentIds: string[] = [];

    for (const ev of orderedEvents) {
      const res = await this.incidentEngine.processIncidentEvent({
        idempotencyKey: `${device.id}_${ev.idempotencyKey}`,
        vehicleId: vehicle.id,
        deviceId: device.id,
        triggeredByUserId: null,
        incidentType: ev.incidentType,
        source: 'HARDWARE_STM32',
        isSimulated: ev.isSimulated,
        severity: ev.severity,
        confidenceScore: ev.confidenceScore,
        occurredAt: ev.occurredAt,
        location: ev.location,
        environmentalSnapshot: ev.environmentalSnapshot
      });

      incidentIds.push(res.incident.id);
      if (res.duplicate) {
        duplicateCount++;
      } else {
        processedCount++;
      }
    }

    return {
      processedCount,
      duplicateCount,
      incidentIds
    };
  }

  /**
   * GET /api/v1/iot/config
   */
  async getDeviceConfig(params: {
    headers: Record<string, unknown>;
  }): Promise<{
    deviceId: string;
    firmwareThresholds: Record<string, unknown>;
  }> {
    const { device } = await this.authenticateAndAdvanceDeviceSequence({
      headers: params.headers,
      httpMethod: 'GET',
      requestPath: '/api/v1/iot/config',
      rawBody: '',
      allowSlidingWindowForOfflineRetry: false
    });

    const configDoc = await this.runtime.getDoc<SystemConfigurationDocument>(
      FIRESTORE_COLLECTIONS.SYSTEM_CONFIGURATION,
      'cfg_iot_thresholds'
    );

    return {
      deviceId: device.id,
      firmwareThresholds: configDoc?.value ?? {
        crashImpactThresholdG: 4.0,
        parkedCabinTempAlertCelsius: 38.0,
        coAlertThresholdPpm: 50,
        heartbeatIntervalSeconds: 30,
        telemetryIntervalSeconds: 15
      }
    };
  }
}

