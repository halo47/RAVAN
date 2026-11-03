# CHANGELOG — RAVAN

All notable changes to the **RAVAN** project are documented in this file.

## [0.1.0] — 2026-11-03 (Initial Foundation & MVP Core)

### Added
- **Documentation Suite (`docs/*`):** Created `PROJECT_STATUS.md`, `PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `RBAC_MATRIX.md`, `UX_DESIGN_SYSTEM.md`, `LOCALIZATION.md`, `API_CONTRACTS.md`, `TEST_PLAN.md`, `DEPLOYMENT.md`, `BACKUP_AND_RECOVERY.md`, `ROADMAP.md`, `DECISIONS.md`, and `CHANGELOG.md`.
- **Database Architecture:**
  - Provisioned Cloud SQL for PostgreSQL (`europe-west2`) with 21 tables in `src/db/schema.ts`.
  - Created portable Supabase PostgreSQL migration with Row Level Security (RLS) policies in `supabase/migrations/0001_initial_ravan_schema.sql` and development seed script in `supabase/seed.sql`.
- **Security & RBAC:**
  - Firebase Authentication integration (`src/lib/firebase.ts`, `src/lib/firebase-admin.ts`, `src/middleware/auth.ts`).
  - Permission-based access control (`src/lib/permissions.ts`) covering 7 roles and 19 permissions, with self-privilege-escalation prevention.
- **Core Modules (`server.ts` & `src/`):**
  - Multi-tenant Organization Onboarding & switching.
  - Company Dashboard with real-time PostgreSQL KPIs.
  - Multilingual Trips CRUD (`ku`, `ar`, `en`), pickup points, and safe archive rules.
  - Concurrency-safe Bookings with `SELECT ... FOR UPDATE` seat locking, idempotency keys, passenger manifests, and status history.
  - Customer CRM with phone normalization (`+964...`) and per-currency balances.
  - Currency-separated Finance (`IQD` and `USD` payments, refunds, adjustments, expenses, and trip profitability).
  - Subscription plans, usage limit enforcement, and Platform Super Admin console.
  - Public Customer Booking Portal & secure booking lookup.
  - Installable PWA with `NetworkOnly` protection for private `/api/*` endpoints.
- **Quality & CI:**
  - Added Vitest unit test suite (`tests/unit/core.test.ts`) and GitHub Actions workflow (`.github/workflows/ci.yml`).
