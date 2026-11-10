import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  Cpu,
  FileSearch,
  KeyRound,
  Link2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Slash,
  Users,
  WifiOff
} from 'lucide-react';
import { ALL_USER_ROLES } from '@veerxcape/shared-constants';
import type {
  AuthorityDepartment,
  UserRoleCode
} from '@veerxcape/shared-types';
import {
  VeerXcapeApiClient,
  VeerXcapeApiError,
  unwrapApiResponse,
  type AdminWorkspaceDTO
} from '@veerxcape/shared-services';
import {
  customerPhoneLoginSchema,
  roleAssignmentPayloadSchema
} from '@veerxcape/shared-validation';

type AdminTab =
  | 'RBAC_USERS'
  | 'TENANTS_AUTHORITIES'
  | 'DEVICE_PROVISIONING'
  | 'INCIDENTS_NOTIFICATIONS'
  | 'AUDIT_SYSTEM_CONFIG';

export function App(): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginPhone, setLoginPhone] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOfflineError, setIsOfflineError] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<AdminWorkspaceDTO | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('RBAC_USERS');

  // Role Assignment Form State
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] =
    useState<UserRoleCode>('SHOWROOM_MANAGER');
  const [scopeCompanyId, setScopeCompanyId] = useState<string>('');
  const [scopeShowroomId, setScopeShowroomId] = useState<string>('');
  const [scopeAuthorityId, setScopeAuthorityId] = useState<string>('');
  const [scopeJurisdictionCode, setScopeJurisdictionCode] =
    useState<string>('IN-UP-LKO');
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);
  const [userActionReason, setUserActionReason] = useState<string>(
    'Administrative compliance action recorded via Governance Console.'
  );

  // Company Creation Form State
  const [compBrandName, setCompBrandName] = useState<string>('');
  const [compOemCode, setCompOemCode] = useState<string>('');
  const [compRegNum, setCompRegNum] = useState<string>('');
  const [compHqAddress, setCompHqAddress] = useState<string>('');
  const [compContactEmail, setCompContactEmail] = useState<string>('');
  const [compContactPhone, setCompContactPhone] = useState<string>('');

  // Showroom Creation Form State
  const [shCompanyId, setShCompanyId] = useState<string>('');
  const [shName, setShName] = useState<string>('');
  const [shDealerCode, setShDealerCode] = useState<string>('');
  const [shCity, setShCity] = useState<string>('New Delhi');
  const [shStateCode, setShStateCode] = useState<string>('DL');
  const [shAddress, setShAddress] = useState<string>('');
  const [shPhone, setShPhone] = useState<string>('');
  const [shEmail, setShEmail] = useState<string>('');

  // Authority Creation Form State
  const [authName, setAuthName] = useState<string>('');
  const [authRegNumber, setAuthRegNumber] = useState<string>('GOV-AUTH-2026');
  const [authDepartment, setAuthDepartment] =
    useState<AuthorityDepartment>('MEDICAL');
  const [authState, setAuthState] = useState<string>('Uttar Pradesh');
  const [authDistrict, setAuthDistrict] = useState<string>('Lucknow');
  const [authJurisdictionCode, setAuthJurisdictionCode] =
    useState<string>('IN-UP-LKO');
  const [authPhone, setAuthPhone] = useState<string>('');
  const [authEmail, setAuthEmail] = useState<string>('');

  // Device Provisioning Form State
  const [newSerialNumber, setNewSerialNumber] = useState<string>('');
  const [newImei, setNewImei] = useState<string>('');
  const [newSimIccid, setNewSimIccid] = useState<string>('8991101200003204510');
  const [newFirmware, setNewFirmware] = useState<string>('v2.4.1-stm32u575');
  const [allocatedCompanyId, setAllocatedCompanyId] = useState<string>('');
  const [allocatedShowroomId, setAllocatedShowroomId] = useState<string>('');
  const [provisionSecretBanner, setProvisionSecretBanner] = useState<
    string | null
  >(null);
  const [deviceActionReason, setDeviceActionReason] = useState<string>(
    'Routine cryptographic key lifecycle governance.'
  );

  // System Configuration Form State
  const [configKeyInput, setConfigKeyInput] = useState<string>(
    'SOS_FALSE_ALARM_WINDOW_SECONDS'
  );
  const [configValueInput, setConfigValueInput] = useState<string>(
    '{"windowSeconds": 20}'
  );
  const [configReasonInput, setConfigReasonInput] = useState<string>(
    'Approved safety governance update.'
  );

  const apiClient = useMemo(
    () =>
      new VeerXcapeApiClient({
        onSessionExpired: (reason) => {
          setIsAuthenticated(false);
          setWorkspace(null);
          setAuthError(reason);
        }
      }),
    []
  );

  const handleApiError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof VeerXcapeApiError) {
      if (err.isNetworkError || err.isTimeout) {
        setIsOfflineError(true);
      }
      const msg = `${err.message} (${err.code})`;
      setErrorBanner(msg);
      return msg;
    }
    const msg = err instanceof Error ? err.message : fallback;
    setErrorBanner(msg);
    return msg;
  }, []);

  const loadAdminWorkspace = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);
    setIsOfflineError(false);
    try {
      const ws = unwrapApiResponse(await apiClient.getAdminWorkspace());
      setWorkspace(ws);
      if (ws.companies.length > 0) {
        setShCompanyId((prev) => prev || ws.companies[0].id);
        setScopeCompanyId((prev) => prev || ws.companies[0].id);
        setAllocatedCompanyId((prev) => prev || ws.companies[0].id);
      }
      if (ws.showrooms.length > 0) {
        setScopeShowroomId((prev) => prev || ws.showrooms[0].id);
        setAllocatedShowroomId((prev) => prev || ws.showrooms[0].id);
      }
      if (ws.authorities.length > 0) {
        setScopeAuthorityId((prev) => prev || ws.authorities[0].id);
      }
      if (ws.users.length > 0) {
        setTargetUserId((prev) => prev || ws.users[0].uid);
      }
    } catch (err) {
      handleApiError(err, 'Failed to load VeerXcape Admin workspace.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, handleApiError]);

  useEffect(() => {
    if (apiClient.hasActiveSession() && !isAuthenticated) {
      setIsAuthenticated(true);
      void loadAdminWorkspace();
    }
  }, [apiClient, isAuthenticated, loadAdminWorkspace]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setErrorBanner(null);

    const parsed = customerPhoneLoginSchema.safeParse({
      phoneE164: loginPhone.trim(),
      password: loginPassword
    });
    if (!parsed.success) {
      setAuthError(
        parsed.error.issues[0]?.message ?? 'Invalid login credentials.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const session = unwrapApiResponse(
        await apiClient.loginWithPhone(parsed.data)
      );
      const allowed = session.activeRoles.some((r) =>
        [
          'VEERXCAPE_SUPER_ADMIN',
          'VEERXCAPE_ADMIN',
          'VEERXCAPE_SUPPORT'
        ].includes(r.role)
      );
      if (!allowed) {
        await apiClient.logout();
        setAuthError(
          'Access Denied: This account does not hold a VeerXcape platform administrator role.'
        );
        return;
      }
      setIsAuthenticated(true);
      setLoginPassword('');
      await loadAdminWorkspace();
    } catch (err) {
      const msg = handleApiError(err, 'Administrator sign-in failed.');
      setAuthError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await apiClient.logout();
    } finally {
      setIsAuthenticated(false);
      setWorkspace(null);
      setIsLoading(false);
    }
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleFeedback(null);
    setErrorBanner(null);

    const isCompanyScope = selectedRole === 'COMPANY_ADMIN';
    const isShowroomScope =
      selectedRole === 'SHOWROOM_MANAGER' || selectedRole === 'SHOWROOM_STAFF';
    const isAuthorityScope =
      selectedRole === 'AUTHORITY_MEDICAL' ||
      selectedRole === 'AUTHORITY_POLICE' ||
      selectedRole === 'AUTHORITY_ROAD';

    const scopeType = isCompanyScope
      ? 'COMPANY'
      : isShowroomScope
        ? 'SHOWROOM'
        : isAuthorityScope
          ? 'AUTHORITY'
          : 'PLATFORM';

    const scopeId = isCompanyScope
      ? scopeCompanyId.trim()
      : isShowroomScope
        ? scopeShowroomId.trim()
        : isAuthorityScope
          ? scopeAuthorityId.trim()
          : 'PLATFORM';

    const department: AuthorityDepartment | null =
      selectedRole === 'AUTHORITY_MEDICAL'
        ? 'MEDICAL'
        : selectedRole === 'AUTHORITY_POLICE'
          ? 'POLICE'
          : selectedRole === 'AUTHORITY_ROAD'
            ? 'ROAD'
            : null;

    const payload = {
      targetUserId: targetUserId.trim(),
      role: selectedRole,
      scopeType,
      scopeId,
      companyId:
        isCompanyScope || isShowroomScope ? scopeCompanyId.trim() : null,
      showroomId: isShowroomScope ? scopeShowroomId.trim() : null,
      authorityId: isAuthorityScope ? scopeAuthorityId.trim() : null,
      department,
      jurisdictionCode: isAuthorityScope ? scopeJurisdictionCode.trim() : null
    };

    const parsed = roleAssignmentPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      setRoleFeedback(
        `Validation failed: ${parsed.error.issues[0]?.message ?? 'Check scope fields.'}`
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = unwrapApiResponse(
        await apiClient.assignScopedRole(parsed.data)
      );
      setRoleFeedback(
        `Role ${res.role} assigned to user ${res.userId} (Assignment ID: ${res.id}).`
      );
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to assign scoped role.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUserAccountStatus = async (
    uid: string,
    currentStatus: string
  ) => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      if (currentStatus === 'SUSPENDED') {
        unwrapApiResponse(
          await apiClient.reactivateUserAccount(uid, {
            reason: userActionReason
          })
        );
        setStatusBanner(`User account ${uid} reactivated.`);
      } else {
        unwrapApiResponse(
          await apiClient.suspendUserAccount(uid, {
            reason: userActionReason
          })
        );
        setStatusBanner(
          `User account ${uid} suspended and sessions invalidated.`
        );
      }
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to update user account status.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const created = unwrapApiResponse(
        await apiClient.createCompanyTenant({
          brandName: compBrandName.trim(),
          oemCode: compOemCode.trim().toUpperCase(),
          registrationNumber: compRegNum.trim(),
          headquartersAddress: compHqAddress.trim(),
          contactEmail: compContactEmail.trim(),
          contactPhone: compContactPhone.trim()
        })
      );
      setStatusBanner(
        `Company tenant ${created.company.brandName} (${created.company.id}) created.`
      );
      setCompBrandName('');
      setCompOemCode('');
      setCompRegNum('');
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to create company tenant.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateShowroom = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const created = unwrapApiResponse(
        await apiClient.createShowroom({
          companyId: shCompanyId.trim(),
          name: shName.trim(),
          dealerCode: shDealerCode.trim().toUpperCase(),
          city: shCity.trim(),
          stateCode: shStateCode.trim().toUpperCase(),
          address: shAddress.trim(),
          contactPhone: shPhone.trim(),
          contactEmail: shEmail.trim()
        })
      );
      setStatusBanner(
        `Showroom ${created.name} (${created.dealerCode}) created and approved.`
      );
      setShName('');
      setShDealerCode('');
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to create showroom.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAuthority = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const created = unwrapApiResponse(
        await apiClient.createAndVerifyAuthority({
          name: authName.trim(),
          registrationNumber: authRegNumber.trim(),
          department: authDepartment,
          jurisdictionState: authState.trim(),
          jurisdictionDistrict: authDistrict.trim(),
          jurisdictionCode: authJurisdictionCode.trim().toUpperCase(),
          contactControlRoomPhone: authPhone.trim(),
          contactEmail: authEmail.trim()
        })
      );
      setStatusBanner(
        `Authority ${created.name} (${created.id}) onboarded and verified.`
      );
      setAuthName('');
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to create authority.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAuthorityVerification = async (
    authorityId: string,
    currentStatus: string
  ) => {
    setIsLoading(true);
    setErrorBanner(null);
    const nextStatus = currentStatus === 'VERIFIED' ? 'SUSPENDED' : 'VERIFIED';
    try {
      unwrapApiResponse(
        await apiClient.updateAuthorityVerification(authorityId, {
          verificationStatus: nextStatus,
          reason: `Governance update to ${nextStatus} via Super-Admin Console.`
        })
      );
      setStatusBanner(
        `Authority ${authorityId} verification status updated to ${nextStatus}.`
      );
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to update authority verification status.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProvisionDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionSecretBanner(null);
    setErrorBanner(null);

    setIsLoading(true);
    try {
      const res = unwrapApiResponse(
        await apiClient.provisionDevice({
          serialNumber: newSerialNumber.trim().toUpperCase(),
          imei: newImei.trim(),
          simIccid: newSimIccid.trim(),
          firmwareVersion: newFirmware.trim(),
          allocatedCompanyId: allocatedCompanyId.trim(),
          allocatedShowroomId: allocatedShowroomId.trim()
        })
      );
      setProvisionSecretBanner(
        `Provisioned ${res.device.id} (${res.device.serialNumber}). One-Time Factory HMAC Secret: ${res.oneTimeProvisioningHmacSecretHex}`
      );
      setNewSerialNumber('');
      setNewImei('');
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Device provisioning failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotateDeviceKey = async (deviceId: string) => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const res = unwrapApiResponse(
        await apiClient.rotateDeviceKey(deviceId, {
          reason: deviceActionReason
        })
      );
      setProvisionSecretBanner(
        `Key rotated for ${deviceId} (Key Version v${res.newSecretVersion}). New One-Time HMAC Secret: ${res.oneTimeNewHmacSecretHex}`
      );
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to rotate device HMAC key.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      unwrapApiResponse(
        await apiClient.revokeDevice(deviceId, { reason: deviceActionReason })
      );
      setStatusBanner(`Device ${deviceId} permanently revoked.`);
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to revoke device.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryNotification = async (notificationId: string) => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const updated = unwrapApiResponse(
        await apiClient.retryFailedNotification(notificationId)
      );
      setStatusBanner(
        `Notification ${updated.id} retried (Status: ${updated.status}, Retry #${updated.retryCount}).`
      );
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to retry notification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAuditChain = async () => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const check = unwrapApiResponse(await apiClient.verifyAuditChain());
      setStatusBanner(
        check.valid
          ? `Cryptographic SHA-256 Audit Chain Verified (${check.checkedCount} entries intact).`
          : `Audit Chain Integrity Failure at ${check.brokenAtLogId ?? 'unknown'}!`
      );
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to verify audit chain.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSystemConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorBanner(null);
    try {
      let parsedVal: Record<string, unknown> = { value: configValueInput };
      try {
        const candidate = JSON.parse(configValueInput) as unknown;
        if (candidate && typeof candidate === 'object') {
          parsedVal = candidate as Record<string, unknown>;
        }
      } catch {
        parsedVal = { value: configValueInput };
      }
      unwrapApiResponse(
        await apiClient.updateSystemConfiguration(configKeyInput.trim(), {
          value: parsedVal,
          reason: configReasonInput.trim()
        })
      );
      setStatusBanner(
        `System configuration key "${configKeyInput.trim()}" updated and audited.`
      );
      await loadAdminWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to update system configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-white">
                VeerXcape Super-Admin & Governance Console
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                12-Role RBAC, STM32U575 Provisioning & SHA-256 Audit Ledger
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex flex-wrap items-center gap-2">
              {workspace && (
                <div
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                    workspace.auditVerification.valid
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <Link2 className="h-4 w-4" />
                  <span>
                    SHA-256 Chain:{' '}
                    {workspace.auditVerification.valid
                      ? `VALID (${workspace.auditVerification.checkedCount})`
                      : 'TAMPER DETECTED'}
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={isLoading}
                onClick={() => void loadAdminWorkspace()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto px-6 pt-3 space-y-2">
        {isOfflineError && (
          <div
            role="alert"
            className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-amber-400" />
              <span>Backend connection interrupted.</span>
            </div>
            <button
              type="button"
              onClick={() => void loadAdminWorkspace()}
              className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold"
            >
              Retry
            </button>
          </div>
        )}
        {errorBanner && (
          <div
            role="alert"
            className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {statusBanner && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {!isAuthenticated ? (
        <main className="flex-1 max-w-md w-full mx-auto px-6 py-12 flex items-center">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">
                  Platform Administrator Sign In
                </h1>
                <p className="text-xs text-slate-400">
                  Authorized Super-Admin, Admin & Support Roles Only
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-login-phone"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Administrator Phone (E.164)
                </label>
                <input
                  id="admin-login-phone"
                  type="text"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="+919800000001"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-login-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Password
                </label>
                <input
                  id="admin-login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              {authError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200"
                >
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm"
              >
                {isLoading ? 'Signing In...' : 'Sign In to Governance Console'}
              </button>
            </form>
          </div>
        </main>
      ) : (
        <>
          <nav className="border-b border-slate-800 bg-slate-900/60 px-6 py-2.5 mt-2">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
              {(
                [
                  {
                    id: 'RBAC_USERS',
                    label: '1. Users & 12-Role RBAC Governance',
                    icon: Users
                  },
                  {
                    id: 'TENANTS_AUTHORITIES',
                    label: '2. Companies, Showrooms & Authorities',
                    icon: Building2
                  },
                  {
                    id: 'DEVICE_PROVISIONING',
                    label: '3. STM32U575 Provisioning & Keys',
                    icon: Cpu
                  },
                  {
                    id: 'INCIDENTS_NOTIFICATIONS',
                    label: '4. Incidents & Notification Retry',
                    icon: Bell
                  },
                  {
                    id: 'AUDIT_SYSTEM_CONFIG',
                    label: '5. SHA-256 Audit Ledger & System Config',
                    icon: FileSearch
                  }
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-300 border border-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
            {activeTab === 'RBAC_USERS' && (
              <section className="space-y-6">
                {workspace && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <span className="text-xs text-slate-400">
                        Total Users
                      </span>
                      <p className="text-2xl font-bold text-white mt-1">
                        {workspace.overview.totalUsers}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <span className="text-xs text-slate-400">
                        Registered Vehicles
                      </span>
                      <p className="text-2xl font-bold text-emerald-300 mt-1">
                        {workspace.overview.totalVehicles}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <span className="text-xs text-slate-400">
                        Active STM32U575 Devices
                      </span>
                      <p className="text-2xl font-bold text-sky-300 mt-1">
                        {workspace.overview.activeDevices}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                      <span className="text-xs text-slate-400">
                        Verified Authorities
                      </span>
                      <p className="text-2xl font-bold text-amber-300 mt-1">
                        {workspace.overview.verifiedAuthorities}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h1 className="text-lg font-bold text-white">
                      Assign Scoped Role
                    </h1>
                    <form onSubmit={handleAssignRole} className="space-y-3">
                      <input
                        type="text"
                        value={targetUserId}
                        onChange={(e) => setTargetUserId(e.target.value)}
                        placeholder="Target User UID"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                      />
                      <select
                        value={selectedRole}
                        onChange={(e) =>
                          setSelectedRole(e.target.value as UserRoleCode)
                        }
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-amber-300 font-mono"
                      >
                        {ALL_USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={scopeCompanyId}
                        onChange={(e) => setScopeCompanyId(e.target.value)}
                        placeholder="Scoped Company ID (if applicable)"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                      />
                      <input
                        type="text"
                        value={scopeShowroomId}
                        onChange={(e) => setScopeShowroomId(e.target.value)}
                        placeholder="Scoped Showroom ID (if applicable)"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                      />
                      <input
                        type="text"
                        value={scopeAuthorityId}
                        onChange={(e) => setScopeAuthorityId(e.target.value)}
                        placeholder="Scoped Authority ID (if applicable)"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                      />
                      <input
                        type="text"
                        value={scopeJurisdictionCode}
                        onChange={(e) =>
                          setScopeJurisdictionCode(e.target.value)
                        }
                        placeholder="Jurisdiction Code (e.g., IN-UP-LKO)"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                      />
                      {roleFeedback && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                          {roleFeedback}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                      >
                        Assign Scoped Role
                      </button>
                    </form>
                  </div>

                  <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-white">
                        Platform User Accounts ({workspace?.users.length ?? 0})
                      </h2>
                      <input
                        type="text"
                        value={userActionReason}
                        onChange={(e) => setUserActionReason(e.target.value)}
                        placeholder="Reason for suspend/reactivate"
                        className="w-60 rounded bg-slate-950 border border-slate-800 px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="space-y-2.5 max-h-96 overflow-y-auto">
                      {(workspace?.users ?? []).map((u) => (
                        <div
                          key={u.uid}
                          className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <span className="font-mono font-bold text-white">
                              {u.phoneE164}
                            </span>{' '}
                            <span className="font-mono text-amber-300">
                              [{u.primaryRole}]
                            </span>{' '}
                            <span className="text-slate-400">
                              • {u.status} • sv:{u.sessionVersion}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setTargetUserId(u.uid)}
                              className="px-2.5 py-1 rounded bg-slate-800 text-slate-200"
                            >
                              Select
                            </button>
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() =>
                                void handleToggleUserAccountStatus(
                                  u.uid,
                                  u.status
                                )
                              }
                              className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 font-semibold"
                            >
                              {u.status === 'SUSPENDED'
                                ? 'Reactivate'
                                : 'Suspend'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'TENANTS_AUTHORITIES' && (
              <section className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <form
                    onSubmit={handleCreateCompany}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                  >
                    <h2 className="text-sm font-bold text-white">
                      Onboard Parent Company Tenant
                    </h2>
                    <input
                      type="text"
                      required
                      value={compBrandName}
                      onChange={(e) => setCompBrandName(e.target.value)}
                      placeholder="Brand Name"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={compOemCode}
                      onChange={(e) => setCompOemCode(e.target.value)}
                      placeholder="OEM Code"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={compRegNum}
                      onChange={(e) => setCompRegNum(e.target.value)}
                      placeholder="Registration Number"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={compHqAddress}
                      onChange={(e) => setCompHqAddress(e.target.value)}
                      placeholder="Headquarters Address"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={compContactPhone}
                      onChange={(e) => setCompContactPhone(e.target.value)}
                      placeholder="Contact Phone (+91...)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="email"
                      required
                      value={compContactEmail}
                      onChange={(e) => setCompContactEmail(e.target.value)}
                      placeholder="Contact Email"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                    >
                      Create Company Tenant
                    </button>
                  </form>

                  <form
                    onSubmit={handleCreateShowroom}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                  >
                    <h2 className="text-sm font-bold text-white">
                      Onboard & Approve Showroom Branch
                    </h2>
                    <input
                      type="text"
                      required
                      value={shCompanyId}
                      onChange={(e) => setShCompanyId(e.target.value)}
                      placeholder="Parent Company ID"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={shName}
                      onChange={(e) => setShName(e.target.value)}
                      placeholder="Showroom Name"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={shDealerCode}
                      onChange={(e) => setShDealerCode(e.target.value)}
                      placeholder="Dealer Code"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={shCity}
                      onChange={(e) => setShCity(e.target.value)}
                      placeholder="City"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={shStateCode}
                      onChange={(e) => setShStateCode(e.target.value)}
                      placeholder="State Code (DL)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={shAddress}
                      onChange={(e) => setShAddress(e.target.value)}
                      placeholder="Street Address"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={shPhone}
                      onChange={(e) => setShPhone(e.target.value)}
                      placeholder="Showroom Phone (+91...)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="email"
                      required
                      value={shEmail}
                      onChange={(e) => setShEmail(e.target.value)}
                      placeholder="Showroom Email"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                    >
                      Approve Showroom Branch
                    </button>
                  </form>

                  <form
                    onSubmit={handleCreateAuthority}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
                  >
                    <h2 className="text-sm font-bold text-white">
                      Onboard & Verify Authority Unit
                    </h2>
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="Authority Unit Name"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={authRegNumber}
                      onChange={(e) => setAuthRegNumber(e.target.value)}
                      placeholder="Registration Number"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <select
                      value={authDepartment}
                      onChange={(e) =>
                        setAuthDepartment(e.target.value as AuthorityDepartment)
                      }
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    >
                      <option value="MEDICAL">MEDICAL (108)</option>
                      <option value="POLICE">POLICE (112)</option>
                      <option value="ROAD">ROAD (NHAI)</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={authJurisdictionCode}
                      onChange={(e) => setAuthJurisdictionCode(e.target.value)}
                      placeholder="Jurisdiction Code (IN-UP-LKO)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={authState}
                      onChange={(e) => setAuthState(e.target.value)}
                      placeholder="State"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={authDistrict}
                      onChange={(e) => setAuthDistrict(e.target.value)}
                      placeholder="District"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      required
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="Control Room Phone (+91...)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="Authority Email"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                    >
                      Create & Verify Authority
                    </button>
                  </form>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-white">
                    Government Authorities ({workspace?.authorities.length ?? 0}
                    )
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(workspace?.authorities ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-amber-300">
                            {a.department}
                          </span>
                          <span className="font-bold text-emerald-300">
                            {a.verificationStatus}
                          </span>
                        </div>
                        <p className="font-bold text-white">{a.name}</p>
                        <p className="text-slate-400 font-mono">
                          {a.id} • {a.jurisdictionCode}
                        </p>
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() =>
                            void handleToggleAuthorityVerification(
                              a.id,
                              a.verificationStatus
                            )
                          }
                          className="w-full py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-semibold"
                        >
                          {a.verificationStatus === 'VERIFIED'
                            ? 'Suspend Authority'
                            : 'Verify Authority'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'DEVICE_PROVISIONING' && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h1 className="text-xl font-bold text-white">
                    Provision STM32U575 Unit
                  </h1>
                  <form onSubmit={handleProvisionDevice} className="space-y-3">
                    <input
                      type="text"
                      required
                      value={newSerialNumber}
                      onChange={(e) => setNewSerialNumber(e.target.value)}
                      placeholder="Serial (VX-STM32U575-0099)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={newImei}
                      onChange={(e) => setNewImei(e.target.value)}
                      placeholder="15-Digit IMEI (359881092340099)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={newSimIccid}
                      onChange={(e) => setNewSimIccid(e.target.value)}
                      placeholder="19-Digit SIM ICCID"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={newFirmware}
                      onChange={(e) => setNewFirmware(e.target.value)}
                      placeholder="Firmware Version"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={allocatedCompanyId}
                      onChange={(e) => setAllocatedCompanyId(e.target.value)}
                      placeholder="Allocated Company ID"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={allocatedShowroomId}
                      onChange={(e) => setAllocatedShowroomId(e.target.value)}
                      placeholder="Allocated Showroom ID"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />

                    {provisionSecretBanner && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 font-mono break-all">
                        {provisionSecretBanner}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                    >
                      Provision Device & Issue HMAC Secret
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-white">
                      STM32U575 Device Registry (
                      {workspace?.devices.length ?? 0})
                    </h2>
                    <input
                      type="text"
                      value={deviceActionReason}
                      onChange={(e) => setDeviceActionReason(e.target.value)}
                      placeholder="Reason for key rotation / revocation"
                      className="w-64 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-3 max-h-[420px] overflow-y-auto">
                    {(workspace?.devices ?? []).map((d) => (
                      <div
                        key={d.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-amber-300">
                            {d.serialNumber}
                          </span>{' '}
                          <span className="text-slate-400">
                            ({d.id} • {d.status} • v{d.secretVersion})
                          </span>
                        </div>
                        {d.status !== 'REVOKED' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => void handleRotateDeviceKey(d.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-semibold"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Rotate Key
                            </button>
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => void handleRevokeDevice(d.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-rose-500/15 text-rose-300 font-semibold"
                            >
                              <Slash className="h-3.5 w-3.5" />
                              Revoke
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'INCIDENTS_NOTIFICATIONS' && (
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Activity className="h-4 w-4 text-rose-400" />
                    Platform Incidents ({workspace?.incidents.length ?? 0})
                  </h2>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {(workspace?.incidents ?? []).map((inc) => (
                      <div
                        key={inc.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                      >
                        <span className="font-mono font-bold text-amber-300">
                          {inc.id} ({inc.severity})
                        </span>{' '}
                        — <span>{inc.lifecycleState}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-400" />
                    Notifications & Retry (
                    {workspace?.notifications.length ?? 0})
                  </h2>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {(workspace?.notifications ?? []).map((n) => (
                      <div
                        key={n.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="font-mono font-bold text-white">
                            {n.id}
                          </span>{' '}
                          <span className="text-amber-300">
                            [{n.status} • Retries: {n.retryCount}]
                          </span>
                          <p className="text-slate-400 mt-0.5">{n.title}</p>
                        </div>
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleRetryNotification(n.id)}
                          className="px-3 py-1.5 rounded bg-amber-500/20 text-amber-200 font-semibold"
                        >
                          Retry
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'AUDIT_SYSTEM_CONFIG' && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Settings className="h-4 w-4 text-amber-400" />
                    System Configuration Governance
                  </h2>
                  <form onSubmit={handleSaveSystemConfig} className="space-y-3">
                    <input
                      type="text"
                      value={configKeyInput}
                      onChange={(e) => setConfigKeyInput(e.target.value)}
                      placeholder="Config Key"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      value={configValueInput}
                      onChange={(e) => setConfigValueInput(e.target.value)}
                      placeholder='{"windowSeconds": 20}'
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      value={configReasonInput}
                      onChange={(e) => setConfigReasonInput(e.target.value)}
                      placeholder="Reason"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                    >
                      Update System Config
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">
                      SHA-256 Audit Ledger ({workspace?.auditLogs.length ?? 0})
                    </h2>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => void handleVerifyAuditChain()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
                    >
                      Verify SHA-256 Chain
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-80 overflow-y-auto">
                    {(workspace?.auditLogs ?? []).map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-amber-300">
                            #{entry.sequenceIndex} {entry.action}
                          </span>
                          <span className="font-mono text-slate-400">
                            {entry.actorRole}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-emerald-400 truncate">
                          hash: {entry.entryHash} (prev: {entry.prevAuditHash})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
