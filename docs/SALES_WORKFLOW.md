# RAVAN — Sales & Lead Management Workflow (`SALES_WORKFLOW.md`)

## 1. Lead Capture Channels
RAVAN captures prospective travel company leads into the `sales_leads` PostgreSQL table via two channels:
1. **Public SaaS Website Demo Request (`POST /api/public/demo-request`):**
   - Visitors on the public RAVAN landing screen can submit their Company Name, Contact Name, Phone/WhatsApp, City, and Interested Plan.
   - Automatically creates a `sales_leads` record in stage `demo_scheduled`.
2. **Super Admin Direct Entry (`POST /api/platform/leads`):**
   - Super Admin or sales team manually logs outbound prospects from Erbil, Sulaymaniyah, Duhok, Baghdad, or Basra.

## 2. Sales Pipeline Stages
Every lead progresses through structured CRM stages (`PATCH /api/platform/leads/:id`):
- `new_lead`: Initial inquiry recorded.
- `contacted`: Sales representative contacted the agency owner.
- `demo_scheduled`: Live walkthrough of RAVAN scheduled.
- `trial_started`: Agency registered and started their 14-day free trial.
- `negotiation`: Discussing plan tier (`professional`, `business`, `enterprise`) or annual discount.
- `won`: Agency paid subscription invoice and converted to an active customer (`converted_org_id` linked).
- `lost`: Inquiry closed without conversion (`lost_reason` documented).

## 3. Promotional Coupons & Referral Tracking
- Super Admin can create promotional coupons (`POST /api/platform/coupons`) such as:
  - `RAVAN20` (20% discount on any subscription plan).
  - `WELCOME10K` (`10,000 IQD` fixed discount on IQD plans).
- When a company applies a coupon during `POST /api/subscription/renew`, the backend validates `active`, `max_redemptions`, and `redeemed_count`, deducts `discount_amount` on the generated `subscription_invoices` row, and increments `redeemed_count`.
