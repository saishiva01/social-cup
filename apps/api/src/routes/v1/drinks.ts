import { upsertRatingSchema, uuidSchema } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validateBody } from '../../middleware/validate.js';
import { ValidationError } from '../../errors/AppError.js';
import type { RatingService } from '../../services/ratingService.js';

/**
 * Drink ratings (PRD Module 5). `requireAuth()` only — Visitors can rate
 * drinks too, identically to Members (ADR-0008), so nothing here checks
 * membership. "My rating for this drink" is modeled as a singleton
 * sub-resource: GET reads it, PUT creates or edits it — matching "one
 * rating per member per drink, editable at any time."
 */
export function createDrinksRouter(ratingService: RatingService): Router {
  const router: Router = Router();

  router.use(requireAuth());

  router.get(
    '/:drinkId/rating',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.drinkId);
      if (!parsedId.success) throw new ValidationError('Invalid drink id');

      const rating = await ratingService.getMyRating(req.auth!.userId, parsedId.data);
      res.status(200).json({ success: true, data: rating });
    }),
  );

  router.put(
    '/:drinkId/rating',
    validateBody(upsertRatingSchema),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.drinkId);
      if (!parsedId.success) throw new ValidationError('Invalid drink id');

      const rating = await ratingService.upsertRating({
        userId: req.auth!.userId,
        drinkId: parsedId.data,
        stars: req.body.stars,
        note: req.body.note,
      });
      res.status(200).json({ success: true, data: rating });
    }),
  );

  return router;
}
