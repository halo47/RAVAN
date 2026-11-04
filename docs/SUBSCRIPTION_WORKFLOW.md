# RAVAN — Subscription Workflow (`SUBSCRIPTION_WORKFLOW.md`)

## 1. Subscription Plans (`subscription_plans` Table)
RAVAN seeds 4 commercial tiers in PostgreSQL (all editable without hardcoded frontend prices):
- **Starter (`starter`):** Up to 5 active trips, 3 staff users, 100 monthly bookings (`35,000 IQD` or `$25 USD` / month).
- **Professional (`professional`):** Up to 25 active trips, 10 staff users, 500 monthly bookings (`65,000 IQD` or `$45 USD` / month).
- **Business (`business`):** Up to 100 active trips, 25 staff users, 2,000 monthly bookings (`110,000 IQD` or `$75 USD` / month).
- **Enterprise (`enterprise`):** Up to 500 active trips, 100 staff users, 10,000 monthly bookings (`220,000 IQD` or `$150 USD` / month).

## 2. Subscription Lifecycle States
- `trial`: Default 14-day free trial created upon company registration.
- `pending_payment`: Company has submitted a manual payment reference (`POST /api/subscription/renew`) awaiting Super Admin verification.
- `active`: Verified paid subscription within its valid `current_period_end`.
- `past_due` / `grace_period`: Subscription period has ended; company receives renewal reminders.
- `suspended`: Suspended by Super Admin; write operations are blocked while historical data remains safely preserved.

## 3. Entitlement & Limit Enforcement
- **Trip Creation (`POST /api/trips`):** Verifies the organization is not `suspended`, subscription is not `expired`/`cancelled`, and current active trips count is below `max_active_trips`.
- **Staff Invitation (`POST /api/invites`):** Verifies current active members count is below `max_users`.

## 4. Renewal & Single-Extension Guard
1. Company selects plan, billing cycle (`monthly` or `annual`), currency (`IQD` or `USD`), optional coupon (`RAVAN20`, `WELCOME10K`), and enters `transactionReference`.
2. Backend creates a `subscription_invoices` row (`INV-RVN-...`) and a `subscription_payments` row (`status = 'pending_verification'`, `extension_applied = false`).
3. When Super Admin approves (`POST /api/platform/subscription-payments/:id/verify`), the backend locks the payment row (`FOR UPDATE`), checks `if (payment.extension_applied) throw Error`, extends `current_period_end` from `MAX(NOW(), current_period_end)`, and sets `extension_applied = true`.
