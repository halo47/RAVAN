# BACKUP, RECOVERY & INCIDENT RESPONSE — RAVAN

## 1. Database Backup Policy

1. **Automated Daily Backups & PITR:**
   - Cloud SQL for PostgreSQL / Supabase PostgreSQL must have automated daily snapshots and Point-in-Time Recovery (PITR / WAL archiving) enabled with a minimum 7-day retention window (30 days recommended for production).
2. **Pre-Migration Snapshot:**
   - Before running any schema migration in production, take an on-demand logical backup:
     ```bash
     pg_dump --format=custom --no-owner --no-acl --file=ravan_pre_migration_$(date +%Y%m%d_%H%M%S).dump "$DATABASE_CONNECTION"
     ```

---

## 2. Restore Procedure & Verification

1. Provision a staging recovery database instance (never overwrite production directly without verifying the dump first).
2. Restore the snapshot:
   ```bash
   pg_restore --clean --no-owner --no-acl --dbname="$STAGING_DB" ravan_backup.dump
   ```
3. Run reconciliation checks:
   - Verify `trips.reserved_seats` equals the sum of `bookings.passenger_count` where `bookings.seats_reserved = true`.
   - Verify `bookings.paid_amount` equals the net sum of `payments` (`payment` - `refund` + `adjustment`) per booking.

---

## 3. KURDIA Pilot Data Import Safety Protocol

- **Strict Rule:** Existing KURDIA systems (Cloudflare Worker, KV, website, domain) are never modified or deleted.
- When the project owner approves a future pilot import for KURDIA:
  1. Export KURDIA records to a read-only JSON/CSV snapshot.
  2. Run the RAVAN **Dry-Run Import Validator** to check phone formats, currency tags (`IQD`/`USD`), and trip capacity math without writing to production tables.
  3. Only after 0 validation errors and owner sign-off, import into the isolated `KURDIA ADVENTURE` tenant inside RAVAN.
