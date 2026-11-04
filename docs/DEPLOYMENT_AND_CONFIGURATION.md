# RAVAN — Deployment & Configuration Guide (`DEPLOYMENT_AND_CONFIGURATION.md`)

## 1. Runtime Stack & Architecture
- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`) + Lucide Icons + Motion, served via Vite middleware in development and static `dist/` in production.
- **Backend:** Node.js + Express (`server.ts`) running on port `3000`.
- **Database:** Google Cloud SQL for PostgreSQL (`europe-west2`), accessed via `pg` Pool + Drizzle ORM (`/src/db/index.ts`, `/src/db/schema.ts`).
- **Authentication:** Firebase Authentication + `firebase-admin` (`/firebase-applet-config.json`).

## 2. Environment Variables
Configured automatically by the runtime environment (see `/.env.example`):
- `DATABASE_URL`: PostgreSQL connection string injected by Cloud SQL integration.
- `GEMINI_API_KEY`: Optional server-side API key if AI features are enabled.
- `APP_URL`: Public service URL for shareable trip links (`/?trip=CODE`) and company profiles (`/?org=SLUG`).

## 3. Database Schema & Migrations
- Schema definition: `/src/db/schema.ts` (27 PostgreSQL tables).
- Drizzle config: `/src/db/drizzle.config.ts`.
- Seed script: `/src/db/seed.ts` (automatically seeds default `subscription_plans`, `platform_payment_methods`, and `coupons` on server startup, and seeds two isolated demo travel companies via `POST /api/dev/seed`).

## 4. Build & Startup Commands
- **Install dependencies:** `npm install`
- **Development server (Port 3000):** `npm run dev` (`tsx server.ts`)
- **Typecheck / Lint:** `npm run lint` (`tsc --noEmit`)
- **Production build:** `npm run build` (builds Vite SPA to `dist/` and bundles `server.ts` with `esbuild`)
- **Production start:** `npm start`
