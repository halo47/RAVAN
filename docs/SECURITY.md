# SECURITY ARCHITECTURE & CONTROLS — RAVAN

## 1. Non-Negotiable Security Principles

1. **Zero Trust Towards Client Input:** `organization_id`, `role`, and calculated balances sent by the browser are never trusted. The server derives the active tenant strictly from verified authentication tokens and active database `memberships`.
2. **Defense-in-Depth Authorization:** Every mutation and private query enforces:
   - Cryptographic token verification (`firebase-admin` ID token verification on `/api/*`).
   - Active membership lookup (`status = 'active'`).
   - Fine-grained permission evaluation (`hasPermission(membership, permission)`).
   - Tenant-scoped SQL predicate (`WHERE organization_id = $verifiedOrgId`).
3. **Strict Secret Hygiene:**
   - Database credentials (`SQL_PASSWORD`, `SQL_ADMIN_PASSWORD`) and `SUPABASE_SERVICE_ROLE_KEY` exist strictly in server environment variables and are never bundled into client JavaScript.
   - Auth ID tokens are held in memory in the React client (never persisted in `localStorage` in raw form).

---

## 2. Threat Mitigation Matrix

| Threat / Vulnerability | Control Implemented in RAVAN |
| :--- | :--- |
| **IDOR (Insecure Direct Object Reference)** | Every entity lookup (`GET/PATCH/DELETE /api/trips/:id`, `/api/bookings/:id`, etc.) requires `AND organization_id = $verifiedOrgId`. Changing a record ID in the URL or payload to another tenant's record returns `404 Not Found` / `403 Forbidden`. |
| **Privilege Escalation** | `PATCH /api/memberships/:id` blocks users from modifying their own role (`actorUid === targetUserUid`) and verifies `members.manage_roles` permission. Only `company_owner` can grant `company_owner` or `company_manager`. |
| **Race Conditions / Overbooking** | `POST /api/bookings` and status approvals lock the target trip row (`SELECT ... FOR UPDATE`) inside a PostgreSQL transaction before checking `available_seats`. |
| **Duplicate Mutations (Replay)** | `Idempotency-Key` header/payload support records processed keys in `idempotency_keys` per organization. |
| **Financial Tampering** | `payments` table is append-only. No `DELETE` endpoint exists for confirmed payments; adjustments require a new `refund` or `adjustment` ledger entry with `received_by_uid` and audit trail. |
| **Public Data Leakage** | Public endpoints (`GET /api/public/trips`, `POST /api/public/booking-lookup`) use an explicit column allowlist. Internal notes, financial margins, passenger lists, and organization settings are never returned. |
| **Abuse / Brute Force** | In-memory sliding-window rate limiter protects public booking creation and booking lookup endpoints. |
| **Unsafe Offline Caching (PWA)** | Workbox service worker explicitly configures `/api/.*` as `NetworkOnly` and clears runtime state on sign-out or tenant switch. |

---

## 3. Data Minimization & Privacy

- **Passenger Records:** MVP collects only `fullName`, optional `phone`, `ageGroup`, and `specialRequirements`. Passport scans and national ID numbers are intentionally excluded from MVP collection until encrypted document vaulting and retention policies are activated in Phase 2.
- **Audit Logging:** All sensitive actions (`organization.create`, `trip.publish`, `booking.approve`, `booking.cancel`, `payment.record`, `refund.record`, `member.role_change`, `subscription.update`) write structured entries to `activity_logs`.
