/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { getDirection, Locale, translations } from './lib/i18n.ts';
import { formatMoney } from './lib/money.ts';
import { formatBaghdadDateOnly, formatBaghdadDateTime } from './lib/dates.ts';
import { hasPermission, Permission, Role } from './lib/permissions.ts';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { TripOperationsModal } from './components/TripOperationsModal.tsx';
import { SubscriptionPortal } from './components/SubscriptionPortal.tsx';
import { ReportsAndSupportView } from './components/ReportsAndSupportView.tsx';
import { SuperAdminConsole } from './components/SuperAdminConsole.tsx';
import { PublicSaaSMarketingSection } from './components/PublicSaaSMarketingSection.tsx';
import { CompanyPublicPage } from './components/CompanyPublicPage.tsx';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Compass,
  Copy,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  List,
  LogOut,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Upload,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';

type WorkspaceTab =
  | 'dashboard'
  | 'trips'
  | 'bookings'
  | 'customers'
  | 'finance'
  | 'team'
  | 'subscription'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'super-admin';

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

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

  // Check URL for dedicated single-trip link (?trip=CODE)
  const initialUrlParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      org: params.get('org')?.trim().toLowerCase() || '',
      trip: params.get('trip')?.trim() || null,
    };
  }, []);

  // When a trip link (?trip=CODE) is opened, we enter standalone single-trip mode
  const [selectedPublicTripCode, setSelectedPublicTripCode] = useState<string | null>(
    initialUrlParams.trip
  );
  const [publicOrgFilter, setPublicOrgFilter] = useState<string>(initialUrlParams.org);
  const [publicTripLoading, setPublicTripLoading] = useState<boolean>(Boolean(initialUrlParams.trip));
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Listen to browser back/forward navigation so URL ?trip=CODE stays in sync
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedPublicTripCode(params.get('trip')?.trim() || null);
      setPublicOrgFilter(params.get('org')?.trim().toLowerCase() || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [tripsViewMode, setTripsViewMode] = useState<'grid' | 'table'>('grid');
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Auto-dismiss success banners after 4.5s
  useEffect(() => {
    if (!bannerMessage || bannerMessage.type === 'error') return;
    const timer = setTimeout(() => setBannerMessage(null), 4500);
    return () => clearTimeout(timer);
  }, [bannerMessage]);

  // Workspace Module Data State
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [tripsData, setTripsData] = useState<{
    trips: any[];
    guides: any[];
    vehicles: any[];
    pickupPoints: any[];
    passengers?: any[];
    bookings?: any[];
  }>({ trips: [], guides: [], vehicles: [], pickupPoints: [], passengers: [], bookings: [] });
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
  const [platformData, setPlatformData] = useState<any | null>(null);
  const [operationsTripId, setOperationsTripId] = useState<number | null>(null);

  // Single-Trip Public Page State (Strictly Isolated to 1 Trip)
  const [publicTrips, setPublicTrips] = useState<any[]>([]);
  const [selectedPublicOrganization, setSelectedPublicOrganization] = useState<any | null>(null);
  const [showPublicLookupModal, setShowPublicLookupModal] = useState<boolean>(false);
  const [lookupCode, setLookupCode] = useState<string>('RVN-9K4M2P');
  const [lookupPhone, setLookupPhone] = useState<string>('+9647502223344');
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [submittingPublicBooking, setSubmittingPublicBooking] = useState<boolean>(false);
  const [publicRegistrationReceipt, setPublicRegistrationReceipt] = useState<{
    bookingCode: string;
    tripCode: string;
    tripTitle: string;
    organizationName: string;
    customerName: string;
    customerPhone: string;
    passengerCount: number;
    passengers: Array<{ fullName: string; ageGroup: string; phone?: string }>;
    totalAmount: number;
    currency: 'IQD' | 'USD';
    pickupPointName: string;
  } | null>(null);
  const [publicBookingForm, setPublicBookingForm] = useState({
    customerName: '',
    customerPhone: '+964750',
    customerEmail: '',
    passengerCount: 1,
    pickupPointName: '',
    customerNotes: '',
    passengers: [{ fullName: '', phone: '', ageGroup: 'adult' as 'adult' | 'child' | 'infant' }],
  });

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  // Modal Toggles
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
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
    logoUrl: '',
    contactPhone: '+964750',
    defaultLanguage: 'ku' as Locale,
    defaultCurrency: 'IQD' as 'IQD' | 'USD',
  });

  const [userProfileForm, setUserProfileForm] = useState({
    fullName: '',
    phone: '+964750',
    preferredLocale: 'ku' as Locale,
  });

  const [companyProfileForm, setCompanyProfileForm] = useState({
    name: '',
    slug: '',
    legalName: '',
    logoUrl: '',
    contactPhone: '',
    contactEmail: '',
    defaultCurrency: 'IQD' as 'IQD' | 'USD',
    defaultLanguage: 'ku' as Locale,
    cancellationPolicyText: '',
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
    includedServices: 'گواستنەوەی VIP، نانی بەیانی، ڕێبەری گەشت',
    requirements: 'ناسنامەی فەرمی یان کارتی نیشتمانی',
    coverImageUrl: '/images/choman.svg',
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

  // Fetch Single Public Trip when a dedicated trip link (?trip=CODE) is active
  const fetchPublicTrips = useCallback(async () => {
    if (!selectedPublicTripCode && !publicOrgFilter) {
      setPublicTripLoading(false);
      return;
    }
    setPublicTripLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedPublicTripCode) params.set('code', selectedPublicTripCode);
      if (publicOrgFilter) params.set('org', publicOrgFilter);
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/public/trips${query}`);
      const data = await res.json();
      if (res.ok) {
        setPublicTrips(data.trips || []);
        setSelectedPublicOrganization(data.selectedOrganization || null);
      }
    } catch (err) {
      console.error('Failed to fetch public trip:', err);
    } finally {
      setPublicTripLoading(false);
    }
  }, [selectedPublicTripCode, publicOrgFilter]);

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
      if (data.user) {
        setUserProfileForm({
          fullName: data.user.fullName || '',
          phone: data.user.phone || '+964750',
          preferredLocale: (data.user.preferredLocale as Locale) || 'ku',
        });
      }
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

  // Sync Company Profile Form whenever activeMembership changes
  useEffect(() => {
    if (activeMembership?.organization) {
      const o = activeMembership.organization;
      const s = activeMembership.settings;
      setCompanyProfileForm({
        name: o.name || '',
        slug: o.slug || '',
        legalName: o.legalName || '',
        logoUrl: o.logoUrl || '',
        contactPhone: o.contactPhone || '+964750',
        contactEmail: o.contactEmail || '',
        defaultCurrency: (o.defaultCurrency === 'USD' ? 'USD' : 'IQD') as 'IQD' | 'USD',
        defaultLanguage: (['ku', 'ar', 'en'].includes(o.defaultLanguage)
          ? o.defaultLanguage
          : 'ku') as Locale,
        cancellationPolicyText: s?.cancellationPolicyText || '',
      });
    }
  }, [activeMembership]);

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
      await loadActiveTabData();
      setBannerMessage({
        type: 'success',
        text: 'داتای تاقیکردنەوەی کۆمپانیاکان بە سەرکەوتوویی لە PostgreSQL ئامادە کرا.',
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
      setShowCreateOrgModal(false);
      setNewOrgForm({
        name: '',
        slug: '',
        legalName: '',
        logoUrl: '',
        contactPhone: '+964750',
        defaultLanguage: 'ku',
        defaultCurrency: 'IQD',
      });
      await loadWorkspaceProfile();
      if (res.organization?.id) {
        setActiveOrgId(res.organization.id);
      }
      setBannerMessage({
        type: 'success',
        text: `کۆمپانیای گەشتیاریی "${res.organization.name}" بە پڕۆفایلی سەربەخۆوە دروست کرا!`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify(userProfileForm),
      });
      setDbUser(res.user);
      setLocale((res.user.preferredLocale as Locale) || locale);
      setBannerMessage({
        type: 'success',
        text: 'پڕۆفایلی کەسیی بەکارهێنەر بە سەرکەوتوویی نوێ کرایەوە.',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateCompanyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/organization/profile', {
        method: 'PATCH',
        body: JSON.stringify(companyProfileForm),
      });
      await loadWorkspaceProfile();
      await loadActiveTabData();
      setBannerMessage({
        type: 'success',
        text: `پڕۆفایلی کۆمپانیای "${res.organization.name}" بە سەرکەوتوویی پاشەکەوت کرا.`,
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
      setBannerMessage({
        type: 'success',
        text: `گەشتی نوێ (${tripForm.code}) بە لینکی تایبەتی ناونوسینەوە دروست کرا!`,
      });
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
      setBannerMessage({ type: 'success', text: `دۆخی گەشت گۆڕدرا بۆ ${status}.` });
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
        text: 'حجزکردن بە سەرکەوتوویی تۆمار کرا و کورسییەکان جیاکرانەوە.',
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
      setBannerMessage({ type: 'success', text: `دۆخی حجزکردن گۆڕدرا بۆ ${status}.` });
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
      setCustomerForm({
        fullName: '',
        phone: '+964750',
        email: '',
        preferredLanguage: 'ku',
        notes: '',
      });
      await loadActiveTabData();
      setBannerMessage({ type: 'success', text: 'کڕیاری نوێ زیادکرا بۆ ناو لیستی کۆمپانیا.' });
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
        text: `بڕی ${paymentForm.amount} ${paymentForm.currency} لە دەفتەری ژمێریاریدا تۆمار کرا.`,
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
        text: `خەرجی (${expenseForm.amount} ${expenseForm.currency}) تۆمار کرا.`,
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

  // Exclusive Single-Trip Shareable Link (Every trip has its own isolated link)
  const getTripShareUrl = useCallback((code: string) => {
    return `${window.location.origin}/?trip=${encodeURIComponent(code)}`;
  }, []);

  // Copy exclusive trip registration link to clipboard
  const handleCopyTripLink = useCallback(
    async (code: string) => {
      const shareUrl = getTripShareUrl(code);
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2600);
        setBannerMessage({
          type: 'success',
          text: `${t.linkCopied} (${shareUrl})`,
        });
      } catch {
        setBannerMessage({
          type: 'info',
          text: shareUrl,
        });
      }
    },
    [getTripShareUrl, t.linkCopied]
  );

  // Open standalone single-trip public page (or exit back to workspace for admin preview)
  const openDedicatedTripPage = useCallback((code: string | null) => {
    setSelectedPublicTripCode(code);
    setPublicRegistrationReceipt(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('org');
    if (code) {
      url.searchParams.set('trip', code);
    } else {
      url.searchParams.delete('trip');
    }
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Synchronize dynamic passenger rows when passengerCount changes
  const updatePublicPassengerCount = (count: number, maxSeats = 50) => {
    const safeCount = Math.max(1, Math.min(maxSeats, count));
    setPublicBookingForm((prev) => {
      const nextPassengers = [...prev.passengers];
      while (nextPassengers.length < safeCount) {
        nextPassengers.push({ fullName: '', phone: '', ageGroup: 'adult' });
      }
      if (nextPassengers.length > safeCount) {
        nextPassengers.length = safeCount;
      }
      return {
        ...prev,
        passengerCount: safeCount,
        passengers: nextPassengers,
      };
    });
  };

  // Upload image file from device & compress to Data URL
  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onResult: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1200;
        const maxH = 675;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        if (h > maxH) {
          w = Math.round((w * maxH) / h);
          h = maxH;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.84);
          onResult(compressed);
        } else if (typeof reader.result === 'string') {
          onResult(reader.result);
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  // Resolve the single active trip for the standalone public page
  const selectedPublicTrip = useMemo(() => {
    if (!selectedPublicTripCode) return null;
    return (
      publicTrips.find(
        (tr) => tr.code.toLowerCase() === selectedPublicTripCode.toLowerCase()
      ) || null
    );
  }, [publicTrips, selectedPublicTripCode]);

  const handlePublicBookingSubmit = async (e: React.FormEvent, targetTrip?: any) => {
    e.preventDefault();
    const activeTrip = targetTrip || selectedPublicTrip;
    if (!activeTrip) return;

    setSubmittingPublicBooking(true);
    const preparedPassengers = publicBookingForm.passengers.map((p, idx) => ({
      fullName:
        p.fullName.trim() ||
        (idx === 0
          ? publicBookingForm.customerName.trim()
          : `${publicBookingForm.customerName.trim()} #${idx + 1}`),
      phone: p.phone?.trim() || (idx === 0 ? publicBookingForm.customerPhone.trim() : ''),
      ageGroup: p.ageGroup || 'adult',
    }));

    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: activeTrip.id,
          customerName: publicBookingForm.customerName,
          customerPhone: publicBookingForm.customerPhone,
          customerEmail: publicBookingForm.customerEmail,
          passengerCount: Number(publicBookingForm.passengerCount),
          pickupPointName:
            publicBookingForm.pickupPointName ||
            activeTrip.pickupPoints?.[0]?.pointName ||
            activeTrip.departureLocation,
          customerNotes: publicBookingForm.customerNotes,
          passengers: preparedPassengers,
          idempotencyKey: `pub-${activeTrip.id}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking request failed');
      setLookupCode(data.booking.bookingCode);
      setLookupPhone(publicBookingForm.customerPhone);
      setPublicRegistrationReceipt({
        bookingCode: data.booking.bookingCode,
        tripCode: activeTrip.code,
        tripTitle: activeTrip.titleKu,
        organizationName: activeTrip.organizationName,
        customerName: publicBookingForm.customerName,
        customerPhone: publicBookingForm.customerPhone,
        passengerCount: Number(publicBookingForm.passengerCount),
        passengers: preparedPassengers,
        totalAmount: data.booking.totalAmount,
        currency: data.booking.currency,
        pickupPointName:
          publicBookingForm.pickupPointName ||
          activeTrip.pickupPoints?.[0]?.pointName ||
          activeTrip.departureLocation,
      });
      await fetchPublicTrips();
      setBannerMessage({
        type: 'success',
        text: `${t.registrationSuccessTitle} (${data.booking.bookingCode})`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingPublicBooking(false);
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

  // ===========================================================================
  // STANDALONE SINGLE-TRIP PUBLIC REGISTRATION VIEW (?trip=CODE)
  // Strictly displays ONLY that single trip's details, company header, and
  // participant registration form — zero other trips or companies!
  // ===========================================================================
  if (selectedPublicTripCode) {
    const tripTitle = selectedPublicTrip
      ? locale === 'en'
        ? selectedPublicTrip.titleEn || selectedPublicTrip.titleKu
        : locale === 'ar'
        ? selectedPublicTrip.titleAr || selectedPublicTrip.titleKu
        : selectedPublicTrip.titleKu
      : '';

    const tripDesc = selectedPublicTrip
      ? locale === 'en'
        ? selectedPublicTrip.descriptionEn || selectedPublicTrip.descriptionKu
        : locale === 'ar'
        ? selectedPublicTrip.descriptionAr || selectedPublicTrip.descriptionKu
        : selectedPublicTrip.descriptionKu
      : '';

    const seatPercent = selectedPublicTrip
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((selectedPublicTrip.totalCapacity - selectedPublicTrip.availableSeats) /
                Math.max(1, selectedPublicTrip.totalCapacity)) *
                100
            )
          )
        )
      : 0;

    return (
      <div className="min-h-screen ravan-canvas text-[#F4F7FB] flex flex-col selection:bg-[#C8A76A] selection:text-[#070B12]">
        <OfflineIndicator message={t.offlineBanner} />

        {/* Dedicated Single-Trip Company Brand Header (No SaaS Admin Nav, No Multi-Company Links) */}
        <header className="sticky top-0 z-30 bg-[#070B12]/90 backdrop-blur-xl border-b border-white/[0.08]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
            {/* Organizing Travel Company Identity */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-[#101C2E] border border-[#C8A76A]/45 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
                {selectedPublicTrip?.organizationLogoUrl || selectedPublicOrganization?.logoUrl ? (
                  <img
                    src={
                      selectedPublicTrip?.organizationLogoUrl ||
                      selectedPublicOrganization?.logoUrl
                    }
                    alt={selectedPublicTrip?.organizationName || 'Travel Company'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold font-mono text-[#C8A76A]">
                    {(selectedPublicTrip?.organizationName || 'RV').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-bold text-[#F4F7FB] truncate">
                    {selectedPublicTrip?.organizationName ||
                      selectedPublicOrganization?.name ||
                      'پەڕەی فەرمیی تۆمارکردنی گەشت'}
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#C8A76A]/15 border border-[#C8A76A]/35 text-[10px] font-mono text-[#C8A76A]">
                    <ShieldCheck className="w-3 h-3" />
                    VERIFIED TRIP
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[#9BA9BC] font-mono">
                  <span>TRIP #{selectedPublicTripCode}</span>
                  {(selectedPublicTrip?.organizationPhone ||
                    selectedPublicOrganization?.contactPhone) && (
                    <span className="hidden sm:inline">
                      · 📞{' '}
                      {selectedPublicTrip?.organizationPhone ||
                        selectedPublicOrganization?.contactPhone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Actions: Check Existing Booking + Language Switcher */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowPublicLookupModal(true)}
                className="ravan-btn-secondary px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Ticket className="w-3.5 h-3.5 text-[#C8A76A]" />
                <span className="hidden sm:inline">{t.lookupBookingTitle}</span>
                <span className="sm:hidden">پشکنینی حجز</span>
              </button>

              <div className="flex items-center bg-[#101C2E] p-1 rounded-xl border border-white/[0.08]">
                {(['ku', 'ar', 'en'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLocale(lang)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      locale === lang
                        ? 'bg-[#C8A76A] text-[#070B12] font-bold shadow-sm'
                        : 'text-[#9BA9BC] hover:text-[#F4F7FB]'
                    }`}
                  >
                    {lang === 'ku' ? 'کوردی' : lang === 'ar' ? 'العربية' : 'EN'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Feedback Toast Banner */}
        <AnimatePresence>
          {bannerMessage && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className={`px-6 py-3 text-xs flex items-center justify-between border-b ${
                bannerMessage.type === 'error'
                  ? 'bg-red-950/80 border-red-500/40 text-red-200'
                  : bannerMessage.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                  : 'bg-[#101C2E] border-[#547DA8]/40 text-[#F4F7FB]'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="w-4 h-4 text-[#C8A76A] shrink-0" />
                <span>{bannerMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setBannerMessage(null)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Standalone Single-Trip Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 md:py-10">
          {publicTripLoading ? (
            <div className="ravan-panel rounded-3xl p-12 text-center space-y-4 max-w-xl mx-auto my-12">
              <RefreshCw className="w-8 h-8 text-[#C8A76A] animate-spin mx-auto" />
              <p className="text-sm text-[#9BA9BC]">
                ئامادەکردنی زانیارییەکانی گەشت ({selectedPublicTripCode})...
              </p>
            </div>
          ) : !selectedPublicTrip ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="ravan-panel rounded-3xl p-10 text-center space-y-5 max-w-lg mx-auto my-12"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-300">
                <Compass className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-[#F4F7FB]">
                  ئەم لینکەی گەشت نەدۆزرایەوە یان کۆتایی هاتووە
                </h1>
                <p className="text-xs text-[#9BA9BC] leading-relaxed">
                  کۆدی گەشت ({selectedPublicTripCode}) لە ئێستادا چالاک نییە. تکایە پەیوەندی بە کۆمپانیای گەشتیارییەوە بکە بۆ وەرگرتنی لینکی نوێ.
                </p>
              </div>
              {firebaseUser && (
                <button
                  type="button"
                  onClick={() => openDedicatedTripPage(null)}
                  className="ravan-btn-gold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>گەڕانەوە بۆ پانێڵی کۆمپانیا</span>
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* LEFT COLUMN (7 COLS): IMMERSIVE HERO & SINGLE-TRIP DETAILS */}
              <div className="lg:col-span-7 space-y-6">
                {/* Cinematic Cover Card */}
                <div className="ravan-panel rounded-3xl overflow-hidden">
                  <div className="relative h-72 sm:h-96 w-full bg-[#070B12] overflow-hidden">
                    <img
                      src={selectedPublicTrip.coverImageUrl || '/images/choman.svg'}
                      alt={tripTitle}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/images/choman.svg';
                      }}
                      className="w-full h-full object-cover scale-[1.01] transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#070B12] via-[#070B12]/40 to-transparent" />

                    {/* Top Floating Badges */}
                    <div className="absolute top-5 inset-x-5 flex items-center justify-between gap-3">
                      <span className="px-3.5 py-1.5 rounded-xl bg-[#070B12]/85 backdrop-blur-md border border-white/15 font-mono text-xs font-semibold text-[#C8A76A] flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5" />
                        <span>{selectedPublicTrip.code}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopyTripLink(selectedPublicTrip.code)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#070B12]/85 backdrop-blur-md border border-white/15 text-xs font-medium text-[#F4F7FB] hover:border-[#C8A76A]/60 flex items-center gap-1.5 transition-all"
                      >
                        {copiedCode === selectedPublicTrip.code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">لینک کۆپی کرا</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#C8A76A]" />
                            <span>{t.copyTripLink}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Bottom Hero Title & Price */}
                    <div className="absolute bottom-6 inset-x-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                      <div className="space-y-2 max-w-xl">
                        <div className="inline-flex items-center gap-2 text-xs text-[#E2C58B] font-medium">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>
                            {selectedPublicTrip.departureLocation} ← {selectedPublicTrip.destination}
                          </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#F4F7FB] leading-tight">
                          {tripTitle}
                        </h1>
                      </div>

                      <div className="bg-[#070B12]/90 backdrop-blur-xl border border-[#C8A76A]/50 rounded-2xl px-5 py-3 text-end shrink-0 shadow-2xl">
                        <span className="block text-[11px] text-[#9BA9BC]">نرخی یەک کەس</span>
                        <span className="font-mono tabular-nums text-xl sm:text-2xl font-bold text-[#D4B375]">
                          {formatMoney(
                            selectedPublicTrip.priceAmount,
                            selectedPublicTrip.currency,
                            locale
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Trip Body Content */}
                  <div className="p-6 sm:p-8 space-y-7">
                    {/* Live Seat Availability Meter */}
                    <div className="p-4 rounded-2xl bg-[#070B12]/70 border border-white/[0.07] space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#9BA9BC] font-medium flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-[#C8A76A]" />
                          <span>بارودۆخی کورسییەکانی ئەم گەشتە</span>
                        </span>
                        <span className="font-mono tabular-nums font-bold text-sm text-emerald-400">
                          {selectedPublicTrip.availableSeats} کورسی بەردەستە لە کۆی{' '}
                          {selectedPublicTrip.totalCapacity}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[#101C2E] overflow-hidden p-0.5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(8, 100 - seatPercent)}%` }}
                          transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                          className={`h-full rounded-full ${
                            selectedPublicTrip.availableSeats > 5
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : 'bg-gradient-to-r from-amber-500 to-orange-400'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Description */}
                    {tripDesc && (
                      <div className="space-y-2">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#C8A76A]">
                          دەربارەی ئەم گەشتە
                        </h2>
                        <p className="text-sm text-[#F4F7FB]/90 leading-relaxed">{tripDesc}</p>
                      </div>
                    )}

                    {/* 4-Card Logistics Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <div className="p-4 rounded-2xl bg-[#070B12]/65 border border-white/[0.07] flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-[#101C2E] text-[#C8A76A] shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[#9BA9BC] block">ڕێکەوت و کاتی دەرچوون</span>
                          <span className="font-mono font-semibold text-[#F4F7FB] mt-1 block">
                            {formatBaghdadDateTime(selectedPublicTrip.departureAt, locale)}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#070B12]/65 border border-white/[0.07] flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-[#101C2E] text-[#547DA8] shrink-0">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[#9BA9BC] block">ڕێکەوت و کاتی گەڕانەوە</span>
                          <span className="font-mono font-semibold text-[#F4F7FB] mt-1 block">
                            {formatBaghdadDateTime(selectedPublicTrip.returnAt, locale)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Services & Requirements */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-5 rounded-2xl bg-[#070B12]/55 border border-white/[0.07] space-y-2">
                        <div className="flex items-center gap-2 font-bold text-[#D4B375]">
                          <Sparkles className="w-4 h-4" />
                          <span>{t.includedServicesLabel}</span>
                        </div>
                        <p className="text-[#9BA9BC] leading-relaxed">
                          {selectedPublicTrip.includedServices || 'گواستنەوە و ڕێبەری گەشت'}
                        </p>
                      </div>

                      <div className="p-5 rounded-2xl bg-[#070B12]/55 border border-white/[0.07] space-y-2">
                        <div className="flex items-center gap-2 font-bold text-[#D4B375]">
                          <FileCheck2 className="w-4 h-4" />
                          <span>{t.requirementsLabel}</span>
                        </div>
                        <p className="text-[#9BA9BC] leading-relaxed">
                          {selectedPublicTrip.requirements || 'ناسنامەی فەرمی'}
                        </p>
                      </div>
                    </div>

                    {/* Pickup Points Timeline */}
                    {selectedPublicTrip.pickupPoints?.length > 0 && (
                      <div className="space-y-3 pt-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F7FB] flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#C8A76A]" />
                          <span>{t.pickupPointLabel}</span>
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedPublicTrip.pickupPoints.map((pt: any) => (
                            <div
                              key={pt.id}
                              className="p-3.5 rounded-xl bg-[#070B12]/80 border border-white/[0.08] flex items-center justify-between gap-3"
                            >
                              <div className="space-y-0.5">
                                <span className="text-xs font-semibold text-[#F4F7FB] block">
                                  {pt.pointName}
                                </span>
                                {pt.notes && (
                                  <span className="text-[11px] text-[#9BA9BC] block">
                                    {pt.notes}
                                  </span>
                                )}
                              </div>
                              <span className="px-2.5 py-1 rounded-lg bg-[#101C2E] border border-[#C8A76A]/30 font-mono text-xs font-bold text-[#C8A76A] shrink-0">
                                {pt.pickupTime}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Organizing Company Footer Badge */}
                    <div className="pt-5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4 text-xs text-[#9BA9BC]">
                      <div className="flex items-center gap-2.5">
                        <Building2 className="w-4 h-4 text-[#C8A76A]" />
                        <span>
                          ڕێکخەری گەشت:{' '}
                          <strong className="text-[#F4F7FB]">
                            {selectedPublicTrip.organizationName}
                          </strong>
                        </span>
                      </div>
                      {selectedPublicTrip.organizationPhone && (
                        <span className="font-mono text-[#F4F7FB]">
                          📞 {selectedPublicTrip.organizationPhone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN (5 COLS): STICKY PARTICIPANT REGISTRATION CARD */}
              <div className="lg:col-span-5 lg:sticky lg:top-24">
                <div className="ravan-panel rounded-3xl p-6 sm:p-7 border border-[#C8A76A]/40 space-y-6">
                  <div className="border-b border-white/[0.08] pb-4 space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#C8A76A]">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>ONLINE SEAT REGISTRATION · {selectedPublicTrip.code}</span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-[#F4F7FB]">
                      تۆمارکردنی ناوی بەشداربووان لەم گەشتە
                    </h2>
                    <p className="text-xs text-[#9BA9BC] leading-relaxed">
                      ناوی خۆت و بەشداربووانی هاوڕێت بنووسە بۆ گرتنی ڕاستەوخۆی کورسی لەم گەشتەدا.
                    </p>
                  </div>

                  <AnimatePresence mode="wait">
                    {publicRegistrationReceipt ? (
                      /* DIGITAL BOARDING PASS / REGISTRATION RECEIPT */
                      <motion.div
                        key="receipt"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                        className="space-y-5 text-xs"
                      >
                        <div className="p-5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 space-y-4">
                          <div className="flex items-center gap-2.5 text-emerald-300 font-bold text-sm">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            <span>{t.registrationSuccessTitle}</span>
                          </div>

                          <div className="p-4 rounded-xl bg-[#070B12] border border-white/10 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                              <span className="text-[#9BA9BC]">کۆدی بلیت / حجزکردن:</span>
                              <span className="font-mono font-bold text-base text-[#D4B375]">
                                {publicRegistrationReceipt.bookingCode}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#9BA9BC]">گەشت:</span>
                              <span className="font-semibold text-[#F4F7FB]">
                                {publicRegistrationReceipt.tripTitle}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#9BA9BC]">سەرپەرشتیار:</span>
                              <span className="font-medium text-[#F4F7FB]">
                                {publicRegistrationReceipt.customerName}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#9BA9BC]">ژمارەی مۆبایل:</span>
                              <span className="font-mono text-[#F4F7FB]">
                                {publicRegistrationReceipt.customerPhone}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#9BA9BC]">شوێنی سواربوون:</span>
                              <span className="text-[#F4F7FB]">
                                {publicRegistrationReceipt.pickupPointName}
                              </span>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-white/10">
                              <span className="text-[#9BA9BC]">کۆی گشتیی بڕی پارە:</span>
                              <span className="font-mono tabular-nums font-bold text-sm text-[#D4B375]">
                                {formatMoney(
                                  publicRegistrationReceipt.totalAmount,
                                  publicRegistrationReceipt.currency,
                                  locale
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[#9BA9BC] font-semibold block">
                              ناوی بەشداربووانی تۆمارکراو ({publicRegistrationReceipt.passengerCount}):
                            </span>
                            <ul className="space-y-1.5 bg-[#070B12]/80 p-3.5 rounded-xl border border-white/10">
                              {publicRegistrationReceipt.passengers.map((p, i) => (
                                <li
                                  key={i}
                                  className="font-mono text-[#F4F7FB] flex items-center justify-between"
                                >
                                  <span>
                                    {i + 1}. {p.fullName}
                                  </span>
                                  <span className="text-[11px] text-[#C8A76A] uppercase">
                                    {p.ageGroup === 'adult'
                                      ? 'گەورە'
                                      : p.ageGroup === 'child'
                                      ? 'منداڵ'
                                      : 'ساوا'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPublicRegistrationReceipt(null)}
                          className="ravan-btn-secondary w-full py-3 rounded-xl font-semibold text-xs"
                        >
                          تۆمارکردنی ناونوسینی دیکە لەم گەشتەدا
                        </button>
                      </motion.div>
                    ) : (
                      /* PARTICIPANT REGISTRATION FORM */
                      <motion.form
                        key="form"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onSubmit={(e) => handlePublicBookingSubmit(e, selectedPublicTrip)}
                        className="space-y-4 text-xs"
                      >
                        <div>
                          <label className="block text-[#9BA9BC] font-medium mb-1.5">
                            ناوی سیانی سەرپەرشتیار / داواکار *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="بۆ نموونە: ئارام محەمەد کەریم"
                            value={publicBookingForm.customerName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPublicBookingForm((prev) => {
                                const nextPax = [...prev.passengers];
                                if (nextPax.length > 0 && !nextPax[0].fullName) {
                                  nextPax[0] = { ...nextPax[0], fullName: val };
                                }
                                return { ...prev, customerName: val, passengers: nextPax };
                              });
                            }}
                            className="ravan-input w-full rounded-xl px-3.5 py-2.5 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-[#9BA9BC] font-medium mb-1.5">
                            ژمارەی مۆبایل (بۆ پەیوەندی و وەسڵی حجز) *
                          </label>
                          <input
                            type="tel"
                            required
                            placeholder="+9647501234567"
                            value={publicBookingForm.customerPhone}
                            onChange={(e) =>
                              setPublicBookingForm({
                                ...publicBookingForm,
                                customerPhone: e.target.value,
                              })
                            }
                            className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono text-sm"
                          />
                        </div>

                        {/* Interactive Tactile Seat Counter */}
                        <div className="p-3.5 rounded-2xl bg-[#070B12]/70 border border-white/[0.08] flex items-center justify-between gap-4">
                          <div>
                            <span className="font-semibold text-[#F4F7FB] block">
                              ژمارەی بەشداربووان (کورسی)
                            </span>
                            <span className="text-[11px] text-[#9BA9BC]">
                              زۆرترین کورسی بەردەست: {selectedPublicTrip.availableSeats}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updatePublicPassengerCount(
                                  publicBookingForm.passengerCount - 1,
                                  Math.max(1, selectedPublicTrip.availableSeats)
                                )
                              }
                              disabled={publicBookingForm.passengerCount <= 1}
                              className="w-9 h-9 rounded-xl bg-[#101C2E] border border-white/10 flex items-center justify-center text-[#F4F7FB] hover:border-[#C8A76A] disabled:opacity-35 transition-all"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-10 text-center font-mono text-base font-bold text-[#D4B375]">
                              {publicBookingForm.passengerCount}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updatePublicPassengerCount(
                                  publicBookingForm.passengerCount + 1,
                                  Math.max(1, selectedPublicTrip.availableSeats)
                                )
                              }
                              disabled={
                                publicBookingForm.passengerCount >=
                                Math.max(1, selectedPublicTrip.availableSeats)
                              }
                              className="w-9 h-9 rounded-xl bg-[#101C2E] border border-white/10 flex items-center justify-center text-[#F4F7FB] hover:border-[#C8A76A] disabled:opacity-35 transition-all"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Dynamic Animated Participant Full Names List */}
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <label className="font-bold text-[#D4B375]">
                              {t.participantNamesTitle} ({publicBookingForm.passengers.length})
                            </label>
                          </div>
                          <div className="space-y-2.5 max-h-64 overflow-y-auto pe-1">
                            <AnimatePresence initial={false}>
                              {publicBookingForm.passengers.map((pax, idx) => (
                                <motion.div
                                  key={idx}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                                  className="p-3 rounded-xl bg-[#070B12]/90 border border-white/[0.08] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                                >
                                  <div className="sm:col-span-8">
                                    <label className="block text-[10px] text-[#9BA9BC] mb-1 font-mono">
                                      بەشداربووی #{idx + 1} *
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      placeholder={t.passengerNamePlaceholder}
                                      value={pax.fullName}
                                      onChange={(e) => {
                                        const next = [...publicBookingForm.passengers];
                                        next[idx] = { ...next[idx], fullName: e.target.value };
                                        setPublicBookingForm({
                                          ...publicBookingForm,
                                          passengers: next,
                                        });
                                      }}
                                      className="ravan-input w-full rounded-lg px-3 py-2 text-xs"
                                    />
                                  </div>
                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] text-[#9BA9BC] mb-1">
                                      تەمەن
                                    </label>
                                    <select
                                      value={pax.ageGroup}
                                      onChange={(e) => {
                                        const next = [...publicBookingForm.passengers];
                                        next[idx] = {
                                          ...next[idx],
                                          ageGroup: e.target.value as 'adult' | 'child' | 'infant',
                                        };
                                        setPublicBookingForm({
                                          ...publicBookingForm,
                                          passengers: next,
                                        });
                                      }}
                                      className="ravan-input w-full rounded-lg px-2.5 py-2 text-xs"
                                    >
                                      <option value="adult">گەورە</option>
                                      <option value="child">منداڵ</option>
                                      <option value="infant">ساوا</option>
                                    </select>
                                  </div>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        </div>

                        {selectedPublicTrip.pickupPoints?.length > 0 && (
                          <div>
                            <label className="block text-[#9BA9BC] font-medium mb-1.5">
                              {t.pickupPointLabel}
                            </label>
                            <select
                              value={publicBookingForm.pickupPointName}
                              onChange={(e) =>
                                setPublicBookingForm({
                                  ...publicBookingForm,
                                  pickupPointName: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5 text-xs"
                            >
                              {selectedPublicTrip.pickupPoints.map((pt: any) => (
                                <option key={pt.id} value={pt.pointName}>
                                  {pt.pointName} — کاتژمێر {pt.pickupTime}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="block text-[#9BA9BC] font-medium mb-1.5">
                            تێبینی تایبەت (ئارەزوومەندانە)
                          </label>
                          <input
                            type="text"
                            placeholder="هەر داواکارییەکی تایبەت..."
                            value={publicBookingForm.customerNotes}
                            onChange={(e) =>
                              setPublicBookingForm({
                                ...publicBookingForm,
                                customerNotes: e.target.value,
                              })
                            }
                            className="ravan-input w-full rounded-xl px-3.5 py-2.5 text-xs"
                          />
                        </div>

                        {/* Live Total Price Calculation */}
                        <div className="p-4 rounded-2xl bg-[#070B12] border border-[#C8A76A]/30 flex items-center justify-between">
                          <div>
                            <span className="text-[#9BA9BC] block">کۆی گشتیی پارەی حجزکردن</span>
                            <span className="text-[11px] font-mono text-[#9BA9BC]">
                              {publicBookingForm.passengerCount} کەس ×{' '}
                              {formatMoney(
                                selectedPublicTrip.priceAmount,
                                selectedPublicTrip.currency,
                                locale
                              )}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-lg font-bold text-[#D4B375]">
                            {formatMoney(
                              selectedPublicTrip.priceAmount * publicBookingForm.passengerCount,
                              selectedPublicTrip.currency,
                              locale
                            )}
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            selectedPublicTrip.availableSeats <= 0 || submittingPublicBooking
                          }
                          className="ravan-btn-gold w-full py-3.5 rounded-2xl text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {submittingPublicBooking ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>تۆمارکردنی ناوەکان...</span>
                            </>
                          ) : selectedPublicTrip.availableSeats > 0 ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{t.registerNowBtn}</span>
                            </>
                          ) : (
                            <span>{t.statusFull}</span>
                          )}
                        </button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* Booking Status Lookup Modal for Customer */}
        <AnimatePresence>
          {showPublicLookupModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="ravan-panel w-full max-w-lg rounded-3xl p-6 sm:p-7 space-y-5 text-xs"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                  <div className="flex items-center gap-2 font-bold text-sm text-[#F4F7FB]">
                    <Ticket className="w-4 h-4 text-[#C8A76A]" />
                    <span>{t.lookupBookingTitle}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPublicLookupModal(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-[#9BA9BC]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handlePublicBookingLookup} className="space-y-3.5">
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">
                      کۆدی حجزکردن (Booking Code)
                    </label>
                    <input
                      type="text"
                      required
                      value={lookupCode}
                      onChange={(e) => setLookupCode(e.target.value)}
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">
                      ژمارەی مۆبایلی تۆمارکراو (+964...)
                    </label>
                    <input
                      type="text"
                      required
                      value={lookupPhone}
                      onChange={(e) => setLookupPhone(e.target.value)}
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="ravan-btn-gold w-full py-3 rounded-xl text-xs"
                  >
                    {t.lookupBtn}
                  </button>
                </form>

                {lookupResult && (
                  <div className="p-4 rounded-2xl bg-[#070B12] border border-[#C8A76A]/35 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[#9BA9BC]">کۆد و دۆخ:</span>
                      <span className="font-mono font-bold text-[#C8A76A]">
                        {lookupResult.bookingCode} · {lookupResult.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#9BA9BC]">ناوی کڕیار:</span>
                      <span className="font-semibold text-[#F4F7FB]">
                        {lookupResult.customerName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#9BA9BC]">کۆی گشتی · دراو:</span>
                      <span className="font-mono tabular-nums text-[#F4F7FB]">
                        {formatMoney(lookupResult.totalAmount, lookupResult.currency, locale)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#9BA9BC]">بڕی ماوە:</span>
                      <span className="font-mono tabular-nums text-amber-300">
                        {formatMoney(lookupResult.outstandingAmount, lookupResult.currency, locale)}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Admin Preview Pill (Only shown to signed-in company staff testing their link) */}
        {firebaseUser && (
          <div className="fixed bottom-5 start-5 z-40">
            <button
              type="button"
              onClick={() => openDedicatedTripPage(null)}
              className="px-4 py-2.5 rounded-2xl bg-[#101C2E]/95 backdrop-blur-xl border border-[#C8A76A]/50 text-xs font-semibold text-[#F4F7FB] shadow-2xl hover:border-[#C8A76A] flex items-center gap-2 transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-[#C8A76A]" />
              <span>گەڕانەوە بۆ پانێڵی کۆمپانیا</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // Dedicated Company Public Page (?org=SLUG)
  if (publicOrgFilter && !selectedPublicTripCode) {
    return (
      <CompanyPublicPage
        organization={selectedPublicOrganization}
        trips={publicTrips}
        locale={locale}
        onSelectTrip={(code) => openDedicatedTripPage(code)}
        onExitPreview={
          firebaseUser
            ? () => {
                setPublicOrgFilter('');
                const url = new URL(window.location.href);
                url.searchParams.delete('org');
                window.history.pushState({}, '', url.toString());
              }
            : undefined
        }
      />
    );
  }

  // ===========================================================================
  // AUTHENTICATED MULTI-TENANT COMPANY WORKSPACE
  // ===========================================================================
  return (
    <div className="min-h-screen ravan-canvas text-[#F4F7FB] flex flex-col selection:bg-[#C8A76A] selection:text-[#070B12]">
      <OfflineIndicator message={t.offlineBanner} />

      {/* Top Workspace Header — 3-Zone Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-6 py-3.5 bg-[#070B12]/90 backdrop-blur-xl border-b border-white/[0.08]">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#D8B97E] to-[#9E7B3B] flex items-center justify-center text-[#070B12] font-bold font-mono text-sm shadow-md">
            R
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-[#F4F7FB] block leading-none">
              RAVAN
            </span>
            <span className="text-[10px] font-mono text-[#C8A76A] tracking-wider">
              TRAVEL OS
            </span>
          </div>
        </div>

        {/* Zone 2: Language Switcher */}
        <nav className="flex items-center gap-1.5 bg-[#101C2E]/90 p-1 rounded-xl border border-white/[0.07]">
          {(['ku', 'ar', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLocale(lang)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                locale === lang
                  ? 'bg-[#C8A76A] text-[#070B12] font-bold shadow-sm'
                  : 'text-[#9BA9BC] hover:text-[#F4F7FB]'
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
              className="ravan-btn-secondary px-3.5 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 text-[#C8A76A]" />
              <span>{t.signOut}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="ravan-btn-gold px-4 py-2 text-xs rounded-xl whitespace-nowrap"
            >
              {t.signInGoogle}
            </button>
          )}
        </div>
      </header>

      {/* Feedback Banner */}
      <AnimatePresence>
        {bannerMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`px-6 py-3 text-xs flex items-center justify-between border-b ${
              bannerMessage.type === 'error'
                ? 'bg-red-950/80 border-red-500/40 text-red-200'
                : bannerMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                : 'bg-[#101C2E] border-[#547DA8]/40 text-[#F4F7FB]'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="w-4 h-4 text-[#C8A76A] shrink-0" />
              <span>{bannerMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workspace Body */}
      <div className="flex-1 flex flex-col">
        {authLoading ? (
          <div className="flex-1 flex items-center justify-center p-12 text-sm text-[#9BA9BC]">
            <RefreshCw className="w-5 h-5 text-[#C8A76A] animate-spin me-3" />
            <span>پشکنینی هەژمار...</span>
          </div>
        ) : !firebaseUser ? (
          /* Luxury Dark Sign-In Hero Screen + Commercial SaaS Plans & Demo Request */
          <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 flex flex-col justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
              className="ravan-panel rounded-3xl p-8 md:p-12 space-y-8 relative overflow-hidden"
            >
              <div className="space-y-4 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#C8A76A]/15 border border-[#C8A76A]/30 text-xs font-mono text-[#D4B375]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {t.brandName} · {t.brandSentence}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold text-[#F4F7FB] leading-tight">
                  سیستەمی پێشکەوتووی بەڕێوەبردنی کۆمپانیاکانی گەشتوگوزار، لینکی تایبەتی گەشت و ژمێریاریی IQD و USD
                </h1>
                <p className="text-sm text-[#9BA9BC] leading-relaxed">
                  هەر کۆمپانیایەکی گەشتیاری پڕۆفایلی سەربەخۆی خۆی هەیە، و بۆ هەر گەشتێک لینکێکی تایبەت دروست دەبێت کە تەنها زانیاری و فۆڕمی ناو نووسینی ئەو گەشتە بۆ بەشداربووان دەکاتەوە.
                </p>
              </div>

              {authError && (
                <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="ravan-btn-gold px-7 py-3.5 rounded-2xl text-sm flex items-center gap-2"
                >
                  <span>{t.signInGoogle}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openDedicatedTripPage('RVN-CHM-01')}
                  className="ravan-btn-secondary px-6 py-3.5 rounded-2xl text-sm font-medium flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4 text-[#C8A76A]" />
                  <span>نموونەی پەڕەی تایبەتی یەک گەشت (RVN-CHM-01)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-white/[0.08] text-xs">
                <div className="p-4 rounded-2xl bg-[#070B12]/60 border border-white/[0.06] space-y-1">
                  <span className="font-bold text-[#D4B375] block">
                    ١. لینکی سەربەخۆ بۆ هەر گەشتێک
                  </span>
                  <p className="text-[#9BA9BC]">
                    کۆپیکردنی لینکی تایبەتی گەشت کە تەنها وردەکاری و ناونوسینی ئەو گەشتە پیشان دەدات.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[#070B12]/60 border border-white/[0.06] space-y-1">
                  <span className="font-bold text-[#D4B375] block">
                    ٢. پڕۆفایلی تایبەت بە هەر کۆمپانیایەک
                  </span>
                  <p className="text-[#9BA9BC]">
                    جیاکردنەوەی تەواوی داتای کۆمپانیاکان بە لۆگۆ و ناونیشانی سەربەخۆ لەسەر PostgreSQL.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-[#070B12]/60 border border-white/[0.06] space-y-1">
                  <span className="font-bold text-[#D4B375] block">
                    ٣. ژمێریاریی جیاکراوەی IQD و USD
                  </span>
                  <p className="text-[#9BA9BC]">
                    دەفتەری ژمێریاریی دینار و دۆلار بە جیاکراوەیی لەگەڵ قازانجی سافی هەر گەشتێک.
                  </p>
                </div>
              </div>
            </motion.div>

            <PublicSaaSMarketingSection
              locale={locale}
              onSignIn={handleGoogleSignIn}
              onOpenTripLink={openDedicatedTripPage}
              onMessage={setBannerMessage}
            />
          </div>
        ) : memberships.length === 0 ? (
          /* Organization Onboarding & Demo Tenant Seeder */
          <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="ravan-panel rounded-3xl p-7 space-y-4"
            >
              <h2 className="text-lg font-bold text-[#F4F7FB]">
                ئامادەکردنی دەستبەجێی کۆمپانیای تاقیکردنەوە (PostgreSQL Seed)
              </h2>
              <p className="text-xs text-[#9BA9BC] leading-relaxed">
                بۆ تاقیکردنەوەی دەستبەجێی سیستەمەکە، کرتە بکە بۆ دروستکردنی دوو کۆمپانیای نموونەیی جیاکراوە (<strong>RAVAN Demo Travel</strong> و <strong>Zagros Horizon Tours</strong>) لەگەڵ گەشت و حجزکردنەکان.
              </p>
              <button
                type="button"
                disabled={loadingData}
                onClick={handleSeedDemo}
                className="ravan-btn-gold px-6 py-3 rounded-xl text-xs"
              >
                {loadingData ? 'ئامادەکردنی داتاکان...' : t.seedDemoBtn}
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="ravan-surface rounded-3xl p-7 space-y-5"
            >
              <h2 className="text-lg font-bold text-[#F4F7FB]">{t.createOrgTitle}</h2>
              <form
                onSubmit={handleCreateOrganization}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"
              >
                <div>
                  <label className="block text-[#9BA9BC] mb-1.5">ناوی کۆمپانیای گەشتیاری *</label>
                  <input
                    type="text"
                    required
                    placeholder="بۆ نموونە: کۆمپانیای هەولێر بۆ گەشتوگوزار"
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
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1.5">ناسنامەی لینک (Slug) *</label>
                  <input
                    type="text"
                    required
                    value={newOrgForm.slug}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, slug: e.target.value })}
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono text-[#D4B375]"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1.5">ژمارەی تەلەفۆن (+964...)</label>
                  <input
                    type="text"
                    required
                    value={newOrgForm.contactPhone}
                    onChange={(e) =>
                      setNewOrgForm({ ...newOrgForm, contactPhone: e.target.value })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1.5">دراوی سەرەکی</label>
                  <select
                    value={newOrgForm.defaultCurrency}
                    onChange={(e) =>
                      setNewOrgForm({
                        ...newOrgForm,
                        defaultCurrency: e.target.value as 'IQD' | 'USD',
                      })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  >
                    <option value="IQD">IQD — دیناری عێراقی</option>
                    <option value="USD">USD — دۆلاری ئەمریکی</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex justify-end pt-2">
                  <button type="submit" className="ravan-btn-gold px-6 py-3 rounded-xl text-xs">
                    دامەزراندنی کۆمپانیا
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : (
          /* Full Multi-Tenant SaaS Workspace: Sidebar + Animated Content Viewport */
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Sidebar Navigation */}
            <aside className="w-full lg:w-72 shrink-0 bg-[#0B1320]/90 backdrop-blur-xl border-b lg:border-b-0 lg:border-e border-white/[0.08] p-5 flex flex-col justify-between gap-6">
              <div className="space-y-6">
                {/* Active Travel Company Card & Switcher */}
                <div className="p-3.5 rounded-2xl bg-[#101C2E]/90 border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#9BA9BC]">
                      {t.activeTenant}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCreateOrgModal(true)}
                      className="text-[11px] font-bold text-[#D4B375] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>کۆمپانیای نوێ</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#070B12] border border-[#C8A76A]/40 flex items-center justify-center overflow-hidden shrink-0">
                      {activeOrg?.logoUrl ? (
                        <img
                          src={activeOrg.logoUrl}
                          alt={activeOrg.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-mono font-bold text-xs text-[#D4B375]">
                          {(activeOrg?.name || 'RV').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <select
                        value={activeOrgId || ''}
                        onChange={(e) => {
                          setActiveOrgId(Number(e.target.value));
                          if (activeTab === 'super-admin') setActiveTab('dashboard');
                        }}
                        className="w-full bg-transparent text-xs font-bold text-[#F4F7FB] focus:outline-none truncate cursor-pointer"
                      >
                        {memberships.map((m) => (
                          <option
                            key={m.organizationId}
                            value={m.organizationId}
                            className="bg-[#070B12] text-[#F4F7FB]"
                          >
                            {m.organization?.name || `Org #${m.organizationId}`}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#9BA9BC] mt-0.5">
                        <span>@{activeOrg?.slug}</span>
                        <span className="text-[#C8A76A]">{activeMembership?.role}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Module Navigation Links with Animated Active Pill */}
                <nav className="flex lg:flex-col gap-1.5 overflow-x-auto pb-2 lg:pb-0">
                  {(
                    [
                      { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard },
                      { id: 'trips', label: t.navTrips, icon: Compass },
                      { id: 'bookings', label: t.navBookings, icon: Ticket },
                      { id: 'customers', label: t.navCustomers, icon: Users },
                      { id: 'finance', label: t.navFinance, icon: Wallet },
                      { id: 'team', label: t.navTeam, icon: Building2 },
                      { id: 'subscription', label: 'بەشداری و پسووڵەکان', icon: CreditCard },
                      { id: 'reports', label: 'ڕاپۆرت و پاڵپشتی', icon: BarChart3 },
                      { id: 'notifications', label: t.navNotifications, icon: Bell },
                      { id: 'settings', label: t.navProfile, icon: Settings },
                    ] as const
                  ).map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'text-[#070B12] font-bold'
                            : 'text-[#9BA9BC] hover:text-[#F4F7FB] hover:bg-white/[0.04]'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeSidebarTab"
                            transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#D8B97E] to-[#C19B58] shadow-md"
                          />
                        )}
                        <Icon className="w-4 h-4 shrink-0 relative z-10" />
                        <span className="relative z-10">{item.label}</span>
                      </button>
                    );
                  })}

                  {/* Separated Platform Super Admin Console Link */}
                  {dbUser?.isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('super-admin')}
                      className={`mt-2 flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                        activeTab === 'super-admin'
                          ? 'bg-amber-500/20 text-[#D4B375] border border-[#C8A76A]/50'
                          : 'text-[#D4B375] hover:bg-white/[0.04]'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>{t.navSuperAdmin}</span>
                    </button>
                  )}
                </nav>
              </div>

              {/* User Footer Info */}
              <div className="hidden lg:block pt-4 border-t border-white/[0.08] space-y-2.5 text-[11px] text-[#9BA9BC]">
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono text-[#F4F7FB]">
                    {dbUser?.fullName || dbUser?.email}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span>TZ: {activeOrg?.timezone || 'Asia/Baghdad'}</span>
                  <span className="text-[#C8A76A]">{activeOrg?.defaultCurrency || 'IQD'}</span>
                </div>
                {activeOrg?.slug && (
                  <button
                    type="button"
                    onClick={() => {
                      setPublicOrgFilter(activeOrg.slug);
                      const url = new URL(window.location.href);
                      url.searchParams.set('org', activeOrg.slug);
                      window.history.pushState({}, '', url.toString());
                    }}
                    className="ravan-btn-secondary w-full px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 text-[#F4F7FB]"
                  >
                    <Globe className="w-3.5 h-3.5 text-[#C8A76A]" />
                    <span>پەڕەی گشتیی کۆمپانیا</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSeedDemo}
                  className="ravan-btn-secondary w-full mt-1 px-3 py-2 rounded-xl text-xs text-[#D4B375]"
                >
                  نوێکردنەوەی داتای تاقیکردنەوە
                </button>
              </div>
            </aside>

            {/* Main Workspace Content Area */}
            <main className="flex-1 p-6 md:p-8 space-y-8 overflow-y-auto">
              {/* Workspace Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
                <div>
                  <div className="text-xs text-[#9BA9BC] flex items-center gap-2">
                    <span className="font-semibold text-[#D4B375]">{activeOrg?.name}</span>
                    <span aria-hidden="true">/</span>
                    <span className="font-mono uppercase">{activeTab}</span>
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-[#F4F7FB] mt-1">
                    {activeTab === 'dashboard' && t.navDashboard}
                    {activeTab === 'trips' && t.navTrips}
                    {activeTab === 'bookings' && t.navBookings}
                    {activeTab === 'customers' && t.navCustomers}
                    {activeTab === 'finance' && t.navFinance}
                    {activeTab === 'team' && t.navTeam}
                    {activeTab === 'subscription' && 'پلانی بەشداری و پسووڵەکانی کۆمپانیا'}
                    {activeTab === 'reports' && 'ڕاپۆرتی گشتی و سەنتەری پاڵپشتی'}
                    {activeTab === 'notifications' && t.navNotifications}
                    {activeTab === 'settings' && t.navProfile}
                    {activeTab === 'super-admin' && t.navSuperAdmin}
                  </h1>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={loadActiveTabData}
                    className="ravan-btn-secondary px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                    <span>نوێکردنەوە</span>
                  </button>

                  {activeTab === 'trips' && can('trips.create') && (
                    <button
                      type="button"
                      onClick={() => setShowCreateTripModal(true)}
                      className="ravan-btn-gold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap"
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
                      className="ravan-btn-gold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{t.createBooking}</span>
                    </button>
                  )}

                  {activeTab === 'customers' && can('customers.manage') && (
                    <button
                      type="button"
                      onClick={() => setShowCreateCustomerModal(true)}
                      className="ravan-btn-gold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap"
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
                        className="ravan-btn-gold px-4 py-2.5 rounded-xl text-xs whitespace-nowrap"
                      >
                        {t.recordPayment}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRecordExpenseModal(true)}
                        className="ravan-btn-secondary px-4 py-2.5 rounded-xl text-xs whitespace-nowrap"
                      >
                        {t.recordExpense}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {/* ===========================================================
                    TAB 1: COMPANY DASHBOARD
                   =========================================================== */}
                {activeTab === 'dashboard' && dashboardData && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="space-y-8"
                  >
                    {/* 4 Operational KPI Strip (Clickable to open respective sections) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div
                        onClick={() => setActiveTab('trips')}
                        className="ravan-panel ravan-card-interactive rounded-2xl p-5 space-y-2 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs text-[#9BA9BC]">
                          <span>{t.kpiActiveTrips}</span>
                          <Compass className="w-4 h-4 text-[#C8A76A]" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#F4F7FB]">
                          {dashboardData.kpis.activeTripsCount}
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab('bookings')}
                        className="ravan-panel ravan-card-interactive rounded-2xl p-5 space-y-2 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs text-[#9BA9BC]">
                          <span>{t.kpiTotalBookings}</span>
                          <Ticket className="w-4 h-4 text-[#547DA8]" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#F4F7FB]">
                          {dashboardData.kpis.totalBookingsCount}
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab('bookings')}
                        className="ravan-panel ravan-card-interactive rounded-2xl p-5 space-y-2 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs text-[#9BA9BC]">
                          <span>{t.kpiPassengers}</span>
                          <Users className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#D4B375]">
                          {dashboardData.kpis.totalPassengers}
                        </div>
                      </div>
                      <div
                        onClick={() => setActiveTab('bookings')}
                        className="ravan-panel ravan-card-interactive rounded-2xl p-5 space-y-2 cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs text-[#9BA9BC]">
                          <span>{t.kpiPendingApprovals}</span>
                          <Clock className="w-4 h-4 text-amber-300" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-300">
                          {dashboardData.kpis.pendingBookingsCount}
                        </div>
                      </div>
                    </div>

                    {/* Interactive 8-Step Company Onboarding Checklist (Section 4) */}
                    {dashboardData.onboardingChecklist && (() => {
                      const rawChecklist = dashboardData.onboardingChecklist;
                      const checklistItems = Array.isArray(rawChecklist)
                        ? rawChecklist
                        : [
                            {
                              id: 'profileCompleted',
                              labelKu: 'تەواوکردنی زانیاریی کۆمپانیا',
                              completed: Boolean(rawChecklist.profileCompleted),
                            },
                            {
                              id: 'logoUploaded',
                              labelKu: 'دانانی لۆگۆی کۆمپانیا',
                              completed: Boolean(rawChecklist.logoUploaded),
                            },
                            {
                              id: 'contactConfigured',
                              labelKu: 'تەلەفۆن و ئیمەیڵی کۆمپانیا',
                              completed: Boolean(rawChecklist.contactConfigured),
                            },
                            {
                              id: 'staffAdded',
                              labelKu: 'زیادکردنی ستاف و کارمەندان',
                              completed: Boolean(rawChecklist.staffAdded),
                            },
                            {
                              id: 'firstTripCreated',
                              labelKu: 'دروستکردنی یەکەم گەشت',
                              completed: Boolean(rawChecklist.firstTripCreated),
                            },
                            {
                              id: 'pickupPointsAdded',
                              labelKu: 'دیاریکردنی شوێنی سواربوون',
                              completed: Boolean(rawChecklist.pickupPointsAdded),
                            },
                            {
                              id: 'firstTripPublished',
                              labelKu: 'بڵاوکردنەوەی گەشت و لینک',
                              completed: Boolean(rawChecklist.firstTripPublished),
                            },
                            {
                              id: 'firstPaymentRecorded',
                              labelKu: 'تۆمارکردنی یەکەم پارەدان',
                              completed: Boolean(rawChecklist.firstPaymentRecorded),
                            },
                          ];
                      const doneCount = checklistItems.filter((i: any) => i.completed).length;
                      return (
                        <div className="ravan-surface rounded-2xl p-5 space-y-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-bold text-[#D4B375] flex items-center gap-2">
                              <ClipboardCheck className="w-4 h-4" />
                              <span>
                                هەنگاوەکانی دامەزراندن و کارپێکردنی کۆمپانیا (Onboarding Checklist)
                              </span>
                            </h3>
                            <span className="font-mono text-[#F4F7FB]">
                              {doneCount} / {checklistItems.length} تەواوکراوە
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            {checklistItems.map((step: any) => (
                              <div
                                key={step.id}
                                className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                                  step.completed
                                    ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
                                    : 'bg-[#070B12]/70 border-white/[0.06] text-[#9BA9BC]'
                                }`}
                              >
                                <CheckCircle2
                                  className={`w-4 h-4 shrink-0 ${
                                    step.completed ? 'text-emerald-400' : 'text-white/20'
                                  }`}
                                />
                                <span className="truncate">{step.labelKu}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Currency-Separated Financial Ledgers (IQD vs USD — Never Mixed) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {(['IQD', 'USD'] as const).map((curr) => {
                        const l = dashboardData.ledger[curr];
                        return (
                          <div key={curr} className="ravan-surface rounded-2xl p-6 space-y-5">
                            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                              <h2 className="text-sm font-bold text-[#F4F7FB]">
                                {curr === 'IQD' ? t.iqdLedgerTitle : t.usdLedgerTitle}
                              </h2>
                              <span className="px-2.5 py-1 rounded-lg bg-[#070B12] border border-[#C8A76A]/35 text-xs font-mono font-bold text-[#D4B375]">
                                {curr}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                              <div className="p-3.5 rounded-xl bg-[#070B12]/60 border border-white/[0.05]">
                                <span className="text-[#9BA9BC] block mb-1">
                                  {t.recognizedRevenue}
                                </span>
                                <span className="font-mono tabular-nums font-bold text-sm text-[#F4F7FB]">
                                  {formatMoney(l.recognizedRevenue, curr, locale)}
                                </span>
                              </div>
                              <div className="p-3.5 rounded-xl bg-[#070B12]/60 border border-white/[0.05]">
                                <span className="text-[#9BA9BC] block mb-1">{t.collectedCash}</span>
                                <span className="font-mono tabular-nums font-bold text-sm text-emerald-400">
                                  {formatMoney(l.collectedAmount - l.refundedAmount, curr, locale)}
                                </span>
                              </div>
                              <div className="p-3.5 rounded-xl bg-[#070B12]/60 border border-white/[0.05]">
                                <span className="text-[#9BA9BC] block mb-1">
                                  {t.outstandingDebt}
                                </span>
                                <span className="font-mono tabular-nums font-bold text-sm text-amber-300">
                                  {formatMoney(l.outstandingBalance, curr, locale)}
                                </span>
                              </div>
                              <div className="p-3.5 rounded-xl bg-[#070B12]/60 border border-white/[0.05]">
                                <span className="text-[#9BA9BC] block mb-1">{t.totalExpenses}</span>
                                <span className="font-mono tabular-nums font-bold text-sm text-red-300">
                                  {formatMoney(l.totalExpenses, curr, locale)}
                                </span>
                              </div>
                              <div className="sm:col-span-2 p-3.5 rounded-xl bg-[#070B12] border border-[#C8A76A]/30 flex items-center justify-between">
                                <span className="text-[#9BA9BC] font-medium">{t.netProfit}</span>
                                <span className="font-mono tabular-nums font-bold text-base text-[#D4B375]">
                                  {formatMoney(l.netProfit, curr, locale)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Upcoming Trips with Direct Single-Trip Link Copy */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="ravan-surface rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-[#F4F7FB]">
                            گەشتەکانی کۆمپانیا و لینکی تایبەتی هەر گەشتێک
                          </h3>
                          <button
                            type="button"
                            onClick={() => setActiveTab('trips')}
                            className="text-xs text-[#D4B375] hover:underline"
                          >
                            هەموو گەشتەکان →
                          </button>
                        </div>
                        <div className="space-y-2.5">
                          {dashboardData.upcomingTrips.map((tr: any) => (
                            <div
                              key={tr.id}
                              className="p-3.5 rounded-xl bg-[#070B12]/70 border border-white/[0.07] flex flex-wrap items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-[#F4F7FB]">
                                  <span className="font-mono text-[#D4B375]">{tr.code}</span> ·{' '}
                                  <span>{tr.titleKu}</span>
                                </div>
                                <div className="text-[11px] text-[#9BA9BC] font-mono">
                                  {formatMoney(tr.priceAmount, tr.currency, locale)} · جێگا:{' '}
                                  {tr.availableSeats}/{tr.totalCapacity}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopyTripLink(tr.code)}
                                  className="ravan-btn-secondary px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1 text-[#D4B375]"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>کۆپی لینک</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDedicatedTripPage(tr.code)}
                                  className="ravan-btn-secondary px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>پەڕەی گەشت</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="ravan-surface rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-[#F4F7FB]">{t.navBookings}</h3>
                          <button
                            type="button"
                            onClick={() => setActiveTab('bookings')}
                            className="text-xs text-[#D4B375] hover:underline"
                          >
                            هەموو حجزکردنەکان →
                          </button>
                        </div>
                        <div className="space-y-2.5">
                          {dashboardData.recentBookings.map((bk: any) => (
                            <div
                              key={bk.id}
                              className="p-3.5 rounded-xl bg-[#070B12]/70 border border-white/[0.07] flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-mono font-bold text-[#D4B375]">
                                  {bk.bookingCode}
                                </span>
                                <span className="text-[#9BA9BC] ms-2">
                                  ({bk.passengerCount} کەس)
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono tabular-nums font-semibold">
                                  {formatMoney(bk.totalAmount, bk.currency, locale)}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-white/[0.06] font-mono text-[10px] uppercase">
                                  {bk.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 2: TRIPS MANAGEMENT (Visual Grid + Exclusive Trip Links)
                   =========================================================== */}
                {activeTab === 'trips' && (
                  <motion.div
                    key="trips"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="space-y-6"
                  >
                    {/* Search, Filter & View Mode Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="w-4 h-4 text-[#9BA9BC] absolute top-3 start-3.5" />
                        <input
                          type="text"
                          placeholder={t.searchPlaceholder}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="ravan-input w-full rounded-xl ps-10 pe-4 py-2.5 text-xs"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 p-1 bg-[#101C2E] rounded-xl border border-white/[0.08]">
                          {(['all', 'published', 'draft', 'full', 'archived'] as const).map(
                            (st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setStatusFilter(st)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                                  statusFilter === st
                                    ? 'bg-[#C8A76A] text-[#070B12] font-bold'
                                    : 'text-[#9BA9BC] hover:text-[#F4F7FB]'
                                }`}
                              >
                                {st.toUpperCase()}
                              </button>
                            )
                          )}
                        </div>

                        <div className="flex items-center gap-1 p-1 bg-[#101C2E] rounded-xl border border-white/[0.08]">
                          <button
                            type="button"
                            onClick={() => setTripsViewMode('grid')}
                            className={`p-1.5 rounded-lg ${
                              tripsViewMode === 'grid'
                                ? 'bg-[#C8A76A] text-[#070B12]'
                                : 'text-[#9BA9BC]'
                            }`}
                            title="Grid View"
                          >
                            <LayoutGrid className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripsViewMode('table')}
                            className={`p-1.5 rounded-lg ${
                              tripsViewMode === 'table'
                                ? 'bg-[#C8A76A] text-[#070B12]'
                                : 'text-[#9BA9BC]'
                            }`}
                            title="Table View"
                          >
                            <List className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {tripsViewMode === 'grid' ? (
                      /* VISUAL TRIP CARDS WITH DEDICATED SINGLE-TRIP SHARE LINKS */
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                          .map((tr) => {
                            const usedSeats = tr.totalCapacity - tr.availableSeats;
                            const fillPct = Math.min(
                              100,
                              Math.round((usedSeats / Math.max(1, tr.totalCapacity)) * 100)
                            );

                            return (
                              <div
                                key={tr.id}
                                className="ravan-panel ravan-card-interactive rounded-2xl overflow-hidden flex flex-col justify-between"
                              >
                                <div>
                                  {/* Cover Image with 1-Click Upload Overlay */}
                                  <div className="relative h-48 w-full bg-[#070B12] overflow-hidden group">
                                    <img
                                      src={tr.coverImageUrl || '/images/choman.svg'}
                                      alt={tr.titleKu}
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src =
                                          '/images/choman.svg';
                                      }}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#070B12] via-transparent to-black/30" />

                                    <div className="absolute top-3 inset-x-3 flex items-center justify-between">
                                      <span className="px-2.5 py-1 rounded-lg bg-[#070B12]/85 backdrop-blur-md border border-white/15 font-mono text-xs font-bold text-[#D4B375]">
                                        {tr.code}
                                      </span>
                                      <label className="px-2.5 py-1 rounded-lg bg-[#070B12]/85 backdrop-blur-md border border-white/15 text-[11px] text-[#F4F7FB] hover:border-[#C8A76A] cursor-pointer flex items-center gap-1">
                                        <Upload className="w-3 h-3 text-[#C8A76A]" />
                                        <span>گۆڕینی وێنە</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) =>
                                            handleImageFileUpload(e, async (dataUrl) => {
                                              try {
                                                await apiFetch(`/api/trips/${tr.id}`, {
                                                  method: 'PATCH',
                                                  body: JSON.stringify({ coverImageUrl: dataUrl }),
                                                });
                                                await loadActiveTabData();
                                                setBannerMessage({
                                                  type: 'success',
                                                  text: 'وێنەی گەشت بە سەرکەوتوویی نوێ کرایەوە.',
                                                });
                                              } catch (err: any) {
                                                setBannerMessage({
                                                  type: 'error',
                                                  text: err.message,
                                                });
                                              }
                                            })
                                          }
                                        />
                                      </label>
                                    </div>

                                    <div className="absolute bottom-3 inset-x-4 flex items-end justify-between">
                                      <span className="text-xs text-[#E2C58B] font-medium flex items-center gap-1">
                                        <MapPin className="w-3.5 h-3.5" />
                                        <span>{tr.destination}</span>
                                      </span>
                                      <span className="px-3 py-1 rounded-lg bg-[#070B12]/90 border border-[#C8A76A]/40 font-mono tabular-nums font-bold text-sm text-[#D4B375]">
                                        {formatMoney(tr.priceAmount, tr.currency, locale)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Card Body */}
                                  <div className="p-5 space-y-4">
                                    <div>
                                      <h3 className="text-base font-bold text-[#F4F7FB] line-clamp-1">
                                        {tr.titleKu}
                                      </h3>
                                      <p className="text-[11px] font-mono text-[#9BA9BC] mt-1">
                                        {formatBaghdadDateTime(tr.departureAt, locale)}
                                      </p>
                                    </div>

                                    {/* Seat Occupancy Bar */}
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex justify-between">
                                        <span className="text-[#9BA9BC]">{t.seatsAvailable}</span>
                                        <span className="font-mono font-bold text-[#F4F7FB]">
                                          {tr.availableSeats} / {tr.totalCapacity}
                                        </span>
                                      </div>
                                      <div className="h-2 w-full rounded-full bg-[#070B12] overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-[#D8B97E] to-emerald-400 rounded-full transition-all"
                                          style={{ width: `${Math.max(6, 100 - fillPct)}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Dedicated Single-Trip Shareable URL Box */}
                                    <div className="p-3 rounded-xl bg-[#070B12]/90 border border-[#C8A76A]/25 space-y-2">
                                      <div className="flex items-center justify-between text-[10px] text-[#C8A76A] font-semibold">
                                        <span>لینکی سەربەخۆی ئەم گەشتە (تەنها ئەم گەشتە):</span>
                                        <span className="font-mono uppercase">{tr.status}</span>
                                      </div>
                                      <div className="font-mono text-[11px] text-[#9BA9BC] truncate select-all">
                                        {getTripShareUrl(tr.code)}
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => handleCopyTripLink(tr.code)}
                                          className="ravan-btn-gold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5"
                                        >
                                          {copiedCode === tr.code ? (
                                            <>
                                              <Check className="w-3.5 h-3.5" />
                                              <span>کۆپی کرا</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5" />
                                              <span>کۆپی لینک</span>
                                            </>
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openDedicatedTripPage(tr.code)}
                                          className="ravan-btn-secondary py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5 text-[#C8A76A]" />
                                          <span>کردنەوەی پەڕە</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Footer Status Controls & Trip Operations Modal Trigger */}
                                <div className="px-5 py-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setOperationsTripId(tr.id)}
                                    className="px-3 py-1.5 rounded-lg bg-[#101C2E] border border-[#C8A76A]/40 text-[#D4B375] hover:border-[#C8A76A] text-[11px] font-bold flex items-center gap-1.5"
                                  >
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                    <span>ئامادەکاری و ئامادەبوون</span>
                                  </button>
                                  <div className="flex items-center gap-2">
                                    {tr.status === 'draft' && can('trips.publish') && (
                                      <button
                                        type="button"
                                        onClick={() => handleTripStatusChange(tr.id, 'published')}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-600/80 text-white hover:bg-emerald-500 text-[11px]"
                                      >
                                        {t.publish}
                                      </button>
                                    )}
                                    {tr.status !== 'archived' && can('trips.update') && (
                                      <button
                                        type="button"
                                        onClick={() => handleTripStatusChange(tr.id, 'archived')}
                                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] text-[#9BA9BC] hover:text-white text-[11px]"
                                      >
                                        {t.archive}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      /* COMPACT TABLE VIEW */
                      <div className="ravan-surface rounded-2xl overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-[#101C2E] text-[#9BA9BC] border-b border-white/[0.08]">
                            <tr>
                              <th className="py-3.5 px-4 text-start">وێنە · کۆد · ناونیشانی گەشت</th>
                              <th className="py-3.5 px-4 text-start">شوێن · کاتی دەرچوون</th>
                              <th className="py-3.5 px-4 text-end">نرخ</th>
                              <th className="py-3.5 px-4 text-end">کورسی بەردەست</th>
                              <th className="py-3.5 px-4 text-start">لینکی تایبەتی ئەم گەشتە</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {tripsData.trips.map((tr) => (
                              <tr key={tr.id} className="hover:bg-white/[0.02]">
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={tr.coverImageUrl || '/images/choman.svg'}
                                      alt={tr.titleKu}
                                      className="w-12 h-9 rounded-lg object-cover bg-[#070B12]"
                                    />
                                    <div>
                                      <div className="font-bold text-[#F4F7FB]">
                                        <span className="font-mono text-[#D4B375]">{tr.code}</span>{' '}
                                        · {tr.titleKu}
                                      </div>
                                      <div className="text-[11px] text-[#9BA9BC] font-mono">
                                        {tr.status.toUpperCase()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-[#9BA9BC]">
                                  <div>{tr.destination}</div>
                                  <div className="font-mono text-[11px]">
                                    {formatBaghdadDateTime(tr.departureAt, locale)}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-end font-mono tabular-nums font-bold text-[#D4B375]">
                                  {formatMoney(tr.priceAmount, tr.currency, locale)}
                                </td>
                                <td className="py-3.5 px-4 text-end font-mono tabular-nums">
                                  {tr.availableSeats} / {tr.totalCapacity}
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyTripLink(tr.code)}
                                      className="ravan-btn-gold px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1"
                                    >
                                      <Copy className="w-3 h-3" />
                                      <span>{t.copyTripLink}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openDedicatedTripPage(tr.code)}
                                      className="ravan-btn-secondary px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-1"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>{t.openTripPage}</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 3: BOOKINGS MANAGEMENT (Concurrency-Safe + Manifest)
                   =========================================================== */}
                {activeTab === 'bookings' && (
                  <motion.div
                    key="bookings"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="space-y-6"
                  >
                    <div className="ravan-surface rounded-2xl overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#101C2E] text-[#9BA9BC] border-b border-white/[0.08]">
                          <tr>
                            <th className="py-3.5 px-4 text-start">کۆدی حجزکردن</th>
                            <th className="py-3.5 px-4 text-start">داواکار · گەشت</th>
                            <th className="py-3.5 px-4 text-end">ژمارەی کەس</th>
                            <th className="py-3.5 px-4 text-end">کۆی پارە · دراو · ماوە</th>
                            <th className="py-3.5 px-4 text-start">دۆخ</th>
                            <th className="py-3.5 px-4 text-end">کردارەکان</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {bookingsData.bookings.map((bk) => {
                            const cust = bookingsData.customers.find((c) => c.id === bk.customerId);
                            const tr = bookingsData.trips.find((t) => t.id === bk.tripId);
                            const debt = Math.max(0, bk.totalAmount - bk.paidAmount);
                            const paxForBooking = bookingsData.passengers.filter(
                              (p) => p.bookingId === bk.id
                            );
                            return (
                              <tr key={bk.id} className="hover:bg-white/[0.02]">
                                <td className="py-3.5 px-4 font-mono font-bold text-[#D4B375]">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedBookingId(
                                        selectedBookingId === bk.id ? null : bk.id
                                      )
                                    }
                                    className="underline hover:text-white flex items-center gap-1"
                                  >
                                    <span>{bk.bookingCode}</span>
                                    <span className="text-[10px] text-[#9BA9BC]">
                                      ({paxForBooking.length} ناو)
                                    </span>
                                  </button>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="font-semibold text-[#F4F7FB]">
                                    {cust?.fullName || `Customer #${bk.customerId}`}
                                  </div>
                                  <div className="text-[11px] text-[#9BA9BC]">
                                    {tr?.code} · {tr?.titleKu}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-end font-mono tabular-nums font-bold">
                                  {bk.passengerCount}
                                </td>
                                <td className="py-3.5 px-4 text-end font-mono tabular-nums">
                                  <div className="font-bold">
                                    {formatMoney(bk.totalAmount, bk.currency, locale)}
                                  </div>
                                  <div className="text-[11px] text-emerald-400">
                                    دراوە: {formatMoney(bk.paidAmount, bk.currency, locale)} · ماوە:{' '}
                                    <span className="text-amber-300">
                                      {formatMoney(debt, bk.currency, locale)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-[11px]">
                                  <span className="px-2 py-1 rounded-md bg-white/[0.06] uppercase">
                                    {bk.status}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-end space-x-1.5 rtl:space-x-reverse">
                                  {bk.status === 'pending' && can('bookings.approve') && (
                                    <button
                                      type="button"
                                      onClick={() => handleBookingStatusChange(bk.id, 'approved')}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 font-semibold"
                                    >
                                      {t.approve}
                                    </button>
                                  )}
                                  {bk.status !== 'cancelled' && can('bookings.cancel') && (
                                    <button
                                      type="button"
                                      onClick={() => handleBookingStatusChange(bk.id, 'cancelled')}
                                      className="px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/30 text-red-200 hover:bg-red-900"
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
                    <AnimatePresence>
                      {selectedBookingId && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="ravan-panel rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs"
                        >
                          <div className="space-y-3">
                            <h3 className="font-bold text-[#D4B375] flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>لیستی ناوی بەشداربووان (Booking #{selectedBookingId})</span>
                            </h3>
                            <ul className="space-y-2 text-[#F4F7FB]">
                              {bookingsData.passengers
                                .filter((p) => p.bookingId === selectedBookingId)
                                .map((p, i) => (
                                  <li
                                    key={p.id}
                                    className="p-2.5 rounded-xl bg-[#070B12]/70 border border-white/[0.06] font-mono flex items-center justify-between"
                                  >
                                    <span>
                                      {i + 1}. {p.fullName}
                                    </span>
                                    <span className="text-[#9BA9BC]">
                                      {p.ageGroup} · {p.phone || '—'}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                          <div className="space-y-3">
                            <h3 className="font-bold text-[#D4B375]">مێژووی گۆڕانکاریی دۆخ</h3>
                            <ul className="space-y-2 text-[#9BA9BC]">
                              {bookingsData.statusHistory
                                .filter((h) => h.bookingId === selectedBookingId)
                                .map((h) => (
                                  <li
                                    key={h.id}
                                    className="p-2.5 rounded-xl bg-[#070B12]/70 border border-white/[0.06] font-mono"
                                  >
                                    {h.fromStatus} → {h.toStatus} · {h.reason} ·{' '}
                                    {formatBaghdadDateTime(h.createdAt, locale)}
                                  </li>
                                ))}
                            </ul>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 4: CUSTOMERS (CRM with Separated IQD & USD Balances)
                   =========================================================== */}
                {activeTab === 'customers' && (
                  <motion.div
                    key="customers"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="ravan-surface rounded-2xl overflow-x-auto"
                  >
                    <table className="w-full text-xs">
                      <thead className="bg-[#101C2E] text-[#9BA9BC] border-b border-white/[0.08]">
                        <tr>
                          <th className="py-3.5 px-4 text-start">ناوی تەواوی کڕیار</th>
                          <th className="py-3.5 px-4 text-start">ژمارەی مۆبایل · ئیمەیڵ</th>
                          <th className="py-3.5 px-4 text-end">ژمارەی حجز</th>
                          <th className="py-3.5 px-4 text-end">IQD (دراو · قەرز)</th>
                          <th className="py-3.5 px-4 text-end">USD (دراو · قەرز)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {customersList.map((c) => (
                          <tr key={c.id} className="hover:bg-white/[0.02]">
                            <td className="py-3.5 px-4 font-semibold text-[#F4F7FB]">
                              <div>{c.fullName}</div>
                              <div className="text-[11px] text-[#9BA9BC] font-normal">
                                {c.notes}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[#9BA9BC]">
                              {c.phone} {c.email ? `· ${c.email}` : ''}
                            </td>
                            <td className="py-3.5 px-4 text-end font-mono tabular-nums font-bold">
                              {c.bookingCount}
                            </td>
                            <td className="py-3.5 px-4 text-end font-mono tabular-nums">
                              <span className="text-emerald-400">
                                {formatMoney(c.paidIqd, 'IQD', locale)}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className="text-amber-300">
                                {formatMoney(c.debtIqd, 'IQD', locale)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-end font-mono tabular-nums">
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
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 5: FINANCE & TRIP PROFITABILITY (IQD & USD Separated)
                   =========================================================== */}
                {activeTab === 'finance' && financeData && (
                  <motion.div
                    key="finance"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="space-y-8"
                  >
                    <div className="ravan-surface rounded-2xl p-6 space-y-4">
                      <h2 className="text-sm font-bold text-[#F4F7FB]">
                        قازانجی سافی هەر گەشتێک (پارەی وەرگیراو − خەرجییەکانی گەشت)
                      </h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#9BA9BC] border-b border-white/[0.08]">
                            <tr>
                              <th className="py-2.5 text-start">کۆد · ناونیشانی گەشت</th>
                              <th className="py-2.5 text-start">دراو</th>
                              <th className="py-2.5 text-end">پارەی وەرگیراو</th>
                              <th className="py-2.5 text-end">خەرجیی گەشت</th>
                              <th className="py-2.5 text-end">قازانجی ساف</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {financeData.tripProfitability.map((tp: any) => (
                              <tr key={tp.tripId}>
                                <td className="py-3">
                                  <span className="font-mono font-bold text-[#D4B375]">
                                    {tp.code}
                                  </span>{' '}
                                  · {tp.titleKu}
                                </td>
                                <td className="py-3 font-mono">{tp.currency}</td>
                                <td className="py-3 text-end font-mono tabular-nums text-emerald-400">
                                  {formatMoney(tp.collected, tp.currency, locale)}
                                </td>
                                <td className="py-3 text-end font-mono tabular-nums text-red-300">
                                  {formatMoney(tp.expenses, tp.currency, locale)}
                                </td>
                                <td className="py-3 text-end font-mono tabular-nums font-bold text-[#D4B375]">
                                  {formatMoney(tp.netProfit, tp.currency, locale)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="ravan-surface rounded-2xl p-6 space-y-3">
                        <h3 className="text-sm font-bold text-[#F4F7FB]">
                          تۆماری پارەدان و گەڕانەوەکان (Append-Only Ledger)
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[#9BA9BC] border-b border-white/[0.08]">
                              <tr>
                                <th className="py-2 text-start">جۆر · شێواز</th>
                                <th className="py-2 text-start">پسوولە</th>
                                <th className="py-2 text-end">بڕ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                              {financeData.payments.map((p: any) => (
                                <tr key={p.id}>
                                  <td className="py-2.5">
                                    <span className="font-mono uppercase font-semibold">
                                      {p.entryType}
                                    </span>{' '}
                                    · <span className="text-[#9BA9BC]">{p.paymentMethod}</span>
                                  </td>
                                  <td className="py-2.5 font-mono text-[#9BA9BC]">
                                    {p.referenceCode || '—'}
                                  </td>
                                  <td className="py-2.5 text-end font-mono tabular-nums font-bold">
                                    {formatMoney(p.amount, p.currency, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="ravan-surface rounded-2xl p-6 space-y-3">
                        <h3 className="text-sm font-bold text-[#F4F7FB]">خەرجییە تۆمارکراوەکان</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="text-[#9BA9BC] border-b border-white/[0.08]">
                              <tr>
                                <th className="py-2 text-start">ناونیشان · بەش</th>
                                <th className="py-2 text-start">دابینکەر</th>
                                <th className="py-2 text-end">بڕ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                              {financeData.expenses.map((ex: any) => (
                                <tr key={ex.id}>
                                  <td className="py-2.5">
                                    <div className="text-[#F4F7FB] font-medium">{ex.title}</div>
                                    <div className="text-[11px] text-[#9BA9BC]">
                                      {ex.categoryName}
                                    </div>
                                  </td>
                                  <td className="py-2.5 text-[#9BA9BC]">{ex.vendorName || '—'}</td>
                                  <td className="py-2.5 text-end font-mono tabular-nums text-red-300 font-bold">
                                    {formatMoney(ex.amount, ex.currency, locale)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 6: TEAM MEMBERS, GUIDES & FLEET VEHICLES
                   =========================================================== */}
                {activeTab === 'team' && (
                  <motion.div
                    key="team"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                            setBannerMessage({ type: 'success', text: 'بانگهێشتنامە نێردرا.' });
                          } catch (err: any) {
                            setBannerMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="ravan-surface rounded-2xl p-5 space-y-3.5 text-xs"
                      >
                        <h3 className="font-bold text-[#F4F7FB]">{t.inviteMember}</h3>
                        <input
                          type="email"
                          required
                          placeholder="staff@company.com"
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                          className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                        />
                        <select
                          value={inviteForm.role}
                          onChange={(e) =>
                            setInviteForm({ ...inviteForm, role: e.target.value as Role })
                          }
                          className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                        >
                          <option value="company_manager">company_manager</option>
                          <option value="booking_agent">booking_agent</option>
                          <option value="accountant">accountant</option>
                          <option value="tour_guide">tour_guide</option>
                        </select>
                        <button
                          type="submit"
                          disabled={!can('members.invite')}
                          className="ravan-btn-gold w-full py-2.5 rounded-xl disabled:opacity-40"
                        >
                          {t.inviteMember}
                        </button>
                      </form>

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
                            setBannerMessage({ type: 'success', text: 'ڕێبەری گەشت زیادکرا.' });
                          } catch (err: any) {
                            setBannerMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="ravan-surface rounded-2xl p-5 space-y-3.5 text-xs"
                      >
                        <h3 className="font-bold text-[#F4F7FB]">{t.addGuide}</h3>
                        <input
                          type="text"
                          required
                          placeholder="ناوی سیانی ڕێبەر"
                          value={guideForm.fullName}
                          onChange={(e) => setGuideForm({ ...guideForm, fullName: e.target.value })}
                          className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                        />
                        <input
                          type="text"
                          required
                          placeholder="+964750..."
                          value={guideForm.phone}
                          onChange={(e) => setGuideForm({ ...guideForm, phone: e.target.value })}
                          className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                        />
                        <button
                          type="submit"
                          disabled={!can('trips.update')}
                          className="ravan-btn-secondary w-full py-2.5 rounded-xl font-semibold disabled:opacity-40"
                        >
                          {t.addGuide}
                        </button>
                      </form>

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
                            setBannerMessage({ type: 'success', text: 'ئۆتۆمبێل زیادکرا.' });
                          } catch (err: any) {
                            setBannerMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="ravan-surface rounded-2xl p-5 space-y-3.5 text-xs"
                      >
                        <h3 className="font-bold text-[#F4F7FB]">{t.addVehicle}</h3>
                        <input
                          type="text"
                          required
                          placeholder="بۆ نموونە: پاسی مێرسیدس #02"
                          value={vehicleForm.name}
                          onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                          className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="ژمارەی تابلۆ"
                            value={vehicleForm.plateNumber}
                            onChange={(e) =>
                              setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })
                            }
                            className="ravan-input w-full rounded-xl px-3 py-2.5 font-mono"
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
                            className="ravan-input w-full rounded-xl px-3 py-2.5 font-mono"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!can('trips.update')}
                          className="ravan-btn-secondary w-full py-2.5 rounded-xl font-semibold disabled:opacity-40"
                        >
                          {t.addVehicle}
                        </button>
                      </form>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
                      <div className="ravan-surface rounded-2xl p-5 space-y-3">
                        <h4 className="font-bold text-[#D4B375]">
                          ستافی کۆمپانیا ({teamData.members.length})
                        </h4>
                        <ul className="space-y-2">
                          {teamData.members.map((m) => (
                            <li
                              key={m.id}
                              className="p-2.5 rounded-xl bg-[#070B12]/60 border border-white/[0.06] flex items-center justify-between"
                            >
                              <div>
                                <div className="text-[#F4F7FB] font-medium">{m.userEmail}</div>
                                <div className="font-mono text-[11px] text-[#9BA9BC]">
                                  {m.role} · {m.status}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="ravan-surface rounded-2xl p-5 space-y-3">
                        <h4 className="font-bold text-[#D4B375]">
                          ڕێبەرەکانی گەشت ({teamData.guides.length})
                        </h4>
                        <ul className="space-y-2">
                          {teamData.guides.map((g) => (
                            <li
                              key={g.id}
                              className="p-2.5 rounded-xl bg-[#070B12]/60 border border-white/[0.06] flex items-center justify-between"
                            >
                              <div>
                                <div className="text-[#F4F7FB] font-medium">{g.fullName}</div>
                                <div className="font-mono text-[11px] text-[#9BA9BC]">
                                  {g.phone} · {g.specialty}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="ravan-surface rounded-2xl p-5 space-y-3">
                        <h4 className="font-bold text-[#D4B375]">
                          ئۆتۆمبێلەکان ({teamData.vehicles.length})
                        </h4>
                        <ul className="space-y-2">
                          {teamData.vehicles.map((v) => (
                            <li
                              key={v.id}
                              className="p-2.5 rounded-xl bg-[#070B12]/60 border border-white/[0.06] flex items-center justify-between"
                            >
                              <div>
                                <div className="text-[#F4F7FB] font-medium">{v.name}</div>
                                <div className="font-mono text-[11px] text-[#9BA9BC]">
                                  {v.plateNumber} · {v.capacity} کورسی
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 7: IN-APP NOTIFICATIONS
                   =========================================================== */}
                {activeTab === 'notifications' && dashboardData && (
                  <motion.div
                    key="notifications"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="ravan-surface rounded-2xl p-6 space-y-4"
                  >
                    <h2 className="text-sm font-bold text-[#F4F7FB]">
                      {t.navNotifications} ({dashboardData.notifications.length})
                    </h2>
                    <div className="divide-y divide-white/[0.06] text-xs">
                      {dashboardData.notifications.map((n: any) => (
                        <div key={n.id} className="py-3.5 flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="font-semibold text-[#F4F7FB]">
                              {locale === 'en'
                                ? n.titleEn || n.titleKu
                                : locale === 'ar'
                                ? n.titleAr || n.titleKu
                                : n.titleKu}
                            </div>
                            <div className="text-[#9BA9BC]">
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
                              className="ravan-btn-secondary px-3 py-1.5 rounded-lg text-[#D4B375] whitespace-nowrap"
                            >
                              خوێندرایەوە
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 8: USER PROFILE, TRAVEL COMPANY PROFILE & SETTINGS
                   =========================================================== */}
                {activeTab === 'settings' && dashboardData && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Travel Company Profile Form (7 cols) */}
                      <form
                        onSubmit={handleUpdateCompanyProfile}
                        className="lg:col-span-7 ravan-surface rounded-2xl p-6 space-y-5 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                          <div>
                            <h3 className="text-sm font-bold text-[#F4F7FB]">
                              {t.companyProfileTitle} ({activeOrg?.name})
                            </h3>
                            <p className="text-[11px] text-[#9BA9BC] mt-0.5">
                              ئەم زانیاری و لۆگۆیە لەسەر سەرجەم لینکەکانی گەشتی کۆمپانیاکەت دەردەکەوێت.
                            </p>
                          </div>
                          <span className="font-mono text-[#D4B375]">
                            @{companyProfileForm.slug}
                          </span>
                        </div>

                        {/* Company Logo Upload */}
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-[#070B12] border border-[#C8A76A]/45 flex items-center justify-center overflow-hidden shrink-0">
                            {companyProfileForm.logoUrl ? (
                              <img
                                src={companyProfileForm.logoUrl}
                                alt={companyProfileForm.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-lg font-bold font-mono text-[#D4B375]">
                                {(companyProfileForm.name || 'RV').slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5 flex-1">
                            <label className="ravan-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold cursor-pointer">
                              <Upload className="w-3.5 h-3.5 text-[#C8A76A]" />
                              <span>{t.uploadCompanyLogo}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleImageFileUpload(e, (dataUrl) =>
                                    setCompanyProfileForm((prev) => ({
                                      ...prev,
                                      logoUrl: dataUrl,
                                    }))
                                  )
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[#9BA9BC] mb-1">
                              ناوی کۆمپانیای گەشتیاری *
                            </label>
                            <input
                              type="text"
                              required
                              value={companyProfileForm.name}
                              onChange={(e) =>
                                setCompanyProfileForm({
                                  ...companyProfileForm,
                                  name: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                            />
                          </div>
                          <div>
                            <label className="block text-[#9BA9BC] mb-1">
                              ناسنامەی کۆمپانیا (Unique Slug) *
                            </label>
                            <input
                              type="text"
                              required
                              value={companyProfileForm.slug}
                              onChange={(e) =>
                                setCompanyProfileForm({
                                  ...companyProfileForm,
                                  slug: e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9-]+/g, '-'),
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono text-[#D4B375]"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[#9BA9BC] mb-1">{t.companyBioLabel}</label>
                            <input
                              type="text"
                              placeholder="ناونیشان و کورتەی کارەکانی کۆمپانیا..."
                              value={companyProfileForm.legalName}
                              onChange={(e) =>
                                setCompanyProfileForm({
                                  ...companyProfileForm,
                                  legalName: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                            />
                          </div>
                          <div>
                            <label className="block text-[#9BA9BC] mb-1">
                              ژمارەی تەلەفۆنی کۆمپانیا
                            </label>
                            <input
                              type="text"
                              value={companyProfileForm.contactPhone}
                              onChange={(e) =>
                                setCompanyProfileForm({
                                  ...companyProfileForm,
                                  contactPhone: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[#9BA9BC] mb-1">ئیمەیڵی کۆمپانیا</label>
                            <input
                              type="email"
                              value={companyProfileForm.contactEmail}
                              onChange={(e) =>
                                setCompanyProfileForm({
                                  ...companyProfileForm,
                                  contactEmail: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[#9BA9BC] mb-1">
                              مەرج و ڕێنماییەکانی بەشداربوون و هەڵوەشاندنەوە
                            </label>
                            <input
                              type="text"
                              value={companyProfileForm.cancellationPolicyText}
                              onChange={(e) =>
                                setCompanyProfileForm({
                                  ...companyProfileForm,
                                  cancellationPolicyText: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="submit"
                            disabled={!can('settings.manage')}
                            className="ravan-btn-gold px-6 py-2.5 rounded-xl disabled:opacity-40"
                          >
                            {t.save} — {t.companyProfileTitle}
                          </button>
                        </div>
                      </form>

                      {/* Personal User Profile Form (5 cols) */}
                      <form
                        onSubmit={handleUpdateUserProfile}
                        className="lg:col-span-5 ravan-surface rounded-2xl p-6 space-y-5 text-xs flex flex-col justify-between"
                      >
                        <div className="space-y-4">
                          <div className="border-b border-white/[0.08] pb-3.5">
                            <h3 className="text-sm font-bold text-[#F4F7FB]">
                              {t.personalProfileTitle}
                            </h3>
                            <p className="text-[11px] text-[#9BA9BC] mt-0.5 font-mono">
                              {dbUser?.email}
                            </p>
                          </div>

                          <div>
                            <label className="block text-[#9BA9BC] mb-1">ناوی تەواوی کەسی *</label>
                            <input
                              type="text"
                              required
                              placeholder="ناوی سیانی خۆت بنووسە..."
                              value={userProfileForm.fullName}
                              onChange={(e) =>
                                setUserProfileForm({
                                  ...userProfileForm,
                                  fullName: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                            />
                          </div>

                          <div>
                            <label className="block text-[#9BA9BC] mb-1">ژمارەی مۆبایلی کەسی</label>
                            <input
                              type="text"
                              value={userProfileForm.phone}
                              onChange={(e) =>
                                setUserProfileForm({
                                  ...userProfileForm,
                                  phone: e.target.value,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[#9BA9BC] mb-1">
                              زمانی سەرەکیی بەکارهێنەر
                            </label>
                            <select
                              value={userProfileForm.preferredLocale}
                              onChange={(e) =>
                                setUserProfileForm({
                                  ...userProfileForm,
                                  preferredLocale: e.target.value as Locale,
                                })
                              }
                              className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                            >
                              <option value="ku">کوردی (سۆرانی)</option>
                              <option value="ar">العربية</option>
                              <option value="en">English</option>
                            </select>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setShowCreateOrgModal(true)}
                            className="text-xs font-bold text-[#D4B375] hover:underline"
                          >
                            + کۆمپانیای نوێ
                          </button>
                          <button
                            type="submit"
                            className="ravan-btn-secondary px-5 py-2.5 rounded-xl font-semibold"
                          >
                            {t.save} — {t.personalProfileTitle}
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Booking Policy & KURDIA Dry-Run Validator */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="ravan-surface rounded-2xl p-6 space-y-4 text-xs">
                        <h3 className="text-sm font-bold text-[#F4F7FB]">
                          سیاسەتی گرتنی کورسی (Seat Reservation Policy)
                        </h3>
                        <p className="text-[#9BA9BC] leading-relaxed">
                          دیاری دەکات ئایا لەگەڵ تۆمارکردنی ناونوسین ڕاستەوخۆ کورسی کەم بکرێتەوە (`on_pending`) یان تەنها دوای پەسەندکردن (`on_approved`).
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
                            className={`px-4 py-2 rounded-xl font-mono ${
                              dashboardData.settings?.seatReserveMode === 'on_pending'
                                ? 'ravan-btn-gold'
                                : 'ravan-btn-secondary'
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
                            className={`px-4 py-2 rounded-xl font-mono ${
                              dashboardData.settings?.seatReserveMode === 'on_approved'
                                ? 'ravan-btn-gold'
                                : 'ravan-btn-secondary'
                            }`}
                          >
                            on_approved
                          </button>
                        </div>
                      </div>

                      <div className="ravan-surface rounded-2xl p-6 space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-[#D4B375]">
                            پشکنەری Dry-Run (Zero DB Mutation)
                          </h3>
                          <span className="font-mono text-[11px] text-[#9BA9BC]">
                            Rule 4 Compliance
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={dryRunInput}
                          onChange={(e) => setDryRunInput(e.target.value)}
                          className="ravan-input w-full rounded-xl p-3 font-mono text-xs"
                        />
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={handleRunDryRunValidator}
                            className="ravan-btn-secondary px-4 py-2 rounded-xl font-semibold"
                          >
                            پشکنینی Dry-Run
                          </button>
                          {dryRunResult && (
                            <div className="font-mono">
                              Valid:{' '}
                              <span className="text-emerald-400">{dryRunResult.validCount}</span> ·
                              Invalid:{' '}
                              <span className="text-red-400">{dryRunResult.invalidCount}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 8B: COMPANY SUBSCRIPTION & INVOICES PORTAL
                   =========================================================== */}
                {activeTab === 'subscription' && (
                  <motion.div
                    key="subscription"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  >
                    <SubscriptionPortal
                      apiFetch={apiFetch}
                      locale={locale}
                      onMessage={setBannerMessage}
                    />
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 8C: COMPANY REPORTS, CSV EXPORT & SUPPORT TICKETS
                   =========================================================== */}
                {activeTab === 'reports' && (
                  <motion.div
                    key="reports"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  >
                    <ReportsAndSupportView
                      apiFetch={apiFetch}
                      locale={locale}
                      onMessage={setBannerMessage}
                    />
                  </motion.div>
                )}

                {/* ===========================================================
                    TAB 9: PLATFORM SUPER ADMIN COMMERCIAL CONSOLE
                   =========================================================== */}
                {activeTab === 'super-admin' && platformData && (
                  <motion.div
                    key="super-admin"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  >
                    <SuperAdminConsole
                      platformData={platformData}
                      apiFetch={apiFetch}
                      locale={locale}
                      onRefresh={loadActiveTabData}
                      onMessage={setBannerMessage}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </div>
        )}
      </div>

      {/* =====================================================================
          WORKSPACE MODALS (Trip Operations, Create Organization, Create Trip, Booking, Customer, Payment, Expense)
         ===================================================================== */}
      <AnimatePresence>
        {operationsTripId !== null && (
          <TripOperationsModal
            trip={tripsData.trips.find((t) => t.id === operationsTripId) || {}}
            guides={tripsData.guides || []}
            vehicles={tripsData.vehicles || []}
            passengers={tripsData.passengers || []}
            bookings={tripsData.bookings || []}
            locale={locale}
            onClose={() => setOperationsTripId(null)}
            onSaveTripDetails={async (tripId, payload) => {
              await apiFetch(`/api/trips/${tripId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload),
              });
              await loadActiveTabData();
              setBannerMessage({
                type: 'success',
                text: 'ئامادەکارییەکانی گەشت و ڕێبەر و ئۆتۆمبێل بە سەرکەوتوویی پاشەکەوت کران.',
              });
            }}
            onUpdateAttendance={async (passengerId, attendanceStatus, attendanceNotes) => {
              await apiFetch(`/api/passengers/${passengerId}/attendance`, {
                method: 'PATCH',
                body: JSON.stringify({ attendanceStatus, attendanceNotes }),
              });
              await loadActiveTabData();
              setBannerMessage({
                type: 'success',
                text: `ئامادەبوونی گەشتیار گۆڕدرا بۆ (${attendanceStatus}).`,
              });
            }}
          />
        )}
        {showCreateOrgModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="ravan-panel w-full max-w-lg rounded-3xl p-6 sm:p-7 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-[#F4F7FB]">{t.createOrgTitle}</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#9BA9BC]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateOrganization} className="space-y-3.5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#070B12] border border-[#C8A76A]/40 flex items-center justify-center overflow-hidden shrink-0">
                    {newOrgForm.logoUrl ? (
                      <img
                        src={newOrgForm.logoUrl}
                        alt="Logo"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-mono font-bold text-[#D4B375]">
                        {(newOrgForm.name || 'CO').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <label className="ravan-btn-secondary px-3.5 py-2 rounded-xl font-semibold cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-[#C8A76A]" />
                    <span>{t.uploadCompanyLogo}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handleImageFileUpload(e, (dataUrl) =>
                          setNewOrgForm((prev) => ({ ...prev, logoUrl: dataUrl }))
                        )
                      }
                    />
                  </label>
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">ناوی کۆمپانیای گەشتیاری *</label>
                  <input
                    type="text"
                    required
                    placeholder="بۆ نموونە: کۆمپانیای چیا بۆ گەشتوگوزار"
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
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">
                    ناسنامەی کۆمپانیا بە پیتی ئینگلیزی (Slug) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. chiya-travel"
                    value={newOrgForm.slug}
                    onChange={(e) =>
                      setNewOrgForm({
                        ...newOrgForm,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
                      })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono text-[#D4B375]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">ژمارەی مۆبایل (+964...) *</label>
                    <input
                      type="text"
                      required
                      value={newOrgForm.contactPhone}
                      onChange={(e) =>
                        setNewOrgForm({ ...newOrgForm, contactPhone: e.target.value })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">دراوی سەرەکی</label>
                    <select
                      value={newOrgForm.defaultCurrency}
                      onChange={(e) =>
                        setNewOrgForm({
                          ...newOrgForm,
                          defaultCurrency: e.target.value as 'IQD' | 'USD',
                        })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                    >
                      <option value="IQD">IQD — دیناری عێراقی</option>
                      <option value="USD">USD — دۆلاری ئەمریکی</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateOrgModal(false)}
                    className="ravan-btn-secondary px-4 py-2.5 rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="ravan-btn-gold px-5 py-2.5 rounded-xl">
                    دروستکردنی کۆمپانیا
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showCreateTripModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="ravan-panel w-full max-w-xl rounded-3xl p-6 sm:p-7 space-y-4 text-xs my-8"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-[#F4F7FB]">{t.createTrip}</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateTripModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#9BA9BC]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreateTrip} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[#9BA9BC] mb-1">کۆدی تایبەتی گەشت (Trip Code) *</label>
                  <input
                    type="text"
                    required
                    value={tripForm.code}
                    onChange={(e) => setTripForm({ ...tripForm, code: e.target.value })}
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono text-[#D4B375]"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">شوێنی مەبەست (Destination) *</label>
                  <input
                    type="text"
                    required
                    value={tripForm.destination}
                    onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })}
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[#9BA9BC] mb-1">ناونیشانی گەشت (کوردی) *</label>
                  <input
                    type="text"
                    required
                    value={tripForm.titleKu}
                    onChange={(e) => setTripForm({ ...tripForm, titleKu: e.target.value })}
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">نرخی هەر کەسێک *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={tripForm.priceAmount}
                    onChange={(e) =>
                      setTripForm({ ...tripForm, priceAmount: Number(e.target.value) })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">دراو (IQD / USD)</label>
                  <select
                    value={tripForm.currency}
                    onChange={(e) =>
                      setTripForm({ ...tripForm, currency: e.target.value as 'IQD' | 'USD' })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  >
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">کۆی گشتیی کورسییەکان *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={tripForm.totalCapacity}
                    onChange={(e) =>
                      setTripForm({ ...tripForm, totalCapacity: Number(e.target.value) })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">شوێنی کۆبوونەوە و کات</label>
                  <input
                    type="text"
                    value={tripForm.pickupPointName}
                    onChange={(e) =>
                      setTripForm({ ...tripForm, pickupPointName: e.target.value })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  />
                </div>

                {/* Trip Cover Image Upload */}
                <div className="md:col-span-2 space-y-2.5 pt-2 border-t border-white/10">
                  <label className="block text-[#D4B375] font-bold">{t.tripImageLabel}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-4 h-24 rounded-xl overflow-hidden bg-[#070B12] border border-white/10">
                      <img
                        src={tripForm.coverImageUrl || '/images/choman.svg'}
                        alt="Trip Cover Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="sm:col-span-8 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="ravan-btn-secondary px-3 py-1.5 rounded-xl font-semibold cursor-pointer flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5 text-[#C8A76A]" />
                          <span>{t.uploadTripImage}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleImageFileUpload(e, (dataUrl) =>
                                setTripForm((prev) => ({ ...prev, coverImageUrl: dataUrl }))
                              )
                            }
                          />
                        </label>
                        {[
                          { label: 'چۆمان', url: '/images/choman.svg' },
                          { label: 'ئیستانبوڵ', url: '/images/istanbul.svg' },
                          { label: 'دوکان', url: '/images/dukan.svg' },
                        ].map((preset) => (
                          <button
                            key={preset.url}
                            type="button"
                            onClick={() =>
                              setTripForm((prev) => ({ ...prev, coverImageUrl: preset.url }))
                            }
                            className={`px-2.5 py-1 rounded-lg border text-[11px] ${
                              tripForm.coverImageUrl === preset.url
                                ? 'bg-[#C8A76A] text-[#070B12] border-[#C8A76A] font-bold'
                                : 'bg-[#070B12] text-[#9BA9BC] border-white/10'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateTripModal(false)}
                    className="ravan-btn-secondary px-4 py-2.5 rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="ravan-btn-gold px-6 py-2.5 rounded-xl">
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showCreateBookingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="ravan-panel w-full max-w-lg rounded-3xl p-6 sm:p-7 space-y-4 text-xs"
            >
              <h3 className="text-base font-bold text-[#F4F7FB]">{t.createBooking}</h3>
              <form onSubmit={handleCreateBooking} className="space-y-3.5">
                <div>
                  <label className="block text-[#9BA9BC] mb-1">هەڵبژاردنی گەشت</label>
                  <select
                    value={bookingForm.tripId}
                    onChange={(e) =>
                      setBookingForm({ ...bookingForm, tripId: Number(e.target.value) })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  >
                    {bookingsData.trips.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.code} · {tr.titleKu} ({tr.availableSeats} کورسی ماوە)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#9BA9BC] mb-1">کڕیار</label>
                  <select
                    value={bookingForm.customerId}
                    onChange={(e) =>
                      setBookingForm({ ...bookingForm, customerId: Number(e.target.value) })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  >
                    <option value={0}>+ تۆمارکردنی کڕیاری نوێ</option>
                    {bookingsData.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>
                {bookingForm.customerId === 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="ناوی سیانی کڕیار"
                      value={bookingForm.customerName}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, customerName: e.target.value })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                    />
                    <input
                      type="text"
                      required
                      placeholder="+964750..."
                      value={bookingForm.customerPhone}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, customerPhone: e.target.value })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">ژمارەی کەس</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={bookingForm.passengerCount}
                      onChange={(e) =>
                        setBookingForm({
                          ...bookingForm,
                          passengerCount: Number(e.target.value),
                        })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">شوێنی سواربوون</label>
                    <input
                      type="text"
                      value={bookingForm.pickupPointName}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, pickupPointName: e.target.value })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateBookingModal(false)}
                    className="ravan-btn-secondary px-4 py-2.5 rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="ravan-btn-gold px-5 py-2.5 rounded-xl">
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showCreateCustomerModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="ravan-panel w-full max-w-md rounded-3xl p-6 sm:p-7 space-y-4 text-xs"
            >
              <h3 className="text-base font-bold text-[#F4F7FB]">{t.createCustomer}</h3>
              <form onSubmit={handleCreateCustomer} className="space-y-3.5">
                <input
                  type="text"
                  required
                  placeholder="ناوی سیانی کڕیار"
                  value={customerForm.fullName}
                  onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                />
                <input
                  type="text"
                  required
                  placeholder="+964750..."
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                />
                <input
                  type="email"
                  placeholder="ئیمەیڵ (ئارەزوومەندانە)"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                />
                <div className="flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateCustomerModal(false)}
                    className="ravan-btn-secondary px-4 py-2.5 rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="ravan-btn-gold px-5 py-2.5 rounded-xl">
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showRecordPaymentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="ravan-panel w-full max-w-md rounded-3xl p-6 sm:p-7 space-y-4 text-xs"
            >
              <h3 className="text-base font-bold text-[#F4F7FB]">{t.recordPayment}</h3>
              <form onSubmit={handleRecordPayment} className="space-y-3.5">
                <div>
                  <label className="block text-[#9BA9BC] mb-1">کۆدی حجزکردن</label>
                  <select
                    value={paymentForm.bookingId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      const bk = financeData?.bookings?.find((b: any) => b.id === id);
                      setPaymentForm({
                        ...paymentForm,
                        bookingId: id,
                        currency: bk ? bk.currency : paymentForm.currency,
                      });
                    }}
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                  >
                    {financeData?.bookings?.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.bookingCode} · کۆی گشتی: {b.totalAmount} {b.currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">جۆری تۆمار</label>
                    <select
                      value={paymentForm.entryType}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, entryType: e.target.value as any })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                    >
                      <option value="payment">پارەدان (Payment)</option>
                      <option value="refund">گەڕاندنەوە (Refund)</option>
                      <option value="adjustment">ڕێکخستن (Adjustment)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[#9BA9BC] mb-1">بڕ ({paymentForm.currency})</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={paymentForm.amount}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })
                      }
                      className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRecordPaymentModal(false)}
                    className="ravan-btn-secondary px-4 py-2.5 rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="ravan-btn-gold px-5 py-2.5 rounded-xl">
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {showRecordExpenseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="ravan-panel w-full max-w-md rounded-3xl p-6 sm:p-7 space-y-4 text-xs"
            >
              <h3 className="text-base font-bold text-[#F4F7FB]">{t.recordExpense}</h3>
              <form onSubmit={handleRecordExpense} className="space-y-3.5">
                <input
                  type="text"
                  required
                  placeholder="ناونیشانی خەرجی (بۆ نموونە: کرێی پاس)"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min={1}
                    required
                    value={expenseForm.amount}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5 font-mono"
                  />
                  <select
                    value={expenseForm.currency}
                    onChange={(e) =>
                      setExpenseForm({
                        ...expenseForm,
                        currency: e.target.value as 'IQD' | 'USD',
                      })
                    }
                    className="ravan-input w-full rounded-xl px-3.5 py-2.5"
                  >
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRecordExpenseModal(false)}
                    className="ravan-btn-secondary px-4 py-2.5 rounded-xl"
                  >
                    {t.cancel}
                  </button>
                  <button type="submit" className="ravan-btn-gold px-5 py-2.5 rounded-xl">
                    {t.save}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
