# ARCHITECTURE — RAVAN

## 1. Architectural Pattern: Modular Monolith

RAVAN is architected as a **Modular Monolith** to maximize domain cohesion, transactional safety (especially around seat capacity locking and financial ledgers), and operational simplicity during the MVP and Pilot phases. Microservices are explicitly avoided until horizontal scaling metrics justify service decomposition.

---

## 2. Runtime Stack & Portability Bridge

### 2.1 Active Google AI Studio Runtime
In the Google AI Studio Cloud Run environment, RAVAN executes as a full-stack TypeScript application on port `3000`:
- **Backend Runtime:** Node.js + Express (`server.ts`) providing authenticated, tenant-isolated REST endpoints (`/api/*`).
- **Database Engine:** Google Cloud SQL for PostgreSQL (`europe-west2`) accessed via Unix domain socket (`SQL_HOST`) and `pg.Pool` + `drizzle-orm`.
- **Authentication:** Firebase Authentication (Google Sign-In via OAuth popup on client, verified cryptographically on every `/api/*` request via `firebase-admin` ID token verification).
- **Frontend SPA + PWA:** React 19 + TypeScript + Tailwind CSS v4 + `vite-plugin-pwa`.

### 2.2 Portable Next.js + Supabase Target Specification
To support standalone external hosting on Vercel + Supabase without vendor lock-in:
- All PostgreSQL tables, constraints, composite keys, helper functions, and PostgreSQL Row Level Security (RLS) policies are maintained in standard SQL format in `supabase/migrations/0001_initial_ravan_schema.sql`.
- Domain logic (money math, date formatting, RBAC permission evaluation, Zod validation schemas, and localization dictionaries) lives in framework-agnostic TypeScript modules under `src/lib/`.

---

## 3. Multi-Tenancy Isolation Model

RAVAN uses a **Shared Database, Shared Schema, Discriminator Column (`organization_id`)** multi-tenancy architecture with three layers of defense:

1. **Authentication & Context Resolution Layer (`src/middleware/auth.ts`):**
   - Extracts the Bearer token from `Authorization` header and verifies it via `adminAuth.verifyIdToken()`.
   - Resolves the active `organizationId` from `x-organization-id` header **only after verifying** that an active record exists in `memberships` linking `(user_uid, organization_id)` with `status = 'active'` (or `isSuperAdmin === true` for platform admin routes).
   - Client-supplied `organizationId` in request bodies is ignored/overwritten by the verified membership context.

2. **Service & Transactional Query Layer (`server.ts` / `src/db/schema.ts`):**
   - Every query and mutation filters by `eq(table.organizationId, verifiedOrgId)`.
   - Cross-entity references (e.g., assigning a `customerId` or `tripId` to a `booking`) verify that all referenced entities belong to the exact same `organizationId`.

3. **Database Constraint & RLS Layer (`supabase/migrations/0001_initial_ravan_schema.sql`):**
   - Composite indexes and foreign key constraints enforce tenant integrity.
   - Portable PostgreSQL RLS policies enforce `organization_id IN (SELECT organization_id FROM memberships WHERE user_uid = auth.uid() AND status = 'active')` for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.

---

## 4. Concurrency & Financial Integrity Flows

### 4.1 Booking Capacity Concurrency Flow
```text
Client / Agent submits Booking Request (with Idempotency-Key)
       │
       ▼
BEGIN POSTGRESQL TRANSACTION
       │
       ├── 1. Check idempotency_keys for (organization_id, key). If exists, return cached result.
       ├── 2. SELECT * FROM trips WHERE id = $tripId AND organization_id = $orgId FOR UPDATE;
       ├── 3. Verify trip.status == 'published' and (trip.total_capacity - trip.reserved_seats) >= passengerCount.
       ├── 4. Determine if seats should be deducted now based on org setting (seat_reserve_mode == 'on_pending').
       ├── 5. Insert booking + booking_passengers + booking_status_history.
       ├── 6. Update trips SET reserved_seats = reserved_seats + N, available_seats = total_capacity - (reserved_seats + N),
       │      status = CASE WHEN available_seats == 0 THEN 'full' ELSE status END.
       ├── 7. Insert notification + activity_log + idempotency_key.
       ▼
COMMIT TRANSACTION
```

### 4.2 Financial Ledger Flow
- Payments (`payment`), refunds (`refund`), and adjustments (`adjustment`) are append-only ledger rows inside the `payments` table.
- Whenever a payment or refund is recorded inside a database transaction:
  1. The ledger row is inserted with explicit `currency` (`IQD` or `USD`), `receivedByUid`, and timestamp.
  2. The parent booking's `paidAmount` is recalculated atomically from the sum of net payments in matching currency.
  3. An `activity_logs` audit entry is written in the same transaction.
