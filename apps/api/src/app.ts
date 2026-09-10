import type { DB } from '@social-cup/database';
import { createDrizzle, type Sql } from '@social-cup/database';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { buildCorsOptions } from './config/cors.js';
import { loadEnv } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { generalRateLimit } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import healthRouter from './routes/health.js';
import { createStripeWebhookRouter } from './routes/stripeWebhook.js';
import { createV1Router } from './routes/v1/index.js';
import { createAddressLookupProvider } from './services/addressLookup/createAddressLookupProvider.js';
import { createAdminCafeService } from './services/adminCafeService.js';
import { createAdminDashboardService } from './services/adminDashboardService.js';
import { createAdminDrinkService } from './services/adminDrinkService.js';
import { createAdminMemberService } from './services/adminMemberService.js';
import { createAdminRedemptionService } from './services/adminRedemptionService.js';
import { createAuthService } from './services/authService.js';
import { createBaristaService } from './services/baristaService.js';
import { createCafeService } from './services/cafeService.js';
import { createEmailService } from './services/email/createEmailService.js';
import type { EmailService } from './services/email/EmailService.js';
import { createMembershipService } from './services/membershipService.js';
import { createPayoutService } from './services/payoutService.js';
import { createRatingService } from './services/ratingService.js';
import { createRedemptionService } from './services/redemptionService.js';
import { createStripeClient } from './services/stripe/stripeClient.js';
import { createStripeService, type StripeService } from './services/stripe/StripeService.js';
import { createStripeWebhookService } from './services/stripeWebhookService.js';
import { createUserService } from './services/userService.js';
import { logger } from './lib/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      client: Sql;
      db: DB;
    }
  }
}

export function createApp(deps: {
  client: Sql;
  emailService?: EmailService;
  stripeService?: StripeService;
}): Express {
  const app = express();

  app.locals.client = deps.client;
  const db = createDrizzle(deps.client);
  app.locals.db = db;

  const env = loadEnv();
  const emailService = deps.emailService ?? createEmailService(env);
  const stripeService =
    deps.stripeService ??
    createStripeService({
      stripe: createStripeClient(env.STRIPE_SECRET_KEY),
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      apiVersion: env.STRIPE_API_VERSION,
    });

  const authService = createAuthService({ db, emailService });
  const userService = createUserService({ db });
  const cafeService = createCafeService({ db });
  const ratingService = createRatingService({ db });
  const membershipService = createMembershipService({
    db,
    stripeService,
    priceId: env.STRIPE_PRICE_ID,
  });
  const stripeWebhookService = createStripeWebhookService({ db });
  const redemptionService = createRedemptionService({ db });
  const baristaService = createBaristaService({ db });
  const adminCafeService = createAdminCafeService({ db });
  const adminDrinkService = createAdminDrinkService({ db });
  const adminMemberService = createAdminMemberService({ db });
  const adminRedemptionService = createAdminRedemptionService({ db });
  const payoutService = createPayoutService({ db });
  const adminDashboardService = createAdminDashboardService({ db });
  const addressLookupProvider = createAddressLookupProvider();

  // Required for correct client IPs (rate limiting, logging) behind the ALB.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(helmet());
  app.use(cors(buildCorsOptions()));

  // Registered before express.json() and outside createV1Router: Stripe
  // signature verification needs the exact raw bytes Stripe signed, which
  // express.json() would already have parsed and re-serialized by the time a
  // route inside the v1 router saw it — see routes/stripeWebhook.ts and
  // docs/architecture/payments.md.
  app.use(
    '/api/v1/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    createStripeWebhookRouter({ stripeService, stripeWebhookService }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  // Only the barista routes read cookies (the trusted-device session) — see
  // middleware/requireBaristaAuth.ts. Mounted globally because it's cheap
  // and stateless, not because every route needs it.
  app.use(cookieParser());
  app.use(generalRateLimit);

  // Unversioned — this is what the ALB target group / ECS health check hits.
  app.use('/health', healthRouter);

  app.use(
    '/api/v1',
    createV1Router({
      db,
      authService,
      userService,
      cafeService,
      ratingService,
      membershipService,
      redemptionService,
      baristaService,
      adminCafeService,
      adminDrinkService,
      adminMemberService,
      adminRedemptionService,
      payoutService,
      adminDashboardService,
      addressLookupProvider,
    }),
  );

  app.use(notFound());
  app.use(errorHandler());

  return app;
}
