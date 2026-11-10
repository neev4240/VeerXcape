import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  BatteryCharging,
  Bell,
  Car,
  CheckCircle2,
  Clock,
  Cpu,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  Navigation,
  PhoneCall,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  WifiOff,
  Wrench,
  XCircle
} from 'lucide-react';
import type { EmergencyContactDocument } from '@veerxcape/shared-types';
import {
  VeerXcapeApiClient,
  VeerXcapeApiError,
  isExplicitDevDemoModeEnabled,
  unwrapApiResponse,
  type MobileDashboardDTO
} from '@veerxcape/shared-services';
import {
  customerAccountActivationSchema,
  customerPhoneLoginSchema,
  familyMemberActivationSchema,
  familyMemberInviteSchema,
  phoneE164Schema
} from '@veerxcape/shared-validation';
import {
  INITIAL_DRIVERS,
  INITIAL_FAMILY_MEMBERS,
  INITIAL_INCIDENTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TICKETS,
  INITIAL_VEHICLES,
  type MobileDriverItem,
  type MobileFamilyMemberItem,
  type MobileIncidentItem,
  type MobileNotificationItem,
  type MobileSupportTicketItem,
  type MobileVehicleRecord
} from './data/mobileSeedData';

type MobilePersona = 'VEHICLE_OWNER' | 'FAMILY_MEMBER' | 'DRIVER';
type MobileScreenId =
  | 'AUTH_ONBOARDING'
  | 'DASHBOARD_HOME'
  | 'VEHICLE_DETAILS_STATUS'
  | 'LIVE_LOCATION_FRESHNESS'
  | 'INCIDENT_HISTORY_TIMELINE'
  | 'FAMILY_MEMBERS_PERMISSIONS'
  | 'DRIVER_ASSIGNMENT_ACCESS'
  | 'EMERGENCY_CONTACTS'
  | 'MANUAL_SOS_SIMULATION'
  | 'NOTIFICATIONS_CENTER'
  | 'PROFILE_PRIVACY_SETTINGS'
  | 'SUPPORT_HELP_TICKETS';

const DEV_DEMO_ENABLED = isExplicitDevDemoModeEnabled();

function mapDashboardDtoToState(
  dto: MobileDashboardDTO,
  currentUser: { uid: string; fullName: string; phoneE164: string }
): {
  persona: MobilePersona;
  vehicles: MobileVehicleRecord[];
  familyMembers: MobileFamilyMemberItem[];
  drivers: MobileDriverItem[];
  emergencyContacts: EmergencyContactDocument[];
  incidents: MobileIncidentItem[];
  notifications: MobileNotificationItem[];
  supportTickets: MobileSupportTicketItem[];
} {
  const hasOwner = dto.vehicles.some((v) => v.accessRole === 'VEHICLE_OWNER');
  const hasFamily =
    dto.vehicles.some((v) => v.accessRole === 'FAMILY_MEMBER') ||
    (dto.myFamilyMemberships?.length ?? 0) > 0;
  const persona: MobilePersona = hasOwner
    ? 'VEHICLE_OWNER'
    : hasFamily
      ? 'FAMILY_MEMBER'
      : 'DRIVER';

  const vehicles: MobileVehicleRecord[] = dto.vehicles.map((v) => ({
    id: v.id,
    registrationNumber: v.registrationNumber,
    vin: v.vin ?? `VX-${v.id.toUpperCase()}`,
    manufacturer: v.manufacturer,
    model: v.model,
    variant: v.variant,
    manufacturingYear: v.manufacturingYear ?? new Date().getFullYear(),
    color: v.color,
    fuelType: v.fuelType,
    ownerUserId: currentUser.uid,
    ownerName: currentUser.fullName,
    ownerPhoneE164: currentUser.phoneE164,
    registeredByShowroomName:
      v.registeredByShowroomName ?? 'Authorized VeerXcape Showroom',
    registeredByDealerCode: v.registeredByDealerCode ?? 'DLR-VERIFIED',
    assignedDeviceSerial:
      v.assignedDeviceSerial ?? v.assignedDeviceId ?? 'UNASSIGNED',
    firmwareVersion: v.firmwareVersion ?? 'v2.4.1-stm32u5',
    jurisdictionCode: 'IN-UP-LKO',
    roadSegmentSummary: v.liveStatusSummary.lastLocation
      ? `Lat ${v.liveStatusSummary.lastLocation.lat.toFixed(4)}, Lng ${v.liveStatusSummary.lastLocation.lng.toFixed(4)}`
      : 'Awaiting live GNSS coordinates',
    lat: v.liveStatusSummary.lastLocation?.lat ?? 26.8467,
    lng: v.liveStatusSummary.lastLocation?.lng ?? 80.9462,
    speedKmh: v.liveStatusSummary.lastLocation?.speedKmh ?? 0,
    lastLocationUpdateSecondsAgo: v.locationFreshness.locationAgeSeconds ?? 0,
    lastHeartbeatSecondsAgo: v.locationFreshness.heartbeatAgeSeconds ?? 0,
    ignitionOn: (v.liveStatusSummary.lastLocation?.speedKmh ?? 0) > 0,
    doorsLocked: true,
    windowsClosed: true,
    cabinTempCelsius: 24.0,
    occupantDetected: true,
    smokeDetected: false,
    coPpm: 2,
    peakImpactG: 1.0,
    mainVoltageMv: v.liveStatusSummary.batteryVoltageMv ?? 12800,
    backupBatteryPercent: v.liveStatusSummary.backupBatteryPercent ?? 96,
    powerSource: v.liveStatusSummary.powerSource ?? 'VEHICLE_12V',
    cellularRssiDbm: -68,
    gnssFixStatus: v.liveStatusSummary.lastLocation ? 'FIX_3D' : 'NO_FIX'
  }));

  const allMemberships = [
    ...dto.familyMembershipsForOwnedVehicles,
    ...(dto.myFamilyMemberships ?? []).filter(
      (m) => !dto.familyMembershipsForOwnedVehicles.some((e) => e.id === m.id)
    )
  ];
  const familyMembers: MobileFamilyMemberItem[] = allMemberships.map((m) => ({
    id: m.id,
    vehicleId: m.vehicleId,
    fullName: m.familyMemberName,
    phoneE164: m.familyMemberPhoneE164,
    relationship: m.relationship,
    status:
      m.status === 'ACTIVE'
        ? 'ACTIVE'
        : m.status === 'REVOKED'
          ? 'REVOKED'
          : 'PENDING_OTP_AND_PASSWORD_CHANGE',
    permissions: m.permissions,
    invitedAt: m.createdAt.slice(0, 16).replace('T', ' ')
  }));

  const drivers: MobileDriverItem[] = (dto.drivers ?? []).map((d) => ({
    id: d.id,
    vehicleId: d.vehicleId,
    fullName: d.driverFullName ?? d.driverUserId,
    phoneE164: d.driverPhoneE164 ?? '+910000000000',
    licenseNumber: 'VERIFIED-DRIVER',
    status: d.status,
    assignedShift: `Since ${d.validFrom.slice(0, 10)}`
  }));

  const incidents: MobileIncidentItem[] = dto.incidents.map((inc) => ({
    id: inc.id,
    vehicleId: inc.vehicleId,
    registrationNumber: inc.vehicleSnapshot.registrationNumber,
    incidentType: inc.incidentType,
    source:
      inc.source === 'HARDWARE_STM32'
        ? 'STM32U575_HARDWARE'
        : 'MANUAL_USER_SOS',
    severity: inc.severity,
    lifecycleState: inc.lifecycleState,
    jurisdictionCode: inc.location.jurisdictionCode,
    roadSegmentSummary: inc.location.roadSegmentSummary,
    lat: inc.location.lat,
    lng: inc.location.lng,
    occurredAt: inc.occurredAt.slice(0, 19).replace('T', ' '),
    description: `${inc.incidentType} (${inc.severity}) — ${inc.location.roadSegmentSummary}`,
    assignedAuthorityDept: inc.authorizedDepartments,
    dispatchReferenceCode: inc.dispatchReferenceCode ?? undefined,
    assignedOfficerName: inc.assignedOfficerName ?? undefined
  }));

  const notifications: MobileNotificationItem[] = (
    dto.notifications ?? []
  ).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    category: n.incidentId ? 'EMERGENCY' : 'SYSTEM',
    status: n.status,
    createdAt: n.createdAt.slice(0, 19).replace('T', ' '),
    deliveredAt: n.deliveredAckAt ?? undefined,
    readAt: n.readAt ?? undefined
  }));

  const supportTickets: MobileSupportTicketItem[] = (
    dto.supportTickets ?? []
  ).map((t) => ({
    id: t.id,
    vehicleId: t.vehicleId ?? '',
    category:
      t.category === 'REGISTRATION_CORRECTION'
        ? 'SHOWROOM_CORRECTION'
        : t.category === 'GENERAL_INQUIRY'
          ? 'GENERAL'
          : t.category,
    subject: t.subject,
    description: t.description,
    status: t.status === 'CLOSED' ? 'RESOLVED' : t.status,
    createdAt: t.createdAt.slice(0, 16).replace('T', ' ')
  }));

  return {
    persona,
    vehicles,
    familyMembers,
    drivers,
    emergencyContacts: dto.emergencyContacts,
    incidents,
    notifications,
    supportTickets
  };
}

export function App(): React.JSX.Element {
  const [activePersona, setActivePersona] =
    useState<MobilePersona>('VEHICLE_OWNER');
  const [activeScreen, setActiveScreen] =
    useState<MobileScreenId>('DASHBOARD_HOME');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<{
    uid: string;
    fullName: string;
    phoneE164: string;
    email?: string | null;
    primaryRole: string;
  } | null>(null);
  const [authTab, setAuthTab] = useState<
    | 'LOGIN'
    | 'OWNER_ACTIVATION'
    | 'FAMILY_INVITE_ACCEPT'
    | 'PASSWORD_RESET'
  >('LOGIN');
  const [authPhone, setAuthPhone] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authInitialInvitePassword, setAuthInitialInvitePassword] =
    useState<string>('');
  const [authOtpCode, setAuthOtpCode] = useState<string>('');
  const [authDevOtpHint, setAuthDevOtpHint] = useState<string | null>(null);
  const [authStatusBanner, setAuthStatusBanner] = useState<string | null>(null);
  const [authErrorBanner, setAuthErrorBanner] = useState<string | null>(null);

  // Loading & Network Error State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOfflineError, setIsOfflineError] = useState<boolean>(false);
  const [globalErrorBanner, setGlobalErrorBanner] = useState<string | null>(
    null
  );
  const [globalSuccessBanner, setGlobalSuccessBanner] = useState<string | null>(
    null
  );
  const [demoModeActive, setDemoModeActive] = useState<boolean>(false);

  // Core State
  const [vehicles, setVehicles] = useState<MobileVehicleRecord[]>([]);
  const [familyMembers, setFamilyMembers] = useState<MobileFamilyMemberItem[]>(
    []
  );
  const [drivers, setDrivers] = useState<MobileDriverItem[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<
    EmergencyContactDocument[]
  >([]);
  const [incidents, setIncidents] = useState<MobileIncidentItem[]>([]);
  const [notifications, setNotifications] = useState<MobileNotificationItem[]>(
    []
  );
  const [supportTickets, setSupportTickets] = useState<
    MobileSupportTicketItem[]
  >([]);
  const [telemetryHistoryCount, setTelemetryHistoryCount] = useState<number>(0);

  // Family Invite Form State (Screen 6)
  const [inviteFullName, setInviteFullName] = useState<string>('');
  const [invitePhoneE164, setInvitePhoneE164] = useState<string>('');
  const [inviteRelationship, setInviteRelationship] =
    useState<string>('Spouse');
  const [inviteInitialPassword, setInviteInitialPassword] =
    useState<string>('TempFamilyPass1');
  const [inviteVehicleId, setInviteVehicleId] = useState<string>('');
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);

  // Driver Assignment Form State (Screen 7)
  const [driverFullName, setDriverFullName] = useState<string>('');
  const [driverPhoneE164, setDriverPhoneE164] = useState<string>('');
  const [driverLicense, setDriverLicense] = useState<string>('');
  const [driverBanner, setDriverBanner] = useState<string | null>(null);

  // Emergency Contact Form State (Screen 8)
  const [contactFullName, setContactFullName] = useState<string>('');
  const [contactPhoneE164, setContactPhoneE164] = useState<string>('');
  const [contactRelationship, setContactRelationship] =
    useState<string>('Sibling');
  const [contactBanner, setContactBanner] = useState<string | null>(null);

  // Manual SOS State (Screen 9)
  const [sosCountdownSec, setSosCountdownSec] = useState<number | null>(null);
  const [activeSosIncidentId, setActiveSosIncidentId] = useState<string | null>(
    null
  );
  const [sosSimulationNote, setSosSimulationNote] = useState<string>('');
  const [sosStatusBanner, setSosStatusBanner] = useState<string | null>(null);

  // Profile & Privacy Settings State (Screen 11)
  const [profileFullName, setProfileFullName] = useState<string>('');
  const [shareWithMedicalOnSos, setShareWithMedicalOnSos] =
    useState<boolean>(true);
  const [shareWithPoliceOnSos, setShareWithPoliceOnSos] =
    useState<boolean>(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] =
    useState<boolean>(true);
  const [profileSavedBanner, setProfileSavedBanner] = useState<string | null>(
    null
  );

  // Support Ticket Form State (Screen 12)
  const [ticketCategory, setTicketCategory] = useState<
    | 'DEVICE_ISSUE'
    | 'ACCOUNT_RECOVERY'
    | 'REGISTRATION_CORRECTION'
    | 'GENERAL_INQUIRY'
  >('DEVICE_ISSUE');
  const [ticketSubject, setTicketSubject] = useState<string>('');
  const [ticketDescription, setTicketDescription] = useState<string>('');
  const [ticketBanner, setTicketBanner] = useState<string | null>(null);

  const apiClient = useMemo(
    () =>
      new VeerXcapeApiClient({
        onSessionExpired: (reason) => {
          setIsAuthenticated(false);
          setAuthenticatedUser(null);
          setActiveScreen('AUTH_ONBOARDING');
          setAuthErrorBanner(reason);
        }
      }),
    []
  );

  const handleApiError = useCallback((err: unknown, fallbackMessage: string) => {
    if (err instanceof VeerXcapeApiError) {
      if (err.isNetworkError || err.isTimeout) {
        setIsOfflineError(true);
      }
      const msg = `${err.message} (${err.code})`;
      setGlobalErrorBanner(msg);
      return msg;
    }
    const msg = err instanceof Error ? err.message : fallbackMessage;
    setGlobalErrorBanner(msg);
    return msg;
  }, []);

  const loadMobileDashboard = useCallback(async () => {
    if (demoModeActive) return;
    setIsLoading(true);
    setGlobalErrorBanner(null);
    setIsOfflineError(false);
    try {
      const session = apiClient.getSession();
      const dto = unwrapApiResponse(await apiClient.getMobileDashboard());
      const currentUser = {
        uid: session?.user.uid ?? dto.profile?.uid ?? 'usr_active',
        fullName:
          dto.profile?.fullName ??
          session?.profile?.fullName ??
          session?.user.phoneE164 ??
          'VeerXcape User',
        phoneE164: session?.user.phoneE164 ?? '+910000000000'
      };
      setAuthenticatedUser({
        ...currentUser,
        email: session?.user.email,
        primaryRole: session?.user.primaryRole ?? 'VEHICLE_OWNER'
      });

      const mapped = mapDashboardDtoToState(dto, currentUser);
      setActivePersona(mapped.persona);
      setVehicles(mapped.vehicles);
      setFamilyMembers(mapped.familyMembers);
      setDrivers(mapped.drivers);
      setEmergencyContacts(mapped.emergencyContacts);
      setIncidents(mapped.incidents);
      setNotifications(mapped.notifications);
      setSupportTickets(mapped.supportTickets);

      setProfileFullName(currentUser.fullName);
      if (dto.profile) {
        setShareWithMedicalOnSos(
          dto.profile.privacySettings.shareWithMedicalOnSos
        );
        setShareWithPoliceOnSos(
          dto.profile.privacySettings.shareWithPoliceOnSos
        );
        setPushNotificationsEnabled(
          dto.profile.notificationPreferences.pushEnabled
        );
      }

      if (mapped.vehicles.length > 0) {
        setSelectedVehicleId((prev) =>
          mapped.vehicles.some((v) => v.id === prev)
            ? prev
            : mapped.vehicles[0].id
        );
        setInviteVehicleId((prev) =>
          mapped.vehicles.some((v) => v.id === prev)
            ? prev
            : mapped.vehicles[0].id
        );
      }
    } catch (err) {
      handleApiError(err, 'Unable to load mobile dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, demoModeActive, handleApiError]);

  useEffect(() => {
    if (apiClient.hasActiveSession() && !isAuthenticated) {
      setIsAuthenticated(true);
      void loadMobileDashboard();
    }
  }, [apiClient, isAuthenticated, loadMobileDashboard]);

  useEffect(() => {
    if (!isAuthenticated || demoModeActive || !selectedVehicleId) return;
    let cancelled = false;
    void apiClient
      .getVehicleTelemetry(selectedVehicleId, { limit: 15 })
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          setTelemetryHistoryCount(res.data.length);
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient, demoModeActive, isAuthenticated, selectedVehicleId]);

  useEffect(() => {
    if (sosCountdownSec === null || sosCountdownSec <= 0) return;
    const timer = window.setInterval(() => {
      setSosCountdownSec((prev) =>
        prev === null || prev <= 1 ? 0 : prev - 1
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sosCountdownSec]);

  const selectedVehicle = useMemo(
    () =>
      vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0] ?? null,
    [vehicles, selectedVehicleId]
  );

  const activeFamilyMembership = useMemo(() => {
    if (!selectedVehicle) return undefined;
    return (
      familyMembers.find(
        (m) => m.vehicleId === selectedVehicle.id && m.status === 'ACTIVE'
      ) ?? familyMembers[0]
    );
  }, [familyMembers, selectedVehicle]);

  const canViewLiveLocation = useMemo(() => {
    if (activePersona === 'VEHICLE_OWNER' || activePersona === 'DRIVER') {
      return true;
    }
    return activeFamilyMembership?.permissions.canViewLocation ?? true;
  }, [activePersona, activeFamilyMembership]);

  const canTriggerRemoteSos = useMemo(() => {
    if (activePersona === 'VEHICLE_OWNER' || activePersona === 'DRIVER') {
      return true;
    }
    return activeFamilyMembership?.permissions.canTriggerSos ?? false;
  }, [activePersona, activeFamilyMembership]);

  const canManageAccessAndContacts = activePersona === 'VEHICLE_OWNER';

  const activateExplicitDevDemo = () => {
    if (!DEV_DEMO_ENABLED) return;
    setDemoModeActive(true);
    setIsAuthenticated(true);
    setAuthenticatedUser({
      uid: 'usr_owner_01',
      fullName: 'Aarav Vikram Singh (Dev Demo)',
      phoneE164: '+919876543210',
      primaryRole: 'VEHICLE_OWNER'
    });
    setVehicles(INITIAL_VEHICLES);
    setFamilyMembers(INITIAL_FAMILY_MEMBERS);
    setDrivers(INITIAL_DRIVERS);
    setIncidents(INITIAL_INCIDENTS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setSupportTickets(INITIAL_TICKETS);
    setSelectedVehicleId(INITIAL_VEHICLES[0].id);
    setInviteVehicleId(INITIAL_VEHICLES[0].id);
    setActiveScreen('DASHBOARD_HOME');
  };

  // =========================================================================
  // HANDLERS: AUTHENTICATION & ONBOARDING (Screen 1)
  // =========================================================================
  const handleRequestOtp = async () => {
    setAuthErrorBanner(null);
    setAuthStatusBanner(null);
    setAuthDevOtpHint(null);
    const cleanPhone = authPhone.trim();
    const parsedPhone = phoneE164Schema.safeParse(cleanPhone);
    if (!parsedPhone.success) {
      setAuthErrorBanner(
        'Enter a valid E.164 phone number (e.g., +919876543210) to request an OTP.'
      );
      return;
    }

    const purpose =
      authTab === 'OWNER_ACTIVATION'
        ? 'CUSTOMER_ACTIVATION'
        : authTab === 'FAMILY_INVITE_ACCEPT'
          ? 'FAMILY_ACTIVATION'
          : 'PASSWORD_RESET';

    setIsLoading(true);
    try {
      const res = unwrapApiResponse(
        await apiClient.requestOtp({
          phoneE164: cleanPhone,
          purpose
        })
      );
      if (res.demoOtpForTestingOnly) {
        setAuthDevOtpHint(res.demoOtpForTestingOnly);
      }
      setAuthStatusBanner(
        `OTP challenge (${res.challengeId}) sent to ${cleanPhone}. Valid until ${new Date(res.expiresAt).toLocaleTimeString()}.`
      );
    } catch (err) {
      const msg = handleApiError(err, 'Failed to request OTP.');
      setAuthErrorBanner(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErrorBanner(null);
    setAuthStatusBanner(null);
    setGlobalErrorBanner(null);

    if (authTab === 'LOGIN') {
      const parsed = customerPhoneLoginSchema.safeParse({
        phoneE164: authPhone.trim(),
        password: authPassword
      });
      if (!parsed.success) {
        setAuthErrorBanner(
          parsed.error.issues[0]?.message ?? 'Invalid login credentials.'
        );
        return;
      }
      setIsLoading(true);
      try {
        const session = unwrapApiResponse(
          await apiClient.loginWithPhone(parsed.data)
        );
        setDemoModeActive(false);
        setIsAuthenticated(true);
        setAuthPassword('');
        setAuthStatusBanner(
          `Signed in as ${session.profile?.fullName ?? session.user.phoneE164}.`
        );
        await loadMobileDashboard();
        setActiveScreen('DASHBOARD_HOME');
      } catch (err) {
        const msg = handleApiError(err, 'Authentication failed.');
        setAuthErrorBanner(msg);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      if (authTab === 'OWNER_ACTIVATION') {
        const parsed = customerAccountActivationSchema.safeParse({
          phoneE164: authPhone.trim(),
          otpCode: authOtpCode.trim(),
          newPassword: authPassword
        });
        if (!parsed.success) {
          setAuthErrorBanner(
            parsed.error.issues[0]?.message ??
              'Provide phone, 6-digit OTP, and a strong password.'
          );
          return;
        }
        const session = unwrapApiResponse(
          await apiClient.activateCustomerAccount(parsed.data)
        );
        setDemoModeActive(false);
        setIsAuthenticated(true);
        setAuthPassword('');
        setAuthStatusBanner(
          `Showroom-linked owner account activated (${session.user.phoneE164}).`
        );
        await loadMobileDashboard();
        setActiveScreen('DASHBOARD_HOME');
        return;
      }

      if (authTab === 'FAMILY_INVITE_ACCEPT') {
        const parsed = familyMemberActivationSchema.safeParse({
          phoneE164: authPhone.trim(),
          otpCode: authOtpCode.trim(),
          initialPassword: authInitialInvitePassword.trim(),
          newPermanentPassword: authPassword
        });
        if (!parsed.success) {
          setAuthErrorBanner(
            parsed.error.issues[0]?.message ??
              'Provide phone, 6-digit OTP, initial invite password, and your new permanent password.'
          );
          return;
        }
        const activated = unwrapApiResponse(
          await apiClient.activateFamilyAccount(parsed.data)
        );
        setDemoModeActive(false);
        setIsAuthenticated(true);
        setAuthPassword('');
        setAuthStatusBanner(
          `Family invite activated for ${activated.activatedVehicleIds.length} vehicle(s).`
        );
        await loadMobileDashboard();
        setActiveScreen('DASHBOARD_HOME');
        return;
      }

      if (authTab === 'PASSWORD_RESET') {
        const parsed = customerAccountActivationSchema.safeParse({
          phoneE164: authPhone.trim(),
          otpCode: authOtpCode.trim(),
          newPassword: authPassword
        });
        if (!parsed.success) {
          setAuthErrorBanner(
            parsed.error.issues[0]?.message ??
              'Provide phone, 6-digit OTP, and new password.'
          );
          return;
        }
        unwrapApiResponse(await apiClient.resetPassword(parsed.data));
        setAuthTab('LOGIN');
        setAuthPassword('');
        setAuthStatusBanner(
          'Password reset completed and prior sessions revoked. Sign in with your new password.'
        );
      }
    } catch (err) {
      const msg = handleApiError(err, 'Account activation / reset failed.');
      setAuthErrorBanner(msg);
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
      setAuthenticatedUser(null);
      setVehicles([]);
      setFamilyMembers([]);
      setDrivers([]);
      setEmergencyContacts([]);
      setIncidents([]);
      setNotifications([]);
      setSupportTickets([]);
      setActiveScreen('AUTH_ONBOARDING');
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: FAMILY INVITATION & PERMISSIONS (Screen 6)
  // =========================================================================
  const handleInviteFamilyMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteBanner(null);
    setGlobalErrorBanner(null);
    if (!canManageAccessAndContacts) return;

    const targetVehicleId = inviteVehicleId || selectedVehicle?.id || '';
    const parsed = familyMemberInviteSchema.safeParse({
      vehicleId: targetVehicleId,
      familyMemberName: inviteFullName.trim(),
      familyMemberPhoneE164: invitePhoneE164.trim(),
      relationship: inviteRelationship.trim(),
      initialPassword: inviteInitialPassword,
      permissions: {
        canViewLocation: true,
        canViewTelemetry: true,
        canReceiveCriticalAlerts: true,
        canViewIncidentHistory: true,
        canTriggerSos: false
      }
    });

    if (!parsed.success) {
      setInviteBanner(
        `Validation error: ${parsed.error.issues[0]?.message ?? 'Invalid family invite input.'}`
      );
      return;
    }

    if (demoModeActive) {
      setInviteBanner('Demo family invite created.');
      return;
    }

    setIsLoading(true);
    try {
      const created = unwrapApiResponse(
        await apiClient.inviteFamilyMember(parsed.data)
      );
      setInviteFullName('');
      setInvitePhoneE164('');
      setInviteBanner(
        `Invitation created for ${created.membership.familyMemberName} (${created.membership.familyMemberPhoneE164}).`
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to invite family member.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFamilyPermission = async (
    membershipId: string,
    key: keyof MobileFamilyMemberItem['permissions']
  ) => {
    if (!canManageAccessAndContacts) return;
    const target = familyMembers.find((m) => m.id === membershipId);
    if (!target) return;

    const updatedPermissions = {
      ...target.permissions,
      [key]: !target.permissions[key]
    };

    if (demoModeActive) {
      setFamilyMembers((prev) =>
        prev.map((m) =>
          m.id === membershipId ? { ...m, permissions: updatedPermissions } : m
        )
      );
      return;
    }

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.updateFamilyMembership(membershipId, {
          action: 'UPDATE_PERMISSIONS',
          permissions: updatedPermissions
        })
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to update family member permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeFamilyMember = async (membershipId: string) => {
    if (!canManageAccessAndContacts) return;
    if (demoModeActive) {
      setFamilyMembers((prev) =>
        prev.map((m) =>
          m.id === membershipId ? { ...m, status: 'REVOKED' } : m
        )
      );
      return;
    }

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.updateFamilyMembership(membershipId, {
          action: 'REVOKE'
        })
      );
      setInviteBanner('Family membership revoked on backend.');
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to revoke family membership.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: DRIVER ASSIGNMENT (Screen 7)
  // =========================================================================
  const handleAssignDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverBanner(null);
    setGlobalErrorBanner(null);
    if (!canManageAccessAndContacts || !selectedVehicle) return;

    const cleanPhone = driverPhoneE164.trim();
    const phoneCheck = phoneE164Schema.safeParse(cleanPhone);
    if (!driverFullName.trim() || !phoneCheck.success) {
      setDriverBanner(
        'Provide driver full name and a valid E.164 phone number (+91...).'
      );
      return;
    }

    if (demoModeActive) {
      setDriverBanner('Demo driver assigned.');
      return;
    }

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.assignOrRevokeDriver({
          vehicleId: selectedVehicle.id,
          driverPhoneE164: cleanPhone,
          driverFullName: driverFullName.trim(),
          action: 'ASSIGN'
        })
      );
      setDriverFullName('');
      setDriverPhoneE164('');
      setDriverLicense('');
      setDriverBanner(
        `Driver ${driverFullName.trim()} (${cleanPhone}) assigned to ${selectedVehicle.registrationNumber}.`
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to assign driver.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeDriver = async (driverAssignmentId: string) => {
    if (!canManageAccessAndContacts) return;
    const target = drivers.find((d) => d.id === driverAssignmentId);
    if (!target) return;

    if (demoModeActive) {
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === driverAssignmentId ? { ...d, status: 'REVOKED' } : d
        )
      );
      return;
    }

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.assignOrRevokeDriver({
          vehicleId: target.vehicleId,
          driverPhoneE164: target.phoneE164,
          driverFullName: target.fullName,
          action: 'REVOKE'
        })
      );
      setDriverBanner(`Driver ${target.fullName} access revoked.`);
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to revoke driver access.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: EMERGENCY CONTACTS (Screen 8)
  // =========================================================================
  const handleAddEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactBanner(null);
    setGlobalErrorBanner(null);
    if (!canManageAccessAndContacts || !selectedVehicle) return;
    const cleanPhone = contactPhoneE164.trim();
    const phoneCheck = phoneE164Schema.safeParse(cleanPhone);
    if (!contactFullName.trim() || !phoneCheck.success) {
      setContactBanner(
        'Provide contact full name and a valid E.164 phone number (+91...).'
      );
      return;
    }

    const nextPriority = Math.min(5, emergencyContacts.length + 1) as
      | 1
      | 2
      | 3
      | 4
      | 5;

    if (demoModeActive) {
      setContactBanner('Demo emergency contact added.');
      return;
    }

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.upsertEmergencyContact({
          vehicleId: selectedVehicle.id,
          name: contactFullName.trim(),
          phoneE164: cleanPhone,
          relationship: contactRelationship.trim() || 'Emergency Contact',
          priorityOrder: nextPriority,
          notifyOnAccident: true,
          notifyOnSos: true,
          notifyOnOccupantAlert: true
        })
      );
      setContactFullName('');
      setContactPhoneE164('');
      setContactBanner(
        `Emergency contact ${contactFullName.trim()} saved on backend.`
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to save emergency contact.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveEmergencyContact = async (contactId: string) => {
    if (!canManageAccessAndContacts) return;
    if (demoModeActive) return;

    setIsLoading(true);
    try {
      unwrapApiResponse(await apiClient.deleteEmergencyContact(contactId));
      setContactBanner('Emergency contact removed.');
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to delete emergency contact.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: MANUAL SOS & FALSE ALARM WINDOW (Screen 9)
  // =========================================================================
  const handleTriggerManualSos = async (isSimulated: boolean) => {
    setSosStatusBanner(null);
    setGlobalErrorBanner(null);
    if (!canTriggerRemoteSos) {
      setSosStatusBanner(
        'Your current role/permission does not permit triggering remote SOS for this vehicle.'
      );
      return;
    }
    if (!selectedVehicle) {
      setSosStatusBanner('No registered vehicle is linked to your account.');
      return;
    }

    if (demoModeActive) {
      setActiveSosIncidentId('inc_demo_sos');
      setSosCountdownSec(20);
      setSosStatusBanner('Demo SOS initiated.');
      return;
    }

    setIsLoading(true);
    try {
      const created = unwrapApiResponse(
        await apiClient.triggerManualSos({
          vehicleId: selectedVehicle.id,
          location: {
            lat: selectedVehicle.lat,
            lng: selectedVehicle.lng,
            accuracyMeters: 8,
            roadSegmentSummary: selectedVehicle.roadSegmentSummary,
            jurisdictionCode: selectedVehicle.jurisdictionCode
          },
          isSimulated
        })
      );
      setActiveSosIncidentId(created.id);
      setSosCountdownSec(20);
      setSosStatusBanner(
        `${isSimulated ? 'Simulated SOS Drill' : 'LIVE EMERGENCY SOS'} (${created.id}) created on backend for ${selectedVehicle.registrationNumber}. State: ${created.lifecycleState}.`
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to trigger Manual SOS on backend.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelFalseAlarm = async () => {
    if (!activeSosIncidentId) return;
    setGlobalErrorBanner(null);

    if (demoModeActive) {
      setSosCountdownSec(null);
      setActiveSosIncidentId(null);
      return;
    }

    setIsLoading(true);
    try {
      const updated = unwrapApiResponse(
        await apiClient.respondToIncidentByCustomer(activeSosIncidentId, {
          action: 'CANCEL_FALSE_ALARM',
          note:
            sosSimulationNote.trim() ||
            'Occupant confirmed safety and cancelled within false-alarm window.'
        })
      );
      setSosCountdownSec(null);
      setSosStatusBanner(
        `Incident ${updated.id} updated to ${updated.lifecycleState} on backend.`
      );
      setActiveSosIncidentId(null);
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to cancel SOS incident.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledgeIncidentFromDetail = async (incidentId: string) => {
    if (demoModeActive) return;
    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.respondToIncidentByCustomer(incidentId, {
          action: 'ACKNOWLEDGE_ALERT',
          note: 'Acknowledged by authorized user from mobile app.'
        })
      );
      setGlobalSuccessBanner(`Incident ${incidentId} acknowledged.`);
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to acknowledge incident.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: NOTIFICATIONS (Screen 10)
  // =========================================================================
  const handleAcknowledgeNotification = async (notificationId: string) => {
    const target = notifications.find((n) => n.id === notificationId);
    if (!target || demoModeActive) return;

    setIsLoading(true);
    try {
      if (target.status === 'QUEUED' || target.status === 'FCM_ACCEPTED') {
        unwrapApiResponse(
          await apiClient.ackNotificationDelivered(notificationId)
        );
      } else {
        unwrapApiResponse(await apiClient.markNotificationRead(notificationId));
      }
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to acknowledge notification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (demoModeActive) return;
    setIsLoading(true);
    try {
      for (const n of notifications) {
        if (n.status !== 'READ') {
          unwrapApiResponse(await apiClient.markNotificationRead(n.id));
        }
      }
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to mark notifications as read.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: PROFILE & PRIVACY (Screen 11)
  // =========================================================================
  const handleSaveProfileSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSavedBanner(null);
    setGlobalErrorBanner(null);

    if (demoModeActive) {
      setProfileSavedBanner('Demo profile settings updated.');
      return;
    }

    setIsLoading(true);
    try {
      unwrapApiResponse(
        await apiClient.updateUserProfile({
          fullName: profileFullName.trim() || undefined,
          notificationPreferences: {
            pushEnabled: pushNotificationsEnabled,
            criticalAlertsOnly: false
          },
          privacySettings: {
            shareWithMedicalOnSos,
            shareWithPoliceOnSos
          }
        })
      );
      setProfileSavedBanner(
        'Profile, notification preferences, and emergency disclosure settings saved to backend.'
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to update profile settings.');
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // HANDLERS: SUPPORT TICKET (Screen 12)
  // =========================================================================
  const handleCreateSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketBanner(null);
    setGlobalErrorBanner(null);
    if (!ticketSubject.trim() || !ticketDescription.trim()) {
      setTicketBanner('Enter both a ticket subject and detailed description.');
      return;
    }

    if (demoModeActive) {
      setTicketBanner('Demo support ticket created.');
      return;
    }

    setIsLoading(true);
    try {
      const created = unwrapApiResponse(
        await apiClient.createSupportTicket({
          vehicleId: selectedVehicle?.id ?? null,
          category: ticketCategory,
          subject: ticketSubject.trim(),
          description: ticketDescription.trim()
        })
      );
      setTicketSubject('');
      setTicketDescription('');
      setTicketBanner(
        `Support ticket ${created.id} submitted to VeerXcape Support.`
      );
      await loadMobileDashboard();
    } catch (err) {
      handleApiError(err, 'Failed to submit support ticket.');
    } finally {
      setIsLoading(false);
    }
  };

  const screenTabs: Array<{
    id: MobileScreenId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'AUTH_ONBOARDING', label: '1. Auth & Onboarding', icon: KeyRound },
    { id: 'DASHBOARD_HOME', label: '2. Safety Dashboard', icon: ShieldCheck },
    {
      id: 'VEHICLE_DETAILS_STATUS',
      label: '3. Vehicle & STM32 Status',
      icon: Cpu
    },
    {
      id: 'LIVE_LOCATION_FRESHNESS',
      label: '4. Live GNSS & Freshness',
      icon: MapPin
    },
    {
      id: 'INCIDENT_HISTORY_TIMELINE',
      label: '5. Incidents & Timeline',
      icon: Activity
    },
    {
      id: 'FAMILY_MEMBERS_PERMISSIONS',
      label: '6. Family & Permissions',
      icon: Users
    },
    {
      id: 'DRIVER_ASSIGNMENT_ACCESS',
      label: '7. Driver Assignment',
      icon: UserCheck
    },
    {
      id: 'EMERGENCY_CONTACTS',
      label: '8. Emergency Contacts',
      icon: HeartHandshake
    },
    {
      id: 'MANUAL_SOS_SIMULATION',
      label: '9. Manual SOS & Cancel',
      icon: AlertOctagon
    },
    {
      id: 'NOTIFICATIONS_CENTER',
      label: '10. Notifications & ACK',
      icon: Bell
    },
    {
      id: 'PROFILE_PRIVACY_SETTINGS',
      label: '11. Profile & Privacy',
      icon: Lock
    },
    {
      id: 'SUPPORT_HELP_TICKETS',
      label: '12. Support & Help',
      icon: HelpCircle
    }
  ];

  const unreadNotificationCount = notifications.filter(
    (n) => n.status !== 'READ'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-tight text-white">
                    VeerXcape Mobile
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {demoModeActive ? 'DEV DEMO MODE' : 'LIVE BACKEND'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {isAuthenticated && authenticatedUser
                    ? `${authenticatedUser.fullName} (${authenticatedUser.phoneE164}) • Role: ${activePersona}`
                    : 'Sign in or activate your showroom-linked account to access vehicle safety'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAuthenticated && (
              <>
                <button
                  type="button"
                  onClick={() => void loadMobileDashboard()}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`}
                  />
                  Sync
                </button>

                {vehicles.length > 0 && (
                  <select
                    aria-label="Select Active Vehicle"
                    value={selectedVehicle?.id ?? ''}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registrationNumber} — {v.manufacturer} {v.model}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => setActiveScreen('MANUAL_SOS_SIMULATION')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  <AlertOctagon className="h-3.5 w-3.5" />
                  SOS Panel
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-rose-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Banners */}
      <div className="max-w-6xl w-full mx-auto px-4 pt-3 space-y-2">
        {isOfflineError && (
          <div
            role="alert"
            className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-amber-400" />
              <span>
                Network connection issue or backend timeout detected. Cached
                safety state is shown until connectivity returns.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadMobileDashboard()}
              className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold"
            >
              Retry
            </button>
          </div>
        )}
        {globalErrorBanner && (
          <div
            role="alert"
            className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between"
          >
            <span>{globalErrorBanner}</span>
            <button
              type="button"
              onClick={() => setGlobalErrorBanner(null)}
              className="underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {globalSuccessBanner && (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
            <span>{globalSuccessBanner}</span>
            <button
              type="button"
              onClick={() => setGlobalSuccessBanner(null)}
              className="underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {isAuthenticated && (
        <nav className="border-b border-slate-800 bg-slate-900/70 px-4 py-2 overflow-x-auto mt-2">
          <div className="max-w-6xl mx-auto flex items-center gap-1.5 min-w-max">
            {screenTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeScreen === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveScreen(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {tab.id === 'NOTIFICATIONS_CENTER' &&
                    unreadNotificationCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                        {unreadNotificationCount}
                      </span>
                    )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {(!isAuthenticated || activeScreen === 'AUTH_ONBOARDING') && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Zero-Knowledge Showroom Onboarding & Auth
                </span>
                <h1 className="text-xl font-bold text-white mt-1">
                  Account Activation, Login & Family Invite Verification
                </h1>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'LOGIN', label: 'Phone Login' },
                    { id: 'OWNER_ACTIVATION', label: 'Owner Activation' },
                    { id: 'FAMILY_INVITE_ACCEPT', label: 'Family Invite' },
                    { id: 'PASSWORD_RESET', label: 'Password Reset' }
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setAuthTab(t.id);
                      setAuthStatusBanner(null);
                      setAuthErrorBanner(null);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                      authTab === t.id
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="mobile-auth-phone"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Registered Phone (E.164)
                    </label>
                    <input
                      id="mobile-auth-phone"
                      type="text"
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="+919876543210"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>

                  {authTab !== 'LOGIN' && (
                    <div>
                      <label
                        htmlFor="mobile-auth-otp"
                        className="block text-xs font-medium text-slate-300 mb-1"
                      >
                        6-Digit Verification OTP
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="mobile-auth-otp"
                          type="text"
                          maxLength={6}
                          value={authOtpCode}
                          onChange={(e) => setAuthOtpCode(e.target.value)}
                          placeholder="6-digit OTP"
                          className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white font-mono"
                        />
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void handleRequestOtp()}
                          className="shrink-0 px-3 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-amber-300 border border-slate-700"
                        >
                          Send OTP
                        </button>
                      </div>
                      {authDevOtpHint && (
                        <p className="text-[11px] text-amber-300 mt-1 font-mono">
                          Dev OTP Code: {authDevOtpHint}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {authTab === 'FAMILY_INVITE_ACCEPT' && (
                  <div>
                    <label
                      htmlFor="mobile-auth-init-pwd"
                      className="block text-xs font-medium text-slate-300 mb-1"
                    >
                      Temporary Initial Invite Password (Shared by Vehicle
                      Owner)
                    </label>
                    <input
                      id="mobile-auth-init-pwd"
                      type="password"
                      value={authInitialInvitePassword}
                      onChange={(e) =>
                        setAuthInitialInvitePassword(e.target.value)
                      }
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="mobile-auth-password"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    {authTab === 'LOGIN'
                      ? 'Account Password'
                      : 'Create Permanent Password (Never shared with showroom)'}
                  </label>
                  <input
                    id="mobile-auth-password"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Minimum 8 chars, mixed case + number"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>

                {authErrorBanner && (
                  <div
                    role="alert"
                    className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-200 flex items-center gap-2"
                  >
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>{authErrorBanner}</span>
                  </div>
                )}

                {authStatusBanner && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>{authStatusBanner}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm"
                  >
                    {isLoading
                      ? 'Connecting...'
                      : authTab === 'LOGIN'
                        ? 'Sign In'
                        : authTab === 'OWNER_ACTIVATION'
                          ? 'Verify OTP & Activate Owner Account'
                          : authTab === 'FAMILY_INVITE_ACCEPT'
                            ? 'Activate Family Membership'
                            : 'Verify OTP & Reset Password'}
                  </button>

                  {DEV_DEMO_ENABLED && !demoModeActive && (
                    <button
                      type="button"
                      onClick={activateExplicitDevDemo}
                      className="px-4 py-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold"
                    >
                      Load Explicit Dev Demo
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                Zero-Knowledge Onboarding
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Authorized showrooms register your vehicle and verify your phone
                via OTP, but never create or view your permanent password.
              </p>
            </div>
          </section>
        )}

        {isAuthenticated && activeScreen === 'DASHBOARD_HOME' && (
          <section className="space-y-6">
            {!selectedVehicle ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <Car className="h-10 w-10 text-amber-400 mx-auto" />
                <h2 className="text-lg font-bold text-white">
                  No Vehicles Linked Yet
                </h2>
                <p className="text-xs text-slate-400">
                  Once an authorized showroom registers your vehicle or a
                  vehicle owner shares a family invite, it will appear here.
                </p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {selectedVehicle.registrationNumber}
                    </span>
                    <h1 className="text-2xl font-bold text-white mt-1">
                      {selectedVehicle.manufacturer} {selectedVehicle.model} —{' '}
                      {selectedVehicle.variant}
                    </h1>
                    <p className="text-xs text-slate-400">
                      Showroom: {selectedVehicle.registeredByShowroomName} (
                      {selectedVehicle.registeredByDealerCode}) • STM32:{' '}
                      {selectedVehicle.assignedDeviceSerial}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveScreen('VEHICLE_DETAILS_STATUS')}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-100"
                    >
                      STM32 Diagnostics
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveScreen('MANUAL_SOS_SIMULATION')}
                      className="px-4 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white"
                    >
                      Trigger Emergency SOS
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Battery Rail</span>
                      <BatteryCharging className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="text-lg font-bold text-white mt-1">
                      {(selectedVehicle.mainVoltageMv / 1000).toFixed(2)} V
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Telemetry Frames: {telemetryHistoryCount}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>GSM / GNSS</span>
                      <Signal className="h-4 w-4 text-sky-400" />
                    </div>
                    <p className="text-lg font-bold text-white mt-1">
                      {selectedVehicle.cellularRssiDbm} dBm
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Fix: {selectedVehicle.gnssFixStatus}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Speed</span>
                      <Navigation className="h-4 w-4 text-amber-400" />
                    </div>
                    <p className="text-lg font-bold text-white mt-1">
                      {selectedVehicle.speedKmh} km/h
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Freshness</span>
                      <Clock className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="text-sm font-bold text-white mt-1">
                      {selectedVehicle.lastLocationUpdateSecondsAgo}s ago
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {isAuthenticated && activeScreen === 'VEHICLE_DETAILS_STATUS' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h1 className="text-xl font-bold text-white">
              Vehicle & STM32U575 Hardware Status
            </h1>
            {selectedVehicle ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block">
                    Registration & VIN
                  </span>
                  <strong className="text-white font-mono">
                    {selectedVehicle.registrationNumber} • {selectedVehicle.vin}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block">
                    STM32U575 Serial & Firmware
                  </span>
                  <strong className="text-amber-300 font-mono">
                    {selectedVehicle.assignedDeviceSerial} •{' '}
                    {selectedVehicle.firmwareVersion}
                  </strong>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No vehicle selected.</p>
            )}
          </section>
        )}

        {isAuthenticated && activeScreen === 'LIVE_LOCATION_FRESHNESS' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h1 className="text-xl font-bold text-white">
              Live GNSS Coordinates & Freshness
            </h1>
            {!selectedVehicle ? (
              <p className="text-xs text-slate-400">No vehicle selected.</p>
            ) : !canViewLiveLocation ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                Live location viewing is disabled for your family membership by
                the vehicle owner.
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                <p className="font-bold text-white">
                  {selectedVehicle.roadSegmentSummary}
                </p>
                <p className="font-mono text-emerald-300">
                  Lat {selectedVehicle.lat.toFixed(4)}, Lng{' '}
                  {selectedVehicle.lng.toFixed(4)} • Updated{' '}
                  {selectedVehicle.lastLocationUpdateSecondsAgo}s ago
                </p>
              </div>
            )}
          </section>
        )}

        {isAuthenticated && activeScreen === 'INCIDENT_HISTORY_TIMELINE' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h1 className="text-xl font-bold text-white">
              Incident History & Authority Response ({incidents.length})
            </h1>
            {incidents.length === 0 ? (
              <p className="text-xs text-slate-400">No incidents recorded.</p>
            ) : (
              <div className="space-y-3">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-amber-300">
                        {inc.id} • {inc.incidentType} ({inc.severity})
                      </span>
                      <p className="text-white font-semibold mt-0.5">
                        {inc.roadSegmentSummary} — State: {inc.lifecycleState}
                      </p>
                    </div>
                    {inc.lifecycleState !== 'RESOLVED' &&
                      inc.lifecycleState !== 'FALSE_ALARM_CANCELLED' && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleAcknowledgeIncidentFromDetail(inc.id)
                          }
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 font-semibold"
                        >
                          Acknowledge Alert
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {isAuthenticated && activeScreen === 'FAMILY_MEMBERS_PERMISSIONS' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h1 className="text-lg font-bold text-white">
                Invite Family Member
              </h1>
              {!canManageAccessAndContacts ? (
                <p className="text-xs text-slate-400">
                  Only the vehicle owner can invite or revoke family members.
                </p>
              ) : (
                <form onSubmit={handleInviteFamilyMember} className="space-y-3">
                  <input
                    type="text"
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    placeholder="Family Member Full Name"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={invitePhoneE164}
                    onChange={(e) => setInvitePhoneE164(e.target.value)}
                    placeholder="Phone (+91...)"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={inviteRelationship}
                    onChange={(e) => setInviteRelationship(e.target.value)}
                    placeholder="Relationship"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="password"
                    value={inviteInitialPassword}
                    onChange={(e) => setInviteInitialPassword(e.target.value)}
                    placeholder="Temporary Initial Password"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  {inviteBanner && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                      {inviteBanner}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || vehicles.length === 0}
                    className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite Family Member
                  </button>
                </form>
              )}
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white">
                Linked Family Members ({familyMembers.length})
              </h2>
              <div className="space-y-3">
                {familyMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white">
                          {member.fullName} ({member.relationship})
                        </span>
                        <p className="text-slate-400">
                          {member.phoneE164} • {member.status}
                        </p>
                      </div>
                      {canManageAccessAndContacts &&
                        member.status !== 'REVOKED' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleRevokeFamilyMember(member.id)
                            }
                            className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 font-semibold"
                          >
                            Revoke
                          </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(
                        [
                          ['canViewLocation', 'Live Location'],
                          ['canViewTelemetry', 'Telemetry'],
                          ['canReceiveCriticalAlerts', 'Critical Alerts'],
                          ['canViewIncidentHistory', 'Incident History'],
                          ['canTriggerSos', 'Remote SOS']
                        ] as const
                      ).map(([permKey, label]) => (
                        <button
                          key={permKey}
                          type="button"
                          disabled={
                            !canManageAccessAndContacts ||
                            member.status === 'REVOKED'
                          }
                          onClick={() =>
                            void handleToggleFamilyPermission(
                              member.id,
                              permKey
                            )
                          }
                          className={`px-2 py-1 rounded border flex items-center justify-between ${
                            member.permissions[permKey]
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                              : 'bg-slate-900 border-slate-800 text-slate-500'
                          }`}
                        >
                          <span>{label}</span>
                          <span>
                            {member.permissions[permKey] ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {isAuthenticated && activeScreen === 'DRIVER_ASSIGNMENT_ACCESS' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h1 className="text-lg font-bold text-white">Assign Driver</h1>
              {!canManageAccessAndContacts ? (
                <p className="text-xs text-slate-400">
                  Only the vehicle owner can assign or revoke drivers.
                </p>
              ) : (
                <form onSubmit={handleAssignDriver} className="space-y-3">
                  <input
                    type="text"
                    value={driverFullName}
                    onChange={(e) => setDriverFullName(e.target.value)}
                    placeholder="Driver Full Name"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={driverPhoneE164}
                    onChange={(e) => setDriverPhoneE164(e.target.value)}
                    placeholder="Driver Phone (+91...)"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={driverLicense}
                    onChange={(e) => setDriverLicense(e.target.value)}
                    placeholder="License Number"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  {driverBanner && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                      {driverBanner}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || !selectedVehicle}
                    className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Assign Driver
                  </button>
                </form>
              )}
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white">
                Assigned Drivers ({drivers.length})
              </h2>
              <div className="space-y-3">
                {drivers.map((drv) => (
                  <div
                    key={drv.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">{drv.fullName}</p>
                      <p className="text-slate-400">
                        {drv.phoneE164} • {drv.status}
                      </p>
                    </div>
                    {canManageAccessAndContacts && drv.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeDriver(drv.id)}
                        className="px-3 py-1 rounded bg-rose-500/15 text-rose-300 font-semibold"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {isAuthenticated && activeScreen === 'EMERGENCY_CONTACTS' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h1 className="text-lg font-bold text-white">
                Add Emergency Contact
              </h1>
              {!canManageAccessAndContacts ? (
                <p className="text-xs text-slate-400">
                  Managed by the primary vehicle owner.
                </p>
              ) : (
                <form
                  onSubmit={handleAddEmergencyContact}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    value={contactFullName}
                    onChange={(e) => setContactFullName(e.target.value)}
                    placeholder="Contact Full Name"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={contactPhoneE164}
                    onChange={(e) => setContactPhoneE164(e.target.value)}
                    placeholder="Phone (+91...)"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={contactRelationship}
                    onChange={(e) => setContactRelationship(e.target.value)}
                    placeholder="Relationship"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                  {contactBanner && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                      {contactBanner}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || !selectedVehicle}
                    className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Save Emergency Contact
                  </button>
                </form>
              )}
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white">
                Emergency Contacts ({emergencyContacts.length})
              </h2>
              <div className="space-y-3">
                {emergencyContacts.map((ec) => (
                  <div
                    key={ec.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">
                        #{ec.priorityOrder} {ec.name} ({ec.relationship})
                      </p>
                      <p className="text-slate-400">{ec.phoneE164}</p>
                    </div>
                    {canManageAccessAndContacts && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveEmergencyContact(ec.id)}
                        className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {isAuthenticated && activeScreen === 'MANUAL_SOS_SIMULATION' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <h1 className="text-xl font-bold text-white">
              Manual SOS Dispatch & False-Alarm Window
            </h1>
            <input
              type="text"
              value={sosSimulationNote}
              onChange={(e) => setSosSimulationNote(e.target.value)}
              placeholder="Optional occupant note or cancellation reason"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isLoading || !selectedVehicle}
                onClick={() => void handleTriggerManualSos(false)}
                className="py-3.5 px-4 rounded-xl bg-rose-600 text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <PhoneCall className="h-4 w-4" />
                TRIGGER LIVE EMERGENCY SOS
              </button>
              <button
                type="button"
                disabled={isLoading || !selectedVehicle}
                onClick={() => void handleTriggerManualSos(true)}
                className="py-3.5 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 font-bold text-sm flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Run Simulated SOS Drill
              </button>
            </div>
            {sosCountdownSec !== null && activeSosIncidentId && (
              <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-rose-300">
                    Active SOS ({activeSosIncidentId})
                  </span>
                  <span className="font-mono font-bold text-white">
                    {sosCountdownSec}s remaining
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleCancelFalseAlarm()}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
                >
                  I AM SAFE — CANCEL FALSE ALARM
                </button>
              </div>
            )}
            {sosStatusBanner && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-200">
                {sosStatusBanner}
              </div>
            )}
          </section>
        )}

        {isAuthenticated && activeScreen === 'NOTIFICATIONS_CENTER' && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-white">
                Notifications & Client Delivery ACK ({notifications.length})
              </h1>
              {notifications.length > 0 && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleMarkAllNotificationsRead()}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200"
                >
                  Mark All Read
                </button>
              )}
            </div>
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-white">
                      {n.title}{' '}
                      <span className="text-amber-300 font-mono">
                        [{n.status}]
                      </span>
                    </p>
                    <p className="text-slate-300 mt-0.5">{n.body}</p>
                  </div>
                  {n.status !== 'READ' && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => void handleAcknowledgeNotification(n.id)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 font-semibold"
                    >
                      {n.status === 'QUEUED' || n.status === 'FCM_ACCEPTED'
                        ? 'ACK Delivered'
                        : 'Mark Read'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {isAuthenticated && activeScreen === 'PROFILE_PRIVACY_SETTINGS' && (
          <section className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h1 className="text-xl font-bold text-white">
              Profile & Emergency Disclosure Settings
            </h1>
            <form onSubmit={handleSaveProfileSettings} className="space-y-3">
              <input
                type="text"
                value={profileFullName}
                onChange={(e) => setProfileFullName(e.target.value)}
                placeholder="Full Name"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
              />
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span>Share emergency details with 108 Medical on SOS</span>
                <input
                  type="checkbox"
                  checked={shareWithMedicalOnSos}
                  onChange={(e) => setShareWithMedicalOnSos(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <span>Share vehicle details with 112 Police on SOS</span>
                <input
                  type="checkbox"
                  checked={shareWithPoliceOnSos}
                  onChange={(e) => setShareWithPoliceOnSos(e.target.checked)}
                />
              </label>
              {profileSavedBanner && (
                <div className="p-3 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                  {profileSavedBanner}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                Save Preferences
              </button>
            </form>
          </section>
        )}

        {isAuthenticated && activeScreen === 'SUPPORT_HELP_TICKETS' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h1 className="text-lg font-bold text-white">
                Raise Support Ticket
              </h1>
              <form onSubmit={handleCreateSupportTicket} className="space-y-3">
                <select
                  value={ticketCategory}
                  onChange={(e) =>
                    setTicketCategory(e.target.value as typeof ticketCategory)
                  }
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                >
                  <option value="DEVICE_ISSUE">
                    STM32U575 Hardware / Calibration
                  </option>
                  <option value="REGISTRATION_CORRECTION">
                    Showroom Registration Correction
                  </option>
                  <option value="ACCOUNT_RECOVERY">Account Recovery</option>
                  <option value="GENERAL_INQUIRY">General Inquiry</option>
                </select>
                <input
                  type="text"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
                <textarea
                  rows={3}
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Description"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
                {ticketBanner && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-xs text-emerald-200">
                    {ticketBanner}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Wrench className="h-4 w-4" />
                  Submit Support Ticket
                </button>
              </form>
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white">
                Support Tickets ({supportTickets.length})
              </h2>
              <div className="space-y-3">
                {supportTickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
                  >
                    <span className="font-mono font-bold text-amber-300">
                      {t.id} • {t.category} ({t.status})
                    </span>
                    <p className="font-bold text-white">{t.subject}</p>
                    <p className="text-slate-400">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
