import { z } from 'zod';

import { emailSchema } from './common.js';

/**
 * Password rules are deliberately light (minimum length only — PRD Module 2
 * specifies no complexity requirements, and artificial rules are hostile to
 * users for no measurable security gain). The 72-byte cap is bcrypt's input
 * limit — hashPassword in apps/api/src/lib/password.ts would silently
 * truncate a longer password otherwise.
 */
export const passwordSchema = z.string().min(8).max(72);

/** Display name is required at signup (PRD Module 2.2). */
export const displayNameSchema = z.string().trim().min(1).max(50);

/** The four PRD coffee preferences; stored as jsonb, validated here. */
export const coffeePreferenceSchema = z.enum(['matcha', 'espresso', 'cold_brew', 'latte']);
export const coffeePreferencesSchema = z.array(coffeePreferenceSchema).max(4);

/**
 * Home neighbourhood. The PRD says "from a set list of Dallas areas" but the
 * list itself is not specified — see
 * docs/decisions/open-questions.md (neighbourhood list). Until the product
 * owner supplies the list, this is a validated free-text string and the
 * canonical list is enforced nowhere.
 */
export const neighborhoodSchema = z.string().trim().min(1).max(60);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

/**
 * Login does not enforce password rules — a stale-but-valid password shape
 * from a legacy account must still be comparable.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const tokenSchema = z.string().min(1).max(256);

export const verifyEmailSchema = z.object({
  token: tokenSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: tokenSchema,
});

export const logoutSchema = z.object({
  refreshToken: tokenSchema,
});

/** Profile fields a user may edit themselves — never role/verification/security state. */
export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    profilePhotoUrl: z.string().url().max(2048).nullable().optional(),
    coffeePreferences: coffeePreferencesSchema.optional(),
    neighborhood: neighborhoodSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
