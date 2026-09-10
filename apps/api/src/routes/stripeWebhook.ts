import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../errors/AppError.js';
import type { StripeService } from '../services/stripe/StripeService.js';
import type { StripeWebhookService } from '../services/stripeWebhookService.js';

/**
 * POST /api/v1/webhooks/stripe. Mounted directly on the Express app in
 * app.ts with `express.raw()`, BEFORE the global `express.json()` middleware
 * — Stripe signature verification needs the exact raw bytes Stripe signed,
 * which express.json() would already have parsed and re-serialized (see
 * docs/architecture/payments.md). This router is never mounted under
 * createV1Router for that reason, even though the path lives under /api/v1.
 */
export function createStripeWebhookRouter(deps: {
  stripeService: StripeService;
  stripeWebhookService: StripeWebhookService;
}): Router {
  const router: Router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        throw new ValidationError('Missing Stripe-Signature header');
      }
      if (!Buffer.isBuffer(req.body)) {
        // Would indicate express.json() ran before this route — a
        // configuration bug, not a client error; see the module comment.
        throw new ValidationError('Expected raw request body');
      }

      let event;
      try {
        event = deps.stripeService.constructEvent(req.body, signature);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : err },
          'Stripe webhook signature verification failed',
        );
        throw new ValidationError('Invalid Stripe webhook signature');
      }

      logger.info({ stripeEventId: event.id, type: event.type }, 'Stripe webhook received');
      await deps.stripeWebhookService.processEvent(event);
      logger.info({ stripeEventId: event.id, type: event.type }, 'Stripe webhook processed');

      res.status(200).json({ received: true });
    }),
  );

  return router;
}
