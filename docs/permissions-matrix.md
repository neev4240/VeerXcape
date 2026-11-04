# VeerXcape Platform — 12-Role Permissions & Data-Sharing Matrix

## 1. The 12 Explicit Platform Roles

| # | Role Identifier | Target Application | Scope Type | Multi-Tenant / Resource Scope Fields |
| :- | :--- | :--- | :--- | :--- |
| 1 | `VEHICLE_OWNER` | `veerxcape-mobile-app` | `VEHICLE` | `vehicleId` (via `vehicleOwners`) |
| 2 | `FAMILY_MEMBER` | `veerxcape-mobile-app` | `VEHICLE` | `vehicleId` + granular `permissions` (via `familyMemberships`) |
| 3 | `DRIVER` | `veerxcape-mobile-app` | `VEHICLE` | `vehicleId` (via `vehicleDrivers`) |
| 4 | `SHOWROOM_STAFF` | `veerxcape-dealer-company` | `SHOWROOM` | `companyId` + `showroomId` |
| 5 | `SHOWROOM_MANAGER` | `veerxcape-dealer-company` | `SHOWROOM` | `companyId` + `showroomId` |
| 6 | `COMPANY_ADMIN` | `veerxcape-dealer-company` | `COMPANY` | `companyId` |
| 7 | `AUTHORITY_MEDICAL` | `veerxcape-authority` | `AUTHORITY` | `authorityId` + `department: 'MEDICAL'` + `jurisdictionCode` |
| 8 | `AUTHORITY_POLICE` | `veerxcape-authority` | `AUTHORITY` | `authorityId` + `department: 'POLICE'` + `jurisdictionCode` |
| 9 | `AUTHORITY_ROAD` | `veerxcape-authority` | `AUTHORITY` | `authorityId` + `department: 'ROAD'` + `jurisdictionCode` |
| 10 | `VEERXCAPE_SUPPORT` | `veerxcape-admin` | `PLATFORM` | Global Support & Diagnostics (Read + Support Ticket Write) |
| 11 | `VEERXCAPE_ADMIN` | `veerxcape-admin` | `PLATFORM` | Global Operational Management |
| 12 | `VEERXCAPE_SUPER_ADMIN` | `veerxcape-admin` | `PLATFORM` | Full Platform & Security Governance (MFA Enforced) |

## 2. Government Authority Data-Sharing & Redaction Policy

1. **Jurisdiction & Department Isolation**:
   - An authority user can only view incidents where `incident.location.jurisdictionCode == authority.jurisdictionCode`, `authority.verificationStatus == 'VERIFIED'`, and `authority.department in incident.authorizedDepartments`.
2. **Department-Specific Incident Types & Redaction**:
   - **`AUTHORITY_MEDICAL`**: Permitted for `ACCIDENT_DETECTED`, `MANUAL_SOS`, and `PARKED_OCCUPANT_ALERT`. Receives location, cabin environmental telemetry (temp, CO, smoke, occupant detection), vehicle description/registration, and emergency contact phone (when critical or consented). Denied access to `THEFT_OR_INTRUSION_ALERT`.
   - **`AUTHORITY_POLICE`**: Permitted for `ACCIDENT_DETECTED`, `MANUAL_SOS`, `THEFT_OR_INTRUSION_ALERT`, and `PARKED_OCCUPANT_ALERT`. Receives location, vehicle registration, VIN, make/model/color, and emergency contact details for active incidents.
   - **`AUTHORITY_ROAD`**: Permitted for `ROAD_HAZARD` and `ACCIDENT_DETECTED`. **Strictly Anonymized**: Server strips `registrationNumber`, `vin`, `primaryOwnerId`, owner/family names, and phone numbers before returning the payload.
3. **Incident Lifecycle Truthfulness**:
   - `VISIBLE_TO_AUTHORITY` means the event is visible on the Authority Portal queue—never displayed as an active ambulance/police dispatch.
   - `AUTHORITY_ACKNOWLEDGED` means an authority officer viewed and acknowledged the event.
   - `DISPATCH_RECORDED_BY_AUTHORITY` means an authority officer explicitly logged a dispatch unit/team reference.
   - `RESPONSE_CONFIRMED` means on-scene response was logged by the authority officer.

