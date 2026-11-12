import type {
  AuthorityDepartment,
  AuthorityDocument,
  AuditLogDocument,
  CompanyDocument,
  DeviceAssignmentDocument,
  DeviceDocument,
  EmergencyContactDocument,
  FamilyMemberPermissions,
  FamilyMembershipDocument,
  IncidentDocument,
  IncidentLifecycleState,
  IncidentUpdateDocument,
  LocationFreshnessEvaluation,
  MedicalAuthorityIncidentView,
  NotificationDocument,
  OtpPurpose,
  PoliceAuthorityIncidentView,
  RoadAuthorityAnonymizedIncidentView,
  ShowroomDocument,
  SupportTicketDocument,
  SystemConfigurationDocument,
  TelemetryDocument,
  UserDocument,
  UserProfileDocument,
  UserRoleCode,
  UserRoleDocument,
  VehicleDocument,
  VehicleDriverDocument,
  VehicleOwnerDocument
} from '@veerxcape/shared-types';
import {
  resolveApiBaseUrl,
  resolveAuthEmulatorHost,
  resolveFirebaseWebConfig
} from './firebaseConfig.js';

export interface ApiClientConfig {
  baseUrl?: string;
  getIdToken?: () => Promise<string | null>;
  refreshIdToken?: () => Promise<string | null>;
  onSessionExpired?: (reason: string) => void;
  timeoutMs?: number;
  firebaseApiKey?: string;
  firebaseAuthEmulatorHost?: string | null;
  fetchImpl?: typeof fetch;
}

export interface StandardApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export class VeerXcapeApiError extends Error {
  public readonly code: string;
  public readonly isNetworkError: boolean;
  public readonly isTimeout: boolean;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VeerXcapeApiError';
    this.code = code;
    this.isNetworkError = code === 'NETWORK_ERROR';
    this.isTimeout = code === 'REQUEST_TIMEOUT';
  }
}

export function unwrapApiResponse<T>(res: StandardApiResponse<T>): T {
  if (!res.success || res.data === undefined) {
    throw new VeerXcapeApiError(
      res.error?.code ?? 'REQUEST_FAILED',
      res.error?.message ?? 'Backend request failed.'
    );
  }
  return res.data;
}

export interface ActiveAuthSession {
  idToken: string;
  refreshToken: string | null;
  expiresAtMs: number | null;
  user: UserDocument;
  profile: UserProfileDocument | null;
  activeRoles: UserRoleDocument[];
}

export interface MobileVehicleDashboardCard {
  id: string;
  registrationNumber: string;
  vin?: string;
  manufacturer: string;
  model: string;
  variant: string;
  manufacturingYear?: number;
  color: string;
  fuelType: VehicleDocument['fuelType'];
  accessRole: 'VEHICLE_OWNER' | 'FAMILY_MEMBER' | 'DRIVER';
  registrationStatus: VehicleDocument['registrationStatus'];
  registeredByShowroomId?: string;
  registeredByShowroomName?: string;
  registeredByDealerCode?: string;
  assignedDeviceId?: string | null;
  assignedDeviceSerial?: string | null;
  firmwareVersion?: string | null;
  locationFreshness: LocationFreshnessEvaluation;
  liveStatusSummary: VehicleDocument['liveStatusSummary'];
}

export interface MobileDashboardDTO {
  vehicles: MobileVehicleDashboardCard[];
  familyMembershipsForOwnedVehicles: FamilyMembershipDocument[];
  myFamilyMemberships?: FamilyMembershipDocument[];
  drivers?: Array<
    VehicleDriverDocument & {
      driverFullName?: string;
      driverPhoneE164?: string;
    }
  >;
  incidents: IncidentDocument[];
  emergencyContacts: EmergencyContactDocument[];
  notifications?: NotificationDocument[];
  supportTickets?: SupportTicketDocument[];
  profile?: UserProfileDocument | null;
}

export type RedactedAuthorityIncidentView =
  | MedicalAuthorityIncidentView
  | PoliceAuthorityIncidentView
  | RoadAuthorityAnonymizedIncidentView;

export interface AuthorityWorkspaceDTO {
  authorities: AuthorityDocument[];
  recentUpdates: IncidentUpdateDocument[];
}

export interface DealerStaffSummaryItem {
  id: string;
  userId: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  role: 'COMPANY_ADMIN' | 'SHOWROOM_MANAGER' | 'SHOWROOM_STAFF';
  showroomId: string | null;
  companyId: string | null;
  status: UserRoleDocument['status'];
}

export interface DealerWorkspaceDTO {
  company: CompanyDocument | null;
  showrooms: ShowroomDocument[];
  vehicles: Array<
    VehicleDocument & {
      dealerCode?: string;
      customerFullName?: string;
      customerPhoneE164?: string;
      customerEmail?: string | null;
      assignedDeviceSerial?: string | null;
    }
  >;
  devices: DeviceDocument[];
  deviceAssignments: DeviceAssignmentDocument[];
  staff: DealerStaffSummaryItem[];
  auditLogs: AuditLogDocument[];
}

export interface AdminOverviewDTO {
  totalUsers: number;
  totalVehicles: number;
  activeDevices: number;
  inactiveOrProvisionedDevices: number;
  registeredCompanies: number;
  registeredShowrooms: number;
  verifiedAuthorities: number;
  totalIncidents: number;
}

export interface AuditChainVerificationDTO {
  valid: boolean;
  checkedCount: number;
  brokenAtSequenceIndex: number | null;
  brokenAtLogId: string | null;
  reason: string | null;
}

export interface AdminWorkspaceDTO {
  overview: AdminOverviewDTO;
  users: UserDocument[];
  userRoles: UserRoleDocument[];
  companies: CompanyDocument[];
  showrooms: ShowroomDocument[];
  authorities: AuthorityDocument[];
  vehicles: VehicleDocument[];
  devices: DeviceDocument[];
  incidents: IncidentDocument[];
  notifications: NotificationDocument[];
  auditLogs: AuditLogDocument[];
  auditVerification: AuditChainVerificationDTO;
  systemConfigurations: SystemConfigurationDocument[];
}

/**
 * Shared typed HTTP & Firebase Authentication client used across all 5 VeerXcape frontends.
 * - Centralizes API base URL resolution.
 * - Exchanges Firebase custom tokens for Firebase ID tokens (Emulator or Production) or in-memory test tokens.
 * - Automatically attaches `Authorization: Bearer <token>`.
 * - Handles token refresh on expiration or `401 UNAUTHORIZED`.
 * - Enforces request timeouts and consistent error normalization (`NETWORK_ERROR`, `REQUEST_TIMEOUT`).
 */
export class VeerXcapeApiClient {
  private readonly baseUrl: string;
  private readonly customGetIdToken?: () => Promise<string | null>;
  private readonly customRefreshIdToken?: () => Promise<string | null>;
  private readonly onSessionExpired?: (reason: string) => void;
  private readonly timeoutMs: number;
  private readonly firebaseApiKey: string;
  private readonly firebaseAuthEmulatorHost: string | null;
  private readonly fetchImpl: typeof fetch;

  private activeSession: ActiveAuthSession | null = null;

  constructor(config: ApiClientConfig = {}) {
    const env =
      typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env
        ? ((import.meta as unknown as { env: Record<string, string | boolean | undefined> }).env)
        : {};
    const webCfg = resolveFirebaseWebConfig(env);

    this.baseUrl = (config.baseUrl ?? resolveApiBaseUrl(env)).replace(/\/+$/, '');
    this.customGetIdToken = config.getIdToken;
    this.customRefreshIdToken = config.refreshIdToken;
    this.onSessionExpired = config.onSessionExpired;
    this.timeoutMs = config.timeoutMs ?? 15000;
    this.firebaseApiKey = config.firebaseApiKey ?? webCfg.apiKey;
    this.firebaseAuthEmulatorHost =
      config.firebaseAuthEmulatorHost !== undefined
        ? config.firebaseAuthEmulatorHost
        : resolveAuthEmulatorHost(env);
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getSession(): ActiveAuthSession | null {
    return this.activeSession;
  }

  public hasActiveSession(): boolean {
    return this.activeSession !== null;
  }

  public setSession(session: ActiveAuthSession | null): void {
    this.activeSession = session;
  }

  public clearSession(): void {
    this.activeSession = null;
  }

  /**
   * Exchanges a server-minted Firebase Custom Token for a live Firebase ID Token
   * (or preserves deterministic `custom_token_*` tokens when running against InMemoryBackendRuntime).
   */
  public async exchangeCustomTokenForIdToken(customToken: string): Promise<{
    idToken: string;
    refreshToken: string | null;
    expiresAtMs: number | null;
  }> {
    if (
      customToken.startsWith('custom_token_') ||
      customToken.startsWith('vx_token.')
    ) {
      return {
        idToken: customToken,
        refreshToken: null,
        expiresAtMs: null
      };
    }

    const emulatorHost = this.firebaseAuthEmulatorHost;
    const apiKey = this.firebaseApiKey || 'fake-api-key';
    const endpoint = emulatorHost
      ? `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`
      : this.firebaseApiKey
        ? `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(this.firebaseApiKey)}`
        : null;

    if (!endpoint) {
      return {
        idToken: customToken,
        refreshToken: null,
        expiresAtMs: null
      };
    }

    const res = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true
      })
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(
        errBody.error?.message || `Failed to exchange Firebase Custom Token (${res.status})`
      );
    }

    const payload = (await res.json()) as {
      idToken: string;
      refreshToken?: string;
      expiresIn?: string;
    };
    const expiresSeconds = Number.parseInt(payload.expiresIn ?? '3600', 10);
    return {
      idToken: payload.idToken,
      refreshToken: payload.refreshToken ?? null,
      expiresAtMs: Number.isFinite(expiresSeconds)
        ? Date.now() + expiresSeconds * 1000
        : null
    };
  }

  /**
   * Refreshes the current Firebase ID Token using the stored refresh token.
   */
  public async refreshCurrentToken(): Promise<string | null> {
    if (this.customRefreshIdToken) {
      return this.customRefreshIdToken();
    }
    if (!this.activeSession?.refreshToken) {
      return null;
    }

    const emulatorHost = this.firebaseAuthEmulatorHost;
    const apiKey = this.firebaseApiKey || 'fake-api-key';
    const endpoint = emulatorHost
      ? `http://${emulatorHost}/securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`
      : this.firebaseApiKey
        ? `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.firebaseApiKey)}`
        : null;

    if (!endpoint) {
      return null;
    }

    try {
      const res = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.activeSession.refreshToken
        })
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as {
        id_token?: string;
        refresh_token?: string;
        expires_in?: string;
      };
      if (!data.id_token) {
        return null;
      }
      const expiresSeconds = Number.parseInt(data.expires_in ?? '3600', 10);
      this.activeSession = {
        ...this.activeSession,
        idToken: data.id_token,
        refreshToken: data.refresh_token ?? this.activeSession.refreshToken,
        expiresAtMs: Number.isFinite(expiresSeconds)
          ? Date.now() + expiresSeconds * 1000
          : this.activeSession.expiresAtMs
      };
      return data.id_token;
    } catch {
      return null;
    }
  }

  private async resolveBearerToken(): Promise<string | null> {
    if (this.customGetIdToken) {
      return this.customGetIdToken();
    }
    if (!this.activeSession) {
      return null;
    }
    if (
      this.activeSession.expiresAtMs &&
      Date.now() > this.activeSession.expiresAtMs - 30_000 &&
      this.activeSession.refreshToken
    ) {
      const refreshed = await this.refreshCurrentToken();
      if (refreshed) {
        return refreshed;
      }
    }
    return this.activeSession.idToken;
  }

  async request<T = unknown>(
    path: string,
    options: RequestInit & { skipAuth?: boolean } = {}
  ): Promise<StandardApiResponse<T>> {
    return this.executeRequest<T>(path, options, false);
  }

  private async executeRequest<T = unknown>(
    path: string,
    options: RequestInit & { skipAuth?: boolean },
    isRetryAfterRefresh: boolean
  ): Promise<StandardApiResponse<T>> {
    const { skipAuth, ...fetchOptions } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {})
    };

    if (!skipAuth) {
      const token = await this.resolveBearerToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const url = path.startsWith('http')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        ...fetchOptions,
        headers,
        signal: fetchOptions.signal ?? controller.signal
      });
      clearTimeout(timeoutId);

      const json = (await response.json().catch(() => ({}))) as StandardApiResponse<T>;

      if (response.status === 401 && !skipAuth && !isRetryAfterRefresh) {
        const refreshedToken = await this.refreshCurrentToken();
        if (refreshedToken) {
          return this.executeRequest<T>(path, options, true);
        }
        const reason =
          json.error?.message || 'Your session has expired or been revoked. Please sign in again.';
        this.clearSession();
        this.onSessionExpired?.(reason);
      }

      if (!response.ok) {
        const errObj = json.error ?? {
          code: `HTTP_${response.status}`,
          message: response.statusText || 'Request failed'
        };
        if (
          response.status === 403 &&
          !skipAuth &&
          (errObj.message.toLowerCase().includes('session') ||
            errObj.message.toLowerCase().includes('suspended') ||
            errObj.message.toLowerCase().includes('revoked'))
        ) {
          this.clearSession();
          this.onSessionExpired?.(errObj.message);
        }
        return {
          success: false,
          error: errObj
        };
      }

      return json;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'));
      return {
        success: false,
        error: {
          code: isAbort ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          message: isAbort
            ? `Request timed out after ${this.timeoutMs}ms.`
            : err instanceof Error
              ? err.message
              : 'Network connection error.'
        }
      };
    }
  }

  // ============================================================================
  // 1. AUTHENTICATION ENDPOINTS
  // ============================================================================
  async requestOtp(payload: {
    phoneE164: string;
    purpose: OtpPurpose;
  }): Promise<
    StandardApiResponse<{
      challengeId: string;
      expiresAt: string;
      demoOtpForTestingOnly?: string;
    }>
  > {
    return this.request('/api/v1/auth/request-otp', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload)
    });
  }

  async loginWithPhone(payload: {
    phoneE164: string;
    password: string;
  }): Promise<StandardApiResponse<ActiveAuthSession>> {
    const res = await this.request<{
      customToken: string;
      user: UserDocument;
      profile: UserProfileDocument | null;
      activeRoles: UserRoleDocument[];
    }>('/api/v1/auth/login-phone', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload)
    });

    if (!res.success || !res.data) {
      return {
        success: false,
        error: res.error
      };
    }

    try {
      const exchanged = await this.exchangeCustomTokenForIdToken(res.data.customToken);
      const session: ActiveAuthSession = {
        idToken: exchanged.idToken,
        refreshToken: exchanged.refreshToken,
        expiresAtMs: exchanged.expiresAtMs,
        user: res.data.user,
        profile: res.data.profile,
        activeRoles: res.data.activeRoles
      };
      this.setSession(session);
      return {
        success: true,
        data: session
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: err instanceof Error ? err.message : 'Token exchange failed'
        }
      };
    }
  }

  async activateCustomerAccount(payload: {
    phoneE164: string;
    otpCode: string;
    newPassword: string;
  }): Promise<StandardApiResponse<ActiveAuthSession>> {
    const res = await this.request<{
      customToken: string;
      user: UserDocument;
    }>('/api/v1/auth/activate-account', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload)
    });

    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }

    try {
      const exchanged = await this.exchangeCustomTokenForIdToken(res.data.customToken);
      const session: ActiveAuthSession = {
        idToken: exchanged.idToken,
        refreshToken: exchanged.refreshToken,
        expiresAtMs: exchanged.expiresAtMs,
        user: res.data.user,
        profile: null,
        activeRoles: []
      };
      this.setSession(session);
      const meRes = await this.getMe();
      if (meRes.success && meRes.data) {
        session.profile = meRes.data.profile;
        session.activeRoles = meRes.data.activeRoles;
        this.setSession({ ...session });
      }
      return { success: true, data: this.activeSession ?? session };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: err instanceof Error ? err.message : 'Token exchange failed'
        }
      };
    }
  }

  async activateFamilyAccount(payload: {
    phoneE164: string;
    otpCode: string;
    initialPassword: string;
    newPermanentPassword: string;
  }): Promise<
    StandardApiResponse<{
      session: ActiveAuthSession;
      activatedVehicleIds: string[];
    }>
  > {
    const res = await this.request<{
      customToken: string;
      user: UserDocument;
      activatedVehicleIds: string[];
    }>('/api/v1/auth/activate-family', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload)
    });

    if (!res.success || !res.data) {
      return { success: false, error: res.error };
    }

    try {
      const exchanged = await this.exchangeCustomTokenForIdToken(res.data.customToken);
      const session: ActiveAuthSession = {
        idToken: exchanged.idToken,
        refreshToken: exchanged.refreshToken,
        expiresAtMs: exchanged.expiresAtMs,
        user: res.data.user,
        profile: null,
        activeRoles: []
      };
      this.setSession(session);
      const meRes = await this.getMe();
      if (meRes.success && meRes.data) {
        session.profile = meRes.data.profile;
        session.activeRoles = meRes.data.activeRoles;
        this.setSession({ ...session });
      }
      return {
        success: true,
        data: {
          session: this.activeSession ?? session,
          activatedVehicleIds: res.data.activatedVehicleIds
        }
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'TOKEN_EXCHANGE_FAILED',
          message: err instanceof Error ? err.message : 'Token exchange failed'
        }
      };
    }
  }

  async resetPassword(payload: {
    phoneE164: string;
    otpCode: string;
    newPassword: string;
  }): Promise<StandardApiResponse<{ success: true }>> {
    return this.request('/api/v1/auth/reset-password', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload)
    });
  }

  async getMe(): Promise<
    StandardApiResponse<{
      user: UserDocument;
      profile: UserProfileDocument | null;
      activeRoles: UserRoleDocument[];
    }>
  > {
    return this.request('/api/v1/auth/me', { method: 'GET' });
  }

  async logout(): Promise<StandardApiResponse<{ loggedOut: true }>> {
    const res = await this.request<{ loggedOut: true }>('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
    this.clearSession();
    return res;
  }

  // ============================================================================
  // 2. MOBILE APPLICATION ENDPOINTS
  // ============================================================================
  async getMobileDashboard(): Promise<StandardApiResponse<MobileDashboardDTO>> {
    return this.request<MobileDashboardDTO>('/api/v1/mobile/dashboard', {
      method: 'GET'
    });
  }

  async getVehicleTelemetry(
    vehicleId: string,
    params?: { limit?: number; cursor?: string }
  ): Promise<StandardApiResponse<TelemetryDocument[]>> {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    const qs = search.toString();
    return this.request<TelemetryDocument[]>(
      `/api/v1/mobile/vehicles/${encodeURIComponent(vehicleId)}/telemetry${qs ? `?${qs}` : ''}`,
      { method: 'GET' }
    );
  }

  async inviteFamilyMember(payload: {
    vehicleId: string;
    familyMemberName: string;
    familyMemberPhoneE164: string;
    relationship: string;
    initialPassword: string;
    permissions: FamilyMemberPermissions;
  }): Promise<StandardApiResponse<{ membership: FamilyMembershipDocument }>> {
    return this.request('/api/v1/mobile/family/invite', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateFamilyMembership(
    membershipId: string,
    payload: {
      action: 'UPDATE_PERMISSIONS' | 'REVOKE';
      permissions?: FamilyMemberPermissions;
    }
  ): Promise<StandardApiResponse<FamilyMembershipDocument>> {
    return this.request(
      `/api/v1/mobile/family/${encodeURIComponent(membershipId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  }

  async assignOrRevokeDriver(payload: {
    vehicleId: string;
    driverPhoneE164: string;
    driverFullName: string;
    action: 'ASSIGN' | 'REVOKE';
  }): Promise<StandardApiResponse<VehicleDriverDocument>> {
    return this.request('/api/v1/mobile/drivers/assign', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async upsertEmergencyContact(payload: {
    vehicleId: string;
    name: string;
    phoneE164: string;
    relationship: string;
    priorityOrder: 1 | 2 | 3 | 4 | 5;
    notifyOnAccident?: boolean;
    notifyOnSos?: boolean;
    notifyOnOccupantAlert?: boolean;
  }): Promise<StandardApiResponse<EmergencyContactDocument>> {
    return this.request('/api/v1/mobile/emergency-contacts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async deleteEmergencyContact(
    contactId: string
  ): Promise<StandardApiResponse<{ deletedId: string }>> {
    return this.request(
      `/api/v1/mobile/emergency-contacts/${encodeURIComponent(contactId)}`,
      { method: 'DELETE' }
    );
  }

  async triggerManualSos(payload: {
    vehicleId: string;
    location: {
      lat: number;
      lng: number;
      accuracyMeters: number;
      roadSegmentSummary: string;
      jurisdictionCode: string;
    };
    isSimulated?: boolean;
  }): Promise<StandardApiResponse<IncidentDocument>> {
    return this.request('/api/v1/mobile/sos/trigger', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async respondToIncidentByCustomer(
    incidentId: string,
    payload: {
      action: 'CANCEL_FALSE_ALARM' | 'ACKNOWLEDGE_ALERT';
      note: string;
    }
  ): Promise<StandardApiResponse<IncidentDocument>> {
    return this.request(
      `/api/v1/mobile/incidents/${encodeURIComponent(incidentId)}/respond`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  async ackNotificationDelivered(
    notificationId: string
  ): Promise<StandardApiResponse<NotificationDocument>> {
    return this.request(
      `/api/v1/notifications/${encodeURIComponent(notificationId)}/ack-delivered`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  }

  async markNotificationRead(
    notificationId: string
  ): Promise<StandardApiResponse<NotificationDocument>> {
    return this.request(
      `/api/v1/notifications/${encodeURIComponent(notificationId)}/mark-read`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  }

  async updateUserProfile(payload: {
    fullName?: string;
    language?: string;
    notificationPreferences?: {
      pushEnabled: boolean;
      criticalAlertsOnly: boolean;
    };
    privacySettings?: {
      shareWithMedicalOnSos: boolean;
      shareWithPoliceOnSos: boolean;
    };
  }): Promise<StandardApiResponse<UserProfileDocument>> {
    return this.request('/api/v1/mobile/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async createSupportTicket(payload: {
    vehicleId?: string | null;
    category:
    | 'DEVICE_ISSUE'
    | 'ACCOUNT_RECOVERY'
    | 'REGISTRATION_CORRECTION'
    | 'GENERAL_INQUIRY';
    subject: string;
    description: string;
  }): Promise<StandardApiResponse<SupportTicketDocument>> {
    return this.request('/api/v1/mobile/support-tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // ============================================================================
  // 3. GOVERNMENT AUTHORITY PORTAL ENDPOINTS
  // ============================================================================
  async getAuthorityWorkspace(): Promise<
    StandardApiResponse<AuthorityWorkspaceDTO>
  > {
    return this.request('/api/v1/authority/workspace', { method: 'GET' });
  }

  async listAuthorityIncidents(
    authorityId: string,
    params?: { limit?: number; cursor?: string }
  ): Promise<StandardApiResponse<RedactedAuthorityIncidentView[]>> {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    const qs = search.toString();
    return this.request(
      `/api/v1/authority/${encodeURIComponent(authorityId)}/incidents${qs ? `?${qs}` : ''}`,
      { method: 'GET' }
    );
  }

  async inspectAuthorityIncident(
    authorityId: string,
    incidentId: string
  ): Promise<StandardApiResponse<RedactedAuthorityIncidentView>> {
    return this.request(
      `/api/v1/authority/${encodeURIComponent(authorityId)}/incidents/${encodeURIComponent(incidentId)}`,
      { method: 'GET' }
    );
  }

  async updateAuthorityIncident(
    authorityId: string,
    payload: {
      incidentId: string;
      newState:
      | IncidentLifecycleState
      | 'AUTHORITY_ACKNOWLEDGED'
      | 'DISPATCH_RECORDED_BY_AUTHORITY'
      | 'RESPONSE_CONFIRMED'
      | 'RESOLVED';
      note: string;
      assignedOfficerName?: string;
      dispatchReferenceCode?: string;
      visibility: 'ALL_AUTHORIZED' | 'AUTHORITY_INTERNAL' | 'CUSTOMER_VISIBLE';
    }
  ): Promise<
    StandardApiResponse<{
      incident: RedactedAuthorityIncidentView;
      updateRecord: IncidentUpdateDocument;
    }>
  > {
    return this.request(
      `/api/v1/authority/${encodeURIComponent(authorityId)}/incidents/update`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  // ============================================================================
  // 4. SHOWROOM & PARENT-COMPANY PORTAL ENDPOINTS
  // ============================================================================
  async getDealerWorkspace(): Promise<StandardApiResponse<DealerWorkspaceDTO>> {
    return this.request('/api/v1/dealer/workspace', { method: 'GET' });
  }

  async getCompanyOverview(companyId: string): Promise<
    StandardApiResponse<{
      company: CompanyDocument;
      showrooms: ShowroomDocument[];
      vehiclesCount: number;
      activeDevicesCount: number;
    }>
  > {
    return this.request(
      `/api/v1/company/${encodeURIComponent(companyId)}/overview`,
      { method: 'GET' }
    );
  }

  async updateShowroomStatus(
    companyId: string,
    showroomId: string,
    payload: {
      newStatus: 'ACTIVE' | 'SUSPENDED';
      reason: string;
    }
  ): Promise<StandardApiResponse<ShowroomDocument>> {
    return this.request(
      `/api/v1/company/${encodeURIComponent(companyId)}/showrooms/${encodeURIComponent(showroomId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  }

  async verifyCustomerShowroomOtp(payload: {
    phoneE164: string;
    otpCode: string;
  }): Promise<
    StandardApiResponse<{
      challengeId: string;
      phoneE164: string;
      verifiedAt: string | null;
    }>
  > {
    return this.request('/api/v1/dealer/customers/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async registerVehicleAndAssignDevice(payload: {
    showroomId: string;
    registrationNumber: string;
    vin: string;
    manufacturer: string;
    model: string;
    variant: string;
    manufacturingYear: number;
    color: string;
    fuelType: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID' | 'CNG';
    customerFullName: string;
    customerPhoneE164: string;
    customerEmail?: string | null;
    customerOtpChallengeId: string;
    assignedDeviceSerial: string;
  }): Promise<
    StandardApiResponse<{
      vehicle: VehicleDocument;
      ownership: VehicleOwnerDocument;
      deviceAssignment: DeviceAssignmentDocument;
    }>
  > {
    return this.request('/api/v1/dealer/vehicles/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async listShowroomVehicles(
    showroomId: string,
    params?: { limit?: number; cursor?: string }
  ): Promise<StandardApiResponse<VehicleDocument[]>> {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    const qs = search.toString();
    return this.request(
      `/api/v1/dealer/showrooms/${encodeURIComponent(showroomId)}/vehicles${qs ? `?${qs}` : ''}`,
      { method: 'GET' }
    );
  }

  async applyVehicleCorrection(
    vehicleId: string,
    payload: {
      color?: string;
      variant?: string;
      reason: string;
    }
  ): Promise<StandardApiResponse<VehicleDocument>> {
    return this.request(
      `/api/v1/dealer/vehicles/${encodeURIComponent(vehicleId)}/correction`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  }

  // ============================================================================
  // 5. VEERXCAPE SUPER-ADMIN CONSOLE ENDPOINTS
  // ============================================================================
  async getAdminOverview(): Promise<StandardApiResponse<AdminOverviewDTO>> {
    return this.request('/api/v1/admin/overview', { method: 'GET' });
  }

  async getAdminWorkspace(): Promise<StandardApiResponse<AdminWorkspaceDTO>> {
    return this.request('/api/v1/admin/workspace', { method: 'GET' });
  }

  async createCompanyTenant(payload: {
    brandName: string;
    oemCode: string;
    registrationNumber: string;
    headquartersAddress: string;
    contactEmail: string;
    contactPhone: string;
  }): Promise<
    StandardApiResponse<{
      organisation: unknown;
      company: CompanyDocument;
    }>
  > {
    return this.request('/api/v1/admin/companies', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async createShowroom(payload: {
    companyId: string;
    name: string;
    dealerCode: string;
    city: string;
    stateCode: string;
    address: string;
    contactPhone: string;
    contactEmail: string;
  }): Promise<StandardApiResponse<ShowroomDocument>> {
    return this.request('/api/v1/admin/showrooms', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async createAndVerifyAuthority(payload: {
    name: string;
    registrationNumber: string;
    department: AuthorityDepartment;
    jurisdictionState: string;
    jurisdictionDistrict: string;
    jurisdictionCode: string;
    contactControlRoomPhone: string;
    contactEmail: string;
  }): Promise<StandardApiResponse<AuthorityDocument>> {
    return this.request('/api/v1/admin/authorities', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateAuthorityVerification(
    authorityId: string,
    payload: {
      verificationStatus: 'VERIFIED' | 'SUSPENDED';
      reason?: string;
    }
  ): Promise<StandardApiResponse<AuthorityDocument>> {
    return this.request(
      `/api/v1/admin/authorities/${encodeURIComponent(authorityId)}/verify`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  }

  async assignScopedRole(payload: {
    targetUserId: string;
    role: UserRoleCode | string;
    scopeType: 'PLATFORM' | 'COMPANY' | 'SHOWROOM' | 'AUTHORITY' | 'VEHICLE';
    scopeId: string;
    companyId?: string | null;
    showroomId?: string | null;
    authorityId?: string | null;
    vehicleId?: string | null;
    department?: AuthorityDepartment | null;
    jurisdictionCode?: string | null;
  }): Promise<StandardApiResponse<UserRoleDocument>> {
    return this.request('/api/v1/admin/roles/assign', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async provisionDevice(payload: {
    serialNumber: string;
    imei: string;
    simIccid: string;
    firmwareVersion: string;
    allocatedCompanyId: string;
    allocatedShowroomId: string;
  }): Promise<
    StandardApiResponse<{
      device: DeviceDocument;
      provisioningSecretForFactoryFlashOnly: string;
    }>
  > {
    return this.request('/api/v1/admin/devices/provision', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async rotateDeviceKey(
    deviceId: string,
    payload?: { reason?: string }
  ): Promise<
    StandardApiResponse<{
      device: DeviceDocument;
      newKeyVersion: number;
      newSecretForFactoryReflashOnly: string;
    }>
  > {
    return this.request(
      `/api/v1/admin/devices/${encodeURIComponent(deviceId)}/rotate-key`,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
      }
    );
  }

  async revokeDevice(
    deviceId: string,
    payload: { reason: string }
  ): Promise<StandardApiResponse<DeviceDocument>> {
    return this.request(
      `/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  async suspendUserAccount(
    userId: string,
    payload: { reason: string }
  ): Promise<StandardApiResponse<UserDocument>> {
    return this.request(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/suspend`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  async reactivateUserAccount(
    userId: string,
    payload: { reason: string }
  ): Promise<StandardApiResponse<UserDocument>> {
    return this.request(
      `/api/v1/admin/users/${encodeURIComponent(userId)}/reactivate`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  async updateSystemConfiguration(
    configKey: string,
    payload: {
      value: Record<string, unknown>;
      reason?: string;
    }
  ): Promise<StandardApiResponse<SystemConfigurationDocument>> {
    return this.request(
      `/api/v1/admin/system-config/${encodeURIComponent(configKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
  }

  async retryFailedNotification(
    notificationId: string
  ): Promise<StandardApiResponse<NotificationDocument>> {
    return this.request(
      `/api/v1/admin/notifications/${encodeURIComponent(notificationId)}/retry`,
      {
        method: 'POST',
        body: JSON.stringify({})
      }
    );
  }

  async verifyAuditChain(): Promise<
    StandardApiResponse<AuditChainVerificationDTO>
  > {
    return this.request('/api/v1/admin/audit-logs/verify', { method: 'GET' });
  }

  // ============================================================================
  // 6. PUBLIC WEBSITE ENDPOINTS
  // ============================================================================
  async submitPublicContactInquiry(payload: {
    fullName: string;
    organisation?: string;
    email: string;
    inquiryType: 'SHOWROOM' | 'AUTHORITY' | 'CUSTOMER';
    message: string;
  }): Promise<
    StandardApiResponse<{
      ticketId: string;
      status: string;
      submittedAt: string;
    }>
  > {
    return this.request('/api/v1/public/contact', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify(payload)
    });
  }
}
