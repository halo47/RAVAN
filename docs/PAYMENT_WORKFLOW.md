# RAVAN — Payment & Financial Ledger Workflow (`PAYMENT_WORKFLOW.md`)

## 1. Two Distinct Payment Flows
RAVAN manages two completely separate financial domains:
1. **SaaS Subscription Payments (`subscription_invoices` & `subscription_payments`):**
   - Payments made by travel companies to RAVAN for their monthly/annual SaaS plan.
   - Supports Iraq/Kurdistan payment methods stored in `platform_payment_methods`:
     - `bank_transfer_iq`: FIB (`+964 750 111 2233`), FastPay, and RT Bank transfer.
     - `cash_office`: Direct cash payment to RAVAN sales representatives in Erbil / Sulaymaniyah / Duhok.
2. **Travel Company Customer Bookings & Trip Expenses (`payments` & `expenses`):**
   - Payments collected by each travel company from their passengers, plus operational expenses per trip.

---

## 2. Strict Dual-Currency Separation (`IQD` & `USD`)
- **Rule:** `IQD` (Iraqi Dinar) and `USD` (US Dollar) amounts are **never** added together or converted using guessed exchange rates.
- Every booking, payment, expense, subscription invoice, and commercial metric stores an explicit `currency` (`IQD` or `USD`) and integer `amount`.
- All dashboards (`GET /api/dashboard`, `GET /api/finance`, `GET /api/platform/overview`) return strictly separated `IQD` and `USD` ledgers.

---

## 3. Append-Only Customer Payment Ledger & Installments
- `payments` is an **append-only** ledger (`entry_type`: `'payment'`, `'refund'`, `'adjustment'`).
- When a payment or installment is recorded (`POST /api/payments` inside a DB transaction):
  - `netPaid = SUM(payment) + SUM(adjustment) - SUM(refund)` for that booking.
  - `bookings.paid_amount` is updated to `MAX(0, netPaid)`.
  - `outstanding_balance = MAX(0, total_amount - paid_amount)`.
  - Payment status transitions automatically: `unpaid` → `partially_paid` → `paid` (or `refunded`).

---

## 4. Trip Profitability Calculation
For each trip and currency (`IQD` / `USD`):
- `Recognized Revenue` = Sum of `total_amount` for non-cancelled bookings.
- `Collected Cash` = Sum of `payment` + `adjustment` - `refund` entries.
- `Trip Expenses` = Sum of `expenses` linked to `trip_id`.
- `Net Trip Profit` = `Collected Cash - Trip Expenses`.
