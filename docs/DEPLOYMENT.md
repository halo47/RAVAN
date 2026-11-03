# DEPLOYMENT GUIDE — RAVAN

> **IMPORTANT POLICY:** No production deployment, custom domain binding, or external service billing is ever executed without explicit project owner approval.

---

## 1. Pre-Deployment Checklist

- [ ] All unit tests pass (`npm test`).
- [ ] TypeScript strict check passes (`npm run lint`).
- [ ] Production bundle compiles cleanly (`npm run build`).
- [ ] `.env` is excluded via `.gitignore` and zero secrets exist in git history.
- [ ] PostgreSQL backups and point-in-time recovery (PITR) are enabled on the target database.

---

## 2. Environment Configurations

### Option A: Google Cloud Run + Cloud SQL for PostgreSQL (Current Runtime Architecture)
1. Provision Cloud SQL PostgreSQL instance in `europe-west2`.
2. Configure environment variables (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `APP_URL`).
3. Apply Drizzle schema migrations using admin credentials (`SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`).
4. Build client assets (`npm run build`) and launch Express server (`npm start`).

### Option B: External Supabase + Vercel / Docker Hosting
1. Create a new dedicated Supabase project for **RAVAN** (never reuse or modify any existing KURDIA project).
2. Apply `supabase/migrations/0001_initial_ravan_schema.sql` to create tables, indexes, triggers, and RLS policies.
3. Configure environment variables from `.env.example` in the hosting dashboard.
