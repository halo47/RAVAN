# TEST PLAN & QUALITY GATES — RAVAN

## 1. Testing Strategy

RAVAN enforces four testing layers to guarantee multi-tenant isolation, currency accuracy, and capacity safety:

### 1.1 Unit Tests (`tests/unit/core.test.ts` — Executed via Vitest)
- **Money & Currency Ledger Math:**
  - Verifies `IQD` and `USD` formatting (`formatMoney`).
  - Verifies multi-currency ledger aggregation (`calculateLedgerSummary`) never mixes `IQD` and `USD` totals, accurately deducts refunds and expenses, and computes net profit per currency.
- **Date & Timezone Formatting:**
  - Verifies UTC timestamps format accurately in `Asia/Baghdad` timezone across `ku`, `ar`, and `en`.
- **RBAC & Permission Matrix:**
  - Verifies role permissions (`company_owner`, `company_manager`, `booking_agent`, `accountant`, `tour_guide`, `customer`, `platform_super_admin`).
  - Verifies deactivated memberships immediately lose all permissions.
  - Verifies self-role-elevation guard (`canModifyMemberRole`) blocks any user from escalating their own role.
- **Validation & Normalization:**
  - Verifies Iraqi/international phone normalization (`0750...` -> `+964750...`) and Zod input schemas.
- **Booking Capacity & State Transitions:**
  - Verifies `computeSeatDelta` across `on_pending` and `on_approved` reservation policies and prevents overbooking when `passengerCount > availableSeats`.
- **Subscription Entitlements:**
  - Verifies active trip limits and member limits per subscription tier and blocks mutations when a subscription is `expired` or `suspended`.

### 1.2 Database & Integration Verification
- Verifies all 21 PostgreSQL tables and columns via `information_schema.columns` on Cloud SQL (`europe-west2`).
- Verifies multi-tenant isolation between Tenant A (`RAVAN Demo Travel`) and Tenant B (`Zagros Horizon Tours`).

### 1.3 End-to-End (E2E) Scenarios
- **Status:** Automated browser Playwright execution in CI requires a live headless browser container (`BLOCKED` inside hermetic build check without display server; verified via unit/integration suite and interactive live preview).
