# RAVAN — Travel Business Operating System

> **One platform. Every journey.**  
> سیستەمی کارپێکردنی بازرگانیی گەشتوگوزار (Multi-Tenant Travel SaaS)

---

## 1. Overview (پێشەکی)

**RAVAN** is a production-grade, multi-tenant Software-as-a-Service (SaaS) platform engineered for travel companies, tour operators, travel agencies, and field trip teams. Each travel organization operates within a strictly isolated tenant boundary with its own team roles, permission matrix, multilingual trip catalog (`ku`, `ar`, `en`), concurrency-safe seat capacity control, customer CRM, passenger manifests, and currency-separated accounting (`IQD` and `USD`).

### Key Principles
- **Official Brand Name:** `RAVAN` (never use any alternative name).
- **Strict Tenant Isolation:** Every business record belongs to an `organization_id` verified on the server and enforced via database constraints and row-level policies.
- **KURDIA Boundary:** `KURDIA ADVENTURE` is treated strictly as a future pilot tenant. Zero KURDIA-specific branding, endpoints, or data are hardcoded into RAVAN, and no live migration from KURDIA is executed without an approved dry-run and owner sign-off.
- **Currency Integrity:** `IQD` (Iraqi Dinar) and `USD` (US Dollar) are stored as integer units and never summed together across currencies.
- **Multilingual & RTL/LTR Native:** Full support for Kurdish Sorani (`ku`, RTL), Arabic (`ar`, RTL), and English (`en`, LTR) using `Vazirmatn`, `Plus Jakarta Sans`, and `JetBrains Mono` (`tabular-nums`).

---

## 2. Architecture & Runtime Note

The target long-term repository specification in `docs/ARCHITECTURE.md` outlines a modular monolith structure compatible with both **Full-Stack Express + Vite + React 19 + TypeScript + Drizzle PostgreSQL** (used in the Google AI Studio Cloud Run runtime environment) and **Next.js App Router + Supabase PostgreSQL** (portable SQL migrations included under `supabase/migrations/`).

- **Database:** Provisioned Cloud SQL for PostgreSQL (`europe-west2`) managed via `drizzle-orm` and `drizzle-kit` (`src/db/schema.ts`), alongside portable versioned SQL migrations + RLS policies in `supabase/migrations/0001_initial_ravan_schema.sql`.
- **Authentication:** Firebase Authentication (Google OAuth + verified ID tokens on Express backend routes `/api/*`) with server-side RBAC permission checks.
- **PWA Compliance:** Installable Progressive Web App (`manifest.webmanifest`, service worker via `vite-plugin-pwa`) with strict `NetworkOnly` policy for all `/api/*` endpoints so private tenant data is never cached insecurely offline.

---

## 3. Repository Structure

```text
/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── .env.example
├── package.json
├── server.ts
├── vite.config.ts
├── tsconfig.json
├── public/
│   └── icon.svg
├── src/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   ├── drizzle.config.ts
│   │   └── seed.ts
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── firebase-admin.ts
│   │   ├── permissions.ts
│   │   ├── money.ts
│   │   ├── dates.ts
│   │   ├── validation.ts
│   │   └── i18n.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── components/
│   │   ├── PWAInstallButton.tsx
│   │   └── OfflineIndicator.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 0001_initial_ravan_schema.sql
│   └── seed.sql
├── tests/
│   └── unit/
│       └── core.test.ts
└── docs/
    ├── PROJECT_STATUS.md
    ├── PRODUCT_REQUIREMENTS.md
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── SECURITY.md
    ├── RBAC_MATRIX.md
    ├── UX_DESIGN_SYSTEM.md
    ├── LOCALIZATION.md
    ├── API_CONTRACTS.md
    ├── TEST_PLAN.md
    ├── DEPLOYMENT.md
    ├── BACKUP_AND_RECOVERY.md
    ├── ROADMAP.md
    ├── DECISIONS.md
    └── CHANGELOG.md
```

---

## 4. Environment Variables

Copy `.env.example` to `.env` for local development. Never commit `.env` or real secrets to version control.

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `SQL_HOST` | Server | PostgreSQL host or Cloud SQL Auth Proxy socket path |
| `SQL_DB_NAME` | Server | PostgreSQL database name |
| `SQL_USER` | Server | Runtime application PostgreSQL user |
| `SQL_PASSWORD` | Server | Runtime application PostgreSQL password |
| `SQL_ADMIN_USER` | Server (Migrations) | Admin user for Drizzle Kit schema pushes |
| `SQL_ADMIN_PASSWORD` | Server (Migrations) | Admin password for Drizzle Kit schema pushes |
| `APP_URL` | Server/Client | Base URL of the application |
| `NEXT_PUBLIC_SUPABASE_URL` | Reference | Portable Supabase URL placeholder |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Reference | Portable Supabase Anon Key placeholder |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Reference | Never expose in client bundle |

---

## 5. Development Commands

```bash
# Start full-stack development server (Express API + Vite SPA on port 3000)
npm run dev

# Type-check codebase
npm run lint

# Run unit & domain logic tests (Vitest)
npm test

# Build production client bundle
npm run build
```

---

## 6. Creating Local / Demo Users Safely

1. Sign in via Google Sign-In in the application header or login screen.
2. On first sign-in, your authenticated profile is synchronized to the `users` table in PostgreSQL.
3. You can create a new travel organization via the **Organization Onboarding** workflow, or seed the isolated development tenants (`RAVAN Demo Travel` and `Zagros Horizon Tours`) using the **Seed Development Data** control in the onboarding banner (strictly non-production).
