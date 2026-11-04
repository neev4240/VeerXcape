import { onRequest } from 'firebase-functions/v2/https';
import { createVeerXcapeExpressApp } from './app.js';
import { createFirebaseAdminRuntime } from './shared/firebaseAdmin.js';

export * from './shared/errors.js';
export * from './shared/cryptoUtils.js';
export * from './shared/runtime.js';
export * from './shared/firebaseAdmin.js';
export * from './audit/auditService.js';
export * from './auth/authService.js';
export * from './notifications/notificationService.js';
export * from './users/familyAndDriverService.js';
export * from './incidents/incidentAndAlertEngine.js';
export * from './devices/deviceAndIotService.js';
export * from './dealers/dealerAndCompanyService.js';
export * from './authorities/authorityService.js';
export * from './admin/adminService.js';
export * from './vehicles/mobileCustomerService.js';
export * from './app.js';

let cachedExpressApp: ReturnType<typeof createVeerXcapeExpressApp>['app'] | null =
  null;

export const api = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    maxInstances: 20
  },
  (req, res) => {
    if (!cachedExpressApp) {
      const runtime = createFirebaseAdminRuntime();
      cachedExpressApp = createVeerXcapeExpressApp(runtime).app;
    }
    return cachedExpressApp(req, res);
  }
);

