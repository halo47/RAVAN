-- ============================================================================
-- RAVAN — Local Development Seed Only (NEVER execute automatically in production)
-- Creates "RAVAN Demo Travel" (Tenant A) and "Zagros Horizon Tours" (Tenant B)
-- Zero real KURDIA ADVENTURE data is included.
-- ============================================================================

INSERT INTO public.subscription_plans (code, name_ku, name_ar, name_en, proposed_monthly_iqd, proposed_monthly_usd, max_members, max_active_trips, max_monthly_bookings, is_proposal_only)
VALUES
  ('starter', 'ستارتەر (پێشنیار)', 'المبتدئ (مقترح)', 'Starter (Draft Proposal)', 25000, 20, 3, 5, 50, true),
  ('professional', 'پڕۆفیشناڵ (پێشنیار)', 'المحترف (مقترح)', 'Professional (Draft Proposal)', 50000, 40, 10, 25, 300, true),
  ('business', 'بزنس (پێشنیار)', 'الأعمال (مقترح)', 'Business (Draft Proposal)', 100000, 80, 25, 100, 1500, true),
  ('enterprise', 'ئینتەرپرایز (پێشنیار)', 'المؤسسات (مقترح)', 'Enterprise (Draft Proposal)', 200000, 160, 100, 500, 10000, true)
ON CONFLICT (code) DO NOTHING;
