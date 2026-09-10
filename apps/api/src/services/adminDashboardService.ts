import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type { AdminDashboardSummary } from '@social-cup/types';
import { and, count, eq, gte, isNull, sql } from 'drizzle-orm';

const { cafes, redemptionVoids, redemptions, users } = schema;

/** ADR-0009: 1 credit = exactly $1 = 100 cents, fixed — used only to compute margin, never stored or made configurable. */
const CENTS_PER_CREDIT = 100;

export interface AdminDashboardService {
  getSummary(): Promise<AdminDashboardSummary>;
}

/**
 * The admin dashboard (PRD Module 9: "total members, active cafes,
 * redemptions this month, credits redeemed, total owed to cafes, total
 * margin for the period"). `cafes` has no `isActive` flag in this schema
 * (see open-questions.md) — "active cafes" is read here as every cafe that
 * exists, the only reading the current model supports. Every "this month"
 * figure excludes voided redemptions, matching how the payout log itself
 * treats a void as removing a redemption from the cafe's payout.
 */
export function createAdminDashboardService(deps: { db: DB }): AdminDashboardService {
  const { db } = deps;

  return {
    async getSummary() {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [[memberRow], [cafeRow], [monthRow]] = await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(cafes),
        db
          .select({
            redemptionCount: sql<string>`count(*)`,
            totalCredits: sql<string>`coalesce(sum(${redemptions.creditAmount}), 0)`,
            totalOwedCents: sql<string>`coalesce(sum(${redemptions.creditAmount} * ${redemptions.payoutRateCents}), 0)`,
          })
          .from(redemptions)
          .leftJoin(redemptionVoids, eq(redemptionVoids.redemptionId, redemptions.id))
          .where(and(gte(redemptions.redeemedAt, startOfMonth), isNull(redemptionVoids.id))),
      ]);

      const creditsRedeemedThisMonth = Number(monthRow?.totalCredits ?? 0);
      const totalOwedToCafesThisMonthCents = Number(monthRow?.totalOwedCents ?? 0);

      return {
        totalMembers: memberRow?.value ?? 0,
        activeCafes: cafeRow?.value ?? 0,
        redemptionsThisMonth: Number(monthRow?.redemptionCount ?? 0),
        creditsRedeemedThisMonth,
        totalOwedToCafesThisMonthCents,
        totalMarginThisMonthCents:
          creditsRedeemedThisMonth * CENTS_PER_CREDIT - totalOwedToCafesThisMonthCents,
      };
    },
  };
}
