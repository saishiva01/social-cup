import type { DiaryQuery } from '@social-cup/validation';
import { diaryQuerySchema, updateProfileSchema } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import type { RatingService } from '../../services/ratingService.js';
import type { UserService } from '../../services/userService.js';

/**
 * The authenticated user's own profile (PRD Module 2 profile setup) and
 * drink diary (PRD Module 5). The identity comes exclusively from req.auth —
 * the verified access token — so there is no way to read or modify another
 * account's profile or diary. Profile photo URLs are validated as http(s)
 * URLs; image upload itself is out of Phase 1 scope (S3 uploads ship with
 * the photo feature).
 */
export function createMeRouter(userService: UserService, ratingService: RatingService): Router {
  const router: Router = Router();

  router.use(requireAuth());

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const user = await userService.getProfile(req.auth!.userId);
      res.status(200).json({ success: true, data: user });
    }),
  );

  router.patch(
    '/',
    validateBody(updateProfileSchema),
    asyncHandler(async (req, res) => {
      const user = await userService.updateProfile(req.auth!.userId, req.body);
      res.status(200).json({ success: true, data: user });
    }),
  );

  router.get(
    '/ratings',
    validateQuery(diaryQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as DiaryQuery;
      const diary = await ratingService.listDiary({ userId: req.auth!.userId, ...query });
      res.status(200).json({ success: true, data: diary });
    }),
  );

  return router;
}
