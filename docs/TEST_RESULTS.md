# RAVAN — Comprehensive Verification & Test Results (`TEST_RESULTS.md`)

## 1. Automated Verification Summary
All 27 database tables in Cloud SQL PostgreSQL (`europe-west2`) and all backend + frontend workflows were verified against the 27 test scenarios in Section 32 of the Master Prompt.

| # | Test Scenario | Endpoint / Mechanism | Result |
|---|---|---|---|
| 1 | Company Registration | `POST /api/organizations` creates org, settings, owner membership, and 14-day trial | **PASS** |
| 2 | Company Profile Setup | `PATCH /api/organization/profile` updates logo, slug, phone, email, cancellation policy | **PASS** |
| 3 | Subscription Selection | `GET /api/subscription` & `GET /api/public/saas-info` return 4 dynamic DB plans | **PASS** |
| 4 | Trial Activation | New companies receive active 14-day `trial` in `subscriptions` | **PASS** |
| 5 | Manual Payment Submission | `POST /api/subscription/renew` creates `INV-RVN-...` invoice & `pending_verification` payment | **PASS** |
| 6 | Super Admin Payment Approval | `POST /api/platform/subscription-payments/:id/verify` approves & extends subscription | **PASS** |
| 7 | Duplicate Approval Prevention | `extension_applied = true` row lock rejects any second approval attempt (`409`/`400`) | **PASS** |
| 8 | Subscription Expiration / Reminder | `POST /api/platform/organizations/:id/send-reminder` dispatches notification + audit log | **PASS** |
| 9 | Company Suspension | `PATCH /api/platform/organizations/:id/status` toggles `suspended` / `active` | **PASS** |
| 10 | Staff Creation & Invites | `POST /api/invites` enforces `max_users` plan limit and creates role-scoped invite | **PASS** |
| 11 | Role Permissions (RBAC) | `hasPermission()` + `resolveTenantContext()` enforce 22 granular permissions | **PASS** |
| 12 | Trip Creation | `POST /api/trips` enforces `max_active_trips` plan limit and creates pickup points | **PASS** |
| 13 | Trip Publication & Single-Trip Link | `PATCH /api/trips/:id` publishes trip; `/?trip=CODE` renders standalone single-trip page | **PASS** |
| 14 | Customer Public Booking | `POST /api/public/bookings` creates customer, booking, and participant rows atomically | **PASS** |
| 15 | Seat Reduction | `available_seats` decrements atomically inside `SELECT ... FOR UPDATE` transaction | **PASS** |
| 16 | Overbooking Prevention | Booking more seats than `available_seats` returns `409 Conflict` with zero mutation | **PASS** |
| 17 | Booking Approval | `PATCH /api/bookings/:id/status` transitions `pending` → `approved` and logs history | **PASS** |
| 18 | Booking Cancellation | Cancelling a reserved booking restores `available_seats` atomically | **PASS** |
| 19 | Passenger Management & Attendance | `PATCH /api/passengers/:id/attendance` updates `present` / `no_show` + `checked_in_at` | **PASS** |
| 20 | Customer Payment Recording | `POST /api/payments` appends ledger entry and updates `paid_amount` | **PASS** |
| 21 | Installment & Remaining Balance | Partial payment sets `payment_status = 'partially_paid'` and computes exact debt | **PASS** |
| 22 | Refund Recording | Refund entry reduces net collected cash and recalculates booking payment status | **PASS** |
| 23 | Expense Recording | `POST /api/expenses` records trip-linked or general company expenses | **PASS** |
| 24 | Profit Calculation | Per-trip and company-wide net profit (`Collected - Refunds - Expenses`) verified | **PASS** |
| 25 | Currency Separation (`IQD` / `USD`) | `IQD` and `USD` ledgers and SaaS MRR/ARR are never mixed or summed together | **PASS** |
| 26 | Cross-Company Isolation | Tenant A cannot read or mutate Tenant B records (`organization_id` scoped) | **PASS** |
| 27 | Reports & CSV Export | `GET /api/reports` + UTF-8 BOM CSV exports for Bookings, Finance, and Passenger Manifest | **PASS** |
