import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bell,
  Car,
  CheckCircle2,
  Clock,
  Cpu,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  PhoneCall,
  Plus,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  Smartphone,
  Thermometer,
  Trash2,
  UserCheck,
  Users,
  Wifi
} from 'lucide-react';
import {
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  LOCATION_FRESHNESS_STATES,
  NOTIFICATION_STATUSES,
  USER_ROLES,
  type LocationFreshnessState,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import {
  VEERXCAPE_NATIVE_APP_METADATA,
  computeLocationFreshness,
  resolveFirebaseWebConfig
} from '@veerxcape/shared-services';
import {
  customerAccountActivationSchema,
  customerPhoneLoginSchema,
  familyMemberActivationSchema,
  familyMemberInviteSchema,
  otpCodeSchema,
  phoneE164Schema,
  strongPasswordSchema
} from '@veerxcape/shared-validation';
import {
  INITIAL_DRIVERS,
  INITIAL_FAMILY_MEMBERS,
  INITIAL_INCIDENTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TICKETS,
  INITIAL_VEHICLES,
  SUPPORTED_MOBILE_ROLES,
  type MobileDriverItem,
  type MobileFamilyMemberItem,
  type MobileIncidentItem,
  type MobileNotificationItem,
  type MobileSupportTicketItem,
  type MobileVehicleRecord
} from './data/mobileSeedData';

type AuthMode =
  | 'SPLASH_ONBOARDING'
  | 'LOGIN'
  | 'ACTIVATE_SHOWROOM_ACCOUNT'
  | 'ACTIVATE_FAMILY_INVITE'
  | 'FORGOT_PASSWORD';

type MobileScreenId =
  | 'HOME_DASHBOARD'
  | 'MY_VEHICLES'
  | 'VEHICLE_DETAILS'
  | 'LIVE_TELEMETRY'
  | 'EMERGENCY_SOS'
  | 'INCIDENT_HISTORY'
  | 'FAMILY_MEMBERS'
  | 'FAMILY_PERMISSIONS'
  | 'DRIVER_ACCESS'
  | 'NOTIFICATIONS'
  | 'ACCOUNT_PRIVACY'
  | 'HELP_SUPPORT';

function getFreshnessBadgeStyle(state: LocationFreshnessState): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (state) {
    case LOCATION_FRESHNESS_STATES.LIVE:
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500 animate-pulse'
      };
    case LOCATION_FRESHNESS_STATES.RECENT:
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-800',
        border: 'border-blue-200',
        dot: 'bg-blue-500'
      };
    case LOCATION_FRESHNESS_STATES.STALE:
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        dot: 'bg-amber-500'
      };
    case LOCATION_FRESHNESS_STATES.OFFLINE:
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
        dot: 'bg-slate-400'
      };
  }
}

export default function App() {
  const firebaseWebConfig = useMemo(
    () =>
      resolveFirebaseWebConfig(
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
      ),
    []
  );

  // Authentication & Session State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [activeRole, setActiveRole] = useState<UserRoleCode>(USER_ROLES.VEHICLE_OWNER);
  const [activeScreen, setActiveScreen] = useState<MobileScreenId>('HOME_DASHBOARD');

  // Auth Form Inputs
  const [loginPhone, setLoginPhone] = useState('+919876543210');
  const [loginPassword, setLoginPassword] = useState('VeerSafe2026');
  const [otpInput, setOtpInput] = useState('482910');
  const [initialInvitePassword, setInitialInvitePassword] = useState('TempInvite99');
  const [newPasswordInput, setNewPasswordInput] = useState('StrongOwner99');
  const [authMessage, setAuthMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  // Domain State
  const [vehicles, setVehicles] = useState<MobileVehicleRecord[]>(INITIAL_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(INITIAL_VEHICLES[0].id);
  const [familyMembers, setFamilyMembers] =
    useState<MobileFamilyMemberItem[]>(INITIAL_FAMILY_MEMBERS);
  const [drivers, setDrivers] = useState<MobileDriverItem[]>(INITIAL_DRIVERS);
  const [incidents, setIncidents] = useState<MobileIncidentItem[]>(INITIAL_INCIDENTS);
  const [notifications, setNotifications] =
    useState<MobileNotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [tickets, setTickets] = useState<MobileSupportTicketItem[]>(INITIAL_TICKETS);

  // Emergency SOS Countdown State
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const [sosNote, setSosNote] = useState<string>(
    'Immediate medical and highway patrol assistance required at current vehicle coordinates.'
  );
  const [bannerFeedback, setBannerFeedback] = useState<string | null>(null);

  // Family Member Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('+91');
  const [inviteRelationship, setInviteRelationship] = useState('Sibling');
  const [inviteTempPassword, setInviteTempPassword] = useState('FamilyInit2026');
  const [invitePerms, setInvitePerms] = useState({
    canViewLocation: true,
    canViewTelemetry: true,
    canReceiveCriticalAlerts: true,
    canViewIncidentHistory: true,
    canTriggerSos: false
  });

  // Driver Form State
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('+91');
  const [driverLicense, setDriverLicense] = useState('');
  const [driverShift, setDriverShift] = useState('Mon–Fri · 09:00–18:00 IST');

  // Support Ticket Form State
  const [ticketCategory, setTicketCategory] =
    useState<MobileSupportTicketItem['category']>('DEVICE_ISSUE');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');

  // Privacy & Consent Toggles
  const [shareMedicalDataOnCrash, setShareMedicalDataOnCrash] = useState(true);
  const [shareAnonymizedRoadHazards, setShareAnonymizedRoadHazards] = useState(true);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0],
    [vehicles, selectedVehicleId]
  );

  // Compute standardized freshness using @veerxcape/shared-services
  const freshnessEvaluation = useMemo(() => {
    const nowMs = Date.now();
    const lastLocIso = new Date(
      nowMs - selectedVehicle.lastLocationUpdateSecondsAgo * 1000
    ).toISOString();
    const lastHbIso = new Date(
      nowMs - selectedVehicle.lastHeartbeatSecondsAgo * 1000
    ).toISOString();
    return computeLocationFreshness({
      lastLocationRecordedAt: lastLocIso,
      lastHeartbeatAt: lastHbIso,
      nowMs
    });
  }, [selectedVehicle]);

  // Active Family Member view permissions (when viewing as FAMILY_MEMBER)
  const activeFamilyMemberRecord = useMemo(
    () =>
      familyMembers.find(
        (f) => f.vehicleId === selectedVehicle.id && f.status === 'ACTIVE'
      ) ?? familyMembers[0],
    [familyMembers, selectedVehicle.id]
  );

  // SOS 5-second safety countdown effect
  useEffect(() => {
    if (sosCountdown === null) return;
    if (sosCountdown <= 0) {
      const newIncident: MobileIncidentItem = {
        id: `inc_${Math.floor(1000 + Math.random() * 9000)}`,
        vehicleId: selectedVehicle.id,
        registrationNumber: selectedVehicle.registrationNumber,
        incidentType: INCIDENT_TYPES.MANUAL_SOS,
        source: 'MANUAL_USER_SOS',
        severity: 'CRITICAL',
        lifecycleState: INCIDENT_LIFECYCLE_STATES.VISIBLE_TO_AUTHORITY,
        jurisdictionCode: selectedVehicle.jurisdictionCode,
        roadSegmentSummary: selectedVehicle.roadSegmentSummary,
        lat: selectedVehicle.lat,
        lng: selectedVehicle.lng,
        occurredAt: 'Just now',
        description: sosNote,
        assignedAuthorityDept: ['MEDICAL', 'POLICE']
      };
      setIncidents((prev) => [newIncident, ...prev]);
      setNotifications((prev) => [
        {
          id: `notif_${Date.now()}`,
          title: `CRITICAL: Manual SOS Triggered (${selectedVehicle.registrationNumber})`,
          body: `Incident ${newIncident.id} is now VISIBLE_TO_AUTHORITY (${selectedVehicle.jurisdictionCode}). Waiting for authority officer acknowledgement.`,
          category: 'EMERGENCY',
          status: NOTIFICATION_STATUSES.FCM_ACCEPTED,
          createdAt: 'Just now'
        },
        ...prev
      ]);
      setSosCountdown(null);
      setBannerFeedback(
        `Emergency SOS ${newIncident.id} transmitted. Status: VISIBLE_TO_AUTHORITY (Awaiting Medical & Police Desk Acknowledgement).`
      );
      setActiveScreen('INCIDENT_HISTORY');
      return;
    }
    const timer = setTimeout(() => {
      setSosCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [sosCountdown, selectedVehicle, sosNote]);

  // Handlers for Authentication Flows
  const handleCustomerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const parsed = customerPhoneLoginSchema.safeParse({
      phoneE164: loginPhone,
      password: loginPassword
    });
    if (!parsed.success) {
      setAuthMessage({
        type: 'error',
        text: parsed.error.issues[0]?.message ?? 'Invalid phone or password.'
      });
      return;
    }
    setIsAuthenticated(true);
    setBannerFeedback(`Signed in as ${parsed.data.phoneE164} via Firebase Custom Token.`);
  };

  const handleActivateShowroomAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const parsed = customerAccountActivationSchema.safeParse({
      phoneE164: loginPhone,
      otpCode: otpInput,
      newPassword: newPasswordInput
    });
    if (!parsed.success) {
      setAuthMessage({
        type: 'error',
        text: parsed.error.issues[0]?.message ?? 'Invalid activation details.'
      });
      return;
    }
    setIsAuthenticated(true);
    setBannerFeedback(
      `Account activated for ${parsed.data.phoneE164}. Scrypt password verifier stored in _authSecrets.`
    );
  };

  const handleActivateFamilyInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const parsed = familyMemberActivationSchema.safeParse({
      phoneE164: loginPhone,
      otpCode: otpInput,
      initialPassword: initialInvitePassword,
      newPermanentPassword: newPasswordInput
    });
    if (!parsed.success) {
      setAuthMessage({
        type: 'error',
        text: parsed.error.issues[0]?.message ?? 'Invalid family activation input.'
      });
      return;
    }
    setFamilyMembers((prev) =>
      prev.map((m) =>
        m.phoneE164 === parsed.data.phoneE164 ? { ...m, status: 'ACTIVE' } : m
      )
    );
    setActiveRole(USER_ROLES.FAMILY_MEMBER);
    setIsAuthenticated(true);
    setBannerFeedback(
      `Family invite activated for ${parsed.data.phoneE164}. Initial password replaced with your private password.`
    );
  };

  const handlePasswordRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage(null);
    const phoneCheck = phoneE164Schema.safeParse(loginPhone);
    const otpCheck = otpCodeSchema.safeParse(otpInput);
    const passCheck = strongPasswordSchema.safeParse(newPasswordInput);
    if (!phoneCheck.success || !otpCheck.success || !passCheck.success) {
      setAuthMessage({
        type: 'error',
        text:
          phoneCheck.error?.issues[0]?.message ||
          otpCheck.error?.issues[0]?.message ||
          passCheck.error?.issues[0]?.message ||
          'Validation failed'
      });
      return;
    }
    setAuthMessage({
      type: 'success',
      text: 'Password reset verified via OTP. All prior refresh tokens revoked. Please sign in.'
    });
    setAuthMode('LOGIN');
  };

  // Invite Family Member Handler
  const handleInviteFamilyMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRole !== USER_ROLES.VEHICLE_OWNER) {
      setBannerFeedback('Only the Vehicle Owner can invite or modify family members.');
      return;
    }
    const parsed = familyMemberInviteSchema.safeParse({
      vehicleId: selectedVehicle.id,
      familyMemberName: inviteName,
      familyMemberPhoneE164: invitePhone,
      relationship: inviteRelationship,
      initialPassword: inviteTempPassword,
      permissions: invitePerms
    });
    if (!parsed.success) {
      setBannerFeedback(`Validation Error: ${parsed.error.issues[0]?.message}`);
      return;
    }
    const newMember: MobileFamilyMemberItem = {
      id: `fam_${Date.now()}`,
      vehicleId: selectedVehicle.id,
      fullName: parsed.data.familyMemberName,
      phoneE164: parsed.data.familyMemberPhoneE164,
      relationship: parsed.data.relationship,
      status: 'PENDING_OTP_AND_PASSWORD_CHANGE',
      invitedAt: 'Just now',
      permissions: parsed.data.permissions
    };
    setFamilyMembers((prev) => [newMember, ...prev]);
    setInviteName('');
    setInvitePhone('+91');
    setBannerFeedback(
      `Invited ${newMember.fullName} (${newMember.phoneE164}). They must verify OTP & change initial password on first login.`
    );
  };

  // Toggle Family Permission
  const toggleFamilyPermission = (
    memberId: string,
    key: keyof MobileFamilyMemberItem['permissions']
  ) => {
    if (activeRole !== USER_ROLES.VEHICLE_OWNER) {
      setBannerFeedback('Only the Vehicle Owner can modify family member permissions.');
      return;
    }
    setFamilyMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              permissions: {
                ...m.permissions,
                [key]: !m.permissions[key]
              }
            }
          : m
      )
    );
    setBannerFeedback('Family member permission updated and logged to immutable audit trail.');
  };

  // Revoke Family Member Immediately
  const revokeFamilyMember = (memberId: string) => {
    if (activeRole !== USER_ROLES.VEHICLE_OWNER) return;
    setFamilyMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, status: 'REVOKED' } : m))
    );
    setBannerFeedback(
      'Family membership immediately set to REVOKED. Server-side access and active tokens invalidated.'
    );
  };

  // Add Authorized Driver
  const handleAddDriver = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneRes = phoneE164Schema.safeParse(driverPhone);
    if (!phoneRes.success || driverName.trim().length < 2 || driverLicense.trim().length < 5) {
      setBannerFeedback('Please enter a valid driver name, E.164 phone number, and license ID.');
      return;
    }
    const newDrv: MobileDriverItem = {
      id: `drv_${Date.now()}`,
      vehicleId: selectedVehicle.id,
      fullName: driverName.trim(),
      phoneE164: phoneRes.data,
      licenseNumber: driverLicense.trim().toUpperCase(),
      status: 'ACTIVE',
      assignedShift: driverShift
    };
    setDrivers((prev) => [newDrv, ...prev]);
    setDriverName('');
    setDriverPhone('+91');
    setDriverLicense('');
    setBannerFeedback(`Driver ${newDrv.fullName} authorized for ${selectedVehicle.registrationNumber}.`);
  };

  // Simulate STM32U575 Hardware State or Freshness Change
  const updateVehicleFreshnessSimulation = (locSec: number, hbSec: number) => {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === selectedVehicle.id
          ? {
              ...v,
              lastLocationUpdateSecondsAgo: locSec,
              lastHeartbeatSecondsAgo: hbSec
            }
          : v
      )
    );
  };

  const simulateHardwareEvent = (
    type:
      | typeof INCIDENT_TYPES.ACCIDENT_DETECTED
      | typeof INCIDENT_TYPES.PARKED_OCCUPANT_ALERT
      | typeof INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT
      | typeof INCIDENT_TYPES.DEVICE_POWER_FAILURE
  ) => {
    const newInc: MobileIncidentItem = {
      id: `inc_hw_${Math.floor(1000 + Math.random() * 9000)}`,
      vehicleId: selectedVehicle.id,
      registrationNumber: selectedVehicle.registrationNumber,
      incidentType: type,
      source: 'STM32U575_HARDWARE',
      severity: type === INCIDENT_TYPES.ACCIDENT_DETECTED ? 'CRITICAL' : 'HIGH',
      lifecycleState: INCIDENT_LIFECYCLE_STATES.VISIBLE_TO_AUTHORITY,
      jurisdictionCode: selectedVehicle.jurisdictionCode,
      roadSegmentSummary: selectedVehicle.roadSegmentSummary,
      lat: selectedVehicle.lat,
      lng: selectedVehicle.lng,
      occurredAt: 'Just now (STM32U575 Signed Packet)',
      description: `Hardware sensor packet verified via HMAC-SHA256 (${selectedVehicle.assignedDeviceSerial}). Event routed to ${selectedVehicle.jurisdictionCode} authorities.`,
      assignedAuthorityDept:
        type === INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT
          ? ['POLICE']
          : ['MEDICAL', 'POLICE']
    };
    setIncidents((prev) => [newInc, ...prev]);
    setBannerFeedback(
      `Simulated STM32U575 ${type} packet ingested. Incident ${newInc.id} is now VISIBLE_TO_AUTHORITY.`
    );
  };

  // Cancel False Alarm
  const handleCancelFalseAlarm = (incidentId: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === incidentId
          ? { ...inc, lifecycleState: INCIDENT_LIFECYCLE_STATES.FALSE_ALARM_CANCELLED }
          : inc
      )
    );
    setBannerFeedback(`Incident ${incidentId} marked as FALSE_ALARM_CANCELLED by verified user.`);
  };

  // Notification Status Progression (FCM_ACCEPTED -> CLIENT_DELIVERED_ACK -> READ)
  const advanceNotificationState = (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== notifId) return n;
        if (n.status === NOTIFICATION_STATUSES.FCM_ACCEPTED) {
          return {
            ...n,
            status: NOTIFICATION_STATUSES.CLIENT_DELIVERED_ACK,
            deliveredAt: 'Just now'
          };
        }
        return {
          ...n,
          status: NOTIFICATION_STATUSES.READ,
          readAt: 'Just now'
        };
      })
    );
  };

  // Submit Support Ticket
  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticketSubject.trim().length < 4 || ticketDescription.trim().length < 8) {
      setBannerFeedback('Please provide a clear subject and description for your support ticket.');
      return;
    }
    const newTicket: MobileSupportTicketItem = {
      id: `tkt_${Math.floor(400 + Math.random() * 500)}`,
      vehicleId: selectedVehicle.id,
      category: ticketCategory,
      subject: ticketSubject.trim(),
      description: ticketDescription.trim(),
      status: 'OPEN',
      createdAt: new Date().toISOString().slice(0, 10)
    };
    setTickets((prev) => [newTicket, ...prev]);
    setTicketSubject('');
    setTicketDescription('');
    setBannerFeedback(`Support Ticket ${newTicket.id} submitted to VeerXcape Support Desk.`);
  };

  // ============================================================================
  // UNAUTHENTICATED VIEW (Screens 1, 2, 3: Splash/Onboarding, Login/Activation, Recovery)
  // ============================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-[#1E40AF] text-white p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className="w-7 h-7 text-white" />
                <div>
                  <h1 className="text-lg font-bold tracking-tight">VeerXcape Mobile</h1>
                  <p className="text-xs text-blue-100">
                    Connected Vehicle Safety & STM32U575 Companion
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono bg-blue-900/60 px-2.5 py-1 rounded-full border border-blue-400/30">
                {VEERXCAPE_NATIVE_APP_METADATA.bundleId}
              </span>
            </div>
          </div>

          {/* Auth Mode Switcher Tabs */}
          <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => {
                setAuthMode('SPLASH_ONBOARDING');
                setAuthMessage(null);
              }}
              className={`py-2.5 px-2 border-b-2 transition ${
                authMode === 'SPLASH_ONBOARDING'
                  ? 'border-[#2563EB] text-[#1E40AF] bg-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              1. Intro
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('LOGIN');
                setAuthMessage(null);
              }}
              className={`py-2.5 px-2 border-b-2 transition ${
                authMode === 'LOGIN'
                  ? 'border-[#2563EB] text-[#1E40AF] bg-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              2. Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('ACTIVATE_SHOWROOM_ACCOUNT');
                setAuthMessage(null);
              }}
              className={`py-2.5 px-2 border-b-2 transition ${
                authMode === 'ACTIVATE_SHOWROOM_ACCOUNT' ||
                authMode === 'ACTIVATE_FAMILY_INVITE'
                  ? 'border-[#2563EB] text-[#1E40AF] bg-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              3. Activate
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('FORGOT_PASSWORD');
                setAuthMessage(null);
              }}
              className={`py-2.5 px-2 border-b-2 transition ${
                authMode === 'FORGOT_PASSWORD'
                  ? 'border-[#2563EB] text-[#1E40AF] bg-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              4. Recovery
            </button>
          </div>

          <div className="p-6 space-y-4">
            {authMessage && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border ${
                  authMessage.type === 'error'
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {authMessage.text}
              </div>
            )}

            {authMode === 'SPLASH_ONBOARDING' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#1E40AF]">
                    Showroom-Provisioned Vehicle Architecture
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Vehicles and STM32U575 hardware units are registered exclusively by authorized
                    OEM Dealerships. Customers never self-register vehicles—simply activate your
                    showroom-verified phone number or family invitation to begin.
                  </p>
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Real-time STM32U575 crash, cabin radar, CO & smoke monitoring</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Explicit LIVE / RECENT / STALE / OFFLINE telemetry freshness</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Granular family member permissions & instant revocation</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthMode('LOGIN')}
                  className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold text-sm rounded-lg transition"
                >
                  Continue to Phone + Password Login
                </button>
              </div>
            )}

            {authMode === 'LOGIN' && (
              <form onSubmit={handleCustomerLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Phone Number (E.164 Login ID)
                  </label>
                  <input
                    type="text"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Account Password
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold text-sm rounded-lg transition"
                >
                  Sign In with Phone & Password
                </button>
              </form>
            )}

            {(authMode === 'ACTIVATE_SHOWROOM_ACCOUNT' ||
              authMode === 'ACTIVATE_FAMILY_INVITE') && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('ACTIVATE_SHOWROOM_ACCOUNT')}
                    className={`flex-1 py-1.5 text-xs rounded-md font-medium border ${
                      authMode === 'ACTIVATE_SHOWROOM_ACCOUNT'
                        ? 'bg-blue-50 border-blue-300 text-[#1E40AF]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Showroom Owner OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('ACTIVATE_FAMILY_INVITE')}
                    className={`flex-1 py-1.5 text-xs rounded-md font-medium border ${
                      authMode === 'ACTIVATE_FAMILY_INVITE'
                        ? 'bg-blue-50 border-blue-300 text-[#1E40AF]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Family Invite Activation
                  </button>
                </div>

                <form
                  onSubmit={
                    authMode === 'ACTIVATE_SHOWROOM_ACCOUNT'
                      ? handleActivateShowroomAccount
                      : handleActivateFamilyInvite
                  }
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number (E.164)
                    </label>
                    <input
                      type="text"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      6-Digit SMS OTP Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  {authMode === 'ACTIVATE_FAMILY_INVITE' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Owner-Assigned Initial Password
                      </label>
                      <input
                        type="password"
                        value={initialInvitePassword}
                        onChange={(e) => setInitialInvitePassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Set Your Private Strong Password
                    </label>
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Min 8 chars, 1 uppercase, 1 lowercase, 1 number. Vehicle reg numbers forbidden.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-[#059669] hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg transition"
                  >
                    Verify OTP & Activate Account
                  </button>
                </form>
              </div>
            )}

            {authMode === 'FORGOT_PASSWORD' && (
              <form onSubmit={handlePasswordRecovery} className="space-y-3">
                <p className="text-xs text-slate-600">
                  Verify your registered E.164 phone number via 6-digit OTP to set a new password
                  and revoke all prior sessions.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registered Phone Number
                  </label>
                  <input
                    type="text"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    6-Digit Recovery OTP
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Strong Password
                  </label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold text-sm rounded-lg transition"
                >
                  Reset Password & Revoke Old Sessions
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const badgeColors = getFreshnessBadgeStyle(freshnessEvaluation.state);
  const unreadNotifCount = notifications.filter(
    (n) => n.status !== NOTIFICATION_STATUSES.READ
  ).length;

  const navigationItems: {
    id: MobileScreenId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
  }[] = [
    { id: 'HOME_DASHBOARD', label: '1. Home Dashboard', icon: Shield },
    { id: 'MY_VEHICLES', label: '2. My / Shared Vehicles', icon: Car, badge: vehicles.length },
    { id: 'VEHICLE_DETAILS', label: '3. Vehicle & Showroom', icon: Cpu },
    {
      id: 'LIVE_TELEMETRY',
      label: '4. Live STM32U575 Status',
      icon: Activity,
      badge: freshnessEvaluation.state
    },
    { id: 'EMERGENCY_SOS', label: '5. Emergency SOS Desk', icon: ShieldAlert },
    {
      id: 'INCIDENT_HISTORY',
      label: '6. Incident History',
      icon: AlertTriangle,
      badge: incidents.length
    },
    {
      id: 'FAMILY_MEMBERS',
      label: '7. Family Invitations',
      icon: Users,
      badge: familyMembers.filter((f) => f.vehicleId === selectedVehicle.id).length
    },
    { id: 'FAMILY_PERMISSIONS', label: '8. Family Permissions', icon: KeyRound },
    { id: 'DRIVER_ACCESS', label: '9. Driver Profile & Shift', icon: UserCheck },
    {
      id: 'NOTIFICATIONS',
      label: '10. Notifications',
      icon: Bell,
      badge: unreadNotifCount > 0 ? unreadNotifCount : undefined
    },
    { id: 'ACCOUNT_PRIVACY', label: '11. Account & Privacy', icon: Lock },
    { id: 'HELP_SUPPORT', label: '12. Help & Support', icon: HelpCircle }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-[#0F172A] flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E40AF] flex items-center justify-center text-white shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">VeerXcape Mobile</h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-[#1E40AF] border border-blue-200">
                  {activeRole}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Firebase Project: <span className="font-mono">{firebaseWebConfig.projectId}</span> ·
                Native ID: <span className="font-mono">{VEERXCAPE_NATIVE_APP_METADATA.bundleId}</span>
              </p>
            </div>
          </div>

          {/* Active Vehicle + Role Switcher + Sign Out */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <Car className="w-4 h-4 text-[#1E40AF]" />
              <select
                aria-label="Select Active Vehicle"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationNumber} — {v.manufacturer} {v.model}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <Users className="w-4 h-4 text-slate-600" />
              <select
                aria-label="Switch Mobile Role View"
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value as UserRoleCode)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                {SUPPORTED_MOBILE_ROLES.map((r) => (
                  <option key={r.role} value={r.role}>
                    Role: {r.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setActiveScreen('EMERGENCY_SOS')}
              className="px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              SOS
            </button>

            <button
              type="button"
              onClick={() => {
                setIsAuthenticated(false);
                setAuthMode('LOGIN');
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-700 flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Feedback Banner */}
      {bannerFeedback && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 text-xs text-[#1E40AF] font-medium">
            <span>{bannerFeedback}</span>
            <button
              type="button"
              onClick={() => setBannerFeedback(null)}
              className="text-blue-700 underline font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="max-w-7xl w-full mx-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6">
        {/* Left Navigation Drawer */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-2">
              Mobile Screens (15 Flows)
            </div>
            <nav className="space-y-1">
              {navigationItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveScreen(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-blue-50 text-[#1E40AF] font-semibold border border-blue-200'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <IconComponent className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          item.id === 'LIVE_TELEMETRY'
                            ? `${badgeColors.bg} ${badgeColors.text}`
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Location Freshness Contract Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Telemetry Freshness Gate</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}
              >
                <span className={`w-2 h-2 rounded-full ${badgeColors.dot}`} />
                {freshnessEvaluation.state}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {freshnessEvaluation.displayLabel}
            </p>
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateVehicleFreshnessSimulation(12, 15)}
                className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
              >
                Set LIVE (12s)
              </button>
              <button
                type="button"
                onClick={() => updateVehicleFreshnessSimulation(180, 45)}
                className="text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium"
              >
                Set RECENT (3m)
              </button>
              <button
                type="button"
                onClick={() => updateVehicleFreshnessSimulation(420, 120)}
                className="text-[11px] px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium"
              >
                Set STALE (7m)
              </button>
              <button
                type="button"
                onClick={() => updateVehicleFreshnessSimulation(900, 750)}
                className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-700 border border-slate-300 font-medium"
              >
                Set OFFLINE (15m)
              </button>
            </div>
          </div>
        </aside>

        {/* Right Screen Viewport */}
        <main className="lg:col-span-9 space-y-6">
          {/* ================================================================
              SCREEN 4: ROLE-AWARE HOME DASHBOARD
          ================================================================ */}
          {activeScreen === 'HOME_DASHBOARD' && (
            <div className="space-y-6">
              {/* Role Context Banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#1E40AF]">
                      {SUPPORTED_MOBILE_ROLES.find((r) => r.role === activeRole)?.badge}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-mono text-slate-600">
                      {selectedVehicle.registrationNumber}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedVehicle.manufacturer} {selectedVehicle.model} ({selectedVehicle.variant})
                  </h2>
                  <p className="text-xs text-slate-600">
                    {SUPPORTED_MOBILE_ROLES.find((r) => r.role === activeRole)?.summary}
                  </p>
                </div>

                {/* Standardized Freshness Badge */}
                <div
                  className={`p-3 rounded-xl border ${badgeColors.bg} ${badgeColors.border} min-w-[230px]`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${badgeColors.text}`}>
                      Status: {freshnessEvaluation.state}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${badgeColors.dot}`} />
                  </div>
                  <p className={`text-[11px] font-medium ${badgeColors.text}`}>
                    {freshnessEvaluation.displayLabel}
                  </p>
                  {!freshnessEvaluation.isLive && (
                    <p className="text-[10px] text-slate-600 mt-1 font-semibold">
                      WARNING: Coordinates are historical ({freshnessEvaluation.state}) — not live.
                    </p>
                  )}
                </div>
              </div>

              {/* Family Permission Enforcement Notice if viewing as FAMILY_MEMBER */}
              {activeRole === USER_ROLES.FAMILY_MEMBER && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-slate-800 space-y-2">
                  <div className="font-bold text-[#1E40AF]">
                    Viewing as Authorised Family Member: {activeFamilyMemberRecord.fullName} (
                    {activeFamilyMemberRecord.relationship})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        activeFamilyMemberRecord.permissions.canViewLocation
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      Location: {activeFamilyMemberRecord.permissions.canViewLocation ? 'ALLOWED' : 'DENIED'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        activeFamilyMemberRecord.permissions.canViewTelemetry
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      Telemetry: {activeFamilyMemberRecord.permissions.canViewTelemetry ? 'ALLOWED' : 'DENIED'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        activeFamilyMemberRecord.permissions.canTriggerSos
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      Trigger SOS: {activeFamilyMemberRecord.permissions.canTriggerSos ? 'ALLOWED' : 'DENIED'}
                    </span>
                  </div>
                </div>
              )}

              {/* Primary Telemetry & Safety Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Location Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>GNSS Coordinates ({freshnessEvaluation.state})</span>
                    <MapPin className="w-4 h-4 text-[#2563EB]" />
                  </div>
                  {activeRole === USER_ROLES.FAMILY_MEMBER &&
                  !activeFamilyMemberRecord.permissions.canViewLocation ? (
                    <div className="py-3 text-xs text-red-700 font-medium">
                      Location visibility restricted by Vehicle Owner.
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-slate-900">
                        {selectedVehicle.roadSegmentSummary}
                      </div>
                      <div className="text-xs font-mono text-slate-600">
                        {selectedVehicle.lat.toFixed(4)}° N, {selectedVehicle.lng.toFixed(4)}° E ·{' '}
                        {selectedVehicle.speedKmh} km/h
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Jurisdiction: <span className="font-semibold">{selectedVehicle.jurisdictionCode}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* STM32U575 Cabin Environment Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Cabin Safety & Sensors</span>
                    <Thermometer className="w-4 h-4 text-[#2563EB]" />
                  </div>
                  {activeRole === USER_ROLES.FAMILY_MEMBER &&
                  !activeFamilyMemberRecord.permissions.canViewTelemetry ? (
                    <div className="py-3 text-xs text-red-700 font-medium">
                      Sensor telemetry restricted by Vehicle Owner.
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-slate-900">
                        {selectedVehicle.cabinTempCelsius}°C · CO: {selectedVehicle.coPpm} ppm
                      </div>
                      <div className="text-xs text-slate-600">
                        Occupant Radar:{' '}
                        <span className="font-semibold">
                          {selectedVehicle.occupantDetected ? 'Occupant Present' : 'Unoccupied'}
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium">
                        Peak Impact: {selectedVehicle.peakImpactG}G (Normal) · Smoke: Clear
                      </div>
                    </>
                  )}
                </div>

                {/* Power & Hardware Link Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>STM32U575 Hardware Health</span>
                    <BatteryCharging className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 font-mono">
                    {selectedVehicle.assignedDeviceSerial}
                  </div>
                  <div className="text-xs text-slate-600">
                    Power: {selectedVehicle.powerSource} ({(selectedVehicle.mainVoltageMv / 1000).toFixed(2)}V) · Backup: {selectedVehicle.backupBatteryPercent}%
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Firmware: {selectedVehicle.firmwareVersion} · RSSI: {selectedVehicle.cellularRssiDbm} dBm
                  </div>
                </div>
              </div>

              {/* Quick Action Tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveScreen('EMERGENCY_SOS')}
                  className="p-4 rounded-xl bg-red-50 hover:bg-red-100/80 border border-red-200 text-left transition"
                >
                  <div className="text-xs font-bold text-[#DC2626] flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    Trigger Emergency SOS
                  </div>
                  <p className="text-[11px] text-red-900/80 mt-1">
                    5-second safety countdown with authority & family dispatch routing
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScreen('LIVE_TELEMETRY')}
                  className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left transition"
                >
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-[#2563EB]" />
                    STM32U575 Live Telemetry
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Inspect IMU, GNSS, cabin radar, and test hardware event packets
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScreen('FAMILY_PERMISSIONS')}
                  className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left transition"
                >
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-[#2563EB]" />
                    Family Access Matrix
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Granular per-member location, telemetry & SOS toggles
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScreen('INCIDENT_HISTORY')}
                  className="p-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left transition"
                >
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Incident Timeline ({incidents.length})
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Track authority acknowledgement, dispatch & false-alarm cancel
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 5: MY VEHICLES / SHARED VEHICLES
          ================================================================ */}
          {activeScreen === 'MY_VEHICLES' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    My Registered & Shared Vehicles
                  </h2>
                  <p className="text-xs text-slate-500">
                    Vehicles are registered by authorized OEM showrooms and bound via deterministic
                    locks (_uniqueLocks).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vehicles.map((v) => {
                  const isSelected = v.id === selectedVehicle.id;
                  const evalState = computeLocationFreshness({
                    lastLocationRecordedAt: new Date(
                      Date.now() - v.lastLocationUpdateSecondsAgo * 1000
                    ).toISOString(),
                    lastHeartbeatAt: new Date(
                      Date.now() - v.lastHeartbeatSecondsAgo * 1000
                    ).toISOString()
                  });
                  const style = getFreshnessBadgeStyle(evalState.state);
                  return (
                    <div
                      key={v.id}
                      className={`p-4 rounded-xl border transition ${
                        isSelected
                          ? 'border-[#2563EB] bg-blue-50/30'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {v.registrationNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${style.bg} ${style.text} ${style.border}`}
                        >
                          {evalState.state}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        {v.manufacturer} {v.model} · {v.variant}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        VIN: <span className="font-mono">{v.vin}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        STM32U575 Unit: <span className="font-mono">{v.assignedDeviceSerial}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Showroom: {v.registeredByShowroomName}
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedVehicleId(v.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            isSelected
                              ? 'bg-[#1E40AF] text-white'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? 'Active Vehicle' : 'Switch to Vehicle'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVehicleId(v.id);
                            setActiveScreen('VEHICLE_DETAILS');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                          Inspect Provenance
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 6: VEHICLE DETAILS & SHOWROOM PROVENANCE
          ================================================================ */}
          {activeScreen === 'VEHICLE_DETAILS' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Vehicle Specifications & Showroom Provenance ({selectedVehicle.registrationNumber})
                </h2>
                <p className="text-xs text-slate-500">
                  Immutable registration record created by authorized dealership staff.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 uppercase tracking-wider">
                    Vehicle Identity
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Registration Number:</span>
                    <span className="font-mono font-bold">{selectedVehicle.registrationNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">17-Char VIN:</span>
                    <span className="font-mono font-semibold">{selectedVehicle.vin}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Make / Model / Variant:</span>
                    <span className="font-semibold">
                      {selectedVehicle.manufacturer} {selectedVehicle.model} ({selectedVehicle.variant})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fuel / Powertrain:</span>
                    <span className="font-semibold">{selectedVehicle.fuelType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Color & Year:</span>
                    <span className="font-semibold">
                      {selectedVehicle.color} · {selectedVehicle.manufacturingYear}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 uppercase tracking-wider">
                    Showroom & Hardware Binding
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Originating Showroom:</span>
                    <span className="font-semibold text-right">
                      {selectedVehicle.registeredByShowroomName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dealer Code:</span>
                    <span className="font-mono font-semibold">
                      {selectedVehicle.registeredByDealerCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">STM32U575 Serial:</span>
                    <span className="font-mono font-bold text-[#1E40AF]">
                      {selectedVehicle.assignedDeviceSerial}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">MCU Firmware:</span>
                    <span className="font-mono">{selectedVehicle.firmwareVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Uniqueness Lock Key:</span>
                    <span className="font-mono text-[11px]">
                      reg_{selectedVehicle.registrationNumber}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 12: LIVE STM32U575 TELEMETRY & HARDWARE SIMULATOR
          ================================================================ */}
          {activeScreen === 'LIVE_TELEMETRY' && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      STM32U575 Live Telemetry & Sensor Bus ({selectedVehicle.assignedDeviceSerial})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Authenticated via HMAC-SHA256 per-device secret & monotonic sequence window.
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}`}
                  >
                    {freshnessEvaluation.displayLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">Ignition & Doors</div>
                    <div className="text-sm font-bold text-slate-900 mt-1">
                      {selectedVehicle.ignitionOn ? 'IGNITION ON' : 'IGNITION OFF'}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Doors: {selectedVehicle.doorsLocked ? 'Locked' : 'Unlocked'} · Windows:{' '}
                      {selectedVehicle.windowsClosed ? 'Closed' : 'Open'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">Cabin Temperature & CO</div>
                    <div className="text-sm font-bold text-slate-900 mt-1">
                      {selectedVehicle.cabinTempCelsius} °C · {selectedVehicle.coPpm} ppm CO
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Occupant Radar: {selectedVehicle.occupantDetected ? 'Detected' : 'Clear'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">IMU Accelerometer</div>
                    <div className="text-sm font-bold text-slate-900 mt-1">
                      Peak {selectedVehicle.peakImpactG} G
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      GNSS Fix: {selectedVehicle.gnssFixStatus}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-slate-500">12V Rail & LiFePO4 Backup</div>
                    <div className="text-sm font-bold text-slate-900 mt-1">
                      {(selectedVehicle.mainVoltageMv / 1000).toFixed(2)}V ({selectedVehicle.powerSource})
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Backup Battery: {selectedVehicle.backupBatteryPercent}%
                    </div>
                  </div>
                </div>

                {/* Non-Production STM32U575 Event Simulator */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800">
                    Non-Production STM32U575 Hardware Event Trigger (HMAC-SHA256 Signed Packet Simulator)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => simulateHardwareEvent(INCIDENT_TYPES.ACCIDENT_DETECTED)}
                      className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-[#DC2626] border border-red-200 text-xs font-semibold"
                    >
                      Simulate High-G Crash (ACCIDENT_DETECTED)
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateHardwareEvent(INCIDENT_TYPES.PARKED_OCCUPANT_ALERT)}
                      className="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold"
                    >
                      Simulate Parked Child/Pet Radar Alert
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateHardwareEvent(INCIDENT_TYPES.THEFT_OR_INTRUSION_ALERT)}
                      className="px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 text-xs font-semibold"
                    >
                      Simulate Unauthorized Intrusion Alert
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateHardwareEvent(INCIDENT_TYPES.DEVICE_POWER_FAILURE)}
                      className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold"
                    >
                      Simulate 12V Cutover to Backup Battery
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 10: EMERGENCY / SOS INTERFACE
          ================================================================ */}
          {activeScreen === 'EMERGENCY_SOS' && (
            <div className="bg-white border-2 border-red-200 rounded-xl p-6 shadow-sm space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-[#DC2626] mb-1">
                    MANUAL USER-TRIGGERED SOS DESK
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    Emergency SOS Dispatch & Family Alert ({selectedVehicle.registrationNumber})
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Explicitly distinct from automated STM32U575 crash detection. Includes a
                    5-second cancellation window to prevent accidental dispatch.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="font-semibold text-slate-800">
                  Target Jurisdiction: {selectedVehicle.jurisdictionCode} · Coordinates:{' '}
                  {selectedVehicle.lat.toFixed(4)}° N, {selectedVehicle.lng.toFixed(4)}° E
                </div>
                <div className="text-slate-600">
                  Location Freshness: <span className="font-bold">{freshnessEvaluation.displayLabel}</span>
                </div>
                <div className="text-slate-500">
                  Truthful Lifecycle Policy: Creating an SOS marks the incident as{' '}
                  <span className="font-mono font-semibold">VISIBLE_TO_AUTHORITY</span>. It will
                  never be shown as &ldquo;Ambulance/Police Dispatched&rdquo; until an authority
                  officer explicitly records{' '}
                  <span className="font-mono font-semibold">DISPATCH_RECORDED_BY_AUTHORITY</span>.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Emergency Situation Note (Shared with Medical & Police Desk)
                </label>
                <textarea
                  rows={2}
                  value={sosNote}
                  onChange={(e) => setSosNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              {sosCountdown !== null ? (
                <div className="p-5 rounded-xl bg-red-50 border-2 border-[#DC2626] text-center space-y-3">
                  <div className="text-sm font-bold text-[#DC2626]">
                    TRANSMITTING MANUAL SOS IN {sosCountdown} SECONDS...
                  </div>
                  <p className="text-xs text-red-900">
                    Notifying {selectedVehicle.jurisdictionCode} Medical & Police Authorities and
                    authorized family members.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSosCountdown(null);
                      setBannerFeedback('Manual SOS countdown cancelled before transmission.');
                    }}
                    className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                  >
                    CANCEL SOS NOW (Accidental Press)
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={
                    activeRole === USER_ROLES.FAMILY_MEMBER &&
                    !activeFamilyMemberRecord.permissions.canTriggerSos
                  }
                  onClick={() => setSosCountdown(5)}
                  className="w-full py-4 rounded-xl bg-[#DC2626] hover:bg-red-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-sm transition"
                >
                  {activeRole === USER_ROLES.FAMILY_MEMBER &&
                  !activeFamilyMemberRecord.permissions.canTriggerSos
                    ? 'SOS Trigger Disabled by Vehicle Owner Permission'
                    : 'START 5-SECOND EMERGENCY SOS COUNTDOWN'}
                </button>
              )}
            </div>
          )}

          {/* ================================================================
              SCREEN 11: INCIDENT HISTORY
          ================================================================ */}
          {activeScreen === 'INCIDENT_HISTORY' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Vehicle Incident & Emergency Lifecycle Log
                </h2>
                <p className="text-xs text-slate-500">
                  Separates Hardware-Detected Incidents vs Manual User SOS, and distinguishes
                  Authority Visibility from Confirmed Dispatch.
                </p>
              </div>

              <div className="space-y-3">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {inc.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            inc.source === 'MANUAL_USER_SOS'
                              ? 'bg-red-100 text-[#DC2626]'
                              : 'bg-blue-100 text-[#1E40AF]'
                          }`}
                        >
                          {inc.source === 'MANUAL_USER_SOS'
                            ? 'Manual User SOS'
                            : 'STM32U575 Hardware Sensor'}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {inc.incidentType}
                        </span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-white border border-slate-300 text-slate-800">
                        State: {inc.lifecycleState}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700">{inc.description}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        Location: {inc.roadSegmentSummary} ({inc.jurisdictionCode})
                      </span>
                      <span>Occurred: {inc.occurredAt}</span>
                    </div>

                    {inc.lifecycleState !== INCIDENT_LIFECYCLE_STATES.RESOLVED &&
                      inc.lifecycleState !==
                        INCIDENT_LIFECYCLE_STATES.FALSE_ALARM_CANCELLED && (
                        <div className="pt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelFalseAlarm(inc.id)}
                            className="px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700"
                          >
                            Mark as False Alarm / Cancel
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 7: ADD / MANAGE FAMILY MEMBERS
          ================================================================ */}
          {activeScreen === 'FAMILY_MEMBERS' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Invite Authorised Family Member ({selectedVehicle.registrationNumber})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Owner creates an invitation with an initial password. The invited family member
                    must verify their phone via 6-digit OTP and set a new private password on first
                    login.
                  </p>
                </div>

                <form
                  onSubmit={handleInviteFamilyMember}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
                >
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Family Member Full Name
                    </label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. Ananya Vikram Singh"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Phone Number (E.164)
                    </label>
                    <input
                      type="text"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      placeholder="+919876543219"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Relationship
                    </label>
                    <input
                      type="text"
                      value={inviteRelationship}
                      onChange={(e) => setInviteRelationship(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      One-Time Initial Password (Hashed Server-Side)
                    </label>
                    <input
                      type="text"
                      value={inviteTempPassword}
                      onChange={(e) => setInviteTempPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold text-xs"
                    >
                      Send OTP-Protected Family Invitation
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Current Family Memberships ({familyMembers.length})
                </h3>
                {familyMembers.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {m.fullName} ({m.relationship})
                      </div>
                      <div className="text-slate-500 font-mono">
                        {m.phoneE164} · Status: {m.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveScreen('FAMILY_PERMISSIONS')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-medium"
                      >
                        Permissions
                      </button>
                      {m.status !== 'REVOKED' && (
                        <button
                          type="button"
                          onClick={() => revokeFamilyMember(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-red-50 text-[#DC2626] border border-red-200 font-semibold"
                        >
                          Revoke Access
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 8: FAMILY MEMBER PERMISSIONS MATRIX
          ================================================================ */}
          {activeScreen === 'FAMILY_PERMISSIONS' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Granular Family Member Permissions
                </h2>
                <p className="text-xs text-slate-500">
                  Checked server-side on every request and enforced in Firestore security rules.
                </p>
              </div>
              <div className="space-y-4">
                {familyMembers.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl border border-slate-200 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">{m.fullName}</span>{' '}
                        <span className="text-slate-500">({m.phoneE164})</span>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100">
                        {m.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {(
                        [
                          ['canViewLocation', 'View Location'],
                          ['canViewTelemetry', 'View Telemetry'],
                          ['canReceiveCriticalAlerts', 'Critical Alerts'],
                          ['canViewIncidentHistory', 'Incident History'],
                          ['canTriggerSos', 'Trigger SOS']
                        ] as const
                      ).map(([permKey, label]) => (
                        <button
                          key={permKey}
                          type="button"
                          onClick={() => toggleFamilyPermission(m.id, permKey)}
                          className={`p-2 rounded-lg border text-center font-semibold transition ${
                            m.permissions[permKey]
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          {label}: {m.permissions[permKey] ? 'ON' : 'OFF'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 9: DRIVER PROFILE & ACCESS
          ================================================================ */}
          {activeScreen === 'DRIVER_ACCESS' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Assign Authorised Vehicle Driver
                </h2>
                <form
                  onSubmit={handleAddDriver}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
                >
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Driver Full Name
                    </label>
                    <input
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="e.g. Suresh Pratap"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Driver Phone (E.164)
                    </label>
                    <input
                      type="text"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      placeholder="+919811223355"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Driving License Number
                    </label>
                    <input
                      type="text"
                      value={driverLicense}
                      onChange={(e) => setDriverLicense(e.target.value)}
                      placeholder="UP32-20190012345"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Shift Window
                    </label>
                    <input
                      type="text"
                      value={driverShift}
                      onChange={(e) => setDriverShift(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold text-xs"
                    >
                      Authorize Driver
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Assigned Drivers</h3>
                {drivers.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{d.fullName}</div>
                      <div className="text-slate-500 font-mono">
                        {d.phoneE164} · License: {d.licenseNumber} · {d.assignedShift}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold">
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 13: NOTIFICATIONS (FCM_ACCEPTED vs CLIENT_DELIVERED_ACK vs READ)
          ================================================================ */}
          {activeScreen === 'NOTIFICATIONS' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Notifications & Delivery Verification Log
                </h2>
                <p className="text-xs text-slate-500">
                  Strictly distinguishes FCM enqueue acceptance (FCM_ACCEPTED) from verified device
                  receipt (CLIENT_DELIVERED_ACK) and user read confirmation (READ).
                </p>
              </div>
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{n.title}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-blue-50 text-[#1E40AF] border border-blue-200">
                          {n.status}
                        </span>
                      </div>
                      <p className="text-slate-600">{n.body}</p>
                      <div className="text-[11px] text-slate-400">
                        Created: {n.createdAt}
                        {n.deliveredAt ? ` · Delivered ACK: ${n.deliveredAt}` : ''}
                        {n.readAt ? ` · Read: ${n.readAt}` : ''}
                      </div>
                    </div>
                    {n.status !== NOTIFICATION_STATUSES.READ && (
                      <button
                        type="button"
                        onClick={() => advanceNotificationState(n.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white font-semibold text-xs"
                      >
                        {n.status === NOTIFICATION_STATUSES.FCM_ACCEPTED
                          ? 'Confirm Client Delivered ACK'
                          : 'Mark as READ'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 14: ACCOUNT & PRIVACY SETTINGS
          ================================================================ */}
          {activeScreen === 'ACCOUNT_PRIVACY' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5 text-xs">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Account Security, Privacy & Native Capacitor Configuration
                </h2>
                <p className="text-xs text-slate-500">
                  Manage emergency data-sharing policies and inspect native Android/iOS Firebase
                  bindings.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-900">
                      Emergency Medical Crash Telemetry Sharing
                    </div>
                    <div className="text-slate-500">
                      Automatically share cabin occupant count, temperature, and impact G-force with
                      Medical Authority during critical incidents.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shareMedicalDataOnCrash}
                    onChange={(e) => setShareMedicalDataOnCrash(e.target.checked)}
                    className="w-4 h-4 accent-[#2563EB]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-900">
                      Anonymized Road-Surface Hazard Contributions
                    </div>
                    <div className="text-slate-500">
                      Share Z-axis shock coordinates with Road Authorities. Vehicle registration,
                      VIN, and owner identity are always stripped.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shareAnonymizedRoadHazards}
                    onChange={(e) => setShareAnonymizedRoadHazards(e.target.checked)}
                    className="w-4 h-4 accent-[#2563EB]"
                  />
                </label>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-[11px]">
                <div className="font-sans font-bold text-slate-800 text-xs">
                  Bound Firebase & Capacitor Native Identifiers
                </div>
                <div>Android App ID: {VEERXCAPE_NATIVE_APP_METADATA.android.mobileSdkAppId}</div>
                <div>iOS Google App ID: {VEERXCAPE_NATIVE_APP_METADATA.ios.googleAppId}</div>
                <div>Android Config: {VEERXCAPE_NATIVE_APP_METADATA.android.configPath}</div>
                <div>iOS Config: {VEERXCAPE_NATIVE_APP_METADATA.ios.configPath}</div>
              </div>
            </div>
          )}

          {/* ================================================================
              SCREEN 15: HELP & SUPPORT TICKETS
          ================================================================ */}
          {activeScreen === 'HELP_SUPPORT' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Raise VeerXcape Support Ticket
                </h2>
                <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Category</label>
                    <select
                      value={ticketCategory}
                      onChange={(e) =>
                        setTicketCategory(
                          e.target.value as MobileSupportTicketItem['category']
                        )
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="DEVICE_ISSUE">STM32U575 Hardware / Calibration Issue</option>
                      <option value="SHOWROOM_CORRECTION">
                        Showroom Vehicle Record Correction
                      </option>
                      <option value="FALSE_ALARM">False Alarm Review</option>
                      <option value="ACCOUNT_RECOVERY">Account / Family Access Assistance</option>
                      <option value="GENERAL">General Inquiry</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="Brief summary of your request"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value)}
                      placeholder="Include relevant timestamps or device observations"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[#2563EB] text-white font-semibold text-xs"
                  >
                    Submit Support Ticket
                  </button>
                </form>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Your Support Tickets</h3>
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {t.id} · {t.subject}
                      </div>
                      <div className="text-slate-500">
                        {t.category} · Created {t.createdAt}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#1E40AF] font-semibold">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

