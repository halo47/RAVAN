import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, pool } from './src/db/index.ts';
import {
  activityLogs,
  bookingPassengers,
  bookings,
  bookingStatusHistory,
  customers,
  expenses,
  guides,
  invites,
  memberships,
  notifications,
  organizations,
  organizationSettings,
  payments,
  subscriptionPlans,
  subscriptions,
  tripPickupPoints,
  trips,
  users,
  vehicles,
} from './src/db/schema.ts';
import {
  AuthRequest,
  rateLimit,
  requireAuth,
  requireTenantMembership,
} from './src/middleware/auth.ts';
import {
  BookingStatus,
  canModifyMemberRole,
  checkSubscriptionEntitlement,
  computeSeatDelta,
  hasPermission,
  Role,
  SeatReserveMode,
  shouldHoldSeats,
} from './src/lib/permissions.ts';
import {
  calculateBookingNetPaid,
  calculateLedgerSummary,
  Currency,
} from './src/lib/money.ts';
import {
  createBookingSchema,
  createCustomerSchema,
  createExpenseSchema,
  createOrganizationSchema,
  createPaymentSchema,
  createTripSchema,
  generateBookingCode,
  normalizePhoneNumber,
  validateDryRunImport,
} from './src/lib/validation.ts';
import { ensureSubscriptionPlans, seedDemoTenantsForUser } from './src/db/seed.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // ==========================================================================
  // 1. PUBLIC CUSTOMER PORTAL ENDPOINTS (Strict Field Allowlist + Rate Limit)
  // ==========================================================================

  app.get('/api/public/trips', rateLimit(60, 60_000), async (req, res) => {
    try {
      const orgSlugParam =
        typeof req.query.org === 'string' ? req.query.org.trim().toLowerCase() : '';
      const tripCodeFilter =
        typeof req.query.code === 'string' ? req.query.code.trim().toUpperCase() : '';

      const [publishedTrips, allOrgs, allSettings, allPickupPoints] = await Promise.all([
        db
          .select({
            id: trips.id,
            organizationId: trips.organizationId,
            code: trips.code,
            status: trips.status,
            titleKu: trips.titleKu,
            titleAr: trips.titleAr,
            titleEn: trips.titleEn,
            descriptionKu: trips.descriptionKu,
            descriptionAr: trips.descriptionAr,
            descriptionEn: trips.descriptionEn,
            destination: trips.destination,
            departureLocation: trips.departureLocation,
            departureAt: trips.departureAt,
            returnAt: trips.returnAt,
            priceAmount: trips.priceAmount,
            currency: trips.currency,
            totalCapacity: trips.totalCapacity,
            availableSeats: trips.availableSeats,
            includedServices: trips.includedServices,
            excludedServices: trips.excludedServices,
            requirements: trips.requirements,
            coverImageUrl: trips.coverImageUrl,
          })
          .from(trips)
          .where(inArray(trips.status, ['published', 'full']))
          .orderBy(desc(trips.departureAt)),
        db
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            legalName: organizations.legalName,
            logoUrl: organizations.logoUrl,
            contactEmail: organizations.contactEmail,
            contactPhone: organizations.contactPhone,
            status: organizations.status,
            isDemo: organizations.isDemo,
          })
          .from(organizations),
        db.select().from(organizationSettings),
        db.select().from(tripPickupPoints),
      ]);

      const settingsMap = new Map(allSettings.map((s) => [s.organizationId, s]));
      const activeOrgs = allOrgs.filter((o) => {
        const s = settingsMap.get(o.id);
        const publicEnabled = s ? s.publicPageEnabled !== false : true;
        return (o.status === 'active' || o.status === 'trialing') && publicEnabled;
      });
      const orgMap = new Map(activeOrgs.map((o) => [o.id, o]));

      // If a tripCodeFilter is provided without orgSlugParam, automatically resolve its organizationSlug
      // so a trip link NEVER mixes with other companies!
      let effectiveOrgSlug = orgSlugParam;
      if (!effectiveOrgSlug && tripCodeFilter) {
        const matchedTrip = publishedTrips.find(
          (t) => t.code.toUpperCase() === tripCodeFilter && orgMap.has(t.organizationId)
        );
        if (matchedTrip) {
          effectiveOrgSlug = orgMap.get(matchedTrip.organizationId)?.slug || '';
        }
      }

      const publicOrganizations = activeOrgs.map((o) => {
        const s = settingsMap.get(o.id);
        const orgTripsCount = publishedTrips.filter((t) => t.organizationId === o.id).length;
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          legalName: o.legalName,
          logoUrl: o.logoUrl,
          contactPhone: o.contactPhone,
          contactEmail: o.contactEmail,
          cancellationPolicyText: s?.cancellationPolicyText || '',
          isDemo: o.isDemo,
          tripCount: orgTripsCount,
        };
      });

      const selectedOrganization = effectiveOrgSlug
        ? publicOrganizations.find((o) => o.slug.toLowerCase() === effectiveOrgSlug) || null
        : null;

      const filtered = publishedTrips
        .filter((t) => {
          const o = orgMap.get(t.organizationId);
          if (!o) return false;
          if (effectiveOrgSlug && o.slug.toLowerCase() !== effectiveOrgSlug) return false;
          return true;
        })
        .map((t) => {
          const o = orgMap.get(t.organizationId)!;
          const s = settingsMap.get(t.organizationId);
          const pickups = allPickupPoints.filter((p) => p.tripId === t.id);
          return {
            ...t,
            coverImageUrl: t.coverImageUrl || '/images/choman.svg',
            organizationName: o.name,
            organizationSlug: o.slug,
            organizationLegalName: o.legalName,
            organizationLogoUrl: o.logoUrl,
            organizationPhone: o.contactPhone,
            organizationEmail: o.contactEmail,
            organizationPolicy: s?.cancellationPolicyText || '',
            isDemo: o.isDemo,
            pickupPoints: pickups,
          };
        });

      res.json({
        trips: filtered,
        organizations: publicOrganizations,
        selectedOrganization,
      });
    } catch (error) {
      console.error('Public trips query failed:', error);
      res.status(500).json({ error: 'Unable to load public trips at this time.' });
    }
  });

  // Public Booking Lookup by Booking Code + Normalized Phone
  app.post('/api/public/booking-lookup', rateLimit(20, 60_000), async (req, res) => {
    try {
      const code = String(req.body?.bookingCode || '').trim().toUpperCase();
      const phone = normalizePhoneNumber(String(req.body?.phone || ''));

      if (!code || !phone) {
        return res.status(400).json({ error: 'Booking code and phone number are required.' });
      }

      const foundBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.bookingCode, code))
        .limit(1);

      if (!foundBookings.length) {
        return res.status(404).json({ error: 'No matching booking found.' });
      }

      const b = foundBookings[0];
      const [cust] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, b.customerId), eq(customers.organizationId, b.organizationId)))
        .limit(1);

      if (!cust || normalizePhoneNumber(cust.phone) !== phone) {
        return res.status(404).json({ error: 'No matching booking found for this phone number.' });
      }

      const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, b.tripId))
        .limit(1);

      // Return ONLY safe customer-facing fields (Rule 9.11 & 18)
      res.json({
        booking: {
          bookingCode: b.bookingCode,
          status: b.status,
          passengerCount: b.passengerCount,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          outstandingAmount: Math.max(0, b.totalAmount - b.paidAmount),
          currency: b.currency,
          pickupPointName: b.pickupPointName,
          createdAt: b.createdAt,
          customerName: cust.fullName,
          tripTitleKu: trip?.titleKu || '',
          tripTitleAr: trip?.titleAr || '',
          tripTitleEn: trip?.titleEn || '',
          destination: trip?.destination || '',
          departureAt: trip?.departureAt || null,
        },
      });
    } catch (error) {
      console.error('Public booking lookup failed:', error);
      res.status(500).json({ error: 'Failed to verify booking.' });
    }
  });

  // Public Customer Booking Request (Transactional Capacity Check)
  app.post('/api/public/bookings', rateLimit(15, 60_000), async (req, res) => {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid booking input', details: parsed.error.issues });
    }

    const input = parsed.data;
    const normalizedPhone = normalizePhoneNumber(input.customerPhone || '');
    if (!input.customerName || !normalizedPhone) {
      return res.status(400).json({ error: 'Customer name and valid phone number are required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const tripRes = await client.query(
        'SELECT * FROM trips WHERE id = $1 FOR UPDATE',
        [input.tripId]
      );
      if (tripRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Trip not found.' });
      }
      const tripRow = tripRes.rows[0];
      const orgId = Number(tripRow.organization_id);

      if (tripRow.status !== 'published') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Trip is not open for public booking.' });
      }

      // Check idempotency key inside tenant
      const existingIdemp = await client.query(
        'SELECT * FROM bookings WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1',
        [orgId, input.idempotencyKey]
      );
      if (existingIdemp.rowCount && existingIdemp.rowCount > 0) {
        await client.query('COMMIT');
        return res.status(200).json({ booking: existingIdemp.rows[0], deduplicated: true });
      }

      const settingsRes = await client.query(
        'SELECT seat_reserve_mode FROM organization_settings WHERE organization_id = $1 LIMIT 1',
        [orgId]
      );
      const seatReserveMode: SeatReserveMode =
        settingsRes.rows[0]?.seat_reserve_mode === 'on_approved' ? 'on_approved' : 'on_pending';

      const availableSeats = Number(tripRow.available_seats);
      const holdNow = shouldHoldSeats('pending', seatReserveMode);

      if (holdNow && input.passengerCount > availableSeats) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Not enough available seats. Requested ${input.passengerCount}, available ${availableSeats}.`,
        });
      }

      // Find or create customer in this organization
      let customerId: number;
      const custRes = await client.query(
        'SELECT id FROM customers WHERE organization_id = $1 AND phone = $2 LIMIT 1',
        [orgId, normalizedPhone]
      );
      if (custRes.rowCount && custRes.rowCount > 0) {
        customerId = custRes.rows[0].id;
        await client.query(
          'UPDATE customers SET total_bookings = total_bookings + 1, updated_at = NOW() WHERE id = $1',
          [customerId]
        );
      } else {
        const newCust = await client.query(
          `INSERT INTO customers (organization_id, full_name, phone, email, total_bookings)
           VALUES ($1, $2, $3, $4, 1) RETURNING id`,
          [orgId, input.customerName.trim(), normalizedPhone, input.customerEmail || '']
        );
        customerId = newCust.rows[0].id;
      }

      const unitPrice = Number(tripRow.price_amount);
      const totalAmount = unitPrice * input.passengerCount;
      const bookingCode = generateBookingCode();

      const insertBooking = await client.query(
        `INSERT INTO bookings (
          organization_id, trip_id, customer_id, booking_code, status,
          passenger_count, unit_price, total_amount, paid_amount, currency,
          seats_reserved, pickup_point_name, customer_notes, idempotency_key, created_by_uid
        ) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,0,$8,$9,$10,$11,$12,'public_portal')
        RETURNING *`,
        [
          orgId,
          tripRow.id,
          customerId,
          bookingCode,
          input.passengerCount,
          unitPrice,
          totalAmount,
          tripRow.currency,
          holdNow,
          input.pickupPointName || '',
          input.customerNotes || '',
          input.idempotencyKey,
        ]
      );

      const createdBooking = insertBooking.rows[0];

      const passengerList =
        Array.isArray(input.passengers) && input.passengers.length > 0
          ? input.passengers
          : [
              {
                fullName: input.customerName.trim(),
                phone: normalizedPhone,
                ageGroup: 'adult' as const,
                specialRequirements: '',
              },
            ];

      for (const pax of passengerList) {
        await client.query(
          `INSERT INTO booking_passengers (organization_id, booking_id, trip_id, full_name, phone, age_group, special_requirements)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orgId,
            createdBooking.id,
            tripRow.id,
            (pax.fullName || input.customerName).trim(),
            pax.phone ? normalizePhoneNumber(pax.phone) : normalizedPhone,
            pax.ageGroup || 'adult',
            pax.specialRequirements || '',
          ]
        );
      }

      if (holdNow) {
        const nextReserved = Number(tripRow.reserved_seats) + input.passengerCount;
        const nextAvailable = Number(tripRow.total_capacity) - nextReserved;
        const nextStatus = nextAvailable === 0 ? 'full' : tripRow.status;
        await client.query(
          `UPDATE trips
           SET reserved_seats = $1, available_seats = $2, status = $3, updated_at = NOW()
           WHERE id = $4`,
          [nextReserved, nextAvailable, nextStatus, tripRow.id]
        );
      }

      await client.query(
        `INSERT INTO notifications (
          organization_id, type, title_ku, title_ar, title_en, body_ku, body_ar, body_en, entity_type, entity_id
        ) VALUES ($1, 'booking_created', $2, $3, $4, $5, $6, $7, 'booking', $8)`,
        [
          orgId,
          `داواکاریی حیجزکردنی نوێ (${bookingCode})`,
          `طلب حجز جديد (${bookingCode})`,
          `New Public Booking Request (${bookingCode})`,
          `${input.customerName} داوای ${input.passengerCount} کورسی کرد.`,
          `${input.customerName} طلب ${input.passengerCount} مقاعد.`,
          `${input.customerName} requested ${input.passengerCount} seats.`,
          createdBooking.id,
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        booking: {
          bookingCode: createdBooking.booking_code,
          status: createdBooking.status,
          passengerCount: createdBooking.passenger_count,
          totalAmount: createdBooking.total_amount,
          currency: createdBooking.currency,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Public booking creation failed:', error);
      res.status(500).json({ error: 'Failed to submit booking request.' });
    } finally {
      client.release();
    }
  });

  // ==========================================================================
  // 2. AUTHENTICATED USER & ONBOARDING ENDPOINTS
  // ==========================================================================

  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      await ensureSubscriptionPlans();
      const userMemberships = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userUid, req.user!.uid), eq(memberships.status, 'active')));

      const orgIds = userMemberships.map((m) => m.organizationId);
      const userOrgs =
        orgIds.length > 0
          ? await db.select().from(organizations).where(inArray(organizations.id, orgIds))
          : [];

      const orgSubscriptions =
        orgIds.length > 0
          ? await db
              .select()
              .from(subscriptions)
              .where(inArray(subscriptions.organizationId, orgIds))
          : [];

      const orgSettings =
        orgIds.length > 0
          ? await db
              .select()
              .from(organizationSettings)
              .where(inArray(organizationSettings.organizationId, orgIds))
          : [];

      const enrichedMemberships = userMemberships.map((m) => {
        const org = userOrgs.find((o) => o.id === m.organizationId);
        const sub = orgSubscriptions.find((s) => s.organizationId === m.organizationId);
        const settings = orgSettings.find((s) => s.organizationId === m.organizationId);
        return {
          ...m,
          organization: org || null,
          subscription: sub || null,
          settings: settings || null,
        };
      });

      res.json({
        user: req.dbUser,
        memberships: enrichedMemberships,
      });
    } catch (error) {
      console.error('GET /api/me failed:', error);
      res.status(500).json({ error: 'Failed to load user workspace profile.' });
    }
  });

  // Update Authenticated User Personal Profile
  app.patch('/api/me', requireAuth, async (req: AuthRequest, res) => {
    const fullName = String(req.body?.fullName ?? req.dbUser!.fullName).trim();
    const rawPhone = String(req.body?.phone ?? req.dbUser!.phone).trim();
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : '';
    const preferredLocale = ['ku', 'ar', 'en'].includes(req.body?.preferredLocale)
      ? req.body.preferredLocale
      : req.dbUser!.preferredLocale;

    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          fullName,
          phone,
          preferredLocale,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      res.json({ user: updatedUser });
    } catch (error) {
      console.error('PATCH /api/me failed:', error);
      res.status(500).json({ error: 'Failed to update personal profile.' });
    }
  });

  // Seed Demo Tenants for Development/Testing (Rule 22)
  app.post('/api/dev/seed', requireAuth, async (req: AuthRequest, res) => {
    try {
      const demoOrg = await seedDemoTenantsForUser(req.dbUser!);
      res.json({ ok: true, organization: demoOrg });
    } catch (error) {
      console.error('Demo seed failed:', error);
      res.status(500).json({ error: 'Failed to seed demo organizations.' });
    }
  });

  // Create New Travel Organization (Tenant Onboarding)
  app.post('/api/organizations', requireAuth, async (req: AuthRequest, res) => {
    const parsed = createOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid organization data', details: parsed.error.issues });
    }

    const data = parsed.data;
    try {
      const plans = await ensureSubscriptionPlans();
      const proPlan = plans.find((p) => p.code === 'professional') || plans[0];

      const [createdOrg] = await db
        .insert(organizations)
        .values({
          name: data.name.trim(),
          slug: data.slug.trim().toLowerCase(),
          legalName: data.legalName || data.name.trim(),
          logoUrl: data.logoUrl || '',
          contactEmail: data.contactEmail || req.dbUser!.email,
          contactPhone: normalizePhoneNumber(data.contactPhone),
          defaultLanguage: data.defaultLanguage,
          defaultCurrency: data.defaultCurrency,
          timezone: data.timezone || 'Asia/Baghdad',
          status: 'trialing',
          isDemo: false,
          createdByUid: req.user!.uid,
        })
        .returning();

      await db.insert(organizationSettings).values({
        organizationId: createdOrg.id,
        seatReserveMode: 'on_pending',
        publicPageEnabled: true,
      });

      const now = new Date();
      const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      await db.insert(subscriptions).values({
        organizationId: createdOrg.id,
        planId: proPlan.id,
        planCode: proPlan.code,
        status: 'trialing',
        billingCycle: 'monthly',
        startDate: now,
        endDate: in14Days,
        renewalDate: in14Days,
        manualVerificationNote: 'Initial 14-day SaaS trial',
        verifiedByUid: req.user!.uid,
      });

      await db.insert(memberships).values({
        organizationId: createdOrg.id,
        userId: req.dbUser!.id,
        userUid: req.user!.uid,
        role: 'company_owner',
        status: 'active',
      });

      await db.insert(activityLogs).values({
        organizationId: createdOrg.id,
        actorUid: req.user!.uid,
        actorEmail: req.dbUser!.email,
        action: 'organization.created',
        entityType: 'organization',
        entityId: String(createdOrg.id),
        details: `Created organization ${createdOrg.name} (${createdOrg.slug})`,
      });

      res.status(201).json({ organization: createdOrg });
    } catch (error: any) {
      console.error('Create organization failed:', error);
      res.status(400).json({
        error: error?.code === '23505' ? 'Organization slug already exists.' : 'Failed to create organization.',
      });
    }
  });

  // ==========================================================================
  // 3. TENANT-SCOPED OPERATIONAL ENDPOINTS
  // ==========================================================================

  app.get('/api/dashboard', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    const orgId = req.activeOrganizationId!;
    try {
      const [orgTrips, orgBookings, orgPayments, orgExpenses, orgNotifications, orgSub, orgSettings] =
        await Promise.all([
          db.select().from(trips).where(eq(trips.organizationId, orgId)).orderBy(desc(trips.departureAt)),
          db.select().from(bookings).where(eq(bookings.organizationId, orgId)).orderBy(desc(bookings.createdAt)),
          db.select().from(payments).where(eq(payments.organizationId, orgId)).orderBy(desc(payments.receivedAt)),
          db.select().from(expenses).where(eq(expenses.organizationId, orgId)).orderBy(desc(expenses.expenseDate)),
          db.select().from(notifications).where(eq(notifications.organizationId, orgId)).orderBy(desc(notifications.createdAt)),
          db.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId)).limit(1),
          db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, orgId)).limit(1),
        ]);

      const activeTripsCount = orgTrips.filter(
        (t) => t.status === 'published' || t.status === 'full'
      ).length;
      const pendingBookingsCount = orgBookings.filter((b) => b.status === 'pending').length;
      const totalPassengers = orgBookings
        .filter((b) => b.status === 'approved' || b.status === 'completed' || b.status === 'pending')
        .reduce((sum, b) => sum + b.passengerCount, 0);

      const ledgerSummary = calculateLedgerSummary({
        bookings: orgBookings.map((b) => ({
          status: b.status,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          currency: (b.currency === 'USD' ? 'USD' : 'IQD') as Currency,
        })),
        payments: orgPayments.map((p) => ({
          entryType: p.entryType as 'payment' | 'refund' | 'adjustment',
          amount: p.amount,
          currency: (p.currency === 'USD' ? 'USD' : 'IQD') as Currency,
        })),
        expenses: orgExpenses.map((e) => ({
          amount: e.amount,
          currency: (e.currency === 'USD' ? 'USD' : 'IQD') as Currency,
        })),
      });

      res.json({
        kpis: {
          activeTripsCount,
          totalBookingsCount: orgBookings.length,
          pendingBookingsCount,
          totalPassengers,
        },
        ledger: ledgerSummary,
        upcomingTrips: orgTrips.slice(0, 6),
        recentBookings: orgBookings.slice(0, 6),
        notifications: orgNotifications.slice(0, 10),
        subscription: orgSub[0] || null,
        settings: orgSettings[0] || null,
      });
    } catch (error) {
      console.error('Dashboard query failed:', error);
      res.status(500).json({ error: 'Failed to load company dashboard data.' });
    }
  });

  // TRIPS MODULE
  app.get('/api/trips', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'trips.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgTrips, orgGuides, orgVehicles, pickupPoints] = await Promise.all([
        db.select().from(trips).where(eq(trips.organizationId, orgId)).orderBy(desc(trips.departureAt)),
        db.select().from(guides).where(eq(guides.organizationId, orgId)),
        db.select().from(vehicles).where(eq(vehicles.organizationId, orgId)),
        db.select().from(tripPickupPoints).where(eq(tripPickupPoints.organizationId, orgId)),
      ]);

      res.json({
        trips: orgTrips,
        guides: orgGuides,
        vehicles: orgVehicles,
        pickupPoints,
      });
    } catch (error) {
      console.error('GET /api/trips failed:', error);
      res.status(500).json({ error: 'Failed to load trips.' });
    }
  });

  app.post('/api/trips', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'trips.create')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.create permission' });
    }

    const parsed = createTripSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid trip data', details: parsed.error.issues });
    }

    const orgId = req.activeOrganizationId!;
    const data = parsed.data;

    try {
      // Check subscription active trip limit
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1);

      const [plan] = sub
        ? await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId)).limit(1)
        : [];

      const existingTrips = await db.select().from(trips).where(eq(trips.organizationId, orgId));
      const activeCount = existingTrips.filter(
        (t) => t.status === 'draft' || t.status === 'published' || t.status === 'full'
      ).length;

      if (sub && plan) {
        const check = checkSubscriptionEntitlement({
          subscriptionStatus: sub.status,
          currentCount: activeCount,
          maxLimit: plan.maxActiveTrips,
          resourceName: 'active trips',
        });
        if (!check.allowed) {
          return res.status(403).json({ error: check.reason });
        }
      }

      const [created] = await db
        .insert(trips)
        .values({
          organizationId: orgId,
          code: data.code.trim().toUpperCase(),
          status: data.status,
          titleKu: data.titleKu.trim(),
          titleAr: data.titleAr || data.titleKu.trim(),
          titleEn: data.titleEn || data.titleKu.trim(),
          descriptionKu: data.descriptionKu || '',
          descriptionAr: data.descriptionAr || '',
          descriptionEn: data.descriptionEn || '',
          destination: data.destination.trim(),
          departureLocation: data.departureLocation.trim(),
          departureAt: new Date(data.departureAt),
          returnAt: new Date(data.returnAt),
          priceAmount: data.priceAmount,
          currency: data.currency,
          totalCapacity: data.totalCapacity,
          reservedSeats: 0,
          availableSeats: data.totalCapacity,
          includedServices: data.includedServices || '',
          excludedServices: data.excludedServices || '',
          requirements: data.requirements || '',
          coverImageUrl: data.coverImageUrl || '/images/choman.svg',
          guideId: data.guideId || null,
          vehicleId: data.vehicleId || null,
          createdByUid: req.user!.uid,
        })
        .returning();

      if (data.pickupPointName) {
        await db.insert(tripPickupPoints).values({
          organizationId: orgId,
          tripId: created.id,
          nameKu: data.pickupPointName,
          nameAr: data.pickupPointName,
          nameEn: data.pickupPointName,
          pickupTime: data.pickupTime || '07:00',
          sortOrder: 1,
        });
      }

      await db.insert(activityLogs).values({
        organizationId: orgId,
        actorUid: req.user!.uid,
        actorEmail: req.dbUser!.email,
        action: 'trip.created',
        entityType: 'trip',
        entityId: String(created.id),
        details: `Created trip ${created.code} (${created.titleKu})`,
      });

      res.status(201).json({ trip: created });
    } catch (error: any) {
      console.error('Create trip failed:', error);
      res.status(400).json({
        error: error?.code === '23505' ? 'Trip code already exists in this organization.' : 'Failed to create trip.',
      });
    }
  });

  app.patch('/api/trips/:id', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    const tripId = Number(req.params.id);
    const orgId = req.activeOrganizationId!;
    const newStatus = req.body?.status;

    if (newStatus === 'published' && !hasPermission(req.activeMembership, 'trips.publish')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.publish permission' });
    }
    if (!hasPermission(req.activeMembership, 'trips.update')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.update permission' });
    }

    try {
      const [existing] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Trip not found in your organization.' });
      }

      const newCoverImage =
        typeof req.body?.coverImageUrl === 'string' && req.body.coverImageUrl.trim()
          ? req.body.coverImageUrl.trim()
          : existing.coverImageUrl || '/images/choman.svg';

      const [updated] = await db
        .update(trips)
        .set({
          status: newStatus || existing.status,
          coverImageUrl: newCoverImage,
          updatedAt: new Date(),
        })
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, orgId)))
        .returning();

      await db.insert(activityLogs).values({
        organizationId: orgId,
        actorUid: req.user!.uid,
        actorEmail: req.dbUser!.email,
        action: `trip.status.${updated.status}`,
        entityType: 'trip',
        entityId: String(tripId),
        details: `Trip ${existing.code} transitioned from ${existing.status} to ${updated.status}`,
      });

      res.json({ trip: updated });
    } catch (error) {
      console.error('Update trip failed:', error);
      res.status(500).json({ error: 'Failed to update trip.' });
    }
  });

  // BOOKINGS MODULE (Atomic Concurrency Protection)
  app.get('/api/bookings', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'bookings.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing bookings.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgBookings, orgCustomers, orgTrips, orgPassengers, orgHistory] = await Promise.all([
        db.select().from(bookings).where(eq(bookings.organizationId, orgId)).orderBy(desc(bookings.createdAt)),
        db.select().from(customers).where(eq(customers.organizationId, orgId)),
        db.select().from(trips).where(eq(trips.organizationId, orgId)),
        db.select().from(bookingPassengers).where(eq(bookingPassengers.organizationId, orgId)),
        db.select().from(bookingStatusHistory).where(eq(bookingStatusHistory.organizationId, orgId)).orderBy(desc(bookingStatusHistory.createdAt)),
      ]);

      res.json({
        bookings: orgBookings,
        customers: orgCustomers,
        trips: orgTrips,
        passengers: orgPassengers,
        statusHistory: orgHistory,
      });
    } catch (error) {
      console.error('GET /api/bookings failed:', error);
      res.status(500).json({ error: 'Failed to load bookings.' });
    }
  });

  app.post('/api/bookings', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'bookings.create')) {
      return res.status(403).json({ error: 'Forbidden: Missing bookings.create permission' });
    }

    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid booking input', details: parsed.error.issues });
    }

    const orgId = req.activeOrganizationId!;
    const input = parsed.data;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check idempotency key inside tenant
      const idempRes = await client.query(
        'SELECT * FROM bookings WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1',
        [orgId, input.idempotencyKey]
      );
      if (idempRes.rowCount && idempRes.rowCount > 0) {
        await client.query('COMMIT');
        return res.status(200).json({ booking: idempRes.rows[0], deduplicated: true });
      }

      // 2. Row-level lock on trip (Rule 11.1)
      const tripRes = await client.query(
        'SELECT * FROM trips WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [input.tripId, orgId]
      );
      if (tripRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Trip not found in this organization.' });
      }

      const tripRow = tripRes.rows[0];
      if (tripRow.status === 'cancelled' || tripRow.status === 'archived') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot book a ${tripRow.status} trip.` });
      }

      const settingsRes = await client.query(
        'SELECT seat_reserve_mode, booking_auto_approve FROM organization_settings WHERE organization_id = $1 LIMIT 1',
        [orgId]
      );
      const seatReserveMode: SeatReserveMode =
        settingsRes.rows[0]?.seat_reserve_mode === 'on_approved' ? 'on_approved' : 'on_pending';
      const initialStatus: BookingStatus = settingsRes.rows[0]?.booking_auto_approve
        ? 'approved'
        : 'pending';

      const availableSeats = Number(tripRow.available_seats);
      const holdSeats = shouldHoldSeats(initialStatus, seatReserveMode);

      if (holdSeats && input.passengerCount > availableSeats) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Capacity exceeded: requested ${input.passengerCount} seats, only ${availableSeats} available.`,
        });
      }

      // 3. Resolve or create customer within same tenant
      let customerId = input.customerId;
      let customerName = input.customerName || 'Traveler';
      let customerPhone = normalizePhoneNumber(input.customerPhone || '');

      if (customerId) {
        const custCheck = await client.query(
          'SELECT id, full_name, phone FROM customers WHERE id = $1 AND organization_id = $2 LIMIT 1',
          [customerId, orgId]
        );
        if (custCheck.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Customer does not belong to this organization.' });
        }
        customerName = custCheck.rows[0].full_name;
        customerPhone = custCheck.rows[0].phone;
        await client.query(
          'UPDATE customers SET total_bookings = total_bookings + 1, updated_at = NOW() WHERE id = $1',
          [customerId]
        );
      } else {
        if (!input.customerName || !customerPhone) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Select an existing customer or provide name and phone.' });
        }
        const newCust = await client.query(
          `INSERT INTO customers (organization_id, full_name, phone, email, total_bookings)
           VALUES ($1, $2, $3, $4, 1) RETURNING id`,
          [orgId, input.customerName.trim(), customerPhone, input.customerEmail || '']
        );
        customerId = newCust.rows[0].id;
      }

      const unitPrice = Number(tripRow.price_amount);
      const totalAmount = unitPrice * input.passengerCount;
      const bookingCode = generateBookingCode();

      const bookingInsert = await client.query(
        `INSERT INTO bookings (
          organization_id, trip_id, customer_id, booking_code, status,
          passenger_count, unit_price, total_amount, paid_amount, currency,
          seats_reserved, pickup_point_name, customer_notes, internal_notes,
          idempotency_key, created_by_uid
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *`,
        [
          orgId,
          tripRow.id,
          customerId,
          bookingCode,
          initialStatus,
          input.passengerCount,
          unitPrice,
          totalAmount,
          tripRow.currency,
          holdSeats,
          input.pickupPointName || '',
          input.customerNotes || '',
          input.internalNotes || '',
          input.idempotencyKey,
          req.user!.uid,
        ]
      );

      const createdBooking = bookingInsert.rows[0];

      // Insert passengers
      const passengerRows =
        input.passengers && input.passengers.length > 0
          ? input.passengers
          : [{ fullName: customerName, phone: customerPhone, ageGroup: 'adult' as const, specialRequirements: '' }];

      for (const p of passengerRows) {
        await client.query(
          `INSERT INTO booking_passengers (organization_id, booking_id, trip_id, full_name, phone, age_group, special_requirements)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orgId,
            createdBooking.id,
            tripRow.id,
            p.fullName.trim(),
            p.phone ? normalizePhoneNumber(p.phone) : '',
            p.ageGroup || 'adult',
            p.specialRequirements || '',
          ]
        );
      }

      await client.query(
        `INSERT INTO booking_status_history (organization_id, booking_id, from_status, to_status, reason, changed_by_uid)
         VALUES ($1, $2, 'new', $3, 'Booking created', $4)`,
        [orgId, createdBooking.id, initialStatus, req.user!.uid]
      );

      if (holdSeats) {
        const nextReserved = Number(tripRow.reserved_seats) + input.passengerCount;
        const nextAvailable = Number(tripRow.total_capacity) - nextReserved;
        const nextTripStatus = nextAvailable === 0 ? 'full' : tripRow.status;

        await client.query(
          `UPDATE trips
           SET reserved_seats = $1, available_seats = $2, status = $3, updated_at = NOW()
           WHERE id = $4`,
          [nextReserved, nextAvailable, nextTripStatus, tripRow.id]
        );
      }

      await client.query(
        `INSERT INTO activity_logs (organization_id, actor_uid, actor_email, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, 'booking.created', 'booking', $4, $5)`,
        [
          orgId,
          req.user!.uid,
          req.dbUser!.email,
          String(createdBooking.id),
          `Booking ${bookingCode} (${input.passengerCount} pax) for trip ${tripRow.code}`,
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({ booking: createdBooking });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Booking creation transaction failed:', error);
      res.status(500).json({ error: 'Failed to create booking safely.' });
    } finally {
      client.release();
    }
  });

  // Atomic Booking Status Transition (Approve / Reject / Cancel / Complete / No-Show)
  app.patch(
    '/api/bookings/:id/status',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const bookingId = Number(req.params.id);
      const targetStatus = req.body?.status as BookingStatus;
      const reason = String(req.body?.reason || '').trim();
      const orgId = req.activeOrganizationId!;

      if (
        !['pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'].includes(
          targetStatus
        )
      ) {
        return res.status(400).json({ error: 'Invalid target booking status.' });
      }

      if (
        (targetStatus === 'cancelled' || targetStatus === 'rejected') &&
        !hasPermission(req.activeMembership, 'bookings.cancel')
      ) {
        return res.status(403).json({ error: 'Forbidden: Missing bookings.cancel permission' });
      }
      if (
        (targetStatus === 'approved' || targetStatus === 'completed' || targetStatus === 'no_show') &&
        !hasPermission(req.activeMembership, 'bookings.approve')
      ) {
        return res.status(403).json({ error: 'Forbidden: Missing bookings.approve permission' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const bRes = await client.query(
          'SELECT * FROM bookings WHERE id = $1 AND organization_id = $2 FOR UPDATE',
          [bookingId, orgId]
        );
        if (bRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Booking not found in this organization.' });
        }
        const bRow = bRes.rows[0];

        const tRes = await client.query(
          'SELECT * FROM trips WHERE id = $1 AND organization_id = $2 FOR UPDATE',
          [bRow.trip_id, orgId]
        );
        const tRow = tRes.rows[0];

        const settingsRes = await client.query(
          'SELECT seat_reserve_mode FROM organization_settings WHERE organization_id = $1 LIMIT 1',
          [orgId]
        );
        const seatReserveMode: SeatReserveMode =
          settingsRes.rows[0]?.seat_reserve_mode === 'on_approved' ? 'on_approved' : 'on_pending';

        const deltaResult = computeSeatDelta({
          passengerCount: Number(bRow.passenger_count),
          currentlyReserved: Boolean(bRow.seats_reserved),
          targetStatus,
          seatReserveMode,
          availableSeats: Number(tRow.available_seats),
        });

        if (deltaResult.error) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: deltaResult.error });
        }

        if (deltaResult.seatDelta !== 0) {
          const nextReserved = Math.max(0, Number(tRow.reserved_seats) + deltaResult.seatDelta);
          const nextAvailable = Math.max(0, Number(tRow.total_capacity) - nextReserved);
          let nextTripStatus = tRow.status;
          if (nextAvailable === 0 && tRow.status === 'published') {
            nextTripStatus = 'full';
          } else if (nextAvailable > 0 && tRow.status === 'full') {
            nextTripStatus = 'published';
          }

          await client.query(
            `UPDATE trips
             SET reserved_seats = $1, available_seats = $2, status = $3, updated_at = NOW()
             WHERE id = $4`,
            [nextReserved, nextAvailable, nextTripStatus, tRow.id]
          );
        }

        const updatedRes = await client.query(
          `UPDATE bookings
           SET status = $1, seats_reserved = $2, updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [targetStatus, deltaResult.nextSeatsReserved, bookingId]
        );

        await client.query(
          `INSERT INTO booking_status_history (organization_id, booking_id, from_status, to_status, reason, changed_by_uid)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orgId, bookingId, bRow.status, targetStatus, reason || `Status updated to ${targetStatus}`, req.user!.uid]
        );

        await client.query(
          `INSERT INTO activity_logs (organization_id, actor_uid, actor_email, action, entity_type, entity_id, details)
           VALUES ($1, $2, $3, $4, 'booking', $5, $6)`,
          [
            orgId,
            req.user!.uid,
            req.dbUser!.email,
            `booking.status.${targetStatus}`,
            String(bookingId),
            `Booking ${bRow.booking_code}: ${bRow.status} -> ${targetStatus}`,
          ]
        );

        await client.query('COMMIT');
        res.json({ booking: updatedRes.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Booking status transition failed:', error);
        res.status(500).json({ error: 'Failed to update booking status.' });
      } finally {
        client.release();
      }
    }
  );

  // CUSTOMERS (CRM) MODULE
  app.get('/api/customers', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'customers.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing customers.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgCustomers, orgBookings] = await Promise.all([
        db.select().from(customers).where(eq(customers.organizationId, orgId)).orderBy(desc(customers.createdAt)),
        db.select().from(bookings).where(eq(bookings.organizationId, orgId)),
      ]);

      const enriched = orgCustomers.map((c) => {
        const custBookings = orgBookings.filter((b) => b.customerId === c.id);
        let paidIqd = 0;
        let debtIqd = 0;
        let paidUsd = 0;
        let debtUsd = 0;

        for (const b of custBookings) {
          if (b.status === 'cancelled' || b.status === 'rejected') continue;
          const unpaid = Math.max(0, b.totalAmount - b.paidAmount);
          if (b.currency === 'USD') {
            paidUsd += b.paidAmount;
            debtUsd += unpaid;
          } else {
            paidIqd += b.paidAmount;
            debtIqd += unpaid;
          }
        }

        return {
          ...c,
          bookingCount: custBookings.length,
          paidIqd,
          debtIqd,
          paidUsd,
          debtUsd,
        };
      });

      res.json({ customers: enriched });
    } catch (error) {
      console.error('GET /api/customers failed:', error);
      res.status(500).json({ error: 'Failed to load customers.' });
    }
  });

  app.post('/api/customers', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'customers.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing customers.manage permission' });
    }
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid customer data', details: parsed.error.issues });
    }
    const orgId = req.activeOrganizationId!;
    const data = parsed.data;
    try {
      const [created] = await db
        .insert(customers)
        .values({
          organizationId: orgId,
          fullName: data.fullName.trim(),
          phone: normalizePhoneNumber(data.phone),
          email: data.email || '',
          preferredLanguage: data.preferredLanguage,
          notes: data.notes || '',
        })
        .returning();

      res.status(201).json({ customer: created });
    } catch (error) {
      console.error('Create customer failed:', error);
      res.status(500).json({ error: 'Failed to create customer.' });
    }
  });

  // FINANCE MODULE (Strict IQD & USD Separation + Immutable Append-Only Ledger)
  app.get('/api/finance', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'finance.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing finance.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgPayments, orgExpenses, orgBookings, orgTrips, orgCustomers] = await Promise.all([
        db.select().from(payments).where(eq(payments.organizationId, orgId)).orderBy(desc(payments.receivedAt)),
        db.select().from(expenses).where(eq(expenses.organizationId, orgId)).orderBy(desc(expenses.expenseDate)),
        db.select().from(bookings).where(eq(bookings.organizationId, orgId)),
        db.select().from(trips).where(eq(trips.organizationId, orgId)),
        db.select().from(customers).where(eq(customers.organizationId, orgId)),
      ]);

      const summary = calculateLedgerSummary({
        bookings: orgBookings.map((b) => ({
          status: b.status,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          currency: (b.currency === 'USD' ? 'USD' : 'IQD') as Currency,
        })),
        payments: orgPayments.map((p) => ({
          entryType: p.entryType as 'payment' | 'refund' | 'adjustment',
          amount: p.amount,
          currency: (p.currency === 'USD' ? 'USD' : 'IQD') as Currency,
        })),
        expenses: orgExpenses.map((e) => ({
          amount: e.amount,
          currency: (e.currency === 'USD' ? 'USD' : 'IQD') as Currency,
        })),
      });

      // Trip-level profitability breakdown
      const tripProfitability = orgTrips.map((t) => {
        const tPayments = orgPayments.filter((p) => p.tripId === t.id && p.currency === t.currency);
        const tExpenses = orgExpenses.filter((e) => e.tripId === t.id && e.currency === t.currency);
        const collected = calculateBookingNetPaid(
          tPayments.map((p) => ({
            entryType: p.entryType as 'payment' | 'refund' | 'adjustment',
            amount: p.amount,
            currency: (p.currency === 'USD' ? 'USD' : 'IQD') as Currency,
          })),
          (t.currency === 'USD' ? 'USD' : 'IQD') as Currency
        );
        const spent = tExpenses.reduce((s, e) => s + e.amount, 0);
        return {
          tripId: t.id,
          code: t.code,
          titleKu: t.titleKu,
          titleAr: t.titleAr,
          titleEn: t.titleEn,
          currency: t.currency,
          collected,
          expenses: spent,
          netProfit: collected - spent,
        };
      });

      res.json({
        summary,
        payments: orgPayments,
        expenses: orgExpenses,
        bookings: orgBookings,
        trips: orgTrips,
        customers: orgCustomers,
        tripProfitability,
      });
    } catch (error) {
      console.error('GET /api/finance failed:', error);
      res.status(500).json({ error: 'Failed to load financial data.' });
    }
  });

  app.post('/api/payments', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'finance.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing finance.manage permission' });
    }
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payment data', details: parsed.error.issues });
    }

    const orgId = req.activeOrganizationId!;
    const data = parsed.data;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const bRes = await client.query(
        'SELECT * FROM bookings WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [data.bookingId, orgId]
      );
      if (bRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Booking not found in this organization.' });
      }
      const bRow = bRes.rows[0];

      if (bRow.currency !== data.currency) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Currency mismatch: Booking ${bRow.booking_code} is in ${bRow.currency}, cannot record ${data.currency} entry without explicit conversion policy.`,
        });
      }

      const pInsert = await client.query(
        `INSERT INTO payments (
          organization_id, booking_id, trip_id, customer_id, entry_type,
          amount, currency, payment_method, reference_code, notes, received_by_uid
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          orgId,
          bRow.id,
          bRow.trip_id,
          bRow.customer_id,
          data.entryType,
          data.amount,
          data.currency,
          data.paymentMethod,
          data.referenceCode || '',
          data.notes || '',
          req.user!.uid,
        ]
      );

      // Recompute net paid from all ledger rows for this booking
      const allEntriesRes = await client.query(
        'SELECT entry_type, amount, currency FROM payments WHERE booking_id = $1 AND organization_id = $2',
        [bRow.id, orgId]
      );
      const netPaid = calculateBookingNetPaid(
        allEntriesRes.rows.map((r) => ({
          entryType: r.entry_type,
          amount: Number(r.amount),
          currency: r.currency,
        })),
        bRow.currency
      );

      await client.query(
        'UPDATE bookings SET paid_amount = $1, updated_at = NOW() WHERE id = $2',
        [netPaid, bRow.id]
      );

      await client.query(
        `INSERT INTO activity_logs (organization_id, actor_uid, actor_email, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, 'payment', $5, $6)`,
        [
          orgId,
          req.user!.uid,
          req.dbUser!.email,
          `finance.${data.entryType}`,
          String(pInsert.rows[0].id),
          `Recorded ${data.entryType} of ${data.amount} ${data.currency} on booking ${bRow.booking_code}`,
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({ payment: pInsert.rows[0], updatedPaidAmount: netPaid });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Record payment failed:', error);
      res.status(500).json({ error: 'Failed to record financial ledger entry.' });
    } finally {
      client.release();
    }
  });

  app.post('/api/expenses', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'finance.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing finance.manage permission' });
    }
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid expense data', details: parsed.error.issues });
    }
    const orgId = req.activeOrganizationId!;
    const data = parsed.data;
    try {
      const [created] = await db
        .insert(expenses)
        .values({
          organizationId: orgId,
          tripId: data.tripId || null,
          categoryName: data.categoryName,
          title: data.title.trim(),
          amount: data.amount,
          currency: data.currency,
          vendorName: data.vendorName || '',
          referenceCode: data.referenceCode || '',
          notes: data.notes || '',
          recordedByUid: req.user!.uid,
        })
        .returning();

      await db.insert(activityLogs).values({
        organizationId: orgId,
        actorUid: req.user!.uid,
        actorEmail: req.dbUser!.email,
        action: 'finance.expense_recorded',
        entityType: 'expense',
        entityId: String(created.id),
        details: `Expense ${created.title}: ${created.amount} ${created.currency}`,
      });

      res.status(201).json({ expense: created });
    } catch (error) {
      console.error('Create expense failed:', error);
      res.status(500).json({ error: 'Failed to record expense.' });
    }
  });

  // TEAM, GUIDES & VEHICLES MODULE
  app.get('/api/members', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    const orgId = req.activeOrganizationId!;
    try {
      const [orgMembers, orgInvites, orgGuides, orgVehicles, allUsers] = await Promise.all([
        db.select().from(memberships).where(eq(memberships.organizationId, orgId)),
        db.select().from(invites).where(eq(invites.organizationId, orgId)),
        db.select().from(guides).where(eq(guides.organizationId, orgId)),
        db.select().from(vehicles).where(eq(vehicles.organizationId, orgId)),
        db.select().from(users),
      ]);

      const userMap = new Map(allUsers.map((u) => [u.uid, u]));
      const enrichedMembers = orgMembers.map((m) => ({
        ...m,
        userEmail: userMap.get(m.userUid)?.email || m.userUid,
        userName: userMap.get(m.userUid)?.fullName || 'Team Member',
      }));

      res.json({
        members: enrichedMembers,
        invites: orgInvites,
        guides: orgGuides,
        vehicles: orgVehicles,
      });
    } catch (error) {
      console.error('GET /api/members failed:', error);
      res.status(500).json({ error: 'Failed to load team data.' });
    }
  });

  app.post('/api/members/invite', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'members.invite')) {
      return res.status(403).json({ error: 'Forbidden: Missing members.invite permission' });
    }
    const orgId = req.activeOrganizationId!;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = (req.body?.role || 'booking_agent') as Role;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    try {
      const token = `inv_${Math.random().toString(36).slice(2, 12)}`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [created] = await db
        .insert(invites)
        .values({
          organizationId: orgId,
          email,
          role,
          token,
          status: 'pending',
          invitedByUid: req.user!.uid,
          expiresAt,
        })
        .returning();

      await db.insert(activityLogs).values({
        organizationId: orgId,
        actorUid: req.user!.uid,
        actorEmail: req.dbUser!.email,
        action: 'member.invited',
        entityType: 'invite',
        entityId: String(created.id),
        details: `Invited ${email} with role ${role}`,
      });

      res.status(201).json({ invite: created });
    } catch (error) {
      console.error('Invite member failed:', error);
      res.status(500).json({ error: 'Failed to create member invitation.' });
    }
  });

  app.patch('/api/members/:id', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    const memberId = Number(req.params.id);
    const orgId = req.activeOrganizationId!;
    const newRole = req.body?.role as Role;
    const newStatus = req.body?.status as string | undefined;

    try {
      const [target] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, memberId), eq(memberships.organizationId, orgId)))
        .limit(1);

      if (!target) {
        return res.status(404).json({ error: 'Membership not found.' });
      }

      const check = canModifyMemberRole({
        actorUid: req.user!.uid,
        actorMembership: req.activeMembership!,
        targetUserUid: target.userUid,
        newRole: newRole || (target.role as Role),
      });

      if (!check.allowed) {
        return res.status(403).json({ error: check.reason });
      }

      const [updated] = await db
        .update(memberships)
        .set({
          role: newRole || target.role,
          status: newStatus || target.status,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, memberId))
        .returning();

      res.json({ membership: updated });
    } catch (error) {
      console.error('Update membership failed:', error);
      res.status(500).json({ error: 'Failed to update member role.' });
    }
  });

  app.post('/api/guides', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'trips.update')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.update permission' });
    }
    const orgId = req.activeOrganizationId!;
    const fullName = String(req.body?.fullName || '').trim();
    const phone = normalizePhoneNumber(String(req.body?.phone || ''));
    const specialty = String(req.body?.specialty || 'Mountain & Cultural Tours').trim();

    if (!fullName || !phone) {
      return res.status(400).json({ error: 'Guide name and phone are required.' });
    }

    try {
      const [created] = await db
        .insert(guides)
        .values({
          organizationId: orgId,
          fullName,
          phone,
          specialty,
        })
        .returning();

      res.status(201).json({ guide: created });
    } catch (error) {
      console.error('Create guide failed:', error);
      res.status(500).json({ error: 'Failed to create tour guide.' });
    }
  });

  app.post('/api/vehicles', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'trips.update')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.update permission' });
    }
    const orgId = req.activeOrganizationId!;
    const name = String(req.body?.name || '').trim();
    const plateNumber = String(req.body?.plateNumber || '').trim();
    const capacity = Number(req.body?.capacity || 24);
    const driverName = String(req.body?.driverName || '').trim();

    if (!name || !plateNumber) {
      return res.status(400).json({ error: 'Vehicle name and plate number are required.' });
    }

    try {
      const [created] = await db
        .insert(vehicles)
        .values({
          organizationId: orgId,
          name,
          plateNumber,
          capacity,
          driverName,
        })
        .returning();

      res.status(201).json({ vehicle: created });
    } catch (error) {
      console.error('Create vehicle failed:', error);
      res.status(500).json({ error: 'Failed to create vehicle.' });
    }
  });

  // NOTIFICATIONS & SETTINGS
  app.patch(
    '/api/notifications/:id/read',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const notifId = Number(req.params.id);
      const orgId = req.activeOrganizationId!;
      try {
        const [updated] = await db
          .update(notifications)
          .set({ isRead: true })
          .where(and(eq(notifications.id, notifId), eq(notifications.organizationId, orgId)))
          .returning();
        res.json({ notification: updated });
      } catch (error) {
        console.error('Mark notification read failed:', error);
        res.status(500).json({ error: 'Failed to update notification.' });
      }
    }
  );

  app.patch('/api/settings', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'settings.manage')) {
      return res.status(403).json({ error: 'Forbidden: Missing settings.manage permission' });
    }
    const orgId = req.activeOrganizationId!;
    const {
      seatReserveMode,
      bookingAutoApprove,
      publicPageEnabled,
      cancellationPolicyText,
      defaultCurrency,
      defaultLanguage,
    } = req.body || {};

    try {
      const [updatedSettings] = await db
        .update(organizationSettings)
        .set({
          seatReserveMode:
            seatReserveMode === 'on_approved' ? 'on_approved' : 'on_pending',
          bookingAutoApprove: Boolean(bookingAutoApprove),
          publicPageEnabled: publicPageEnabled !== false,
          cancellationPolicyText:
            typeof cancellationPolicyText === 'string'
              ? cancellationPolicyText
              : 'Standard 48-hour prior notice required.',
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, orgId))
        .returning();

      if (defaultCurrency || defaultLanguage) {
        await db
          .update(organizations)
          .set({
            defaultCurrency: defaultCurrency === 'USD' ? 'USD' : 'IQD',
            defaultLanguage: ['ku', 'ar', 'en'].includes(defaultLanguage)
              ? defaultLanguage
              : 'ku',
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, orgId));
      }

      res.json({ settings: updatedSettings });
    } catch (error) {
      console.error('Update settings failed:', error);
      res.status(500).json({ error: 'Failed to update organization settings.' });
    }
  });

  // Update Travel Company Profile (Name, Slug, Logo, Contact, Bio/Policy)
  app.patch(
    '/api/organization/profile',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      if (!hasPermission(req.activeMembership, 'settings.manage')) {
        return res.status(403).json({ error: 'Forbidden: Missing settings.manage permission' });
      }
      const orgId = req.activeOrganizationId!;
      const [currentOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      if (!currentOrg) {
        return res.status(404).json({ error: 'Organization not found.' });
      }

      const name = String(req.body?.name ?? currentOrg.name).trim();
      const rawSlug = String(req.body?.slug ?? currentOrg.slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '');
      const legalName = String(req.body?.legalName ?? currentOrg.legalName).trim();
      const logoUrl =
        typeof req.body?.logoUrl === 'string' ? req.body.logoUrl : currentOrg.logoUrl;
      const contactEmail = String(req.body?.contactEmail ?? currentOrg.contactEmail).trim();
      const rawPhone = String(req.body?.contactPhone ?? currentOrg.contactPhone).trim();
      const contactPhone = rawPhone ? normalizePhoneNumber(rawPhone) : currentOrg.contactPhone;
      const defaultCurrency =
        req.body?.defaultCurrency === 'USD'
          ? 'USD'
          : req.body?.defaultCurrency === 'IQD'
          ? 'IQD'
          : currentOrg.defaultCurrency;
      const defaultLanguage = ['ku', 'ar', 'en'].includes(req.body?.defaultLanguage)
        ? req.body.defaultLanguage
        : currentOrg.defaultLanguage;

      if (!name || !rawSlug) {
        return res.status(400).json({ error: 'Company name and unique slug are required.' });
      }

      try {
        const [updatedOrg] = await db
          .update(organizations)
          .set({
            name,
            slug: rawSlug,
            legalName,
            logoUrl,
            contactEmail,
            contactPhone,
            defaultCurrency,
            defaultLanguage,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, orgId))
          .returning();

        if (typeof req.body?.cancellationPolicyText === 'string') {
          await db
            .update(organizationSettings)
            .set({
              cancellationPolicyText: req.body.cancellationPolicyText.trim(),
              updatedAt: new Date(),
            })
            .where(eq(organizationSettings.organizationId, orgId));
        }

        await db.insert(activityLogs).values({
          organizationId: orgId,
          actorUid: req.user!.uid,
          actorEmail: req.dbUser!.email,
          action: 'organization.profile_updated',
          entityType: 'organization',
          entityId: String(orgId),
          details: `Updated company profile: ${updatedOrg.name} (${updatedOrg.slug})`,
        });

        res.json({ organization: updatedOrg });
      } catch (error: any) {
        console.error('Update organization profile failed:', error);
        res.status(400).json({
          error:
            error?.code === '23505'
              ? 'ئەم ناونیشانەی لینک (Slug) پێشتر لەلایەن کۆمپانیایەکی ترەوە گیراوە.'
              : 'Failed to update company profile.',
        });
      }
    }
  );

  // Safe Dry-Run Import Validator Endpoint (Rule 4 — Never touches KURDIA systems)
  app.post(
    '/api/dry-run-import',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const report = validateDryRunImport(rows);
      res.json({
        dryRunOnly: true,
        databaseMutated: false,
        ...report,
      });
    }
  );

  // ==========================================================================
  // 4. PLATFORM SUPER ADMIN ENDPOINTS (Separated & Audited — Rule 9.1)
  // ==========================================================================

  app.get('/api/platform/overview', requireAuth, async (req: AuthRequest, res) => {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({
        error: 'Forbidden: Platform Super Admin access required.',
      });
    }

    try {
      const [allOrgs, allSubs, allPlans, allLogs] = await Promise.all([
        db.select().from(organizations).orderBy(desc(organizations.createdAt)),
        db.select().from(subscriptions),
        db.select().from(subscriptionPlans),
        db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(50),
      ]);

      res.json({
        organizations: allOrgs,
        subscriptions: allSubs,
        plans: allPlans,
        auditLogs: allLogs,
      });
    } catch (error) {
      console.error('Platform overview failed:', error);
      res.status(500).json({ error: 'Failed to load Platform Super Admin console.' });
    }
  });

  app.patch(
    '/api/platform/organizations/:id/status',
    requireAuth,
    async (req: AuthRequest, res) => {
      if (!req.dbUser?.isSuperAdmin) {
        return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
      }
      const orgId = Number(req.params.id);
      const status = String(req.body?.status || 'active');
      const planCode = String(req.body?.planCode || '');

      try {
        const [updatedOrg] = await db
          .update(organizations)
          .set({ status, updatedAt: new Date() })
          .where(eq(organizations.id, orgId))
          .returning();

        if (planCode) {
          const [plan] = await db
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.code, planCode))
            .limit(1);
          if (plan) {
            await db
              .update(subscriptions)
              .set({
                planId: plan.id,
                planCode: plan.code,
                status: status === 'suspended' ? 'suspended' : 'active',
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.organizationId, orgId));
          }
        }

        await db.insert(activityLogs).values({
          organizationId: orgId,
          actorUid: req.user!.uid,
          actorEmail: req.dbUser!.email,
          action: 'platform.organization_updated',
          entityType: 'organization',
          entityId: String(orgId),
          details: `Platform Super Admin set status=${status} ${planCode ? `plan=${planCode}` : ''}`,
        });

        res.json({ organization: updatedOrg });
      } catch (error) {
        console.error('Platform org update failed:', error);
        res.status(500).json({ error: 'Failed to update organization status.' });
      }
    }
  );

  // ==========================================================================
  // 5. VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // ==========================================================================

  const httpServer = createHttpServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`RAVAN Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
