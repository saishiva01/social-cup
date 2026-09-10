import type { CafeListQuery, CuratedCafesQuery } from '@social-cup/validation';
import { cafeListQuerySchema, curatedCafesQuerySchema, uuidSchema } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validateQuery } from '../../middleware/validate.js';
import { ValidationError } from '../../errors/AppError.js';
import type { CafeService } from '../../services/cafeService.js';

/**
 * Cafe discovery (PRD Modules 3, 4, and the discovery-relevant slice of
 * Module 9). Every route only needs `requireAuth()` — Visitors (registered,
 * not subscribed) have full browse/search/filter/view access per ADR-0008;
 * nothing here checks membership. Static routes are registered before
 * `/:id` so `/featured`, `/signature-drinks`, and `/neighborhoods` are never
 * swallowed by the `:id` param.
 */
export function createCafesRouter(cafeService: CafeService): Router {
  const router: Router = Router();

  router.use(requireAuth());

  router.get(
    '/',
    validateQuery(cafeListQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as CafeListQuery;
      const result = await cafeService.list(query);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/featured',
    validateQuery(curatedCafesQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as CuratedCafesQuery;
      const items = await cafeService.getFeatured({ userId: req.auth!.userId, ...query });
      res.status(200).json({ success: true, data: items });
    }),
  );

  router.get(
    '/signature-drinks',
    asyncHandler(async (_req, res) => {
      const items = await cafeService.getSignatureDrinks();
      res.status(200).json({ success: true, data: items });
    }),
  );

  router.get(
    '/neighborhoods',
    asyncHandler(async (_req, res) => {
      const neighborhoods = await cafeService.getNeighborhoods();
      res.status(200).json({ success: true, data: neighborhoods });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid cafe id');

      const detail = await cafeService.getDetail(parsedId.data);
      res.status(200).json({ success: true, data: detail });
    }),
  );

  return router;
}
