import {
  INCIDENT_LIFECYCLE_STATES,
  INCIDENT_TYPES,
  NOTIFICATION_STATUSES,
  USER_ROLES,
  type IncidentLifecycleState,
  type IncidentTypeCode,
  type NotificationStatus,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import type { FamilyMemberPermissions } from '@veerxcape/shared-types';

export interface MobileVehicleRecord {
  id: string;
  registrationNumber: string;
  vin: string;
  manufacturer: string;
  model: string;
  variant: string;
  manufacturingYear: number;
  color: string;
  fuelType: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID' | 'CNG';
  ownerUserId: string;
  ownerName: string;
  ownerPhoneE164: string;
  registeredByShowroomName: string;
  registeredByDealerCode: string;
  assignedDeviceSerial: string;
  firmwareVersion: string;
  jurisdictionCode: string;
  roadSegmentSummary: string;
  lat: number;
  lng: number;
  speedKmh: number;
  lastLocationUpdateSecondsAgo: number;
  lastHeartbeatSecondsAgo: number;
  ignitionOn: boolean;
  doorsLocked: boolean;
  windowsClosed: boolean;
  cabinTempCelsius: number;
  occupantDetected: boolean;
  smokeDetected: boolean;
  coPpm: number;
  peakImpactG: number;
  mainVoltageMv: number;
  backupBatteryPercent: number;
  powerSource: 'VEHICLE_12V' | 'BACKUP_BATTERY';
  cellularRssiDbm: number;
  gnssFixStatus: 'FIX_3D' | 'FIX_2D' | 'NO_FIX';
}

export interface MobileFamilyMemberItem {
  id: string;
  vehicleId: string;
  fullName: string;
  phoneE164: string;
  relationship: string;
  status: 'PENDING_OTP_AND_PASSWORD_CHANGE' | 'ACTIVE' | 'REVOKED';
  permissions: FamilyMemberPermissions;
  invitedAt: string;
}

export interface MobileDriverItem {
  id: string;
  vehicleId: string;
  fullName: string;
  phoneE164: string;
  licenseNumber: string;
  status: 'ACTIVE' | 'REVOKED';
  assignedShift: string;
}

export interface MobileIncidentItem {
  id: string;
  vehicleId: string;
  registrationNumber: string;
  incidentType: IncidentTypeCode;
  source: 'MANUAL_USER_SOS' | 'STM32U575_HARDWARE';
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  lifecycleState: IncidentLifecycleState;
  jurisdictionCode: string;
  roadSegmentSummary: string;
  lat: number;
  lng: number;
  occurredAt: string;
  description: string;
  assignedAuthorityDept: string[];
  dispatchReferenceCode?: string;
  assignedOfficerName?: string;
}

export interface MobileNotificationItem {
  id: string;
  title: string;
  body: string;
  category: 'EMERGENCY' | 'TELEMETRY' | 'FAMILY_ACCESS' | 'SYSTEM';
  status: NotificationStatus;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface MobileSupportTicketItem {
  id: string;
  vehicleId: string;
  category: 'DEVICE_ISSUE' | 'ACCOUNT_RECOVERY' | 'FALSE_ALARM' | 'SHOWROOM_CORRECTION' | 'GENERAL';
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
}

export const INITIAL_VEHICLES: MobileVehicleRecord[] = [
  {
    id: 'veh_up32ab1234',
    registrationNumber: 'UP32AB1234',
    vin: 'MA1TA2MKXKA019283',
    manufacturer: 'Tata Motors',
    model: 'Harrier EV',
    variant: 'Empowered+ AWD',
    manufacturingYear: 2026,
    color: 'Sapphire Metallic',
    fuelType: 'EV',
    ownerUserId: 'usr_owner_01',
    ownerName: 'Aarav Vikram Singh',
    ownerPhoneE164: '+919876543210',
    registeredByShowroomName: 'Zealion Flagship Showroom — Gomti Nagar, Lucknow',
    registeredByDealerCode: 'ZLN-UP-LKO-01',
    assignedDeviceSerial: 'VX-STM32U575-9A84F1',
    firmwareVersion: 'v2.4.1-stm32u5',
    jurisdictionCode: 'IN-UP-LKO',
    roadSegmentSummary: 'Shaheed Path Expressway KM 14.2, Gomti Nagar Extension, Lucknow',
    lat: 26.8467,
    lng: 81.0042,
    speedKmh: 62,
    lastLocationUpdateSecondsAgo: 14,
    lastHeartbeatSecondsAgo: 18,
    ignitionOn: true,
    doorsLocked: true,
    windowsClosed: true,
    cabinTempCelsius: 23.4,
    occupantDetected: true,
    smokeDetected: false,
    coPpm: 4,
    peakImpactG: 1.08,
    mainVoltageMv: 13850,
    backupBatteryPercent: 98,
    powerSource: 'VEHICLE_12V',
    cellularRssiDbm: -67,
    gnssFixStatus: 'FIX_3D'
  },
  {
    id: 'veh_dl01cx8890',
    registrationNumber: 'DL01CX8890',
    vin: 'MBJ53ZBT9P0928174',
    manufacturer: 'Mahindra',
    model: 'XUV700',
    variant: 'AX7 Luxury Diesel',
    manufacturingYear: 2025,
    color: 'Everest White',
    fuelType: 'DIESEL',
    ownerUserId: 'usr_owner_01',
    ownerName: 'Aarav Vikram Singh',
    ownerPhoneE164: '+919876543210',
    registeredByShowroomName: 'Capital Auto Prime — Connaught Place, New Delhi',
    registeredByDealerCode: 'CAP-DL-NDL-04',
    assignedDeviceSerial: 'VX-STM32U575-4B21C9',
    firmwareVersion: 'v2.4.0-stm32u5',
    jurisdictionCode: 'IN-DL-NDL',
    roadSegmentSummary: 'Basement Parking Level B2, CyberHub Sector 24',
    lat: 28.495,
    lng: 77.0895,
    speedKmh: 0,
    lastLocationUpdateSecondsAgo: 420,
    lastHeartbeatSecondsAgo: 85,
    ignitionOn: false,
    doorsLocked: true,
    windowsClosed: true,
    cabinTempCelsius: 29.1,
    occupantDetected: false,
    smokeDetected: false,
    coPpm: 2,
    peakImpactG: 1.0,
    mainVoltageMv: 12620,
    backupBatteryPercent: 94,
    powerSource: 'VEHICLE_12V',
    cellularRssiDbm: -88,
    gnssFixStatus: 'NO_FIX'
  }
];

export const INITIAL_FAMILY_MEMBERS: MobileFamilyMemberItem[] = [
  {
    id: 'fam_01',
    vehicleId: 'veh_up32ab1234',
    fullName: 'Meera Vikram Singh',
    phoneE164: '+919876543211',
    relationship: 'Spouse',
    status: 'ACTIVE',
    invitedAt: '2026-10-14 11:20 IST',
    permissions: {
      canViewLocation: true,
      canViewTelemetry: true,
      canReceiveCriticalAlerts: true,
      canViewIncidentHistory: true,
      canTriggerSos: true
    }
  },
  {
    id: 'fam_02',
    vehicleId: 'veh_up32ab1234',
    fullName: 'Rohan Vikram Singh',
    phoneE164: '+919876543212',
    relationship: 'Parent',
    status: 'PENDING_OTP_AND_PASSWORD_CHANGE',
    invitedAt: '2026-11-03 18:05 IST',
    permissions: {
      canViewLocation: true,
      canViewTelemetry: false,
      canReceiveCriticalAlerts: true,
      canViewIncidentHistory: true,
      canTriggerSos: false
    }
  }
];

export const INITIAL_DRIVERS: MobileDriverItem[] = [
  {
    id: 'drv_01',
    vehicleId: 'veh_up32ab1234',
    fullName: 'Rajesh Kumar Yadav',
    phoneE164: '+919811223344',
    licenseNumber: 'UP32-20160098412',
    status: 'ACTIVE',
    assignedShift: 'Mon–Sat · 08:00–20:00 IST'
  }
];

export const INITIAL_INCIDENTS: MobileIncidentItem[] = [
  {
    id: 'inc_9042',
    vehicleId: 'veh_up32ab1234',
    registrationNumber: 'UP32AB1234',
    incidentType: INCIDENT_TYPES.PARKED_OCCUPANT_ALERT,
    source: 'STM32U575_HARDWARE',
    severity: 'HIGH',
    lifecycleState: INCIDENT_LIFECYCLE_STATES.RESOLVED,
    jurisdictionCode: 'IN-UP-LKO',
    roadSegmentSummary: 'Hazratganj Multi-Level Parking, Lucknow',
    lat: 26.85,
    lng: 80.9462,
    occurredAt: '2026-10-29 14:32 IST',
    description:
      'STM32U575 mmWave cabin radar detected occupant movement with ignition OFF and cabin temperature reaching 36.2°C. Owner acknowledged and unlocked vehicle within 90 seconds.',
    assignedAuthorityDept: ['MEDICAL', 'POLICE']
  },
  {
    id: 'inc_9088',
    vehicleId: 'veh_up32ab1234',
    registrationNumber: 'UP32AB1234',
    incidentType: INCIDENT_TYPES.ROAD_HAZARD,
    source: 'STM32U575_HARDWARE',
    severity: 'WARNING',
    lifecycleState: INCIDENT_LIFECYCLE_STATES.AUTHORITY_ACKNOWLEDGED,
    jurisdictionCode: 'IN-UP-LKO',
    roadSegmentSummary: 'Shaheed Path Service Lane Near Ekana Stadium',
    lat: 26.8124,
    lng: 81.0156,
    occurredAt: '2026-11-02 19:15 IST',
    description:
      'Vertical Z-axis shock anomaly (2.9G) reported anonymized road-surface hazard to IN-UP-LKO Road Authority.',
    assignedAuthorityDept: ['ROAD'],
    assignedOfficerName: 'Er. S. K. Srivastava (NHAI/PWD Desk)'
  }
];

export const INITIAL_NOTIFICATIONS: MobileNotificationItem[] = [
  {
    id: 'notif_01',
    title: 'STM32U575 Heartbeat Verified (v2.4.1)',
    body: 'Vehicle UP32AB1234 hardware unit VX-STM32U575-9A84F1 completed cryptographic HMAC-SHA256 sequence check.',
    category: 'TELEMETRY',
    status: NOTIFICATION_STATUSES.READ,
    createdAt: '10 mins ago',
    deliveredAt: '10 mins ago',
    readAt: '8 mins ago'
  },
  {
    id: 'notif_02',
    title: 'Road Hazard Shared (Anonymized) with IN-UP-LKO Road Desk',
    body: 'Only coordinates and Z-axis shock severity were shared. Vehicle registration, VIN, and owner PII were stripped.',
    category: 'EMERGENCY',
    status: NOTIFICATION_STATUSES.CLIENT_DELIVERED_ACK,
    createdAt: '45 mins ago',
    deliveredAt: '44 mins ago'
  },
  {
    id: 'notif_03',
    title: 'Family Member Invite Pending Activation',
    body: 'Rohan Vikram Singh (+919876543212) must verify OTP and replace the temporary password before accessing UP32AB1234.',
    category: 'FAMILY_ACCESS',
    status: NOTIFICATION_STATUSES.FCM_ACCEPTED,
    createdAt: '2 mins ago'
  }
];

export const INITIAL_TICKETS: MobileSupportTicketItem[] = [
  {
    id: 'tkt_301',
    vehicleId: 'veh_up32ab1234',
    category: 'SHOWROOM_CORRECTION',
    subject: 'Verify fast-charging EV variant badge on insurance export',
    description: 'Requesting verification that variant Empowered+ AWD is reflected on showroom certificate.',
    status: 'RESOLVED',
    createdAt: '2026-10-20'
  }
];

export const SUPPORTED_MOBILE_ROLES: {
  role: UserRoleCode;
  label: string;
  badge: string;
  summary: string;
}[] = [
  {
    role: USER_ROLES.VEHICLE_OWNER,
    label: 'Vehicle Owner',
    badge: 'Full Vehicle Authority',
    summary: 'Full access to live telemetry, SOS, family invitations, permission toggles, and driver management.'
  },
  {
    role: USER_ROLES.FAMILY_MEMBER,
    label: 'Authorised Family Member',
    badge: 'Granular Owner-Scoped Access',
    summary: 'Access strictly governed by the Vehicle Owner’s active FamilyMembership permission flags.'
  },
  {
    role: USER_ROLES.DRIVER,
    label: 'Assigned Driver',
    badge: 'Trip & Safety Operator',
    summary: 'Can view assigned vehicle safety status, trigger Emergency SOS, and view active shift alerts.'
  }
];

