# API CONTRACTS — RAVAN

All backend endpoints are mounted under `/api`. Private endpoints require `Authorization: Bearer <Firebase_ID_Token>` and `x-organization-id: <orgId>`.

---

## 1. Authentication & Context Endpoints

### `GET /api/me`
Returns the authenticated user profile, list of organizations the user belongs to (`memberships`), and the active organization's settings and subscription.

### `POST /api/organizations`
Creates a new travel organization tenant, assigns the creator as `company_owner`, initializes `organization_settings`, and starts a `trialing` subscription.

### `POST /api/dev/seed`
*(Development / Testing Only)* Seeds two isolated demo organizations (`RAVAN Demo Travel` and `Zagros Horizon Tours`) with sample trips, customers, bookings, and ledger entries so multi-tenant isolation and workflows can be verified immediately. Never uses real KURDIA data.

---

## 2. Tenant Operational Endpoints

| Method & Path | Required Permission | Description |
| :--- | :--- | :--- |
| `GET /api/dashboard` | `organization.read` | Computes real-time KPIs, upcoming trips, and currency-separated `IQD`/`USD` metrics from PostgreSQL. |
| `GET /api/trips` | `trips.read` | Lists tenant trips with optional status, search, and destination filters. |
| `POST /api/trips` | `trips.create` | Creates a new multilingual trip and optional pickup points (checks subscription active trip limit). |
| `PATCH /api/trips/:id` | `trips.update` | Updates trip details or transitions status (`draft`, `published`, `cancelled`, `completed`, `archived`). |
| `GET /api/bookings` | `bookings.read` | Lists tenant bookings with customer, trip, passenger count, and balance details. |
| `POST /api/bookings` | `bookings.create` | Creates a booking + passengers inside an atomic PostgreSQL transaction with `SELECT ... FOR UPDATE` seat locking and `Idempotency-Key` support. |
| `PATCH /api/bookings/:id/status` | `bookings.approve` / `bookings.cancel` | Transitions booking status, updates `trips.reserved_seats` / `available_seats`, and writes `booking_status_history`. |
| `GET /api/customers` | `customers.read` | Lists tenant CRM customers with computed booking counts and `IQD`/`USD` balances. |
| `POST /api/customers` | `customers.manage` | Creates a customer record with normalized phone validation. |
| `GET /api/finance` | `finance.read` | Returns payments, refunds, expenses, expense categories, and trip-level profitability separated by `IQD` and `USD`. |
| `POST /api/payments` | `finance.manage` | Records a `payment`, `refund`, or `adjustment` in an atomic transaction and recalculates booking `paid_amount`. |
| `POST /api/expenses` | `finance.manage` | Records an operational or trip-linked expense in `IQD` or `USD`. |
| `GET /api/members` | `members.read` | Lists organization members, guides, vehicles, and pending invites. |
| `POST /api/members/invite` | `members.invite` | Invites a staff member or creates a role assignment within plan member limits. |
| `PATCH /api/members/:id` | `members.manage_roles` | Updates a member's role, custom permissions, or active status (blocks self-elevation). |
| `POST /api/guides` | `trips.update` | Creates a tour guide profile for the tenant. |
| `POST /api/vehicles` | `trips.update` | Creates a vehicle record for the tenant. |
| `GET /api/notifications` | `organization.read` | Lists in-app notifications for the active organization. |
| `PATCH /api/notifications/:id/read` | `organization.read` | Marks a notification as read. |
| `PATCH /api/settings` | `settings.manage` | Updates organization settings (`seatReserveMode`, languages, timezone, currency, public page toggle). |

---

## 3. Platform Super Admin Endpoints

| Method & Path | Access | Description |
| :--- | :--- | :--- |
| `GET /api/platform/overview` | `platform_super_admin` | Lists all organizations, subscriptions, plans, and platform audit logs. |
| `PATCH /api/platform/organizations/:id/status` | `platform_super_admin` | Suspends, reactivates, or updates an organization's subscription status with mandatory audit log. |

---

## 4. Public Customer Portal Endpoints (Allowlisted Fields Only)

| Method & Path | Rate Limited | Description |
| :--- | :---: | :--- |
| `GET /api/public/trips` | Yes | Returns published trips for public display (excludes internal notes, costs, and private settings). |
| `POST /api/public/bookings` | Yes | Submits a customer booking request with atomic capacity verification and idempotency protection. |
| `POST /api/public/booking-lookup` | Yes | Looks up a booking confirmation status using `bookingCode` + normalized `phone` match. |
