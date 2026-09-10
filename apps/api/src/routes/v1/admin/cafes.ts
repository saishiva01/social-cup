import {
  adminCafeCreateSchema,
  adminCafeListQuerySchema,
  adminCafeUpdateSchema,
  adminDrinkCreateSchema,
  adminSetPayoutRateSchema,
  adminSetPinSchema,
  uuidSchema,
} from '@social-cup/validation';
import type {
  AdminCafeCreateInput,
  AdminCafeListQuery,
  AdminCafeUpdateInput,
  AdminDrinkCreateInput,
  AdminSetPayoutRateInput,
  AdminSetPinInput,
} from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import { validateBody, validateQuery } from '../../../middleware/validate.js';
import { ValidationError } from '../../../errors/AppError.js';
import type { AdminCafeService } from '../../../services/adminCafeService.js';
import type { AdminDrinkService } from '../../../services/adminDrinkService.js';

function parseUuidParam(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError('Invalid id');
  return parsed.data;
}

/** Admin cafe management (PRD Module 9) — CRUD, payout rate, and barista PIN, plus the nested per-cafe drinks list. */
export function createAdminCafesRouter(deps: {
  adminCafeService: AdminCafeService;
  adminDrinkService: AdminDrinkService;
}): Router {
  const router: Router = Router();

  router.get(
    '/',
    validateQuery(adminCafeListQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as AdminCafeListQuery;
      const result = await deps.adminCafeService.list(query);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/',
    validateBody(adminCafeCreateSchema),
    asyncHandler(async (req, res) => {
      const input = req.body as AdminCafeCreateInput;
      const result = await deps.adminCafeService.create(input, req.auth!.userId);
      res.status(201).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const result = await deps.adminCafeService.getDetail(id);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.patch(
    '/:id',
    validateBody(adminCafeUpdateSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const input = req.body as AdminCafeUpdateInput;
      const result = await deps.adminCafeService.update(id, input, req.auth!.userId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.patch(
    '/:id/payout-rate',
    validateBody(adminSetPayoutRateSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const input = req.body as AdminSetPayoutRateInput;
      const result = await deps.adminCafeService.setPayoutRate(
        id,
        input.payoutRateCents,
        req.auth!.userId,
      );
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.put(
    '/:id/barista-pin',
    validateBody(adminSetPinSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const input = req.body as AdminSetPinInput;
      const result = await deps.adminCafeService.setPin(id, input.pin, req.auth!.userId);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:id/drinks',
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const result = await deps.adminDrinkService.listForCafe(id);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.post(
    '/:id/drinks',
    validateBody(adminDrinkCreateSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const input = req.body as AdminDrinkCreateInput;
      const result = await deps.adminDrinkService.create(id, input, req.auth!.userId);
      res.status(201).json({ success: true, data: result });
    }),
  );

  return router;
}
