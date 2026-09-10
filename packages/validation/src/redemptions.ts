import { z } from 'zod';

import { uuidSchema } from './common.js';

/** body of POST /api/v1/redemptions */
export const createRedemptionSchema = z.object({
  cafeId: uuidSchema,
  drinkId: uuidSchema,
});

export type CreateRedemptionInput = z.infer<typeof createRedemptionSchema>;

/**
 * body of POST /api/v1/barista/redeem. Accepts either the primary code or
 * the six-digit backup code as free text — formatting (dashes, spacing,
 * case) is normalized server-side (apps/api/src/lib/tokens.ts), not here,
 * so this only rejects empty/absurdly long input.
 */
export const redeemCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
});

export type RedeemCodeInput = z.infer<typeof redeemCodeSchema>;

/**
 * A cafe PIN. The PRD specifies a "cafe PIN" without a format — 4-8 digits is
 * an interim, documented assumption (see docs/decisions/open-questions.md),
 * matching typical PIN UX and the development seed data. Shared between the
 * barista authentication schema below and the Phase 6 admin
 * set/reset-PIN schema (`packages/validation/src/admin.ts`) so both enforce
 * the exact same shape.
 */
export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'PIN must be 4-8 digits');

/** body of POST /api/v1/barista/authenticate. */
export const baristaAuthSchema = z.object({
  cafeId: uuidSchema,
  pin: pinSchema,
});

export type BaristaAuthInput = z.infer<typeof baristaAuthSchema>;
