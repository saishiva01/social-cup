import { index, pgTable, timestamp, uuid, text } from 'drizzle-orm/pg-core';

import { users } from './users.js';

/**
 * Single-use, expiring tokens for the email-verification flow (PRD Module 2).
 * Only a SHA-256 hash of the raw token is ever stored (see
 * apps/api/src/lib/tokens.ts) — the raw token exists only in the email link.
 */
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('email_verification_tokens_user_id_idx').on(table.userId),
  }),
);

/** Single-use, expiring tokens for "forgot password" (PRD Module 2.2 — 1 hour expiry). */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
  }),
);

/**
 * Opaque, rotated refresh tokens (ADR-0004). `chainId` groups every token
 * descended from one login so reusing an already-rotated token (the standard
 * theft signal) can revoke the whole chain at once, not just the one row.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    chainId: uuid('chain_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
    chainIdIdx: index('refresh_tokens_chain_id_idx').on(table.chainId),
  }),
);
