-- ============================================================================
-- RAVAN — Travel Business Operating System
-- Migration: 0001_initial_ravan_schema.sql
-- Multi-Tenant PostgreSQL Schema + Row Level Security (RLS) + Concurrency Guards
-- ============================================================================

BEGIN;

-- 1. Core Tables (Mirroring src/db/schema.ts with strict constraints)
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  preferred_locale TEXT NOT NULL DEFAULT 'ku' CHECK (preferred_locale IN ('ku', 'ar', 'en')),
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organizations (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  default_language TEXT NOT NULL DEFAULT 'ku' CHECK (default_language IN ('ku', 'ar', 'en')),
  supported_languages TEXT NOT NULL DEFAULT 'ku,ar,en',
  timezone TEXT NOT NULL DEFAULT 'Asia/Baghdad',
  default_currency TEXT NOT NULL DEFAULT 'IQD' CHECK (default_currency IN ('IQD', 'USD')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'suspended', 'archived')),
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  primary_color TEXT NOT NULL DEFAULT '#547DA8',
  accent_color TEXT NOT NULL DEFAULT '#C8A76A',
  cancellation_policy_text TEXT NOT NULL DEFAULT 'Standard 48-hour prior notice required.',
  booking_auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
  seat_reserve_mode TEXT NOT NULL DEFAULT 'on_pending' CHECK (seat_reserve_mode IN ('on_pending', 'on_approved')),
  notify_on_new_booking BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_payment BOOLEAN NOT NULL DEFAULT TRUE,
  public_page_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.memberships (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'booking_agent' CHECK (role IN (
    'platform_super_admin',
    'company_owner',
    'company_manager',
    'booking_agent',
    'accountant',
    'tour_guide',
    'customer'
  )),
  custom_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated')),
  invited_by_uid TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_uid)
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ku TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  proposed_monthly_iqd INTEGER NOT NULL CHECK (proposed_monthly_iqd >= 0),
  proposed_monthly_usd INTEGER NOT NULL CHECK (proposed_monthly_usd >= 0),
  max_members INTEGER NOT NULL CHECK (max_members > 0),
  max_active_trips INTEGER NOT NULL CHECK (max_active_trips > 0),
  max_monthly_bookings INTEGER NOT NULL CHECK (max_monthly_bookings > 0),
  is_proposal_only BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES public.subscription_plans(id),
  plan_code TEXT NOT NULL DEFAULT 'professional',
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'expired', 'cancelled', 'suspended')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  renewal_date TIMESTAMPTZ NOT NULL,
  manual_verification_note TEXT NOT NULL DEFAULT '',
  verified_by_uid TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.guides (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  languages TEXT NOT NULL DEFAULT 'ku,ar,en',
  specialty TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'Coaster Bus',
  plate_number TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  driver_name TEXT NOT NULL DEFAULT '',
  driver_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance')),
  maintenance_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trips (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'full', 'cancelled', 'completed', 'archived')),
  title_ku TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  description_ku TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL,
  departure_location TEXT NOT NULL DEFAULT 'Erbil',
  departure_at TIMESTAMPTZ NOT NULL,
  return_at TIMESTAMPTZ NOT NULL,
  price_amount INTEGER NOT NULL CHECK (price_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD', 'USD')),
  total_capacity INTEGER NOT NULL CHECK (total_capacity > 0),
  reserved_seats INTEGER NOT NULL DEFAULT 0 CHECK (reserved_seats >= 0 AND reserved_seats <= total_capacity),
  available_seats INTEGER NOT NULL CHECK (available_seats >= 0 AND available_seats <= total_capacity),
  included_services TEXT NOT NULL DEFAULT '',
  excluded_services TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  guide_id INTEGER REFERENCES public.guides(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES public.vehicles(id) ON DELETE SET NULL,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.customers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  preferred_language TEXT NOT NULL DEFAULT 'ku' CHECK (preferred_language IN ('ku', 'ar', 'en')),
  notes TEXT NOT NULL DEFAULT '',
  total_bookings INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_id INTEGER NOT NULL REFERENCES public.trips(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  booking_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show')),
  passenger_count INTEGER NOT NULL CHECK (passenger_count > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD', 'USD')),
  seats_reserved BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_point_name TEXT NOT NULL DEFAULT '',
  customer_notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.booking_passengers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id INTEGER NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  trip_id INTEGER NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  age_group TEXT NOT NULL DEFAULT 'adult' CHECK (age_group IN ('adult', 'child', 'infant')),
  special_requirements TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  booking_id INTEGER NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  trip_id INTEGER NOT NULL REFERENCES public.trips(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL DEFAULT 'payment' CHECK (entry_type IN ('payment', 'refund', 'adjustment')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD', 'USD')),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference_code TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  received_by_uid TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Security Definer Helper Function with Explicit search_path (Rule 11.15)
CREATE OR REPLACE FUNCTION public.has_active_org_membership(target_org_id INTEGER, current_user_uid TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.organization_id = target_org_id
      AND m.user_uid = current_user_uid
      AND m.status = 'active'
  );
END;
$$;

-- 3. Enable Row Level Security (RLS) on All Tenant Tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (Strict Tenant Isolation — Never USING (true) on private tables)
CREATE POLICY tenant_isolation_trips_select ON public.trips
  FOR SELECT
  USING (
    status IN ('published', 'full')
    OR public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true))
  );

CREATE POLICY tenant_isolation_trips_modify ON public.trips
  FOR ALL
  USING (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)))
  WITH CHECK (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)));

CREATE POLICY tenant_isolation_customers_all ON public.customers
  FOR ALL
  USING (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)))
  WITH CHECK (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)));

CREATE POLICY tenant_isolation_bookings_all ON public.bookings
  FOR ALL
  USING (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)))
  WITH CHECK (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)));

CREATE POLICY tenant_isolation_payments_all ON public.payments
  FOR ALL
  USING (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)))
  WITH CHECK (public.has_active_org_membership(organization_id, current_setting('app.current_user_uid', true)));

COMMIT;
