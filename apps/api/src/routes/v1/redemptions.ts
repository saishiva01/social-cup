import type { DB } from '@social-cup/database';
import { createRedemptionSchema, uuidSchema } from '@social-cup/validation';
import { Router } from 'express';

import { requireMembership } from '../../domain/entitlements.js';
import { ValidationError } from '../../errors/AppError.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { createRedemptionRateLimit } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validateBody } from '../../middleware/validate.js';
import type { RedemptionService } from '../../services/redemptionService.js';

/**
 * Member-facing redemption endpoints (PRD Module 8). Every route requires
 * both an authenticated user and an active membership — this is the first
 * real consumer of requireMembership() (see apps/api/src/domain/entitlements.ts).
 * The authenticated user's id (never a client-supplied id) is the only
 * identity ever passed to redemptionService.
 */
export function createRedemptionsRouter(deps: {
  redemptionService: RedemptionService;
  db: DB;
}): Router {
  const router: Router = Router();

  router.use(requireAuth());
  router.use(requireMembership(deps.db));

  router.post(
    '/',
    createRedemptionRateLimit(),
    validateBody(createRedemptionSchema),
    asyncHandler(async (req, res) => {
      const result = await deps.redemptionService.create({
        userId: req.auth!.userId,
        cafeId: req.body.cafeId,
        drinkId: req.body.drinkId,
      });
      res.status(201).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid redemption id');

      const result = await deps.redemptionService.getStatus({
        userId: req.auth!.userId,
        redemptionId: parsedId.data,
      });
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
