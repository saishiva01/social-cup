import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type {
  AdminRedemptionListItem,
  PaginatedResult,
  VoidRedemptionResult,
} from '@social-cup/types';
import { and, count, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';

import { ConflictError, NotFoundError } from '../errors/AppError.js';
import { isUniqueViolation } from '../lib/dbErrors.js';

const { cafes, creditLedgerEntries, drinks, memberships, redemptionVoids, redemptions, users } =
  schema;

export interface AdminRedemptionListParams {
  page: number;
  pageSize: number;
  cafeId?: string;
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  voided?: boolean;
}

export interface AdminRedemptionService {
  list(params: AdminRedemptionListParams): Promise<PaginatedResult<AdminRedemptionListItem>>;
  getDetail(redemptionId: string): Promise<AdminRedemptionListItem>;
  void(input: {
    redemptionId: string;
    adminUserId: string;
    reason: string;
  }): Promise<VoidRedemptionResult>;
}

const redemptionSelection = {
  id: redemptions.id,
  memberId: redemptions.userId,
  memberDisplayName: users.displayName,
  memberEmail: users.email,
  cafeId: redemptions.cafeId,
  cafeName: cafes.name,
  drinkId: redemptions.drinkId,
  drinkName: drinks.name,
  creditAmount: redemptions.creditAmount,
  payoutRateCents: redemptions.payoutRateCents,
  redeemedAt: redemptions.redeemedAt,
  voidId: redemptionVoids.id,
  voidedAt: redemptionVoids.voidedAt,
  voidReason: redemptionVoids.reason,
};

interface RedemptionJoinRow {
  id: string;
  memberId: string;
  memberDisplayName: string;
  memberEmail: string;
  cafeId: string;
  cafeName: string;
  drinkId: string;
  drinkName: string;
  creditAmount: number;
  payoutRateCents: number;
  redeemedAt: Date;
  voidId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
}

function toListItem(row: RedemptionJoinRow): AdminRedemptionListItem {
  return {
    id: row.id,
    memberId: row.memberId,
    memberDisplayName: row.memberDisplayName,
    memberEmail: row.memberEmail,
    cafeId: row.cafeId,
    cafeName: row.cafeName,
    drinkId: row.drinkId,
    drinkName: row.drinkName,
    creditAmount: row.creditAmount,
    payoutRateCents: row.payoutRateCents,
    payoutAmountCents: row.creditAmount * row.payoutRateCents,
    redeemedAt: row.redeemedAt.toISOString(),
    voided: row.voidId !== null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  };
}

/**
 * Admin redemption log and void operations (PRD Module 9 "Redemption log";
 * PRD 9.7 voids). `redemptions` is never updated or deleted by anything
 * here — see docs/architecture/database-architecture.md rule 4 and
 * packages/database/src/schema/adminOps.ts's `redemptionVoids` table
 * comment for why a void is a new row, not a mutation.
 */
export function createAdminRedemptionService(deps: { db: DB }): AdminRedemptionService {
  const { db } = deps;

  function baseQuery() {
    return db
      .select(redemptionSelection)
      .from(redemptions)
      .innerJoin(users, eq(redemptions.userId, users.id))
      .innerJoin(cafes, eq(redemptions.cafeId, cafes.id))
      .innerJoin(drinks, eq(redemptions.drinkId, drinks.id))
      .leftJoin(redemptionVoids, eq(redemptionVoids.redemptionId, redemptions.id));
  }

  return {
    async list({ page, pageSize, cafeId, userId, dateFrom, dateTo, voided }) {
      const conditions = [];
      if (cafeId) conditions.push(eq(redemptions.cafeId, cafeId));
      if (userId) conditions.push(eq(redemptions.userId, userId));
      if (dateFrom) conditions.push(gte(redemptions.redeemedAt, dateFrom));
      if (dateTo) conditions.push(lte(redemptions.redeemedAt, dateTo));
      if (voided !== undefined) {
        conditions.push(voided ? isNotNull(redemptionVoids.id) : isNull(redemptionVoids.id));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ value: count() })
        .from(redemptions)
        .leftJoin(redemptionVoids, eq(redemptionVoids.redemptionId, redemptions.id))
        .where(where);
      const totalItems = totalRow?.value ?? 0;

      const rows = await baseQuery()
        .where(where)
        .orderBy(desc(redemptions.redeemedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: rows.map(toListItem),
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    },

    async getDetail(redemptionId) {
      const [row] = await baseQuery().where(eq(redemptions.id, redemptionId));
      if (!row) throw new NotFoundError('Redemption not found');
      return toListItem(row);
    },

    async void({ redemptionId, adminUserId, reason }) {
      return db.transaction(async (tx) => {
        const [redemption] = await tx
          .select()
          .from(redemptions)
          .where(eq(redemptions.id, redemptionId));
        if (!redemption) throw new NotFoundError('Redemption not found');

        const [membership] = await tx
          .select({
            currentPeriodStart: memberships.currentPeriodStart,
            currentPeriodEnd: memberships.currentPeriodEnd,
          })
          .from(memberships)
          .where(eq(memberships.userId, redemption.userId));

        // Prefer the member's *current* billing period so the restored
        // credit is immediately usable (matches how a deduction itself is
        // always written against the current period, not a stale snapshot —
        // see baristaService.redeem). Falls back to the original deduction's
        // own period only if the member's membership record has no current
        // period at all (e.g. never renewed since), so this insert always
        // has a valid, non-null period — see docs/decisions/open-questions.md.
        let periodStart = membership?.currentPeriodStart ?? null;
        let periodEnd = membership?.currentPeriodEnd ?? null;
        if (!periodStart || !periodEnd) {
          const [originalEntry] = await tx
            .select({
              periodStart: creditLedgerEntries.periodStart,
              periodEnd: creditLedgerEntries.periodEnd,
            })
            .from(creditLedgerEntries)
            .where(eq(creditLedgerEntries.id, redemption.creditLedgerEntryId));
          periodStart = originalEntry?.periodStart ?? null;
          periodEnd = originalEntry?.periodEnd ?? null;
        }
        if (!periodStart || !periodEnd) {
          throw new ConflictError('Unable to determine a billing period to restore credits into');
        }

        const [ledgerEntry] = await tx
          .insert(creditLedgerEntries)
          .values({
            userId: redemption.userId,
            amount: redemption.creditAmount,
            reason: 'redemption_void',
            periodStart,
            periodEnd,
          })
          .returning();

        try {
          const [voidRow] = await tx
            .insert(redemptionVoids)
            .values({
              redemptionId,
              adminUserId,
              reason,
              creditLedgerEntryId: ledgerEntry!.id,
            })
            .returning();

          return {
            redemptionId,
            voidedAt: voidRow!.voidedAt.toISOString(),
            reason,
            compensatingCreditAmount: redemption.creditAmount,
          };
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw new ConflictError('This redemption has already been voided');
          }
          throw err;
        }
      });
    },
  };
}
