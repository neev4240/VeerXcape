import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { FIRESTORE_COLLECTIONS } from '@veerxcape/shared-constants';
import {
  deviceKeyRotationPayloadSchema,
  deviceProvisionPayloadSchema,
  deviceRevocationPayloadSchema,
  systemConfigurationUpdatePayloadSchema,
  userAccountStatusPayloadSchema
} from '@veerxcape/shared-validation';
import { AdminService } from './admin/adminService.js';
import { AuditService } from './audit/auditService.js';
import { AuthService } from './auth/authService.js';
import { AuthorityService } from './authorities/authorityService.js';
import { DealerAndCompanyService } from './dealers/dealerAndCompanyService.js';
import { DeviceAndIotService } from './devices/deviceAndIotService.js';
import { IncidentAndAlertEngine } from './incidents/incidentAndAlertEngine.js';
import { NotificationService } from './notifications/notificationService.js';
import { AppError } from './shared/errors.js';
import type { VeerXcapeBackendRuntime } from './shared/runtime.js';
import { FamilyAndDriverService } from './users/familyAndDriverService.js';
import { MobileCustomerService } from './vehicles/mobileCustomerService.js';

/**
 * Builds the Express API application wired to the provided `VeerXcapeBackendRuntime`.
 */
export function createVeerXcapeExpressApp(runtime: VeerXcapeBackendRuntime) {
  const app = express();
  app.use(cors());
  app.use(
    express.json({
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    })
  );

  const authService = new AuthService(runtime);
  const familyService = new FamilyAndDriverService(runtime);
  const dealerService = new DealerAndCompanyService(runtime);
  const deviceService = new DeviceAndIotService(runtime);
  const incidentEngine = new IncidentAndAlertEngine(runtime);
  const authorityService = new AuthorityService(runtime);
  const adminService = new AdminService(runtime);
  const mobileService = new MobileCustomerService(runtime);
  const notificationService = new NotificationService(runtime);
  const auditService = new AuditService(runtime);

  const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

  // Health Check
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'HEALTHY',
        service: 'VeerXcape Cloud Functions Gateway',
        environment: runtime.config.environment,
        timestamp: runtime.now().toISOString()
      }
    });
  });

  // =========================================================================
  // 1. AUTHENTICATION ENDPOINTS
  // =========================================================================
  app.post(
    '/api/v1/auth/request-otp',
    asyncHandler(async (req, res) => {
      const data = await authService.requestOtp(req.body);
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/auth/activate-account',
    asyncHandler(async (req, res) => {
      const data = await authService.activateCustomerAccount(req.body);
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/auth/activate-family',
    asyncHandler(async (req, res) => {
      const data = await familyService.activateFamilyMemberAccount(req.body);
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/auth/login-phone',
    asyncHandler(async (req, res) => {
      const data = await authService.loginWithPhoneAndPassword(req.body);
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/auth/reset-password',
    asyncHandler(async (req, res) => {
      const data = await authService.resetPasswordWithOtp(req.body);
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/auth/me',
    asyncHandler(async (req, res) => {
      const data = await authService.getSessionIdentity(
        req.headers.authorization
      );
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/auth/logout',
    asyncHandler(async (req, res) => {
      const data = await authService.logoutSession(req.headers.authorization);
      res.json({ success: true, data });
    })
  );

  // =========================================================================
  // 2. MOBILE APP ENDPOINTS (Owner, Family, Driver, SOS)
  // =========================================================================
  app.get(
    '/api/v1/mobile/dashboard',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await mobileService.getMobileDashboard({
        actorUser: ctx.user
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/mobile/vehicles/:vehicleId/telemetry',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const limit =
        typeof req.query.limit === 'string'
          ? Number.parseInt(req.query.limit, 10)
          : undefined;
      const startAfterDocId =
        typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const data = await mobileService.getVehicleTelemetryHistory({
        actorUser: ctx.user,
        vehicleId: req.params.vehicleId,
        ...(Number.isFinite(limit) ? { limit } : {}),
        ...(startAfterDocId ? { startAfterDocId } : {})
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/mobile/family/invite',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await familyService.inviteFamilyMember({
        actorUser: ctx.user,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.patch(
    '/api/v1/mobile/family/:membershipId',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await familyService.updateOrRevokeFamilyMembership({
        actorUser: ctx.user,
        membershipId: req.params.membershipId,
        action: req.body.action,
        permissions: req.body.permissions
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/mobile/drivers/assign',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await familyService.assignOrRevokeDriver({
        actorUser: ctx.user,
        vehicleId: req.body.vehicleId,
        driverPhoneE164: req.body.driverPhoneE164,
        driverFullName: req.body.driverFullName,
        action: req.body.action
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/mobile/sos/trigger',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await incidentEngine.triggerManualSos({
        actorUser: ctx.user,
        vehicleId: req.body.vehicleId,
        location: req.body.location,
        isSimulated: req.body.isSimulated
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/mobile/incidents/:incidentId/respond',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await incidentEngine.cancelOrAcknowledgeIncidentByCustomer({
        actorUser: ctx.user,
        incidentId: req.params.incidentId,
        action: req.body.action,
        note: req.body.note
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/notifications/:notificationId/ack-delivered',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await notificationService.acknowledgeClientDelivered({
        notificationId: req.params.notificationId,
        actorUserId: ctx.user.uid
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/notifications/:notificationId/mark-read',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await notificationService.markNotificationRead({
        notificationId: req.params.notificationId,
        actorUserId: ctx.user.uid
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/mobile/emergency-contacts',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await mobileService.upsertEmergencyContact({
        actorUser: ctx.user,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.delete(
    '/api/v1/mobile/emergency-contacts/:contactId',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await mobileService.deleteEmergencyContact({
        actorUser: ctx.user,
        contactId: req.params.contactId
      });
      res.json({ success: true, data });
    })
  );

  app.patch(
    '/api/v1/mobile/profile',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await mobileService.updateUserProfile({
        actorUser: ctx.user,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/mobile/support-tickets',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await mobileService.createSupportTicket({
        actorUser: ctx.user,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  // =========================================================================
  // 3. SHOWROOM & PARENT-COMPANY ENDPOINTS
  // =========================================================================
  app.get(
    '/api/v1/dealer/workspace',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await dealerService.getDealerWorkspace({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/dealer/customers/verify-otp',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await dealerService.verifyCustomerOtpForShowroom({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.patch(
    '/api/v1/dealer/vehicles/:vehicleId/correction',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await dealerService.applyPermittedVehicleCorrection({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        vehicleId: req.params.vehicleId,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );
  app.post(
    '/api/v1/dealer/vehicles/register',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await dealerService.registerVehicleAndAssignDevice({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/dealer/showrooms/:showroomId/vehicles',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const limit =
        typeof req.query.limit === 'string'
          ? Number.parseInt(req.query.limit, 10)
          : undefined;
      const startAfterDocId =
        typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const data = await dealerService.listShowroomVehicles({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        showroomId: req.params.showroomId,
        ...(Number.isFinite(limit) ? { limit } : {}),
        ...(startAfterDocId ? { startAfterDocId } : {})
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/company/:companyId/overview',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await dealerService.getCompanyOverview({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        companyId: req.params.companyId
      });
      res.json({ success: true, data });
    })
  );

  app.patch(
    '/api/v1/company/:companyId/showrooms/:showroomId/status',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await dealerService.updateShowroomStatusByCompanyAdmin({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        companyId: req.params.companyId,
        showroomId: req.params.showroomId,
        newStatus: req.body.newStatus,
        reason: req.body.reason
      });
      res.json({ success: true, data });
    })
  );

  // =========================================================================
  // 4. GOVERNMENT AUTHORITY ENDPOINTS
  // =========================================================================
  app.get(
    '/api/v1/authority/workspace',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await authorityService.getAuthorityWorkspace({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/authority/:authorityId/incidents',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const limit =
        typeof req.query.limit === 'string'
          ? Number.parseInt(req.query.limit, 10)
          : undefined;
      const startAfterDocId =
        typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const data = await authorityService.listDepartmentIncidents({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        authorityId: req.params.authorityId,
        ...(Number.isFinite(limit) ? { limit } : {}),
        ...(startAfterDocId ? { startAfterDocId } : {})
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/authority/:authorityId/incidents/:incidentId',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await authorityService.inspectIncidentByAuthority({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        authorityId: req.params.authorityId,
        incidentId: req.params.incidentId
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/authority/:authorityId/incidents/update',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await authorityService.updateIncidentByAuthority({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        authorityId: req.params.authorityId,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  // =========================================================================
  // 5. VEERXCAPE ADMIN & SUPER-ADMIN ENDPOINTS
  // =========================================================================
  app.get(
    '/api/v1/admin/workspace',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.getAdminWorkspace({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/admin/overview',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.getPlatformOverview({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/companies',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.createCompanyTenant({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        ...req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/showrooms',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.createAndApproveShowroom({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        ...req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/authorities',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.createAndVerifyAuthority({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        ...req.body
      });
      res.json({ success: true, data });
    })
  );

  app.patch(
    '/api/v1/admin/authorities/:authorityId/verify',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.updateAuthorityVerificationStatus({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        authorityId: req.params.authorityId,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/public/contact',
    asyncHandler(async (req, res) => {
      const data = await adminService.submitPublicContactInquiry(req.body);
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/roles/assign',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const data = await adminService.assignScopedRole({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        rawInput: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/devices/provision',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const adminRole = adminService.assertVeerXcapeRole({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
      });
      const parsed = deviceProvisionPayloadSchema.parse(req.body);
      const data = await deviceService.provisionDevice({
        actorUser: ctx.user,
        actorRole: adminRole.role,
        ...parsed
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/devices/:deviceId/rotate-key',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const adminRole = adminService.assertVeerXcapeRole({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
      });
      const parsed = deviceKeyRotationPayloadSchema.parse(req.body ?? {});
      const data = await deviceService.rotateDeviceKey({
        actorUser: ctx.user,
        actorRole: adminRole.role,
        deviceId: req.params.deviceId,
        reason: parsed.reason
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/devices/:deviceId/revoke',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const adminRole = adminService.assertVeerXcapeRole({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        allowedRoles: ['VEERXCAPE_ADMIN', 'VEERXCAPE_SUPER_ADMIN']
      });
      const parsed = deviceRevocationPayloadSchema.parse(req.body);
      const data = await deviceService.revokeDevice({
        actorUser: ctx.user,
        actorRole: adminRole.role,
        deviceId: req.params.deviceId,
        reason: parsed.reason
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/users/:userId/suspend',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const parsed = userAccountStatusPayloadSchema.parse(req.body);
      const data = await adminService.suspendUserAccount({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        targetUserId: req.params.userId,
        reason: parsed.reason
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/users/:userId/reactivate',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const parsed = userAccountStatusPayloadSchema.parse(req.body);
      const data = await adminService.reactivateUserAccount({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        targetUserId: req.params.userId,
        reason: parsed.reason
      });
      res.json({ success: true, data });
    })
  );

  app.put(
    '/api/v1/admin/system-config/:configKey',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const parsed = systemConfigurationUpdatePayloadSchema.parse(req.body);
      const data = await adminService.updateSystemConfiguration({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        configKey: req.params.configKey,
        value: parsed.value,
        reason: parsed.reason
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/admin/notifications/:notificationId/retry',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      const adminRole = adminService.assertVeerXcapeRole({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles,
        allowedRoles: [
          'VEERXCAPE_SUPPORT',
          'VEERXCAPE_ADMIN',
          'VEERXCAPE_SUPER_ADMIN'
        ]
      });
      const data = await notificationService.retryFailedNotification(
        req.params.notificationId
      );
      await auditService.appendAuditLog({
        actorUserId: ctx.user.uid,
        actorRole: adminRole.role,
        action: 'NOTIFICATION_RETRY_TRIGGERED',
        severity: 'SENSITIVE',
        targetCollection: FIRESTORE_COLLECTIONS.NOTIFICATIONS,
        targetDocumentId: req.params.notificationId,
        metadata: { newStatus: data.status, retryCount: data.retryCount }
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/admin/audit-logs/verify',
    asyncHandler(async (req, res) => {
      const ctx = await authService.authenticateBearerToken(
        req.headers.authorization
      );
      await adminService.getPlatformOverview({
        actorUser: ctx.user,
        activeRoles: ctx.activeRoles
      });
      const data = await auditService.verifyChain();
      res.json({ success: true, data });
    })
  );

  // =========================================================================
  // 6. STM32U575 HARDWARE IOT GATEWAY ENDPOINTS
  // =========================================================================
  app.post(
    '/api/v1/iot/heartbeat',
    asyncHandler(async (req: Request & { rawBody?: string }, res) => {
      const rawBody = req.rawBody ?? JSON.stringify(req.body);
      const data = await deviceService.ingestHeartbeat({
        headers: req.headers,
        rawBody,
        parsedBody: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/iot/telemetry',
    asyncHandler(async (req: Request & { rawBody?: string }, res) => {
      const rawBody = req.rawBody ?? JSON.stringify(req.body);
      const data = await deviceService.ingestTelemetry({
        headers: req.headers,
        rawBody,
        parsedBody: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.post(
    '/api/v1/iot/events',
    asyncHandler(async (req: Request & { rawBody?: string }, res) => {
      const rawBody = req.rawBody ?? JSON.stringify(req.body);
      const data = await deviceService.ingestHardwareEvents({
        headers: req.headers,
        rawBody,
        parsedBody: req.body
      });
      res.json({ success: true, data });
    })
  );

  app.get(
    '/api/v1/iot/config',
    asyncHandler(async (req, res) => {
      const data = await deviceService.getDeviceConfig({
        headers: req.headers
      });
      res.json({ success: true, data });
    })
  );

  // Global Safe Error Handler
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          success: false,
          error: {
            code: err.code,
            message: err.message
          }
        });
      }
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: err.issues.map((i) => i.message).join('; ')
          }
        });
      }
      const message =
        err instanceof Error ? err.message : 'Internal server error';
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message
        }
      });
    }
  );

  return {
    app,
    services: {
      authService,
      familyService,
      dealerService,
      deviceService,
      incidentEngine,
      authorityService,
      adminService,
      mobileService,
      notificationService,
      auditService
    }
  };
}

