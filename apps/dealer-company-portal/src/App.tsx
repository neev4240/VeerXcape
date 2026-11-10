import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Car,
  CheckCircle2,
  ClipboardList,
  Edit3,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Store,
  Users,
  WifiOff,
  XCircle
} from 'lucide-react';
import {
  VeerXcapeApiClient,
  VeerXcapeApiError,
  unwrapApiResponse,
  type DealerWorkspaceDTO
} from '@veerxcape/shared-services';
import {
  customerPhoneLoginSchema,
  phoneE164Schema,
  showroomVehicleRegistrationSchema
} from '@veerxcape/shared-validation';

type PortalRoleMode = 'COMPANY_ADMIN' | 'SHOWROOM_MANAGER' | 'SHOWROOM_STAFF';
type PortalTab =
  | 'OVERVIEW_SHOWROOMS'
  | 'NINE_STEP_ONBOARDING'
  | 'SHOWROOM_VEHICLES_DEVICES'
  | 'STAFF_AUDIT';

export function App(): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginPhone, setLoginPhone] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOfflineError, setIsOfflineError] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<DealerWorkspaceDTO | null>(null);
  const [roleMode, setRoleMode] = useState<PortalRoleMode>('SHOWROOM_MANAGER');
  const [activeTab, setActiveTab] = useState<PortalTab>('NINE_STEP_ONBOARDING');
  const [activeShowroomId, setActiveShowroomId] = useState<string>('');

  // 9-Step Showroom Vehicle Registration Wizard State
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [customerFullName, setCustomerFullName] = useState<string>('');
  const [customerPhoneE164, setCustomerPhoneE164] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [otpChallengeId, setOtpChallengeId] = useState<string>('');
  const [otpCodeInput, setOtpCodeInput] = useState<string>('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [isCustomerOtpVerified, setIsCustomerOtpVerified] =
    useState<boolean>(false);

  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [vin, setVin] = useState<string>('');
  const [manufacturer, setManufacturer] = useState<string>('Tata Motors');
  const [model, setModel] = useState<string>('Safari');
  const [variant, setVariant] = useState<string>('Accomplished+ Dark');
  const [manufacturingYear, setManufacturingYear] = useState<number>(2026);
  const [color, setColor] = useState<string>('Cosmic Gold');
  const [fuelType, setFuelType] = useState<
    'PETROL' | 'DIESEL' | 'EV' | 'CNG' | 'HYBRID'
  >('DIESEL');
  const [assignedDeviceSerial, setAssignedDeviceSerial] = useState<string>('');

  const [checkPowerVerified, setCheckPowerVerified] = useState<boolean>(true);
  const [checkGnssLockVerified, setCheckGnssLockVerified] =
    useState<boolean>(true);
  const [checkGsmSignalVerified, setCheckGsmSignalVerified] =
    useState<boolean>(true);
  const [checkImuCalibrated, setCheckImuCalibrated] = useState<boolean>(true);

  const [wizardFeedback, setWizardFeedback] = useState<{
    type: 'SUCCESS' | 'ERROR';
    message: string;
  } | null>(null);

  // Permitted Vehicle Record Correction State
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [correctionColor, setCorrectionColor] = useState<string>('');
  const [correctionVariant, setCorrectionVariant] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');

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

  const loadDealerWorkspace = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);
    setIsOfflineError(false);
    try {
      const ws = unwrapApiResponse(await apiClient.getDealerWorkspace());
      setWorkspace(ws);

      const session = apiClient.getSession();
      const primaryRole = session?.activeRoles.find((r) =>
        ['COMPANY_ADMIN', 'SHOWROOM_MANAGER', 'SHOWROOM_STAFF'].includes(r.role)
      )?.role as PortalRoleMode | undefined;
      if (primaryRole) {
        setRoleMode(primaryRole);
      }

      if (ws.showrooms.length > 0) {
        setActiveShowroomId((prev) =>
          ws.showrooms.some((s) => s.id === prev) ? prev : ws.showrooms[0].id
        );
      }

      const availableDev = ws.devices.find(
        (d) =>
          (d.status === 'PROVISIONED' || d.status === 'IN_INVENTORY') &&
          !d.assignedVehicleId
      );
      if (availableDev) {
        setAssignedDeviceSerial((prev) => prev || availableDev.serialNumber);
      }
    } catch (err) {
      handleApiError(err, 'Unable to load showroom/company workspace.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, handleApiError]);

  useEffect(() => {
    if (apiClient.hasActiveSession() && !isAuthenticated) {
      setIsAuthenticated(true);
      void loadDealerWorkspace();
    }
  }, [apiClient, isAuthenticated, loadDealerWorkspace]);

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
          'COMPANY_ADMIN',
          'SHOWROOM_MANAGER',
          'SHOWROOM_STAFF',
          'VEERXCAPE_ADMIN',
          'VEERXCAPE_SUPER_ADMIN'
        ].includes(r.role)
      );
      if (!allowed) {
        await apiClient.logout();
        setAuthError(
          'Access Denied: This account does not have Showroom or Parent-Company authorization.'
        );
        return;
      }
      setIsAuthenticated(true);
      setLoginPassword('');
      await loadDealerWorkspace();
    } catch (err) {
      const msg = handleApiError(err, 'Dealer/Company sign-in failed.');
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

  const visibleShowrooms = useMemo(() => {
    const all = workspace?.showrooms ?? [];
    if (roleMode === 'COMPANY_ADMIN') return all;
    return all.filter((s) => s.id === activeShowroomId);
  }, [workspace, roleMode, activeShowroomId]);

  const activeShowroom = useMemo(
    () =>
      (workspace?.showrooms ?? []).find((s) => s.id === activeShowroomId) ??
      workspace?.showrooms[0] ??
      null,
    [workspace, activeShowroomId]
  );

  const visibleVehicles = useMemo(() => {
    const all = workspace?.vehicles ?? [];
    if (roleMode === 'COMPANY_ADMIN') return all;
    return all.filter((v) => v.registeredByShowroomId === activeShowroomId);
  }, [workspace, roleMode, activeShowroomId]);

  const availableDevices = useMemo(() => {
    return (workspace?.devices ?? []).filter(
      (d) =>
        (d.status === 'PROVISIONED' || d.status === 'IN_INVENTORY') &&
        !d.assignedVehicleId
    );
  }, [workspace]);

  // Step 2: Send Customer OTP
  const handleSendCustomerOtp = async () => {
    setWizardFeedback(null);
    setDevOtpHint(null);
    const parsedPhone = phoneE164Schema.safeParse(customerPhoneE164.trim());
    if (!parsedPhone.success) {
      setWizardFeedback({
        type: 'ERROR',
        message: 'Enter a valid E.164 customer phone number (+91...) first.'
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = unwrapApiResponse(
        await apiClient.requestOtp({
          phoneE164: customerPhoneE164.trim(),
          purpose: 'SHOWROOM_CUSTOMER_VERIFY'
        })
      );
      setOtpChallengeId(res.challengeId);
      if (res.demoOtpForTestingOnly) {
        setDevOtpHint(res.demoOtpForTestingOnly);
      }
      setWizardFeedback({
        type: 'SUCCESS',
        message: `OTP challenge (${res.challengeId}) sent to customer ${customerPhoneE164.trim()}. Showroom never creates or views customer password.`
      });
    } catch (err) {
      const msg = handleApiError(err, 'Failed to send customer OTP.');
      setWizardFeedback({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCustomerOtp = async () => {
    setWizardFeedback(null);
    if (otpCodeInput.trim().length !== 6) {
      setWizardFeedback({
        type: 'ERROR',
        message: 'Send OTP first and enter the 6-digit code.'
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = unwrapApiResponse(
        await apiClient.verifyCustomerShowroomOtp({
          phoneE164: customerPhoneE164.trim(),
          otpCode: otpCodeInput.trim()
        })
      );
      setOtpChallengeId(res.challengeId);
      setIsCustomerOtpVerified(true);
      setWizardFeedback({
        type: 'SUCCESS',
        message: `Customer phone ${res.phoneE164} verified on backend via OTP challenge ${res.challengeId}.`
      });
      setWizardStep(3);
    } catch (err) {
      const msg = handleApiError(err, 'Customer OTP verification failed.');
      setWizardFeedback({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 9: Complete Registration & Assign Device
  const handleCompleteNineStepRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setWizardFeedback(null);

    if (!activeShowroom) {
      setWizardFeedback({
        type: 'ERROR',
        message: 'No approved showroom context available.'
      });
      return;
    }

    const payload = {
      showroomId: activeShowroom.id,
      registrationNumber: registrationNumber.trim().toUpperCase(),
      vin: vin.trim().toUpperCase(),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      variant: variant.trim(),
      manufacturingYear: Number(manufacturingYear),
      color: color.trim(),
      fuelType,
      customerFullName: customerFullName.trim(),
      customerPhoneE164: customerPhoneE164.trim(),
      customerEmail: customerEmail.trim() || null,
      customerOtpChallengeId: otpChallengeId.trim(),
      assignedDeviceSerial: assignedDeviceSerial.trim().toUpperCase()
    };

    const parsed = showroomVehicleRegistrationSchema.safeParse(payload);
    if (!parsed.success) {
      setWizardFeedback({
        type: 'ERROR',
        message: `Validation failed: ${parsed.error.issues[0]?.message ?? 'Check all 9 steps.'}`
      });
      return;
    }

    if (!isCustomerOtpVerified) {
      setWizardFeedback({
        type: 'ERROR',
        message:
          'Step 2 (Customer Phone OTP Verification) must be completed first.'
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = unwrapApiResponse(
        await apiClient.registerVehicleAndAssignDevice(parsed.data)
      );
      setWizardFeedback({
        type: 'SUCCESS',
        message: `9-Step Showroom Onboarding Complete! Vehicle ${res.vehicle.registrationNumber} (${res.vehicle.id}) linked to STM32U575 assignment ${res.deviceAssignment.id}. Customer (${parsed.data.customerPhoneE164}) can now activate their password in the Mobile App.`
      });
      setRegistrationNumber('');
      setVin('');
      setIsCustomerOtpVerified(false);
      setOtpChallengeId('');
      setOtpCodeInput('');
      await loadDealerWorkspace();
    } catch (err) {
      const msg = handleApiError(
        err,
        'Vehicle registration and device assignment failed.'
      );
      setWizardFeedback({ type: 'ERROR', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleShowroomStatus = async (
    companyId: string,
    showroomId: string,
    currentStatus: string
  ) => {
    if (roleMode !== 'COMPANY_ADMIN') return;
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.updateShowroomStatus(companyId, showroomId, {
          newStatus: nextStatus,
          reason: `Company Admin updated showroom status to ${nextStatus} via portal.`
        })
      );
      setStatusBanner(`Showroom ${showroomId} status updated to ${nextStatus}.`);
      await loadDealerWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to update showroom status.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveVehicleCorrection = async (vehicleId: string) => {
    if (!correctionReason.trim() || correctionReason.trim().length < 5) {
      setErrorBanner(
        'Provide a correction reason (at least 5 characters) for the audit trail.'
      );
      return;
    }

    setIsLoading(true);
    setErrorBanner(null);
    try {
      unwrapApiResponse(
        await apiClient.applyVehicleCorrection(vehicleId, {
          color: correctionColor.trim() || undefined,
          variant: correctionVariant.trim() || undefined,
          reason: correctionReason.trim()
        })
      );
      setEditingVehicleId(null);
      setCorrectionReason('');
      setStatusBanner(`Permitted correction saved for vehicle ${vehicleId}.`);
      await loadDealerWorkspace();
    } catch (err) {
      handleApiError(err, 'Failed to apply vehicle correction.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-lg text-white">
                  VeerXcape Showroom & Parent-Company Portal
                </span>
                {isAuthenticated && (
                  <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    {roleMode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAuthenticated && workspace
                  ? `${workspace.company?.brandName ?? 'Authorized Dealership'} • Showrooms: ${visibleShowrooms.length}`
                  : 'Authorized Parent-Company & Showroom Staff Portal — Sign in required'}
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex flex-wrap items-center gap-2">
              {visibleShowrooms.length > 0 && (
                <select
                  aria-label="Select Active Showroom"
                  value={activeShowroomId}
                  onChange={(e) => setActiveShowroomId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {visibleShowrooms.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.dealerCode}) — {s.status}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                disabled={isLoading}
                onClick={() => void loadDealerWorkspace()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`}
                />
                Sync
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
              <span>Network connection lost or backend timed out.</span>
            </div>
            <button
              type="button"
              onClick={() => void loadDealerWorkspace()}
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
              <div className="h-10 w-10 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">
                  Company & Showroom Sign In
                </h1>
                <p className="text-xs text-slate-400">
                  Authorized Company Admins, Showroom Managers & Staff
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="dealer-login-phone"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Staff / Admin Phone (E.164)
                </label>
                <input
                  id="dealer-login-phone"
                  type="text"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="+919820000100"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="dealer-login-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Password
                </label>
                <input
                  id="dealer-login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter staff password"
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
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-sm"
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        </main>
      ) : (
        <>
          <nav className="border-b border-slate-800 bg-slate-900/60 px-6 py-2.5 mt-2">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    {
                      id: 'OVERVIEW_SHOWROOMS',
                      label: '1. Company & Showroom Hierarchy',
                      icon: Store
                    },
                    {
                      id: 'NINE_STEP_ONBOARDING',
                      label: '2. 9-Step Vehicle & STM32 Onboarding',
                      icon: ClipboardList
                    },
                    {
                      id: 'SHOWROOM_VEHICLES_DEVICES',
                      label: '3. Registered Vehicles & Corrections',
                      icon: Car
                    },
                    {
                      id: 'STAFF_AUDIT',
                      label: '4. Staff Directory & Audit Trail',
                      icon: Users
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
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'bg-slate-950 text-slate-300 border border-slate-800'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                <span>
                  Zero-Knowledge Customer Password Policy: Showroom verifies OTP
                  only
                </span>
              </div>
            </div>
          </nav>

          <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6">
            {activeTab === 'OVERVIEW_SHOWROOMS' && (
              <section className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {visibleShowrooms.map((sh) => (
                    <div
                      key={sh.id}
                      className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-sky-300">
                          {sh.dealerCode}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                          {sh.status}
                        </span>
                      </div>
                      <h2 className="text-base font-bold text-white">
                        {sh.name}
                      </h2>
                      <p className="text-xs text-slate-400">
                        {sh.city}, {sh.stateCode}
                      </p>

                      {roleMode === 'COMPANY_ADMIN' && (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() =>
                            void handleToggleShowroomStatus(
                              sh.companyId,
                              sh.id,
                              sh.status
                            )
                          }
                          className="w-full py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-slate-200"
                        >
                          {sh.status === 'ACTIVE'
                            ? 'Suspend Showroom Branch'
                            : 'Reactivate Showroom Branch'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'NINE_STEP_ONBOARDING' && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h2 className="text-base font-bold text-white">
                    9-Step Vehicle & STM32U575 Onboarding
                  </h2>
                  <ol className="space-y-2 text-xs">
                    {[
                      '1. Capture Customer Identity & Phone (E.164)',
                      '2. Verify Customer Mobile via 6-Digit OTP',
                      '3. Enter Vehicle Registration & 17-Char VIN',
                      '4. Select Manufacturer, Model, Variant & Fuel',
                      '5. Bind Pre-Provisioned STM32U575 Serial',
                      '6. Verify 12V Power & Backup Battery Rail',
                      '7. Confirm GNSS 3D Satellite Lock',
                      '8. Calibrate 6-Axis IMU & SOS Button',
                      '9. Commit Atomic Record & Dispatch Activation'
                    ].map((label, index) => {
                      const stepNum = index + 1;
                      const isDone = wizardStep > stepNum;
                      return (
                        <li
                          key={label}
                          onClick={() => setWizardStep(stepNum)}
                          className="cursor-pointer p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-slate-300"
                        >
                          <span>{label}</span>
                          {isDone && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                  <form
                    onSubmit={handleCompleteNineStepRegistration}
                    className="space-y-5"
                  >
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                          Steps 1 & 2 — Customer Identity & OTP Verification
                        </h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          {isCustomerOtpVerified
                            ? 'OTP VERIFIED'
                            : 'OTP REQUIRED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={customerFullName}
                          onChange={(e) => setCustomerFullName(e.target.value)}
                          placeholder="Customer Full Name"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={customerPhoneE164}
                          onChange={(e) => {
                            setCustomerPhoneE164(e.target.value);
                            setIsCustomerOtpVerified(false);
                          }}
                          placeholder="Customer Mobile (+91...)"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="Customer Email (Optional)"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleSendCustomerOtp()}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-sky-300"
                        >
                          Send Customer OTP
                        </button>
                        <input
                          type="text"
                          maxLength={6}
                          value={otpCodeInput}
                          onChange={(e) => setOtpCodeInput(e.target.value)}
                          placeholder="6-digit OTP"
                          className="w-32 rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white font-mono"
                        />
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleVerifyCustomerOtp()}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-xs font-semibold text-emerald-300"
                        >
                          Verify OTP
                        </button>
                        {devOtpHint && (
                          <span className="text-[11px] font-mono text-amber-300">
                            Dev OTP: {devOtpHint}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                        Steps 3–5 — Vehicle Details & STM32U575 Serial Binding
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={registrationNumber}
                          onChange={(e) =>
                            setRegistrationNumber(e.target.value)
                          }
                          placeholder="Registration (UP32AB1234)"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                        />
                        <input
                          type="text"
                          maxLength={17}
                          value={vin}
                          onChange={(e) => setVin(e.target.value)}
                          placeholder="17-Char VIN"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                        />
                        <select
                          value={fuelType}
                          onChange={(e) =>
                            setFuelType(e.target.value as typeof fuelType)
                          }
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        >
                          <option value="DIESEL">DIESEL</option>
                          <option value="PETROL">PETROL</option>
                          <option value="EV">EV</option>
                          <option value="HYBRID">HYBRID</option>
                          <option value="CNG">CNG</option>
                        </select>
                        <input
                          type="text"
                          value={manufacturer}
                          onChange={(e) => setManufacturer(e.target.value)}
                          placeholder="Manufacturer"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          placeholder="Model"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={variant}
                          onChange={(e) => setVariant(e.target.value)}
                          placeholder="Variant"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="number"
                          value={manufacturingYear}
                          onChange={(e) =>
                            setManufacturingYear(Number(e.target.value))
                          }
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          placeholder="Color"
                          className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white"
                        />
                        {availableDevices.length > 0 ? (
                          <select
                            value={assignedDeviceSerial}
                            onChange={(e) =>
                              setAssignedDeviceSerial(e.target.value)
                            }
                            className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-amber-300 font-mono"
                          >
                            {availableDevices.map((d) => (
                              <option key={d.id} value={d.serialNumber}>
                                {d.serialNumber} ({d.firmwareVersion})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={assignedDeviceSerial}
                            onChange={(e) =>
                              setAssignedDeviceSerial(e.target.value)
                            }
                            placeholder="VX-STM32U575-0001"
                            className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-amber-300 font-mono"
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checkPowerVerified}
                            onChange={(e) =>
                              setCheckPowerVerified(e.target.checked)
                            }
                          />
                          <span>12V Power & Backup Battery Verified</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checkGnssLockVerified}
                            onChange={(e) =>
                              setCheckGnssLockVerified(e.target.checked)
                            }
                          />
                          <span>GNSS 3D Fix Verified</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checkGsmSignalVerified}
                            onChange={(e) =>
                              setCheckGsmSignalVerified(e.target.checked)
                            }
                          />
                          <span>GSM Telemetry Heartbeat Verified</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checkImuCalibrated}
                            onChange={(e) =>
                              setCheckImuCalibrated(e.target.checked)
                            }
                          />
                          <span>6-Axis IMU Calibrated</span>
                        </label>
                      </div>
                    </div>

                    {wizardFeedback && (
                      <div
                        className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                          wizardFeedback.type === 'SUCCESS'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        }`}
                      >
                        {wizardFeedback.type === 'SUCCESS' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        )}
                        <span>{wizardFeedback.message}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-sm"
                    >
                      Step 9 — Complete Vehicle Registration & Bind STM32U575
                      Device
                    </button>
                  </form>
                </div>
              </section>
            )}

            {activeTab === 'SHOWROOM_VEHICLES_DEVICES' && (
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h1 className="text-xl font-bold text-white">
                  Registered Vehicles & Permitted Corrections (
                  {visibleVehicles.length})
                </h1>
                <div className="space-y-3">
                  {visibleVehicles.map((v) => (
                    <div
                      key={v.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-sky-300">
                            {v.registrationNumber}
                          </span>{' '}
                          <span className="text-white font-semibold">
                            {v.manufacturer} {v.model} ({v.variant})
                          </span>
                          <p className="text-slate-400 mt-0.5">
                            VIN: {v.vin} • Color: {v.color} • Status:{' '}
                            {v.registrationStatus}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingVehicleId(
                              editingVehicleId === v.id ? null : v.id
                            );
                            setCorrectionColor(v.color);
                            setCorrectionVariant(v.variant);
                            setCorrectionReason('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200"
                        >
                          <Edit3 className="h-3 w-3" />
                          Permitted Correction
                        </button>
                      </div>

                      {editingVehicleId === v.id && (
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
                          <input
                            type="text"
                            value={correctionColor}
                            onChange={(e) => setCorrectionColor(e.target.value)}
                            placeholder="Color"
                            className="rounded bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-white"
                          />
                          <input
                            type="text"
                            value={correctionVariant}
                            onChange={(e) =>
                              setCorrectionVariant(e.target.value)
                            }
                            placeholder="Variant"
                            className="rounded bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-white"
                          />
                          <input
                            type="text"
                            value={correctionReason}
                            onChange={(e) =>
                              setCorrectionReason(e.target.value)
                            }
                            placeholder="Reason for correction"
                            className="rounded bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-white"
                          />
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              void handleSaveVehicleCorrection(v.id)
                            }
                            className="rounded bg-sky-500 text-slate-950 font-bold px-3 py-1.5"
                          >
                            Save Correction
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'STAFF_AUDIT' && (
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-bold text-white">
                    Showroom & Company Staff ({workspace?.staff.length ?? 0})
                  </h2>
                  <div className="space-y-2">
                    {(workspace?.staff ?? []).map((st) => (
                      <div
                        key={st.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-white">{st.fullName}</p>
                          <p className="text-slate-400">{st.phoneE164}</p>
                        </div>
                        <span className="font-mono text-sky-300">{st.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h2 className="text-lg font-bold text-white">
                    Audit History ({workspace?.auditLogs.length ?? 0})
                  </h2>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(workspace?.auditLogs ?? []).map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                      >
                        <span className="font-mono font-bold text-amber-300">
                          {log.action}
                        </span>
                        <p className="text-slate-400 mt-0.5">
                          Target: {log.targetCollection}/{log.targetDocumentId}
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
