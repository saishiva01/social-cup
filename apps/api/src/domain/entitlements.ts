import { ForbiddenError } from '../errors/AppError.js';
import type { RequestHandler } from 'express';

export type AccountState = 'visitor' | 'member';

/**
 * Visitor vs. Member (ADR-0008) is a capability layered on top of
 * "authenticated," not a second authentication system. No memberships table
 * exists yet (Phase 4 — PRD Module 7), so this always resolves to 'visitor'
 * for every authenticated user. This is the single seam Phase 4 replaces
 * with a real query against the membership/subscription state — nothing
 * upstream of this function (routes, middleware) needs to change when that
 * happens.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getAccountState(userId: string): Promise<AccountState> {
  return Promise.resolve('visitor');
}

/**
 * Gates a route on Member entitlement. Must run after requireAuth(). No
 * Phase 1 route actually needs this yet (redemption/credits are Phase 4+),
 * but it's built now so the authorization model — not just the schema — is
 * ready for Phase 4 without an authorization redesign.
 */
export function requireMembership(): RequestHandler {
  return (req, _res, next) => {
    getAccountState(req.auth!.userId)
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
