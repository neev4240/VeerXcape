import { randomUUID } from 'node:crypto';
import {
  FIRESTORE_COLLECTIONS,
  NOTIFICATION_STATUSES,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import type { NotificationDocument } from '@veerxcape/shared-types';
import { AppError } from '../shared/errors.js';
import type { VeerXcapeBackendRuntime } from '../shared/runtime.js';

export interface DispatchNotificationParams {
  dedupeKey: string;
  recipientUserId: string;
  recipientRole: UserRoleCode;
  incidentId?: string | null;
  vehicleId?: string | null;
  title: string;
  body: string;
}

/**
 * Role-scoped Notification Service with strict state separation:
 * - QUEUED -> FCM_ACCEPTED (sent to FCM gateway, NOT claimed as delivered to device)
 * - CLIENT_DELIVERED_ACK (confirmed received by client app)
 * - READ (opened by user)
 * - FAILED_RETRYABLE / FAILED_PERMANENT
 * - Deduplicates notifications by `dedupeKey`.
 */
export class NotificationService {
  constructor(private readonly runtime: VeerXcapeBackendRuntime) {}

  async dispatchNotification(
    params: DispatchNotificationParams
  ): Promise<NotificationDocument> {
    const existing = await this.runtime.listDocs<NotificationDocument>(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      (n) => n.dedupeKey === params.dedupeKey
    );

    if (existing.length > 0) {
      return existing[0];
    }

    const nowIso = this.runtime.now().toISOString();
    const id = `ntf_${randomUUID().slice(0, 12)}`;

    const fcmResult = await this.runtime.fcm.sendToUser({
      recipientUserId: params.recipientUserId,
      title: params.title,
      body: params.body,
      data: {
        notificationId: id,
        ...(params.incidentId ? { incidentId: params.incidentId } : {}),
        ...(params.vehicleId ? { vehicleId: params.vehicleId } : {})
      }
    });

    const status = fcmResult.accepted
      ? NOTIFICATION_STATUSES.FCM_ACCEPTED
      : fcmResult.permanentFailure
        ? NOTIFICATION_STATUSES.FAILED_PERMANENT
        : NOTIFICATION_STATUSES.FAILED_RETRYABLE;

    const doc: NotificationDocument = {
      id,
      dedupeKey: params.dedupeKey,
      recipientUserId: params.recipientUserId,
      recipientRole: params.recipientRole,
      incidentId: params.incidentId ?? null,
      vehicleId: params.vehicleId ?? null,
      channel: 'FCM_PUSH',
      title: params.title,
      body: params.body,
      status,
      retryCount: fcmResult.accepted ? 0 : 1,
      fcmMessageId: fcmResult.fcmMessageId ?? null,
      lastError: fcmResult.errorCode ?? null,
      createdAt: nowIso,
      fcmAcceptedAt: fcmResult.accepted ? nowIso : null,
      deliveredAckAt: null,
      readAt: null
    };

    await this.runtime.setDoc(FIRESTORE_COLLECTIONS.NOTIFICATIONS, id, doc);
    return doc;
  }

  async acknowledgeClientDelivered(params: {
    notificationId: string;
    actorUserId: string;
  }): Promise<NotificationDocument> {
    const doc = await this.runtime.getDoc<NotificationDocument>(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      params.notificationId
    );
    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
    }
    if (doc.recipientUserId !== params.actorUserId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Cannot acknowledge a notification belonging to another user.'
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const updated: NotificationDocument = {
      ...doc,
      status:
        doc.status === NOTIFICATION_STATUSES.READ
          ? NOTIFICATION_STATUSES.READ
          : NOTIFICATION_STATUSES.CLIENT_DELIVERED_ACK,
      deliveredAckAt: doc.deliveredAckAt ?? nowIso
    };
    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      doc.id,
      updated
    );
    return updated;
  }

  async markNotificationRead(params: {
    notificationId: string;
    actorUserId: string;
  }): Promise<NotificationDocument> {
    const doc = await this.runtime.getDoc<NotificationDocument>(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      params.notificationId
    );
    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
    }
    if (doc.recipientUserId !== params.actorUserId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Cannot read a notification belonging to another user.'
      );
    }

    const nowIso = this.runtime.now().toISOString();
    const updated: NotificationDocument = {
      ...doc,
      status: NOTIFICATION_STATUSES.READ,
      deliveredAckAt: doc.deliveredAckAt ?? nowIso,
      readAt: nowIso
    };
    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      doc.id,
      updated
    );
    return updated;
  }

  async retryFailedNotification(
    notificationId: string
  ): Promise<NotificationDocument> {
    const doc = await this.runtime.getDoc<NotificationDocument>(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      notificationId
    );
    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
    }
    if (doc.status !== NOTIFICATION_STATUSES.FAILED_RETRYABLE) {
      return doc;
    }
    if (doc.retryCount >= 3) {
      const permanentDoc: NotificationDocument = {
        ...doc,
        status: NOTIFICATION_STATUSES.FAILED_PERMANENT
      };
      await this.runtime.setDoc(
        FIRESTORE_COLLECTIONS.NOTIFICATIONS,
        doc.id,
        permanentDoc
      );
      return permanentDoc;
    }

    const nowIso = this.runtime.now().toISOString();
    const fcmResult = await this.runtime.fcm.sendToUser({
      recipientUserId: doc.recipientUserId,
      title: doc.title,
      body: doc.body
    });

    const updated: NotificationDocument = {
      ...doc,
      status: fcmResult.accepted
        ? NOTIFICATION_STATUSES.FCM_ACCEPTED
        : fcmResult.permanentFailure
          ? NOTIFICATION_STATUSES.FAILED_PERMANENT
          : NOTIFICATION_STATUSES.FAILED_RETRYABLE,
      retryCount: doc.retryCount + 1,
      fcmMessageId: fcmResult.fcmMessageId ?? doc.fcmMessageId ?? null,
      fcmAcceptedAt: fcmResult.accepted ? nowIso : doc.fcmAcceptedAt ?? null,
      lastError: fcmResult.errorCode ?? null
    };

    await this.runtime.setDoc(
      FIRESTORE_COLLECTIONS.NOTIFICATIONS,
      doc.id,
      updated
    );
    return updated;
  }
}

