import { describe, expect, it } from 'vitest';
import {
  calculateBookingNetPaid,
  calculateLedgerSummary,
  formatMoney,
} from '../../src/lib/money.ts';
import {
  canModifyMemberRole,
  checkSubscriptionEntitlement,
  computeSeatDelta,
  hasPermission,
} from '../../src/lib/permissions.ts';
import {
  isValidInternationalPhone,
  normalizePhoneNumber,
  validateDryRunImport,
} from '../../src/lib/validation.ts';
import { formatBaghdadDateOnly } from '../../src/lib/dates.ts';

describe('RAVAN Core Domain & Security Suite', () => {
  describe('1. Currency-Separated Money & Ledger Calculations', () => {
    it('never mixes IQD and USD in calculateLedgerSummary', () => {
      const summary = calculateLedgerSummary({
        bookings: [
          { status: 'approved', totalAmount: 300000, paidAmount: 200000, currency: 'IQD' },
          { status: 'approved', totalAmount: 1000, paidAmount: 600, currency: 'USD' },
          { status: 'cancelled', totalAmount: 500000, paidAmount: 0, currency: 'IQD' },
        ],
        payments: [
          { entryType: 'payment', amount: 250000, currency: 'IQD' },
          { entryType: 'refund', amount: 50000, currency: 'IQD' },
          { entryType: 'payment', amount: 600, currency: 'USD' },
        ],
        expenses: [
          { amount: 75000, currency: 'IQD' },
          { amount: 200, currency: 'USD' },
        ],
      });

      // IQD assertions
      expect(summary.IQD.recognizedRevenue).toBe(300000);
      expect(summary.IQD.collectedAmount).toBe(250000);
      expect(summary.IQD.refundedAmount).toBe(50000);
      expect(summary.IQD.outstandingBalance).toBe(100000);
      expect(summary.IQD.totalExpenses).toBe(75000);
      expect(summary.IQD.netProfit).toBe(125000); // (250k - 50k) - 75k

      // USD assertions
      expect(summary.USD.recognizedRevenue).toBe(1000);
      expect(summary.USD.collectedAmount).toBe(600);
      expect(summary.USD.outstandingBalance).toBe(400);
      expect(summary.USD.totalExpenses).toBe(200);
      expect(summary.USD.netProfit).toBe(400); // 600 - 200
    });

    it('calculates net booking paid amount accurately with refunds and adjustments', () => {
      const netIqd = calculateBookingNetPaid(
        [
          { entryType: 'payment', amount: 150000, currency: 'IQD' },
          { entryType: 'refund', amount: 25000, currency: 'IQD' },
          { entryType: 'payment', amount: 500, currency: 'USD' }, // ignored due to currency mismatch
        ],
        'IQD'
      );
      expect(netIqd).toBe(125000);
    });

    it('formats IQD and USD strings cleanly', () => {
      expect(formatMoney(65000, 'IQD', 'en')).toContain('65,000 IQD');
      expect(formatMoney(480, 'USD', 'en')).toBe('$480 USD');
    });
  });

  describe('2. RBAC & Self-Privilege-Elevation Protection', () => {
    it('enforces role permissions and blocks deactivated members', () => {
      const activeAgent = { role: 'booking_agent' as const, status: 'active' };
      const deactivatedOwner = { role: 'company_owner' as const, status: 'deactivated' };
      const activeAccountant = { role: 'accountant' as const, status: 'active' };

      expect(hasPermission(activeAgent, 'bookings.create')).toBe(true);
      expect(hasPermission(activeAgent, 'finance.manage')).toBe(false);
      expect(hasPermission(activeAccountant, 'finance.manage')).toBe(true);
      expect(hasPermission(activeAccountant, 'trips.create')).toBe(false);
      expect(hasPermission(deactivatedOwner, 'organization.read')).toBe(false);
    });

    it('blocks staff members from modifying or elevating their own role', () => {
      const ownerCtx = { role: 'company_owner' as const, status: 'active' };
      const selfAttempt = canModifyMemberRole({
        actorUid: 'uid-123',
        actorMembership: ownerCtx,
        targetUserUid: 'uid-123',
        newRole: 'company_owner',
      });
      expect(selfAttempt.allowed).toBe(false);

      const validChange = canModifyMemberRole({
        actorUid: 'uid-owner',
        actorMembership: ownerCtx,
        targetUserUid: 'uid-staff',
        newRole: 'accountant',
      });
      expect(validChange.allowed).toBe(true);
    });
  });

  describe('3. Booking Capacity Concurrency & Seat Delta Math', () => {
    it('prevents overbooking when requested seats exceed available seats', () => {
      const res = computeSeatDelta({
        passengerCount: 6,
        currentlyReserved: false,
        targetStatus: 'approved',
        seatReserveMode: 'on_approved',
        availableSeats: 4,
      });
      expect(res.error).toBeDefined();
      expect(res.seatDelta).toBe(0);
    });

    it('releases seats when a reserved booking is cancelled', () => {
      const res = computeSeatDelta({
        passengerCount: 4,
        currentlyReserved: true,
        targetStatus: 'cancelled',
        seatReserveMode: 'on_pending',
        availableSeats: 10,
      });
      expect(res.error).toBeUndefined();
      expect(res.seatDelta).toBe(-4);
      expect(res.nextSeatsReserved).toBe(false);
    });
  });

  describe('4. Phone Normalization, Subscription Limits & Dry-Run Validator', () => {
    it('normalizes local Kurdistan/Iraq numbers to +964 E.164 format', () => {
      expect(normalizePhoneNumber('0750 123 4567')).toBe('+9647501234567');
      expect(normalizePhoneNumber('009647709998877')).toBe('+9647709998877');
      expect(isValidInternationalPhone('07501234567')).toBe(true);
    });

    it('blocks resource creation when subscription is expired or over limit', () => {
      const expired = checkSubscriptionEntitlement({
        subscriptionStatus: 'expired',
        currentCount: 2,
        maxLimit: 10,
        resourceName: 'trips',
      });
      expect(expired.allowed).toBe(false);

      const overLimit = checkSubscriptionEntitlement({
        subscriptionStatus: 'active',
        currentCount: 10,
        maxLimit: 10,
        resourceName: 'trips',
      });
      expect(overLimit.allowed).toBe(false);
    });

    it('validates dry-run import rows without mutating database state', () => {
      const report = validateDryRunImport([
        { customerName: 'Dara Ahmed', phone: '07501112233', amount: 50000, currency: 'IQD' },
        { customerName: 'X', phone: 'invalid', amount: -10, currency: 'EUR' },
      ]);
      expect(report.validCount).toBe(1);
      expect(report.invalidCount).toBe(1);
      expect(report.issues.length).toBeGreaterThan(0);
    });

    it('formats UTC dates in Asia/Baghdad timezone', () => {
      const formatted = formatBaghdadDateOnly('2026-11-10T10:00:00Z', 'en', 'Asia/Baghdad');
      expect(formatted).toContain('2026');
    });
  });
});
