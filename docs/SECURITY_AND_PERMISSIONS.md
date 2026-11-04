# RAVAN — Security, Multi-Tenancy & Permissions (`SECURITY_AND_PERMISSIONS.md`)

## 1. Authentication & Token Security
- Authentication uses **Firebase Authentication** (`signInWithPopup` on the client, verified server-side via `firebase-admin` `verifyIdToken` in `/src/lib/auth-middleware.ts`).
- ID tokens are held strictly in React memory (`useState<string | null>`) and passed via `Authorization: Bearer <idToken>` headers—never persisted in `localStorage` or `sessionStorage`.

## 2. Strict Multi-Tenant Data Isolation (`organization_id`)
- Every operational table (`trips`, `trip_pickup_points`, `customers`, `bookings`, `booking_passengers`, `booking_status_history`, `payments`, `expense_categories`, `expenses`, `guides`, `vehicles`, `invites`, `notifications`, `activity_logs`, `support_tickets`, `subscription_invoices`, `subscription_payments`) carries a mandatory `organization_id` foreign key.
- `resolveTenantContext(req, res, requiredPermission)` in `/server.ts`:
  1. Verifies the authenticated user's active membership in `x-organization-id`.
  2. Rejects cross-tenant access with `403 Forbidden: You do not have an active membership in this organization`.
  3. Scopes every SQL `SELECT`, `INSERT`, `UPDATE`, and `DELETE` by `eq(table.organizationId, ctx.organizationId)`.

## 3. Role-Based Access Control (RBAC Matrix)
Defined in `/src/lib/permissions.ts` and enforced on both backend routes and frontend controls:
- `owner`: Full access to all 22 permissions, including `settings.manage`, `members.manage`, `finance.manage`, `trips.*`, and `bookings.*`.
- `company_admin`: Full operational & settings access within the company.
- `trip_manager`: `trips.read/create/update/publish/archive`, `bookings.read/create/update/approve`, `customers.read`.
- `booking_agent`: `trips.read`, `bookings.read/create/update/approve/cancel`, `customers.read/manage`, `finance.read`.
- `accountant`: `finance.read`, `finance.manage`, `bookings.read`, `trips.read`, `customers.read`.
- `guide`: `trips.read`, `bookings.read`, `customers.read` + passenger attendance check-in.
- `viewer`: Read-only access across modules.
- `is_super_admin` (Platform Level): Required for all `/api/platform/*` endpoints.

## 4. Concurrency, Idempotency & Audit Logging
- **Row-Level Locking:** Booking creation (`POST /api/bookings`, `POST /api/public/bookings`) and cancellation (`PATCH /api/bookings/:id/status`) lock the parent `trips` row with `SELECT ... FOR UPDATE` inside a PostgreSQL transaction.
- **Idempotency Keys:** Stored in `idempotency_keys` (`organization_id`, `key`) to prevent duplicate bookings on network retries.
- **Immutable Audit Logs:** Every state-changing action writes a structured record to `activity_logs` with `actor_user_id`, `action`, `entity_type`, `entity_id`, and JSON metadata.
