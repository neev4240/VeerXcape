import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  Building2,
  Car,
  CheckCircle2,
  Cpu,
  FileText,
  HelpCircle,
  Layers,
  Lock,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  Store,
  Users,
  Wrench
} from 'lucide-react';
import { VERCEL_PROJECTS } from '@veerxcape/shared-constants';
import { VeerXcapeApiClient } from '@veerxcape/shared-services';
import { publicContactInquiryPayloadSchema } from '@veerxcape/shared-validation';

type PublicPageId =
  | 'HOME'
  | 'ABOUT'
  | 'HOW_IT_WORKS'
  | 'PRODUCT_FEATURES'
  | 'VEHICLE_SAFETY'
  | 'FAMILY_SAFETY'
  | 'FOR_SHOWROOMS'
  | 'FOR_ORGANISATIONS'
  | 'FAQS'
  | 'INSTALLATION_GUIDE'
  | 'USER_MANUAL'
  | 'CONTACT'
  | 'PRIVACY_POLICY'
  | 'TERMS_AND_CONDITIONS';

const PUBLIC_PAGES: { id: PublicPageId; label: string }[] = [
  { id: 'HOME', label: '1. Home' },
  { id: 'ABOUT', label: '2. About VeerXcape' },
  { id: 'HOW_IT_WORKS', label: '3. How It Works' },
  { id: 'PRODUCT_FEATURES', label: '4. Product Features' },
  { id: 'VEHICLE_SAFETY', label: '5. Vehicle Safety' },
  { id: 'FAMILY_SAFETY', label: '6. Family Safety' },
  { id: 'FOR_SHOWROOMS', label: '7. For Showrooms & Dealerships' },
  { id: 'FOR_ORGANISATIONS', label: '8. For Organisations & Authorities' },
  { id: 'FAQS', label: '9. FAQs' },
  { id: 'INSTALLATION_GUIDE', label: '10. Installation Guide' },
  { id: 'USER_MANUAL', label: '11. User Manual' },
  { id: 'CONTACT', label: '12. Contact' },
  { id: 'PRIVACY_POLICY', label: '13. Privacy Policy' },
  { id: 'TERMS_AND_CONDITIONS', label: '14. Terms & Conditions' }
];

const FAQ_ITEMS = [
  {
    q: 'Can a customer self-register a vehicle or STM32U575 device in the mobile app?',
    a: 'No. Every vehicle and STM32U575 safety unit is registered exclusively by an authorized showroom during vehicle delivery or retrofit. The showroom verifies the customer’s phone number via SMS OTP, and the customer sets their own private password in the VeerXcape Mobile App.'
  },
  {
    q: 'Does the showroom staff ever see or set my account password?',
    a: 'Never. VeerXcape enforces a zero-knowledge showroom onboarding workflow. Showroom staff only verify your phone ownership via a 6-digit OTP challenge. You create your own strong password directly in the mobile application.'
  },
  {
    q: 'How does VeerXcape protect road-hazard contributors’ privacy?',
    a: 'When an STM32U575 unit detects a road-surface anomaly (ROAD_HAZARD), our server-side redaction engine strips the vehicle registration number, VIN, owner name, and phone number before making the hazard visible to the Road Authority.'
  },
  {
    q: 'What is the difference between VISIBLE_TO_AUTHORITY and DISPATCH_RECORDED_BY_AUTHORITY?',
    a: 'VeerXcape never misrepresents an automated alert as a confirmed ambulance or police dispatch. VISIBLE_TO_AUTHORITY means the incident has been routed to the jurisdictional desk; DISPATCH_RECORDED_BY_AUTHORITY is only shown after a verified duty officer records an official dispatch call-sign.'
  }
];

export default function App() {
  const [activePage, setActivePage] = useState<PublicPageId>('HOME');
  const [contactName, setContactName] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactType, setContactType] = useState<'SHOWROOM' | 'AUTHORITY' | 'CUSTOMER'>('SHOWROOM');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactInquiryId, setContactInquiryId] = useState<string | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const apiClient = useMemo(() => new VeerXcapeApiClient(), []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    const parsed = publicContactInquiryPayloadSchema.safeParse({
      fullName: contactName.trim(),
      organisation: contactOrg.trim() || undefined,
      email: contactEmail.trim(),
      inquiryType: contactType,
      message: contactMessage.trim()
    });
    if (!parsed.success) {
      setContactError(
        parsed.error.issues[0]?.message ??
          'Please provide your name, a valid email address, and a detailed message (at least 10 characters).'
      );
      return;
    }

    setContactLoading(true);
    try {
      const res = await apiClient.submitPublicContactInquiry(parsed.data);
      if (!res.success || !res.data) {
        setContactError(
          `${res.error?.message ?? 'Unable to submit inquiry at this time.'} (${res.error?.code ?? 'REQUEST_FAILED'})`
        );
        return;
      }
      setContactInquiryId(res.data.ticketId);
      setContactSubmitted(true);
    } catch (err) {
      setContactError(
        err instanceof Error
          ? err.message
          : 'Unable to submit inquiry at this time. Please check your connection and try again.'
      );
    } finally {
      setContactLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-[#0F172A] flex flex-col">
      {/* Public Header (Zero-Login Required) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1E40AF] text-white flex items-center justify-center shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">VeerXcape</span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1E40AF] border border-blue-200">
                  Public Information Portal
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Connected Vehicle Safety, STM32U575 Embedded Hardware & Emergency Response Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePage('HOW_IT_WORKS')}
              className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => setActivePage('CONTACT')}
              className="px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1E40AF] text-white text-xs font-semibold shadow-sm"
            >
              Partner With VeerXcape
            </button>
          </div>
        </div>

        {/* 14-Page Public Navigation Strip */}
        <div className="max-w-7xl mx-auto px-4 py-2 border-t border-slate-100 bg-slate-50/70 flex flex-wrap gap-1.5">
          {PUBLIC_PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePage(p.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activePage === p.id
                  ? 'bg-[#1E40AF] text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Page Content */}
      <main className="max-w-7xl w-full mx-auto flex-1 p-4 md:p-8 space-y-8">
        {activePage === 'HOME' && (
          <div className="space-y-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-[#1E40AF] border border-blue-200">
                  STM32U575 Hardware + Unified Cloud Safety Architecture
                </span>
                <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  Engineered for Real-World Vehicle Safety, Family Protection & Coordinated
                  Emergency Response.
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  VeerXcape connects authorized OEM dealerships, vehicle owners, family members,
                  drivers, and jurisdictional Medical, Police, and Road authorities on one unified,
                  cryptographically audited safety architecture.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActivePage('PRODUCT_FEATURES')}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1E40AF] text-white text-xs font-bold shadow-sm"
                  >
                    Explore STM32U575 Capabilities
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePage('FOR_SHOWROOMS')}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold"
                  >
                    Showroom & OEM Onboarding
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
                <div className="font-bold text-slate-900 uppercase tracking-wider">
                  5 Independent Deployable Interfaces
                </div>
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="font-bold text-[#1E40AF]">
                      1. Mobile App ({VERCEL_PROJECTS.MOBILE_APP})
                    </div>
                    <div className="text-slate-600">
                      Vehicle Owners, Family Members & Authorized Drivers (Web + Capacitor iOS/Android)
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="font-bold text-[#1E40AF]">
                      2. Showroom & OEM Portal ({VERCEL_PROJECTS.DEALER_COMPANY_PORTAL})
                    </div>
                    <div className="text-slate-600">
                      Parent Companies, Dealership Managers & 9-Step Vehicle Registration Desk
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="font-bold text-[#1E40AF]">
                      3. Government Authority Portal ({VERCEL_PROJECTS.AUTHORITY_PORTAL})
                    </div>
                    <div className="text-slate-600">
                      Jurisdiction-scoped Medical, Police & Anonymized Road Hazard Desks
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-slate-200">
                    <div className="font-bold text-[#1E40AF]">
                      4. Super-Admin Console ({VERCEL_PROJECTS.ADMIN_CONSOLE})
                    </div>
                    <div className="text-slate-600">
                      Hardware Vault, Authority Approvals & SHA-256 Hash-Chained Audit Ledger
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activePage === 'ABOUT' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">About VeerXcape</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Developed by Zealion, VeerXcape addresses the critical golden-hour gap in road
              accidents, parked-vehicle cabin hyperthermia, vehicle intrusion, and road-surface
              hazards. Unlike aftermarket consumer trackers that allow unverified self-registration,
              every VeerXcape vehicle and STM32U575 safety unit is provenance-verified at an
              authorized dealership.
            </p>
          </div>
        )}

        {activePage === 'HOW_IT_WORKS' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
            <h2 className="text-xl font-bold text-slate-900">
              End-to-End Platform Lifecycle: Showroom to Emergency Response
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-[#1E40AF]">1. Showroom Provisioning</div>
                <p className="text-slate-600">
                  Authorized dealership binds your vehicle registration number, 17-char VIN, and
                  STM32U575 serial after verifying your phone via SMS OTP.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-[#1E40AF]">2. Owner Activation & Family Setup</div>
                <p className="text-slate-600">
                  You activate your account in the Mobile App, set your private strong password, and
                  configure granular permissions for family members and drivers.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-[#1E40AF]">3. Signed Hardware Telemetry</div>
                <p className="text-slate-600">
                  The STM32U575 microcontroller transmits HMAC-SHA256 authenticated heartbeats,
                  cabin vitals, and high-G impact events with replay protection.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-[#1E40AF]">4. Jurisdictional Authority Routing</div>
                <p className="text-slate-600">
                  Critical incidents are routed to verified Medical, Police, or Road authorities in
                  the matching Country-State-District jurisdiction.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePage === 'PRODUCT_FEATURES' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
            <h2 className="text-xl font-bold text-slate-900">
              STM32U575 Embedded Hardware & Platform Capabilities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-900">STM32U575 Ultra-Low-Power MCU</div>
                <p className="text-slate-600">
                  Hardware cryptographic acceleration, HMAC-SHA256 packet signing, and monotonic
                  offline sequence buffering.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-900">Cabin Radar, CO & Smoke Sensing</div>
                <p className="text-slate-600">
                  Detects unattended children or pets in locked vehicles alongside cabin temperature
                  and carbon monoxide levels.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-900">12V Rail + LiFePO4 Backup Cutover</div>
                <p className="text-slate-600">
                  Automatically switches to internal backup battery and triggers a tamper/power
                  failure alert if the primary 12V harness is severed.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePage === 'VEHICLE_SAFETY' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Vehicle Safety & Freshness Integrity</h2>
            <p className="text-sm text-slate-600">
              VeerXcape never presents stale coordinates as live. Every vehicle view computes a
              deterministic freshness state: <strong>LIVE</strong> (≤60s location & ≤90s heartbeat),{' '}
              <strong>RECENT</strong> (≤5m), <strong>STALE</strong> (&gt;5m), or{' '}
              <strong>OFFLINE</strong> (&gt;10m without heartbeat).
            </p>
          </div>
        )}

        {activePage === 'FAMILY_SAFETY' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              Family Safety & Granular Permission Control
            </h2>
            <p className="text-sm text-slate-600">
              Vehicle owners retain 100% control over family member access. Owners can toggle
              location visibility, telemetry visibility, critical alert notifications, incident
              history access, and SOS trigger permission per family member—and revoke access
              instantly with immediate server-side enforcement.
            </p>
          </div>
        )}

        {activePage === 'FOR_SHOWROOMS' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              For OEM Parent Companies, Showrooms & Dealerships
            </h2>
            <p className="text-sm text-slate-600">
              Parent companies manage their dealership network from the unified Dealer-Company
              Portal while maintaining strict multi-tenant isolation between individual showrooms.
              Dealership staff complete the 9-Step Vehicle Registration Wizard with deterministic
              uniqueness locks on registration numbers, VINs, and STM32U575 serials.
            </p>
          </div>
        )}

        {activePage === 'FOR_ORGANISATIONS' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              For Government Emergency & Highway Authorities
            </h2>
            <p className="text-sm text-slate-600">
              Institutional desks for Emergency Medical Services (AUTHORITY_MEDICAL), Police Command
              (AUTHORITY_POLICE), and Highway Maintenance (AUTHORITY_ROAD) receive strictly scoped
              incidents for their assigned jurisdiction code.
            </p>
          </div>
        )}

        {activePage === 'FAQS' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-sm font-bold text-slate-900">{item.q}</div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePage === 'INSTALLATION_GUIDE' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4 text-xs">
            <h2 className="text-xl font-bold text-slate-900">
              STM32U575 Authorised Dealership Installation Guide
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>
                Verify the provisioned STM32U575 serial number (`VX-STM32U575-*`) in the Showroom
                Portal before mounting.
              </li>
              <li>
                Mount the main enclosure securely to the chassis B-pillar or under-dash structural
                bracket to ensure accurate 3-axis IMU accelerometer alignment.
              </li>
              <li>
                Connect the primary 12V fused automotive harness and verify automatic cutover to the
                internal LiFePO4 backup battery.
              </li>
              <li>
                Complete the 9-Step Showroom Registration Wizard and verify the initial signed
                heartbeat packet.
              </li>
            </ol>
          </div>
        )}

        {activePage === 'USER_MANUAL' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4 text-xs">
            <h2 className="text-xl font-bold text-slate-900">
              VeerXcape Vehicle Owner, Family & Driver Manual
            </h2>
            <p className="text-slate-600 leading-relaxed">
              1. <strong>Account Activation:</strong> After showroom registration, open the
              VeerXcape Mobile App, select &ldquo;Activate&rdquo;, enter your E.164 phone number and
              6-digit SMS OTP, and set your strong password.
              <br />
              2. <strong>Family Invitations:</strong> Navigate to Family Invitations, enter your
              family member&apos;s phone number and initial password, and customize their 5
              permission flags.
              <br />
              3. <strong>Manual SOS:</strong> Press the red SOS button to start the 5-second safety
              countdown. You may cancel within 5 seconds or mark a false alarm from Incident History.
            </p>
          </div>
        )}

        {activePage === 'CONTACT' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-5 text-xs">
            <h2 className="text-xl font-bold text-slate-900">
              Contact VeerXcape Institutional & OEM Onboarding Desk
            </h2>
            {contactSubmitted ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold space-y-1">
                <p>
                  Thank you, {contactName}. Your inquiry has been logged on the
                  VeerXcape backend for our institutional onboarding team.
                </p>
                {contactInquiryId && (
                  <p className="font-mono text-[11px] text-emerald-700">
                    Reference Ticket ID: {contactInquiryId}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={(e) => void handleContactSubmit(e)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Organisation</label>
                  <input
                    type="text"
                    value={contactOrg}
                    onChange={(e) => setContactOrg(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Inquiry Type</label>
                  <select
                    value={contactType}
                    onChange={(e) =>
                      setContactType(
                        e.target.value as 'SHOWROOM' | 'AUTHORITY' | 'CUSTOMER'
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="SHOWROOM">OEM Parent Company / Dealership Onboarding</option>
                    <option value="AUTHORITY">Government Authority Institutional Integration</option>
                    <option value="CUSTOMER">Vehicle Owner / General Inquiry</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Message</label>
                  <textarea
                    rows={3}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                {contactError && (
                  <div
                    role="alert"
                    className="md:col-span-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium"
                  >
                    {contactError}
                  </div>
                )}
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={contactLoading}
                    className="px-5 py-2.5 rounded-lg bg-[#2563EB] disabled:opacity-50 text-white font-semibold"
                  >
                    {contactLoading ? 'Submitting to VeerXcape Backend...' : 'Submit Inquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {activePage === 'PRIVACY_POLICY' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-3 text-xs text-slate-600 leading-relaxed">
            <h2 className="text-xl font-bold text-slate-900">Privacy & Data-Sharing Policy</h2>
            <p>
              1. <strong>Purpose-Bound Telemetry:</strong> Location and sensor telemetry are
              collected solely for vehicle safety, owner/family monitoring, and emergency incident
              response.
            </p>
            <p>
              2. <strong>Strict Departmental Redaction:</strong> Road authorities receive strictly
              anonymized road-hazard coordinates with zero vehicle registration numbers, VINs, or
              customer PII.
            </p>
            <p>
              3. <strong>Immutable Audit Trail:</strong> Every emergency data access or permission
              change is recorded in an append-only SHA-256 hash-chained audit log.
            </p>
          </div>
        )}

        {activePage === 'TERMS_AND_CONDITIONS' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-3 text-xs text-slate-600 leading-relaxed">
            <h2 className="text-xl font-bold text-slate-900">Terms and Conditions</h2>
            <p>
              1. <strong>Authorised Provisioning Only:</strong> VeerXcape hardware and vehicle
              registrations must be performed by authorized dealerships.
            </p>
            <p>
              2. <strong>Truthful Emergency Status Representation:</strong> An alert marked as
              VISIBLE_TO_AUTHORITY indicates digital routing to the jurisdictional portal and does
              not constitute confirmed physical emergency dispatch until an authority officer
              records DISPATCH_RECORDED_BY_AUTHORITY.
            </p>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Zealion · VeerXcape Connected Vehicle Safety Platform · All 5
        Interfaces Powered by Unified Firebase & STM32U575 Architecture
      </footer>
    </div>
  );
}

