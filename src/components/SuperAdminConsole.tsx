import React, { useState } from 'react';
import {
  Bell,
  Building2,
  CreditCard,
  HelpCircle,
  Plus,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { formatMoney } from '../lib/money.ts';
import { formatBaghdadDateOnly } from '../lib/dates.ts';
import { Locale } from '../lib/i18n.ts';

interface SuperAdminConsoleProps {
  platformData: any;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  locale: Locale;
  onRefresh: () => Promise<void>;
  onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

export const SuperAdminConsole: React.FC<SuperAdminConsoleProps> = ({
  platformData,
  apiFetch,
  locale,
  onRefresh,
  onMessage,
}) => {
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [remindingOrgId, setRemindingOrgId] = useState<number | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});

  const [leadForm, setLeadForm] = useState({
    companyName: '',
    contactName: '',
    phone: '+964750',
    city: 'Erbil',
    interestedPlan: 'professional',
    estimatedDealValue: 65000,
    currency: 'IQD' as 'IQD' | 'USD',
    notes: '',
  });

  const [couponForm, setCouponForm] = useState({
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: 15,
    currency: 'IQD' as 'IQD' | 'USD',
    maxUses: 50,
  });

  const metrics = platformData.commercialMetrics || {};
  const activeSubCount = metrics.activeSubscribers ?? metrics.activeSubscribersCount ?? 0;
  const trialSubCount = metrics.trialCompanies ?? metrics.trialSubscribersCount ?? 0;
  const totalLeadsCount = metrics.totalLeads ?? metrics.totalLeadsCount ?? 0;
  const convertedLeadsCount = metrics.convertedLeads ?? metrics.wonLeadsCount ?? 0;
  const leadsList = platformData.salesLeads || platformData.leads || [];
  const ticketsList = platformData.supportTickets || [];

  const handleVerifyPayment = async (paymentId: number, decision: 'approved' | 'rejected') => {
    setVerifyingId(paymentId);
    try {
      await apiFetch(`/api/platform/subscription-payments/${paymentId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          reviewNotes:
            decision === 'approved' ? 'Approved by Super Admin' : 'Rejected by Super Admin',
        }),
      });
      await onRefresh();
      onMessage({
        type: 'success',
        text:
          decision === 'approved'
            ? 'پارەدانی بەشداری پەسەند کرا و ماوەی کۆمپانیا درێژ کرایەوە (Single-Extension Guard Active).'
            : 'پارەدانەکە ڕەتکرایەوە.',
      });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSendReminder = async (orgId: number, orgName: string) => {
    setRemindingOrgId(orgId);
    try {
      await apiFetch(`/api/platform/organizations/${orgId}/send-reminder`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await onRefresh();
      onMessage({
        type: 'success',
        text: `ئاگادارکردنەوەی نوێکردنەوەی بەشداری بۆ کۆمپانیای "${orgName}" نێردرا.`,
      });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setRemindingOrgId(null);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/platform/leads', {
        method: 'POST',
        body: JSON.stringify(leadForm),
      });
      setLeadForm({
        companyName: '',
        contactName: '',
        phone: '+964750',
        city: 'Erbil',
        interestedPlan: 'professional',
        estimatedDealValue: 65000,
        currency: 'IQD',
        notes: '',
      });
      await onRefresh();
      onMessage({ type: 'success', text: 'کۆمپانیای چاوەڕوانکراو (Sales Lead) زیاد کرا.' });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateLeadStatus = async (leadId: number, status: string) => {
    try {
      await apiFetch(`/api/platform/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
      onMessage({ type: 'success', text: `قۆناغی فرۆشتن گۆڕدرا بۆ ${status}.` });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/platform/coupons', {
        method: 'POST',
        body: JSON.stringify(couponForm),
      });
      setCouponForm({
        code: '',
        discountType: 'percentage',
        discountValue: 15,
        currency: 'IQD',
        maxUses: 50,
      });
      await onRefresh();
      onMessage({ type: 'success', text: 'کۆدی داشکاندنی نوێ دروست کرا.' });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    }
  };

  const handleReplyTicket = async (ticketId: number, status: string) => {
    try {
      await apiFetch(`/api/platform/support-tickets/${ticketId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          adminResponse: replyTextMap[ticketId] || 'چارەسەر کرا لەلایەن تیمی پاڵپشتیی RAVAN.',
        }),
      });
      await onRefresh();
      onMessage({ type: 'success', text: 'وەڵامی تیکتەکە نێردرا بۆ کۆمپانیا.' });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-8 text-xs">
      {/* 1. SaaS Commercial Revenue & Subscriber KPIs (IQD & USD Strictly Separated) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ravan-panel rounded-2xl p-5 space-y-1.5">
          <span className="text-[#9BA9BC] block">داهاتی مانگانەی دووبارەبوو (MRR — IQD & USD)</span>
          <div className="text-lg font-bold font-mono text-[#D4B375]">
            {formatMoney(metrics.mrrIqd || 0, 'IQD', locale)}
          </div>
          <div className="text-xs font-mono text-emerald-400">
            + {formatMoney(metrics.mrrUsd || 0, 'USD', locale)} / مانگانە
          </div>
        </div>

        <div className="ravan-panel rounded-2xl p-5 space-y-1.5">
          <span className="text-[#9BA9BC] block">داهاتی ساڵانەی پێشبینیکراو (ARR — IQD & USD)</span>
          <div className="text-lg font-bold font-mono text-[#F4F7FB]">
            {formatMoney(metrics.arrIqd || 0, 'IQD', locale)}
          </div>
          <div className="text-xs font-mono text-[#9BA9BC]">
            + {formatMoney(metrics.arrUsd || 0, 'USD', locale)} / ساڵانە
          </div>
        </div>

        <div className="ravan-panel rounded-2xl p-5 space-y-1.5">
          <span className="text-[#9BA9BC] block">پارەی وەرگیراوی بەشداری (Collected SaaS)</span>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {formatMoney(metrics.collectedIqd || 0, 'IQD', locale)}
          </div>
          <div className="text-xs font-mono text-[#9BA9BC]">
            USD: {formatMoney(metrics.collectedUsd || 0, 'USD', locale)} · چاوەڕوانی پەسەندکردن:{' '}
            <span className="text-amber-300">
              {formatMoney(metrics.pendingIqd || 0, 'IQD', locale)}
            </span>
          </div>
        </div>

        <div className="ravan-panel rounded-2xl p-5 space-y-1.5">
          <span className="text-[#9BA9BC] block">کۆمپانیا چالاکەکان · تاقیکردنەوە · فرۆشتن</span>
          <div className="text-lg font-bold font-mono text-[#F4F7FB]">
            {activeSubCount} چالاک · {trialSubCount} تاقیکاری
          </div>
          <div className="text-xs font-mono text-[#D4B375]">
            Sales Leads: {convertedLeadsCount}/{totalLeadsCount} · تیکت: {ticketsList.length}
          </div>
        </div>
      </div>

      {/* 2. Manual Subscription Payment Verification Queue (Single-Extension Guard) */}
      <div className="ravan-surface rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <h3 className="text-sm font-bold text-[#D4B375] flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            <span>
              پشکنین و پەسەندکردنی پارەدانی بەشداریی کۆمپانیاکان (Subscription Payment Verification)
            </span>
          </h3>
          <span className="font-mono text-[11px] text-[#9BA9BC]">
            Single-Extension Guard: extension_applied
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#9BA9BC] border-b border-white/[0.08]">
              <tr>
                <th className="py-2.5 text-start">ID · کۆمپانیا · پلان</th>
                <th className="py-2.5 text-start">ڕێگەی پارەدان · کۆدی حەواڵە</th>
                <th className="py-2.5 text-end">بڕی پارە · دراو</th>
                <th className="py-2.5 text-start">دۆخ · درێژکردنەوە</th>
                <th className="py-2.5 text-end">بڕیار (Approve / Reject)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {(platformData.subscriptionPayments || []).map((pay: any) => {
                const org = platformData.organizations.find(
                  (o: any) => o.id === pay.organizationId
                );
                return (
                  <tr key={pay.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <div className="font-bold text-[#F4F7FB]">
                        #{pay.id} · {org?.name || `Org #${pay.organizationId}`}
                      </div>
                      <div className="text-[11px] text-[#9BA9BC] font-mono">
                        پلان: {pay.planCode} ({pay.billingCycle})
                      </div>
                    </td>
                    <td className="py-3 font-mono">
                      <div className="text-[#D4B375]">{pay.transactionReference}</div>
                      <div className="text-[10px] text-[#9BA9BC]">
                        {pay.paymentMethod || pay.paymentMethodCode}
                      </div>
                    </td>
                    <td className="py-3 text-end font-mono font-bold text-[#F4F7FB]">
                      {formatMoney(pay.amount, pay.currency, locale)}
                    </td>
                    <td className="py-3 font-mono">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                          pay.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : pay.status === 'rejected'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {pay.status}
                      </span>
                      {pay.extensionApplied && (
                        <span className="ms-2 text-[10px] text-emerald-400">✓ Extended</span>
                      )}
                    </td>
                    <td className="py-3 text-end space-x-1.5 rtl:space-x-reverse">
                      {pay.status === 'pending_verification' ? (
                        <>
                          <button
                            type="button"
                            disabled={verifyingId === pay.id}
                            onClick={() => handleVerifyPayment(pay.id, 'approved')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-bold"
                          >
                            پەسەندکردن و درێژکردنەوە
                          </button>
                          <button
                            type="button"
                            disabled={verifyingId === pay.id}
                            onClick={() => handleVerifyPayment(pay.id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/30 text-red-200"
                          >
                            ڕەتکردنەوە
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] font-mono text-[#9BA9BC]">تەواوکراوە</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Registered Travel Companies & Subscription Renewal Reminders */}
      <div className="ravan-surface rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#C8A76A]" />
          <span>
            کۆمپانیا تۆمارکراوەکانی سەکۆ و ناردنی بیرخستنەوەی نوێکردنەوە (
            {platformData.organizations.length})
          </span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#9BA9BC] border-b border-white/[0.08]">
              <tr>
                <th className="py-2.5 text-start">ID · ناوی کۆمپانیا</th>
                <th className="py-2.5 text-start">Slug · شار · دراو</th>
                <th className="py-2.5 text-start">پلان · کاتی کۆتایی بەشداری</th>
                <th className="py-2.5 text-start">دۆخ</th>
                <th className="py-2.5 text-end">کردارەکان</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {platformData.organizations.map((org: any) => {
                const sub = (platformData.subscriptions || []).find(
                  (s: any) => s.organizationId === org.id
                );
                return (
                  <tr key={org.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 font-semibold text-[#F4F7FB]">
                      #{org.id} · {org.name}
                    </td>
                    <td className="py-3 font-mono text-[#9BA9BC]">
                      @{org.slug} · {org.city || 'Erbil'} · {org.defaultCurrency}
                    </td>
                    <td className="py-3 font-mono">
                      <span className="text-[#D4B375] uppercase">{sub?.planCode || 'starter'}</span>{' '}
                      ·{' '}
                      <span className="text-[#9BA9BC]">
                        {formatBaghdadDateOnly(sub?.endDate || sub?.currentPeriodEnd, locale)}
                      </span>
                    </td>
                    <td className="py-3 font-mono uppercase text-[#D4B375]">{org.status}</td>
                    <td className="py-3 text-end space-x-2 rtl:space-x-reverse">
                      <button
                        type="button"
                        disabled={remindingOrgId === org.id}
                        onClick={() => handleSendReminder(org.id, org.name)}
                        className="ravan-btn-secondary px-3 py-1.5 rounded-lg text-[#D4B375] inline-flex items-center gap-1"
                      >
                        <Bell className="w-3 h-3" />
                        <span>بیرخستنەوەی نوێکردنەوە</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const nextStatus = org.status === 'suspended' ? 'active' : 'suspended';
                          await apiFetch(`/api/platform/organizations/${org.id}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: nextStatus }),
                          });
                          await onRefresh();
                        }}
                        className="ravan-btn-secondary px-3 py-1.5 rounded-lg"
                      >
                        {org.status === 'suspended' ? 'چالاککردنەوە' : 'ڕاگرتن'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Sales CRM Pipeline & Promotional Coupons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Sales CRM Pipeline */}
        <div className="lg:col-span-7 ravan-surface rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#C8A76A]" />
            <span>بەڕێوەبردنی فرۆشتن و داواکارییەکانی تاقیکردنەوە (Sales & Leads CRM)</span>
          </h3>

          <form onSubmit={handleCreateLead} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              required
              placeholder="ناوی کۆمپانیا *"
              value={leadForm.companyName}
              onChange={(e) => setLeadForm({ ...leadForm, companyName: e.target.value })}
              className="ravan-input rounded-xl px-3 py-2"
            />
            <input
              type="text"
              required
              placeholder="ناوی بەرپرس *"
              value={leadForm.contactName}
              onChange={(e) => setLeadForm({ ...leadForm, contactName: e.target.value })}
              className="ravan-input rounded-xl px-3 py-2"
            />
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="+964750..."
                value={leadForm.phone}
                onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                className="ravan-input rounded-xl px-3 py-2 font-mono flex-1"
              />
              <button type="submit" className="ravan-btn-gold px-3.5 py-2 rounded-xl">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pe-1">
            {leadsList.map((lead: any) => (
              <div
                key={lead.id}
                className="p-3.5 rounded-xl bg-[#070B12]/80 border border-white/[0.07] flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-[#F4F7FB]">
                    {lead.companyName} · <span className="text-[#D4B375]">{lead.contactName}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#9BA9BC]">
                    📞 {lead.phone} · {lead.city} · پلان: {lead.interestedPlan}
                  </div>
                </div>
                <select
                  value={lead.status || lead.stage || 'new'}
                  onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}
                  className="ravan-input rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-[#D4B375]"
                >
                  <option value="new">New Lead</option>
                  <option value="contacted">Contacted</option>
                  <option value="demo_scheduled">Demo Scheduled</option>
                  <option value="trial_started">Trial Started</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="converted">Converted (Won)</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Right 5 Cols: Promotional Coupons Manager */}
        <div className="lg:col-span-5 ravan-surface rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#C8A76A]" />
            <span>کۆدەکانی داشکاندن (Promotional Coupons)</span>
          </h3>

          <form onSubmit={handleCreateCoupon} className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              placeholder="کۆد (بۆ نموونە VIP25)"
              value={couponForm.code}
              onChange={(e) =>
                setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })
              }
              className="ravan-input rounded-xl px-3 py-2 font-mono text-[#D4B375]"
            />
            <select
              value={couponForm.discountType}
              onChange={(e) =>
                setCouponForm({ ...couponForm, discountType: e.target.value as any })
              }
              className="ravan-input rounded-xl px-3 py-2"
            >
              <option value="percentage">ڕێژەی سەدی (%)</option>
              <option value="fixed">بڕی جێگیر (IQD)</option>
            </select>
            <input
              type="number"
              min={1}
              required
              value={couponForm.discountValue}
              onChange={(e) =>
                setCouponForm({ ...couponForm, discountValue: Number(e.target.value) })
              }
              className="ravan-input rounded-xl px-3 py-2 font-mono"
            />
            <button type="submit" className="ravan-btn-gold rounded-xl py-2 font-bold">
              + دروستکردنی کۆپۆن
            </button>
          </form>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {(platformData.coupons || []).map((cp: any) => (
              <div
                key={cp.id}
                className="p-3 rounded-xl bg-[#070B12]/80 border border-white/[0.07] flex items-center justify-between font-mono"
              >
                <div>
                  <span className="font-bold text-[#D4B375]">{cp.code}</span>
                  <span className="text-[#9BA9BC] ms-2 text-[11px]">
                    ({cp.discountType}: {cp.discountValue})
                  </span>
                </div>
                <span className="text-[11px] text-emerald-400">
                  بەکارهاتوو: {cp.usedCount ?? cp.redeemedCount ?? 0}/
                  {cp.maxUses ?? cp.maxRedemptions ?? 50}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Support Tickets Admin Desk */}
      <div className="ravan-surface rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#C8A76A]" />
          <span>سەنتەری وەڵامدانەوەی تیکتەکانی پاڵپشتیی کۆمپانیاکان (Support Desk)</span>
        </h3>
        <div className="space-y-3">
          {ticketsList.map((tkt: any) => {
            const org = platformData.organizations.find((o: any) => o.id === tkt.organizationId);
            return (
              <div
                key={tkt.id}
                className="p-4 rounded-xl bg-[#070B12]/80 border border-white/[0.07] space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#F4F7FB]">
                    <span className="font-mono text-[#D4B375]">
                      {tkt.ticketCode || `#TKT-${tkt.id}`}
                    </span>{' '}
                    · <span>{org?.name || `Org #${tkt.organizationId}`}</span> — {tkt.subject}
                  </div>
                  <span className="px-2 py-0.5 rounded bg-white/[0.06] font-mono text-[10px] uppercase text-[#D4B375]">
                    {tkt.status} · {tkt.priority}
                  </span>
                </div>
                <p className="text-[#9BA9BC]">{tkt.description || tkt.message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="نووسینی وەڵامی فەرمی بۆ کۆمپانیا..."
                    value={replyTextMap[tkt.id] ?? tkt.adminResponse ?? ''}
                    onChange={(e) =>
                      setReplyTextMap((prev) => ({ ...prev, [tkt.id]: e.target.value }))
                    }
                    className="ravan-input flex-1 rounded-xl px-3.5 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => handleReplyTicket(tkt.id, 'resolved')}
                    className="ravan-btn-gold px-4 py-2 rounded-xl font-bold"
                  >
                    ناردنی وەڵام و داخستن (Resolve)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
