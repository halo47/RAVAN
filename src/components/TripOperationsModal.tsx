import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { formatBaghdadDateTime } from '../lib/dates.ts';
import { Locale } from '../lib/i18n.ts';

interface TripOperationsModalProps {
  trip: any;
  guides: any[];
  vehicles: any[];
  passengers: any[];
  bookings: any[];
  locale: Locale;
  onClose: () => void;
  onSaveTripDetails: (tripId: number, payload: any) => Promise<void>;
  onUpdateAttendance: (
    passengerId: number,
    attendanceStatus: 'pending' | 'present' | 'no_show',
    attendanceNotes?: string
  ) => Promise<void>;
}

const DEFAULT_CHECKLIST = [
  { key: 'bus_assigned', label: 'پاس / ئۆتۆمبێل دیاری کراوە (Bus Assigned)', done: false },
  { key: 'guide_assigned', label: 'ڕێبەری گەشت دیاری کراوە (Guide Assigned)', done: false },
  { key: 'hotel_confirmed', label: 'شوێنی مانەوە پشتڕاست کراوەتەوە (Hotel Confirmed)', done: false },
  { key: 'meals_arranged', label: 'خواردن و ژەمەکان ڕێکخراون (Meals Arranged)', done: false },
  { key: 'permits_ready', label: 'مۆڵەت و بازگەکان ئامادەن (Permits Ready)', done: false },
  {
    key: 'manifest_printed',
    label: 'لیستی ناوی گەشتیاران چاپ کراوە (Passenger List Verified)',
    done: false,
  },
  {
    key: 'emergency_contacts',
    label: 'ژمارەی فریاکەوتن پشتڕاست کراوەتەوە (Emergency Contacts Checked)',
    done: false,
  },
  {
    key: 'departure_confirmed',
    label: 'کاتی دەرچوون بە گەشتیاران ڕاگەیەنراوە (Departure Confirmed)',
    done: false,
  },
];

export const TripOperationsModal: React.FC<TripOperationsModalProps> = ({
  trip,
  guides,
  vehicles,
  passengers,
  bookings,
  locale,
  onClose,
  onSaveTripDetails,
  onUpdateAttendance,
}) => {
  const initialChecklist = (() => {
    try {
      const parsed =
        typeof trip.preparationChecklist === 'string'
          ? JSON.parse(trip.preparationChecklist || '[]')
          : trip.preparationChecklist;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback
    }
    return DEFAULT_CHECKLIST;
  })();

  const [checklist, setChecklist] = useState<Array<{ key: string; label: string; done: boolean }>>(
    initialChecklist
  );
  const [guideId, setGuideId] = useState<number>(trip.guideId || 0);
  const [vehicleId, setVehicleId] = useState<number>(trip.vehicleId || 0);
  const [operationalNotes, setOperationalNotes] = useState<string>(trip.operationalNotes || '');
  const [saving, setSaving] = useState(false);
  const [updatingPaxId, setUpdatingPaxId] = useState<number | null>(null);

  // Filter passengers belonging to this trip
  const tripBookingsMap = new Map<number, any>();
  bookings
    .filter((b) => b.tripId === trip.id && b.status !== 'cancelled')
    .forEach((b) => tripBookingsMap.set(b.id, b));

  const tripPassengers = passengers.filter(
    (p) => p.tripId === trip.id || tripBookingsMap.has(p.bookingId)
  );

  const toggleItem = (key: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.key === key ? { ...item, done: !item.done } : item))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveTripDetails(trip.id, {
        guideId: guideId > 0 ? guideId : null,
        vehicleId: vehicleId > 0 ? vehicleId : null,
        preparationChecklist: checklist,
        operationalNotes,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAttendanceClick = async (
    paxId: number,
    status: 'pending' | 'present' | 'no_show'
  ) => {
    setUpdatingPaxId(paxId);
    try {
      await onUpdateAttendance(paxId, status);
    } finally {
      setUpdatingPaxId(null);
    }
  };

  const handleExportManifestCsv = () => {
    const headers = [
      'No',
      'FullName',
      'AgeGroup',
      'Phone',
      'BookingCode',
      'PickupPoint',
      'AttendanceStatus',
    ];
    const rows = tripPassengers.map((p, idx) => {
      const bk = tripBookingsMap.get(p.bookingId);
      return [
        idx + 1,
        `"${(p.fullName || '').replace(/"/g, '""')}"`,
        p.ageGroup || 'adult',
        p.phone || '',
        bk?.bookingCode || '',
        `"${(p.pickupPointName || bk?.pickupPointName || '').replace(/"/g, '""')}"`,
        p.attendanceStatus || 'pending',
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manifest-${trip.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = checklist.filter((c) => c.done).length;
  const presentCount = tripPassengers.filter((p) => p.attendanceStatus === 'present').length;
  const noShowCount = tripPassengers.filter((p) => p.attendanceStatus === 'no_show').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="ravan-panel w-full max-w-5xl rounded-3xl p-6 sm:p-8 space-y-6 text-xs my-8 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-[#C8A76A]/15 border border-[#C8A76A]/40 font-mono font-bold text-[#D4B375]">
                {trip.code}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#F4F7FB]">
                ئامادەکاریی گەشت و تۆماری ئامادەبوونی گەشتیاران (Trip Operations & Manifest)
              </h2>
            </div>
            <p className="text-[#9BA9BC] mt-1">
              {trip.titleKu} · {trip.destination} · {formatBaghdadDateTime(trip.departureAt, locale)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportManifestCsv}
              className="ravan-btn-secondary px-3.5 py-2 rounded-xl flex items-center gap-1.5 text-[#D4B375]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>داگرتنی لیستی گەشتیاران (CSV)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-[#9BA9BC]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Preparation Checklist + Guide/Vehicle Assignment */}
          <form onSubmit={handleSave} className="lg:col-span-5 space-y-5">
            <div className="p-4 rounded-2xl bg-[#070B12]/80 border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#D4B375] flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>لیستی ئامادەکاریی بەر لە گەشت</span>
                </h3>
                <span className="font-mono text-[#F4F7FB]">
                  {completedCount}/{checklist.length}
                </span>
              </div>

              <div className="space-y-2">
                {checklist.map((item) => (
                  <label
                    key={item.key}
                    onClick={() => toggleItem(item.key)}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      item.done
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                        : 'bg-[#101C2E]/60 border-white/[0.06] text-[#9BA9BC] hover:text-[#F4F7FB]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => {}}
                      className="rounded accent-[#C8A76A]"
                    />
                    <span className="flex-1">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#070B12]/80 border border-white/[0.08] space-y-3">
              <h3 className="font-bold text-[#D4B375] flex items-center gap-2">
                <Truck className="w-4 h-4" />
                <span>ڕێبەری گەشت و هۆکاری گواستنەوە</span>
              </h3>

              <div>
                <label className="block text-[#9BA9BC] mb-1">ڕێبەری گەشت (Guide)</label>
                <select
                  value={guideId}
                  onChange={(e) => setGuideId(Number(e.target.value))}
                  className="ravan-input w-full rounded-xl px-3 py-2"
                >
                  <option value={0}>— هەڵنەبژێردراوە —</option>
                  {guides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.fullName} ({g.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#9BA9BC] mb-1">ئۆتۆمبێل / پاس (Vehicle)</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(Number(e.target.value))}
                  className="ravan-input w-full rounded-xl px-3 py-2"
                >
                  <option value={0}>— هەڵنەبژێردراوە —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — تابلۆ: {v.plateNumber} ({v.capacity} کورسی)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#9BA9BC] mb-1">
                  تێبینییەکانی جێبەجێکردن و ڕووداوەکانی گەشت (Operational Notes)
                </label>
                <textarea
                  rows={3}
                  value={operationalNotes}
                  onChange={(e) => setOperationalNotes(e.target.value)}
                  placeholder="تێبینی لەسەر بازگەکان، کەشوهەوا، یان هەر ڕووداوێکی ناو گەشت..."
                  className="ravan-input w-full rounded-xl p-3"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="ravan-btn-gold w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>پاشەکەوتکردنی ئامادەکارییەکان</span>
              </button>
            </div>
          </form>

          {/* Right 7 Cols: Live Passenger Manifest & Check-In */}
          <div className="lg:col-span-7 p-4 rounded-2xl bg-[#070B12]/80 border border-white/[0.08] space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                <h3 className="font-bold text-[#F4F7FB] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#C8A76A]" />
                  <span>لیستی ناوی بەشداربووان و پشکنینی ئامادەبوون ({tripPassengers.length})</span>
                </h3>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    ئامادەبوو: {presentCount}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                    نەهاتوو: {noShowCount}
                  </span>
                </div>
              </div>

              {tripPassengers.length === 0 ? (
                <div className="p-8 text-center text-[#9BA9BC]">
                  هیچ گەشتیارێک بۆ ئەم گەشتە تۆمار نەکراوە.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pe-1">
                  {tripPassengers.map((pax, idx) => {
                    const bk = tripBookingsMap.get(pax.bookingId);
                    const status = pax.attendanceStatus || 'pending';
                    return (
                      <div
                        key={pax.id}
                        className="p-3 rounded-xl bg-[#101C2E]/70 border border-white/[0.07] flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-[#F4F7FB] flex items-center gap-2">
                            <span className="font-mono text-[#D4B375]">#{idx + 1}</span>
                            <span>{pax.fullName}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] font-mono text-[#9BA9BC]">
                              {pax.ageGroup}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#9BA9BC] font-mono">
                            کۆدی حجز: {bk?.bookingCode || `#${pax.bookingId}`} · شوێن:{' '}
                            {pax.pickupPointName || bk?.pickupPointName || ' سەرەکی'} · 📞{' '}
                            {pax.phone || '—'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={updatingPaxId === pax.id}
                            onClick={() => handleAttendanceClick(pax.id, 'present')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                              status === 'present'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-white/[0.05] text-[#9BA9BC] hover:text-white'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>ئامادەیە (Present)</span>
                          </button>

                          <button
                            type="button"
                            disabled={updatingPaxId === pax.id}
                            onClick={() => handleAttendanceClick(pax.id, 'no_show')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                              status === 'no_show'
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'bg-white/[0.05] text-[#9BA9BC] hover:text-white'
                            }`}
                          >
                            نەهاتوو (No-Show)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-[#9BA9BC]">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#C8A76A]" />
                <span>هەموو گۆڕانکارییەکانی ئامادەبوون ڕاستەوخۆ لە PostgreSQL تۆمار دەکرێن.</span>
              </span>
              <span className="font-mono text-[#D4B375]">
                کورسی پڕبوو: {trip.totalCapacity - trip.availableSeats}/{trip.totalCapacity}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
