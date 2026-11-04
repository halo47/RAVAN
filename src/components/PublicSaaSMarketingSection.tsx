import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  HelpCircle,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { formatMoney } from '../lib/money.ts';
import { formatBaghdadDateTime } from '../lib/dates.ts';
import { Locale } from '../lib/i18n.ts';

interface PublicSaaSMarketingProps {
  locale: Locale;
  onSignIn: () => void;
  onOpenTripLink: (code: string) => void;
  onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

export const PublicSaaSMarketingSection: React.FC<PublicSaaSMarketingProps> = ({
  locale,
  onSignIn,
  onOpenTripLink,
  onMessage,
}) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [submittingDemo, setSubmittingDemo] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoForm, setDemoForm] = useState({
    companyName: '',
    contactName: '',
    phone: '+964750',
    email: '',
    city: 'Erbil',
    interestedPlan: 'professional',
    notes: '',
  });

  useEffect(() => {
    fetch('/api/public/saas-info')
      .then((r) => r.json())
      .then((data) => {
        if (data.plans) setPlans(data.plans);
      })
      .catch(() => {});
  }, []);

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingDemo(true);
    try {
      const res = await fetch('/api/public/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Demo request failed');
      setDemoSubmitted(true);
      onMessage({
        type: 'success',
        text: 'داواکاریی تاقیکردنەوەی سیستەم (Demo Request) بە سەرکەوتوویی تۆمار کرا!',
      });
    } catch (err: any) {
      onMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingDemo(false);
    }
  };

  return (
    <div className="space-y-10 text-xs mt-8">
      {/* Dynamic SaaS Subscription Plans Section (Driven by PostgreSQL subscription_plans) */}
      {plans.length > 0 && (
        <div className="ravan-surface rounded-3xl p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[#C8A76A] font-mono uppercase tracking-wider text-[11px] block">
                RAVAN COMMERCIAL SAAS PLANS
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#F4F7FB] mt-1">
                پلانەکانی بەشداری بۆ کۆمپانیاکانی گەشتوگوزار (١٤ ڕۆژ تاقیکردنەوەی بێبەرامبەر)
              </h2>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="ravan-btn-gold px-5 py-2.5 rounded-xl font-bold"
            >
              دەستپێکردنی تاقیکردنەوەی بێبەرامبەر (Start Free Trial)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((p) => (
              <div
                key={p.code}
                className="p-5 rounded-2xl bg-[#070B12]/80 border border-white/[0.08] flex flex-col justify-between space-y-4 hover:border-[#C8A76A]/50 transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F4F7FB]">{p.nameKu || p.nameEn}</h3>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#C8A76A]/15 text-[#D4B375]">
                      {p.trialDays || 14}d Trial
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9BA9BC] leading-relaxed">
                    {p.descriptionKu || p.description}
                  </p>
                  <div className="pt-2 border-t border-white/[0.06] font-mono">
                    <div className="text-lg font-bold text-[#D4B375]">
                      {formatMoney(p.proposedMonthlyIqd, 'IQD', locale)}
                      <span className="text-[10px] text-[#9BA9BC]"> / مانگ</span>
                    </div>
                    <div className="text-[11px] text-[#9BA9BC]">
                      یان {formatMoney(p.proposedMonthlyUsd, 'USD', locale)} / مانگ
                    </div>
                  </div>
                  <ul className="space-y-1 text-[11px] text-[#9BA9BC] pt-2">
                    <li>✓ تا {p.maxActiveTrips} گەشتی چالاک</li>
                    <li>✓ تا {p.maxUsers} هەژماری کارمەند</li>
                    <li>✓ تا {p.maxMonthlyBookings} حجزکردن لە مانگێکدا</li>
                    <li>✓ لینکی سەربەخۆ بۆ هەر گەشتێک</li>
                    <li>✓ دەفتەری ژمێریاریی IQD و USD</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onSignIn}
                  className="ravan-btn-secondary w-full py-2.5 rounded-xl font-bold text-[#D4B375]"
                >
                  هەڵبژاردنی پلان
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request Demo Form + Frequently Asked Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 ravan-panel rounded-3xl p-7 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C8A76A]" />
            <h3 className="text-base font-bold text-[#F4F7FB]">
              داواکردنی نمایشی ڕاستەوخۆ بۆ کۆمپانیاکەت (Request a Live Demo)
            </h3>
          </div>
          <p className="text-[#9BA9BC] leading-relaxed">
            زانیاریی کۆمپانیاکەت بنێرە تا تیمی فرۆشتنی RAVAN پەیوەندیت پێوە بکەن و هەژماری فەرمیی کۆمپانیاکەت بۆ چالاک بکەن.
          </p>

          {demoSubmitted ? (
            <div className="p-5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 space-y-2">
              <div className="font-bold flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>داواکارییەکەت گەیشتە بەشی فرۆشتنی RAVAN!</span>
              </div>
              <p className="text-xs">
                لە ماوەی کەمتر لە ٢ کاتژمێردا پەیوەندیت پێوە دەکرێت بۆ ڕێکخستنی پڕۆفایلی کۆمپانیاکەت.
              </p>
            </div>
          ) : (
            <form onSubmit={handleDemoSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#9BA9BC] mb-1">ناوی کۆمپانیای گەشتیاری *</label>
                <input
                  type="text"
                  required
                  placeholder="کۆمپانیای زاگرۆس..."
                  value={demoForm.companyName}
                  onChange={(e) => setDemoForm({ ...demoForm, companyName: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div>
                <label className="block text-[#9BA9BC] mb-1">ناوی بەڕێوەبەر / بەرپرس *</label>
                <input
                  type="text"
                  required
                  placeholder="ناوی سیانی"
                  value={demoForm.contactName}
                  onChange={(e) => setDemoForm({ ...demoForm, contactName: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div>
                <label className="block text-[#9BA9BC] mb-1">ژمارەی مۆبایل / واتسئەپ *</label>
                <input
                  type="text"
                  required
                  value={demoForm.phone}
                  onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[#9BA9BC] mb-1">شار</label>
                <input
                  type="text"
                  value={demoForm.city}
                  onChange={(e) => setDemoForm({ ...demoForm, city: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={submittingDemo}
                  className="ravan-btn-gold w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  {submittingDemo ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>ناردنی داواکاریی تاقیکردنەوە (Request Demo)</span>
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="lg:col-span-6 ravan-surface rounded-3xl p-7 space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#C8A76A]" />
            <h3 className="text-base font-bold text-[#F4F7FB]">
              پرسیارە باوەکان دەربارەی سیستەمی RAVAN (FAQ)
            </h3>
          </div>
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
              <span className="font-bold text-[#D4B375] block">
                ئایا کاتێک لینکی گەشتێک دەنێرم بۆ خەڵک، گەشتی کۆمپانیاکانی تر دەردەکەوێت؟
              </span>
              <p className="text-[#9BA9BC]">
                نەخێر بە هیچ شێوەیەک! هەر گەشتێک لینکی تایبەتی خۆی هەیە (`/?trip=CODE`) کە تەنها لۆگۆی کۆمپانیاکەی خۆت، وێنەی ئەو گەشتە، و فۆڕمی ناو نووسینی ئەو گەشتە پیشان دەدات.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
              <span className="font-bold text-[#D4B375] block">
                چۆن پارەی بەشداریی مانگانەی سیستەمەکە دەدرێت لە هەرێمی کوردستان و عێراق؟
              </span>
              <p className="text-[#9BA9BC]">
                لە ڕێگەی FIB، FastPay، حەواڵەی بانکی، یان پارەدانی کاش، و دەستبەجێ پسووڵەی فەرمیی (`INV-RVN-...`) بۆ کۆمپانیاکەت دەردەچێت.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#070B12]/70 border border-white/[0.06] space-y-1">
              <span className="font-bold text-[#D4B375] block">
                ئایا دەتوانین دینار (IQD) و دۆلار (USD) بەیەکەوە بەڕێوە ببەین؟
              </span>
              <p className="text-[#9BA9BC]">
                بەڵێ، سیستەمەکە دوو دەفتەری ژمێریاریی سەربەخۆی هەیە بۆ IQD و USD بەبێ ئەوەی ژمارەکانیان تێکەڵ بکات.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
