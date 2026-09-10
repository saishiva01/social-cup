import {
  adminRedemptionListQuerySchema,
  adminVoidRedemptionSchema,
  uuidSchema,
} from '@social-cup/validation';
import type { AdminRedemptionListQuery, AdminVoidRedemptionInput } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import { validateBody, validateQuery } from '../../../middleware/validate.js';
import { ValidationError } from '../../../errors/AppError.js';
import type { AdminRedemptionService } from '../../../services/adminRedemptionService.js';

/**
 * Admin redemption log and voids (PRD Module 9 redemption log; PRD 9.7
 * voids). `void` is the only mutating route here — every other route is a
 * read of the immutable `redemptions` audit trail.
 */
export function createAdminRedemptionsRouter(
  adminRedemptionService: AdminRedemptionService,
): Router {
  const router: Router = Router();

  router.get(
    '/',
    validateQuery(adminRedemptionListQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as AdminRedemptionListQuery;
      const result = await adminRedemptionService.list(query);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid redemption id');
      const result = await adminRedemptionService.getDetail(parsedId.data);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/:id/void',
    validateBody(adminVoidRedemptionSchema),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid redemption id');
      const input = req.body as AdminVoidRedemptionInput;
      const result = await adminRedemptionService.void({
        redemptionId: parsedId.data,
        adminUserId: req.auth!.userId,
        reason: input.reason,
      });
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
