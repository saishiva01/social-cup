import type { DB } from '@social-cup/database';
import { Router } from 'express';

import type { AddressLookupProvider } from '../../services/addressLookup/AddressLookupProvider.js';
import type { AdminCafeService } from '../../services/adminCafeService.js';
import type { AdminDashboardService } from '../../services/adminDashboardService.js';
import type { AdminDrinkService } from '../../services/adminDrinkService.js';
import type { AdminMemberService } from '../../services/adminMemberService.js';
import type { AdminRedemptionService } from '../../services/adminRedemptionService.js';
import type { AuthService } from '../../services/authService.js';
import type { BaristaService } from '../../services/baristaService.js';
import type { CafeService } from '../../services/cafeService.js';
import type { MembershipService } from '../../services/membershipService.js';
import type { PayoutService } from '../../services/payoutService.js';
import type { RatingService } from '../../services/ratingService.js';
import type { RedemptionService } from '../../services/redemptionService.js';
import type { UserService } from '../../services/userService.js';
import { createAdminRouter } from './admin/index.js';
import { createAuthRouter } from './auth.js';
import { createBaristaRouter } from './barista.js';
import { createCafesRouter } from './cafes.js';
import { createDrinksRouter } from './drinks.js';
import { createMeRouter } from './me.js';
import { createMembershipRouter } from './membership.js';
import { createRedemptionsRouter } from './redemptions.js';

/**
 * Versioned API root. Every future route mounts under /api/v1; a breaking
 * change adds /api/v2 alongside it rather than replacing it. Routers are
 * built from injected services so integration tests can pass fakes and
 * real services alike (see apps/api/src/__tests__/). Note: /api/v1/webhooks/stripe
 * is NOT mounted here — see routes/stripeWebhook.ts and app.ts for why it's
 * registered directly on the app, ahead of the global JSON body parser.
 */
export function createV1Router(deps: {
  db: DB;
  authService: AuthService;
  userService: UserService;
  cafeService: CafeService;
  ratingService: RatingService;
  membershipService: MembershipService;
  redemptionService: RedemptionService;
  baristaService: BaristaService;
  adminCafeService: AdminCafeService;
  adminDrinkService: AdminDrinkService;
  adminMemberService: AdminMemberService;
  adminRedemptionService: AdminRedemptionService;
  payoutService: PayoutService;
  adminDashboardService: AdminDashboardService;
  addressLookupProvider: AddressLookupProvider;
}): Router {
  const router: Router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json({ version: 'v1', status: 'ok' });
  });

  router.use('/auth', createAuthRouter(deps.authService));
  router.use('/me', createMeRouter(deps.userService, deps.ratingService));
  router.use('/cafes', createCafesRouter(deps.cafeService));
  router.use('/drinks', createDrinksRouter(deps.ratingService));
  router.use(
    '/membership',
    createMembershipRouter({
      membershipService: deps.membershipService,
      userService: deps.userService,
    }),
  );
  router.use(
    '/redemptions',
    createRedemptionsRouter({ redemptionService: deps.redemptionService, db: deps.db }),
  );
  router.use('/barista', createBaristaRouter({ baristaService: deps.baristaService }));
  router.use(
    '/admin',
    createAdminRouter({
      db: deps.db,
      adminCafeService: deps.adminCafeService,
      adminDrinkService: deps.adminDrinkService,
      adminMemberService: deps.adminMemberService,
      adminRedemptionService: deps.adminRedemptionService,
      payoutService: deps.payoutService,
      adminDashboardService: deps.adminDashboardService,
      addressLookupProvider: deps.addressLookupProvider,
    }),
  );

  return router;
}
