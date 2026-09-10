import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import { eq } from 'drizzle-orm';

import { ForbiddenError } from '../errors/AppError.js';
import type { RequestHandler } from 'express';

export type AccountState = 'visitor' | 'member';

/**
 * Visitor vs. Member (ADR-0008) is a capability layered on top of
 * "authenticated," not a second authentication system. A user is a Member
 * exactly when their membership row's Stripe-derived status is 'active'
 * (Phase 4 — PRD Module 7); a Visitor who has never subscribed has no row at
 * all, which resolves here the same as any other non-active status. Written
 * only by webhook-verified events (apps/api/src/services/stripeWebhookService.ts)
 * — this is a read-only check, never a place that grants or revokes
 * membership itself.
 */
export async function getAccountState(db: DB, userId: string): Promise<AccountState> {
  const [row] = await db
    .select({ status: schema.memberships.status })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId));
  return row?.status === 'active' ? 'member' : 'visitor';
}

/**
 * Gates a route on Member entitlement. Must run after requireAuth(). No
 * Phase 4 route actually needs this yet — redemption (Phase 5) is the first
 * consumer — but it's built now so the authorization model is ready without
 * a later redesign.
 */
export function requireMembership(db: DB): RequestHandler {
  return (req, _res, next) => {
    getAccountState(db, req.auth!.userId)
      .then((state) => {
        if (state !== 'member') {
          next(new ForbiddenError('This action requires an active Social Cup membership'));
          return;
        }
        next();
      })
      .catch(next);
  };
}
