# ARCHITECTURAL DECISION RECORDS (ADR) — RAVAN

## ADR-001: Official Brand Naming (`RAVAN`)
- **Decision:** The product, codebase, package name, metadata, and documentation exclusively use the name **RAVAN**.
- **Rationale:** Enforces brand consistency across all touchpoints.

## ADR-002: Modular Monolith with Dual Cloud SQL Runtime & Portable Supabase Migrations
- **Context:** The Master Prompt specifies a modular monolith using PostgreSQL, RLS, and TypeScript. Within Google AI Studio's live runtime environment, full-stack applications run on port 3000 with Express + Vite + Google Cloud SQL for PostgreSQL (`drizzle-orm`) + Firebase Auth.
- **Decision:** Implement the live full-stack application on Cloud SQL for PostgreSQL (`src/db/schema.ts` + `server.ts`) so every screen, transaction, capacity lock, and financial query runs against a real PostgreSQL database today—while simultaneously providing complete, versioned Supabase PostgreSQL + RLS migration files in `supabase/migrations/0001_initial_ravan_schema.sql`.
- **Trade-off:** Maintaining both `src/db/schema.ts` (Drizzle) and `supabase/migrations/0001_initial_ravan_schema.sql` requires keeping schema changes synchronized, which is documented in `docs/DATABASE.md`.

## ADR-003: Strict Currency Separation (`IQD` and `USD`)
- **Decision:** Never convert or sum `IQD` and `USD` automatically. Store monetary values as integer units alongside an explicit `currency` column (`'IQD' | 'USD'`).
- **Rationale:** Travel companies in Iraq/Kurdistan operate dual physical/bank cashflows in Iraqi Dinar and US Dollar. Automatic conversion introduces accounting discrepancies when market exchange rates fluctuate.

## ADR-004: Configurable Seat Capacity Reservation (`on_pending` vs `on_approved`)
- **Decision:** Each booking stores a boolean `seats_reserved` flag, and each organization configures `seat_reserve_mode` (`on_pending` by default). Seat mutations execute inside a PostgreSQL transaction using `SELECT ... FOR UPDATE` on the `trips` row.
- **Rationale:** Prevents concurrent overbooking while giving travel agencies flexibility over whether unconfirmed requests hold inventory.

## ADR-005: Open Decisions (`OPEN DECISION`)
- **OPEN DECISION — Commercial Subscription Pricing:** Draft prices (25k / 50k / 100k / 200k+ IQD) are unvalidated proposals and labeled accordingly.
- **OPEN DECISION — Iraqi Online Payment Gateways:** Deferred until merchant agreements and regulatory checks are completed.
