import React, { useMemo, useState } from 'react';
import {
  Building,
  EyeOff,
  Lock,
  MapPin,
  Shield
} from 'lucide-react';
import {
  AUTHORITY_DEPARTMENTS,
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  USER_ROLES,
  type AuthorityDepartment,
  type IncidentLifecycleState
} from '@veerxcape/shared-constants';
import {
  evaluateAndRedactIncidentForAuthority,
  resolveFirebaseWebConfig
} from '@veerxcape/shared-services';
import type { IncidentDocument } from '@veerxcape/shared-types';
import { authorityIncidentUpdateSchema } from '@veerxcape/shared-validation';

const INITIAL_AUTHORITY_INCIDENTS: IncidentDocument[] = [
  {
    id: 'inc_lko_8801',
    idempotencyKey: 'idem_hw_lko_8801',
    vehicleId: 'veh_up32ab1234',
    deviceId: 'VX-STM32U575-9A84F1',
    incidentType: INCIDENT_TYPES.ACCIDENT_DETECTED,
    source: 'HARDWARE_STM32',
    isSimulated: false,
    severity: 'CRITICAL',
    confidenceScore: 0.98,
    lifecycleState: INCIDENT_LIFECYCLE_STATES.VISIBLE_TO_AUTHORITY,
    location: {
      lat: 26.8467,
      lng: 81.0042,
      accuracyMeters: 3.4,
      roadSegmentSummary: 'Shaheed Path Expressway KM 14.2, Gomti Nagar Extension, Lucknow',
      jurisdictionCode: 'IN-UP-LKO'
    },
    vehicleSnapshot: {
      registrationNumber: 'UP32AB1234',
      vin: 'MA1TA2MKXKA019283',
      manufacturer: 'Tata Motors',
      model: 'Harrier EV',
      color: 'Sapphire Metallic'
    },
    environmentalSnapshot: {
      cabinTempCelsius: 25.8,
      occupantDetected: true,
      coPpm: 14,
      smokeDetected: false,
      peakImpactG: 6.4
    },
    ownerEmergencyContactPhone: '+919876543210',
    authorizedDepartments: [
      AUTHORITY_DEPARTMENTS.MEDICAL,
      AUTHORITY_DEPARTMENTS.POLICE,
      AUTHORITY_DEPARTMENTS.ROAD
    ],
    sharedWithFamilyIds: ['fam_01'],
    authoritySharingPolicy: 'CRITICAL_LIFE_SAFETY_RULE',
    occurredAt: '2026-11-05T08:12:00.000Z',
    createdAt: '2026-11-05T08:12:02.000Z',
    updatedAt: '2026-11-05T08:12:02.000Z'
  },
  {
    id: 'inc_lko_8802',
    idempotencyKey: 'idem_sos_lko_8802',
    vehicleId: 'veh_up32ab1234',
    deviceId: 'VX-STM32U575-9A84F1',
    incidentType: INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT,
    source: 'HARDWARE_STM32',
    isSimulated: false,
    severity: 'HIGH',
    confidenceScore: 0.94,
    lifecycleState: INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED,
    location: {
      lat: 26.8512,
      lng: 80.9468,
      accuracyMeters: 4.1,
      roadSegmentSummary: 'Hazratganj Commercial Corridor Sector B, Lucknow',
      jurisdictionCode: 'IN-UP-LKO'
    },
    vehicleSnapshot: {
      registrationNumber: 'UP32GH9090',
      vin: 'MA1TA2MKXKA909012',
      manufacturer: 'Tata Motors',
      model: 'Curvv EV',
      color: 'Pristine White'
    },
    environmentalSnapshot: {
      cabinTempCelsius: 27.1,
      occupantDetected: true,
      coPpm: 3,
      smokeDetected: false,
      peakImpactG: 1.4
    },
    ownerEmergencyContactPhone: '+919876501234',
    authorizedDepartments: [AUTHORITY_DEPARTMENTS.POLICE],
    sharedWithFamilyIds: [],
    authoritySharingPolicy: 'CONSENT_GRANTED',
    occurredAt: '2026-11-05T07:45:00.000Z',
    createdAt: '2026-11-05T07:45:03.000Z',
    updatedAt: '2026-11-05T07:45:03.000Z'
  },
  {
    id: 'inc_lko_8803',
    idempotencyKey: 'idem_road_lko_8803',
    vehicleId: 'veh_up32ab1234',
    deviceId: 'VX-STM32U575-9A84F1',
    incidentType: INCIDENT_TYPES.ROAD_HAZARD,
    source: 'HARDWARE_STM32',
    isSimulated: false,
    severity: 'WARNING',
    confidenceScore: 0.91,
    lifecycleState: INCIDENT_LIFECYCLE_STATES.VISIBLE_TO_AUTHORITY,
    location: {
      lat: 26.8124,
      lng: 81.0156,
      accuracyMeters: 4.5,
      roadSegmentSummary: 'Shaheed Path Service Lane Near Ekana Stadium',
      jurisdictionCode: 'IN-UP-LKO'
    },
    vehicleSnapshot: {
      registrationNumber: 'UP32AB1234',
      vin: 'MA1TA2MKXKA019283',
      manufacturer: 'Tata Motors',
      model: 'Harrier EV',
      color: 'Sapphire Metallic'
    },
    environmentalSnapshot: {
      peakImpactG: 3.1
    },
    ownerEmergencyContactPhone: '+919876543210',
    authorizedDepartments: [AUTHORITY_DEPARTMENTS.ROAD],
    sharedWithFamilyIds: [],
    authoritySharingPolicy: 'CONSENT_GRANTED',
    occurredAt: '2026-11-05T06:50:00.000Z',
    createdAt: '2026-11-05T06:50:02.000Z',
    updatedAt: '2026-11-05T06:50:02.000Z'
  },
  {
    id: 'inc_ndl_9901',
    idempotencyKey: 'idem_sos_ndl_9901',
    vehicleId: 'veh_dl01cx8890',
    deviceId: 'VX-STM32U575-4B21C9',
    incidentType: INCIDENT_TYPES.MANUAL_SOS,
    source: 'OWNER_SOS',
    isSimulated: false,
    severity: 'CRITICAL',
    confidenceScore: 1.0,
    lifecycleState: INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY,
    location: {
      lat: 28.6139,
      lng: 77.209,
      accuracyMeters: 5.0,
      roadSegmentSummary: 'Connaught Outer Circle Block H, New Delhi',
      jurisdictionCode: 'IN-DL-NDL'
    },
    vehicleSnapshot: {
      registrationNumber: 'DL01CX8890',
      vin: 'MBJ53ZBT9P0928174',
      manufacturer: 'Mahindra',
      model: 'XUV700',
      color: 'Everest White'
    },
    environmentalSnapshot: {
      cabinTempCelsius: 28.4,
      occupantDetected: true,
      coPpm: 5,
      smokeDetected: false,
      peakImpactG: 1.1
    },
    ownerEmergencyContactPhone: '+919876543210',
    authorizedDepartments: [AUTHORITY_DEPARTMENTS.MEDICAL, AUTHORITY_DEPARTMENTS.POLICE],
    sharedWithFamilyIds: [],
    authoritySharingPolicy: 'CRITICAL_LIFE_SAFETY_RULE',
    occurredAt: '2026-11-05T07:10:00.000Z',
    createdAt: '2026-11-05T07:10:01.000Z',
    updatedAt: '2026-11-05T07:10:01.000Z'
  }
];

interface IncidentResponseLogItem {
  id: string;
  incidentId: string;
  department: AuthorityDepartment;
  newState: IncidentLifecycleState;
  officerName: string;
  dispatchReferenceCode?: string;
  note: string;
  timestamp: string;
}

export default function App() {
  const firebaseConfig = useMemo(
    () =>
      resolveFirebaseWebConfig(
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
      ),
    []
  );

  const [activeDepartment, setActiveDepartment] = useState<AuthorityDepartment>(
    AUTHORITY_DEPARTMENTS.MEDICAL
  );
  const [activeJurisdiction, setActiveJurisdiction] = useState<string>('IN-UP-LKO');
  const [rawIncidents, setRawIncidents] = useState<IncidentDocument[]>(
    INITIAL_AUTHORITY_INCIDENTS
  );
  const [responseLogs, setResponseLogs] = useState<IncidentResponseLogItem[]>([
    {
      id: 'upd_01',
      incidentId: 'inc_lko_8802',
      department: AUTHORITY_DEPARTMENTS.POLICE,
      newState: INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED,
      officerName: 'Insp. R. P. Maurya (UP-112 Control Room)',
      note: 'Intrusion alert acknowledged. Nearest PCR van notified for verification.',
      timestamp: '07:47 IST'
    }
  ]);

  // Response Update Form State
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('inc_lko_8801');
  const [nextState, setNextState] = useState<
    | typeof INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED
    | typeof INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY
    | typeof INCIDENT_LIFECYCLE_STATES.RESPONSE_CONFIRMED
    | typeof INCIDENT_LIFECYCLE_STATES.RESOLVED
  >(INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED);
  const [officerName, setOfficerName] = useState(
    'Dr. A. K. Verma (Chief Emergency Medical Officer)'
  );
  const [dispatchCode, setDispatchCode] = useState('ALS-AMB-UP32-108-44');
  const [updateNote, setUpdateNote] = useState(
    'ALS trauma ambulance unit assigned to Shaheed Path KM 14.2.'
  );
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Strict Server-Equivalent Department + Jurisdiction Filtering + Redaction
  const scopedRedactedResults = useMemo(() => {
    return rawIncidents
      .map((inc) =>
        evaluateAndRedactIncidentForAuthority({
          incident: inc,
          authorityDepartment: activeDepartment,
          authorityJurisdictionCode: activeJurisdiction,
          authorityVerificationStatus: 'VERIFIED'
        })
      )
      .filter(
        (res): res is Extract<typeof res, { allowed: true }> => res.allowed === true
      );
  }, [rawIncidents, activeJurisdiction, activeDepartment]);

  const activeRoleCode =
    activeDepartment === AUTHORITY_DEPARTMENTS.MEDICAL
      ? USER_ROLES.AUTHORITY_MEDICAL
      : activeDepartment === AUTHORITY_DEPARTMENTS.POLICE
        ? USER_ROLES.AUTHORITY_POLICE
        : USER_ROLES.AUTHORITY_ROAD;

  const handleRecordAuthorityResponse = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusFeedback(null);

    const parsed = authorityIncidentUpdateSchema.safeParse({
      incidentId: selectedIncidentId,
      newState: nextState,
      note: updateNote,
      assignedOfficerName: officerName || undefined,
      dispatchReferenceCode: dispatchCode || undefined,
      visibility: 'ALL_AUTHORIZED'
    });

    if (!parsed.success) {
      setStatusFeedback({
        type: 'error',
        message: parsed.error.issues[0]?.message ?? 'Invalid response update.'
      });
      return;
    }

    setRawIncidents((prev) =>
      prev.map((inc) =>
        inc.id === parsed.data.incidentId
          ? { ...inc, lifecycleState: parsed.data.newState }
          : inc
      )
    );

    const logEntry: IncidentResponseLogItem = {
      id: `upd_${Date.now()}`,
      incidentId: parsed.data.incidentId,
      department: activeDepartment,
      newState: parsed.data.newState,
      officerName: parsed.data.assignedOfficerName ?? 'Duty Officer',
      dispatchReferenceCode: parsed.data.dispatchReferenceCode,
      note: parsed.data.note,
      timestamp: 'Just now'
    };
    setResponseLogs((prev) => [logEntry, ...prev]);
    setStatusFeedback({
      type: 'success',
      message: `Incident ${parsed.data.incidentId} transitioned to ${parsed.data.newState}. Immutable SHA-256 audit log recorded.`
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-[#0F172A] flex flex-col">
      {/* Top Authority Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E40AF] text-white flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  VeerXcape Government Authority Portal
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1E40AF] border border-blue-200">
                  {activeRoleCode}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Institutional Access Only (No Public Sign-Up) · Firebase:{' '}
                <span className="font-mono">{firebaseConfig.projectId}</span>
              </p>
            </div>
          </div>

          {/* Department & Jurisdiction Switchers */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Building className="w-4 h-4 text-[#1E40AF]" />
              <select
                aria-label="Authority Department"
                value={activeDepartment}
                onChange={(e) => setActiveDepartment(e.target.value as AuthorityDepartment)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value={AUTHORITY_DEPARTMENTS.MEDICAL}>
                  Department: MEDICAL (Trauma & EMS — AUTHORITY_MEDICAL)
                </option>
                <option value={AUTHORITY_DEPARTMENTS.POLICE}>
                  Department: POLICE (Law Enforcement — AUTHORITY_POLICE)
                </option>
                <option value={AUTHORITY_DEPARTMENTS.ROAD}>
                  Department: ROAD (Highway & PWD — AUTHORITY_ROAD Anonymized)
                </option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <MapPin className="w-4 h-4 text-slate-600" />
              <select
                aria-label="Assigned Jurisdiction Code"
                value={activeJurisdiction}
                onChange={(e) => setActiveJurisdiction(e.target.value)}
                className="bg-transparent text-xs font-mono font-semibold text-slate-800 focus:outline-none"
              >
                <option value="IN-UP-LKO">Jurisdiction: IN-UP-LKO (Lucknow District)</option>
                <option value="IN-DL-NDL">Jurisdiction: IN-DL-NDL (New Delhi NCR)</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {statusFeedback && (
        <div
          className={`border-b px-4 py-2.5 text-xs font-medium ${
            statusFeedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span>{statusFeedback.message}</span>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="underline font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl w-full mx-auto flex-1 p-4 md:p-6 space-y-6">
        {/* Data-Sharing & Redaction Policy Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#1E40AF]" />
              <span>
                Departmental Data-Sharing Policy ({activeDepartment} · {activeJurisdiction})
              </span>
            </div>
            {activeDepartment === AUTHORITY_DEPARTMENTS.ROAD ? (
              <p className="text-amber-800 font-medium">
                STRICT PII REDACTION ACTIVE (evaluateAndRedactIncidentForAuthority): As
                AUTHORITY_ROAD, you receive ONLY anonymized hazard coordinates, road segment, and
                Z-axis shock severity. Vehicle registration numbers, VINs, owner names, and phone
                numbers are stripped server-side.
              </p>
            ) : activeDepartment === AUTHORITY_DEPARTMENTS.MEDICAL ? (
              <p className="text-slate-600">
                Medical Emergency Scope: Permitted to view ACCIDENT_DETECTED, MANUAL_SOS, and
                PARKED_OCCUPANT_ALERT with cabin vitals (temperature, occupant radar, CO ppm, peak
                G-force) and emergency contact phone.
              </p>
            ) : (
              <p className="text-slate-600">
                Police Command Scope: Permitted to view ACCIDENT_DETECTED, MANUAL_SOS,
                THEFT_OR_INTRUSION_ALERT, and PARKED_OCCUPANT_ALERT with vehicle registration, VIN,
                make/model/color, and emergency owner contact.
              </p>
            )}
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 font-mono font-bold">
            Visible Incidents: {scopedRedactedResults.length}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Columns: Scoped & Redacted Incident Feed */}
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Scoped Emergency & Hazard Queue ({activeJurisdiction})
            </h2>

            {scopedRedactedResults.map((result) => {
              const inc = result.data;
              return (
                <div
                  key={inc.id}
                  className={`bg-white border rounded-xl p-5 shadow-sm space-y-3 text-xs transition ${
                    selectedIncidentId === inc.id
                      ? 'border-[#2563EB] ring-1 ring-blue-200'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {inc.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          inc.severity === 'CRITICAL'
                            ? 'bg-red-100 text-[#DC2626]'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {inc.severity} · {inc.incidentType}
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-blue-50 text-[#1E40AF] border border-blue-200">
                      {inc.lifecycleState}
                    </span>
                  </div>

                  {/* Coordinates */}
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-900">
                      {inc.location.roadSegmentSummary}
                    </div>
                    <div className="font-mono text-slate-600">
                      Lat {inc.location.lat.toFixed(4)}° N, Lng {inc.location.lng.toFixed(4)}° E (±
                      {inc.location.accuracyMeters}m) · Jurisdiction:{' '}
                      <span className="font-bold">{inc.location.jurisdictionCode}</span>
                    </div>
                  </div>

                  {/* Department-Specific Payload Rendering */}
                  {result.department === 'ROAD' ? (
                    <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-amber-900 font-medium">
                        <EyeOff className="w-4 h-4 shrink-0" />
                        <span>
                          Anonymized Road Telemetry · Peak Vertical Shock:{' '}
                          <strong>{result.data.peakImpactG ?? 'N/A'} G</strong>
                        </span>
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-white px-2 py-0.5 rounded border border-amber-300 text-amber-900">
                        Zero Vehicle/Owner PII
                      </span>
                    </div>
                  ) : result.department === 'MEDICAL' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-blue-50/40 border border-blue-100 space-y-1">
                        <div className="font-bold text-[#1E40AF]">Vehicle & Emergency Contact</div>
                        <div>
                          Reg:{' '}
                          <span className="font-mono font-bold">
                            {result.data.vehicleDescription.registrationNumber}
                          </span>{' '}
                          ({result.data.vehicleDescription.manufacturer}{' '}
                          {result.data.vehicleDescription.model})
                        </div>
                        <div>
                          Emergency Phone:{' '}
                          <span className="font-mono">
                            {result.data.emergencyContactPhone ?? 'Restricted'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-emerald-50/40 border border-emerald-100 space-y-1">
                        <div className="font-bold text-emerald-900">
                          STM32U575 Medical Cabin Snapshot
                        </div>
                        <div>
                          Impact: <strong>{result.data.environmentalSnapshot?.peakImpactG} G</strong>{' '}
                          · Occupant:{' '}
                          <strong>
                            {result.data.environmentalSnapshot?.occupantDetected ? 'YES' : 'NO'}
                          </strong>
                        </div>
                        <div>
                          Cabin Temp: {result.data.environmentalSnapshot?.cabinTempCelsius}°C · CO:{' '}
                          {result.data.environmentalSnapshot?.coPpm} ppm
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-blue-50/40 border border-blue-100 space-y-1">
                      <div className="font-bold text-[#1E40AF]">
                        Police Vehicle & VIN Identification
                      </div>
                      <div>
                        Reg:{' '}
                        <span className="font-mono font-bold">
                          {result.data.vehicleIdentification.registrationNumber}
                        </span>{' '}
                        · VIN:{' '}
                        <span className="font-mono">
                          {result.data.vehicleIdentification.vin}
                        </span>
                      </div>
                      <div>
                        Make/Model: {result.data.vehicleIdentification.manufacturer}{' '}
                        {result.data.vehicleIdentification.model} (
                        {result.data.vehicleIdentification.color}) · Emergency Phone:{' '}
                        <span className="font-mono">
                          {result.data.emergencyContactPhone ?? 'N/A'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-slate-400">
                      Occurred: {new Date(inc.occurredAt).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedIncidentId(inc.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold"
                    >
                      Select for Response Action
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 5 Columns: Truthful Authority Lifecycle Action Desk & Audit Trail */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Record Official Authority Lifecycle Transition
                </h2>
                <p className="text-slate-500 mt-0.5">
                  Strictly separates portal visibility (VISIBLE_TO_AUTHORITY) from officer
                  acknowledgement, recorded dispatch, and confirmed on-scene arrival.
                </p>
              </div>

              <form onSubmit={handleRecordAuthorityResponse} className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Target Incident ID
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={selectedIncidentId}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Official Lifecycle Transition State
                  </label>
                  <select
                    value={nextState}
                    onChange={(e) =>
                      setNextState(
                        e.target.value as
                          | typeof INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED
                          | typeof INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY
                          | typeof INCIDENT_LIFECYCLE_STATES.RESPONSE_CONFIRMED
                          | typeof INCIDENT_LIFECYCLE_STATES.RESOLVED
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value={INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED}>
                      1. AUTHORITY_ACKNOWLEDGED (Officer Reviewed on Desk)
                    </option>
                    <option value={INCIDENT_LIFECYCLE_STATES.DISPATCH_RECORDED_BY_AUTHORITY}>
                      2. DISPATCH_RECORDED_BY_AUTHORITY (Unit / Call-Sign Dispatched)
                    </option>
                    <option value={INCIDENT_LIFECYCLE_STATES.RESPONSE_CONFIRMED}>
                      3. RESPONSE_CONFIRMED (Responder Confirmed On-Scene)
                    </option>
                    <option value={INCIDENT_LIFECYCLE_STATES.RESOLVED}>
                      4. RESOLVED (Incident Closed & Logged)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Assigned Duty Officer Name & Rank
                  </label>
                  <input
                    type="text"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Official Dispatch Reference / Call-Sign
                  </label>
                  <input
                    type="text"
                    value={dispatchCode}
                    onChange={(e) => setDispatchCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Action & Field Response Note
                  </label>
                  <textarea
                    rows={3}
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-[#1E40AF] hover:bg-blue-900 text-white font-bold shadow-sm transition"
                >
                  Commit Audited Authority Status Update
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900">
                Audited Authority Action Log ({responseLogs.length})
              </h3>
              {responseLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                >
                  <div className="flex items-center justify-between font-mono font-bold text-slate-900">
                    <span>
                      {log.incidentId} → {log.newState}
                    </span>
                    <span className="text-[11px] text-slate-500">{log.timestamp}</span>
                  </div>
                  <div className="text-slate-700">{log.note}</div>
                  <div className="text-[11px] text-slate-500">
                    Officer: {log.officerName} ({log.department})
                    {log.dispatchReferenceCode ? ` · Ref: ${log.dispatchReferenceCode}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
