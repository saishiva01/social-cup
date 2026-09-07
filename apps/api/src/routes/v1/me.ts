import { updateProfileSchema } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { validateBody } from '../../middleware/validate.js';
import type { UserService } from '../../services/userService.js';

/**
 * The authenticated user's own profile (PRD Module 2 profile setup). The
 * identity comes exclusively from req.auth — the verified access token —
 * so there is no way to read or modify another account. Profile photo URLs
 * are validated as http(s) URLs; image upload itself is out of Phase 1
 * scope (S3 uploads ship with the photo feature).
 */
export function createMeRouter(userService: UserService): Router {
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

  return router;
}
