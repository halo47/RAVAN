import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  HelpCircle,
  MessageSquarePlus,
  RefreshCw,
  Send,
} from 'lucide-react';
import { formatBaghdadDateTime } from '../lib/dates.ts';
import { Locale } from '../lib/i18n.ts';

interface ReportsAndSupportViewProps {
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  locale: Locale;
  onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

export const ReportsAndSupportView: React.FC<ReportsAndSupportViewProps> = ({
  apiFetch,
  locale,
  onMessage,
}) => {
  const [reportsData, setReportsData] = useState<any | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'technical',
    priority: 'normal',
    description: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [repRes, tktRes] = await Promise.all([
        apiFetch('/api/reports'),
        apiFetch('/api/support-tickets'),
      ]);
      setReportsData(repRes);
      setTickets(tktRes.tickets || []);
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleExportBookingsCsv = () => {
    if (!reportsData?.bookings) return;
    const headers = [
      'BookingCode',
      'TripId',
      'CustomerId',
      'PassengerCount',
      'TotalAmount',
      'PaidAmount',
      'Currency',
      'Status',
      'PickupPoint',
    ];
    const rows = reportsData.bookings.map((b: any) =>
      [
        b.bookingCode,
        b.tripId,
        b.customerId,
        b.passengerCount,
        b.totalAmount,
        b.paidAmount,
        b.currency,
        b.status,
        `"${(b.pickupPointName || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ravan-bookings-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFinanceCsv = () => {
    if (!reportsData?.payments) return;
    const headers = [
      'ID',
      'BookingId',
      'EntryType',
      'Amount',
      'Currency',
      'PaymentMethod',
      'ReferenceCode',
      'ReceivedAt',
    ];
    const rows = reportsData.payments.map((p: any) =>
      [
        p.id,
        p.bookingId,
        p.entryType,
        p.amount,
        p.currency,
        p.paymentMethod,
        `"${(p.referenceCode || '').replace(/"/g, '""')}"`,
        p.receivedAt || p.createdAt,
      ].join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ravan-finance-ledger-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTicket(true);
    try {
      const res = await apiFetch('/api/support-tickets', {
        method: 'POST',
        body: JSON.stringify(ticketForm),
      });
      setTicketForm({ subject: '', category: 'technical', priority: 'normal', description: '' });
      await loadAll();
      onMessage({
        type: 'success',
        text: `داواکاریی پاڵپشتیی تەکنیکی (#${res.ticket?.id}) نێردرا بۆ تیمی سەرپەرشتیاری RAVAN.`,
      });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingTicket(false);
    }
  };

  const totalTrips = reportsData?.summary?.totalTrips ?? reportsData?.totalTrips ?? 0;
  const totalBookings = reportsData?.summary?.totalBookings ?? reportsData?.totalBookings ?? 0;
  const cancellationRate =
    reportsData?.summary?.cancellationRate ?? reportsData?.cancellationRatePct ?? 0;
  const totalCustomers = reportsData?.summary?.totalCustomers ?? reportsData?.totalCustomers ?? 0;

  return (
    <div className="space-y-8 text-xs">
      {/* Reports & CSV Export Section */}
      <div className="ravan-panel rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#C8A76A]" />
            <h3 className="text-sm font-bold text-[#F4F7FB]">
              ڕاپۆرتی گشتی، ئاماری شوێنەکان و هەناردەکردنی داتا (Reports & CSV Export)
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportBookingsCsv}
              className="ravan-btn-gold px-3.5 py-2 rounded-xl flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>داگرتنی ڕاپۆرتی حجزکردنەکان (CSV)</span>
            </button>
            <button
              type="button"
              onClick={handleExportFinanceCsv}
              className="ravan-btn-secondary px-3.5 py-2 rounded-xl flex items-center gap-1.5 text-[#D4B375]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>داگرتنی دەفتەری ژمێریاری (CSV)</span>
            </button>
          </div>
        </div>

        {loading && !reportsData ? (
          <div className="p-6 text-center text-[#9BA9BC]">بارکردنی ڕاپۆرتەکان...</div>
        ) : (
          reportsData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
                <span className="text-[#9BA9BC] block">کۆی گەشتەکانی کۆمپانیا</span>
                <span className="text-xl font-bold font-mono text-[#F4F7FB]">{totalTrips}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
                <span className="text-[#9BA9BC] block">کۆی حجزکردنەکان</span>
                <span className="text-xl font-bold font-mono text-[#D4B375]">{totalBookings}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
                <span className="text-[#9BA9BC] block">ڕێژەی هەڵوەشاندنەوە (Cancellation Rate)</span>
                <span className="text-xl font-bold font-mono text-amber-300">
                  {cancellationRate}%
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
                <span className="text-[#9BA9BC] block">کۆی کڕیارانی تۆمارکراو</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {totalCustomers}
                </span>
              </div>
            </div>
          )
        )}

        {/* Popular Destinations Breakdown */}
        {reportsData?.popularDestinations?.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <h4 className="font-bold text-[#D4B375]">
              پڕفرۆشترین شوێنەکانی گەشت (Popular Destinations)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {reportsData.popularDestinations.map((dest: any) => (
                <div
                  key={dest.destination}
                  className="p-3.5 rounded-xl bg-[#070B12]/80 border border-white/[0.07] flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-[#F4F7FB]">{dest.destination}</div>
                    <div className="text-[11px] text-[#9BA9BC] font-mono">
                      {dest.tripCount ?? dest.trips ?? 1} گەشت
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#C8A76A]/15 font-mono font-bold text-[#D4B375]">
                    {dest.passengerCount ?? dest.passengers ?? 0} گەشتیار
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Company Support Ticket Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmitTicket}
          className="lg:col-span-5 ravan-surface rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
            <MessageSquarePlus className="w-4 h-4 text-[#C8A76A]" />
            <h3 className="text-sm font-bold text-[#F4F7FB]">
              ناردنی داواکاریی پاڵپشتی بۆ تیمی RAVAN (Support Ticket)
            </h3>
          </div>

          <div>
            <label className="block text-[#9BA9BC] mb-1">بابەتی داواکاری *</label>
            <input
              type="text"
              required
              placeholder="بۆ نموونە: پرسیار دەربارەی نوێکردنەوەی پلان یان زیادکردنی کارمەند"
              value={ticketForm.subject}
              onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
              className="ravan-input w-full rounded-xl px-3.5 py-2.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#9BA9BC] mb-1">بەش (Category)</label>
              <select
                value={ticketForm.category}
                onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                className="ravan-input w-full rounded-xl px-3.5 py-2.5"
              >
                <option value="technical">تەکنیکی (Technical)</option>
                <option value="billing">بەشداری و پارەدان (Billing)</option>
                <option value="operations">گەشت و حجزکردن (Operations)</option>
              </select>
            </div>
            <div>
              <label className="block text-[#9BA9BC] mb-1">گرنگی (Priority)</label>
              <select
                value={ticketForm.priority}
                onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                className="ravan-input w-full rounded-xl px-3.5 py-2.5"
              >
                <option value="normal">ئاسایی (Normal)</option>
                <option value="high">گرنگ (High)</option>
                <option value="urgent">خێرا (Urgent)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[#9BA9BC] mb-1">وردەکاریی نامە *</label>
            <textarea
              rows={3}
              required
              placeholder="کێشەکەت یان داواکارییەکەت لێرە بنووسە..."
              value={ticketForm.description}
              onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
              className="ravan-input w-full rounded-xl p-3"
            />
          </div>

          <button
            type="submit"
            disabled={submittingTicket}
            className="ravan-btn-gold w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {submittingTicket ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>ناردنی تیکتی پاڵپشتی</span>
          </button>
        </form>

        <div className="lg:col-span-7 ravan-surface rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-[#F4F7FB] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#C8A76A]" />
              <span>مێژووی تیکتەکانی پاڵپشتیی کۆمپانیا ({tickets.length})</span>
            </h3>
          </div>

          {tickets.length === 0 ? (
            <div className="p-8 text-center text-[#9BA9BC]">
              هیچ تیکتێکی پاڵپشتی تۆمار نەکراوە.
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pe-1">
              {tickets.map((tkt) => (
                <div
                  key={tkt.id}
                  className="p-4 rounded-xl bg-[#070B12]/80 border border-white/[0.07] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-[#F4F7FB] flex items-center gap-2">
                      <span className="font-mono text-[#D4B375]">
                        {tkt.ticketCode || `#TKT-${tkt.id}`}
                      </span>
                      <span>· {tkt.subject}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase ${
                        tkt.status === 'resolved'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {tkt.status}
                    </span>
                  </div>
                  <p className="text-[#9BA9BC] leading-relaxed">
                    {tkt.description || tkt.message}
                  </p>
                  {tkt.adminResponse && (
                    <div className="p-3 rounded-lg bg-[#101C2E] border border-[#C8A76A]/35 text-[#F4F7FB]">
                      <span className="font-bold text-[#D4B375] block mb-0.5">
                        وەڵامی تیمی پاڵپشتیی RAVAN:
                      </span>
                      <span>{tkt.adminResponse}</span>
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-[#9BA9BC]">
                    {formatBaghdadDateTime(tkt.createdAt, locale)} · بەش: {tkt.category}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
