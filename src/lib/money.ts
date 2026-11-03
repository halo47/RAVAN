export type Currency = 'IQD' | 'USD';

export interface LedgerPaymentItem {
  entryType: 'payment' | 'refund' | 'adjustment';
  amount: number;
  currency: Currency;
}

export interface LedgerBookingItem {
  status: string;
  totalAmount: number;
  paidAmount: number;
  currency: Currency;
}

export interface LedgerExpenseItem {
  amount: number;
  currency: Currency;
}

export interface CurrencyFinancialSummary {
  currency: Currency;
  recognizedRevenue: number;
  collectedAmount: number;
  refundedAmount: number;
  outstandingBalance: number;
  totalExpenses: number;
  netProfit: number;
}

export function formatMoney(amount: number, currency: Currency, locale: 'ku' | 'ar' | 'en' = 'ku'): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formattedNumber = new Intl.NumberFormat(
    locale === 'en' ? 'en-US' : locale === 'ar' ? 'ar-IQ' : 'ckb-IQ',
    { maximumFractionDigits: 0 }
  ).format(safeAmount);

  if (currency === 'USD') {
    return locale === 'en' ? `$${formattedNumber} USD` : `${formattedNumber} USD`;
  }
  return `${formattedNumber} IQD`;
}

export function calculateBookingNetPaid(
  entries: LedgerPaymentItem[],
  bookingCurrency: Currency
): number {
  let netPaid = 0;
  for (const entry of entries) {
    if (entry.currency !== bookingCurrency) {
      continue;
    }
    const amt = Math.round(Math.abs(entry.amount));
    if (entry.entryType === 'payment' || entry.entryType === 'adjustment') {
      netPaid += amt;
    } else if (entry.entryType === 'refund') {
      netPaid -= amt;
    }
  }
  return Math.max(0, netPaid);
}

/**
 * Computes strictly separated financial summaries for IQD and USD.
 * Never adds IQD and USD together (Rule 9.7 & 11.2).
 */
export function calculateLedgerSummary(params: {
  bookings: LedgerBookingItem[];
  payments: LedgerPaymentItem[];
  expenses: LedgerExpenseItem[];
}): Record<Currency, CurrencyFinancialSummary> {
  const result: Record<Currency, CurrencyFinancialSummary> = {
    IQD: {
      currency: 'IQD',
      recognizedRevenue: 0,
      collectedAmount: 0,
      refundedAmount: 0,
      outstandingBalance: 0,
      totalExpenses: 0,
      netProfit: 0,
    },
    USD: {
      currency: 'USD',
      recognizedRevenue: 0,
      collectedAmount: 0,
      refundedAmount: 0,
      outstandingBalance: 0,
      totalExpenses: 0,
      netProfit: 0,
    },
  };

  for (const b of params.bookings) {
    const curr: Currency = b.currency === 'USD' ? 'USD' : 'IQD';
    if (b.status === 'approved' || b.status === 'completed' || b.status === 'pending') {
      result[curr].recognizedRevenue += Math.round(b.totalAmount);
      const unpaid = Math.max(0, Math.round(b.totalAmount) - Math.round(b.paidAmount));
      result[curr].outstandingBalance += unpaid;
    }
  }

  for (const p of params.payments) {
    const curr: Currency = p.currency === 'USD' ? 'USD' : 'IQD';
    const amt = Math.round(Math.abs(p.amount));
    if (p.entryType === 'payment' || p.entryType === 'adjustment') {
      result[curr].collectedAmount += amt;
    } else if (p.entryType === 'refund') {
      result[curr].refundedAmount += amt;
    }
  }

  for (const e of params.expenses) {
    const curr: Currency = e.currency === 'USD' ? 'USD' : 'IQD';
    result[curr].totalExpenses += Math.round(Math.abs(e.amount));
  }

  for (const curr of ['IQD', 'USD'] as const) {
    const netCollected = result[curr].collectedAmount - result[curr].refundedAmount;
    result[curr].netProfit = netCollected - result[curr].totalExpenses;
  }

  return result;
}
