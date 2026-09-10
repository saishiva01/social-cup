import {
  adminRecordPaymentSchema,
  payoutPeriodQuerySchema,
  uuidSchema,
} from '@social-cup/validation';
import type { AdminRecordPaymentInput, PayoutPeriodQuery } from '@social-cup/validation';
import { Router } from 'express';

import { asyncHandler } from '../../../lib/asyncHandler.js';
import { validateBody, validateQuery } from '../../../middleware/validate.js';
import { ValidationError } from '../../../errors/AppError.js';
import type { PayoutService } from '../../../services/payoutService.js';

function parseCafeId(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError('Invalid cafe id');
  return parsed.data;
}

/**
 * Admin payout operations (PRD Module 9 "Payouts"). Every amount here is
 * computed live from already-snapshotted `redemptions` rows or read back
 * from the append-only `cafe_payout_payments` history — see
 * apps/api/src/services/payoutService.ts.
 */
export function createAdminPayoutsRouter(payoutService: PayoutService): Router {
  const router: Router = Router();

  router.get(
    '/',
    validateQuery(payoutPeriodQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.validatedQuery as PayoutPeriodQuery;
      const result = await payoutService.summary(query);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:cafeId/statement',
    validateQuery(payoutPeriodQuerySchema),
    asyncHandler(async (req, res) => {
      const cafeId = parseCafeId(req.params.cafeId);
      const query = req.validatedQuery as PayoutPeriodQuery;
      const result = await payoutService.statement(cafeId, query);
      res.status(200).json({ success: true, data: result });
    }),
  );

  router.get(
    '/:cafeId/statement.csv',
    validateQuery(payoutPeriodQuerySchema),
    asyncHandler(async (req, res) => {
      const cafeId = parseCafeId(req.params.cafeId);
      const query = req.validatedQuery as PayoutPeriodQuery;
      const { filename, csv } = await payoutService.statementCsv(cafeId, query);
      res.status(200);
      res.type('text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    }),
  );

  router.post(
    '/:cafeId/payments',
    validateBody(adminRecordPaymentSchema),
    asyncHandler(async (req, res) => {
      const cafeId = parseCafeId(req.params.cafeId);
      const input = req.body as AdminRecordPaymentInput;
      const result = await payoutService.recordPayment({
        cafeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        amountCents: input.amountCents,
        reference: input.reference,
        adminUserId: req.auth!.userId,
      });
      res.status(201).json({ success: true, data: result });
    }),
  );

  return router;
}
