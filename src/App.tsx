/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { getDirection, Locale, translations } from './lib/i18n.ts';
import { formatMoney } from './lib/money.ts';
import { formatBaghdadDateOnly, formatBaghdadDateTime } from './lib/dates.ts';
import { hasPermission, Permission, Role } from './lib/permissions.ts';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  Compass,
  CreditCard,
  FileCheck2,
  Globe,
  LayoutDashboard,
  LogOut,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';

type WorkspaceTab =
  | 'dashboard'
  | 'trips'
  | 'bookings'
  | 'customers'
  | 'finance'
  | 'team'
  | 'notifications'
  | 'settings'
  | 'super-admin';

type AppMode = 'workspace' | 'public-portal';

export default function App() {
  const [locale, setLocale] = useState<Locale>('ku');
  const t = translations[locale];
  const dir = getDirection(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  // Auth & In-Memory Token State (Never stored in localStorage per cloudsql-setup)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // User Profile & Multi-Tenant Memberships
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);

  // View State
  const [appMode, setAppMode] = useState<AppMode>('workspace');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Module Data State
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [tripsData, setTripsData] = useState<{
    trips: any[];
    guides: any[];
    vehicles: any[];
    pickupPoints: any[];
  }>({ trips: [], guides: [], vehicles: [], pickupPoints: [] });
  const [bookingsData, setBookingsData] = useState<{
    bookings: any[];
    customers: any[];
    trips: any[];
    passengers: any[];
    statusHistory: any[];
  }>({ bookings: [], customers: [], trips: [], passengers: [], statusHistory: [] });
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [financeData, setFinanceData] = useState<any | null>(null);
  const [teamData, setTeamData] = useState<{
    members: any[];
    invites: any[];
    guides: any[];
    vehicles: any[];
  }>({ members: [], invites: [], guides: [], vehicles: [] });
  const [platformData, setPlatformData] = useState<{
    organizations: any[];
    subscriptions: any[];
    plans: any[];
    auditLogs: any[];
  } | null>(null);

  // Public Portal State
  const [publicTrips, setPublicTrips] = useState<any[]>([]);
  const [publicOrgFilter, setPublicOrgFilter] = useState<string>('');
  const [lookupCode, setLookupCode] = useState<string>('RVN-9K4M2P');
  const [lookupPhone, setLookupPhone] = useState<string>('+9647502223344');
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [publicBookingTrip, setPublicBookingTrip] = useState<any | null>(null);
  const [publicBookingForm, setPublicBookingForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    passengerCount: 2,
    pickupPointName: '',
    customerNotes: '',
  });

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  // Modal Toggles
  const [showCreateTripModal, setShowCreateTripModal] = useState(false);
  const [showCreateBookingModal, setShowCreateBookingModal] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showRecordExpenseModal, setShowRecordExpenseModal] = useState(false);

  // Forms State
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    slug: '',
    legalName: '',
    contactPhone: '+964750',
    defaultLanguage: 'ku' as Locale,
    defaultCurrency: 'IQD' as 'IQD' | 'USD',
  });

  const [tripForm, setTripForm] = useState({
    code: 'RVN-NEW-01',
    titleKu: '',
    titleAr: '',
    titleEn: '',
    descriptionKu: '',
    destination: '',
    departureLocation: 'Erbil',
    departureAt: '2026-11-15T07:00',
    returnAt: '2026-11-17T20:00',
    priceAmount: 65000,
    currency: 'IQD' as 'IQD' | 'USD',
    totalCapacity: 25,
    includedServices: 'گواستنەوە، نانی بەیانی، ڕێبەری گەشت',
    requirements: 'ناسنامەی فەرمی',
    status: 'published' as const,
    pickupPointName: 'هەولێر — پارکی شانەدەر',
    pickupTime: '06:30',
  });

  const [bookingForm, setBookingForm] = useState({
    tripId: 0,
    customerId: 0,
    customerName: '',
    customerPhone: '+964750',
    passengerCount: 2,
    pickupPointName: 'Erbil Main Point',
    customerNotes: '',
    internalNotes: '',
  });

  const [customerForm, setCustomerForm] = useState({
    fullName: '',
    phone: '+964750',
    email: '',
    preferredLanguage: 'ku' as Locale,
    notes: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    bookingId: 0,
    entryType: 'payment' as 'payment' | 'refund' | 'adjustment',
    amount: 50000,
    currency: 'IQD' as 'IQD' | 'USD',
    paymentMethod: 'cash' as const,
    referenceCode: '',
    notes: '',
  });

  const [expenseForm, setExpenseForm] = useState({
    tripId: 0,
    categoryName: 'گواستنەوە و سووتەمەنی',
    title: '',
    amount: 50000,
    currency: 'IQD' as 'IQD' | 'USD',
    vendorName: '',
    referenceCode: '',
    notes: '',
  });

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'booking_agent' as Role,
  });

  const [guideForm, setGuideForm] = useState({
    fullName: '',
    phone: '+964750',
    specialty: 'Mountain & Cultural Tours',
  });

  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    plateNumber: '',
    capacity: 24,
    driverName: '',
  });

  const [dryRunInput, setDryRunInput] = useState<string>(
    JSON.stringify(
      [
        {
          customerName: 'هێمن سەردار (Sample Dry-Run)',
          phone: '07501234567',
          tripCode: 'RVN-CHM-01',
          amount: 65000,
          currency: 'IQD',
        },
      ],
      null,
      2
    )
  );
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);

  // Active Membership & Organization Derived Context
  const activeMembership = useMemo(() => {
    return memberships.find((m) => m.organizationId === activeOrgId) || null;
  }, [memberships, activeOrgId]);

  const activeOrg = activeMembership?.organization || null;

  const can = useCallback(
    (perm: Permission) => {
      if (!activeMembership) return false;
      return hasPermission(
        {
          role: activeMembership.role as Role,
          status: activeMembership.status,
          customPermissions: activeMembership.customPermissions,
        },
        perm
      );
    },
    [activeMembership]
  );

  // Authenticated API Fetch Helper
  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
      if (activeOrgId) {
        headers['x-organization-id'] = String(activeOrgId);
      }

      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    },
    [idToken, activeOrgId]
  );

  // Load Public Trips
  const fetchPublicTrips = useCallback(async () => {
    try {
      const query = publicOrgFilter ? `?org=${encodeURIComponent(publicOrgFilter)}` : '';
      const res = await fetch(`/api/public/trips${query}`);
      const data = await res.json();
      if (res.ok) {
        setPublicTrips(data.trips || []);
      }
    } catch (err) {
      console.error('Failed to fetch public trips:', err);
    }
  }, [publicOrgFilter]);

  useEffect(() => {
    fetchPublicTrips();
  }, [fetchPublicTrips]);

  // Listen to Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
        } catch (err) {
          console.error('Error getting ID token:', err);
        }
      } else {
        setIdToken(null);
        setDbUser(null);
        setMemberships([]);
        setActiveOrgId(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load `/api/me` when token is available
  const loadWorkspaceProfile = useCallback(async () => {
    if (!idToken) return;
    try {
      const data = await apiFetch('/api/me');
      setDbUser(data.user);
      setMemberships(data.memberships || []);
      if (data.memberships?.length > 0 && !activeOrgId) {
        setActiveOrgId(data.memberships[0].organizationId);
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  }, [idToken, activeOrgId, apiFetch]);

  useEffect(() => {
    if (idToken) {
      loadWorkspaceProfile();
    }
  }, [idToken, loadWorkspaceProfile]);

  // Load Active Tab Data for Current Tenant
  const loadActiveTabData = useCallback(async () => {
    if (!idToken) return;
    if (activeTab === 'super-admin') {
      setLoadingData(true);
      try {
        const data = await apiFetch('/api/platform/overview');
        setPlatformData(data);
      } catch (err: any) {
        setBannerMessage({ type: 'error', text: err.message });
      } finally {
        setLoadingData(false);
      }
      return;
    }

    if (!activeOrgId) return;
    setLoadingData(true);
    try {
      if (activeTab === 'dashboard' || activeTab === 'notifications' || activeTab === 'settings') {
        const data = await apiFetch('/api/dashboard');
        setDashboardData(data);
      } else if (activeTab === 'trips') {
        const data = await apiFetch('/api/trips');
        setTripsData(data);
      } else if (activeTab === 'bookings') {
        const data = await apiFetch('/api/bookings');
        setBookingsData(data);
      } else if (activeTab === 'customers') {
        const data = await apiFetch('/api/customers');
        setCustomersList(data.customers || []);
      } else if (activeTab === 'finance') {
        const data = await apiFetch('/api/finance');
        setFinanceData(data);
      } else if (activeTab === 'team') {
        const data = await apiFetch('/api/members');
        setTeamData(data);
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    } finally {
      setLoadingData(false);
    }
  }, [idToken, activeOrgId, activeTab, apiFetch]);

  useEffect(() => {
    loadActiveTabData();
  }, [loadActiveTabData]);

  // Handlers
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setIdToken(token);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-in failed.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setIdToken(null);
    setDbUser(null);
    setMemberships([]);
    setActiveOrgId(null);
    setDashboardData(null);
  };

  const handleSeedDemo = async () => {
    setLoadingData(true);
    try {
      const res = await apiFetch('/api/dev/seed', { method: 'POST' });
      await loadWorkspaceProfile();
      if (res.organization?.id) {
        setActiveOrgId(res.organization.id);
      }
      await fetchPublicTrips();
      setBannerMessage({
        type: 'success',
        text: 'داتای تاقیکردنەوەی RAVAN Demo Travel و Zagros Horizon Tours بە سەرکەوتوویی لە PostgreSQL دروست کرا.',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(newOrgForm),
      });
      await loadWorkspaceProfile();
      if (res.organization?.id) {
        setActiveOrgId(res.organization.id);
      }
      setBannerMessage({
        type: 'success',
        text: `Organization "${res.organization.name}" created with 14-day trial.`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/trips', {
        method: 'POST',
        body: JSON.stringify({
          ...tripForm,
          priceAmount: Number(tripForm.priceAmount),
          totalCapacity: Number(tripForm.totalCapacity),
        }),
      });
      setShowCreateTripModal(false);
      await loadActiveTabData();
      await fetchPublicTrips();
      setBannerMessage({ type: 'success', text: 'Trip created and saved to PostgreSQL.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleTripStatusChange = async (tripId: number, status: string) => {
    try {
      await apiFetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadActiveTabData();
      await fetchPublicTrips();
      setBannerMessage({ type: 'success', text: `Trip status updated to ${status}.` });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          tripId: Number(bookingForm.tripId),
          customerId: bookingForm.customerId > 0 ? Number(bookingForm.customerId) : undefined,
          customerName: bookingForm.customerId === 0 ? bookingForm.customerName : undefined,
          customerPhone: bookingForm.customerId === 0 ? bookingForm.customerPhone : undefined,
          passengerCount: Number(bookingForm.passengerCount),
          pickupPointName: bookingForm.pickupPointName,
          customerNotes: bookingForm.customerNotes,
          internalNotes: bookingForm.internalNotes,
          idempotencyKey: `ui-bk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        }),
      });
      setShowCreateBookingModal(false);
      await loadActiveTabData();
      setBannerMessage({
        type: 'success',
        text: 'Booking recorded with row-level capacity verification.',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleBookingStatusChange = async (bookingId: number, status: string) => {
    try {
      await apiFetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: `Changed to ${status} via workspace` }),
      });
      await loadActiveTabData();
      setBannerMessage({ type: 'success', text: `Booking status updated to ${status}.` });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(customerForm),
      });
      setShowCreateCustomerModal(false);
      setCustomerForm({ fullName: '', phone: '+964750', email: '', preferredLanguage: 'ku', notes: '' });
      await loadActiveTabData();
      setBannerMessage({ type: 'success', text: 'Customer added to organization CRM.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...paymentForm,
          bookingId: Number(paymentForm.bookingId),
          amount: Number(paymentForm.amount),
        }),
      });
      setShowRecordPaymentModal(false);
      await loadActiveTabData();
      setBannerMessage({
        type: 'success',
        text: `Recorded ${paymentForm.entryType} (${paymentForm.amount} ${paymentForm.currency}) in append-only ledger.`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...expenseForm,
          tripId: expenseForm.tripId > 0 ? Number(expenseForm.tripId) : null,
          amount: Number(expenseForm.amount),
        }),
      });
      setShowRecordExpenseModal(false);
      await loadActiveTabData();
      setBannerMessage({
        type: 'success',
        text: `Expense recorded (${expenseForm.amount} ${expenseForm.currency}).`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handlePublicBookingLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/public/booking-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingCode: lookupCode, phone: lookupPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setLookupResult(data.booking);
    } catch (err: any) {
      setLookupResult(null);
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handlePublicBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicBookingTrip) return;
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: publicBookingTrip.id,
          customerName: publicBookingForm.customerName,
          customerPhone: publicBookingForm.customerPhone,
          customerEmail: publicBookingForm.customerEmail,
          passengerCount: Number(publicBookingForm.passengerCount),
          pickupPointName: publicBookingForm.pickupPointName,
          customerNotes: publicBookingForm.customerNotes,
          idempotencyKey: `pub-${publicBookingTrip.id}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking request failed');
      setPublicBookingTrip(null);
      setLookupCode(data.booking.bookingCode);
      setLookupPhone(publicBookingForm.customerPhone);
      await fetchPublicTrips();
      setBannerMessage({
        type: 'success',
        text: `Booking request submitted! Your Booking Code is ${data.booking.bookingCode}.`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleRunDryRunValidator = async () => {
    try {
      const parsedRows = JSON.parse(dryRunInput);
      const report = await apiFetch('/api/dry-run-import', {
        method: 'POST',
        body: JSON.stringify({ rows: parsedRows }),
      });
      setDryRunResult(report);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: `Invalid JSON or request: ${err.message}` });
    }
  };

  return (
    <div className="min-h-screen bg-[#0A101A] text-[#F4F7FB] flex flex-col">
      <OfflineIndicator message={t.offlineBanner} />

      {/* Top Navigation Bar — Adhering to 3-Zone Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0A101A]/95 backdrop-blur-md border-b border-[#547DA8]/20">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setAppMode('workspace');
          }}
          className="text-lg font-bold tracking-tight text-[#F4F7FB] whitespace-nowrap shrink-0"
        >
          RAVAN
        </a>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#AAB7C7]">
          <button
            type="button"
            onClick={() => setAppMode('workspace')}
            className={`hover:text-[#F4F7FB] transition-colors whitespace-nowrap shrink-0 ${
              appMode === 'workspace' ? 'text-[#C8A76A] underline underline-offset-8' : ''
            }`}
          >
            {t.workspaceView}
          </button>
          <button
            type="button"
            onClick={() => setAppMode('public-portal')}
            className={`hover:text-[#F4F7FB] transition-colors whitespace-nowrap shrink-0 ${
              appMode === 'public-portal' ? 'text-[#C8A76A] underline underline-offset-8' : ''
            }`}
          >
            {t.publicPortal}
          </button>
          {(['ku', 'ar', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLocale(lang)}
              className={`hover:text-[#F4F7FB] transition-colors whitespace-nowrap shrink-0 ${
                locale === lang ? 'text-[#F4F7FB] font-semibold underline underline-offset-8' : ''
              }`}
            >
              {lang === 'ku' ? 'کوردی' : lang === 'ar' ? 'العربية' : 'English'}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton label={t.installApp} />
          {firebaseUser ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 text-xs font-medium text-[#F4F7FB] bg-[#142438] border border-[#547DA8]/30 rounded-lg hover:bg-[#1d324d] transition-colors whitespace-nowrap shrink-0"
            >
              {t.signOut}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="px-4 py-2 text-xs font-semibold text-[#0A101A] bg-[#C8A76A] rounded-lg hover:bg-[#d4b67b] transition-colors whitespace-nowrap shrink-0"
            >
              {t.signInGoogle}
            </button>
          )}
        </div>
      </header>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
            bannerMessage.type === 'error'
              ? 'bg-red-950/60 border-red-500/40 text-red-200'
              : bannerMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-[#142438] border-[#547DA8]/40 text-[#F4F7FB]'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-xs underline ms-4 whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =====================================================================
          MODE A: PUBLIC CUSTOMER PORTAL & BOOKING LOOKUP
         ===================================================================== */}
      {appMode === 'public-portal' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
          <section className="ravan-panel rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs text-[#C8A76A] font-medium">
                {t.brandName} · {t.brandSentence}
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-[#F4F7FB]">
                {t.publicPortal}
              </h1>
              <p className="text-sm text-[#AAB7C7]">
                تەنها زانیارییە گشتییەکانی گەشتە بڵاوکراوەکان پیشان دەدرێن. تێبینیی ناوخۆیی و ژمێریاریی کۆمپانیاکان بە تەواوی پارێزراون.
              </p>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                value={publicOrgFilter}
                onChange={(e) => setPublicOrgFilter(e.target.value)}
                className="bg-[#0A101A] border border-[#547DA8]/30 rounded-lg px-3 py-2 text-xs text-[#F4F7FB]"
              >
                <option value="">All Active Travel Companies</option>
                <option value="ravan-demo-travel">RAVAN Demo Travel (Tenant A)</option>
                <option value="zagros-horizon-tours">Zagros Horizon Tours (Tenant B)</option>
              </select>
              <button
                type="button"
                onClick={fetchPublicTrips}
                className="px-3 py-2 text-xs bg-[#142438] border border-[#547DA8]/30 rounded-lg hover:bg-[#1c324d] whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* Public Booking Status Lookup */}
          <section className="ravan-surface rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#F4F7FB] flex items-center gap-2">
              <Ticket className="w-4 h-4 text-[#C8A76A]" />
              <span>{t.lookupBookingTitle}</span>
            </h2>
            <form
              onSubmit={handlePublicBookingLookup}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
            >
              <div>
                <label className="block text-xs text-[#AAB7C7] mb-1">
                  Booking Code (e.g. RVN-9K4M2P)
                </label>
                <input
                  type="text"
                  required
                  value={lookupCode}
                  onChange={(e) => setLookupCode(e.target.value)}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-xs font-mono text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#AAB7C7] mb-1">
                  Customer Phone (+964...)
                </label>
                <input
                  type="text"
                  required
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-xs font-mono text-[#F4F7FB]"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#547DA8] text-white rounded-lg hover:bg-[#466b91] transition-colors whitespace-nowrap shrink-0"
              >
                {t.lookupBtn}
              </button>
            </form>

            {lookupResult && (
              <div className="mt-4 pt-4 border-t border-[#547DA8]/20 grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                <div>
                  <span className="text-[#AAB7C7] block">Code · Status</span>
                  <span className="font-mono font-semibold text-[#C8A76A]">
                    {lookupResult.bookingCode} · {lookupResult.status.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-[#AAB7C7] block">Customer</span>
                  <span className="font-medium text-[#F4F7FB]">{lookupResult.customerName}</span>
                </div>
                <div>
                  <span className="text-[#AAB7C7] block">Trip</span>
                  <span className="font-medium text-[#F4F7FB]">
                    {locale === 'en'
                      ? lookupResult.tripTitleEn || lookupResult.tripTitleKu
                      : locale === 'ar'
                      ? lookupResult.tripTitleAr || lookupResult.tripTitleKu
                      : lookupResult.tripTitleKu}
                  </span>
                </div>
                <div>
                  <span className="text-[#AAB7C7] block">Total · Paid</span>
                  <span className="font-mono tabular-nums text-[#F4F7FB]">
                    {formatMoney(lookupResult.totalAmount, lookupResult.currency, locale)} ·{' '}
                    {formatMoney(lookupResult.paidAmount, lookupResult.currency, locale)}
                  </span>
                </div>
                <div>
                  <span className="text-[#AAB7C7] block">Remaining Balance</span>
                  <span className="font-mono tabular-nums text-amber-300">
                    {formatMoney(lookupResult.outstandingAmount, lookupResult.currency, locale)}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Published Trips Grid */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-[#F4F7FB]">
              Published Trips ({publicTrips.length})
            </h2>
            {publicTrips.length === 0 ? (
              <div className="ravan-surface rounded-xl p-8 text-center text-sm text-[#AAB7C7]">
                {t.noRecordsFound}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publicTrips.map((trip) => {
                  const title =
                    locale === 'en'
                      ? trip.titleEn || trip.titleKu
                      : locale === 'ar'
                      ? trip.titleAr || trip.titleKu
                      : trip.titleKu;
                  const desc =
                    locale === 'en'
                      ? trip.descriptionEn || trip.descriptionKu
                      : locale === 'ar'
                      ? trip.descriptionAr || trip.descriptionKu
                      : trip.descriptionKu;

                  return (
                    <div
                      key={trip.id}
                      className="ravan-panel rounded-xl p-6 flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-2.5">
                        <div className="text-xs text-[#AAB7C7] flex items-center gap-1.5">
                          <span className="font-mono text-[#C8A76A]">{trip.code}</span>
                          <span aria-hidden="true">·</span>
                          <span>{trip.organizationName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{trip.destination}</span>
                        </div>
                        <h3 className="text-base font-semibold text-[#F4F7FB]">{title}</h3>
                        <p className="text-xs text-[#AAB7C7] leading-relaxed line-clamp-3">
                          {desc}
                        </p>
                      </div>

                      <div className="pt-4 border-t border-[#547DA8]/20 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#AAB7C7]">
                            {formatBaghdadDateOnly(trip.departureAt, locale)}
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-[#C8A76A]">
                            {formatMoney(trip.priceAmount, trip.currency, locale)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[#AAB7C7]">
                          <span>
                            {t.seatsAvailable}:{' '}
                            <strong className="font-mono tabular-nums text-[#F4F7FB]">
                              {trip.availableSeats} / {trip.totalCapacity}
                            </strong>
                          </span>
                          <button
                            type="button"
                            disabled={trip.availableSeats <= 0}
                            onClick={() => setPublicBookingTrip(trip)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-xs hover:bg-[#d4b67b] disabled:opacity-40 whitespace-nowrap shrink-0"
                          >
                            {trip.availableSeats > 0 ? t.createBooking : t.statusFull}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Public Booking Modal */}
          {publicBookingTrip && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-md rounded-xl bg-[#142438] border border-[#547DA8]/30 p-6 space-y-4">
                <h3 className="text-base font-semibold text-[#F4F7FB]">
                  {t.createBooking} — {publicBookingTrip.code}
                </h3>
                <form onSubmit={handlePublicBookingSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={publicBookingForm.customerName}
                      onChange={(e) =>
                        setPublicBookingForm({ ...publicBookingForm, customerName: e.target.value })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Phone (+964...)</label>
                    <input
                      type="text"
                      required
                      value={publicBookingForm.customerPhone}
                      onChange={(e) =>
                        setPublicBookingForm({ ...publicBookingForm, customerPhone: e.target.value })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">
                      Number of Passengers (Max {publicBookingTrip.availableSeats})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={publicBookingTrip.availableSeats}
                      required
                      value={publicBookingForm.passengerCount}
                      onChange={(e) =>
                        setPublicBookingForm({
                          ...publicBookingForm,
                          passengerCount: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Notes</label>
                    <input
                      type="text"
                      value={publicBookingForm.customerNotes}
                      onChange={(e) =>
                        setPublicBookingForm({ ...publicBookingForm, customerNotes: e.target.value })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPublicBookingTrip(null)}
                      className="px-4 py-2 rounded-lg border border-[#547DA8]/30 text-[#AAB7C7]"
                    >
                      {t.cancel}
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold"
                    >
                      {t.save}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      )}

      {/* =====================================================================
          MODE B: AUTHENTICATED MULTI-TENANT WORKSPACE
         ===================================================================== */}
      {appMode === 'workspace' && (
        <div className="flex-1 flex flex-col">
          {authLoading ? (
            <div className="flex-1 flex items-center justify-center p-12 text-sm text-[#AAB7C7]">
              Loading RAVAN authentication state...
            </div>
          ) : !firebaseUser ? (
            /* Sign-In Hero Screen */
            <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 flex flex-col justify-center space-y-8">
              <div className="ravan-panel rounded-2xl p-8 md:p-10 space-y-6">
                <div className="text-xs text-[#C8A76A] font-medium">
                  {t.brandName} · {t.tagline} · {t.brandSentence}
                </div>
                <h1 className="text-2xl md:text-4xl font-bold text-[#F4F7FB] max-w-2xl">
                  سیستەمی فرە-کۆمپانیای بەڕێوەبردنی گەشتوگوزار، حجزکردن و ژمێریاریی جیاکراوەی IQD و USD
                </h1>
                <p className="text-sm text-[#AAB7C7] max-w-2xl leading-relaxed">
                  بەستراوەتەوە بە بنکەی داتای ڕاستەقینەی PostgreSQL (Cloud SQL europe-west2) لەگەڵ کۆنترۆڵی دەسەڵاتەکان (RBAC)، پاراستنی جێگاکان لە کاتی حجزکردنی هاوکات و جیاکردنەوەی تەواوی داتای هەر کۆمپانیایەک.
                </p>

                {authError && (
                  <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                    {authError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="px-6 py-3 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-sm hover:bg-[#d4b67b] transition-colors whitespace-nowrap shrink-0"
                  >
                    {t.signInGoogle}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppMode('public-portal')}
                    className="px-6 py-3 rounded-lg bg-[#142438] border border-[#547DA8]/30 text-[#F4F7FB] font-medium text-sm hover:bg-[#1c324d] transition-colors whitespace-nowrap shrink-0"
                  >
                    {t.publicPortal}
                  </button>
                </div>

                <div className="pt-6 border-t border-[#547DA8]/20 text-xs text-[#AAB7C7]">
                  {t.kurdiaSafetyNote}
                </div>
              </div>
            </div>
          ) : memberships.length === 0 ? (
            /* Organization Onboarding & Demo Tenant Seeder */
            <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 space-y-8">
              <div className="ravan-panel rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#F4F7FB]">
                  Quick Development Setup — Seed Isolated Demo Tenants
                </h2>
                <p className="text-xs text-[#AAB7C7] leading-relaxed">
                  بۆ تاقیکردنەوەی دەستبەجێی جیاکردنەوەی دوو کۆمپانیا لەسەر هەمان بنکەی داتای PostgreSQL، کرتە بکە بۆ دروستکردنی دوو کۆمپانیای تاقیکاریی جیاواز (<strong>RAVAN Demo Travel</strong> و <strong>Zagros Horizon Tours</strong>) بەبێ بەکارهێنانی هیچ داتایەکی KURDIA.
                </p>
                <button
                  type="button"
                  disabled={loadingData}
                  onClick={handleSeedDemo}
                  className="px-5 py-2.5 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-xs hover:bg-[#d4b67b] transition-colors whitespace-nowrap shrink-0"
                >
                  {loadingData ? 'Seeding PostgreSQL...' : t.seedDemoBtn}
                </button>
              </div>

              <div className="ravan-surface rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-[#F4F7FB]">{t.createOrgTitle}</h2>
                <form
                  onSubmit={handleCreateOrganization}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
                >
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Company Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Hawler Sky Tours"
                      value={newOrgForm.name}
                      onChange={(e) =>
                        setNewOrgForm({
                          ...newOrgForm,
                          name: e.target.value,
                          slug: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-|-$/g, ''),
                        })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Tenant URL Slug</label>
                    <input
                      type="text"
                      required
                      value={newOrgForm.slug}
                      onChange={(e) => setNewOrgForm({ ...newOrgForm, slug: e.target.value })}
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Contact Phone (+964...)</label>
                    <input
                      type="text"
                      required
                      value={newOrgForm.contactPhone}
                      onChange={(e) =>
                        setNewOrgForm({ ...newOrgForm, contactPhone: e.target.value })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">Default Currency</label>
                    <select
                      value={newOrgForm.defaultCurrency}
                      onChange={(e) =>
                        setNewOrgForm({
                          ...newOrgForm,
                          defaultCurrency: e.target.value as 'IQD' | 'USD',
                        })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                    >
                      <option value="IQD">IQD — Iraqi Dinar</option>
                      <option value="USD">USD — US Dollar</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-lg bg-[#547DA8] text-white font-semibold text-xs hover:bg-[#466b91]"
                    >
                      Create Organization & Start 14-Day Trial
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            /* Full SaaS Workspace: Sidebar + Content Viewport */
            <div className="flex-1 flex flex-col lg:flex-row">
              {/* Sidebar Navigation (260px on desktop) */}
              <aside className="w-full lg:w-64 shrink-0 bg-[#142438]/75 border-b lg:border-b-0 lg:border-e border-[#547DA8]/20 p-4 flex flex-col justify-between gap-6">
                <div className="space-y-5">
                  {/* Tenant Switcher */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] text-[#AAB7C7]">
                      {t.activeTenant}
                    </label>
                    <select
                      value={activeOrgId || ''}
                      onChange={(e) => {
                        setActiveOrgId(Number(e.target.value));
                        if (activeTab === 'super-admin') setActiveTab('dashboard');
                      }}
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/35 px-3 py-2 text-xs font-semibold text-[#F4F7FB]"
                    >
                      {memberships.map((m) => (
                        <option key={m.organizationId} value={m.organizationId}>
                          {m.organization?.name || `Org #${m.organizationId}`} ({m.role})
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-[#AAB7C7] pt-1">
                      <span>Role: {activeMembership?.role}</span>
                      <span aria-hidden="true"> · </span>
                      <span>Plan: {activeMembership?.subscription?.planCode || 'trial'}</span>
                    </div>
                  </div>

                  {/* Module Navigation Links */}
                  <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
                    {(
                      [
                        { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard },
                        { id: 'trips', label: t.navTrips, icon: Compass },
                        { id: 'bookings', label: t.navBookings, icon: Ticket },
                        { id: 'customers', label: t.navCustomers, icon: Users },
                        { id: 'finance', label: t.navFinance, icon: Wallet },
                        { id: 'team', label: t.navTeam, icon: Building2 },
                        { id: 'notifications', label: t.navNotifications, icon: Bell },
                        { id: 'settings', label: t.navSettings, icon: Settings },
                      ] as const
                    ).map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-[#0A101A] text-[#C8A76A] border border-[#C8A76A]/35'
                              : 'text-[#AAB7C7] hover:text-[#F4F7FB] hover:bg-[#0A101A]/40'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}

                    {/* Separated Platform Super Admin Console Link */}
                    {dbUser?.isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('super-admin')}
                        className={`mt-2 flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          activeTab === 'super-admin'
                            ? 'bg-amber-500/20 text-[#C8A76A] border border-[#C8A76A]/50'
                            : 'text-[#C8A76A] hover:bg-[#0A101A]/50'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>{t.navSuperAdmin}</span>
                      </button>
                    )}
                  </nav>
                </div>

                {/* Quick Seed / Refresh Utility */}
                <div className="hidden lg:block pt-4 border-t border-[#547DA8]/20 space-y-2 text-[11px] text-[#AAB7C7]">
                  <div>
                    User: <span className="text-[#F4F7FB] font-mono">{dbUser?.email}</span>
                  </div>
                  <div>Timezone: {activeOrg?.timezone || 'Asia/Baghdad'}</div>
                  <button
                    type="button"
                    onClick={handleSeedDemo}
                    className="w-full mt-2 px-3 py-1.5 rounded-lg bg-[#0A101A] border border-[#547DA8]/30 text-xs text-[#C8A76A] hover:bg-[#1c324d]"
                  >
                    Ensure Demo Tenants
                  </button>
                </div>
              </aside>

              {/* Main Workspace Content Area */}
              <main className="flex-1 p-6 md:p-8 space-y-8 overflow-y-auto">
                {/* Workspace Breadcrumb & Primary Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#547DA8]/20">
                  <div>
                    <div className="text-xs text-[#AAB7C7]">
                      <span>{activeOrg?.name}</span>
                      <span aria-hidden="true"> / </span>
                      <span className="text-[#C8A76A] font-medium">{activeTab.toUpperCase()}</span>
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold text-[#F4F7FB] mt-1">
                      {activeTab === 'dashboard' && t.navDashboard}
                      {activeTab === 'trips' && t.navTrips}
                      {activeTab === 'bookings' && t.navBookings}
                      {activeTab === 'customers' && t.navCustomers}
                      {activeTab === 'finance' && t.navFinance}
                      {activeTab === 'team' && t.navTeam}
                      {activeTab === 'notifications' && t.navNotifications}
                      {activeTab === 'settings' && t.navSettings}
                      {activeTab === 'super-admin' && t.navSuperAdmin}
                    </h1>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={loadActiveTabData}
                      className="px-3 py-2 rounded-lg bg-[#142438] border border-[#547DA8]/30 text-xs text-[#F4F7FB] hover:bg-[#1c324d] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>

                    {activeTab === 'trips' && can('trips.create') && (
                      <button
                        type="button"
                        onClick={() => setShowCreateTripModal(true)}
                        className="px-4 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-xs hover:bg-[#d4b67b] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{t.createTrip}</span>
                      </button>
                    )}

                    {activeTab === 'bookings' && can('bookings.create') && (
                      <button
                        type="button"
                        onClick={() => {
                          if (bookingsData.trips.length > 0 && bookingForm.tripId === 0) {
                            setBookingForm((prev) => ({
                              ...prev,
                              tripId: bookingsData.trips[0].id,
                            }));
                          }
                          setShowCreateBookingModal(true);
                        }}
                        className="px-4 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-xs hover:bg-[#d4b67b] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{t.createBooking}</span>
                      </button>
                    )}

                    {activeTab === 'customers' && can('customers.manage') && (
                      <button
                        type="button"
                        onClick={() => setShowCreateCustomerModal(true)}
                        className="px-4 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-xs hover:bg-[#d4b67b] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{t.createCustomer}</span>
                      </button>
                    )}

                    {activeTab === 'finance' && can('finance.manage') && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (financeData?.bookings?.length > 0 && paymentForm.bookingId === 0) {
                              setPaymentForm((prev) => ({
                                ...prev,
                                bookingId: financeData.bookings[0].id,
                                currency: financeData.bookings[0].currency,
                              }));
                            }
                            setShowRecordPaymentModal(true);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold text-xs hover:bg-[#d4b67b] whitespace-nowrap shrink-0"
                        >
                          {t.recordPayment}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRecordExpenseModal(true)}
                          className="px-3.5 py-2 rounded-lg bg-[#142438] border border-[#547DA8]/40 text-[#F4F7FB] font-medium text-xs hover:bg-[#1c324d] whitespace-nowrap shrink-0"
                        >
                          {t.recordExpense}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ===========================================================
                    TAB 1: COMPANY DASHBOARD (Real PostgreSQL KPIs + IQD/USD)
                   =========================================================== */}
                {activeTab === 'dashboard' && dashboardData && (
                  <div className="space-y-8">
                    {/* 4 Operational KPI Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="ravan-panel rounded-xl p-5 space-y-1">
                        <span className="text-xs text-[#AAB7C7]">{t.kpiActiveTrips}</span>
                        <div className="text-2xl font-bold font-mono tabular-nums text-[#F4F7FB]">
                          {dashboardData.kpis.activeTripsCount}
                        </div>
                      </div>
                      <div className="ravan-panel rounded-xl p-5 space-y-1">
                        <span className="text-xs text-[#AAB7C7]">{t.kpiTotalBookings}</span>
                        <div className="text-2xl font-bold font-mono tabular-nums text-[#F4F7FB]">
                          {dashboardData.kpis.totalBookingsCount}
                        </div>
                      </div>
                      <div className="ravan-panel rounded-xl p-5 space-y-1">
                        <span className="text-xs text-[#AAB7C7]">{t.kpiPassengers}</span>
                        <div className="text-2xl font-bold font-mono tabular-nums text-[#C8A76A]">
                          {dashboardData.kpis.totalPassengers}
                        </div>
                      </div>
                      <div className="ravan-panel rounded-xl p-5 space-y-1">
                        <span className="text-xs text-[#AAB7C7]">{t.kpiPendingApprovals}</span>
                        <div className="text-2xl font-bold font-mono tabular-nums text-amber-300">
                          {dashboardData.kpis.pendingBookingsCount}
                        </div>
                      </div>
                    </div>

                    {/* Currency-Separated Financial Ledgers (IQD vs USD — Never Mixed) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {(['IQD', 'USD'] as const).map((curr) => {
                        const l = dashboardData.ledger[curr];
                        return (
                          <div key={curr} className="ravan-surface rounded-xl p-6 space-y-4">
                            <div className="flex items-center justify-between border-b border-[#547DA8]/20 pb-3">
                              <h2 className="text-sm font-semibold text-[#F4F7FB]">
                                {curr === 'IQD' ? t.iqdLedgerTitle : t.usdLedgerTitle}
                              </h2>
                              <span className="text-xs font-mono text-[#C8A76A]">{curr}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                              <div>
                                <span className="text-[#AAB7C7] block">{t.recognizedRevenue}</span>
                                <span className="font-mono tabular-nums font-semibold text-sm text-[#F4F7FB]">
                                  {formatMoney(l.recognizedRevenue, curr, locale)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#AAB7C7] block">{t.collectedCash}</span>
                                <span className="font-mono tabular-nums font-semibold text-sm text-emerald-400">
                                  {formatMoney(l.collectedAmount - l.refundedAmount, curr, locale)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#AAB7C7] block">{t.outstandingDebt}</span>
                                <span className="font-mono tabular-nums font-semibold text-sm text-amber-300">
                                  {formatMoney(l.outstandingBalance, curr, locale)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#AAB7C7] block">{t.totalExpenses}</span>
                                <span className="font-mono tabular-nums font-semibold text-sm text-red-300">
                                  {formatMoney(l.totalExpenses, curr, locale)}
                                </span>
                              </div>
                              <div className="sm:col-span-2">
                                <span className="text-[#AAB7C7] block">{t.netProfit}</span>
                                <span className="font-mono tabular-nums font-bold text-base text-[#C8A76A]">
                                  {formatMoney(l.netProfit, curr, locale)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Upcoming Trips & Recent Bookings */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="ravan-surface rounded-xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-[#F4F7FB]">{t.navTrips}</h3>
                          <button
                            type="button"
                            onClick={() => setActiveTab('trips')}
                            className="text-xs text-[#C8A76A] hover:underline"
                          >
                            View all →
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-start">
                            <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                              <tr>
                                <th className="py-2 text-start">Code · Title</th>
                                <th className="py-2 text-end">Price</th>
                                <th className="py-2 text-end">Capacity</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#547DA8]/10">
                              {dashboardData.upcomingTrips.map((tr: any) => (
                                <tr key={tr.id} className="hover:bg-[#142438]/40">
                                  <td className="py-2.5">
                                    <span className="font-mono text-[#C8A76A]">{tr.code}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>{tr.titleKu}</span>
                                  </td>
                                  <td className="py-2.5 text-end font-mono tabular-nums">
                                    {formatMoney(tr.priceAmount, tr.currency, locale)}
                                  </td>
                                  <td className="py-2.5 text-end font-mono tabular-nums">
                                    {tr.availableSeats} / {tr.totalCapacity}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="ravan-surface rounded-xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-[#F4F7FB]">{t.navBookings}</h3>
                          <button
                            type="button"
                            onClick={() => setActiveTab('bookings')}
                            className="text-xs text-[#C8A76A] hover:underline"
                          >
                            View all →
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-start">
                            <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                              <tr>
                                <th className="py-2 text-start">Booking Code</th>
                                <th className="py-2 text-start">Status</th>
                                <th className="py-2 text-end">Pax</th>
                                <th className="py-2 text-end">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#547DA8]/10">
                              {dashboardData.recentBookings.map((bk: any) => (
                                <tr key={bk.id} className="hover:bg-[#142438]/40">
                                  <td className="py-2.5 font-mono text-[#C8A76A]">
                                    {bk.bookingCode}
                                  </td>
                                  <td className="py-2.5">{bk.status.toUpperCase()}</td>
                                  <td className="py-2.5 text-end font-mono tabular-nums">
                                    {bk.passengerCount}
                                  </td>
                                  <td className="py-2.5 text-end font-mono tabular-nums">
                                    {formatMoney(bk.totalAmount, bk.currency, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    TAB 2: TRIPS MANAGEMENT (Multilingual + Capacity + Archive)
                   =========================================================== */}
                {activeTab === 'trips' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="w-4 h-4 text-[#AAB7C7] absolute top-2.5 start-3" />
                        <input
                          type="text"
                          placeholder={t.searchPlaceholder}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full rounded-lg bg-[#142438] border border-[#547DA8]/30 ps-9 pe-3 py-2 text-xs text-[#F4F7FB]"
                        />
                      </div>
                      <div className="flex items-center gap-1 p-1 bg-[#142438] rounded-lg">
                        {(['all', 'published', 'draft', 'full', 'archived'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setStatusFilter(st)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                              statusFilter === st
                                ? 'bg-[#0A101A] text-[#C8A76A]'
                                : 'text-[#AAB7C7] hover:text-[#F4F7FB]'
                            }`}
                          >
                            {st.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="ravan-surface rounded-xl overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#142438] text-[#AAB7C7] border-b border-[#547DA8]/20">
                          <tr>
                            <th className="py-3 px-4 text-start">Code · Title (KU / AR / EN)</th>
                            <th className="py-3 px-4 text-start">Destination · Departure</th>
                            <th className="py-3 px-4 text-end">Price</th>
                            <th className="py-3 px-4 text-end">Available / Total</th>
                            <th className="py-3 px-4 text-start">Status</th>
                            <th className="py-3 px-4 text-end">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#547DA8]/15">
                          {tripsData.trips
                            .filter((tr) => {
                              if (statusFilter !== 'all' && tr.status !== statusFilter) return false;
                              if (!searchQuery) return true;
                              const q = searchQuery.toLowerCase();
                              return (
                                tr.code.toLowerCase().includes(q) ||
                                tr.titleKu.toLowerCase().includes(q) ||
                                tr.titleEn.toLowerCase().includes(q) ||
                                tr.destination.toLowerCase().includes(q)
                              );
                            })
                            .map((tr) => (
                              <tr key={tr.id} className="hover:bg-[#142438]/40">
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-[#F4F7FB]">
                                    <span className="font-mono text-[#C8A76A]">{tr.code}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>{tr.titleKu}</span>
                                  </div>
                                  <div className="text-[11px] text-[#AAB7C7]">
                                    {tr.titleAr} · {tr.titleEn}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-[#AAB7C7]">
                                  <div>{tr.destination}</div>
                                  <div className="font-mono text-[11px]">
                                    {formatBaghdadDateTime(tr.departureAt, locale)}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-end font-mono tabular-nums font-semibold text-[#C8A76A]">
                                  {formatMoney(tr.priceAmount, tr.currency, locale)}
                                </td>
                                <td className="py-3 px-4 text-end font-mono tabular-nums">
                                  {tr.availableSeats} / {tr.totalCapacity}
                                </td>
                                <td className="py-3 px-4 font-mono text-[11px]">
                                  {tr.status.toUpperCase()}
                                </td>
                                <td className="py-3 px-4 text-end space-x-2 rtl:space-x-reverse">
                                  {tr.status === 'draft' && can('trips.publish') && (
                                    <button
                                      type="button"
                                      onClick={() => handleTripStatusChange(tr.id, 'published')}
                                      className="px-2.5 py-1 rounded bg-emerald-700/80 text-white hover:bg-emerald-600"
                                    >
                                      {t.publish}
                                    </button>
                                  )}
                                  {tr.status !== 'archived' && can('trips.update') && (
                                    <button
                                      type="button"
                                      onClick={() => handleTripStatusChange(tr.id, 'archived')}
                                      className="px-2.5 py-1 rounded bg-[#142438] border border-[#547DA8]/30 text-[#AAB7C7] hover:text-white"
                                    >
                                      {t.archive}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    TAB 3: BOOKINGS MANAGEMENT (Concurrency-Safe + Manifest)
                   =========================================================== */}
                {activeTab === 'bookings' && (
                  <div className="space-y-6">
                    <div className="ravan-surface rounded-xl overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#142438] text-[#AAB7C7] border-b border-[#547DA8]/20">
                          <tr>
                            <th className="py-3 px-4 text-start">Booking Code</th>
                            <th className="py-3 px-4 text-start">Customer · Trip</th>
                            <th className="py-3 px-4 text-end">Pax</th>
                            <th className="py-3 px-4 text-end">Total · Paid · Debt</th>
                            <th className="py-3 px-4 text-start">Status · Seats Held</th>
                            <th className="py-3 px-4 text-end">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#547DA8]/15">
                          {bookingsData.bookings.map((bk) => {
                            const cust = bookingsData.customers.find((c) => c.id === bk.customerId);
                            const tr = bookingsData.trips.find((t) => t.id === bk.tripId);
                            const debt = Math.max(0, bk.totalAmount - bk.paidAmount);
                            return (
                              <tr key={bk.id} className="hover:bg-[#142438]/40">
                                <td className="py-3 px-4 font-mono font-semibold text-[#C8A76A]">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedBookingId(
                                        selectedBookingId === bk.id ? null : bk.id
                                      )
                                    }
                                    className="underline hover:text-white"
                                  >
                                    {bk.bookingCode}
                                  </button>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-medium text-[#F4F7FB]">
                                    {cust?.fullName || `Customer #${bk.customerId}`}
                                  </div>
                                  <div className="text-[11px] text-[#AAB7C7]">
                                    {tr?.code} · {tr?.titleKu}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-end font-mono tabular-nums">
                                  {bk.passengerCount}
                                </td>
                                <td className="py-3 px-4 text-end font-mono tabular-nums">
                                  <div>{formatMoney(bk.totalAmount, bk.currency, locale)}</div>
                                  <div className="text-[11px] text-emerald-400">
                                    Paid: {formatMoney(bk.paidAmount, bk.currency, locale)} · Debt:{' '}
                                    <span className="text-amber-300">
                                      {formatMoney(debt, bk.currency, locale)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 font-mono text-[11px]">
                                  <span>{bk.status.toUpperCase()}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{bk.seatsReserved ? 'SEATS HELD' : 'RELEASED'}</span>
                                </td>
                                <td className="py-3 px-4 text-end space-x-1.5 rtl:space-x-reverse">
                                  {bk.status === 'pending' && can('bookings.approve') && (
                                    <button
                                      type="button"
                                      onClick={() => handleBookingStatusChange(bk.id, 'approved')}
                                      className="px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-600"
                                    >
                                      {t.approve}
                                    </button>
                                  )}
                                  {bk.status !== 'cancelled' && can('bookings.cancel') && (
                                    <button
                                      type="button"
                                      onClick={() => handleBookingStatusChange(bk.id, 'cancelled')}
                                      className="px-2.5 py-1 rounded bg-red-900/70 text-red-200 hover:bg-red-800"
                                    >
                                      {t.cancel}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Selected Booking Passenger Manifest & Status Audit History */}
                    {selectedBookingId && (
                      <div className="ravan-panel rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                        <div className="space-y-2">
                          <h3 className="font-semibold text-[#C8A76A]">
                            Passenger Manifest (Booking #{selectedBookingId})
                          </h3>
                          <ul className="space-y-1.5 text-[#F4F7FB]">
                            {bookingsData.passengers
                              .filter((p) => p.bookingId === selectedBookingId)
                              .map((p) => (
                                <li key={p.id} className="font-mono">
                                  {p.fullName} · {p.ageGroup} · {p.phone || '—'}
                                </li>
                              ))}
                          </ul>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-semibold text-[#C8A76A]">
                            Immutable Status History
                          </h3>
                          <ul className="space-y-1.5 text-[#AAB7C7]">
                            {bookingsData.statusHistory
                              .filter((h) => h.bookingId === selectedBookingId)
                              .map((h) => (
                                <li key={h.id} className="font-mono">
                                  {h.fromStatus} → {h.toStatus} · {h.reason} ·{' '}
                                  {formatBaghdadDateTime(h.createdAt, locale)}
                                </li>
                              ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ===========================================================
                    TAB 4: CUSTOMERS (CRM with Separated IQD & USD Balances)
                   =========================================================== */}
                {activeTab === 'customers' && (
                  <div className="ravan-surface rounded-xl overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-[#142438] text-[#AAB7C7] border-b border-[#547DA8]/20">
                        <tr>
                          <th className="py-3 px-4 text-start">Customer Name</th>
                          <th className="py-3 px-4 text-start">Normalized Phone · Email</th>
                          <th className="py-3 px-4 text-end">Bookings</th>
                          <th className="py-3 px-4 text-end">IQD (Paid · Debt)</th>
                          <th className="py-3 px-4 text-end">USD (Paid · Debt)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#547DA8]/15">
                        {customersList.map((c) => (
                          <tr key={c.id} className="hover:bg-[#142438]/40">
                            <td className="py-3 px-4 font-medium text-[#F4F7FB]">
                              <div>{c.fullName}</div>
                              <div className="text-[11px] text-[#AAB7C7]">{c.notes}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-[#AAB7C7]">
                              {c.phone} {c.email ? `· ${c.email}` : ''}
                            </td>
                            <td className="py-3 px-4 text-end font-mono tabular-nums">
                              {c.bookingCount}
                            </td>
                            <td className="py-3 px-4 text-end font-mono tabular-nums">
                              <span className="text-emerald-400">
                                {formatMoney(c.paidIqd, 'IQD', locale)}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className="text-amber-300">
                                {formatMoney(c.debtIqd, 'IQD', locale)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-end font-mono tabular-nums">
                              <span className="text-emerald-400">
                                {formatMoney(c.paidUsd, 'USD', locale)}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className="text-amber-300">
                                {formatMoney(c.debtUsd, 'USD', locale)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ===========================================================
                    TAB 5: FINANCE & TRIP PROFITABILITY (IQD & USD Separated)
                   =========================================================== */}
                {activeTab === 'finance' && financeData && (
                  <div className="space-y-8">
                    {/* Trip-Level Profitability Table */}
                    <div className="ravan-surface rounded-xl p-6 space-y-4">
                      <h2 className="text-sm font-semibold text-[#F4F7FB]">
                        Trip-Level Profitability (Collected Net Payments − Trip Expenses)
                      </h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                            <tr>
                              <th className="py-2 text-start">Trip Code · Title</th>
                              <th className="py-2 text-start">Currency</th>
                              <th className="py-2 text-end">Collected Cash</th>
                              <th className="py-2 text-end">Trip Expenses</th>
                              <th className="py-2 text-end">Trip Net Profit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#547DA8]/15">
                            {financeData.tripProfitability.map((tp: any) => (
                              <tr key={tp.tripId}>
                                <td className="py-2.5">
                                  <span className="font-mono text-[#C8A76A]">{tp.code}</span> ·{' '}
                                  {tp.titleKu}
                                </td>
                                <td className="py-2.5 font-mono">{tp.currency}</td>
                                <td className="py-2.5 text-end font-mono tabular-nums text-emerald-400">
                                  {formatMoney(tp.collected, tp.currency, locale)}
                                </td>
                                <td className="py-2.5 text-end font-mono tabular-nums text-red-300">
                                  {formatMoney(tp.expenses, tp.currency, locale)}
                                </td>
                                <td className="py-2.5 text-end font-mono tabular-nums font-bold text-[#C8A76A]">
                                  {formatMoney(tp.netProfit, tp.currency, locale)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Immutable Payments / Refunds Ledger & Expenses */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="ravan-surface rounded-xl p-6 space-y-3">
                        <h3 className="text-sm font-semibold text-[#F4F7FB]">
                          Payments, Refunds & Adjustments Ledger (Append-Only)
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                              <tr>
                                <th className="py-2 text-start">Type · Method</th>
                                <th className="py-2 text-start">Reference</th>
                                <th className="py-2 text-end">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#547DA8]/15">
                              {financeData.payments.map((p: any) => (
                                <tr key={p.id}>
                                  <td className="py-2.5">
                                    <span className="font-mono uppercase">{p.entryType}</span> ·{' '}
                                    <span className="text-[#AAB7C7]">{p.paymentMethod}</span>
                                  </td>
                                  <td className="py-2.5 font-mono text-[#AAB7C7]">
                                    {p.referenceCode || '—'}
                                  </td>
                                  <td className="py-2.5 text-end font-mono tabular-nums font-semibold">
                                    {formatMoney(p.amount, p.currency, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="ravan-surface rounded-xl p-6 space-y-3">
                        <h3 className="text-sm font-semibold text-[#F4F7FB]">
                          Recorded Expenses
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                              <tr>
                                <th className="py-2 text-start">Title · Category</th>
                                <th className="py-2 text-start">Vendor</th>
                                <th className="py-2 text-end">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#547DA8]/15">
                              {financeData.expenses.map((ex: any) => (
                                <tr key={ex.id}>
                                  <td className="py-2.5">
                                    <div className="text-[#F4F7FB]">{ex.title}</div>
                                    <div className="text-[11px] text-[#AAB7C7]">
                                      {ex.categoryName}
                                    </div>
                                  </td>
                                  <td className="py-2.5 text-[#AAB7C7]">
                                    {ex.vendorName || '—'}
                                  </td>
                                  <td className="py-2.5 text-end font-mono tabular-nums text-red-300">
                                    {formatMoney(ex.amount, ex.currency, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    TAB 6: TEAM MEMBERS, GUIDES & FLEET VEHICLES
                   =========================================================== */}
                {activeTab === 'team' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Invite Staff Form */}
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await apiFetch('/api/members/invite', {
                              method: 'POST',
                              body: JSON.stringify(inviteForm),
                            });
                            setInviteForm({ email: '', role: 'booking_agent' });
                            await loadActiveTabData();
                            setBannerMessage({ type: 'success', text: 'Staff invitation created.' });
                          } catch (err: any) {
                            setBannerMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="ravan-surface rounded-xl p-5 space-y-3 text-xs"
                      >
                        <h3 className="font-semibold text-[#F4F7FB]">{t.inviteMember}</h3>
                        <input
                          type="email"
                          required
                          placeholder="staff@company.com"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                          className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                        />
                        <select
                          value={inviteForm.role}
                          onChange={(e) =>
                            setInviteForm({ ...inviteForm, role: e.target.value as Role })
                          }
                          className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                        >
                          <option value="company_manager">company_manager</option>
                          <option value="booking_agent">booking_agent</option>
                          <option value="accountant">accountant</option>
                          <option value="tour_guide">tour_guide</option>
                        </select>
                        <button
                          type="submit"
                          disabled={!can('members.invite')}
                          className="w-full py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold disabled:opacity-40"
                        >
                          {t.inviteMember}
                        </button>
                      </form>

                      {/* Add Guide Form */}
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await apiFetch('/api/guides', {
                              method: 'POST',
                              body: JSON.stringify(guideForm),
                            });
                            setGuideForm({
                              fullName: '',
                              phone: '+964750',
                              specialty: 'Mountain & Cultural Tours',
                            });
                            await loadActiveTabData();
                            setBannerMessage({ type: 'success', text: 'Tour guide added.' });
                          } catch (err: any) {
                            setBannerMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="ravan-surface rounded-xl p-5 space-y-3 text-xs"
                      >
                        <h3 className="font-semibold text-[#F4F7FB]">{t.addGuide}</h3>
                        <input
                          type="text"
                          required
                          placeholder="Guide Full Name"
                          value={guideForm.fullName}
                          onChange={(e) => setGuideForm({ ...guideForm, fullName: e.target.value })}
                          className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                        />
                        <input
                          type="text"
                          required
                          placeholder="+964750..."
                          value={guideForm.phone}
                          onChange={(e) => setGuideForm({ ...guideForm, phone: e.target.value })}
                          className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                        />
                        <button
                          type="submit"
                          disabled={!can('trips.update')}
                          className="w-full py-2 rounded-lg bg-[#547DA8] text-white font-semibold disabled:opacity-40"
                        >
                          {t.addGuide}
                        </button>
                      </form>

                      {/* Add Vehicle Form */}
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await apiFetch('/api/vehicles', {
                              method: 'POST',
                              body: JSON.stringify(vehicleForm),
                            });
                            setVehicleForm({
                              name: '',
                              plateNumber: '',
                              capacity: 24,
                              driverName: '',
                            });
                            await loadActiveTabData();
                            setBannerMessage({ type: 'success', text: 'Vehicle added to fleet.' });
                          } catch (err: any) {
                            setBannerMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="ravan-surface rounded-xl p-5 space-y-3 text-xs"
                      >
                        <h3 className="font-semibold text-[#F4F7FB]">{t.addVehicle}</h3>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Mercedes Sprinter #02"
                          value={vehicleForm.name}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                          className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Plate (EBL-...)"
                            value={vehicleForm.plateNumber}
                            onChange={(e) =>
                              setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })
                            }
                            className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                          />
                          <input
                            type="number"
                            min={1}
                            required
                            value={vehicleForm.capacity}
                            onChange={(e) =>
                              setVehicleForm({
                                ...vehicleForm,
                                capacity: Number(e.target.value),
                              })
                            }
                            className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!can('trips.update')}
                          className="w-full py-2 rounded-lg bg-[#547DA8] text-white font-semibold disabled:opacity-40"
                        >
                          {t.addVehicle}
                        </button>
                      </form>
                    </div>

                    {/* Members, Guides & Vehicles Lists */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
                      <div className="ravan-surface rounded-xl p-5 space-y-3">
                        <h4 className="font-semibold text-[#C8A76A]">
                          Organization Members ({teamData.members.length})
                        </h4>
                        <ul className="space-y-2">
                          {teamData.members.map((m) => (
                            <li
                              key={m.id}
                              className="flex items-center justify-between border-b border-[#547DA8]/15 pb-2"
                            >
                              <div>
                                <div className="text-[#F4F7FB] font-medium">{m.userEmail}</div>
                                <div className="font-mono text-[11px] text-[#AAB7C7]">
                                  {m.role} · {m.status}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="ravan-surface rounded-xl p-5 space-y-3">
                        <h4 className="font-semibold text-[#C8A76A]">
                          Tour Guides ({teamData.guides.length})
                        </h4>
                        <ul className="space-y-2">
                          {teamData.guides.map((g) => (
                            <li
                              key={g.id}
                              className="flex items-center justify-between border-b border-[#547DA8]/15 pb-2"
                            >
                              <div>
                                <div className="text-[#F4F7FB] font-medium">{g.fullName}</div>
                                <div className="font-mono text-[11px] text-[#AAB7C7]">
                                  {g.phone} · {g.specialty}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="ravan-surface rounded-xl p-5 space-y-3">
                        <h4 className="font-semibold text-[#C8A76A]">
                          Fleet Vehicles ({teamData.vehicles.length})
                        </h4>
                        <ul className="space-y-2">
                          {teamData.vehicles.map((v) => (
                            <li
                              key={v.id}
                              className="flex items-center justify-between border-b border-[#547DA8]/15 pb-2"
                            >
                              <div>
                                <div className="text-[#F4F7FB] font-medium">{v.name}</div>
                                <div className="font-mono text-[11px] text-[#AAB7C7]">
                                  {v.plateNumber} · {v.capacity} seats
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    TAB 7: IN-APP NOTIFICATIONS
                   =========================================================== */}
                {activeTab === 'notifications' && dashboardData && (
                  <div className="ravan-surface rounded-xl p-6 space-y-4">
                    <h2 className="text-sm font-semibold text-[#F4F7FB]">
                      {t.navNotifications} ({dashboardData.notifications.length})
                    </h2>
                    <div className="divide-y divide-[#547DA8]/15 text-xs">
                      {dashboardData.notifications.map((n: any) => (
                        <div
                          key={n.id}
                          className="py-3 flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="font-semibold text-[#F4F7FB]">
                              {locale === 'en'
                                ? n.titleEn || n.titleKu
                                : locale === 'ar'
                                ? n.titleAr || n.titleKu
                                : n.titleKu}
                            </div>
                            <div className="text-[#AAB7C7]">
                              {locale === 'en'
                                ? n.bodyEn || n.bodyKu
                                : locale === 'ar'
                                ? n.bodyAr || n.bodyKu
                                : n.bodyKu}
                            </div>
                          </div>
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/notifications/${n.id}/read`, {
                                  method: 'PATCH',
                                });
                                await loadActiveTabData();
                              }}
                              className="px-3 py-1 rounded bg-[#142438] border border-[#547DA8]/30 text-[#C8A76A] whitespace-nowrap shrink-0"
                            >
                              Mark Read
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    TAB 8: ORGANIZATION SETTINGS, SUBSCRIPTION & DRY-RUN TOOL
                   =========================================================== */}
                {activeTab === 'settings' && dashboardData && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Booking & Capacity Policy Settings */}
                      <div className="ravan-surface rounded-xl p-6 space-y-4 text-xs">
                        <h3 className="text-sm font-semibold text-[#F4F7FB]">
                          Organization Booking & Capacity Policy
                        </h3>
                        <p className="text-[#AAB7C7]">
                          Seat Reservation Policy determines whether seats are deducted from trip capacity when a booking is created (`on_pending`) or only when approved (`on_approved`).
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={!can('settings.manage')}
                            onClick={async () => {
                              await apiFetch('/api/settings', {
                                method: 'PATCH',
                                body: JSON.stringify({ seatReserveMode: 'on_pending' }),
                              });
                              await loadActiveTabData();
                              setBannerMessage({
                                type: 'success',
                                text: 'Seat Reserve Mode set to on_pending.',
                              });
                            }}
                            className={`px-4 py-2 rounded-lg font-mono ${
                              dashboardData.settings?.seatReserveMode === 'on_pending'
                                ? 'bg-[#C8A76A] text-[#0A101A] font-semibold'
                                : 'bg-[#0A101A] border border-[#547DA8]/30 text-[#AAB7C7]'
                            }`}
                          >
                            on_pending (Default)
                          </button>
                          <button
                            type="button"
                            disabled={!can('settings.manage')}
                            onClick={async () => {
                              await apiFetch('/api/settings', {
                                method: 'PATCH',
                                body: JSON.stringify({ seatReserveMode: 'on_approved' }),
                              });
                              await loadActiveTabData();
                              setBannerMessage({
                                type: 'success',
                                text: 'Seat Reserve Mode set to on_approved.',
                              });
                            }}
                            className={`px-4 py-2 rounded-lg font-mono ${
                              dashboardData.settings?.seatReserveMode === 'on_approved'
                                ? 'bg-[#C8A76A] text-[#0A101A] font-semibold'
                                : 'bg-[#0A101A] border border-[#547DA8]/30 text-[#AAB7C7]'
                            }`}
                          >
                            on_approved
                          </button>
                        </div>
                      </div>

                      {/* Subscription Status & Unvalidated Proposal Disclaimer */}
                      <div className="ravan-surface rounded-xl p-6 space-y-3 text-xs">
                        <h3 className="text-sm font-semibold text-[#F4F7FB]">
                          SaaS Subscription & Entitlement Status
                        </h3>
                        <div className="font-mono text-[#C8A76A]">
                          Plan: {dashboardData.subscription?.planCode?.toUpperCase()} · Status:{' '}
                          {dashboardData.subscription?.status?.toUpperCase()}
                        </div>
                        <div className="text-[#AAB7C7]">
                          Renewal Date:{' '}
                          {formatBaghdadDateOnly(dashboardData.subscription?.renewalDate, locale)}
                        </div>
                        <div className="p-3 rounded-lg bg-[#0A101A] border border-amber-500/30 text-amber-200/90 leading-relaxed">
                          {t.proposalPriceDisclaimer}
                        </div>
                      </div>
                    </div>

                    {/* KURDIA Boundary & Dry-Run Validator (Section 4) */}
                    <div className="ravan-panel rounded-xl p-6 space-y-4 text-xs">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[#C8A76A]">
                          Safe Data Import Dry-Run Validator (Zero DB Mutation)
                        </h3>
                        <span className="font-mono text-[11px] text-[#AAB7C7]">
                          Rule 4 Compliance
                        </span>
                      </div>
                      <p className="text-[#AAB7C7]">{t.kurdiaSafetyNote}</p>
                      <textarea
                        rows={5}
                        value={dryRunInput}
                        onChange={(e) => setDryRunInput(e.target.value)}
                        className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 p-3 font-mono text-xs text-[#F4F7FB]"
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={handleRunDryRunValidator}
                          className="px-4 py-2 rounded-lg bg-[#547DA8] text-white font-semibold hover:bg-[#466b91]"
                        >
                          Run Dry-Run Validation Only
                        </button>
                        {dryRunResult && (
                          <div className="font-mono">
                            Valid: <span className="text-emerald-400">{dryRunResult.validCount}</span>{' '}
                            · Invalid:{' '}
                            <span className="text-red-400">{dryRunResult.invalidCount}</span> · DB
                            Mutated: <span className="text-[#C8A76A]">false</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    TAB 9: PLATFORM SUPER ADMIN CONSOLE (Separated & Audited)
                   =========================================================== */}
                {activeTab === 'super-admin' && platformData && (
                  <div className="space-y-8">
                    <div className="ravan-panel rounded-xl p-6 space-y-4">
                      <h2 className="text-sm font-semibold text-[#C8A76A]">
                        Platform Organizations & Subscriptions ({platformData.organizations.length})
                      </h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                            <tr>
                              <th className="py-2 text-start">ID · Organization</th>
                              <th className="py-2 text-start">Slug · Currency</th>
                              <th className="py-2 text-start">Status</th>
                              <th className="py-2 text-end">Platform Action (Audited)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#547DA8]/15">
                            {platformData.organizations.map((org) => (
                              <tr key={org.id}>
                                <td className="py-3 font-medium text-[#F4F7FB]">
                                  #{org.id} · {org.name}
                                </td>
                                <td className="py-3 font-mono text-[#AAB7C7]">
                                  {org.slug} · {org.defaultCurrency}
                                </td>
                                <td className="py-3 font-mono uppercase text-[#C8A76A]">
                                  {org.status}
                                </td>
                                <td className="py-3 text-end space-x-2 rtl:space-x-reverse">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextStatus =
                                        org.status === 'suspended' ? 'active' : 'suspended';
                                      await apiFetch(
                                        `/api/platform/organizations/${org.id}/status`,
                                        {
                                          method: 'PATCH',
                                          body: JSON.stringify({ status: nextStatus }),
                                        }
                                      );
                                      await loadActiveTabData();
                                    }}
                                    className="px-3 py-1 rounded bg-[#0A101A] border border-[#547DA8]/30 text-[#F4F7FB]"
                                  >
                                    {org.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Platform Audit Logs */}
                    <div className="ravan-surface rounded-xl p-6 space-y-4">
                      <h3 className="text-sm font-semibold text-[#F4F7FB]">
                        Platform & Tenant Security Audit Logs (Latest 50)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                          <thead className="text-[#AAB7C7] border-b border-[#547DA8]/20">
                            <tr>
                              <th className="py-2 text-start">Timestamp (Baghdad)</th>
                              <th className="py-2 text-start">Org ID</th>
                              <th className="py-2 text-start">Actor</th>
                              <th className="py-2 text-start">Action</th>
                              <th className="py-2 text-start">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#547DA8]/10">
                            {platformData.auditLogs.map((log) => (
                              <tr key={log.id}>
                                <td className="py-2 text-[#AAB7C7]">
                                  {formatBaghdadDateTime(log.createdAt, locale)}
                                </td>
                                <td className="py-2 text-[#C8A76A]">
                                  {log.organizationId || 'PLATFORM'}
                                </td>
                                <td className="py-2">{log.actorEmail || log.actorUid}</td>
                                <td className="py-2 text-emerald-400">{log.action}</td>
                                <td className="py-2 text-[#AAB7C7]">{log.details}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          WORKSPACE MODALS (Create Trip, Create Booking, Customer, Payment, Expense)
         ===================================================================== */}
      {showCreateTripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-xl bg-[#142438] border border-[#547DA8]/30 p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-[#F4F7FB]">{t.createTrip}</h3>
            <form onSubmit={handleCreateTrip} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#AAB7C7] mb-1">Trip Code</label>
                <input
                  type="text"
                  required
                  value={tripForm.code}
                  onChange={(e) => setTripForm({ ...tripForm, code: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Destination</label>
                <input
                  type="text"
                  required
                  value={tripForm.destination}
                  onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[#AAB7C7] mb-1">Title (Kurdish Sorani — Required)</label>
                <input
                  type="text"
                  required
                  value={tripForm.titleKu}
                  onChange={(e) => setTripForm({ ...tripForm, titleKu: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Title (Arabic)</label>
                <input
                  type="text"
                  value={tripForm.titleAr}
                  onChange={(e) => setTripForm({ ...tripForm, titleAr: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Title (English)</label>
                <input
                  type="text"
                  value={tripForm.titleEn}
                  onChange={(e) => setTripForm({ ...tripForm, titleEn: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Price Amount (Integer)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={tripForm.priceAmount}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, priceAmount: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Currency (IQD / USD)</label>
                <select
                  value={tripForm.currency}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, currency: e.target.value as 'IQD' | 'USD' })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                >
                  <option value="IQD">IQD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Total Seat Capacity</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={tripForm.totalCapacity}
                  onChange={(e) =>
                    setTripForm({ ...tripForm, totalCapacity: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Initial Status</label>
                <select
                  value={tripForm.status}
                  onChange={(e) => setTripForm({ ...tripForm, status: e.target.value as any })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                >
                  <option value="published">published</option>
                  <option value="draft">draft</option>
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateTripModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#547DA8]/30 text-[#AAB7C7]"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#142438] border border-[#547DA8]/30 p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-[#F4F7FB]">{t.createBooking}</h3>
            <form onSubmit={handleCreateBooking} className="space-y-3">
              <div>
                <label className="block text-[#AAB7C7] mb-1">Select Trip</label>
                <select
                  required
                  value={bookingForm.tripId}
                  onChange={(e) =>
                    setBookingForm({ ...bookingForm, tripId: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                >
                  <option value={0}>-- Select Trip --</option>
                  {bookingsData.trips.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.code} · {tr.titleKu} ({tr.availableSeats} seats left · {tr.priceAmount}{' '}
                      {tr.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Existing Customer (or 0 for New)</label>
                <select
                  value={bookingForm.customerId}
                  onChange={(e) =>
                    setBookingForm({ ...bookingForm, customerId: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                >
                  <option value={0}>+ Create New Customer</option>
                  {bookingsData.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>
              {bookingForm.customerId === 0 && (
                <>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">New Customer Full Name</label>
                    <input
                      type="text"
                      required
                      value={bookingForm.customerName}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, customerName: e.target.value })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#AAB7C7] mb-1">New Customer Phone</label>
                    <input
                      type="text"
                      required
                      value={bookingForm.customerPhone}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, customerPhone: e.target.value })
                      }
                      className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-[#AAB7C7] mb-1">Passenger Count</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={bookingForm.passengerCount}
                  onChange={(e) =>
                    setBookingForm({ ...bookingForm, passengerCount: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateBookingModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#547DA8]/30 text-[#AAB7C7]"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreateCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#142438] border border-[#547DA8]/30 p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-[#F4F7FB]">{t.createCustomer}</h3>
            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-[#AAB7C7] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={customerForm.fullName}
                  onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Phone (+964...)</label>
                <input
                  type="text"
                  required
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Notes</label>
                <input
                  type="text"
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCustomerModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#547DA8]/30 text-[#AAB7C7]"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRecordPaymentModal && financeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#142438] border border-[#547DA8]/30 p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-[#F4F7FB]">{t.recordPayment}</h3>
            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-[#AAB7C7] mb-1">Select Booking</label>
                <select
                  required
                  value={paymentForm.bookingId}
                  onChange={(e) => {
                    const bkId = Number(e.target.value);
                    const bk = financeData.bookings.find((b: any) => b.id === bkId);
                    setPaymentForm({
                      ...paymentForm,
                      bookingId: bkId,
                      currency: (bk?.currency || 'IQD') as 'IQD' | 'USD',
                    });
                  }}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                >
                  <option value={0}>-- Select Booking --</option>
                  {financeData.bookings.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.bookingCode} · Total: {b.totalAmount} {b.currency} · Paid: {b.paidAmount}{' '}
                      {b.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#AAB7C7] mb-1">Entry Type</label>
                  <select
                    value={paymentForm.entryType}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        entryType: e.target.value as 'payment' | 'refund' | 'adjustment',
                      })
                    }
                    className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                  >
                    <option value="payment">payment</option>
                    <option value="refund">refund (reversal)</option>
                    <option value="adjustment">adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#AAB7C7] mb-1">Currency (Locked to Booking)</label>
                  <input
                    type="text"
                    readOnly
                    value={paymentForm.currency}
                    className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#C8A76A]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Amount</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Reference Code</label>
                <input
                  type="text"
                  value={paymentForm.referenceCode}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, referenceCode: e.target.value })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecordPaymentModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#547DA8]/30 text-[#AAB7C7]"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRecordExpenseModal && financeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#142438] border border-[#547DA8]/30 p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-[#F4F7FB]">{t.recordExpense}</h3>
            <form onSubmit={handleRecordExpense} className="space-y-3">
              <div>
                <label className="block text-[#AAB7C7] mb-1">Expense Title</label>
                <input
                  type="text"
                  required
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                />
              </div>
              <div>
                <label className="block text-[#AAB7C7] mb-1">Linked Trip (Optional)</label>
                <select
                  value={expenseForm.tripId}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, tripId: Number(e.target.value) })
                  }
                  className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                >
                  <option value={0}>General Organization Expense</option>
                  {financeData.trips.map((tr: any) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.code} · {tr.titleKu} ({tr.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#AAB7C7] mb-1">Amount</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={expenseForm.amount}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })
                    }
                    className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 font-mono text-[#F4F7FB]"
                  />
                </div>
                <div>
                  <label className="block text-[#AAB7C7] mb-1">Currency</label>
                  <select
                    value={expenseForm.currency}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        currency: e.target.value as 'IQD' | 'USD',
                      })
                    }
                    className="w-full rounded-lg bg-[#0A101A] border border-[#547DA8]/30 px-3 py-2 text-[#F4F7FB]"
                  >
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecordExpenseModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#547DA8]/30 text-[#AAB7C7]"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#C8A76A] text-[#0A101A] font-semibold"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quiet Footer (No fake telemetry tickers) */}
      <footer className="px-6 py-4 border-t border-[#547DA8]/15 text-xs text-[#AAB7C7] flex flex-wrap items-center justify-between gap-4">
        <div>
          <span>RAVAN — Travel Business Operating System</span>
          <span aria-hidden="true"> · </span>
          <span>One platform. Every journey.</span>
        </div>
        <div>
          <span>Multi-Tenant PostgreSQL</span>
          <span aria-hidden="true"> · </span>
          <span>IQD & USD Separated Accounting</span>
          <span aria-hidden="true"> · </span>
          <span>Asia/Baghdad</span>
        </div>
      </footer>
    </div>
  );
}
