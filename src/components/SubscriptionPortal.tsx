import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  FileText,
  Printer,
  RefreshCw,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { formatMoney } from '../lib/money.ts';
import { formatBaghdadDateOnly } from '../lib/dates.ts';
import { Locale } from '../lib/i18n.ts';

interface SubscriptionPortalProps {
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  locale: Locale;
  onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

export const SubscriptionPortal: React.FC<SubscriptionPortalProps> = ({
  apiFetch,
  locale,
  onMessage,
}) => {
  const [subData, setSubData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [renewForm, setRenewForm] = useState({
    planCode: 'professional',
    billingCycle: 'monthly' as 'monthly' | 'annual',
    currency: 'IQD' as 'IQD' | 'USD',
    paymentMethod: 'manual_bank_transfer',
    transactionReference: '',
    couponCode: '',
    receiptNotes: '',
  });

  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const loadSubscription = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/subscription');
      setSubData(data);
      const activePlanCode = data.currentPlan?.code || data.plan?.code;
      if (activePlanCode) {
        setRenewForm((prev) => ({ ...prev, planCode: activePlanCode }));
      }
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  const handleSubmitRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/subscription/renew', {
        method: 'POST',
        body: JSON.stringify(renewForm),
      });
      await loadSubscription();
      setRenewForm((prev) => ({
        ...prev,
        transactionReference: '',
        couponCode: '',
        receiptNotes: '',
      }));
      onMessage({
        type: 'success',
        text: `داواکاریی نوێکردنەوەی بەشداری و پسووڵەی (${res.invoice?.invoiceNumber}) بە سەرکەوتوویی نێردرا بۆ پەسەندکردن.`,
      });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !subData) {
    return (
      <div className="ravan-surface rounded-2xl p-8 text-center text-xs text-[#9BA9BC]">
        <RefreshCw className="w-5 h-5 text-[#C8A76A] animate-spin mx-auto mb-2" />
        <span>بارکردنی زانیارییەکانی بەشداری و پلانی کۆمپانیا...</span>
      </div>
    );
  }

  if (!subData) return null;

  const {
    subscription,
    currentPlan,
    plan,
    plans = [],
    paymentMethods = [],
    invoices = [],
    usage = {},
  } = subData;
  const activePlan = currentPlan || plan;
  const selectedPlanObj = plans.find((p: any) => p.code === renewForm.planCode) || activePlan;

  const rawPrice = selectedPlanObj
    ? renewForm.currency === 'USD'
      ? renewForm.billingCycle === 'annual'
        ? selectedPlanObj.proposedAnnualUsd
        : selectedPlanObj.proposedMonthlyUsd
      : renewForm.billingCycle === 'annual'
      ? selectedPlanObj.proposedAnnualIqd
      : selectedPlanObj.proposedMonthlyIqd
    : 0;

  const activeTripsUsed = usage?.activeTripsCount ?? usage?.activeTrips ?? 0;
  const maxActiveTrips = usage?.maxActiveTrips ?? activePlan?.maxActiveTrips ?? 15;
  const membersUsed = usage?.membersCount ?? usage?.members ?? 1;
  const maxMembers = usage?.maxMembers ?? activePlan?.maxMembers ?? activePlan?.maxUsers ?? 5;
  const bookingsUsed = usage?.bookingsCount ?? usage?.monthlyBookings ?? 0;
  const maxBookings = usage?.maxMonthlyBookings ?? activePlan?.maxMonthlyBookings ?? 200;

  return (
    <div className="space-y-6 text-xs">
      {/* Current Subscription Status & Usage Limits Banner */}
      <div className="ravan-panel rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#C8A76A]" />
              <h3 className="text-sm font-bold text-[#F4F7FB]">
                پلانی بەشداریی کۆمپانیا لە RAVAN SaaS
              </h3>
              <span className="px-2.5 py-0.5 rounded-md bg-[#C8A76A]/20 border border-[#C8A76A]/40 font-mono font-bold text-[#D4B375] uppercase">
                {subscription?.status || 'trialing'}
              </span>
            </div>
            <p className="text-[#9BA9BC]">
              پلانی ئێستا:{' '}
              <strong className="text-[#F4F7FB]">
                {activePlan?.nameKu || activePlan?.nameEn || subscription?.planCode}
              </strong>{' '}
              · ڕێکەوتی کۆتایی:{' '}
              <strong className="text-[#D4B375] font-mono">
                {formatBaghdadDateOnly(
                  subscription?.endDate || subscription?.currentPeriodEnd,
                  locale
                )}
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={loadSubscription}
            className="ravan-btn-secondary px-3 py-1.5 rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>نوێکردنەوە</span>
          </button>
        </div>

        {/* Usage Progress Bars (Trips, Staff, Monthly Bookings) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#9BA9BC]">گەشتە چالاکەکان (Active Trips)</span>
              <span className="font-mono font-bold text-[#F4F7FB]">
                {activeTripsUsed} / {maxActiveTrips}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#101C2E] overflow-hidden">
              <div
                className="h-full bg-[#C8A76A] rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((activeTripsUsed / Math.max(1, maxActiveTrips)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#9BA9BC]">ئەندامانی ستاف (Staff Users)</span>
              <span className="font-mono font-bold text-[#F4F7FB]">
                {membersUsed} / {maxMembers}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#101C2E] overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((membersUsed / Math.max(1, maxMembers)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#9BA9BC]">حجزکردنی مانگانە (Monthly Bookings)</span>
              <span className="font-mono font-bold text-[#F4F7FB]">
                {bookingsUsed} / {maxBookings}
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#101C2E] overflow-hidden">
              <div
                className="h-full bg-[#547DA8] rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((bookingsUsed / Math.max(1, maxBookings)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Available Subscription Plans Grid (Dynamic from DB) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map((p: any) => {
          const isSelected = renewForm.planCode === p.code;
          const isCurrent = activePlan?.code === p.code;
          return (
            <div
              key={p.code}
              onClick={() => setRenewForm((prev) => ({ ...prev, planCode: p.code }))}
              className={`rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between space-y-4 border ${
                isSelected
                  ? 'bg-[#101C2E] border-[#C8A76A] shadow-lg'
                  : 'bg-[#0B1320]/80 border-white/[0.08] hover:border-white/20'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#F4F7FB]">{p.nameKu || p.nameEn}</span>
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                      پلانی ئێستا
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#9BA9BC] leading-relaxed">
                  {p.descriptionKu || p.description || 'پلانی بازرگانیی کۆمپانیای گەشتیاری'}
                </p>
                <div className="pt-2 border-t border-white/[0.06] space-y-1 font-mono">
                  <div className="text-base font-bold text-[#D4B375]">
                    {formatMoney(p.proposedMonthlyIqd, 'IQD', locale)}{' '}
                    <span className="text-[10px] text-[#9BA9BC]">/ مانگانە</span>
                  </div>
                  <div className="text-[11px] text-[#9BA9BC]">
                    یان {formatMoney(p.proposedMonthlyUsd, 'USD', locale)} / مانگانە
                  </div>
                </div>
                <ul className="space-y-1 text-[11px] text-[#9BA9BC] pt-2">
                  <li>✓ تا {p.maxActiveTrips} گەشتی چالاک</li>
                  <li>✓ تا {p.maxMembers ?? p.maxUsers ?? 10} ئەندامی ستاف</li>
                  <li>✓ تا {p.maxMonthlyBookings} حجزکردن لە مانگێکدا</li>
                  <li>✓ پاڵپشتی: {p.supportLevel}</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setRenewForm((prev) => ({ ...prev, planCode: p.code }))}
                className={`w-full py-2 rounded-xl font-bold ${
                  isSelected ? 'ravan-btn-gold' : 'ravan-btn-secondary'
                }`}
              >
                {isSelected ? 'هەڵبژێردراوە' : 'هەڵبژاردنی پلان'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Renewal Form + Invoices Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 6 Cols: Manual Payment & Renewal Submission */}
        <form
          onSubmit={handleSubmitRenewal}
          className="lg:col-span-6 ravan-surface rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#C8A76A]" />
              <span>داواکاریی نوێکردنەوە یان بەرزکردنەوەی پلان (Subscription Payment)</span>
            </h3>
          </div>

          {/* Payment Instructions from DB */}
          <div className="p-3.5 rounded-xl bg-[#070B12] border border-[#C8A76A]/30 space-y-2">
            <span className="font-bold text-[#D4B375] block">
              ڕێنمایی پارەدان لە عێراق و هەرێمی کوردستان:
            </span>
            {paymentMethods.map((pm: any) => (
              <div key={pm.code} className="text-[11px] text-[#9BA9BC]">
                <strong className="text-[#F4F7FB]">{pm.nameKu || pm.nameEn}:</strong>{' '}
                {pm.instructionsKu || pm.instructionsEn}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[#9BA9BC] mb-1">ماوەی بەشداری (Billing Cycle)</label>
              <select
                value={renewForm.billingCycle}
                onChange={(e) =>
                  setRenewForm({
                    ...renewForm,
                    billingCycle: e.target.value as 'monthly' | 'annual',
                  })
                }
                className="ravan-input w-full rounded-xl px-3.5 py-2.5"
              >
                <option value="monthly">مانگانە (٣٠ ڕۆژ)</option>
                <option value="annual">ساڵانە (٣٦٥ ڕۆژ — داشکاندنی تایبەت)</option>
              </select>
            </div>

            <div>
              <label className="block text-[#9BA9BC] mb-1">دراوی پارەدان (IQD / USD)</label>
              <select
                value={renewForm.currency}
                onChange={(e) =>
                  setRenewForm({ ...renewForm, currency: e.target.value as 'IQD' | 'USD' })
                }
                className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
              >
                <option value="IQD">IQD — دیناری عێراقی</option>
                <option value="USD">USD — دۆلاری ئەمریکی</option>
              </select>
            </div>

            <div>
              <label className="block text-[#9BA9BC] mb-1">ڕێگەی پارەدان</label>
              <select
                value={renewForm.paymentMethod}
                onChange={(e) =>
                  setRenewForm({ ...renewForm, paymentMethod: e.target.value })
                }
                className="ravan-input w-full rounded-xl px-3.5 py-2.5"
              >
                {paymentMethods.map((pm: any) => (
                  <option key={pm.code} value={pm.code}>
                    {pm.nameKu || pm.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#9BA9BC] mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-[#C8A76A]" />
                <span>کۆدی داشکاندن (بۆ نموونە: RAVAN20)</span>
              </label>
              <input
                type="text"
                placeholder="RAVAN20 یان WELCOME10K"
                value={renewForm.couponCode}
                onChange={(e) =>
                  setRenewForm({ ...renewForm, couponCode: e.target.value.toUpperCase() })
                }
                className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono text-[#D4B375]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[#9BA9BC] mb-1">
                ژمارەی حەواڵە / کۆدی وەسڵی پارەدان (Transaction Reference) *
              </label>
              <input
                type="text"
                required
                placeholder="FIB-99887766 یان ژمارەی وەسڵی کاش"
                value={renewForm.transactionReference}
                onChange={(e) =>
                  setRenewForm({ ...renewForm, transactionReference: e.target.value })
                }
                className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#070B12] border border-white/[0.08] flex items-center justify-between">
            <span className="text-[#9BA9BC]">بڕی پارەی پلان پێش داشکاندن:</span>
            <span className="font-mono font-bold text-sm text-[#D4B375]">
              {formatMoney(rawPrice, renewForm.currency, locale)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="ravan-btn-gold w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>ناردنی زانیاریی پارەدان و دەرکردنی پسووڵە (Invoice)</span>
          </button>
        </form>

        {/* Right 6 Cols: Subscription Invoices & Payment History */}
        <div className="lg:col-span-6 ravan-surface rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#C8A76A]" />
              <span>پسووڵەکانی بەشداری و مێژووی پارەدان ({invoices.length})</span>
            </h3>
          </div>

          {invoices.length === 0 ? (
            <div className="p-6 text-center text-[#9BA9BC]">
              هیچ پسووڵەیەکی بەشداری تۆمار نەکراوە.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pe-1">
              {invoices.map((inv: any) => {
                const totalAmt = inv.finalAmount ?? inv.totalAmount ?? 0;
                const origAmt = inv.originalAmount ?? inv.amount ?? totalAmt;
                const issuedDate = inv.issueDate || inv.issuedAt || inv.createdAt;
                return (
                  <div
                    key={inv.id}
                    className="p-3.5 rounded-xl bg-[#070B12]/70 border border-white/[0.07] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-mono font-bold text-[#D4B375] flex items-center gap-2">
                        <span>{inv.invoiceNumber}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                            inv.status === 'paid'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#9BA9BC] mt-0.5">
                        پلان: {inv.planCode} ({inv.billingCycle}) ·{' '}
                        {formatBaghdadDateOnly(issuedDate, locale)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-end font-mono">
                        <div className="font-bold text-[#F4F7FB]">
                          {formatMoney(totalAmt, inv.currency, locale)}
                        </div>
                        {inv.discountAmount > 0 && (
                          <div className="text-[10px] text-emerald-400">
                            داشکاندن: {formatMoney(inv.discountAmount, inv.currency, locale)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedInvoice({
                            ...inv,
                            origAmt,
                            totalAmt,
                            issuedDate,
                          })
                        }
                        className="ravan-btn-secondary px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#C8A76A]" />
                        <span>پسووڵە</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Printable Invoice Preview Card */}
          {selectedInvoice && (
            <div className="p-4 rounded-2xl bg-[#070B12] border border-[#C8A76A]/45 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <span className="font-mono font-bold text-[#D4B375] block">
                    RAVAN SAAS INVOICE · {selectedInvoice.invoiceNumber}
                  </span>
                  <span className="text-[10px] text-[#9BA9BC]">
                    بەرواری دەرچوون: {formatBaghdadDateOnly(selectedInvoice.issuedDate, locale)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="ravan-btn-gold px-3 py-1 rounded-lg text-[11px] flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" />
                  <span>چاپکردن</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div className="text-[#9BA9BC]">پلانی هەڵبژێردراو:</div>
                <div className="text-end text-[#F4F7FB] uppercase">{selectedInvoice.planCode}</div>
                <div className="text-[#9BA9BC]">بڕی سەرەکی:</div>
                <div className="text-end text-[#F4F7FB]">
                  {formatMoney(selectedInvoice.origAmt, selectedInvoice.currency, locale)}
                </div>
                <div className="text-[#9BA9BC]">داشکاندن:</div>
                <div className="text-end text-emerald-400">
                  -{formatMoney(selectedInvoice.discountAmount || 0, selectedInvoice.currency, locale)}
                </div>
                <div className="text-[#9BA9BC] font-bold">کۆی گشتی:</div>
                <div className="text-end font-bold text-[#D4B375]">
                  {formatMoney(selectedInvoice.totalAmt, selectedInvoice.currency, locale)}
                </div>
                <div className="text-[#9BA9BC]">دۆخی پسووڵە:</div>
                <div className="text-end uppercase text-emerald-300">{selectedInvoice.status}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
