import { adminDrinkUpdateSchema, uuidSchema } from '@social-cup/validation';
import type { AdminDrinkUpdateInput } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import { validateBody } from '../../../middleware/validate.js';
import { ValidationError } from '../../../errors/AppError.js';
import type { AdminDrinkService } from '../../../services/adminDrinkService.js';

export function createAdminDrinksRouter(adminDrinkService: AdminDrinkService): Router {
  const router: Router = Router();

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid drink id');
      const result = await adminDrinkService.getDetail(parsedId.data);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.patch(
    '/:id',
    validateBody(adminDrinkUpdateSchema),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid drink id');
      const input = req.body as AdminDrinkUpdateInput;
      const result = await adminDrinkService.update(parsedId.data, input, req.auth!.userId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
