import React from 'react';
import {
  ArrowLeft,
  Calendar,
  Compass,
  ExternalLink,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { formatMoney } from '../lib/money.ts';
import { formatBaghdadDateTime } from '../lib/dates.ts';
import { Locale } from '../lib/i18n.ts';

interface CompanyPublicPageProps {
  organization: any;
  trips: any[];
  locale: Locale;
  onSelectTrip: (code: string) => void;
  onExitPreview?: () => void;
}

export const CompanyPublicPage: React.FC<CompanyPublicPageProps> = ({
  organization,
  trips,
  locale,
  onSelectTrip,
  onExitPreview,
}) => {
  return (
    <div className="min-h-screen ravan-canvas text-[#F4F7FB] flex flex-col">
      <header className="sticky top-0 z-30 bg-[#070B12]/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#101C2E] border border-[#C8A76A]/45 flex items-center justify-center overflow-hidden shrink-0">
              {organization?.logoUrl ? (
                <img
                  src={organization.logoUrl}
                  alt={organization.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-mono font-bold text-sm text-[#D4B375]">
                  {(organization?.name || 'RV').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-[#F4F7FB]">
                  {organization?.name || 'پڕۆفایلی کۆمپانیای گەشتیاری'}
                </h1>
                <span className="px-2 py-0.5 rounded bg-[#C8A76A]/15 border border-[#C8A76A]/35 text-[10px] font-mono text-[#D4B375] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  OFFICIAL AGENCY
                </span>
              </div>
              <p className="text-xs text-[#9BA9BC]">
                {organization?.legalName || 'پەڕەی فەرمیی گەشتە بڵاوکراوەکانی کۆمپانیا'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {organization?.contactPhone && (
              <a
                href={`tel:${organization.contactPhone}`}
                className="ravan-btn-secondary px-3.5 py-2 rounded-xl text-xs font-mono flex items-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5 text-[#C8A76A]" />
                <span>{organization.contactPhone}</span>
              </a>
            )}
            {onExitPreview && (
              <button
                type="button"
                onClick={onExitPreview}
                className="ravan-btn-gold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>گەڕانەوە</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#F4F7FB] flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#C8A76A]" />
            <span>گەشتە بڵاوکراوەکانی {organization?.name} ({trips.length})</span>
          </h2>
        </div>

        {trips.length === 0 ? (
          <div className="ravan-panel rounded-3xl p-12 text-center text-sm text-[#9BA9BC]">
            لە ئێستادا هیچ گەشتێکی چالاک بۆ ئەم کۆمپانیایە نییە.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map((tr) => (
              <div
                key={tr.id}
                className="ravan-panel ravan-card-interactive rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-52 bg-[#070B12] overflow-hidden">
                    <img
                      src={tr.coverImageUrl || '/images/choman.svg'}
                      alt={tr.titleKu}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#070B12] via-transparent to-black/30" />
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-[#070B12]/85 border border-white/15 font-mono text-xs font-bold text-[#D4B375]">
                        {tr.code}
                      </span>
                      <span className="px-3 py-1 rounded-lg bg-[#070B12]/90 border border-[#C8A76A]/40 font-mono font-bold text-xs text-[#D4B375]">
                        {formatMoney(tr.priceAmount, tr.currency, locale)}
                      </span>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <h3 className="text-base font-bold text-[#F4F7FB]">{tr.titleKu}</h3>
                    <div className="space-y-1 text-xs text-[#9BA9BC]">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#C8A76A]" />
                        <span>{tr.destination}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-[#C8A76A]" />
                        <span>{formatBaghdadDateTime(tr.departureAt, locale)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          کورسی بەردەست: {tr.availableSeats} / {tr.totalCapacity}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 pt-0">
                  <button
                    type="button"
                    onClick={() => onSelectTrip(tr.code)}
                    className="ravan-btn-gold w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>کردنەوەی پەڕەی گەشت و ناو نووسین</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
