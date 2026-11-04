import { z } from 'zod';

/**
 * Normalizes Iraqi/Kurdistan & international phone numbers to E.164 format (+964...).
 */
export function normalizePhoneNumber(rawPhone: string): string {
  const digitsAndPlus = rawPhone.trim().replace(/[\s\-().]/g, '');
  if (!digitsAndPlus) return '';

  if (digitsAndPlus.startsWith('00')) {
    return '+' + digitsAndPlus.slice(2);
  }
  if (digitsAndPlus.startsWith('07') && digitsAndPlus.length === 11) {
    return '+964' + digitsAndPlus.slice(1);
  }
  if (digitsAndPlus.startsWith('7') && digitsAndPlus.length === 10) {
    return '+964' + digitsAndPlus;
  }
  if (digitsAndPlus.startsWith('964') && !digitsAndPlus.startsWith('+')) {
    return '+' + digitsAndPlus;
  }
  if (!digitsAndPlus.startsWith('+')) {
    return '+' + digitsAndPlus;
  }
  return digitsAndPlus;
}

export function isValidInternationalPhone(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

export function generateBookingCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `RVN-${suffix}`;
}

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  legalName: z.string().max(240).optional().default(''),
  logoUrl: z.string().max(2_000_000).optional().default(''),
  contactEmail: z.string().email().optional().or(z.literal('')).default(''),
  contactPhone: z.string().min(7).max(25),
  defaultLanguage: z.enum(['ku', 'ar', 'en']).default('ku'),
  defaultCurrency: z.enum(['IQD', 'USD']).default('IQD'),
  timezone: z.string().default('Asia/Baghdad'),
});

export const createTripSchema = z.object({
  code: z.string().min(2).max(32),
  titleKu: z.string().min(2).max(160),
  titleAr: z.string().max(160).optional().default(''),
  titleEn: z.string().max(160).optional().default(''),
  descriptionKu: z.string().max(2000).optional().default(''),
  descriptionAr: z.string().max(2000).optional().default(''),
  descriptionEn: z.string().max(2000).optional().default(''),
  destination: z.string().min(2).max(120),
  departureLocation: z.string().min(2).max(120).default('Erbil'),
  departureAt: z.string().min(10),
  returnAt: z.string().min(10),
  priceAmount: z.number().int().nonnegative(),
  currency: z.enum(['IQD', 'USD']),
  totalCapacity: z.number().int().min(1).max(1000),
  includedServices: z.string().max(1000).optional().default(''),
  excludedServices: z.string().max(1000).optional().default(''),
  requirements: z.string().max(1000).optional().default(''),
  coverImageUrl: z.string().max(2_000_000).optional().default('/images/choman.svg'),
  status: z.enum(['draft', 'published', 'full', 'cancelled', 'completed', 'archived']).default('draft'),
  guideId: z.number().int().nullable().optional(),
  vehicleId: z.number().int().nullable().optional(),
  pickupPointName: z.string().max(160).optional().default(''),
  pickupTime: z.string().max(20).optional().default('07:00'),
});

export const createCustomerSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().min(7).max(25),
  email: z.string().email().optional().or(z.literal('')).default(''),
  preferredLanguage: z.enum(['ku', 'ar', 'en']).default('ku'),
  notes: z.string().max(1000).optional().default(''),
});

export const passengerInputSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: z.string().max(25).optional().default(''),
  ageGroup: z.enum(['adult', 'child', 'infant']).default('adult'),
  specialRequirements: z.string().max(300).optional().default(''),
});

export const createBookingSchema = z.object({
  tripId: z.number().int().positive(),
  customerId: z.number().int().positive().optional(),
  customerName: z.string().min(2).max(120).optional(),
  customerPhone: z.string().min(7).max(25).optional(),
  customerEmail: z.string().email().optional().or(z.literal('')).default(''),
  passengerCount: z.number().int().min(1).max(100),
  pickupPointName: z.string().max(160).optional().default(''),
  customerNotes: z.string().max(1000).optional().default(''),
  internalNotes: z.string().max(1000).optional().default(''),
  idempotencyKey: z.string().min(6).max(120),
  passengers: z.array(passengerInputSchema).optional().default([]),
});

export const createPaymentSchema = z.object({
  bookingId: z.number().int().positive(),
  entryType: z.enum(['payment', 'refund', 'adjustment']).default('payment'),
  amount: z.number().int().positive(),
  currency: z.enum(['IQD', 'USD']),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'fib_manual', 'fastpay_manual', 'other']).default('cash'),
  referenceCode: z.string().max(80).optional().default(''),
  notes: z.string().max(500).optional().default(''),
});

export const createExpenseSchema = z.object({
  tripId: z.number().int().positive().nullable().optional(),
  categoryName: z.string().min(2).max(80).default('Transport & Fuel'),
  title: z.string().min(2).max(160),
  amount: z.number().int().positive(),
  currency: z.enum(['IQD', 'USD']),
  vendorName: z.string().max(120).optional().default(''),
  referenceCode: z.string().max(80).optional().default(''),
  notes: z.string().max(500).optional().default(''),
});

/**
 * Safe Dry-Run Import Validator (Rule 4):
 * Validates external JSON records without writing or mutating any database state.
 */
export interface DryRunImportRow {
  customerName?: string;
  phone?: string;
  tripCode?: string;
  amount?: number;
  currency?: string;
}

export function validateDryRunImport(rows: DryRunImportRow[]): {
  validCount: number;
  invalidCount: number;
  issues: string[];
} {
  let validCount = 0;
  let invalidCount = 0;
  const issues: string[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 1;
    const rowErrors: string[] = [];

    if (!row.customerName || row.customerName.trim().length < 2) {
      rowErrors.push(`Row ${rowNum}: Missing or invalid customerName`);
    }
    if (!row.phone || !isValidInternationalPhone(row.phone)) {
      rowErrors.push(`Row ${rowNum}: Invalid phone format (${row.phone || 'empty'})`);
    }
    if (row.currency && row.currency !== 'IQD' && row.currency !== 'USD') {
      rowErrors.push(`Row ${rowNum}: Unsupported currency '${row.currency}' (must be IQD or USD)`);
    }
    if (typeof row.amount === 'number' && (!Number.isInteger(row.amount) || row.amount < 0)) {
      rowErrors.push(`Row ${rowNum}: Amount must be a non-negative integer`);
    }

    if (rowErrors.length > 0) {
      invalidCount++;
      issues.push(...rowErrors);
    } else {
      validCount++;
    }
  });

  return { validCount, invalidCount, issues };
}
