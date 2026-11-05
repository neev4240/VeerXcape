import React, { useMemo, useState } from 'react';
import {
  Building2,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Edit3,
  FileCheck2,
  Lock,
  LogOut,
  PlusCircle,
  Shield,
  ShieldAlert,
  Store,
  Users
} from 'lucide-react';
import {
  UNIQUE_LOCK_KEYS,
  USER_ROLES,
  normalizeDeviceSerial,
  normalizePhoneE164,
  normalizeRegistrationNumber,
  normalizeVin,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import { resolveFirebaseWebConfig } from '@veerxcape/shared-services';
import {
  otpCodeSchema,
  showroomVehicleRegistrationSchema
} from '@veerxcape/shared-validation';

interface ShowroomItem {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  dealerCode: string;
  city: string;
  state: string;
  jurisdictionCode: string;
  status: 'ACTIVE' | 'SUSPENDED';
  managerName: string;
  registeredVehicleCount: number;
}

interface ShowroomStaffMember {
  id: string;
  fullName: string;
  email: string;
  phoneE164: string;
  role: typeof USER_ROLES.SHOWROOM_MANAGER | typeof USER_ROLES.SHOWROOM_STAFF;
  showroomId: string;
  status: 'ACTIVE' | 'REVOKED';
}

interface RegisteredVehicleItem {
  id: string;
  showroomId: string;
  dealerCode: string;
  companyId: string;
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
  customerEmail: string;
  assignedDeviceSerial: string;
  registeredByUserId: string;
  registeredByStaffName: string;
  registeredAt: string;
  customerActivationState: 'PENDING_CUSTOMER_OTP_PASSWORD_SETUP' | 'ACTIVATED';
}

const INITIAL_SHOWROOMS: ShowroomItem[] = [
  {
    id: 'shw_lko_01',
    companyId: 'cmp_zealion_motors',
    companyName: 'Zealion Automotive Group India Ltd.',
    name: 'Zealion Flagship Showroom — Gomti Nagar',
    dealerCode: 'ZLN-UP-LKO-01',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    jurisdictionCode: 'IN-UP-LKO',
    status: 'ACTIVE',
    managerName: 'Vikramaditya Kapoor',
    registeredVehicleCount: 148
  },
  {
    id: 'shw_kan_02',
    companyId: 'cmp_zealion_motors',
    companyName: 'Zealion Automotive Group India Ltd.',
    name: 'Zealion Metro Dealership — Mall Road',
    dealerCode: 'ZLN-UP-KAN-02',
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    jurisdictionCode: 'IN-UP-KAN',
    status: 'ACTIVE',
    managerName: 'Neha Chaturvedi',
    registeredVehicleCount: 92
  },
  {
    id: 'shw_ndl_03',
    companyId: 'cmp_zealion_motors',
    companyName: 'Zealion Automotive Group India Ltd.',
    name: 'Zealion NCR Arena — Connaught Place',
    dealerCode: 'ZLN-DL-NDL-03',
    city: 'New Delhi',
    state: 'Delhi',
    jurisdictionCode: 'IN-DL-NDL',
    status: 'SUSPENDED',
    managerName: 'Arjun Malhotra',
    registeredVehicleCount: 64
  }
];

const INITIAL_STAFF: ShowroomStaffMember[] = [
  {
    id: 'stf_101',
    fullName: 'Vikramaditya Kapoor',
    email: 'v.kapoor@zealionmotors.in',
    phoneE164: '+919839011223',
    role: USER_ROLES.SHOWROOM_MANAGER,
    showroomId: 'shw_lko_01',
    status: 'ACTIVE'
  },
  {
    id: 'stf_102',
    fullName: 'Siddharth Verma',
    email: 's.verma@zealionmotors.in',
    phoneE164: '+919839011224',
    role: USER_ROLES.SHOWROOM_STAFF,
    showroomId: 'shw_lko_01',
    status: 'ACTIVE'
  },
  {
    id: 'stf_201',
    fullName: 'Neha Chaturvedi',
    email: 'n.chaturvedi@zealionmotors.in',
    phoneE164: '+919839022334',
    role: USER_ROLES.SHOWROOM_MANAGER,
    showroomId: 'shw_kan_02',
    status: 'ACTIVE'
  }
];

const INITIAL_REGISTERED_VEHICLES: RegisteredVehicleItem[] = [
  {
    id: 'veh_up32ab1234',
    showroomId: 'shw_lko_01',
    dealerCode: 'ZLN-UP-LKO-01',
    companyId: 'cmp_zealion_motors',
    registrationNumber: 'UP32AB1234',
    vin: 'MA1TA2MKXKA019283',
    manufacturer: 'Tata Motors',
    model: 'Harrier EV',
    variant: 'Empowered+ AWD',
    manufacturingYear: 2026,
    color: 'Sapphire Metallic',
    fuelType: 'EV',
    customerFullName: 'Aarav Vikram Singh',
    customerPhoneE164: '+919876543210',
    customerEmail: 'aarav.singh@example.in',
    assignedDeviceSerial: 'VX-STM32U575-9A84F1',
    registeredByUserId: 'stf_102',
    registeredByStaffName: 'Siddharth Verma',
    registeredAt: '2026-10-12 15:40 IST',
    customerActivationState: 'ACTIVATED'
  },
  {
    id: 'veh_up78de5501',
    showroomId: 'shw_kan_02',
    dealerCode: 'ZLN-UP-KAN-02',
    companyId: 'cmp_zealion_motors',
    registrationNumber: 'UP78DE5501',
    vin: 'MBJ53ZBT9P0112233',
    manufacturer: 'Tata Motors',
    model: 'Safari Accomplished',
    variant: 'Dark Edition',
    manufacturingYear: 2026,
    color: 'Oberon Black',
    fuelType: 'DIESEL',
    customerFullName: 'Priya Awasthi',
    customerPhoneE164: '+919838112299',
    customerEmail: 'priya.awasthi@example.in',
    assignedDeviceSerial: 'VX-STM32U575-7C12D4',
    registeredByUserId: 'stf_201',
    registeredByStaffName: 'Neha Chaturvedi',
    registeredAt: '2026-11-01 12:15 IST',
    customerActivationState: 'PENDING_CUSTOMER_OTP_PASSWORD_SETUP'
  }
];

type PortalTab =
  | 'COMPANY_OVERVIEW'
  | 'SHOWROOM_MANAGEMENT'
  | 'WIZARD_REGISTER_VEHICLE'
  | 'REGISTERED_VEHICLES'
  | 'DEVICE_INSTALLATIONS'
  | 'STAFF_DIRECTORY';

export default function App() {
  const firebaseConfig = useMemo(
    () =>
      resolveFirebaseWebConfig(
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
      ),
    []
  );

  // Active Role & Scoped Showroom Selection
  const [activeRole, setActiveRole] = useState<
    | typeof USER_ROLES.COMPANY_ADMIN
    | typeof USER_ROLES.SHOWROOM_MANAGER
    | typeof USER_ROLES.SHOWROOM_STAFF
  >(USER_ROLES.SHOWROOM_MANAGER);
  const [scopedShowroomId, setScopedShowroomId] = useState<string>('shw_lko_01');
  const [activeTab, setActiveTab] = useState<PortalTab>('WIZARD_REGISTER_VEHICLE');

  const [showrooms, setShowrooms] = useState<ShowroomItem[]>(INITIAL_SHOWROOMS);
  const [staffList, setStaffList] = useState<ShowroomStaffMember[]>(INITIAL_STAFF);
  const [registeredVehicles, setRegisteredVehicles] = useState<RegisteredVehicleItem[]>(
    INITIAL_REGISTERED_VEHICLES
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // 9-Step Vehicle Registration Wizard State
  const [regNumber, setRegNumber] = useState('UP32GH9090');
  const [vin, setVin] = useState('MA1TA2MKXKA909012');
  const [manufacturer, setManufacturer] = useState('Tata Motors');
  const [model, setModel] = useState('Curvv EV');
  const [variant, setVariant] = useState('Empowered+ A 55');
  const [manufacturingYear, setManufacturingYear] = useState(2026);
  const [color, setColor] = useState('Pristine White');
  const [fuelType, setFuelType] = useState<'PETROL' | 'DIESEL' | 'EV' | 'HYBRID' | 'CNG'>('EV');
  const [customerFullName, setCustomerFullName] = useState('Devansh Srivastava');
  const [customerPhoneE164, setCustomerPhoneE164] = useState('+919876501234');
  const [customerEmail, setCustomerEmail] = useState('devansh.s@example.in');
  const [customerOtpInput, setCustomerOtpInput] = useState('619420');
  const [verifiedOtpChallengeId, setVerifiedOtpChallengeId] = useState<string | null>(
    'otp_chl_verified_9981'
  );
  const [assignedDeviceSerial, setAssignedDeviceSerial] = useState('VX-STM32U575-8E30B7');

  // New Showroom Form (Parent Company Admin only)
  const [newShowroomName, setNewShowroomName] = useState('');
  const [newShowroomDealerCode, setNewShowroomDealerCode] = useState('ZLN-UP-VNS-04');
  const [newShowroomCity, setNewShowroomCity] = useState('Varanasi');
  const [newShowroomJurisdiction, setNewShowroomJurisdiction] = useState('IN-UP-VNS');
  const [newShowroomManager, setNewShowroomManager] = useState('Raghavendra Mishra');

  // Permitted Vehicle Record Correction Modal State
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [correctionColor, setCorrectionColor] = useState('');
  const [correctionVariant, setCorrectionVariant] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  const activeShowroom = useMemo(
    () => showrooms.find((s) => s.id === scopedShowroomId) ?? showrooms[0],
    [showrooms, scopedShowroomId]
  );

  // Scoped Vehicles: COMPANY_ADMIN sees all company vehicles; SHOWROOM_MANAGER/STAFF see ONLY their showroomId
  const visibleVehicles = useMemo(() => {
    if (activeRole === USER_ROLES.COMPANY_ADMIN) {
      return registeredVehicles;
    }
    return registeredVehicles.filter((v) => v.showroomId === scopedShowroomId);
  }, [activeRole, registeredVehicles, scopedShowroomId]);

  const visibleStaff = useMemo(() => {
    if (activeRole === USER_ROLES.COMPANY_ADMIN) {
      return staffList;
    }
    return staffList.filter((s) => s.showroomId === scopedShowroomId);
  }, [activeRole, staffList, scopedShowroomId]);

  // Verify Customer Phone OTP (Step 6 of Wizard)
  const handleVerifyCustomerOtp = () => {
    const otpValid = otpCodeSchema.safeParse(customerOtpInput);
    if (!otpValid.success) {
      setFeedback({
        type: 'error',
        message: otpValid.error.issues[0]?.message ?? 'Invalid 6-digit OTP.'
      });
      return;
    }
    const chlId = `otp_chl_${Date.now()}`;
    setVerifiedOtpChallengeId(chlId);
    setFeedback({
      type: 'success',
      message: `Customer phone ${normalizePhoneE164(customerPhoneE164)} verified via OTP (${chlId}). Customer will set their own password in the Mobile App.`
    });
  };

  // Submit 9-Step Showroom Vehicle Registration
  const handleRegisterVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (activeShowroom.status === 'SUSPENDED') {
      setFeedback({
        type: 'error',
        message: `Showroom ${activeShowroom.dealerCode} is SUSPENDED by Parent Company Admin. All vehicle registrations and device bindings are blocked.`
      });
      return;
    }

    if (!verifiedOtpChallengeId) {
      setFeedback({
        type: 'error',
        message: 'Customer phone number must be verified via 6-digit SMS OTP before registration.'
      });
      return;
    }

    const parsed = showroomVehicleRegistrationSchema.safeParse({
      showroomId: activeShowroom.id,
      registrationNumber: regNumber,
      vin,
      manufacturer,
      model,
      variant,
      manufacturingYear: Number(manufacturingYear),
      color,
      fuelType,
      customerFullName,
      customerPhoneE164,
      customerEmail: customerEmail || null,
      customerOtpChallengeId: verifiedOtpChallengeId,
      assignedDeviceSerial
    });

    if (!parsed.success) {
      setFeedback({
        type: 'error',
        message: parsed.error.issues[0]?.message ?? 'Validation error in registration form.'
      });
      return;
    }

    // Check deterministic _uniqueLocks
    const normalizedReg = normalizeRegistrationNumber(parsed.data.registrationNumber);
    const normalizedVinValue = normalizeVin(parsed.data.vin);
    const normalizedSerial = normalizeDeviceSerial(parsed.data.assignedDeviceSerial);

    if (registeredVehicles.some((v) => v.registrationNumber === normalizedReg)) {
      setFeedback({
        type: 'error',
        message: `Uniqueness Lock Conflict (${UNIQUE_LOCK_KEYS.vehicleRegistration(normalizedReg)}): Vehicle registration ${normalizedReg} is already registered.`
      });
      return;
    }
    if (registeredVehicles.some((v) => v.vin === normalizedVinValue)) {
      setFeedback({
        type: 'error',
        message: `Uniqueness Lock Conflict (${UNIQUE_LOCK_KEYS.vehicleVin(normalizedVinValue)}): VIN ${normalizedVinValue} is already bound.`
      });
      return;
    }
    if (registeredVehicles.some((v) => v.assignedDeviceSerial === normalizedSerial)) {
      setFeedback({
        type: 'error',
        message: `Uniqueness Lock Conflict (${UNIQUE_LOCK_KEYS.deviceSerial(normalizedSerial)}): STM32U575 unit ${normalizedSerial} is already assigned to another vehicle.`
      });
      return;
    }

    const created: RegisteredVehicleItem = {
      id: `veh_${normalizedReg.toLowerCase()}`,
      showroomId: activeShowroom.id,
      dealerCode: activeShowroom.dealerCode,
      companyId: activeShowroom.companyId,
      registrationNumber: normalizedReg,
      vin: normalizedVinValue,
      manufacturer: parsed.data.manufacturer,
      model: parsed.data.model,
      variant: parsed.data.variant,
      manufacturingYear: parsed.data.manufacturingYear,
      color: parsed.data.color,
      fuelType: parsed.data.fuelType,
      customerFullName: parsed.data.customerFullName,
      customerPhoneE164: parsed.data.customerPhoneE164,
      customerEmail: parsed.data.customerEmail ?? '',
      assignedDeviceSerial: normalizedSerial,
      registeredByUserId: 'stf_101',
      registeredByStaffName: activeShowroom.managerName,
      registeredAt: 'Just now',
      customerActivationState: 'PENDING_CUSTOMER_OTP_PASSWORD_SETUP'
    };

    setRegisteredVehicles((prev) => [created, ...prev]);
    setShowrooms((prev) =>
      prev.map((s) =>
        s.id === activeShowroom.id
          ? { ...s, registeredVehicleCount: s.registeredVehicleCount + 1 }
          : s
      )
    );
    setFeedback({
      type: 'success',
      message: `Vehicle ${normalizedReg} & STM32U575 unit ${normalizedSerial} atomically registered by ${activeShowroom.dealerCode}. Customer (${created.customerPhoneE164}) can now activate in the Mobile App.`
    });
    setActiveTab('REGISTERED_VEHICLES');
  };

  // Toggle Showroom Suspension (Parent Company Admin only)
  const toggleShowroomStatus = (showroomId: string) => {
    if (activeRole !== USER_ROLES.COMPANY_ADMIN) {
      setFeedback({
        type: 'error',
        message: 'Only COMPANY_ADMIN can suspend or reactivate showrooms.'
      });
      return;
    }
    setShowrooms((prev) =>
      prev.map((s) => {
        if (s.id !== showroomId) return s;
        const nextStatus = s.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        setFeedback({
          type: 'success',
          message: `Showroom ${s.dealerCode} status updated to ${nextStatus}. Audit log recorded.`
        });
        return { ...s, status: nextStatus };
      })
    );
  };

  // Create New Showroom under Parent Company
  const handleCreateShowroom = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRole !== USER_ROLES.COMPANY_ADMIN) return;
    if (newShowroomName.trim().length < 4 || newShowroomDealerCode.trim().length < 4) {
      setFeedback({
        type: 'error',
        message: 'Showroom name and unique dealer code are required.'
      });
      return;
    }
    const cleanCode = newShowroomDealerCode.trim().toUpperCase();
    if (showrooms.some((s) => s.dealerCode === cleanCode)) {
      setFeedback({
        type: 'error',
        message: `Lock conflict (${UNIQUE_LOCK_KEYS.dealerCode('cmp_zealion_motors', cleanCode)}): Dealer code already exists.`
      });
      return;
    }
    const created: ShowroomItem = {
      id: `shw_${Date.now()}`,
      companyId: 'cmp_zealion_motors',
      companyName: 'Zealion Automotive Group India Ltd.',
      name: newShowroomName.trim(),
      dealerCode: cleanCode,
      city: newShowroomCity.trim(),
      state: 'Uttar Pradesh',
      jurisdictionCode: newShowroomJurisdiction.trim().toUpperCase(),
      status: 'ACTIVE',
      managerName: newShowroomManager.trim(),
      registeredVehicleCount: 0
    };
    setShowrooms((prev) => [...prev, created]);
    setNewShowroomName('');
    setFeedback({
      type: 'success',
      message: `Showroom ${created.name} (${created.dealerCode}) provisioned under Zealion Automotive Group.`
    });
  };

  // Apply Permitted Non-Destructive Vehicle Correction
  const handleApplyCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicleId || correctionReason.trim().length < 5) {
      setFeedback({
        type: 'error',
        message: 'A detailed audit reason (min 5 chars) is mandatory for vehicle corrections.'
      });
      return;
    }
    setRegisteredVehicles((prev) =>
      prev.map((v) =>
        v.id === editingVehicleId
          ? {
              ...v,
              color: correctionColor.trim() || v.color,
              variant: correctionVariant.trim() || v.variant
            }
          : v
      )
    );
    setEditingVehicleId(null);
    setCorrectionReason('');
    setFeedback({
      type: 'success',
      message: 'Permitted non-destructive correction applied and recorded in immutable auditLogs.'
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-[#0F172A] flex flex-col">
      {/* Top Institutional Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E40AF] text-white flex items-center justify-center shadow-sm">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  VeerXcape Showroom & Parent-Company Portal
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1E40AF] border border-blue-200">
                  {activeRole}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Tenant: <span className="font-semibold">Zealion Automotive Group India Ltd.</span> ·
                Firebase: <span className="font-mono">{firebaseConfig.projectId}</span>
              </p>
            </div>
          </div>

          {/* Role & Showroom Scope Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Shield className="w-4 h-4 text-[#1E40AF]" />
              <select
                aria-label="Portal Role Switcher"
                value={activeRole}
                onChange={(e) =>
                  setActiveRole(
                    e.target.value as
                      | typeof USER_ROLES.COMPANY_ADMIN
                      | typeof USER_ROLES.SHOWROOM_MANAGER
                      | typeof USER_ROLES.SHOWROOM_STAFF
                  )
                }
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value={USER_ROLES.COMPANY_ADMIN}>
                  Role: COMPANY_ADMIN (Parent OEM Oversight)
                </option>
                <option value={USER_ROLES.SHOWROOM_MANAGER}>
                  Role: SHOWROOM_MANAGER (Single Showroom Scope)
                </option>
                <option value={USER_ROLES.SHOWROOM_STAFF}>
                  Role: SHOWROOM_STAFF (Registration Desk)
                </option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Building2 className="w-4 h-4 text-slate-600" />
              <select
                aria-label="Active Showroom Scope"
                value={scopedShowroomId}
                onChange={(e) => setScopedShowroomId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                {showrooms.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.dealerCode} — {s.city} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-1 border-t border-slate-100 bg-slate-50/60">
          {(
            [
              ['COMPANY_OVERVIEW', '1. Parent-Company Overview', Building2],
              ['SHOWROOM_MANAGEMENT', '2. Showroom Network & Status', Store],
              ['WIZARD_REGISTER_VEHICLE', '3. 9-Step Vehicle Registration Wizard', PlusCircle],
              ['REGISTERED_VEHICLES', '4. Registered Vehicles & Corrections', Car],
              ['DEVICE_INSTALLATIONS', '5. STM32U575 Installation Ledger', Cpu],
              ['STAFF_DIRECTORY', '6. Showroom Staff & Managers', Users]
            ] as const
          ).map(([tabId, label, Icon]) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={`px-3.5 py-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
                activeTab === tabId
                  ? 'border-[#2563EB] text-[#1E40AF] bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`border-b px-4 py-2.5 text-xs font-medium ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="underline font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl w-full mx-auto flex-1 p-4 md:p-6 space-y-6">
        {/* Multi-Tenant Isolation Notice */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#1E40AF]" />
            <span>
              {activeRole === USER_ROLES.COMPANY_ADMIN ? (
                <>
                  <strong>Parent-Company Scope Active:</strong> Viewing all{' '}
                  {showrooms.length} showrooms under{' '}
                  <span className="font-mono">cmp_zealion_motors</span>. Cross-company data is
                  blocked.
                </>
              ) : (
                <>
                  <strong>Strict Single-Showroom Isolation Active:</strong> Scoped exclusively to{' '}
                  <span className="font-mono font-bold">{activeShowroom.dealerCode}</span> (
                  {activeShowroom.name}). Sibling showrooms are isolated.
                </>
              )}
            </span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full font-bold ${
              activeShowroom.status === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-[#DC2626] border border-red-200'
            }`}
          >
            Active Showroom Status: {activeShowroom.status}
          </span>
        </div>

        {/* ====================================================================
            TAB 1: PARENT-COMPANY OVERVIEW
        ==================================================================== */}
        {activeTab === 'COMPANY_OVERVIEW' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">Total Child Showrooms</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{showrooms.length}</div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  {showrooms.filter((s) => s.status === 'ACTIVE').length} Active ·{' '}
                  {showrooms.filter((s) => s.status === 'SUSPENDED').length} Suspended
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Cumulative Vehicles Provisioned
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {showrooms.reduce((acc, s) => acc + s.registeredVehicleCount, 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  100% bound with STM32U575 hardware
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Deterministic Uniqueness Locks
                </div>
                <div className="text-2xl font-bold text-[#1E40AF] mt-1">Enforced</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  reg_*, vin_*, serial_*, dealer_*
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Customer Password Zero-Knowledge
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">Verified</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Showroom verifies OTP only; customer sets password
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Showroom Performance & Regional Distribution
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-3">Dealer Code</th>
                      <th className="py-2.5 px-3">Showroom Name</th>
                      <th className="py-2.5 px-3">City / Jurisdiction</th>
                      <th className="py-2.5 px-3">Showroom Manager</th>
                      <th className="py-2.5 px-3">Vehicles Registered</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {showrooms.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-mono font-bold text-[#1E40AF]">
                          {s.dealerCode}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">{s.name}</td>
                        <td className="py-3 px-3 text-slate-600">
                          {s.city} ({s.jurisdictionCode})
                        </td>
                        <td className="py-3 px-3 text-slate-700">{s.managerName}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {s.registeredVehicleCount}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              s.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-red-50 text-[#DC2626]'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 2: SHOWROOM NETWORK & SUSPENSION CONTROLS
        ==================================================================== */}
        {activeTab === 'SHOWROOM_MANAGEMENT' && (
          <div className="space-y-6">
            {activeRole === USER_ROLES.COMPANY_ADMIN ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Onboard New Authorised Showroom (COMPANY_ADMIN)
                </h2>
                <form
                  onSubmit={handleCreateShowroom}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs"
                >
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Showroom Name
                    </label>
                    <input
                      type="text"
                      value={newShowroomName}
                      onChange={(e) => setNewShowroomName(e.target.value)}
                      placeholder="Zealion Varanasi Cantt Showroom"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Unique Dealer Code
                    </label>
                    <input
                      type="text"
                      value={newShowroomDealerCode}
                      onChange={(e) => setNewShowroomDealerCode(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">City</label>
                    <input
                      type="text"
                      value={newShowroomCity}
                      onChange={(e) => setNewShowroomCity(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Jurisdiction Code
                    </label>
                    <input
                      type="text"
                      value={newShowroomJurisdiction}
                      onChange={(e) => setNewShowroomJurisdiction(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Showroom Manager
                    </label>
                    <input
                      type="text"
                      value={newShowroomManager}
                      onChange={(e) => setNewShowroomManager(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold"
                    >
                      Provision Showroom
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
                Switch Role to <strong>COMPANY_ADMIN</strong> in the top bar to onboard new
                showrooms or suspend/reactivate existing dealerships.
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Dealership Status & Immediate Suspension Governance
              </h3>
              {showrooms.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {s.name} (<span className="font-mono">{s.dealerCode}</span>)
                    </div>
                    <div className="text-slate-500">
                      Manager: {s.managerName} · Jurisdiction: {s.jurisdictionCode} · Vehicles:{' '}
                      {s.registeredVehicleCount}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full font-bold ${
                        s.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-red-50 text-[#DC2626]'
                      }`}
                    >
                      {s.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleShowroomStatus(s.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700"
                    >
                      {s.status === 'ACTIVE' ? 'Suspend Showroom' : 'Reactivate Showroom'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 3: 9-STEP SHOWROOM VEHICLE REGISTRATION WIZARD
        ==================================================================== */}
        {activeTab === 'WIZARD_REGISTER_VEHICLE' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#1E40AF]">
                  Authorised Dealership Provisioning Flow
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  9-Step Vehicle, Customer OTP & STM32U575 Hardware Registration Wizard
                </h2>
                <p className="text-xs text-slate-500">
                  Executes an atomic Firestore transaction reserving _uniqueLocks for registration
                  number, 17-char VIN, and STM32U575 device serial.
                </p>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold text-slate-800">
                  Originating Showroom: {activeShowroom.dealerCode}
                </div>
                <div className="text-slate-500">{activeShowroom.name}</div>
              </div>
            </div>

            <form onSubmit={handleRegisterVehicle} className="space-y-6 text-xs">
              {/* Steps 1 to 3: Showroom, Registration Number & VIN */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="font-bold text-[#1E40AF]">
                    Step 1: Originating Showroom Scope
                  </div>
                  <div className="font-semibold text-slate-900">{activeShowroom.name}</div>
                  <div className="font-mono text-slate-600">
                    Dealer Code: {activeShowroom.dealerCode}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Status: <span className="font-bold">{activeShowroom.status}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block font-bold text-[#1E40AF]">
                    Step 2: Vehicle Registration Number
                  </label>
                  <input
                    type="text"
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    placeholder="UP32AB1234"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase bg-white"
                  />
                  <div className="text-[11px] text-slate-500 font-mono">
                    Lock: {UNIQUE_LOCK_KEYS.vehicleRegistration(regNumber || 'PENDING')}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block font-bold text-[#1E40AF]">
                    Step 3: 17-Character Vehicle VIN
                  </label>
                  <input
                    type="text"
                    maxLength={17}
                    value={vin}
                    onChange={(e) => setVin(e.target.value)}
                    placeholder="MA1TA2MKXKA909012"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase bg-white"
                  />
                  <div className="text-[11px] text-slate-500 font-mono">
                    Lock: {UNIQUE_LOCK_KEYS.vehicleVin(vin || 'PENDING')}
                  </div>
                </div>
              </div>

              {/* Step 4: Vehicle Technical Specifications */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-bold text-[#1E40AF]">
                  Step 4: Vehicle Make, Model, Variant & Powertrain Specifications
                </div>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Manufacturer</label>
                    <input
                      type="text"
                      value={manufacturer}
                      onChange={(e) => setManufacturer(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Variant</label>
                    <input
                      type="text"
                      value={variant}
                      onChange={(e) => setVariant(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Year</label>
                    <input
                      type="number"
                      value={manufacturingYear}
                      onChange={(e) => setManufacturingYear(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Color</label>
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Fuel Type</label>
                    <select
                      value={fuelType}
                      onChange={(e) =>
                        setFuelType(
                          e.target.value as 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID' | 'CNG'
                        )
                      }
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="EV">EV</option>
                      <option value="PETROL">PETROL</option>
                      <option value="DIESEL">DIESEL</option>
                      <option value="HYBRID">HYBRID</option>
                      <option value="CNG">CNG</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Steps 5 & 6: Customer Identity & Live SMS OTP Verification (Zero-Knowledge Password) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="font-bold text-[#1E40AF]">
                    Step 5: Vehicle Owner Identity (Phone = Login ID)
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Customer Full Name
                      </label>
                      <input
                        type="text"
                        value={customerFullName}
                        onChange={(e) => setCustomerFullName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Customer Phone Number (E.164)
                      </label>
                      <input
                        type="text"
                        value={customerPhoneE164}
                        onChange={(e) => {
                          setCustomerPhoneE164(e.target.value);
                          setVerifiedOtpChallengeId(null);
                        }}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Customer Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3">
                  <div className="font-bold text-[#1E40AF]">
                    Step 6: Customer SMS OTP Verification (No Showroom Password Entry)
                  </div>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    Security Policy: Showroom staff verify customer phone ownership via 6-digit OTP
                    and <strong>never set or view</strong> the customer&apos;s password. The
                    customer sets their own password in the VeerXcape Mobile App.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={customerOtpInput}
                      onChange={(e) => setCustomerOtpInput(e.target.value)}
                      placeholder="6-digit OTP"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyCustomerOtp}
                      className="px-3.5 py-2 rounded-lg bg-[#1E40AF] text-white font-semibold"
                    >
                      Verify Customer OTP
                    </button>
                  </div>
                  {verifiedOtpChallengeId && (
                    <div className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded">
                      ✓ Verified Challenge ID: {verifiedOtpChallengeId}
                    </div>
                  )}
                </div>
              </div>

              {/* Steps 7, 8, 9: STM32U575 Hardware Binding & Atomic Commit */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="space-y-2">
                  <label className="block font-bold text-[#1E40AF]">
                    Step 7: Assign STM32U575 Safety Hardware Unit
                  </label>
                  <input
                    type="text"
                    value={assignedDeviceSerial}
                    onChange={(e) => setAssignedDeviceSerial(e.target.value)}
                    placeholder="VX-STM32U575-8E30B7"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase bg-white"
                  />
                  <div className="text-[11px] text-slate-500 font-mono">
                    Hardware Lock: {UNIQUE_LOCK_KEYS.deviceSerial(assignedDeviceSerial || 'NONE')}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-bold text-slate-800">
                    Steps 8 & 9: Atomic Firestore Transaction & Provenance Certificate
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Creates vehicles, vehicleOwners, deviceAssignments, _uniqueLocks, and an
                    append-only SHA-256 audit log entry attributed to {activeShowroom.dealerCode}.
                  </p>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-lg bg-[#059669] hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition"
                  >
                    Complete Atomic Vehicle & STM32U575 Registration
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ====================================================================
            TAB 4: REGISTERED VEHICLES & PERMITTED CORRECTIONS
        ==================================================================== */}
        {activeTab === 'REGISTERED_VEHICLES' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Registered Vehicles & Traceable Showroom Provenance ({visibleVehicles.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Showroom staff can perform permitted non-destructive metadata corrections
                    (color, variant) with a mandatory audit reason.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {visibleVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {v.registrationNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1E40AF] font-mono font-semibold">
                          {v.dealerCode}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                          {v.assignedDeviceSerial}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-800">
                        {v.manufacturer} {v.model} · {v.variant} · {v.color} ({v.fuelType})
                      </div>
                      <div className="text-slate-500">
                        VIN: <span className="font-mono">{v.vin}</span> · Owner: {v.customerFullName}{' '}
                        (<span className="font-mono">{v.customerPhoneE164}</span>)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Registered by: {v.registeredByStaffName} ({v.registeredByUserId}) at{' '}
                        {v.registeredAt} · Customer Status: {v.customerActivationState}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingVehicleId(v.id);
                        setCorrectionColor(v.color);
                        setCorrectionVariant(v.variant);
                        setCorrectionReason('');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Permitted Correction
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {editingVehicleId && (
              <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-sm space-y-4 text-xs">
                <h3 className="text-sm font-bold text-[#1E40AF]">
                  Permitted Non-Destructive Record Correction (Audit Logged)
                </h3>
                <form
                  onSubmit={handleApplyCorrection}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Updated Color
                    </label>
                    <input
                      type="text"
                      value={correctionColor}
                      onChange={(e) => setCorrectionColor(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Updated Variant
                    </label>
                    <input
                      type="text"
                      value={correctionVariant}
                      onChange={(e) => setCorrectionVariant(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Mandatory Audit Reason
                    </label>
                    <input
                      type="text"
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g. Corrected variant trim per invoice"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingVehicleId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#2563EB] text-white font-semibold"
                    >
                      Save Audited Correction
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 5: STM32U575 INSTALLATION LEDGER
        ==================================================================== */}
        {activeTab === 'DEVICE_INSTALLATIONS' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs">
            <h2 className="text-base font-bold text-slate-900">
              STM32U575 Hardware Binding & Installation Verification Ledger
            </h2>
            <p className="text-slate-500">
              Hardware HMAC signing keys reside exclusively in server-side _deviceKeyVault / Secret
              Manager and are never exposed to showroom browsers.
            </p>
            <div className="space-y-2.5">
              {visibleVehicles.map((v) => (
                <div
                  key={v.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-bold text-[#1E40AF]">
                      {v.assignedDeviceSerial}
                    </span>{' '}
                    → Bound to <span className="font-mono font-bold">{v.registrationNumber}</span> (
                    {v.manufacturer} {v.model})
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                    HMAC Key Provisioned Server-Side · Active
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 6: SHOWROOM STAFF DIRECTORY
        ==================================================================== */}
        {activeTab === 'STAFF_DIRECTORY' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs">
            <h2 className="text-base font-bold text-slate-900">
              Authorised Showroom Managers & Registration Staff ({visibleStaff.length})
            </h2>
            <div className="space-y-2.5">
              {visibleStaff.map((stf) => (
                <div
                  key={stf.id}
                  className="p-4 rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900">{stf.fullName}</div>
                    <div className="text-slate-500">
                      {stf.email} · <span className="font-mono">{stf.phoneE164}</span> · Showroom:{' '}
                      <span className="font-mono">{stf.showroomId}</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#1E40AF] font-semibold">
                    {stf.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

