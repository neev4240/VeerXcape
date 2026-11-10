import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  HeartPulse,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  ShieldAlert,
  Truck,
  WifiOff
} from 'lucide-react';
import type {
  AuthorityDepartment,
  IncidentLifecycleState,
  IncidentSeverity
} from '@veerxcape/shared-types';
import {
  VeerXcapeApiClient,
  VeerXcapeApiError,
  isExplicitDevDemoModeEnabled,
  unwrapApiResponse,
  type AuthorityWorkspaceDTO,
  type RedactedAuthorityIncidentView
} from '@veerxcape/shared-services';
import {
  authorityIncidentUpdateSchema,
  customerPhoneLoginSchema
} from '@veerxcape/shared-validation';

interface AuthorityIncidentItem {
  incidentId: string;
  authorityId: string;
  jurisdictionCode: string;
  highwayCorridor: string;
  detectedAt: string;
  severity: IncidentSeverity;
  status: IncidentLifecycleState;
  latitude: number;
  longitude: number;
  impactForceG: number;
  rolloverDetected: boolean;
  airbagDeployed: boolean;
  vehicleClass: string;
  registrationNumber?: string;
  makeModel?: string;
  color?: string;
  emergencyContactPhoneE164?: string;
  assignedUnitCode?: string;
  authorityNotes: Array<{
    timestamp: string;
    department: AuthorityDepartment;
    unitCode: string;
    status: IncidentLifecycleState;
    note: string;
  }>;
}

const DEV_DEMO_ENABLED = isExplicitDevDemoModeEnabled();

const DEMO_AUTHORITY_INCIDENTS: AuthorityIncidentItem[] = [
  {
    incidentId: 'inc_authority_demo_001',
    authorityId: 'auth_med_up_lko',
    jurisdictionCode: 'IN-UP-LKO',
    highwayCorridor: 'Shaheed Path Expressway KM 14.2, Lucknow',
    detectedAt: '2026-04-06 02:18:09 UTC',
    severity: 'CRITICAL',
    status: 'VISIBLE_TO_AUTHORITY',
    latitude: 26.8467,
    longitude: 80.9462,
    impactForceG: 6.4,
    rolloverDetected: false,
    airbagDeployed: true,
    vehicleClass: 'Tata Harrier EV',
    registrationNumber: 'UP32AB1234',
    makeModel: 'Tata Harrier EV',
    color: 'Sapphire Metallic',
    emergencyContactPhoneE164: '+919876543210',
    authorityNotes: []
  }
];

function mapRedactedIncidentToPortalItem(
  raw: RedactedAuthorityIncidentView,
  authorityId: string,
  department: AuthorityDepartment,
  allUpdates: AuthorityWorkspaceDTO['recentUpdates']
): AuthorityIncidentItem {
  const isMedical = 'vehicleDescription' in raw;
  const isPolice = 'vehicleIdentification' in raw;

  const registrationNumber =
    department === 'ROAD'
      ? undefined
      : isMedical
        ? raw.vehicleDescription.registrationNumber
        : isPolice
          ? raw.vehicleIdentification.registrationNumber
          : undefined;

  const makeModel = isMedical
    ? `${raw.vehicleDescription.manufacturer} ${raw.vehicleDescription.model}`
    : isPolice
      ? `${raw.vehicleIdentification.manufacturer} ${raw.vehicleIdentification.model}`
      : 'Anonymized Corridor Vehicle';

  const color = isMedical
    ? raw.vehicleDescription.color
    : isPolice
      ? raw.vehicleIdentification.color
      : undefined;

  const emergencyContactPhoneE164 =
    department === 'ROAD'
      ? undefined
      : isMedical || isPolice
        ? (raw.emergencyContactPhone ?? undefined)
        : undefined;

  const impactForceG = isMedical
    ? (raw.environmentalSnapshot?.peakImpactG ?? 0)
    : 'peakImpactG' in raw
      ? (raw.peakImpactG ?? 0)
      : 0;

  const matchingNotes = allUpdates
    .filter((u) => u.incidentId === raw.id)
    .map((u) => ({
      timestamp: u.createdAt.slice(0, 19).replace('T', ' ') + ' UTC',
      department: u.authorityDepartment ?? department,
      unitCode: u.dispatchReferenceCode ?? 'DESK-OFFICER',
      status: u.newState,
      note: u.note
    }));

  return {
    incidentId: raw.id,
    authorityId,
    jurisdictionCode: raw.location.jurisdictionCode,
    highwayCorridor: raw.location.roadSegmentSummary,
    detectedAt: raw.occurredAt.slice(0, 19).replace('T', ' ') + ' UTC',
    severity: raw.severity,
    status: raw.lifecycleState,
    latitude: raw.location.lat,
    longitude: raw.location.lng,
    impactForceG,
    rolloverDetected: impactForceG >= 4.0,
    airbagDeployed: raw.severity === 'CRITICAL',
    vehicleClass: makeModel,
    registrationNumber,
    makeModel,
    color,
    emergencyContactPhoneE164,
    assignedUnitCode:
      'dispatchReferenceCode' in raw
        ? (raw.dispatchReferenceCode ?? undefined)
        : undefined,
    authorityNotes: matchingNotes
  };
}

export function App(): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loginPhone, setLoginPhone] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [demoModeActive, setDemoModeActive] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOfflineError, setIsOfflineError] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<AuthorityWorkspaceDTO | null>(
    null
  );
  const [activeAuthorityId, setActiveAuthorityId] = useState<string>('');
  const [activeDepartment, setActiveDepartment] =
    useState<AuthorityDepartment>('MEDICAL');
  const [activeJurisdiction, setActiveJurisdiction] =
    useState<string>('ALL_ASSIGNED');

  const [incidents, setIncidents] = useState<AuthorityIncidentItem[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');

  const [nextStatus, setNextStatus] = useState<
    | 'AUTHORITY_ACKNOWLEDGED'
    | 'DISPATCH_RECORDED_BY_AUTHORITY'
    | 'RESPONSE_CONFIRMED'
    | 'RESOLVED'
  >('AUTHORITY_ACKNOWLEDGED');
  const [unitCodeInput, setUnitCodeInput] = useState<string>('ALS-108-UNIT-14');
  const [officerNameInput, setOfficerNameInput] =
    useState<string>('Duty Officer');
  const [actionNoteInput, setActionNoteInput] = useState<string>('');
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const apiClient = useMemo(
    () =>
      new VeerXcapeApiClient({
        onSessionExpired: (reason) => {
          setIsAuthenticated(false);
          setWorkspace(null);
          setIncidents([]);
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

  const loadIncidentsForAuthority = useCallback(
    async (
      authorityId: string,
      department: AuthorityDepartment,
      recentUpdates: AuthorityWorkspaceDTO['recentUpdates']
    ) => {
      if (!authorityId || demoModeActive) return;
      setIsLoading(true);
      setErrorBanner(null);
      setIsOfflineError(false);
      try {
        const items = unwrapApiResponse(
          await apiClient.listAuthorityIncidents(authorityId, { limit: 50 })
        );
        const mapped = items.map((item) =>
          mapRedactedIncidentToPortalItem(
            item,
            authorityId,
            department,
            recentUpdates
          )
        );
        setIncidents(mapped);
        if (mapped.length > 0) {
          setSelectedIncidentId((prev) =>
            mapped.some((i) => i.incidentId === prev)
              ? prev
              : mapped[0].incidentId
          );
        }
      } catch (err) {
        handleApiError(err, 'Unable to load jurisdiction incidents.');
      } finally {
        setIsLoading(false);
      }
    },
    [apiClient, demoModeActive, handleApiError]
  );

  const loadAuthorityWorkspace = useCallback(async () => {
    if (demoModeActive) return;
    setIsLoading(true);
    setErrorBanner(null);
    setIsOfflineError(false);
    try {
      const ws = unwrapApiResponse(await apiClient.getAuthorityWorkspace());
      setWorkspace(ws);
      const firstAuth = ws.authorities[0];
      if (firstAuth) {
        setActiveAuthorityId(firstAuth.id);
        setActiveDepartment(firstAuth.department);
        setUnitCodeInput(
          firstAuth.department === 'MEDICAL'
            ? 'ALS-108-UNIT-14'
            : firstAuth.department === 'POLICE'
              ? 'PCR-112-VAN-08'
              : 'NHAI-CRANE-03'
        );
        await loadIncidentsForAuthority(
          firstAuth.id,
          firstAuth.department,
          ws.recentUpdates
        );
      }
    } catch (err) {
      handleApiError(err, 'Failed to load authority workspace.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, demoModeActive, handleApiError, loadIncidentsForAuthority]);

  useEffect(() => {
    if (apiClient.hasActiveSession() && !isAuthenticated) {
      setIsAuthenticated(true);
      void loadAuthorityWorkspace();
    }
  }, [apiClient, isAuthenticated, loadAuthorityWorkspace]);

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
        parsed.error.issues[0]?.message ?? 'Invalid phone number or password.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const session = unwrapApiResponse(
        await apiClient.loginWithPhone(parsed.data)
      );
      const hasAuthorityAccess = session.activeRoles.some((r) =>
        [
          'AUTHORITY_MEDICAL',
          'AUTHORITY_POLICE',
          'AUTHORITY_ROAD',
          'VEERXCAPE_ADMIN',
          'VEERXCAPE_SUPER_ADMIN'
        ].includes(r.role)
      );
      if (!hasAuthorityAccess) {
        await apiClient.logout();
        setAuthError(
          'Access Denied: This account does not hold a verified Government Authority role.'
        );
        return;
      }
      setDemoModeActive(false);
      setIsAuthenticated(true);
      setLoginPassword('');
      setOfficerNameInput(
        session.profile?.fullName ?? session.user.phoneE164
      );
      await loadAuthorityWorkspace();
    } catch (err) {
      const msg = handleApiError(err, 'Authority sign-in failed.');
      setAuthError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      if (!demoModeActive) {
        await apiClient.logout();
      }
    } finally {
      setDemoModeActive(false);
      setIsAuthenticated(false);
      setWorkspace(null);
      setIncidents([]);
      setIsLoading(false);
    }
  };

  const handleSelectAuthorityUnit = async (authorityId: string) => {
    setActiveAuthorityId(authorityId);
    const found = workspace?.authorities.find((a) => a.id === authorityId);
    if (found) {
      setActiveDepartment(found.department);
      await loadIncidentsForAuthority(
        found.id,
        found.department,
        workspace?.recentUpdates ?? []
      );
    }
  };

  const handleInspectSingleIncident = async (incidentId: string) => {
    setSelectedIncidentId(incidentId);
    if (demoModeActive || !activeAuthorityId) return;
    try {
      const fresh = unwrapApiResponse(
        await apiClient.inspectAuthorityIncident(activeAuthorityId, incidentId)
      );
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.incidentId === incidentId
            ? mapRedactedIncidentToPortalItem(
                fresh,
                activeAuthorityId,
                activeDepartment,
                workspace?.recentUpdates ?? []
              )
            : inc
        )
      );
    } catch (err) {
      handleApiError(err, 'Failed to inspect incident details.');
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) =>
      activeJurisdiction === 'ALL_ASSIGNED'
        ? true
        : inc.jurisdictionCode === activeJurisdiction
    );
  }, [incidents, activeJurisdiction]);

  const selectedIncident = useMemo(
    () =>
      filteredIncidents.find((i) => i.incidentId === selectedIncidentId) ??
      filteredIncidents[0] ??
      null,
    [filteredIncidents, selectedIncidentId]
  );

  const isOwnerPiiRedacted = activeDepartment === 'ROAD';

  const handleRecordAuthorityUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBanner(null);
    setErrorBanner(null);

    if (!selectedIncident) return;

    const payload = {
      incidentId: selectedIncident.incidentId,
      newState: nextStatus,
      note:
        actionNoteInput.trim() ||
        `${activeDepartment} desk recorded status ${nextStatus} via VeerXcape Authority Portal.`,
      assignedOfficerName: officerNameInput.trim() || undefined,
      dispatchReferenceCode: unitCodeInput.trim() || undefined,
      visibility: 'ALL_AUTHORIZED' as const
    };

    const parsed = authorityIncidentUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setActionBanner(
        `Validation error: ${parsed.error.issues[0]?.message ?? 'Invalid authority update payload.'}`
      );
      return;
    }

    if (demoModeActive) {
      setActionBanner(`Demo status updated to ${parsed.data.newState}.`);
      return;
    }

    setIsLoading(true);
    try {
      const targetAuthId = activeAuthorityId || selectedIncident.authorityId;
      const updated = unwrapApiResponse(
        await apiClient.updateAuthorityIncident(targetAuthId, parsed.data)
      );
      const nowLabel =
        new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

      setIncidents((prev) =>
        prev.map((inc) =>
          inc.incidentId === selectedIncident.incidentId
            ? {
                ...inc,
                status: updated.incident.lifecycleState,
                assignedUnitCode:
                  parsed.data.dispatchReferenceCode ?? inc.assignedUnitCode,
                authorityNotes: [
                  ...inc.authorityNotes,
                  {
                    timestamp: nowLabel,
                    department: activeDepartment,
                    unitCode:
                      parsed.data.dispatchReferenceCode ?? 'DESK-OFFICER',
                    status: updated.incident.lifecycleState,
                    note: parsed.data.note
                  }
                ]
              }
            : inc
        )
      );

      setActionNoteInput('');
      setActionBanner(
        `Incident ${selectedIncident.incidentId} updated to ${updated.incident.lifecycleState} on backend by ${activeDepartment} desk (${unitCodeInput}).`
      );
    } catch (err) {
      handleApiError(err, 'Failed to record authority incident transition.');
    } finally {
      setIsLoading(false);
    }
  };

  const departmentMeta: Record<
    AuthorityDepartment,
    {
      title: string;
      badge: string;
      scopeSummary: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    MEDICAL: {
      title: '108 Emergency Medical & Trauma Dispatch Desk',
      badge: 'AUTHORITY_MEDICAL',
      scopeSummary:
        'Full access to crash G-force, environmental telemetry, occupant emergency contact, and exact GNSS coordinates.',
      icon: HeartPulse
    },
    POLICE: {
      title: '112 Highway Police & Traffic Control Desk',
      badge: 'AUTHORITY_POLICE',
      scopeSummary:
        'Full access to vehicle registration, VIN, make/model, and emergency contact for law-enforcement response.',
      icon: Shield
    },
    ROAD: {
      title: 'NHAI / State Road & Corridor Clearance Desk',
      badge: 'AUTHORITY_ROAD',
      scopeSummary:
        'Strict Data Redaction Enforced: Receives corridor hazard location and impact severity only. Owner & family PII, registration, and VIN are stripped.',
      icon: Truck
    }
  };

  const ActiveDeptIcon = departmentMeta[activeDepartment].icon;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ActiveDeptIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-lg text-white">
                  VeerXcape Government Authority Portal
                </span>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  {departmentMeta[activeDepartment].badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAuthenticated
                  ? departmentMeta[activeDepartment].title
                  : 'Verified Government Emergency Response Portal — Sign in required'}
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex flex-wrap items-center gap-2">
              {workspace && workspace.authorities.length > 0 && (
                <select
                  aria-label="Select Assigned Authority Unit"
                  value={activeAuthorityId}
                  onChange={(e) =>
                    void handleSelectAuthorityUnit(e.target.value)
                  }
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {workspace.authorities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.department} • {a.jurisdictionCode})
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  void loadIncidentsForAuthority(
                    activeAuthorityId,
                    activeDepartment,
                    workspace?.recentUpdates ?? []
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-rose-400' : ''}`}
                />
                Refresh Queue
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

      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{departmentMeta[activeDepartment].scopeSummary}</span>
          </div>
          <span className="text-[11px] text-amber-300 font-medium">
            Independent Web Portal — Does not claim direct integration into
            government CAD/112 hardware
          </span>
        </div>
      </div>

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
              onClick={() => void loadAuthorityWorkspace()}
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
      </div>

      {!isAuthenticated ? (
        <main className="flex-1 max-w-md w-full mx-auto px-6 py-12 flex items-center">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">
                  Authority Officer Sign In
                </h1>
                <p className="text-xs text-slate-400">
                  Authorized Medical (108), Police (112) & Road Safety Officers
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-portal-phone"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Officer Registered Phone (E.164)
                </label>
                <input
                  id="auth-portal-phone"
                  type="text"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="+919810000108"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-portal-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Password
                </label>
                <input
                  id="auth-portal-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter officer password"
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
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm"
              >
                {isLoading ? 'Signing In...' : 'Sign In to Authority Portal'}
              </button>

              {DEV_DEMO_ENABLED && (
                <button
                  type="button"
                  onClick={() => {
                    setDemoModeActive(true);
                    setIsAuthenticated(true);
                    setIncidents(DEMO_AUTHORITY_INCIDENTS);
                    setSelectedIncidentId(
                      DEMO_AUTHORITY_INCIDENTS[0].incidentId
                    );
                  }}
                  className="w-full py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Enter Explicit Dev Demo Mode
                </button>
              )}
            </form>
          </div>
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Activity className="h-4 w-4 text-rose-400" />
                  Jurisdiction Incident Queue ({filteredIncidents.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveJurisdiction('ALL_ASSIGNED')}
                  className="text-xs text-slate-400"
                >
                  {activeJurisdiction}
                </button>
              </div>

              {filteredIncidents.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No active incidents in your verified department &
                  jurisdiction.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredIncidents.map((inc) => {
                    const isSelected =
                      selectedIncident?.incidentId === inc.incidentId;
                    return (
                      <button
                        key={inc.incidentId}
                        type="button"
                        onClick={() =>
                          void handleInspectSingleIncident(inc.incidentId)
                        }
                        className={`w-full text-left p-4 rounded-xl border transition space-y-2 ${
                          isSelected
                            ? 'bg-slate-950 border-rose-500/60'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-amber-300">
                            {inc.incidentId}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                            {inc.status}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white">
                          {inc.highwayCorridor}
                        </p>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>
                            {isOwnerPiiRedacted
                              ? `Anonymized Hazard`
                              : `${inc.registrationNumber ?? 'REDACTED'} • ${inc.makeModel ?? inc.vehicleClass}`}
                          </span>
                          <span>Impact: {inc.impactForceG}g</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-7 space-y-5">
            {selectedIncident ? (
              <>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                  <div>
                    <span className="font-mono text-xs font-bold text-amber-300">
                      {selectedIncident.incidentId} •{' '}
                      {selectedIncident.jurisdictionCode}
                    </span>
                    <h1 className="text-xl font-bold text-white mt-1">
                      {selectedIncident.highwayCorridor}
                    </h1>
                    <p className="text-xs text-slate-400">
                      Detected at {selectedIncident.detectedAt} • Status:{' '}
                      <strong className="text-emerald-300">
                        {selectedIncident.status}
                      </strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block">
                        GNSS Coordinates
                      </span>
                      <strong className="text-white font-mono">
                        {selectedIncident.latitude.toFixed(4)}° N,{' '}
                        {selectedIncident.longitude.toFixed(4)}° E
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block">
                        Peak Impact Force
                      </span>
                      <strong className="text-rose-300 font-bold text-sm">
                        {selectedIncident.impactForceG} g
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block">Severity</span>
                      <strong className="text-white">
                        {selectedIncident.severity}
                      </strong>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        {isOwnerPiiRedacted ? (
                          <>
                            <Lock className="h-3.5 w-3.5 text-amber-400" />
                            Road Authority Redacted View (PII Stripped by
                            Backend)
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            Authorized Emergency Responder Identity View
                          </>
                        )}
                      </h3>
                    </div>

                    {isOwnerPiiRedacted ? (
                      <p className="text-amber-200/90 leading-relaxed">
                        Under VeerXcape security rules, vehicle registration
                        plates, VIN, owner name, and family phone numbers are
                        strictly stripped for <code>AUTHORITY_ROAD</code> users.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-slate-400 block">
                            Registration & Vehicle
                          </span>
                          <strong className="text-white">
                            {selectedIncident.registrationNumber ?? 'N/A'} —{' '}
                            {selectedIncident.makeModel}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">
                            Emergency Contact Phone
                          </span>
                          <strong className="text-emerald-300 font-mono">
                            {selectedIncident.emergencyContactPhoneE164 ??
                              'On File'}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">
                      Acknowledge, Record Dispatch, Confirm Response or Resolve
                    </h2>
                    <ClipboardCheck className="h-6 w-6 text-rose-400" />
                  </div>

                  <form
                    onSubmit={handleRecordAuthorityUpdate}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={nextStatus}
                        onChange={(e) =>
                          setNextStatus(e.target.value as typeof nextStatus)
                        }
                        className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                      >
                        <option value="AUTHORITY_ACKNOWLEDGED">
                          1. AUTHORITY_ACKNOWLEDGED
                        </option>
                        <option value="DISPATCH_RECORDED_BY_AUTHORITY">
                          2. DISPATCH_RECORDED_BY_AUTHORITY
                        </option>
                        <option value="RESPONSE_CONFIRMED">
                          3. RESPONSE_CONFIRMED (On Scene)
                        </option>
                        <option value="RESOLVED">
                          4. RESOLVED (Corridor Clear)
                        </option>
                      </select>

                      <input
                        type="text"
                        value={unitCodeInput}
                        onChange={(e) => setUnitCodeInput(e.target.value)}
                        placeholder="Dispatch Reference Code (e.g., ALS-108-UNIT-14)"
                        className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>

                    <input
                      type="text"
                      value={actionNoteInput}
                      onChange={(e) => setActionNoteInput(e.target.value)}
                      placeholder="Official responder note (minimum 5 characters)"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white"
                    />

                    {actionBanner && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                        {actionBanner}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs"
                    >
                      Record {nextStatus}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                Select an incident from the jurisdiction queue.
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
