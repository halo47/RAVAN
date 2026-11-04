# RAVAN — Super Admin Guide (`SUPER_ADMIN_GUIDE.md`)

## 1. Accessing the Super Admin Commercial Console
- Users with `is_super_admin = true` (automatically granted to the platform owner) see the **بەڕێوەبەری گشتی (Super Admin)** tab in the left navigation bar.

## 2. Commercial Revenue & SaaS Metrics (`IQD` & `USD`)
- The top KPI strip displays real-time commercial metrics computed from PostgreSQL:
  - **MRR (Monthly Recurring Revenue):** Strictly separated into `IQD` and `USD`.
  - **ARR (Annual Recurring Revenue):** `12 × MRR` separated into `IQD` and `USD`.
  - **Collected vs. Pending SaaS Revenue:** Verified subscription payments vs. payments awaiting verification.
  - **Subscriber Counts:** Active companies, Trial companies, Sales Leads won, and Open Support Tickets.

## 3. Verifying Manual Subscription Payments
- In **پشکنین و پەسەندکردنی پارەدانی بەشداریی کۆمپانیاکان**, review incoming `pending_verification` payments submitted by travel companies (with their FIB/FastPay/Bank/Cash transaction reference).
- Click **پەسەندکردن و درێژکردنەوە (Approve)**:
  - Marks the payment `approved` and sets `extension_applied = true` inside a PostgreSQL transaction (`SELECT ... FOR UPDATE`).
  - Marks the linked `subscription_invoices` record as `paid`.
  - Extends the company's `subscriptions.current_period_end` by 30 days (`monthly`) or 365 days (`annual`) and sets status to `active`.
  - Sends an in-app notification to the company.

## 4. Managing Companies & Renewal Reminders
- View all registered travel agencies, their `@slug`, default currency, current plan, and expiration date.
- Click **بیرخستنەوەی نوێکردنەوە** to send an instant renewal reminder notification to the company's workspace and record an audit log.
- Click **ڕاگرتن / چالاککردنەوە** to suspend or reactivate a company account.

## 5. Sales CRM, Coupons & Support Desk
- **Sales CRM:** Add new prospective travel companies or manage incoming **Demo Requests** from the public landing page across stages (`new_lead` → `contacted` → `demo_scheduled` → `trial_started` → `negotiation` → `won` / `lost`).
- **Promotional Coupons:** Create percentage or fixed-amount (`IQD` / `USD`) discount codes with redemption limits.
- **Support Desk:** Read and reply to company support tickets and mark them `resolved`.
