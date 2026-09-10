import { adminMemberListQuerySchema, uuidSchema } from '@social-cup/validation';
import type { AdminMemberListQuery } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import { validateQuery } from '../../../middleware/validate.js';
import { ValidationError } from '../../../errors/AppError.js';
import type { AdminMemberService } from '../../../services/adminMemberService.js';

/** Admin member administration (PRD Module 9) — read-only listing/detail plus the one deactivate/reactivate toggle the PRD calls for. */
export function createAdminMembersRouter(adminMemberService: AdminMemberService): Router {
  const router: Router = Router();

  router.get(
    '/',
    validateQuery(adminMemberListQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as AdminMemberListQuery;
      const result = await adminMemberService.list(query);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid member id');
      const result = await adminMemberService.getDetail(parsedId.data);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/:id/deactivate',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid member id');
      const result = await adminMemberService.setDeactivated(parsedId.data, true, req.auth!.userId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/:id/reactivate',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) throw new ValidationError('Invalid member id');
      const result = await adminMemberService.setDeactivated(
        parsedId.data,
        false,
        req.auth!.userId,
      );
      res.status(200).json({ success: true, data: result });
    }),
  );

  return router;
}
