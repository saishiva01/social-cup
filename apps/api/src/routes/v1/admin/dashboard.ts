import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import type { AdminDashboardService } from '../../../services/adminDashboardService.js';

export function createAdminDashboardRouter(adminDashboardService: AdminDashboardService): Router {
  const router: Router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const summary = await adminDashboardService.getSummary();
      res.status(200).json({ success: true, data: summary });
    }),
  );

  return router;
}
