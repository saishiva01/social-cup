import type { DB } from '@social-cup/database';
import { Router } from 'express';

import { requireAdmin } from '../../../middleware/requireAdmin.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import type { AdminCafeService } from '../../../services/adminCafeService.js';
import type { AdminDashboardService } from '../../../services/adminDashboardService.js';
import type { AdminDrinkService } from '../../../services/adminDrinkService.js';
import type { AdminMemberService } from '../../../services/adminMemberService.js';
import type { AdminRedemptionService } from '../../../services/adminRedemptionService.js';
import type { AddressLookupProvider } from '../../../services/addressLookup/AddressLookupProvider.js';
import type { PayoutService } from '../../../services/payoutService.js';
import { createAddressLookupRouter } from './addressLookup.js';
import { createAdminCafesRouter } from './cafes.js';
import { createAdminDashboardRouter } from './dashboard.js';
import { createAdminDrinksRouter } from './drinks.js';
import { createAdminMembersRouter } from './members.js';
import { createAdminPayoutsRouter } from './payouts.js';
import { createAdminRedemptionsRouter } from './redemptions.js';

/**
 * Every route under here is gated on both authentication AND admin
 * authorization (root CLAUDE.md: "All admin API routes must enforce
 * authorization server-side") — `requireAuth()` resolves the caller's
 * identity from the access token, then `requireAdmin(db)` re-checks their
 * role from the database on every request (see
 * apps/api/src/middleware/requireAdmin.ts for why it's not JWT-embedded). A
 * Visitor or Member gets a 403 here, never a route that silently no-ops.
 */
export function createAdminRouter(deps: {
  db: DB;
  adminCafeService: AdminCafeService;
  adminDrinkService: AdminDrinkService;
  adminMemberService: AdminMemberService;
  adminRedemptionService: AdminRedemptionService;
  payoutService: PayoutService;
  adminDashboardService: AdminDashboardService;
  addressLookupProvider: AddressLookupProvider;
}): Router {
  const router: Router = Router();

  router.use(requireAuth());
  router.use(requireAdmin(deps.db));

  router.use('/dashboard', createAdminDashboardRouter(deps.adminDashboardService));
  router.use(
    '/cafes',
    createAdminCafesRouter({
      adminCafeService: deps.adminCafeService,
      adminDrinkService: deps.adminDrinkService,
    }),
  );
  router.use('/drinks', createAdminDrinksRouter(deps.adminDrinkService));
  router.use('/members', createAdminMembersRouter(deps.adminMemberService));
  router.use('/redemptions', createAdminRedemptionsRouter(deps.adminRedemptionService));
  router.use('/payouts', createAdminPayoutsRouter(deps.payoutService));
  router.use('/address-lookup', createAddressLookupRouter(deps.addressLookupProvider));

  return router;
}
