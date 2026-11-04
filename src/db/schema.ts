import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Authenticated Users (Global identity linked via Firebase UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  preferredLocale: text('preferred_locale').notNull().default('ku'),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 2. Organizations (Tenants)
export const organizations = pgTable(
  'organizations',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    legalName: text('legal_name').notNull().default(''),
    logoUrl: text('logo_url').notNull().default(''),
    contactEmail: text('contact_email').notNull().default(''),
    contactPhone: text('contact_phone').notNull().default(''),
    country: text('country').notNull().default('Iraq / Kurdistan Region'),
    city: text('city').notNull().default('Erbil'),
    socialLinks: text('social_links').notNull().default(''),
    defaultLanguage: text('default_language').notNull().default('ku'),
    supportedLanguages: text('supported_languages').notNull().default('ku,ar,en'),
    timezone: text('timezone').notNull().default('Asia/Baghdad'),
    defaultCurrency: text('default_currency').notNull().default('IQD'),
    status: text('status').notNull().default('trialing'), // 'trialing' | 'active' | 'suspended' | 'archived'
    isDemo: boolean('is_demo').notNull().default(false),
    referralCodeUsed: text('referral_code_used').notNull().default(''),
    createdByUid: text('created_by_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('organizations_slug_idx').on(table.slug)]
);

// 3. Organization Settings (1:1 per tenant)
export const organizationSettings = pgTable(
  'organization_settings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    primaryColor: text('primary_color').notNull().default('#547DA8'),
    accentColor: text('accent_color').notNull().default('#C8A76A'),
    cancellationPolicyText: text('cancellation_policy_text')
      .notNull()
      .default('Standard 48-hour prior notice required for cancellation evaluation.'),
    bookingAutoApprove: boolean('booking_auto_approve').notNull().default(false),
    seatReserveMode: text('seat_reserve_mode').notNull().default('on_pending'), // 'on_pending' | 'on_approved'
    notifyOnNewBooking: boolean('notify_on_new_booking').notNull().default(true),
    notifyOnPayment: boolean('notify_on_payment').notNull().default(true),
    publicPageEnabled: boolean('public_page_enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('org_settings_org_idx').on(table.organizationId)]
);

// 4. Memberships (Links Users to Organizations with Role + Custom Permissions)
export const memberships = pgTable(
  'memberships',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userUid: text('user_uid').notNull(),
    role: text('role').notNull().default('booking_agent'), // 'platform_super_admin' | 'company_owner' | 'company_manager' | 'booking_agent' | 'accountant' | 'tour_guide' | 'customer'
    customPermissions: jsonb('custom_permissions').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('active'), // 'active' | 'invited' | 'deactivated'
    invitedByUid: text('invited_by_uid').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('memberships_org_user_uid_idx').on(table.organizationId, table.userUid),
    index('memberships_user_uid_idx').on(table.userUid),
  ]
);

// 5. Invites (Pending team member invitations)
export const invites = pgTable(
  'invites',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().default('booking_agent'),
    customPermissions: jsonb('custom_permissions').$type<string[]>().notNull().default([]),
    token: text('token').notNull().unique(),
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'revoked' | 'expired'
    invitedByUid: text('invited_by_uid').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invites_org_idx').on(table.organizationId)]
);

// 6. Subscription Plans (Platform SaaS Catalog - Editable by Super Admin)
export const subscriptionPlans = pgTable('subscription_plans', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // 'starter' | 'professional' | 'business' | 'enterprise'
  nameKu: text('name_ku').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  descriptionKu: text('description_ku').notNull().default(''),
  proposedMonthlyIqd: integer('proposed_monthly_iqd').notNull().default(25000),
  proposedAnnualIqd: integer('proposed_annual_iqd').notNull().default(250000),
  proposedMonthlyUsd: integer('proposed_monthly_usd').notNull().default(20),
  proposedAnnualUsd: integer('proposed_annual_usd').notNull().default(200),
  trialDays: integer('trial_days').notNull().default(14),
  maxMembers: integer('max_members').notNull().default(5),
  maxActiveTrips: integer('max_active_trips').notNull().default(15),
  maxMonthlyBookings: integer('max_monthly_bookings').notNull().default(200),
  supportLevel: text('support_level').notNull().default('Standard Support'),
  isProposalOnly: boolean('is_proposal_only').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 7. Organization Subscriptions
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: integer('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    planCode: text('plan_code').notNull().default('professional'),
    status: text('status').notNull().default('trialing'), // 'trialing' | 'pending_payment' | 'active' | 'expiring_soon' | 'expired' | 'suspended' | 'cancelled'
    billingCycle: text('billing_cycle').notNull().default('monthly'), // 'monthly' | 'annual'
    startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    renewalDate: timestamp('renewal_date', { withTimezone: true }).notNull(),
    manualVerificationNote: text('manual_verification_note').notNull().default(''),
    verifiedByUid: text('verified_by_uid').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('subscriptions_org_idx').on(table.organizationId)]
);

// 8. Tour Guides (Tenant-scoped)
export const guides = pgTable(
  'guides',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userUid: text('user_uid').notNull().default(''),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    languages: text('languages').notNull().default('ku,ar,en'),
    specialty: text('specialty').notNull().default('Mountain & Cultural Tours'),
    notes: text('notes').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('guides_org_idx').on(table.organizationId)]
);

// 9. Vehicles (Tenant-scoped Fleet Registry)
export const vehicles = pgTable(
  'vehicles',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    vehicleType: text('vehicle_type').notNull().default('Coaster Bus'),
    plateNumber: text('plate_number').notNull(),
    capacity: integer('capacity').notNull().default(25),
    driverName: text('driver_name').notNull().default(''),
    driverPhone: text('driver_phone').notNull().default(''),
    status: text('status').notNull().default('available'), // 'available' | 'assigned' | 'maintenance'
    maintenanceNotes: text('maintenance_notes').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('vehicles_org_idx').on(table.organizationId)]
);

export interface TripPrepChecklist {
  reservationsConfirmed?: boolean;
  manifestReviewed?: boolean;
  paymentsVerified?: boolean;
  transportConfirmed?: boolean;
  guideConfirmed?: boolean;
  equipmentChecked?: boolean;
  departureInfoSent?: boolean;
  readyForDeparture?: boolean;
}

// 10. Trips (Multilingual, Capacity-Controlled Tenant Catalog + Execution State)
export const trips = pgTable(
  'trips',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    category: text('category').notNull().default('nature'), // 'nature' | 'mountain' | 'camping' | 'cultural' | 'historical' | 'city' | 'vip' | 'family'
    status: text('status').notNull().default('draft'), // 'draft' | 'published' | 'full' | 'cancelled' | 'completed' | 'archived'
    titleKu: text('title_ku').notNull(),
    titleAr: text('title_ar').notNull().default(''),
    titleEn: text('title_en').notNull().default(''),
    descriptionKu: text('description_ku').notNull().default(''),
    descriptionAr: text('description_ar').notNull().default(''),
    descriptionEn: text('description_en').notNull().default(''),
    destination: text('destination').notNull(),
    departureLocation: text('departure_location').notNull().default('Erbil'),
    departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
    returnAt: timestamp('return_at', { withTimezone: true }).notNull(),
    priceAmount: integer('price_amount').notNull(), // Adult price in integer units (IQD or USD)
    childPriceAmount: integer('child_price_amount').notNull().default(0),
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    totalCapacity: integer('total_capacity').notNull(),
    reservedSeats: integer('reserved_seats').notNull().default(0),
    availableSeats: integer('available_seats').notNull(),
    includedServices: text('included_services').notNull().default(''),
    excludedServices: text('excluded_services').notNull().default(''),
    requirements: text('requirements').notNull().default(''),
    coverImageUrl: text('cover_image_url').notNull().default(''),
    guideId: integer('guide_id').references(() => guides.id, { onDelete: 'set null' }),
    vehicleId: integer('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
    preparationChecklist: jsonb('preparation_checklist')
      .$type<TripPrepChecklist>()
      .notNull()
      .default({}),
    operationalNotes: text('operational_notes').notNull().default(''),
    createdByUid: text('created_by_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('trips_org_status_idx').on(table.organizationId, table.status),
    uniqueIndex('trips_org_code_idx').on(table.organizationId, table.code),
  ]
);

// 11. Trip Pickup Points
export const tripPickupPoints = pgTable(
  'trip_pickup_points',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    nameKu: text('name_ku').notNull(),
    nameAr: text('name_ar').notNull().default(''),
    nameEn: text('name_en').notNull().default(''),
    pickupTime: text('pickup_time').notNull().default('07:00'),
    notes: text('notes').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(1),
  },
  (table) => [index('pickup_points_trip_idx').on(table.organizationId, table.tripId)]
);

// 12. Customers (Tenant CRM)
export const customers = pgTable(
  'customers',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull().default(''),
    preferredLanguage: text('preferred_language').notNull().default('ku'),
    notes: text('notes').notNull().default(''),
    totalBookings: integer('total_bookings').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('customers_org_phone_idx').on(table.organizationId, table.phone),
    index('customers_org_name_idx').on(table.organizationId, table.fullName),
  ]
);

// 13. Bookings (Tenant Reservations with Concurrency-Safe Seat Tracking)
export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    bookingCode: text('booking_code').notNull().unique(),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'no_show'
    passengerCount: integer('passenger_count').notNull(),
    unitPrice: integer('unit_price').notNull(),
    totalAmount: integer('total_amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    seatsReserved: boolean('seats_reserved').notNull().default(true),
    pickupPointName: text('pickup_point_name').notNull().default(''),
    installmentDueDate: text('installment_due_date').notNull().default(''),
    customerNotes: text('customer_notes').notNull().default(''),
    internalNotes: text('internal_notes').notNull().default(''),
    idempotencyKey: text('idempotency_key').notNull(),
    createdByUid: text('created_by_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bookings_org_trip_idx').on(table.organizationId, table.tripId),
    index('bookings_org_customer_idx').on(table.organizationId, table.customerId),
    uniqueIndex('bookings_org_idemp_idx').on(table.organizationId, table.idempotencyKey),
  ]
);

// 14. Booking Passengers (Separated Manifest Records + Live Attendance Tracking)
export const bookingPassengers = pgTable(
  'booking_passengers',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull().default(''),
    ageGroup: text('age_group').notNull().default('adult'), // 'adult' | 'child' | 'infant'
    specialRequirements: text('special_requirements').notNull().default(''),
    attendanceStatus: text('attendance_status').notNull().default('pending'), // 'pending' | 'present' | 'no_show'
    attendanceNotes: text('attendance_notes').notNull().default(''),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('passengers_org_trip_idx').on(table.organizationId, table.tripId)]
);

// 15. Booking Status History (Audit Trail)
export const bookingStatusHistory = pgTable(
  'booking_status_history',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    reason: text('reason').notNull().default(''),
    changedByUid: text('changed_by_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('booking_history_booking_idx').on(table.organizationId, table.bookingId)]
);

// 16. Payments, Refunds & Adjustments (Immutable Append-Only Financial Ledger)
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'restrict' }),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    entryType: text('entry_type').notNull().default('payment'), // 'payment' | 'refund' | 'adjustment'
    amount: integer('amount').notNull(), // Positive integer amount
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    paymentMethod: text('payment_method').notNull().default('cash'), // 'cash' | 'bank_transfer' | 'fib_manual' | 'fastpay_manual' | 'other'
    referenceCode: text('reference_code').notNull().default(''),
    notes: text('notes').notNull().default(''),
    receivedByUid: text('received_by_uid').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payments_org_booking_idx').on(table.organizationId, table.bookingId),
    index('payments_org_currency_idx').on(table.organizationId, table.currency),
  ]
);

// 17. Expense Categories
export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    nameKu: text('name_ku').notNull(),
    nameAr: text('name_ar').notNull().default(''),
    nameEn: text('name_en').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('expense_categories_org_idx').on(table.organizationId)]
);

// 18. Expenses (Trip-linked or General Operational Expenses)
export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tripId: integer('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    categoryId: integer('category_id').references(() => expenseCategories.id, {
      onDelete: 'set null',
    }),
    categoryName: text('category_name').notNull().default('Transport & Fuel'),
    title: text('title').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    vendorName: text('vendor_name').notNull().default(''),
    referenceCode: text('reference_code').notNull().default(''),
    notes: text('notes').notNull().default(''),
    expenseDate: timestamp('expense_date', { withTimezone: true }).notNull().defaultNow(),
    recordedByUid: text('recorded_by_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('expenses_org_trip_idx').on(table.organizationId, table.tripId)]
);

// 19. In-App Notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipientUid: text('recipient_uid').notNull().default('all'),
    type: text('type').notNull(), // 'booking_created' | 'booking_status' | 'payment_received' | 'trip_status' | 'subscription_alert' | 'support_reply'
    titleKu: text('title_ku').notNull(),
    titleAr: text('title_ar').notNull().default(''),
    titleEn: text('title_en').notNull().default(''),
    bodyKu: text('body_ku').notNull(),
    bodyAr: text('body_ar').notNull().default(''),
    bodyEn: text('body_en').notNull().default(''),
    isRead: boolean('is_read').notNull().default(false),
    entityType: text('entity_type').notNull().default('booking'),
    entityId: integer('entity_id').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_org_read_idx').on(table.organizationId, table.isRead)]
);

// 20. Activity & Audit Logs
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    actorUid: text('actor_uid').notNull(),
    actorEmail: text('actor_email').notNull().default(''),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull().default(''),
    details: text('details').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('activity_logs_org_idx').on(table.organizationId)]
);

// 21. Idempotency Keys
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    endpoint: text('endpoint').notNull(),
    responseCode: integer('response_code').notNull().default(200),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idemp_org_key_idx').on(table.organizationId, table.key)]
);

// ============================================================================
// COMMERCIAL SAAS PLATFORM TABLES (Subscriptions, Invoices, CRM, Coupons, Support)
// ============================================================================

// 22. Platform Manual Payment Methods (Configured by Super Admin)
export const platformPaymentMethods = pgTable('platform_payment_methods', {
  id: serial('id').primaryKey(),
  methodName: text('method_name').notNull(), // e.g. 'Bank Transfer (RT Bank / Cihan)' | 'Cash Office Delivery'
  accountHolder: text('account_holder').notNull().default('RAVAN Platform Administration'),
  accountDetails: text('account_details').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  supportedCurrency: text('supported_currency').notNull().default('IQD'), // 'IQD' | 'USD'
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// 23. Subscription Invoices (Section 21 — Issued per renewal/upgrade request)
export const subscriptionInvoices = pgTable(
  'subscription_invoices',
  {
    id: serial('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    billingCycle: text('billing_cycle').notNull().default('monthly'), // 'monthly' | 'annual'
    originalAmount: integer('original_amount').notNull(),
    discountAmount: integer('discount_amount').notNull().default(0),
    finalAmount: integer('final_amount').notNull(),
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    couponCode: text('coupon_code').notNull().default(''),
    paymentMethod: text('payment_method').notNull().default('manual_bank_transfer'),
    status: text('status').notNull().default('unpaid'), // 'unpaid' | 'pending_verification' | 'paid' | 'cancelled' | 'refunded'
    issueDate: timestamp('issue_date', { withTimezone: true }).notNull().defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sub_invoices_org_idx').on(table.organizationId)]
);

// 24. Subscription Payments (Section 20 — Manual Payment Review & Single-Extension Guard)
export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => subscriptionInvoices.id, { onDelete: 'cascade' }),
    planCode: text('plan_code').notNull(),
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    paymentMethod: text('payment_method').notNull().default('manual_bank_transfer'),
    transactionReference: text('transaction_reference').notNull(),
    receiptNotes: text('receipt_notes').notNull().default(''),
    status: text('status').notNull().default('pending_verification'), // 'pending_verification' | 'approved' | 'rejected'
    extensionApplied: boolean('extension_applied').notNull().default(false), // Prevents duplicate subscription extension!
    submittedByUid: text('submitted_by_uid').notNull(),
    reviewedByUid: text('reviewed_by_uid').notNull().default(''),
    reviewNotes: text('review_notes').notNull().default(''),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sub_payments_org_idx').on(table.organizationId)]
);

// 25. Sales CRM Leads (Section 18 — Super Admin Lead & Demo Pipeline)
export const salesLeads = pgTable('sales_leads', {
  id: serial('id').primaryKey(),
  contactName: text('contact_name').notNull(),
  companyName: text('company_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull().default(''),
  city: text('city').notNull().default('Erbil'),
  country: text('country').notNull().default('Iraq / Kurdistan Region'),
  businessSize: text('business_size').notNull().default('5-15 staff'),
  leadSource: text('lead_source').notNull().default('Website Demo Request'),
  interestedPlan: text('interested_plan').notNull().default('professional'),
  status: text('status').notNull().default('new'), // 'new' | 'contacted' | 'interested' | 'demo_scheduled' | 'trial_started' | 'negotiation' | 'converted' | 'lost'
  estimatedDealValue: integer('estimated_deal_value').notNull().default(50000),
  currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
  notes: text('notes').notNull().default(''),
  nextFollowUpDate: text('next_follow_up_date').notNull().default(''),
  convertedOrgId: integer('converted_org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// 26. Coupons & Promotional Discounts (Section 23)
export const coupons = pgTable(
  'coupons',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    discountType: text('discount_type').notNull().default('percentage'), // 'percentage' | 'fixed'
    discountValue: integer('discount_value').notNull(),
    currency: text('currency').notNull().default('IQD'), // 'IQD' | 'USD'
    maxUses: integer('max_uses').notNull().default(50),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('coupons_code_idx').on(table.code)]
);

// 27. Customer Support Tickets (Section 26 — Tenant-Isolated Helpdesk)
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUid: text('created_by_uid').notNull(),
    createdByEmail: text('created_by_email').notNull().default(''),
    subject: text('subject').notNull(),
    category: text('category').notNull().default('billing'), // 'billing' | 'technical' | 'operations' | 'feature_request'
    description: text('description').notNull(),
    priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high' | 'urgent'
    status: text('status').notNull().default('open'), // 'open' | 'in_progress' | 'waiting_for_customer' | 'resolved' | 'closed'
    adminResponse: text('admin_response').notNull().default(''),
    respondedByUid: text('responded_by_uid').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('support_tickets_org_idx').on(table.organizationId)]
);

// Drizzle Relations
export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  settings: one(organizationSettings, {
    fields: [organizations.id],
    references: [organizationSettings.organizationId],
  }),
  subscription: one(subscriptions, {
    fields: [organizations.id],
    references: [subscriptions.organizationId],
  }),
  memberships: many(memberships),
  trips: many(trips),
  customers: many(customers),
  bookings: many(bookings),
  payments: many(payments),
  expenses: many(expenses),
  invoices: many(subscriptionInvoices),
  supportTickets: many(supportTickets),
}));
