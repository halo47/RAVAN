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
  coupons,
  customers,
  expenses,
  guides,
  invites,
  memberships,
  notifications,
  organizations,
  organizationSettings,
  payments,
  platformPaymentMethods,
  salesLeads,
  subscriptionInvoices,
  subscriptionPayments,
  subscriptionPlans,
  subscriptions,
  supportTickets,
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
  // 1. PUBLIC ENDPOINTS (Single-Trip Registration, Company Page & SaaS Info)
  // ==========================================================================

  app.get('/api/public/saas-info', rateLimit(60, 60_000), async (_req, res) => {
    try {
      const plans = await ensureSubscriptionPlans();
      const methods = await db
        .select()
        .from(platformPaymentMethods)
        .where(eq(platformPaymentMethods.isEnabled, true));
      res.json({
        plans: plans.filter((p) => p.isActive),
        paymentMethods: methods,
      });
    } catch (error) {
      console.error('GET /api/public/saas-info failed:', error);
      res.status(500).json({ error: 'Unable to load SaaS plans.' });
    }
  });

  app.post('/api/public/demo-request', rateLimit(15, 60_000), async (req, res) => {
    try {
      const contactName = String(req.body?.contactName || '').trim();
      const companyName = String(req.body?.companyName || '').trim();
      const phone = normalizePhoneNumber(String(req.body?.phone || ''));
      const email = String(req.body?.email || '').trim();
      const city = String(req.body?.city || 'Erbil').trim();
      const interestedPlan = String(req.body?.interestedPlan || 'professional').trim();
      const notes = String(req.body?.notes || '').trim();

      if (!contactName || !companyName || !phone) {
        return res
          .status(400)
          .json({ error: 'Contact name, company name, and valid phone are required.' });
      }

      const [lead] = await db
        .insert(salesLeads)
        .values({
          contactName,
          companyName,
          phone,
          email,
          city,
          interestedPlan,
          leadSource: 'Public Website Demo Request',
          status: 'new',
          estimatedDealValue: interestedPlan === 'business' ? 100000 : 50000,
          currency: 'IQD',
          notes,
        })
        .returning();

      res.status(201).json({ lead });
    } catch (error) {
      console.error('POST /api/public/demo-request failed:', error);
      res.status(500).json({ error: 'Failed to submit demo request.' });
    }
  });

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
            category: trips.category,
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
            childPriceAmount: trips.childPriceAmount,
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
            city: organizations.city,
            country: organizations.country,
            socialLinks: organizations.socialLinks,
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
          city: o.city,
          country: o.country,
          socialLinks: o.socialLinks,
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

      const tripRes = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [
        input.tripId,
      ]);
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

  app.post('/api/dev/seed', requireAuth, async (req: AuthRequest, res) => {
    try {
      const demoOrg = await seedDemoTenantsForUser(req.dbUser!);
      res.json({ ok: true, organization: demoOrg });
    } catch (error) {
      console.error('Demo seed failed:', error);
      res.status(500).json({ error: 'Failed to seed demo organizations.' });
    }
  });

  app.post('/api/organizations', requireAuth, async (req: AuthRequest, res) => {
    const parsed = createOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid organization data', details: parsed.error.issues });
    }

    const data = parsed.data;
    const requestedPlanCode = String(req.body?.planCode || 'professional').trim();
    const country = String(req.body?.country || 'Iraq / Kurdistan Region').trim();
    const city = String(req.body?.city || 'Erbil').trim();
    const socialLinks = String(req.body?.socialLinks || '').trim();

    try {
      const plans = await ensureSubscriptionPlans();
      const selectedPlan =
        plans.find((p) => p.code === requestedPlanCode) ||
        plans.find((p) => p.code === 'professional') ||
        plans[0];

      const [createdOrg] = await db
        .insert(organizations)
        .values({
          name: data.name.trim(),
          slug: data.slug.trim().toLowerCase(),
          legalName: data.legalName || data.name.trim(),
          logoUrl: data.logoUrl || '',
          contactEmail: data.contactEmail || req.dbUser!.email,
          contactPhone: normalizePhoneNumber(data.contactPhone),
          country,
          city,
          socialLinks,
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
      const trialDays = selectedPlan.trialDays || 14;
      const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

      await db.insert(subscriptions).values({
        organizationId: createdOrg.id,
        planId: selectedPlan.id,
        planCode: selectedPlan.code,
        status: 'trialing',
        billingCycle: 'monthly',
        startDate: now,
        endDate: trialEnd,
        renewalDate: trialEnd,
        manualVerificationNote: `Initial ${trialDays}-day SaaS trial`,
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
        details: `Created organization ${createdOrg.name} (${createdOrg.slug}) on ${selectedPlan.code} trial`,
      });

      res.status(201).json({ organization: createdOrg });
    } catch (error: any) {
      console.error('Create organization failed:', error);
      res.status(400).json({
        error:
          error?.code === '23505'
            ? 'Organization slug already exists.'
            : 'Failed to create organization.',
      });
    }
  });

  // ==========================================================================
  // 3. TENANT-SCOPED OPERATIONAL ENDPOINTS
  // ==========================================================================

  app.get('/api/dashboard', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    const orgId = req.activeOrganizationId!;
    try {
      const [
        orgRecord,
        orgTrips,
        orgBookings,
        orgPayments,
        orgExpenses,
        orgNotifications,
        orgSub,
        orgSettings,
        orgMembers,
        orgPickupPoints,
        orgLogs,
      ] = await Promise.all([
        db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1),
        db
          .select()
          .from(trips)
          .where(eq(trips.organizationId, orgId))
          .orderBy(desc(trips.departureAt)),
        db
          .select()
          .from(bookings)
          .where(eq(bookings.organizationId, orgId))
          .orderBy(desc(bookings.createdAt)),
        db
          .select()
          .from(payments)
          .where(eq(payments.organizationId, orgId))
          .orderBy(desc(payments.receivedAt)),
        db
          .select()
          .from(expenses)
          .where(eq(expenses.organizationId, orgId))
          .orderBy(desc(expenses.expenseDate)),
        db
          .select()
          .from(notifications)
          .where(eq(notifications.organizationId, orgId))
          .orderBy(desc(notifications.createdAt)),
        db.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId)).limit(1),
        db
          .select()
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, orgId))
          .limit(1),
        db.select().from(memberships).where(eq(memberships.organizationId, orgId)),
        db.select().from(tripPickupPoints).where(eq(tripPickupPoints.organizationId, orgId)),
        db
          .select()
          .from(activityLogs)
          .where(eq(activityLogs.organizationId, orgId))
          .orderBy(desc(activityLogs.createdAt))
          .limit(12),
      ]);

      const activeTripsCount = orgTrips.filter(
        (t) => t.status === 'published' || t.status === 'full'
      ).length;
      const pendingBookingsCount = orgBookings.filter((b) => b.status === 'pending').length;
      const approvedBookingsCount = orgBookings.filter(
        (b) => b.status === 'approved' || b.status === 'completed'
      ).length;
      const totalPassengers = orgBookings
        .filter((b) => b.status === 'approved' || b.status === 'completed' || b.status === 'pending')
        .reduce((sum, b) => sum + b.passengerCount, 0);
      const totalAvailableSeats = orgTrips
        .filter((t) => t.status === 'published')
        .reduce((sum, t) => sum + t.availableSeats, 0);

      // Compute onboarding checklist progress dynamically from actual DB records (Section 4)
      const org = orgRecord[0];
      const onboardingChecklist = {
        profileCompleted: Boolean(org?.name && org?.legalName && org?.city),
        logoUploaded: Boolean(org?.logoUrl),
        contactConfigured: Boolean(org?.contactPhone && org?.contactEmail),
        staffAdded: orgMembers.length > 1,
        firstTripCreated: orgTrips.length > 0,
        pickupPointsAdded: orgPickupPoints.length > 0,
        firstTripPublished: orgTrips.some((t) => t.status === 'published' || t.status === 'full'),
        firstPaymentRecorded: orgPayments.length > 0,
      };

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
          totalTripsCount: orgTrips.length,
          activeTripsCount,
          totalBookingsCount: orgBookings.length,
          pendingBookingsCount,
          approvedBookingsCount,
          totalPassengers,
          totalAvailableSeats,
        },
        onboardingChecklist,
        ledger: ledgerSummary,
        upcomingTrips: orgTrips.slice(0, 6),
        recentBookings: orgBookings.slice(0, 6),
        notifications: orgNotifications.slice(0, 15),
        recentActivities: orgLogs,
        subscription: orgSub[0] || null,
        settings: orgSettings[0] || null,
      });
    } catch (error) {
      console.error('Dashboard query failed:', error);
      res.status(500).json({ error: 'Failed to load company dashboard data.' });
    }
  });

  // TRIPS & TRIP EXECUTION MODULE
  app.get('/api/trips', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'trips.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing trips.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgTrips, orgGuides, orgVehicles, pickupPoints, orgPassengers, orgBookings, orgExpenses] =
        await Promise.all([
          db
            .select()
            .from(trips)
            .where(eq(trips.organizationId, orgId))
            .orderBy(desc(trips.departureAt)),
          db.select().from(guides).where(eq(guides.organizationId, orgId)),
          db.select().from(vehicles).where(eq(vehicles.organizationId, orgId)),
          db.select().from(tripPickupPoints).where(eq(tripPickupPoints.organizationId, orgId)),
          db.select().from(bookingPassengers).where(eq(bookingPassengers.organizationId, orgId)),
          db.select().from(bookings).where(eq(bookings.organizationId, orgId)),
          db.select().from(expenses).where(eq(expenses.organizationId, orgId)),
        ]);

      res.json({
        trips: orgTrips,
        guides: orgGuides,
        vehicles: orgVehicles,
        pickupPoints,
        passengers: orgPassengers,
        bookings: orgBookings,
        expenses: orgExpenses,
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
    const category = String(req.body?.category || 'nature').trim();
    const childPriceAmount = Math.max(0, Number(req.body?.childPriceAmount || 0));

    try {
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, orgId))
        .limit(1);

      const [plan] = sub
        ? await db
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.id, sub.planId))
            .limit(1)
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
          category,
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
          childPriceAmount,
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
        error:
          error?.code === '23505'
            ? 'Trip code already exists in this organization.'
            : 'Failed to create trip.',
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
          guideId: req.body?.guideId !== undefined ? req.body.guideId : existing.guideId,
          vehicleId: req.body?.vehicleId !== undefined ? req.body.vehicleId : existing.vehicleId,
          operationalNotes:
            typeof req.body?.operationalNotes === 'string'
              ? req.body.operationalNotes
              : existing.operationalNotes,
          preparationChecklist:
            req.body?.preparationChecklist !== undefined
              ? req.body.preparationChecklist
              : existing.preparationChecklist,
          updatedAt: new Date(),
        })
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, orgId)))
        .returning();

      await db.insert(activityLogs).values({
        organizationId: orgId,
        actorUid: req.user!.uid,
        actorEmail: req.dbUser!.email,
        action: `trip.updated.${updated.status}`,
        entityType: 'trip',
        entityId: String(tripId),
        details: `Trip ${existing.code} updated (status=${updated.status})`,
      });

      res.json({ trip: updated });
    } catch (error) {
      console.error('Update trip failed:', error);
      res.status(500).json({ error: 'Failed to update trip.' });
    }
  });

  // Passenger Attendance Check-In (Section 10 — Tour Guide / Operations Staff)
  app.patch(
    '/api/passengers/:id/attendance',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const passengerId = Number(req.params.id);
      const orgId = req.activeOrganizationId!;
      const attendanceStatus = String(req.body?.attendanceStatus || 'present');
      const attendanceNotes = String(req.body?.attendanceNotes || '').trim();

      if (!['pending', 'present', 'no_show'].includes(attendanceStatus)) {
        return res.status(400).json({ error: 'Invalid attendance status.' });
      }

      try {
        const [updated] = await db
          .update(bookingPassengers)
          .set({
            attendanceStatus,
            attendanceNotes,
            checkedInAt: attendanceStatus === 'present' ? new Date() : null,
          })
          .where(
            and(
              eq(bookingPassengers.id, passengerId),
              eq(bookingPassengers.organizationId, orgId)
            )
          )
          .returning();

        if (!updated) {
          return res.status(404).json({ error: 'Passenger not found in your organization.' });
        }

        res.json({ passenger: updated });
      } catch (error) {
        console.error('Update passenger attendance failed:', error);
        res.status(500).json({ error: 'Failed to update passenger attendance.' });
      }
    }
  );

  // BOOKINGS MODULE (Atomic Concurrency Protection)
  app.get('/api/bookings', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'bookings.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing bookings.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgBookings, orgCustomers, orgTrips, orgPassengers, orgHistory] = await Promise.all([
        db
          .select()
          .from(bookings)
          .where(eq(bookings.organizationId, orgId))
          .orderBy(desc(bookings.createdAt)),
        db.select().from(customers).where(eq(customers.organizationId, orgId)),
        db.select().from(trips).where(eq(trips.organizationId, orgId)),
        db.select().from(bookingPassengers).where(eq(bookingPassengers.organizationId, orgId)),
        db
          .select()
          .from(bookingStatusHistory)
          .where(eq(bookingStatusHistory.organizationId, orgId))
          .orderBy(desc(bookingStatusHistory.createdAt)),
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
    const installmentDueDate = String(req.body?.installmentDueDate || '').trim();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const idempRes = await client.query(
        'SELECT * FROM bookings WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1',
        [orgId, input.idempotencyKey]
      );
      if (idempRes.rowCount && idempRes.rowCount > 0) {
        await client.query('COMMIT');
        return res.status(200).json({ booking: idempRes.rows[0], deduplicated: true });
      }

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
          return res
            .status(400)
            .json({ error: 'Select an existing customer or provide name and phone.' });
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
          seats_reserved, pickup_point_name, installment_due_date, customer_notes, internal_notes,
          idempotency_key, created_by_uid
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,$15,$16)
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
          installmentDueDate,
          input.customerNotes || '',
          input.internalNotes || '',
          input.idempotencyKey,
          req.user!.uid,
        ]
      );

      const createdBooking = bookingInsert.rows[0];

      const passengerRows =
        input.passengers && input.passengers.length > 0
          ? input.passengers
          : [
              {
                fullName: customerName,
                phone: customerPhone,
                ageGroup: 'adult' as const,
                specialRequirements: '',
              },
            ];

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
        (targetStatus === 'approved' ||
          targetStatus === 'completed' ||
          targetStatus === 'no_show') &&
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
          [
            orgId,
            bookingId,
            bRow.status,
            targetStatus,
            reason || `Status updated to ${targetStatus}`,
            req.user!.uid,
          ]
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
      const [orgCustomers, orgBookings, orgPayments] = await Promise.all([
        db
          .select()
          .from(customers)
          .where(eq(customers.organizationId, orgId))
          .orderBy(desc(customers.createdAt)),
        db.select().from(bookings).where(eq(bookings.organizationId, orgId)),
        db.select().from(payments).where(eq(payments.organizationId, orgId)),
      ]);

      const enriched = orgCustomers.map((c) => {
        const custBookings = orgBookings.filter((b) => b.customerId === c.id);
        const custPayments = orgPayments.filter((p) => p.customerId === c.id);
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
          bookings: custBookings,
          payments: custPayments,
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
      return res
        .status(400)
        .json({ error: 'Invalid customer data', details: parsed.error.issues });
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
        db
          .select()
          .from(payments)
          .where(eq(payments.organizationId, orgId))
          .orderBy(desc(payments.receivedAt)),
        db
          .select()
          .from(expenses)
          .where(eq(expenses.organizationId, orgId))
          .orderBy(desc(expenses.expenseDate)),
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

      const tripProfitability = orgTrips.map((t) => {
        const tBookings = orgBookings.filter(
          (b) => b.tripId === t.id && b.status !== 'cancelled' && b.status !== 'rejected'
        );
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
        const expectedRevenue = tBookings.reduce((s, b) => s + b.totalAmount, 0);
        const outstanding = Math.max(0, expectedRevenue - collected);
        const spent = tExpenses.reduce((s, e) => s + e.amount, 0);
        const netProfit = collected - spent;
        const estimatedProfit = expectedRevenue - spent;
        const marginPct = collected > 0 ? Math.round((netProfit / collected) * 100) : 0;

        return {
          tripId: t.id,
          code: t.code,
          titleKu: t.titleKu,
          titleAr: t.titleAr,
          titleEn: t.titleEn,
          currency: t.currency,
          confirmedPassengers: tBookings.reduce((s, b) => s + b.passengerCount, 0),
          collected,
          outstanding,
          expenses: spent,
          estimatedProfit,
          netProfit,
          marginPct,
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

      // Prevent duplicate referenceCode on the same booking if provided
      if (data.referenceCode && data.referenceCode.trim()) {
        const dupCheck = await client.query(
          'SELECT id FROM payments WHERE organization_id = $1 AND booking_id = $2 AND reference_code = $3 LIMIT 1',
          [orgId, bRow.id, data.referenceCode.trim()]
        );
        if (dupCheck.rowCount && dupCheck.rowCount > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: `Duplicate payment reference code (${data.referenceCode}) for this booking.`,
          });
        }
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

      await client.query('UPDATE bookings SET paid_amount = $1, updated_at = NOW() WHERE id = $2', [
        netPaid,
        bRow.id,
      ]);

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

  // ==========================================================================
  // 4. COMPANY SUBSCRIPTION PORTAL, COUPONS, INVOICES & SUPPORT TICKETS
  // ==========================================================================

  app.get(
    '/api/subscription',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const orgId = req.activeOrganizationId!;
      try {
        const [
          orgSub,
          allPlans,
          orgInvoices,
          orgSubPayments,
          methods,
          orgTrips,
          orgMembers,
          orgBookings,
        ] = await Promise.all([
          db.select().from(subscriptions).where(eq(subscriptions.organizationId, orgId)).limit(1),
          db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)),
          db
            .select()
            .from(subscriptionInvoices)
            .where(eq(subscriptionInvoices.organizationId, orgId))
            .orderBy(desc(subscriptionInvoices.createdAt)),
          db
            .select()
            .from(subscriptionPayments)
            .where(eq(subscriptionPayments.organizationId, orgId))
            .orderBy(desc(subscriptionPayments.createdAt)),
          db
            .select()
            .from(platformPaymentMethods)
            .where(eq(platformPaymentMethods.isEnabled, true)),
          db.select().from(trips).where(eq(trips.organizationId, orgId)),
          db.select().from(memberships).where(eq(memberships.organizationId, orgId)),
          db.select().from(bookings).where(eq(bookings.organizationId, orgId)),
        ]);

        const sub = orgSub[0] || null;
        const currentPlan = sub ? allPlans.find((p) => p.id === sub.planId) || allPlans[0] : allPlans[0];
        const activeTripsCount = orgTrips.filter(
          (t) => t.status === 'draft' || t.status === 'published' || t.status === 'full'
        ).length;

        res.json({
          subscription: sub,
          currentPlan,
          plans: allPlans,
          invoices: orgInvoices,
          payments: orgSubPayments,
          paymentMethods: methods,
          usage: {
            activeTripsCount,
            maxActiveTrips: currentPlan?.maxActiveTrips || 15,
            membersCount: orgMembers.length,
            maxMembers: currentPlan?.maxMembers || 5,
            bookingsCount: orgBookings.length,
            maxMonthlyBookings: currentPlan?.maxMonthlyBookings || 200,
          },
        });
      } catch (error) {
        console.error('GET /api/subscription failed:', error);
        res.status(500).json({ error: 'Failed to load company subscription portal.' });
      }
    }
  );

  // Request Subscription Renewal / Plan Upgrade with Manual Payment Reference & Optional Coupon
  app.post(
    '/api/subscription/renew',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      if (!hasPermission(req.activeMembership, 'settings.manage')) {
        return res.status(403).json({ error: 'Forbidden: Only owner/settings manager can renew subscription.' });
      }

      const orgId = req.activeOrganizationId!;
      const planCode = String(req.body?.planCode || 'professional').trim();
      const billingCycle = req.body?.billingCycle === 'annual' ? 'annual' : 'monthly';
      const currency: Currency = req.body?.currency === 'USD' ? 'USD' : 'IQD';
      const paymentMethod = String(req.body?.paymentMethod || 'manual_bank_transfer').trim();
      const transactionReference = String(req.body?.transactionReference || '').trim();
      const receiptNotes = String(req.body?.receiptNotes || '').trim();
      const couponCode = String(req.body?.couponCode || '').trim().toUpperCase();

      if (!transactionReference) {
        return res.status(400).json({
          error: 'ژمارەی پسوولەی حەواڵە / پارەدان (Transaction Reference) پێویستە.',
        });
      }

      try {
        const [targetPlan] = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.code, planCode))
          .limit(1);

        if (!targetPlan) {
          return res.status(404).json({ error: 'Selected subscription plan not found.' });
        }

        let originalAmount =
          currency === 'USD'
            ? billingCycle === 'annual'
              ? targetPlan.proposedAnnualUsd
              : targetPlan.proposedMonthlyUsd
            : billingCycle === 'annual'
            ? targetPlan.proposedAnnualIqd
            : targetPlan.proposedMonthlyIqd;

        let discountAmount = 0;

        if (couponCode) {
          const [coupon] = await db
            .select()
            .from(coupons)
            .where(eq(coupons.code, couponCode))
            .limit(1);

          if (
            !coupon ||
            !coupon.isActive ||
            coupon.usedCount >= coupon.maxUses ||
            new Date(coupon.expiresAt) < new Date()
          ) {
            return res.status(400).json({
              error: 'کۆدی داشکاندن (Coupon) نادروستە یان ماوەکەی بەسەرچووە.',
            });
          }

          if (coupon.discountType === 'percentage') {
            discountAmount = Math.round((originalAmount * coupon.discountValue) / 100);
          } else if (coupon.currency === currency) {
            discountAmount = Math.min(originalAmount, coupon.discountValue);
          }

          await db
            .update(coupons)
            .set({ usedCount: coupon.usedCount + 1 })
            .where(eq(coupons.id, coupon.id));
        }

        const finalAmount = Math.max(0, originalAmount - discountAmount);
        const now = new Date();
        const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const invoiceNumber = `INV-RVN-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const [invoice] = await db
          .insert(subscriptionInvoices)
          .values({
            invoiceNumber,
            organizationId: orgId,
            planCode: targetPlan.code,
            billingCycle,
            originalAmount,
            discountAmount,
            finalAmount,
            currency,
            couponCode,
            paymentMethod,
            status: 'pending_verification',
            issueDate: now,
            dueDate,
          })
          .returning();

        const [subPayment] = await db
          .insert(subscriptionPayments)
          .values({
            organizationId: orgId,
            invoiceId: invoice.id,
            planCode: targetPlan.code,
            billingCycle,
            amount: finalAmount,
            currency,
            paymentMethod,
            transactionReference,
            receiptNotes,
            status: 'pending_verification',
            extensionApplied: false,
            submittedByUid: req.user!.uid,
          })
          .returning();

        await db.insert(activityLogs).values({
          organizationId: orgId,
          actorUid: req.user!.uid,
          actorEmail: req.dbUser!.email,
          action: 'subscription.renewal_requested',
          entityType: 'subscription_invoice',
          entityId: String(invoice.id),
          details: `Submitted renewal (${targetPlan.code}, ${billingCycle}, ${finalAmount} ${currency}, ref=${transactionReference})`,
        });

        res.status(201).json({ invoice, payment: subPayment });
      } catch (error) {
        console.error('POST /api/subscription/renew failed:', error);
        res.status(500).json({ error: 'Failed to submit subscription renewal request.' });
      }
    }
  );

  // SUPPORT TICKETS MODULE (Section 26)
  app.get(
    '/api/support-tickets',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const orgId = req.activeOrganizationId!;
      try {
        const tickets = await db
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.organizationId, orgId))
          .orderBy(desc(supportTickets.createdAt));
        res.json({ tickets });
      } catch (error) {
        console.error('GET /api/support-tickets failed:', error);
        res.status(500).json({ error: 'Failed to load support tickets.' });
      }
    }
  );

  app.post(
    '/api/support-tickets',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
      const orgId = req.activeOrganizationId!;
      const subject = String(req.body?.subject || '').trim();
      const category = String(req.body?.category || 'operations').trim();
      const description = String(req.body?.description || '').trim();
      const priority = String(req.body?.priority || 'normal').trim();

      if (!subject || !description) {
        return res.status(400).json({ error: 'Subject and description are required.' });
      }

      try {
        const [ticket] = await db
          .insert(supportTickets)
          .values({
            organizationId: orgId,
            createdByUid: req.user!.uid,
            createdByEmail: req.dbUser!.email,
            subject,
            category,
            description,
            priority,
            status: 'open',
          })
          .returning();

        res.status(201).json({ ticket });
      } catch (error) {
        console.error('POST /api/support-tickets failed:', error);
        res.status(500).json({ error: 'Failed to submit support ticket.' });
      }
    }
  );

  // COMPANY REPORTS & ANALYTICS MODULE (Section 13)
  app.get('/api/reports', requireAuth, requireTenantMembership, async (req: AuthRequest, res) => {
    if (!hasPermission(req.activeMembership, 'reports.read')) {
      return res.status(403).json({ error: 'Forbidden: Missing reports.read permission' });
    }
    const orgId = req.activeOrganizationId!;
    try {
      const [orgTrips, orgBookings, orgPayments, orgExpenses, orgCustomers] = await Promise.all([
        db.select().from(trips).where(eq(trips.organizationId, orgId)),
        db.select().from(bookings).where(eq(bookings.organizationId, orgId)),
        db.select().from(payments).where(eq(payments.organizationId, orgId)),
        db.select().from(expenses).where(eq(expenses.organizationId, orgId)),
        db.select().from(customers).where(eq(customers.organizationId, orgId)),
      ]);

      const totalBookings = orgBookings.length;
      const cancelledBookings = orgBookings.filter(
        (b) => b.status === 'cancelled' || b.status === 'rejected'
      ).length;
      const cancellationRatePct =
        totalBookings > 0 ? Math.round((cancelledBookings / totalBookings) * 100) : 0;

      // Popular destinations breakdown
      const destinationMap = new Map<
        string,
        { destination: string; tripCount: number; passengerCount: number }
      >();
      for (const tr of orgTrips) {
        const cur = destinationMap.get(tr.destination) || {
          destination: tr.destination,
          tripCount: 0,
          passengerCount: 0,
        };
        cur.tripCount += 1;
        cur.passengerCount += tr.totalCapacity - tr.availableSeats;
        destinationMap.set(tr.destination, cur);
      }

      res.json({
        cancellationRatePct,
        totalTrips: orgTrips.length,
        totalBookings,
        totalCustomers: orgCustomers.length,
        popularDestinations: Array.from(destinationMap.values()),
        trips: orgTrips,
        bookings: orgBookings,
        payments: orgPayments,
        expenses: orgExpenses,
      });
    } catch (error) {
      console.error('GET /api/reports failed:', error);
      res.status(500).json({ error: 'Failed to generate company reports.' });
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

  app.post(
    '/api/members/invite',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
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
    }
  );

  app.patch(
    '/api/members/:id',
    requireAuth,
    requireTenantMembership,
    async (req: AuthRequest, res) => {
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
    }
  );

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
          seatReserveMode: seatReserveMode === 'on_approved' ? 'on_approved' : 'on_pending',
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
      const city = String(req.body?.city ?? currentOrg.city).trim();
      const country = String(req.body?.country ?? currentOrg.country).trim();
      const socialLinks = String(req.body?.socialLinks ?? currentOrg.socialLinks).trim();
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
            city,
            country,
            socialLinks,
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
  // 5. PLATFORM SUPER ADMIN COMMERCIAL CONSOLE ENDPOINTS (Sections 15, 18, 20-26)
  // ==========================================================================

  app.get('/api/platform/overview', requireAuth, async (req: AuthRequest, res) => {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({
        error: 'Forbidden: Platform Super Admin access required.',
      });
    }

    try {
      const [
        allOrgs,
        allSubs,
        allPlans,
        allInvoices,
        allSubPayments,
        allPaymentMethods,
        allLeads,
        allCoupons,
        allTickets,
        allLogs,
      ] = await Promise.all([
        db.select().from(organizations).orderBy(desc(organizations.createdAt)),
        db.select().from(subscriptions),
        db.select().from(subscriptionPlans),
        db.select().from(subscriptionInvoices).orderBy(desc(subscriptionInvoices.createdAt)),
        db.select().from(subscriptionPayments).orderBy(desc(subscriptionPayments.createdAt)),
        db.select().from(platformPaymentMethods),
        db.select().from(salesLeads).orderBy(desc(salesLeads.createdAt)),
        db.select().from(coupons).orderBy(desc(coupons.createdAt)),
        db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)),
        db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(50),
      ]);

      // Calculate accurate platform commercial revenue separated by IQD and USD (Section 24)
      let collectedIqd = 0;
      let collectedUsd = 0;
      let pendingIqd = 0;
      let pendingUsd = 0;

      for (const sp of allSubPayments) {
        if (sp.status === 'approved') {
          if (sp.currency === 'USD') collectedUsd += sp.amount;
          else collectedIqd += sp.amount;
        } else if (sp.status === 'pending_verification') {
          if (sp.currency === 'USD') pendingUsd += sp.amount;
          else pendingIqd += sp.amount;
        }
      }

      // Calculate MRR / ARR from active subscriptions separated by organization currency
      const planMap = new Map(allPlans.map((p) => [p.id, p]));
      const orgMap = new Map(allOrgs.map((o) => [o.id, o]));
      let mrrIqd = 0;
      let mrrUsd = 0;

      for (const s of allSubs) {
        if (s.status !== 'active') continue;
        const p = planMap.get(s.planId);
        const o = orgMap.get(s.organizationId);
        if (!p || !o) continue;
        if (o.defaultCurrency === 'USD') {
          mrrUsd +=
            s.billingCycle === 'annual' ? Math.round(p.proposedAnnualUsd / 12) : p.proposedMonthlyUsd;
        } else {
          mrrIqd +=
            s.billingCycle === 'annual' ? Math.round(p.proposedAnnualIqd / 12) : p.proposedMonthlyIqd;
        }
      }

      res.json({
        commercialMetrics: {
          collectedIqd,
          collectedUsd,
          pendingIqd,
          pendingUsd,
          mrrIqd,
          mrrUsd,
          arrIqd: mrrIqd * 12,
          arrUsd: mrrUsd * 12,
          totalCompanies: allOrgs.length,
          activeSubscribers: allSubs.filter((s) => s.status === 'active').length,
          trialCompanies: allSubs.filter((s) => s.status === 'trialing').length,
          expiredSubscriptions: allSubs.filter((s) => s.status === 'expired').length,
          suspendedCompanies: allOrgs.filter((o) => o.status === 'suspended').length,
          totalLeads: allLeads.length,
          convertedLeads: allLeads.filter((l) => l.status === 'converted').length,
        },
        organizations: allOrgs,
        subscriptions: allSubs,
        plans: allPlans,
        invoices: allInvoices,
        subscriptionPayments: allSubPayments,
        paymentMethods: allPaymentMethods,
        salesLeads: allLeads,
        coupons: allCoupons,
        supportTickets: allTickets,
        auditLogs: allLogs,
      });
    } catch (error) {
      console.error('Platform overview failed:', error);
      res.status(500).json({ error: 'Failed to load Platform Super Admin console.' });
    }
  });

  // Super Admin: Verify Manual Subscription Payment & Extend Subscription Exactly Once (Section 20)
  app.post(
    '/api/platform/subscription-payments/:id/verify',
    requireAuth,
    async (req: AuthRequest, res) => {
      if (!req.dbUser?.isSuperAdmin) {
        return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
      }

      const paymentId = Number(req.params.id);
      const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';
      const reviewNotes = String(req.body?.reviewNotes || '').trim();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const payRes = await client.query(
          'SELECT * FROM subscription_payments WHERE id = $1 FOR UPDATE',
          [paymentId]
        );
        if (payRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Subscription payment not found.' });
        }

        const payRow = payRes.rows[0];
        if (payRow.extension_applied && decision === 'approved') {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'This subscription payment was already verified and applied once.',
          });
        }

        const orgId = Number(payRow.organization_id);
        const now = new Date();

        if (decision === 'approved') {
          const daysToAdd = payRow.billing_cycle === 'annual' ? 365 : 30;
          const nextEnd = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

          const planRes = await client.query(
            'SELECT * FROM subscription_plans WHERE code = $1 LIMIT 1',
            [payRow.plan_code]
          );
          const planId = planRes.rows[0]?.id || 1;

          await client.query(
            `UPDATE subscription_payments
             SET status = 'approved', extension_applied = true, reviewed_by_uid = $1, review_notes = $2, reviewed_at = NOW()
             WHERE id = $3`,
            [req.user!.uid, reviewNotes || 'Approved by Super Admin', paymentId]
          );

          await client.query(
            `UPDATE subscription_invoices
             SET status = 'paid', paid_at = NOW()
             WHERE id = $1`,
            [payRow.invoice_id]
          );

          await client.query(
            `UPDATE subscriptions
             SET plan_id = $1, plan_code = $2, status = 'active', billing_cycle = $3,
                 end_date = $4, renewal_date = $4, verified_by_uid = $5, updated_at = NOW()
             WHERE organization_id = $6`,
            [planId, payRow.plan_code, payRow.billing_cycle, nextEnd, req.user!.uid, orgId]
          );

          await client.query(
            `UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1`,
            [orgId]
          );

          await client.query(
            `INSERT INTO notifications (
              organization_id, type, title_ku, title_ar, title_en, body_ku, body_ar, body_en, entity_type, entity_id
            ) VALUES ($1, 'subscription_alert', $2, $3, $4, $5, $6, $7, 'subscription', $8)`,
            [
              orgId,
              'ئیشتراکی کۆمپانیاکەت چالاک کرا!',
              'تم تفعيل اشتراك شركتك بنجاح!',
              'Your Company Subscription Is Now Active!',
              `پارەدانی پسوولەی (${payRow.transaction_reference}) پەسەند کرا و پلانی ${payRow.plan_code} چالاک کرا.`,
              `تم تأكيد الدفعة (${payRow.transaction_reference}) وتفعيل باقة ${payRow.plan_code}.`,
              `Payment (${payRow.transaction_reference}) verified and ${payRow.plan_code} plan activated.`,
              paymentId,
            ]
          );
        } else {
          await client.query(
            `UPDATE subscription_payments
             SET status = 'rejected', reviewed_by_uid = $1, review_notes = $2, reviewed_at = NOW()
             WHERE id = $3`,
            [req.user!.uid, reviewNotes || 'Rejected by Super Admin', paymentId]
          );
          await client.query(
            `UPDATE subscription_invoices SET status = 'unpaid' WHERE id = $1`,
            [payRow.invoice_id]
          );
        }

        await client.query(
          `INSERT INTO activity_logs (organization_id, actor_uid, actor_email, action, entity_type, entity_id, details)
           VALUES ($1, $2, $3, $4, 'subscription_payment', $5, $6)`,
          [
            orgId,
            req.user!.uid,
            req.dbUser!.email,
            `platform.subscription_payment_${decision}`,
            String(paymentId),
            `Super Admin ${decision} subscription payment #${paymentId} (${payRow.amount} ${payRow.currency})`,
          ]
        );

        await client.query('COMMIT');
        res.json({ ok: true, decision });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Verify subscription payment failed:', error);
        res.status(500).json({ error: 'Failed to verify subscription payment.' });
      } finally {
        client.release();
      }
    }
  );

  // Super Admin: Send Subscription Renewal Reminder Notification (Section 22)
  app.post(
    '/api/platform/organizations/:id/send-reminder',
    requireAuth,
    async (req: AuthRequest, res) => {
      if (!req.dbUser?.isSuperAdmin) {
        return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
      }
      const orgId = Number(req.params.id);
      try {
        await db.insert(notifications).values({
          organizationId: orgId,
          recipientUid: 'all',
          type: 'subscription_alert',
          titleKu: 'ئاگادارکردنەوەی نوێکردنەوەی ئیشتراک',
          titleAr: 'تذكير بتجديد اشتراك الشركة',
          titleEn: 'Subscription Renewal Reminder',
          bodyKu:
            'ئیشتراکی کۆمپانیاکەت لە RAVAN نزیکەیە بەسەر بچێت. بۆ بەردەوامبوون لە بەکارهێنانی سیستەم، تکایە ئیشتراکەکەت نوێ بکەرەوە.',
          bodyAr:
            'اشتراك شركتك في RAVAN يقترب من الانتهاء. للاستمرار في استخدام النظام، يرجى تجديد الاشتراك.',
          bodyEn:
            'Your company subscription in RAVAN is approaching expiration. Please renew your subscription to maintain uninterrupted service.',
          entityType: 'subscription',
          entityId: orgId,
        });
        res.json({ ok: true });
      } catch (error) {
        console.error('Send renewal reminder failed:', error);
        res.status(500).json({ error: 'Failed to send renewal reminder.' });
      }
    }
  );

  // Super Admin: Manage Sales CRM Leads (Section 18)
  app.post('/api/platform/leads', requireAuth, async (req: AuthRequest, res) => {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
    }
    try {
      const [created] = await db
        .insert(salesLeads)
        .values({
          contactName: String(req.body?.contactName || '').trim(),
          companyName: String(req.body?.companyName || '').trim(),
          phone: normalizePhoneNumber(String(req.body?.phone || '')),
          email: String(req.body?.email || '').trim(),
          city: String(req.body?.city || 'Erbil').trim(),
          interestedPlan: String(req.body?.interestedPlan || 'professional').trim(),
          status: String(req.body?.status || 'new').trim(),
          estimatedDealValue: Number(req.body?.estimatedDealValue || 50000),
          currency: req.body?.currency === 'USD' ? 'USD' : 'IQD',
          notes: String(req.body?.notes || '').trim(),
          nextFollowUpDate: String(req.body?.nextFollowUpDate || '').trim(),
        })
        .returning();
      res.status(201).json({ lead: created });
    } catch (error) {
      console.error('Create lead failed:', error);
      res.status(500).json({ error: 'Failed to create sales lead.' });
    }
  });

  app.patch('/api/platform/leads/:id', requireAuth, async (req: AuthRequest, res) => {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
    }
    const leadId = Number(req.params.id);
    try {
      const [updated] = await db
        .update(salesLeads)
        .set({
          status: String(req.body?.status || 'contacted'),
          notes: req.body?.notes !== undefined ? String(req.body.notes) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(salesLeads.id, leadId))
        .returning();
      res.json({ lead: updated });
    } catch (error) {
      console.error('Update lead failed:', error);
      res.status(500).json({ error: 'Failed to update lead.' });
    }
  });

  // Super Admin: Create Coupon (Section 23)
  app.post('/api/platform/coupons', requireAuth, async (req: AuthRequest, res) => {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
    }
    try {
      const code = String(req.body?.code || '').trim().toUpperCase();
      const discountType = req.body?.discountType === 'fixed' ? 'fixed' : 'percentage';
      const discountValue = Number(req.body?.discountValue || 10);
      const currency = req.body?.currency === 'USD' ? 'USD' : 'IQD';
      const maxUses = Number(req.body?.maxUses || 50);
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const [created] = await db
        .insert(coupons)
        .values({
          code,
          discountType,
          discountValue,
          currency,
          maxUses,
          expiresAt,
          isActive: true,
        })
        .returning();
      res.status(201).json({ coupon: created });
    } catch (error) {
      console.error('Create coupon failed:', error);
      res.status(400).json({ error: 'Failed to create coupon (code may already exist).' });
    }
  });

  // Super Admin: Respond to Support Ticket (Section 26)
  app.patch('/api/platform/support-tickets/:id', requireAuth, async (req: AuthRequest, res) => {
    if (!req.dbUser?.isSuperAdmin) {
      return res.status(403).json({ error: 'Forbidden: Platform Super Admin access required.' });
    }
    const ticketId = Number(req.params.id);
    const status = String(req.body?.status || 'resolved');
    const adminResponse = String(req.body?.adminResponse || '').trim();

    try {
      const [updated] = await db
        .update(supportTickets)
        .set({
          status,
          adminResponse,
          respondedByUid: req.user!.uid,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId))
        .returning();
      res.json({ ticket: updated });
    } catch (error) {
      console.error('Respond to support ticket failed:', error);
      res.status(500).json({ error: 'Failed to update support ticket.' });
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
  // 6. VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
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
