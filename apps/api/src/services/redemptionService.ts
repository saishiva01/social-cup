import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type { CreateRedemptionResult, RedemptionStatusResult } from '@social-cup/types';
import { and, eq } from 'drizzle-orm';

import { getCreditBalance } from '../domain/creditLedger.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import {
  generateBackupCode,
  generateRedemptionCode,
  hashToken,
  REDEMPTION_CODE_TTL_MS,
} from '../lib/tokens.js';

const { cafeBaristaCredentials, cafes, drinks, memberships, redemptionCodes } = schema;

/** "XXXXXXXXXXXX" -> "XXXX-XXXX-XXXX", purely for display — the stored/compared value is unformatted. */
function formatCodeForDisplay(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? [raw]).join('-');
}

export interface RedemptionService {
  create(input: {
    userId: string;
    cafeId: string;
    drinkId: string;
  }): Promise<CreateRedemptionResult>;
  getStatus(input: { userId: string; redemptionId: string }): Promise<RedemptionStatusResult>;
}

/**
 * Member-facing side of redemption (PRD Module 8): creating a five-minute
 * code and polling its status while waiting on the barista. Never touches
 * credits — see docs/architecture/redemption.md: credits are deducted only
 * by a successful barista scan (baristaService.redeem), inside the atomic
 * transaction ADR-0006 requires. This service's job is entirely the
 * eligibility checks that must pass *before* a code is even generated.
 */
export function createRedemptionService(deps: { db: DB }): RedemptionService {
  const { db } = deps;

  return {
    async create({ userId, cafeId, drinkId }) {
      const [cafe] = await db.select().from(cafes).where(eq(cafes.id, cafeId));
      if (!cafe) throw new NotFoundError('Cafe not found');

      const [drink] = await db
        .select()
        .from(drinks)
        .where(and(eq(drinks.id, drinkId), eq(drinks.cafeId, cafeId)));
      if (!drink || !drink.isActive) throw new NotFoundError('Drink not found at this cafe');

      const [credentials] = await db
        .select({ payoutRateCents: cafeBaristaCredentials.payoutRateCents })
        .from(cafeBaristaCredentials)
        .where(eq(cafeBaristaCredentials.cafeId, cafeId));
      if (!credentials || credentials.payoutRateCents === null) {
        throw new ConflictError('This cafe is not yet set up for redemption');
      }

      const [membership] = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, userId));
      if (!membership || membership.status !== 'active') {
        // Defense in depth — routes/v1/redemptions.ts already gates this route with
        // requireMembership(), so a Visitor never reaches here in practice.
        throw new ForbiddenError('This action requires an active Social Cup membership');
      }

      const balance = await getCreditBalance(db, userId, membership.currentPeriodEnd);
      if (balance < drink.creditPrice) {
        throw new ConflictError('Not enough credits for this drink');
      }

      const rawCode = generateRedemptionCode();
      const rawBackupCode = generateBackupCode();
      const expiresAt = new Date(Date.now() + REDEMPTION_CODE_TTL_MS);

      const created = await db.transaction(async (tx) => {
        // PRD: "a member may hold only one live code at a time — generating
        // a new one cancels the old one." No money moves here, so a plain
        // transaction (not the atomic-conditional-UPDATE pattern) is
        // sufficient — that stricter pattern is reserved for the scan/spend
        // path in baristaService.redeem.
        await tx
          .update(redemptionCodes)
          .set({ status: 'canceled', canceledAt: new Date() })
          .where(and(eq(redemptionCodes.userId, userId), eq(redemptionCodes.status, 'pending')));

        const [row] = await tx
          .insert(redemptionCodes)
          .values({
            userId,
            cafeId,
            drinkId,
            codeHash: hashToken(rawCode),
            backupCodeHash: hashToken(rawBackupCode),
            creditPrice: drink.creditPrice,
            expiresAt,
          })
          .returning();
        return row!;
      });

      return {
        id: created.id,
        cafeId: cafe.id,
        cafeName: cafe.name,
        drinkId: drink.id,
        drinkName: drink.name,
        code: formatCodeForDisplay(rawCode),
        backupCode: rawBackupCode,
        creditCost: drink.creditPrice,
        expiresAt: expiresAt.toISOString(),
      };
    },

    async getStatus({ userId, redemptionId }) {
      const [row] = await db
        .select({
          id: redemptionCodes.id,
          userId: redemptionCodes.userId,
          status: redemptionCodes.status,
          creditPrice: redemptionCodes.creditPrice,
          expiresAt: redemptionCodes.expiresAt,
          redeemedAt: redemptionCodes.redeemedAt,
          cafeName: cafes.name,
          drinkName: drinks.name,
        })
        .from(redemptionCodes)
        .innerJoin(cafes, eq(redemptionCodes.cafeId, cafes.id))
        .innerJoin(drinks, eq(redemptionCodes.drinkId, drinks.id))
        .where(eq(redemptionCodes.id, redemptionId));

      // Ownership is enforced here, not just by requireAuth — a client
      // cannot poll another member's redemption by guessing its id.
      if (!row || row.userId !== userId) throw new NotFoundError('Redemption not found');

      const isPastExpiry = row.status === 'pending' && row.expiresAt.getTime() < Date.now();

      return {
        id: row.id,
        status: isPastExpiry ? 'expired' : (row.status as RedemptionStatusResult['status']),
        cafeName: row.cafeName,
        drinkName: row.drinkName,
        creditCost: row.creditPrice,
        expiresAt: row.expiresAt.toISOString(),
        redeemedAt: row.redeemedAt?.toISOString() ?? null,
      };
    },
  };
}
