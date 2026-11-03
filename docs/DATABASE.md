# DATABASE ARCHITECTURE — RAVAN

## 1. Overview

RAVAN uses **PostgreSQL** as its primary relational database engine.
- **Runtime ORM Schema:** `src/db/schema.ts` (managed via `drizzle-orm` and `drizzle-kit`).
- **Portable SQL & RLS Migration:** `supabase/migrations/0001_initial_ravan_schema.sql`.
- **Timestamps:** Stored in UTC (`TIMESTAMP WITH TIME ZONE` / `timestamp()`).
- **Money Representation:** Integer amounts (`bigint` / `integer`) paired with explicit `currency` (`'IQD'` | `'USD'`). Floating-point types (`REAL`, `FLOAT`, `DOUBLE PRECISION`) are strictly prohibited for monetary columns.

---

## 2. Core Tables Catalog

| Table Name | Tenant Scoped (`organization_id`) | Purpose |
| :--- | :---: | :--- |
| `users` | Global (linked via `memberships`) | Authenticated user profiles keyed by Firebase/Auth `uid` |
| `organizations` | Root Tenant Table (`id`) | Travel company tenant record, default locale, timezone, currency |
| `organization_settings` | Yes (1:1 with `organizations`) | Booking rules (`seat_reserve_mode`), branding colors, cancellation policy |
| `memberships` | Yes | Links `users` to `organizations` with `role`, `custom_permissions`, `status` |
| `invites` | Yes | Pending staff invitations with expiration and role assignment |
| `subscription_plans` | Global | SaaS tier definitions (`starter`, `professional`, `business`, `enterprise`) |
| `subscriptions` | Yes | Organization subscription lifecycle, limits, renewal dates |
| `guides` | Yes | Tour guide profiles, languages, phone numbers, active status |
| `vehicles` | Yes | Fleet/vehicle records (`plate_number`, `capacity`, `driver_name`) |
| `trips` | Yes | Multilingual trip catalog, pricing, capacity, reserved/available seats |
| `trip_pickup_points` | Yes | Meeting points and scheduled pickup times per trip |
| `customers` | Yes | Organization CRM records (`full_name`, `phone`, `email`, `notes`) |
| `bookings` | Yes | Customer bookings, status, passenger count, total/paid amounts, idempotency |
| `booking_passengers` | Yes | Individual passenger manifest rows linked to a booking and trip |
| `booking_status_history` | Yes | Immutable audit trail of booking status changes |
| `payments` | Yes | Append-only ledger for `payment`, `refund`, and `adjustment` entries |
| `expense_categories` | Yes | Categorization for operational and trip expenses |
| `expenses` | Yes | Recorded expenses linked optionally to a specific trip |
| `notifications` | Yes | In-app notifications for bookings, payments, trips, and subscriptions |
| `activity_logs` | Yes (nullable for platform events) | Immutable security and operational audit log |
| `idempotency_keys` | Yes | Prevents duplicate mutations on booking and payment creation |

---

## 3. Seat Capacity Reservation Policy

RAVAN supports configurable capacity reservation per organization via `organization_settings.seat_reserve_mode`:
1. **`on_pending` (Default & Recommended for High-Demand Trips):**
   - Seats are deducted from `trips.available_seats` immediately when a `pending` or `approved` booking is created.
   - If the booking is subsequently transitioned to `rejected` or `cancelled`, the reserved seats are atomically released back to `trips.available_seats`.
2. **`on_approved`:**
   - Seats are deducted only when a booking transitions to `approved`.
   - Approval fails if `available_seats < booking.passenger_count` at the moment of approval.

In both modes, `bookings.seats_reserved` (boolean) tracks whether that specific booking currently holds seats from the trip's pool, guaranteeing idempotent seat accounting across any sequence of status transitions.

---

## 4. Row Level Security (RLS) Design (Supabase / PostgreSQL)

In `supabase/migrations/0001_initial_ravan_schema.sql`:
- RLS is enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on all tables.
- No tenant table uses `USING (true)` for private data.
- Helper function `public.is_org_member(org_id integer, required_permission text)` runs with `SECURITY DEFINER` and explicit ` SET search_path = public` to verify active membership and permissions safely.
- Public read policy on `trips` permits `SELECT` **only** where `status IN ('published', 'full')` and its parent organization has `status IN ('active', 'trialing')`.

---

## 5. Applying Migrations & Rollback Strategy

### In Google AI Studio (Cloud SQL + Drizzle)
Schema updates are pushed via the `cloudsql.UpdateSchema` RPC action using `src/db/schema.ts` and `src/db/drizzle.config.ts`, followed by verification against `information_schema.columns`.

### In Local / Supabase CLI Environments
```bash
# Apply migrations locally
supabase db reset

# Push migrations to a linked Supabase project (requires owner approval)
supabase db push
```

### Rollback Strategy
- Always take a logical snapshot (`pg_dump`) prior to applying destructive migrations.
- Downward migrations must drop newly added constraints/columns in reverse dependency order without dropping historical `payments` or `activity_logs` tables.
