# RAVAN — Complete System Workflow (`SYSTEM_WORKFLOW.md`)

## 1. Architectural Overview
RAVAN operates as two connected products on a unified multi-tenant Cloud SQL PostgreSQL (27 tables) + Express + React 19 stack:
1. **Travel Company Operating System:** End-to-end agency operations (Company Profile, Trips, Exclusive Single-Trip Public Links `/?trip=CODE`, Company Public Storefronts `/?org=SLUG`, Concurrency-Safe Bookings, Passenger Manifest & Live Attendance, Dual-Currency `IQD` & `USD` Financial Ledgers, Trip Profitability, Staff & RBAC, Reports, and Support Tickets).
2. **Commercial SaaS Platform:** Subscription plans, free trial management, manual & electronic payment verification (FIB, FastPay, Bank Transfer, Cash), invoice generation (`INV-RVN-...`), single-extension renewal guards, promotional coupons (`RAVAN20`, `WELCOME10K`), Sales CRM pipeline, and Super Admin commercial revenue analytics (`MRR`, `ARR`, `Collected`, and `Pending` separated by `IQD` and `USD`).

---

## 2. End-to-End Business Process
1. **Company Registration & Onboarding:**
   - Owner signs in via Google/Firebase Auth (`POST /api/organizations` or `POST /api/dev/seed`).
   - System creates `organizations`, `organization_settings`, `memberships` (`owner`), default `expense_categories`, and a 14-day `subscriptions` record (`status = 'trial'`).
   - The 8-step **Onboarding Checklist** tracks real completion from PostgreSQL (`GET /api/dashboard`).
2. **Subscription & Billing:**
   - Company selects a plan (`starter`, `professional`, `business`, `enterprise`) from `/api/subscription`.
   - Submits payment reference and optional coupon (`POST /api/subscription/renew`), generating a `subscription_invoices` record (`INV-RVN-...`) and `subscription_payments` record (`pending_verification`).
   - Super Admin verifies payment (`POST /api/platform/subscription-payments/:id/verify`), atomically extending `current_period_end` once (`extension_applied = true`).
3. **Staff, Guides & Vehicles Setup:**
   - Company invites staff (`POST /api/invites`), assigns roles (`owner`, `company_admin`, `trip_manager`, `booking_agent`, `accountant`, `guide`, `viewer`), and registers `guides` and `vehicles`.
4. **Trip Creation & Exclusive Public Links:**
   - Company creates and publishes a trip (`POST /api/trips`) with cover image, capacity, pickup points, and currency (`IQD` or `USD`).
   - System generates a dedicated single-trip registration URL (`/?trip=CODE`) that displays **only** that trip's details and participant registration form.
5. **Customer Booking & Seat Reservation:**
   - Customers submit bookings on `/?trip=CODE` (`POST /api/public/bookings`) or staff create bookings internally (`POST /api/bookings`).
   - Row-level locking (`SELECT ... FOR UPDATE` on `trips`) prevents overbooking under concurrent requests.
6. **Payment Collection & Installments:**
   - Staff record payments, partial installments, refunds, or adjustments (`POST /api/payments`) into the append-only financial ledger.
7. **Trip Preparation, Execution & Attendance:**
   - Staff/guides open the **Trip Operations & Manifest** modal (`PATCH /api/trips/:id`, `PATCH /api/passengers/:id/attendance`) to complete the 8-point preparation checklist, assign guide/vehicle, and mark each passenger `present` or `no_show`.
8. **Expense Recording & Profitability:**
   - Accountants record trip-linked or general expenses (`POST /api/expenses`).
   - System calculates per-trip net profit (`Collected Revenue - Refunds - Trip Expenses`) strictly separated by currency (`IQD` vs `USD`).
