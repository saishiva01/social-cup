import { z } from 'zod';

import { neighborhoodSchema } from './auth.js';
import { latitudeSchema, longitudeSchema } from './cafes.js';
import { paginationQuerySchema, uuidSchema } from './common.js';
import { pinSchema } from './redemptions.js';

/**
 * Phase 6 admin & payout operations (PRD Module 9). Every schema here backs
 * a route gated by `requireAdmin` — see apps/api/src/middleware/requireAdmin.ts.
 * Money is always an integer number of cents, never a float or a string.
 */

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in 24-hour HH:MM format');

const dayHoursSchema = z
  .object({ open: timeOfDaySchema, close: timeOfDaySchema })
  .refine((value) => value.open < value.close, {
    message: 'Opening time must be before closing time',
  })
  .nullable();

/** Keyed by lowercase three-letter weekday; a missing/null day is closed — matches @social-cup/types' WeeklyHours. */
export const weeklyHoursSchema = z
  .object({
    mon: dayHoursSchema.optional(),
    tue: dayHoursSchema.optional(),
    wed: dayHoursSchema.optional(),
    thu: dayHoursSchema.optional(),
    fri: dayHoursSchema.optional(),
    sat: dayHoursSchema.optional(),
    sun: dayHoursSchema.optional(),
  })
  .strict();

const photoUrlSchema = z.string().trim().url().max(2048);
const vibeTagSchema = z.string().trim().min(1).max(40);
const cafeNameSchema = z.string().trim().min(1).max(120);
const perkLineSchema = z.string().trim().max(200).nullable();
const addressSchema = z.string().trim().min(1).max(300);

/** body of POST /admin/cafes */
export const adminCafeCreateSchema = z.object({
  name: cafeNameSchema,
  perkLine: perkLineSchema.optional(),
  neighborhood: neighborhoodSchema,
  address: addressSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  photos: z.array(photoUrlSchema).max(10).optional(),
  vibeTags: z.array(vibeTagSchema).max(10).optional(),
  hours: weeklyHoursSchema.optional(),
  featured: z.boolean().optional(),
});

export type AdminCafeCreateInput = z.infer<typeof adminCafeCreateSchema>;

/** body of PATCH /admin/cafes/:id — every field optional, at least one required. */
export const adminCafeUpdateSchema = z
  .object({
    name: cafeNameSchema.optional(),
    perkLine: perkLineSchema.optional(),
    neighborhood: neighborhoodSchema.optional(),
    address: addressSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    photos: z.array(photoUrlSchema).max(10).optional(),
    vibeTags: z.array(vibeTagSchema).max(10).optional(),
    hours: weeklyHoursSchema.optional(),
    featured: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type AdminCafeUpdateInput = z.infer<typeof adminCafeUpdateSchema>;

/** body of PATCH /admin/cafes/:id/payout-rate (PRD Module 7.5/9) — unrelated to ADR-0009's fixed $1/credit member-facing value. */
export const adminSetPayoutRateSchema = z.object({
  payoutRateCents: z.number().int().positive(),
});

export type AdminSetPayoutRateInput = z.infer<typeof adminSetPayoutRateSchema>;

/** body of PUT /admin/cafes/:id/barista-pin */
export const adminSetPinSchema = z.object({
  pin: pinSchema,
});

export type AdminSetPinInput = z.infer<typeof adminSetPinSchema>;

const drinkNameSchema = z.string().trim().min(1).max(120);
const drinkDescriptionSchema = z.string().trim().max(500).nullable();
const drinkCategorySchema = z.string().trim().max(60).nullable();
const drinkPhotoUrlSchema = z.string().trim().url().max(2048).nullable();
/** Integer cents — ADR-0009's fixed $1/credit is a display fact, never enforced as retailPriceCents === creditPrice * 100. */
const retailPriceCentsSchema = z.number().int().positive();
/** Integer number of credits (not cents) — matches drinks.creditPrice's existing representation. */
const creditPriceSchema = z.number().int().positive();

/** body of POST /admin/cafes/:cafeId/drinks */
export const adminDrinkCreateSchema = z.object({
  name: drinkNameSchema,
  description: drinkDescriptionSchema.optional(),
  category: drinkCategorySchema.optional(),
  photoUrl: drinkPhotoUrlSchema.optional(),
  retailPriceCents: retailPriceCentsSchema,
  creditPrice: creditPriceSchema,
  signature: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type AdminDrinkCreateInput = z.infer<typeof adminDrinkCreateSchema>;

/** body of PATCH /admin/drinks/:id — every field optional, at least one required. */
export const adminDrinkUpdateSchema = z
  .object({
    name: drinkNameSchema.optional(),
    description: drinkDescriptionSchema.optional(),
    category: drinkCategorySchema.optional(),
    photoUrl: drinkPhotoUrlSchema.optional(),
    retailPriceCents: retailPriceCentsSchema.optional(),
    creditPrice: creditPriceSchema.optional(),
    signature: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type AdminDrinkUpdateInput = z.infer<typeof adminDrinkUpdateSchema>;

/** GET /admin/cafes */
export const adminCafeListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
});

export type AdminCafeListQuery = z.infer<typeof adminCafeListQuerySchema>;

/** GET /admin/members */
export const adminMemberListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['visitor', 'incomplete', 'active', 'past_due', 'canceled']).optional(),
});

export type AdminMemberListQuery = z.infer<typeof adminMemberListQuerySchema>;

/** GET /admin/redemptions */
export const adminRedemptionListQuerySchema = paginationQuerySchema.extend({
  cafeId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  // z.coerce.boolean() would treat the string "false" as truthy — an explicit
  // enum-then-transform (same pattern as apps/api/src/env.ts) is required
  // for a query-string boolean.
  voided: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type AdminRedemptionListQuery = z.infer<typeof adminRedemptionListQuerySchema>;

/** body of POST /admin/redemptions/:id/void — PRD 9.7: every void is recorded with who performed it and the reason given. */
export const adminVoidRedemptionSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type AdminVoidRedemptionInput = z.infer<typeof adminVoidRedemptionSchema>;

/** Shared by the payout summary/statement/CSV query params — a half-open [periodStart, periodEnd) window. */
export const payoutPeriodQuerySchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((value) => value.periodEnd > value.periodStart, {
    message: 'periodEnd must be after periodStart',
    path: ['periodEnd'],
  });

export type PayoutPeriodQuery = z.infer<typeof payoutPeriodQuerySchema>;

/** body of POST /admin/payouts/:cafeId/payments */
export const adminRecordPaymentSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    amountCents: z.number().int().positive(),
    reference: z.string().trim().max(200).nullable().optional(),
  })
  .refine((value) => value.periodEnd > value.periodStart, {
    message: 'periodEnd must be after periodStart',
    path: ['periodEnd'],
  });

export type AdminRecordPaymentInput = z.infer<typeof adminRecordPaymentSchema>;

/** GET /admin/address-lookup?query= (PRD Module 9 address autofill — mock provider only, see docs/architecture/address-lookup.md) */
export const addressLookupQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export type AddressLookupQuery = z.infer<typeof addressLookupQuerySchema>;
