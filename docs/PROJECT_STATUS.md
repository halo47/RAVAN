# PROJECT STATUS — RAVAN

## Initial Baseline Record
`Status: NOT STARTED — Initial repository and project foundation being created.`

---

## Current Phase Status
`Current Overall Status: IN PROGRESS / TESTED (MVP Foundation + Multi-Tenant PostgreSQL Live in AI Studio)`

### Status Breakdown by Distinction

| Category | State | Details |
| :--- | :--- | :--- |
| **Created** | ✅ Completed | Complete `docs/*` suite (15 documents), `.github/*` CI & templates, portable `supabase/migrations/0001_initial_ravan_schema.sql`, Drizzle schema (`src/db/schema.ts`), and full-stack source tree. |
| **Implemented** | ✅ Completed | Multi-tenant PostgreSQL database (Cloud SQL `europe-west2`), Firebase Auth verification, 7-role / 19-permission RBAC guard, Organization Onboarding, Trips CRUD (3 languages), Atomic Booking Capacity Locking, Customer CRM, Passenger Manifests, Currency-Separated Finance (`IQD` & `USD` ledger, payments, refunds, expenses), Subscription & Limits Engine, Platform Super Admin Console, In-App Notifications, Public Customer Booking Portal, and PWA offline shell. |
| **Tested** | ✅ Completed | TypeScript strict type-checking (`tsc --noEmit`), Vitest unit & domain verification suite (`tests/unit/core.test.ts`), Vite production bundle build (`vite build`), and PostgreSQL `information_schema.columns` schema verification. |
| **Deployed** | ⏸️ Not Deployed to Production | Running in Google AI Studio preview (`europe-west2`). External GitHub repository push, custom domain binding, and external production hosting have **not** been executed and await owner authorization. |

---

## Known Blockers & External Requirements

1. **GitHub Repository Push (`BLOCKED — Awaiting External Git Remote`):**
   - The AI Studio sandbox environment does not have pre-authorized GitHub CLI (`gh`) or personal access tokens attached. All files, `.gitignore`, and `.github/workflows/ci.yml` are prepared locally and ready to push once the project owner connects a GitHub repository.
2. **External Supabase Project (`OPEN DECISION / OPTIONAL`):**
   - In this AI Studio environment, Cloud SQL for PostgreSQL (`europe-west2`) + Firebase Auth is provisioned and active. Portable Supabase SQL migrations with PostgreSQL RLS policies are also written in `supabase/migrations/0001_initial_ravan_schema.sql` if the owner chooses to deploy to Supabase + Vercel later.
3. **Market Validation of Subscription Pricing (`OPEN DECISION`):**
   - Subscription tier prices (25,000 / 50,000 / 100,000 / 200,000+ IQD) are marked as *Unvalidated Draft Proposals* in both documentation and UI.
4. **Online Payment Gateway (`DEFERRED TO PHASE 2/3`):**
   - MVP uses manual payment confirmation with audit logging and reference codes. Iraqi payment gateways (FIB, FastPay, NassPay) require merchant credentials and legal agreements in a future phase.
5. **KURDIA Pilot Data Migration (`PROTECTED — NOT STARTED`):**
   - Per Section 4 of the Master Prompt, zero live KURDIA systems or data have been touched. Only a dry-run validator and import template specification are included.
