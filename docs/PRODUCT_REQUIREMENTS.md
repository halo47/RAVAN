# PRODUCT REQUIREMENTS DOCUMENT (PRD) — RAVAN

- **Product Name:** RAVAN
- **Tagline:** Travel Business Operating System
- **Brand Sentence:** One platform. Every journey.
- **Document State:** v0.1.0 Foundation Baseline

---

## 1. Executive Vision & Problem Statement

Travel agencies and tour operators in Kurdistan, Iraq, and the broader region frequently manage trips, seat capacities, passenger manifests, customer balances, and multi-currency cashflows (`IQD` and `USD`) across fragmented spreadsheets and messaging apps. This leads to:
- Overbooking when multiple agents book seats simultaneously.
- Unclear customer debt / outstanding balances and commingled `IQD` and `USD` cash drawers.
- Lack of role-based boundaries between owners, booking agents, accountants, and tour guides.

**RAVAN** solves these challenges by providing a unified, multi-tenant SaaS operating system where each travel company operates in a secure, isolated workspace.

---

## 2. Strict Protection Boundary for KURDIA ADVENTURE

- **KURDIA ADVENTURE** will serve as the first Pilot Tenant of RAVAN in a future phase.
- KURDIA is strictly a standard tenant—zero KURDIA-specific business rules, logos, or domains are hardcoded into RAVAN.
- Existing KURDIA infrastructure (website, Cloudflare Worker, KV namespaces, APIs, domain) is 100% untouched.
- No live data migration from KURDIA may occur without a documented mapping, backup verification, dry-run validation, and explicit project owner sign-off.

---

## 3. Target User Personas & Roles

1. **Platform Super Admin (`platform_super_admin`):** Monitors tenant organizations, subscription plans, trial/expiry lifecycles, and platform audit logs without arbitrary un-audited access to tenant financial records.
2. **Company Owner (`company_owner`):** Full administrative control over a single travel organization, billing/subscription status, staff invitations, trips, bookings, and finances.
3. **Company Manager (`company_manager`):** Manages day-to-day operations, trips, bookings, customers, and operational reports according to granted permissions.
4. **Booking Agent (`booking_agent`):** Creates and manages customer bookings, checks real-time seat availability, and views customer records without modifying company settings or deleting financial ledgers.
5. **Accountant (`accountant`):** Records customer payments, installments, refunds/adjustments, and trip expenses; reconciles `IQD` and `USD` ledgers and trip profitability.
6. **Tour Guide (`tour_guide`):** Views assigned trips, pickup schedules, and passenger manifests for field operations.
7. **Customer (`customer`):** Browses published public trips, submits booking requests, and looks up booking confirmation status via secure booking code + phone verification.

---

## 4. Functional Scope — MVP Modules

### 4.1 Platform Super Admin Console
- Organization registry with search and status filters (`active`, `trialing`, `suspended`, `archived`).
- Subscription plan management and manual subscription renewal/verification.
- Platform-wide audit log viewer recording sensitive state changes.

### 4.2 Company Dashboard
- Real-time KPIs computed strictly from live PostgreSQL queries:
  - Active & published trips count
  - Total bookings & pending approvals
  - Confirmed passengers count
  - Currency-separated financial summaries (`IQD` Revenue, `IQD` Collected, `IQD` Outstanding, `IQD` Expenses, `IQD` Net Profit; and parallel `USD` metrics)
  - Upcoming departures and unread notifications

### 4.3 Trips Management
- Full lifecycle statuses: `draft`, `published`, `full`, `cancelled`, `completed`, `archived`.
- Multilingual content (`titleKu`, `titleAr`, `titleEn`, `descriptionKu`, `descriptionAr`, `descriptionEn`).
- Departure & return timestamps, destination, departure city, meeting/pickup points, included/excluded services, cover imagery, assigned guide and vehicle.
- Guardrail: Trips with existing bookings cannot be hard-deleted; they must transition to `archived` or `cancelled`.

### 4.4 Booking Management & Capacity Safety
- Statuses: `pending`, `approved`, `rejected`, `cancelled`, `completed`, `no_show`.
- Unique, non-sequential booking code (`RVN-XXXXXX`).
- Configurable seat reservation policy per organization (`on_pending` default vs `on_approved`).
- Database transaction with row-level locking (`SELECT ... FOR UPDATE`) to prevent overbooking under concurrent requests.
- Idempotency key support to prevent duplicate form submissions.
- Full status transition audit trail (`booking_status_history`).

### 4.5 CRM (Customers) & Passengers
- Customer profile per tenant (`fullName`, normalized international `phone`, optional `email`, `preferredLanguage`, `notes`).
- Computed customer booking count and outstanding balances per currency (`IQD` / `USD`).
- Dedicated `booking_passengers` records separated from the booking header for accurate field manifests.

### 4.6 Finance & Accounting
- Support for full payments, partial installments, refunds/reversals, and trip/organization expenses.
- Immutable ledger rule: Confirmed payment records cannot be hard-deleted; errors are corrected via `refund` or `adjustment` entries with mandatory reason and audit log.
- Strict currency separation: `IQD` and `USD` are never added together.

### 4.7 Team, Guides & Vehicles
- Member invitations, role assignment, custom permission overrides, and account deactivation.
- Self-privilege-escalation prevention (no member may elevate their own role).
- Guide profiles and Phase-2-ready Vehicle registry (`vehicles` table) for trip assignment.

### 4.8 Public Customer Portal
- Tenant-scoped public trip showcase returning only safe allowlisted fields.
- Public booking request submission with capacity check and idempotency protection.
- Customer booking lookup using booking code + phone verification.

---

## 5. Non-Functional Requirements

- **Localization:** Kurdish Sorani (`ku`, RTL), Arabic (`ar`, RTL), English (`en`, LTR).
- **Timezone:** Stored in UTC in PostgreSQL; formatted in `Asia/Baghdad` (or organization timezone) in the UI.
- **PWA Safety:** Installable standalone web app; zero offline caching of private `/api/*` responses.

---

## 6. Open Decisions (`OPEN DECISION`)
- **OPEN DECISION 01:** Final commercial pricing tiers in IQD/USD after KURDIA pilot validation.
- **OPEN DECISION 02:** Selection of automated Iraqi payment provider (FIB / FastPay / Switch) for Phase 2.
- **OPEN DECISION 03:** WhatsApp Business API provider selection for automated booking receipts in Phase 2.
