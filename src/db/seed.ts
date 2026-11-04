import { db } from './index.ts';
import {
  activityLogs,
  bookingPassengers,
  bookings,
  bookingStatusHistory,
  coupons,
  customers,
  expenseCategories,
  expenses,
  guides,
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
} from './schema.ts';
import { eq } from 'drizzle-orm';

export async function ensureSubscriptionPlans() {
  // Ensure platform manual payment instructions exist
  const existingMethods = await db.select().from(platformPaymentMethods);
  if (existingMethods.length === 0) {
    await db.insert(platformPaymentMethods).values([
      {
        methodName: 'حەواڵەی بانکی دەستی (Manual Bank Transfer)',
        accountHolder: 'RAVAN Platform Administration',
        accountDetails: 'Configure official bank IBAN in Super Admin Console',
        instructions:
          'تکایە دوای ناردنی بڕی پارە، ژمارەی پسوولەی حەواڵە (Transaction Reference) لە فۆڕمی نوێکردنەوەدا تۆمار بکە بۆ پەسەندکردن لەلایەن سووپەر ئەدمین.',
        supportedCurrency: 'IQD',
        isEnabled: true,
      },
      {
        methodName: 'پارەدانی نەقدی لە ئۆفیس (Cash Office Delivery)',
        accountHolder: 'RAVAN Sales & Billing Desk',
        accountDetails: 'Erbil Main Office — Commercial SaaS Desk',
        instructions:
          'پارەدان بە وەسڵی فەرمی و تۆمارکردنی ژمارەی وەسڵ لە پانێڵی کۆمپانیا.',
        supportedCurrency: 'USD',
        isEnabled: true,
      },
    ]);
  }

  // Ensure initial promotional coupons exist
  const existingCoupons = await db.select().from(coupons);
  if (existingCoupons.length === 0) {
    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await db.insert(coupons).values([
      {
        code: 'RAVAN20',
        discountType: 'percentage',
        discountValue: 20,
        currency: 'IQD',
        maxUses: 100,
        usedCount: 0,
        expiresAt: in90Days,
        isActive: true,
      },
      {
        code: 'WELCOME10K',
        discountType: 'fixed',
        discountValue: 10000,
        currency: 'IQD',
        maxUses: 50,
        usedCount: 0,
        expiresAt: in90Days,
        isActive: true,
      },
    ]);
  }

  const existing = await db.select().from(subscriptionPlans);
  if (existing.length > 0) {
    return existing;
  }

  const inserted = await db
    .insert(subscriptionPlans)
    .values([
      {
        code: 'starter',
        nameKu: 'ستارتەر (پێشنیاری ناڕەسمی)',
        nameAr: 'المبتدئ (مقترح غير رسمي)',
        nameEn: 'Starter (Unvalidated Proposal)',
        descriptionKu: 'گونجاو بۆ نووسینگە و گرووپە گەشتیارییە نوێیەکان',
        proposedMonthlyIqd: 25000,
        proposedAnnualIqd: 250000,
        proposedMonthlyUsd: 20,
        proposedAnnualUsd: 200,
        trialDays: 14,
        maxMembers: 4,
        maxActiveTrips: 8,
        maxMonthlyBookings: 100,
        supportLevel: 'Standard Support',
        isProposalOnly: true,
        isActive: true,
      },
      {
        code: 'professional',
        nameKu: 'پڕۆفیشناڵ (پێشنیاری ناڕەسمی)',
        nameAr: 'المحترف (مقترح غير رسمي)',
        nameEn: 'Professional (Unvalidated Proposal)',
        descriptionKu: 'گونجاو بۆ کۆمپانیا گەشتیارییە چالاکەکان لەگەڵ ژمێریاریی تەواو',
        proposedMonthlyIqd: 50000,
        proposedAnnualIqd: 500000,
        proposedMonthlyUsd: 40,
        proposedAnnualUsd: 400,
        trialDays: 14,
        maxMembers: 12,
        maxActiveTrips: 30,
        maxMonthlyBookings: 500,
        supportLevel: 'Priority Support',
        isProposalOnly: true,
        isActive: true,
      },
      {
        code: 'business',
        nameKu: 'بزنس (پێشنیاری ناڕەسمی)',
        nameAr: 'الأعمال (مقترح غير رسمي)',
        nameEn: 'Business (Unvalidated Proposal)',
        descriptionKu: 'بۆ کۆمپانیا گەورەکان کە تیم و گەشتی زۆریان هەیە',
        proposedMonthlyIqd: 100000,
        proposedAnnualIqd: 1000000,
        proposedMonthlyUsd: 80,
        proposedAnnualUsd: 800,
        trialDays: 14,
        maxMembers: 30,
        maxActiveTrips: 100,
        maxMonthlyBookings: 2000,
        supportLevel: 'Dedicated Account Support',
        isProposalOnly: true,
        isActive: true,
      },
      {
        code: 'enterprise',
        nameKu: 'ئینتەرپرایز (پێشنیاری ناڕەسمی)',
        nameAr: 'المؤسسات (مقترح غير رسمي)',
        nameEn: 'Enterprise (Unvalidated Proposal)',
        descriptionKu: 'پلانی تایبەت بە دامەزراوە گەشتیارییە فرە-لقەکان',
        proposedMonthlyIqd: 200000,
        proposedAnnualIqd: 2000000,
        proposedMonthlyUsd: 160,
        proposedAnnualUsd: 1600,
        trialDays: 30,
        maxMembers: 100,
        maxActiveTrips: 500,
        maxMonthlyBookings: 10000,
        supportLevel: '24/7 SLA Support',
        isProposalOnly: true,
        isActive: true,
      },
    ])
    .returning();

  return inserted;
}

/**
 * Seeds two isolated demo tenants ("RAVAN Demo Travel" & "Zagros Horizon Tours")
 * for the authenticated developer/owner so multi-tenant isolation, RBAC, capacity,
 * trip execution, and IQD/USD accounting can be tested immediately. Zero KURDIA data is used.
 */
export async function seedDemoTenantsForUser(userRecord: typeof users.$inferSelect) {
  const plans = await ensureSubscriptionPlans();
  const proPlan = plans.find((p) => p.code === 'professional') || plans[0];
  const businessPlan = plans.find((p) => p.code === 'business') || plans[0];

  // Enable Super Admin flag on the seeding owner for platform console inspection
  await db
    .update(users)
    .set({ isSuperAdmin: true, updatedAt: new Date() })
    .where(eq(users.id, userRecord.id));

  // Ensure sample Sales CRM leads exist for Super Admin
  const existingLeads = await db.select().from(salesLeads);
  if (existingLeads.length === 0) {
    await db.insert(salesLeads).values([
      {
        contactName: 'دڵشاد مەحموود',
        companyName: 'کۆمپانیای هەوارگە بۆ گەشتوگوزار (DEMO LEAD)',
        phone: '+9647504112233',
        email: 'dilshad@hawarga-demo.local',
        city: 'Erbil',
        country: 'Iraq / Kurdistan Region',
        businessSize: '10-20 staff',
        leadSource: 'Website Demo Request',
        interestedPlan: 'business',
        status: 'demo_scheduled',
        estimatedDealValue: 100000,
        currency: 'IQD',
        notes: 'داوای دیمۆی سیستەمی کردووە بۆ بەڕێوەبردنی گەشتەکانی هاوینە.',
        nextFollowUpDate: '2026-11-10',
      },
      {
        contactName: 'ڕێبوار عەلی',
        companyName: 'نەورۆز تراڤڵ (DEMO LEAD)',
        phone: '+9647708119900',
        email: 'rebwar@nawroz-demo.local',
        city: 'Sulaymaniyah',
        country: 'Iraq / Kurdistan Region',
        businessSize: '5-10 staff',
        leadSource: 'Referral',
        interestedPlan: 'professional',
        status: 'interested',
        estimatedDealValue: 50000,
        currency: 'IQD',
        notes: 'گرنگی بە لینکی تایبەتی ناونوسینی هەر گەشتێک دەدات.',
        nextFollowUpDate: '2026-11-12',
      },
    ]);
  }

  // Check if RAVAN Demo Travel already exists
  const existingDemo = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, 'ravan-demo-travel'))
    .limit(1);

  if (existingDemo.length > 0) {
    const allOrgs = await db.select().from(organizations);
    for (const org of allOrgs) {
      if (org.isDemo) {
        await db
          .insert(memberships)
          .values({
            organizationId: org.id,
            userId: userRecord.id,
            userUid: userRecord.uid,
            role: 'company_owner',
            status: 'active',
          })
          .onConflictDoNothing();
      }
    }
    return existingDemo[0];
  }

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in9Days = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in18Days = new Date(now.getTime() + 18 * 24 * 60 * 60 * 1000);

  // 1. Create Tenant A: RAVAN Demo Travel
  const [orgA] = await db
    .insert(organizations)
    .values({
      slug: 'ravan-demo-travel',
      name: 'RAVAN Demo Travel (DEMO)',
      legalName: 'RAVAN Demo Travel Agency LLC',
      contactEmail: 'demo@ravan-travel.local',
      contactPhone: '+9647501112233',
      country: 'Iraq / Kurdistan Region',
      city: 'Erbil',
      defaultLanguage: 'ku',
      supportedLanguages: 'ku,ar,en',
      timezone: 'Asia/Baghdad',
      defaultCurrency: 'IQD',
      status: 'active',
      isDemo: true,
      createdByUid: userRecord.uid,
    })
    .returning();

  await db.insert(organizationSettings).values({
    organizationId: orgA.id,
    primaryColor: '#547DA8',
    accentColor: '#C8A76A',
    seatReserveMode: 'on_pending',
    bookingAutoApprove: false,
    publicPageEnabled: true,
  });

  await db.insert(subscriptions).values({
    organizationId: orgA.id,
    planId: proPlan.id,
    planCode: proPlan.code,
    status: 'active',
    billingCycle: 'monthly',
    startDate: now,
    endDate: in30Days,
    renewalDate: in30Days,
    manualVerificationNote: 'DEMO Tenant — Manual Pilot Activation',
    verifiedByUid: userRecord.uid,
  });

  // Seed a paid subscription invoice for Tenant A
  const [invA] = await db
    .insert(subscriptionInvoices)
    .values({
      invoiceNumber: 'INV-RVN-2026-001',
      organizationId: orgA.id,
      planCode: proPlan.code,
      billingCycle: 'monthly',
      originalAmount: 50000,
      discountAmount: 0,
      finalAmount: 50000,
      currency: 'IQD',
      paymentMethod: 'manual_bank_transfer',
      status: 'paid',
      issueDate: now,
      dueDate: in7Days,
      paidAt: now,
    })
    .returning();

  await db.insert(subscriptionPayments).values({
    organizationId: orgA.id,
    invoiceId: invA.id,
    planCode: proPlan.code,
    billingCycle: 'monthly',
    amount: 50000,
    currency: 'IQD',
    paymentMethod: 'manual_bank_transfer',
    transactionReference: 'BNK-PILOT-1001',
    receiptNotes: 'Initial verified subscription payment (DEMO)',
    status: 'approved',
    extensionApplied: true,
    submittedByUid: userRecord.uid,
    reviewedByUid: userRecord.uid,
    reviewNotes: 'Verified by Platform Super Admin',
    reviewedAt: now,
  });

  await db.insert(supportTickets).values({
    organizationId: orgA.id,
    createdByUid: userRecord.uid,
    createdByEmail: userRecord.email,
    subject: 'چۆنیەتی زیادکردنی ڕێبەری دووەم بۆ گەشتی چۆمان؟',
    category: 'operations',
    description: 'دەمانەوێت بزانین چۆن لە بەشی ئامادەکاریی گەشتدا ئامادەبوونی بەشداربووان تۆمار دەکرێت.',
    priority: 'normal',
    status: 'resolved',
    adminResponse: 'لە تابی "ئامادەکاری و جێبەجێکردنی گەشت" دەتوانیت ڕاستەوخۆ ئامادەبووی هەر سەرنشینێک (Present / No-Show) دیاری بکەیت.',
    respondedByUid: userRecord.uid,
  });

  await db.insert(memberships).values({
    organizationId: orgA.id,
    userId: userRecord.id,
    userUid: userRecord.uid,
    role: 'company_owner',
    status: 'active',
  });

  const [guideA] = await db
    .insert(guides)
    .values({
      organizationId: orgA.id,
      fullName: 'کاروان هەولێری (Karwan Hawleri)',
      phone: '+9647503334455',
      languages: 'ku,ar,en',
      specialty: 'چیاوانی و گەشتی سروشتی کوردستان',
      notes: 'DEMO Guide Profile',
    })
    .returning();

  const [vehicleA] = await db
    .insert(vehicles)
    .values({
      organizationId: orgA.id,
      name: 'Toyota Coaster VIP #01',
      vehicleType: 'Coaster Bus',
      plateNumber: 'EBL-40219',
      capacity: 24,
      driverName: 'سەردار محەمەد',
      driverPhone: '+9647504445566',
      status: 'assigned',
    })
    .returning();

  const [tripIqd] = await db
    .insert(trips)
    .values({
      organizationId: orgA.id,
      code: 'RVN-CHM-01',
      category: 'mountain',
      status: 'published',
      titleKu: 'گەشتی شاخەوانیی چۆمان و پرژێ (DEMO)',
      titleAr: 'رحلة جبال جومان وبرجي (DEMO)',
      titleEn: 'Choman & Przhe Alpine Expedition (DEMO)',
      descriptionKu:
        'گەشتێکی ٢ ڕۆژە بۆ ناوچە فێنکەکانی باڵەکایەتی و تاڤگەی پرژێ بە خزمەتگوزاریی تەواو.',
      descriptionAr: 'رحلة لمدة يومين إلى مرتفعات بالكايتي وشلالات برجي شاملة النقل والإقامة.',
      descriptionEn:
        '2-day guided alpine tour to Choman and Przhe waterfalls including transport and meals.',
      destination: 'Choman / Balakayati',
      departureLocation: 'Erbil — Shanadar Park',
      departureAt: in7Days,
      returnAt: in9Days,
      priceAmount: 65000,
      childPriceAmount: 45000,
      currency: 'IQD',
      totalCapacity: 24,
      reservedSeats: 5,
      availableSeats: 19,
      includedServices: 'گواستنەوەی VIP، نانی بەیانی و نیوەڕۆ، ڕێبەری شاخەوانی',
      excludedServices: 'خەرجیی کەسی',
      requirements: 'پێڵاوی شاخەوانی و ناسنامەی فەرمی',
      coverImageUrl: '/images/choman.svg',
      guideId: guideA.id,
      vehicleId: vehicleA.id,
      preparationChecklist: {
        reservationsConfirmed: true,
        manifestReviewed: true,
        paymentsVerified: true,
        transportConfirmed: true,
        guideConfirmed: true,
        equipmentChecked: false,
        departureInfoSent: false,
        readyForDeparture: false,
      },
      operationalNotes: 'پێویستە ٣٠ خولەک پێش دەرچوون هەموو بەشداربووان لە پارکی شانەدەر ئامادە بن.',
      createdByUid: userRecord.uid,
    })
    .returning();

  await db.insert(tripPickupPoints).values({
    organizationId: orgA.id,
    tripId: tripIqd.id,
    nameKu: 'هەولێر — بەردەم پارکی شانەدەر',
    nameAr: 'أربيل — أمام بارك شاندر',
    nameEn: 'Erbil — Shanadar Park Main Gate',
    pickupTime: '06:30',
    sortOrder: 1,
  });

  const [tripUsd] = await db
    .insert(trips)
    .values({
      organizationId: orgA.id,
      code: 'RVN-IST-02',
      category: 'cultural',
      status: 'published',
      titleKu: 'گەشتی خێزانیی ئیستانبوڵ و بۆسفۆر (DEMO)',
      titleAr: 'رحلة إسطنبول والبوسفور العائلية (DEMO)',
      titleEn: 'Istanbul & Bosphorus Cultural Tour (DEMO)',
      descriptionKu: 'گەشتێکی ٤ ڕۆژە بە فڕۆکە و هۆتێلی ٤ ئەستێرە لە ناوەندی تەقسیم.',
      descriptionAr: 'رحلة ٤ أيام شاملة الطيران وفندق ٤ نجوم في تقسيم.',
      descriptionEn: '4-day cultural tour including flights, 4-star hotel, and Bosphorus cruise.',
      destination: 'Istanbul',
      departureLocation: 'Erbil International Airport (EBL)',
      departureAt: in14Days,
      returnAt: in18Days,
      priceAmount: 480,
      childPriceAmount: 350,
      currency: 'USD',
      totalCapacity: 20,
      reservedSeats: 2,
      availableSeats: 18,
      includedServices: 'تکتی فڕۆکە، هۆتێلی ٤ ئەستێرە، گواستنەوەی فڕۆکەخانە',
      excludedServices: 'ڤیزا و نانی ئێوارە',
      requirements: 'پاسپۆرتی کارا (لانیکەم ٦ مانگ)',
      coverImageUrl: '/images/istanbul.svg',
      guideId: guideA.id,
      createdByUid: userRecord.uid,
    })
    .returning();

  const [cust1] = await db
    .insert(customers)
    .values({
      organizationId: orgA.id,
      fullName: 'ئارام کامەران (Aram Kamaran)',
      phone: '+9647502223344',
      email: 'aram.demo@example.com',
      preferredLanguage: 'ku',
      notes: 'DEMO Customer — Regular family traveler',
      totalBookings: 1,
    })
    .returning();

  const [cust2] = await db
    .insert(customers)
    .values({
      organizationId: orgA.id,
      fullName: 'سارا جەلال (Sara Jalal)',
      phone: '+9647705556677',
      email: 'sara.demo@example.com',
      preferredLanguage: 'ku',
      notes: 'DEMO Customer — VIP group',
      totalBookings: 1,
    })
    .returning();

  const [booking1] = await db
    .insert(bookings)
    .values({
      organizationId: orgA.id,
      tripId: tripIqd.id,
      customerId: cust1.id,
      bookingCode: 'RVN-9K4M2P',
      status: 'approved',
      passengerCount: 5,
      unitPrice: 65000,
      totalAmount: 325000,
      paidAmount: 200000,
      currency: 'IQD',
      seatsReserved: true,
      pickupPointName: 'هەولێر — بەردەم پارکی شانەدەر',
      installmentDueDate: '2026-11-10',
      customerNotes: 'پێویستمان بە شوێنی پێشەوەی پاس هەیە',
      internalNotes: '١٢٥،٠٠٠ دیناری ماوە پێش بەڕێکەوتن',
      idempotencyKey: 'seed-demo-booking-1',
      createdByUid: userRecord.uid,
    })
    .returning();

  await db.insert(bookingPassengers).values([
    {
      organizationId: orgA.id,
      bookingId: booking1.id,
      tripId: tripIqd.id,
      fullName: 'ئارام کامەران',
      phone: '+9647502223344',
      ageGroup: 'adult',
      attendanceStatus: 'present',
    },
    {
      organizationId: orgA.id,
      bookingId: booking1.id,
      tripId: tripIqd.id,
      fullName: 'ژینۆ کامەران',
      phone: '+9647502223344',
      ageGroup: 'adult',
      attendanceStatus: 'present',
    },
  ]);

  await db.insert(bookingStatusHistory).values({
    organizationId: orgA.id,
    bookingId: booking1.id,
    fromStatus: 'pending',
    toStatus: 'approved',
    reason: 'Initial demo deposit received',
    changedByUid: userRecord.uid,
  });

  await db.insert(payments).values({
    organizationId: orgA.id,
    bookingId: booking1.id,
    tripId: tripIqd.id,
    customerId: cust1.id,
    entryType: 'payment',
    amount: 200000,
    currency: 'IQD',
    paymentMethod: 'cash',
    referenceCode: 'RCPT-IQD-1001',
    notes: 'پێشەکیی حجزکردنی گەشتی چۆمان',
    receivedByUid: userRecord.uid,
  });

  const [booking2] = await db
    .insert(bookings)
    .values({
      organizationId: orgA.id,
      tripId: tripUsd.id,
      customerId: cust2.id,
      bookingCode: 'RVN-7X8W3Q',
      status: 'approved',
      passengerCount: 2,
      unitPrice: 480,
      totalAmount: 960,
      paidAmount: 960,
      currency: 'USD',
      seatsReserved: true,
      pickupPointName: 'Erbil International Airport (EBL)',
      customerNotes: 'ژووری دەبڵ لە هۆتێل',
      internalNotes: 'بە تەواوی پارەکەی دراوە بە دۆلار',
      idempotencyKey: 'seed-demo-booking-2',
      createdByUid: userRecord.uid,
    })
    .returning();

  await db.insert(payments).values({
    organizationId: orgA.id,
    bookingId: booking2.id,
    tripId: tripUsd.id,
    customerId: cust2.id,
    entryType: 'payment',
    amount: 960,
    currency: 'USD',
    paymentMethod: 'fib_manual',
    referenceCode: 'FIB-USD-9004',
    notes: 'پارەدانی تەواو بۆ گەشتی ئیستانبوڵ',
    receivedByUid: userRecord.uid,
  });

  const [expCat] = await db
    .insert(expenseCategories)
    .values({
      organizationId: orgA.id,
      code: 'transport',
      nameKu: 'گواستنەوە و سووتەمەنی',
      nameAr: 'النقل والوقود',
      nameEn: 'Transport & Fuel',
    })
    .returning();

  await db.insert(expenses).values([
    {
      organizationId: orgA.id,
      tripId: tripIqd.id,
      categoryId: expCat.id,
      categoryName: 'گواستنەوە و سووتەمەنی',
      title: 'کرێی پاسی کۆستەر بۆ چۆمان (DEMO)',
      amount: 75000,
      currency: 'IQD',
      vendorName: 'کۆمپانیای گواستنەوەی هەولێر',
      referenceCode: 'EXP-IQD-01',
      recordedByUid: userRecord.uid,
    },
    {
      organizationId: orgA.id,
      tripId: tripUsd.id,
      categoryId: expCat.id,
      categoryName: 'هۆتێل و فڕۆکە',
      title: 'پێشەکیی حیجزی هۆتێلی ئیستانبوڵ (DEMO)',
      amount: 320,
      currency: 'USD',
      vendorName: 'Taksim Palace Hotel',
      referenceCode: 'EXP-USD-01',
      recordedByUid: userRecord.uid,
    },
  ]);

  await db.insert(notifications).values({
    organizationId: orgA.id,
    recipientUid: 'all',
    type: 'booking_created',
    titleKu: 'حجزکردنی نوێ تۆمار کرا (RVN-9K4M2P)',
    titleAr: 'تم تسجيل حجز جديد (RVN-9K4M2P)',
    titleEn: 'New Booking Created (RVN-9K4M2P)',
    bodyKu: 'ئارام کامەران ٥ کورسی بۆ گەشتی چۆمان حیجز کرد.',
    bodyAr: 'قام آرام كامران بحجز ٥ مقاعد لرحلة جومان.',
    bodyEn: 'Aram Kamaran booked 5 seats for Choman Expedition.',
    entityType: 'booking',
    entityId: booking1.id,
  });

  // 2. Create Tenant B: Zagros Horizon Tours
  const [orgB] = await db
    .insert(organizations)
    .values({
      slug: 'zagros-horizon-tours',
      name: 'Zagros Horizon Tours (DEMO TENANT B)',
      legalName: 'Zagros Horizon Tourism Co.',
      contactEmail: 'info@zagros-demo.local',
      contactPhone: '+9647709998877',
      country: 'Iraq / Kurdistan Region',
      city: 'Sulaymaniyah',
      defaultLanguage: 'ku',
      supportedLanguages: 'ku,ar,en',
      timezone: 'Asia/Baghdad',
      defaultCurrency: 'IQD',
      status: 'trialing',
      isDemo: true,
      createdByUid: userRecord.uid,
    })
    .returning();

  await db.insert(organizationSettings).values({
    organizationId: orgB.id,
    primaryColor: '#547DA8',
    accentColor: '#C8A76A',
    seatReserveMode: 'on_approved',
    bookingAutoApprove: false,
    publicPageEnabled: true,
  });

  await db.insert(subscriptions).values({
    organizationId: orgB.id,
    planId: businessPlan.id,
    planCode: businessPlan.code,
    status: 'trialing',
    billingCycle: 'monthly',
    startDate: now,
    endDate: in30Days,
    renewalDate: in30Days,
    manualVerificationNote: '14-Day Trial Period (Tenant B)',
    verifiedByUid: userRecord.uid,
  });

  await db.insert(memberships).values({
    organizationId: orgB.id,
    userId: userRecord.id,
    userUid: userRecord.uid,
    role: 'company_owner',
    status: 'active',
  });

  await db.insert(trips).values({
    organizationId: orgB.id,
    code: 'ZGR-DUK-01',
    category: 'nature',
    status: 'published',
    titleKu: 'گەشتی دەریاچەی دوکان و سلێمانی (Tenant B DEMO)',
    titleAr: 'رحلة بحيرة دوكان والسليمانية (Tenant B DEMO)',
    titleEn: 'Dukan Lake & Sulaymaniyah Tour (Tenant B DEMO)',
    descriptionKu:
      'گەشتی تایبەت بە کۆمپانیای دووەم بۆ تاقیکردنەوەی جیاکردنەوەی داتا (Tenant Isolation).',
    descriptionAr: 'رحلة خاصة بالشركة الثانية لاختبار عزل البيانات.',
    descriptionEn: 'Isolated trip belonging strictly to Tenant B for multi-tenancy verification.',
    destination: 'Dukan Lake',
    departureLocation: 'Sulaymaniyah',
    departureAt: in7Days,
    returnAt: in9Days,
    priceAmount: 45000,
    currency: 'IQD',
    totalCapacity: 30,
    reservedSeats: 0,
    availableSeats: 30,
    coverImageUrl: '/images/dukan.svg',
    createdByUid: userRecord.uid,
  });

  await db.insert(activityLogs).values({
    organizationId: orgA.id,
    actorUid: userRecord.uid,
    actorEmail: userRecord.email,
    action: 'demo.seed_completed',
    entityType: 'organization',
    entityId: String(orgA.id),
    details: 'Initialized isolated demo tenants RAVAN Demo Travel and Zagros Horizon Tours.',
  });

  return orgA;
}
