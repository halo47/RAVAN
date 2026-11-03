# PRODUCT ROADMAP & SPRINT PLAN — RAVAN

> Sprints represent logical execution order and quality gates, not arbitrary calendar promises.

---

## Sprint 0 — Repository & Foundation ✅
- Repository structure, `.gitignore`, `.env.example`, CI workflow, and 15 architectural/product documents.
- Design system (`#0A101A`, `#142438`, `#547DA8`, `#C8A76A`) and trilingual RTL/LTR (`ku`, `ar`, `en`) setup.

## Sprint 1 — Auth & Tenant Core ✅
- Firebase Authentication + PostgreSQL `users`, `organizations`, `organization_settings`, `memberships`, and `invites`.
- Server-side RBAC permission guard (7 roles, 19 permissions) and self-elevation prevention.

## Sprint 2 — Trips Module ✅
- Multilingual trip catalog (`ku`, `ar`, `en`), pickup points, capacity tracking, guide/vehicle linking, and safe archive guardrails.

## Sprint 3 — Booking & CRM ✅
- Customer CRM, passenger manifests, status history, idempotency protection, and PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) for capacity safety.

## Sprint 4 — Finance Module ✅
- Append-only payment, refund, and adjustment ledger.
- Strict `IQD` and `USD` separation, expense tracking, and trip-level profitability calculation.

## Sprint 5 — SaaS Administration ✅
- Subscription plans (marked as unvalidated draft proposals), organization subscriptions, plan limit enforcement, and Platform Super Admin console with audit logs.

## Sprint 6 — PWA & Notifications ✅
- Installable PWA manifest, icons, in-app install prompt (`PWAInstallButton`), offline indicator, safe `NetworkOnly` policy for private `/api/*` routes, and in-app notifications.

## Sprint 7 — Pilot & Launch Readiness (Next Phase)
- Two-tenant live isolation verification (`RAVAN Demo Travel` vs `Zagros Horizon Tours`).
- KURDIA pilot dry-run import rehearsal (requires owner sign-off).
- External GitHub repository push and production domain setup.
