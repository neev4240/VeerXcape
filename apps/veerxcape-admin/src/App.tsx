import React, { useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  Cpu,
  Database,
  FileSearch,
  KeyRound,
  Shield,
  Users
} from 'lucide-react';
import {
  ALL_USER_ROLES,
  AUTHORITY_DEPARTMENTS,
  FIRESTORE_COLLECTIONS,
  GENESIS_AUDIT_HASH,
  USER_ROLES,
  type AuthorityDepartment,
  type UserRoleCode
} from '@veerxcape/shared-constants';
import {
  computeAuditEntryHash,
  resolveFirebaseWebConfig,
  verifyAuditChainIntegrity
} from '@veerxcape/shared-services';
import type { AuditLogDocument } from '@veerxcape/shared-types';
import {
  deviceSerialSchema,
  roleAssignmentPayloadSchema
} from '@veerxcape/shared-validation';

interface ProvisionedDeviceItem {
  serialNumber: string;
  mcuFamily: 'STM32U575';
  firmwareVersion: string;
  keyVersion: number;
  secretManagerRef: string;
  status: 'PROVISIONED' | 'ASSIGNED' | 'SUSPENDED' | 'REVOKED';
  assignedVehicleReg: string | null;
}

interface AuthorityOrgItem {
  id: string;
  name: string;
  department: AuthorityDepartment;
  jurisdictionCode: string;
  verificationState: 'PENDING_ADMIN_APPROVAL' | 'VERIFIED' | 'SUSPENDED';
  contactOfficer: string;
}

type AdminTab =
  | 'PLATFORM_OVERVIEW'
  | 'USER_ROLE_GOVERNANCE'
  | 'STM32_DEVICE_VAULT'
  | 'AUTHORITY_APPROVALS'
  | 'AUDIT_HASH_CHAIN'
  | 'SYSTEM_CONFIG_COLLECTIONS';

function buildInitialAuditChain(): AuditLogDocument[] {
  const entries: AuditLogDocument[] = [];
  const rawItems: {
    id: string;
    sequenceIndex: number;
    actorUserId: string;
    actorRole: UserRoleCode;
    action: string;
    targetCollection: string;
    targetDocumentId: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[] = [
    {
      id: 'aud_0001',
      sequenceIndex: 1,
      actorUserId: 'usr_superadmin_01',
      actorRole: USER_ROLES.VEERXCAPE_SUPER_ADMIN,
      action: 'PROVISION_STM32U575_DEVICE',
      targetCollection: 'devices',
      targetDocumentId: 'VX-STM32U575-9A84F1',
      reason: 'Factory batch provisioning with 256-bit Secret Manager HMAC key v1',
      metadata: { keyVersion: 1 },
      createdAt: '2026-11-01T09:00:00.000Z'
    },
    {
      id: 'aud_0002',
      sequenceIndex: 2,
      actorUserId: 'stf_102',
      actorRole: USER_ROLES.SHOWROOM_STAFF,
      action: 'SHOWROOM_VEHICLE_REGISTRATION',
      targetCollection: 'vehicles',
      targetDocumentId: 'veh_up32ab1234',
      reason: 'Atomic vehicle, owner OTP & STM32U575 registration by ZLN-UP-LKO-01',
      metadata: { reg: 'UP32AB1234', device: 'VX-STM32U575-9A84F1' },
      createdAt: '2026-11-01T10:15:00.000Z'
    },
    {
      id: 'aud_0003',
      sequenceIndex: 3,
      actorUserId: 'usr_admin_02',
      actorRole: USER_ROLES.VEERXCAPE_ADMIN,
      action: 'VERIFY_GOVERNMENT_AUTHORITY',
      targetCollection: 'authorities',
      targetDocumentId: 'auth_lko_med_01',
      reason: 'Institutional verification completed for IN-UP-LKO Medical Directorate',
      metadata: { jurisdiction: 'IN-UP-LKO', department: 'MEDICAL' },
      createdAt: '2026-11-02T11:30:00.000Z'
    }
  ];

  let prevAuditHash = GENESIS_AUDIT_HASH;
  for (const item of rawItems) {
    const entryHash = computeAuditEntryHash({
      sequenceIndex: item.sequenceIndex,
      prevAuditHash,
      actorUserId: item.actorUserId,
      actorRole: item.actorRole,
      action: item.action,
      targetCollection: item.targetCollection,
      targetDocumentId: item.targetDocumentId,
      createdAt: item.createdAt,
      metadata: item.metadata
    });
    entries.push({
      id: item.id,
      sequenceIndex: item.sequenceIndex,
      prevAuditHash,
      entryHash,
      actorUserId: item.actorUserId,
      actorRole: item.actorRole,
      actorTenantId: null,
      actorIpHash: 'sha256_ip_internal',
      action: item.action,
      severity: 'SENSITIVE',
      targetCollection: item.targetCollection,
      targetDocumentId: item.targetDocumentId,
      reason: item.reason,
      metadata: item.metadata,
      retainUntil: '2033-11-01T00:00:00.000Z',
      createdAt: item.createdAt
    });
    prevAuditHash = entryHash;
  }
  return entries;
}

export default function App() {
  const firebaseConfig = useMemo(
    () =>
      resolveFirebaseWebConfig(
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
      ),
    []
  );

  const [activeAdminRole, setActiveAdminRole] = useState<
    | typeof USER_ROLES.VEERXCAPE_SUPER_ADMIN
    | typeof USER_ROLES.VEERXCAPE_ADMIN
    | typeof USER_ROLES.VEERXCAPE_SUPPORT
  >(USER_ROLES.VEERXCAPE_SUPER_ADMIN);
  const [activeTab, setActiveTab] = useState<AdminTab>('PLATFORM_OVERVIEW');

  const [devices, setDevices] = useState<ProvisionedDeviceItem[]>([
    {
      serialNumber: 'VX-STM32U575-9A84F1',
      mcuFamily: 'STM32U575',
      firmwareVersion: 'v2.4.1-stm32u5',
      keyVersion: 1,
      secretManagerRef: 'projects/veerxcape-01/secrets/dev-VX-STM32U575-9A84F1/versions/1',
      status: 'ASSIGNED',
      assignedVehicleReg: 'UP32AB1234'
    },
    {
      serialNumber: 'VX-STM32U575-4B21C9',
      mcuFamily: 'STM32U575',
      firmwareVersion: 'v2.4.0-stm32u5',
      keyVersion: 1,
      secretManagerRef: 'projects/veerxcape-01/secrets/dev-VX-STM32U575-4B21C9/versions/1',
      status: 'ASSIGNED',
      assignedVehicleReg: 'DL01CX8890'
    },
    {
      serialNumber: 'VX-STM32U575-8E30B7',
      mcuFamily: 'STM32U575',
      firmwareVersion: 'v2.4.1-stm32u5',
      keyVersion: 1,
      secretManagerRef: 'projects/veerxcape-01/secrets/dev-VX-STM32U575-8E30B7/versions/1',
      status: 'PROVISIONED',
      assignedVehicleReg: null
    }
  ]);

  const [authorities, setAuthorities] = useState<AuthorityOrgItem[]>([
    {
      id: 'auth_lko_med_01',
      name: 'Lucknow Emergency Medical & 108 Trauma Directorate',
      department: AUTHORITY_DEPARTMENTS.MEDICAL,
      jurisdictionCode: 'IN-UP-LKO',
      verificationState: 'VERIFIED',
      contactOfficer: 'Dr. A. K. Verma'
    },
    {
      id: 'auth_lko_pol_02',
      name: 'UP-112 Police Command & Control Room (Lucknow)',
      department: AUTHORITY_DEPARTMENTS.POLICE,
      jurisdictionCode: 'IN-UP-LKO',
      verificationState: 'VERIFIED',
      contactOfficer: 'Insp. R. P. Maurya'
    },
    {
      id: 'auth_lko_road_03',
      name: 'NHAI / PWD Highway Safety Cell (Lucknow Corridor)',
      department: AUTHORITY_DEPARTMENTS.ROAD,
      jurisdictionCode: 'IN-UP-LKO',
      verificationState: 'PENDING_ADMIN_APPROVAL',
      contactOfficer: 'Er. S. K. Srivastava'
    }
  ]);

  const [auditLogs, setAuditLogs] = useState<AuditLogDocument[]>(() =>
    buildInitialAuditChain()
  );

  // Role Assignment Form
  const [targetUserId, setTargetUserId] = useState('usr_authority_lko_09');
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState<string>(
    USER_ROLES.AUTHORITY_MEDICAL
  );
  const [scopeType, setScopeType] = useState<
    'PLATFORM' | 'COMPANY' | 'SHOWROOM' | 'AUTHORITY' | 'VEHICLE'
  >('AUTHORITY');
  const [scopeId, setScopeId] = useState('auth_lko_med_01');
  const [assignDepartment, setAssignDepartment] = useState<AuthorityDepartment>(
    AUTHORITY_DEPARTMENTS.MEDICAL
  );
  const [assignJurisdiction, setAssignJurisdiction] = useState('IN-UP-LKO');

  // New Device Provisioning Form
  const [newDeviceSerial, setNewDeviceSerial] = useState('VX-STM32U575-5D99A2');
  const [newDeviceFirmware, setNewDeviceFirmware] = useState('v2.4.1-stm32u5');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const appendAuditEntry = (
    action: string,
    targetCollection: string,
    targetDocumentId: string,
    reason: string,
    metadata: Record<string, unknown> = {}
  ) => {
    setAuditLogs((prev) => {
      const last = prev[prev.length - 1];
      const prevAuditHash = last ? last.entryHash : GENESIS_AUDIT_HASH;
      const sequenceIndex = last ? last.sequenceIndex + 1 : 1;
      const createdAt = new Date().toISOString();
      const entryHash = computeAuditEntryHash({
        sequenceIndex,
        prevAuditHash,
        actorUserId: 'usr_current_admin',
        actorRole: activeAdminRole,
        action,
        targetCollection,
        targetDocumentId,
        createdAt,
        metadata
      });
      const nextDoc: AuditLogDocument = {
        id: `aud_000${sequenceIndex}`,
        sequenceIndex,
        prevAuditHash,
        entryHash,
        actorUserId: 'usr_current_admin',
        actorRole: activeAdminRole,
        actorTenantId: null,
        actorIpHash: 'sha256_ip_admin',
        action,
        severity: 'SENSITIVE',
        targetCollection,
        targetDocumentId,
        reason,
        metadata,
        retainUntil: '2033-11-05T00:00:00.000Z',
        createdAt
      };
      return [...prev, nextDoc];
    });
  };

  // Verify Cryptographic Hash Chain Integrity
  const auditChainVerification = useMemo(
    () => verifyAuditChainIntegrity(auditLogs),
    [auditLogs]
  );

  // Assign Role Handler
  const handleAssignRole = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (activeAdminRole === USER_ROLES.VEERXCAPE_SUPPORT) {
      setFeedback({
        type: 'error',
        message:
          'Privilege Denied: VEERXCAPE_SUPPORT has read-only + ticket access and cannot assign roles.'
      });
      return;
    }

    if (
      (selectedRoleToAssign === USER_ROLES.VEERXCAPE_ADMIN ||
        selectedRoleToAssign === USER_ROLES.VEERXCAPE_SUPER_ADMIN) &&
      activeAdminRole !== USER_ROLES.VEERXCAPE_SUPER_ADMIN
    ) {
      setFeedback({
        type: 'error',
        message:
          'Privilege Escalation Blocked: Only VEERXCAPE_SUPER_ADMIN can assign administrative roles.'
      });
      return;
    }

    const parsed = roleAssignmentPayloadSchema.safeParse({
      targetUserId,
      role: selectedRoleToAssign,
      scopeType,
      scopeId,
      department: scopeType === 'AUTHORITY' ? assignDepartment : null,
      jurisdictionCode: scopeType === 'AUTHORITY' ? assignJurisdiction : null
    });

    if (!parsed.success) {
      setFeedback({
        type: 'error',
        message: parsed.error.issues[0]?.message ?? 'Invalid role assignment payload.'
      });
      return;
    }

    appendAuditEntry(
      'ASSIGN_SCOPED_ROLE',
      'userRoles',
      `${parsed.data.targetUserId}_${parsed.data.role}`,
      `Assigned ${parsed.data.role} (${parsed.data.scopeType}:${parsed.data.scopeId})`,
      parsed.data
    );
    setFeedback({
      type: 'success',
      message: `Role ${parsed.data.role} assigned to ${parsed.data.targetUserId} and committed to hash-chained auditLogs.`
    });
  };

  // Provision STM32U575 Device
  const handleProvisionDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeAdminRole === USER_ROLES.VEERXCAPE_SUPPORT) {
      setFeedback({
        type: 'error',
        message: 'VEERXCAPE_SUPPORT cannot provision hardware keys.'
      });
      return;
    }
    const parsed = deviceSerialSchema.safeParse(newDeviceSerial);
    if (!parsed.success) {
      setFeedback({
        type: 'error',
        message: parsed.error.issues[0]?.message ?? 'Invalid STM32U575 serial format.'
      });
      return;
    }
    if (devices.some((d) => d.serialNumber === parsed.data)) {
      setFeedback({
        type: 'error',
        message: `Uniqueness lock conflict (serial_${parsed.data}): Device already provisioned.`
      });
      return;
    }
    const created: ProvisionedDeviceItem = {
      serialNumber: parsed.data,
      mcuFamily: 'STM32U575',
      firmwareVersion: newDeviceFirmware,
      keyVersion: 1,
      secretManagerRef: `projects/veerxcape-01/secrets/dev-${parsed.data}/versions/1`,
      status: 'PROVISIONED',
      assignedVehicleReg: null
    };
    setDevices((prev) => [created, ...prev]);
    appendAuditEntry(
      'PROVISION_STM32U575_DEVICE',
      'devices',
      created.serialNumber,
      'Provisioned new STM32U575 unit with 256-bit Secret Manager HMAC signing key',
      { firmware: created.firmwareVersion, keyVersion: 1 }
    );
    setFeedback({
      type: 'success',
      message: `Provisioned ${created.serialNumber}. Signing secret stored in server-side _deviceKeyVault (never exposed to clients).`
    });
  };

  // Rotate Device HMAC Key or Revoke Device
  const handleDeviceAction = (serial: string, action: 'ROTATE_KEY' | 'REVOKE') => {
    if (activeAdminRole === USER_ROLES.VEERXCAPE_SUPPORT) {
      setFeedback({
        type: 'error',
        message: 'VEERXCAPE_SUPPORT cannot rotate or revoke hardware keys.'
      });
      return;
    }
    setDevices((prev) =>
      prev.map((d) => {
        if (d.serialNumber !== serial) return d;
        if (action === 'ROTATE_KEY') {
          const nextVer = d.keyVersion + 1;
          return {
            ...d,
            keyVersion: nextVer,
            secretManagerRef: `projects/veerxcape-01/secrets/dev-${serial}/versions/${nextVer}`
          };
        }
        return { ...d, status: 'REVOKED' };
      })
    );
    appendAuditEntry(
      action === 'ROTATE_KEY' ? 'ROTATE_DEVICE_HMAC_KEY' : 'REVOKE_STM32U575_DEVICE',
      'devices',
      serial,
      action === 'ROTATE_KEY'
        ? 'Rotated 256-bit HMAC key version in _deviceKeyVault'
        : 'Immediately revoked device; /api/v1/iot/* packets rejected'
    );
    setFeedback({
      type: 'success',
      message:
        action === 'ROTATE_KEY'
          ? `Rotated HMAC signing secret for ${serial}.`
          : `Device ${serial} REVOKED. All future hardware packets from this serial are blocked.`
    });
  };

  // Approve Government Authority
  const handleApproveAuthority = (authId: string) => {
    if (activeAdminRole === USER_ROLES.VEERXCAPE_SUPPORT) {
      setFeedback({
        type: 'error',
        message: 'Only VEERXCAPE_ADMIN or VEERXCAPE_SUPER_ADMIN can verify government authorities.'
      });
      return;
    }
    setAuthorities((prev) =>
      prev.map((a) =>
        a.id === authId ? { ...a, verificationState: 'VERIFIED' } : a
      )
    );
    appendAuditEntry(
      'APPROVE_AUTHORITY_ORGANIZATION',
      'authorities',
      authId,
      'Institutional credentials verified and activated'
    );
    setFeedback({
      type: 'success',
      message: `Authority organization ${authId} verified and activated.`
    });
  };

  const allCollectionNames = Object.values(FIRESTORE_COLLECTIONS);

  return (
    <div className="min-h-screen bg-slate-50 text-[#0F172A] flex flex-col">
      {/* Top Super-Admin Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F172A] text-white flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">
                  VeerXcape Super-Admin & Governance Console
                </h1>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1E40AF] border border-blue-200">
                  {activeAdminRole}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Firebase Project: <span className="font-mono">{firebaseConfig.projectId}</span> ·
                Hash-Chain Status:{' '}
                <span className="font-semibold text-emerald-700">
                  {auditChainVerification.valid ? 'VERIFIED INTACT' : 'TAMPER DETECTED'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <KeyRound className="w-4 h-4 text-[#1E40AF]" />
              <select
                aria-label="Switch Admin Role Tier"
                value={activeAdminRole}
                onChange={(e) =>
                  setActiveAdminRole(
                    e.target.value as
                      | typeof USER_ROLES.VEERXCAPE_SUPER_ADMIN
                      | typeof USER_ROLES.VEERXCAPE_ADMIN
                      | typeof USER_ROLES.VEERXCAPE_SUPPORT
                  )
                }
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              >
                <option value={USER_ROLES.VEERXCAPE_SUPER_ADMIN}>
                  Role: VEERXCAPE_SUPER_ADMIN (Full Governance)
                </option>
                <option value={USER_ROLES.VEERXCAPE_ADMIN}>
                  Role: VEERXCAPE_ADMIN (Tenant & Device Admin)
                </option>
                <option value={USER_ROLES.VEERXCAPE_SUPPORT}>
                  Role: VEERXCAPE_SUPPORT (Read-Only + Support Desk)
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-1 border-t border-slate-100 bg-slate-50/60">
          {(
            [
              ['PLATFORM_OVERVIEW', '1. Platform Governance KPIs', Activity],
              ['USER_ROLE_GOVERNANCE', '2. 12-Role RBAC Assignment', Users],
              ['STM32_DEVICE_VAULT', '3. STM32U575 Vault & Key Rotation', Cpu],
              ['AUTHORITY_APPROVALS', '4. Authority Approvals', Building2],
              ['AUDIT_HASH_CHAIN', '5. SHA-256 Audit Hash Chain', FileSearch],
              ['SYSTEM_CONFIG_COLLECTIONS', '6. 27 Collections & Safety Gates', Database]
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
        {/* ====================================================================
            TAB 1: PLATFORM OVERVIEW KPIS
        ==================================================================== */}
        {activeTab === 'PLATFORM_OVERVIEW' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Reconciled Firestore Schema
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {allCollectionNames.length} Collections
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  23 Domain + 4 Server-Only (_uniqueLocks, _authSecrets, _otpChallenges,
                  _deviceKeyVault)
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Provisioned STM32U575 Units
                </div>
                <div className="text-2xl font-bold text-[#1E40AF] mt-1">{devices.length}</div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  256-bit HMAC secrets in server vault
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Government Authority Desks
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{authorities.length}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Scoped by MEDICAL, POLICE & ROAD
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Append-Only Audit Hash Chain
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {auditLogs.length} Blocks
                </div>
                <div className="text-[11px] text-emerald-700 mt-1">
                  SHA-256 Chain Verified ({auditLogs.length} entries)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 2: 12-ROLE RBAC ASSIGNMENT
        ==================================================================== */}
        {activeTab === 'USER_ROLE_GOVERNANCE' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5 text-xs">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Explicit Scoped Role Assignment (12 VeerXcape Roles)
              </h2>
              <p className="text-slate-500">
                Every role assignment requires an explicit scopeType and scopeId and increments the
                user&apos;s rolesVersion for instant server-side enforcement.
              </p>
            </div>

            <form
              onSubmit={handleAssignRole}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target User ID</label>
                <input
                  type="text"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Role (12 Canonical Roles)
                </label>
                <select
                  value={selectedRoleToAssign}
                  onChange={(e) => setSelectedRoleToAssign(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {ALL_USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Scope Type</label>
                <select
                  value={scopeType}
                  onChange={(e) =>
                    setScopeType(
                      e.target.value as
                        | 'PLATFORM'
                        | 'COMPANY'
                        | 'SHOWROOM'
                        | 'AUTHORITY'
                        | 'VEHICLE'
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="AUTHORITY">AUTHORITY</option>
                  <option value="COMPANY">COMPANY</option>
                  <option value="SHOWROOM">SHOWROOM</option>
                  <option value="VEHICLE">VEHICLE</option>
                  <option value="PLATFORM">PLATFORM</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Scope ID</label>
                <input
                  type="text"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              {scopeType === 'AUTHORITY' && (
                <>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Authority Department
                    </label>
                    <select
                      value={assignDepartment}
                      onChange={(e) =>
                        setAssignDepartment(e.target.value as AuthorityDepartment)
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="MEDICAL">MEDICAL</option>
                      <option value="POLICE">POLICE</option>
                      <option value="ROAD">ROAD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Jurisdiction Code
                    </label>
                    <input
                      type="text"
                      value={assignJurisdiction}
                      onChange={(e) => setAssignJurisdiction(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1E40AF] text-white font-semibold"
                >
                  Assign Scoped Role & Log Audit Block
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ====================================================================
            TAB 3: STM32U575 HARDWARE PROVISIONING, KEY ROTATION & REVOCATION
        ==================================================================== */}
        {activeTab === 'STM32_DEVICE_VAULT' && (
          <div className="space-y-6 text-xs">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Provision New STM32U575 Hardware Unit
              </h2>
              <p className="text-slate-500">
                Generates a 256-bit HMAC signing secret in Google Secret Manager / _deviceKeyVault.
                Raw secrets are never stored as SHA-256 hashes (since HMAC verification requires the
                shared secret) and are never returned to client browsers.
              </p>
              <form
                onSubmit={handleProvisionDevice}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              >
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    STM32U575 Serial Number
                  </label>
                  <input
                    type="text"
                    value={newDeviceSerial}
                    onChange={(e) => setNewDeviceSerial(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Factory Firmware Version
                  </label>
                  <input
                    type="text"
                    value={newDeviceFirmware}
                    onChange={(e) => setNewDeviceFirmware(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-lg bg-[#059669] hover:bg-emerald-700 text-white font-semibold"
                  >
                    Provision Hardware & Vault Key
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                STM32U575 Fleet & Cryptographic Key Version Registry
              </h3>
              {devices.map((d) => (
                <div
                  key={d.serialNumber}
                  className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {d.serialNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1E40AF] font-mono">
                        Key v{d.keyVersion}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          d.status === 'REVOKED'
                            ? 'bg-red-100 text-[#DC2626]'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      Secret Ref: {d.secretManagerRef}
                    </div>
                    <div className="text-slate-600">
                      Bound Vehicle: {d.assignedVehicleReg ?? 'Unassigned (Ready for Showroom)'} ·
                      Firmware: {d.firmwareVersion}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeviceAction(d.serialNumber, 'ROTATE_KEY')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 font-semibold"
                    >
                      Rotate HMAC Key
                    </button>
                    {d.status !== 'REVOKED' && (
                      <button
                        type="button"
                        onClick={() => handleDeviceAction(d.serialNumber, 'REVOKE')}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-[#DC2626] border border-red-200 font-semibold"
                      >
                        Revoke Hardware
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 4: GOVERNMENT AUTHORITY VERIFICATION & APPROVALS
        ==================================================================== */}
        {activeTab === 'AUTHORITY_APPROVALS' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs">
            <h2 className="text-base font-bold text-slate-900">
              Government Authority Institutional Verification Queue
            </h2>
            <div className="space-y-3">
              {authorities.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-slate-900">{a.name}</div>
                    <div className="text-slate-500">
                      Department: <span className="font-semibold">{a.department}</span> ·
                      Jurisdiction:{' '}
                      <span className="font-mono font-bold">{a.jurisdictionCode}</span> · Officer:{' '}
                      {a.contactOfficer}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full font-bold ${
                        a.verificationState === 'VERIFIED'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {a.verificationState}
                    </span>
                    {a.verificationState !== 'VERIFIED' && (
                      <button
                        type="button"
                        onClick={() => handleApproveAuthority(a.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#2563EB] text-white font-semibold"
                      >
                        Verify & Approve Authority
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 5: IMMUTABLE SHA-256 HASH-CHAINED AUDIT LOGS
        ==================================================================== */}
        {activeTab === 'AUDIT_HASH_CHAIN' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Append-Only SHA-256 Cryptographic Audit Log Ledger
                </h2>
                <p className="text-slate-500">
                  Firestore rules block all client create/update/delete operations on auditLogs.
                  Each block chains prevAuditHash → entryHash.
                </p>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                verifyAuditChainIntegrity: {auditChainVerification.valid ? 'VALID' : 'BROKEN'} (
                {auditLogs.length} blocks verified)
              </span>
            </div>

            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-900">
                      #{log.sequenceIndex} · {log.id} · {log.action}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">{log.createdAt}</span>
                  </div>
                  <div className="text-slate-700">{log.reason}</div>
                  <div className="font-mono text-[11px] text-slate-500 break-all">
                    <div>prevAuditHash: {log.prevAuditHash}</div>
                    <div className="text-[#1E40AF] font-semibold">
                      entryHash    : {log.entryHash}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 6: 27 RECONCILED COLLECTIONS & PRODUCTION SAFETY GATES
        ==================================================================== */}
        {activeTab === 'SYSTEM_CONFIG_COLLECTIONS' && (
          <div className="space-y-6 text-xs">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Production Environment Safety Gate (systemConfiguration)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="font-bold text-emerald-900">
                    allowDemoOtp (Production Gate): FALSE (Hard-Locked)
                  </div>
                  <p className="text-emerald-800 mt-1">
                    Demo OTP responses are strictly disabled in production builds.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="font-bold text-emerald-900">
                    allowSimulatedTelemetry (Production Gate): FALSE (Hard-Locked)
                  </div>
                  <p className="text-emerald-800 mt-1">
                    Simulated STM32U575 telemetry packets (isSimulated: true) are rejected with 403
                    in production.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Reconciled 27-Collection Inventory (23 Domain + 4 Server-Only Collections)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {allCollectionNames.map((colName) => {
                  const isServerOnly = colName.startsWith('_');
                  return (
                    <div
                      key={colName}
                      className={`px-3 py-2 rounded-lg border font-mono text-[11px] flex items-center justify-between ${
                        isServerOnly
                          ? 'bg-slate-900 text-white border-slate-800'
                          : 'bg-slate-50 text-slate-800 border-slate-200'
                      }`}
                    >
                      <span>{colName}</span>
                      {isServerOnly && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-200">
                          SERVER
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
