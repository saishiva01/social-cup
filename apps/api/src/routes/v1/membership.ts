import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { subscribeRateLimit } from '../../middleware/rateLimit.js';
import type { MembershipService } from '../../services/membershipService.js';
import type { UserService } from '../../services/userService.js';

/**
 * Membership status and Stripe-facing membership actions (PRD Module 7).
 * Every route is authenticated only — GET / must work for a Visitor (to show
 * "not a member yet"), and POST /subscribe is exactly how a Visitor becomes
 * eligible, so nothing here can require membership on top of requireAuth().
 * The authenticated user's id (never a client-supplied id) is the only
 * identity ever passed to membershipService.
 */
export function createMembershipRouter(deps: {
  membershipService: MembershipService;
  userService: UserService;
}): Router {
  const router: Router = Router();

  router.use(requireAuth());

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const status = await deps.membershipService.getStatus(req.auth!.userId);
      res.status(200).json({ success: true, data: status });
    }),
  );

  router.post(
    '/subscribe',
    subscribeRateLimit(),
    asyncHandler(async (req, res) => {
      const profile = await deps.userService.getProfile(req.auth!.userId);
      const result = await deps.membershipService.startSubscription({
        userId: req.auth!.userId,
        email: profile.email,
        displayName: profile.displayName,
      });
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/billing-portal',
    asyncHandler(async (req, res) => {
      const result = await deps.membershipService.createBillingPortalSession(req.auth!.userId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
