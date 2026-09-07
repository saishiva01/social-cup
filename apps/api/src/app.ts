import type { DB } from '@social-cup/database';
import { createDrizzle, type Sql } from '@social-cup/database';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { buildCorsOptions } from './config/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { generalRateLimit } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import healthRouter from './routes/health.js';
import { createV1Router } from './routes/v1/index.js';
import { createAuthService } from './services/authService.js';
import type { EmailService } from './services/email/EmailService.js';
import { SmtpEmailService } from './services/email/SmtpEmailService.js';
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

export function createApp(deps: { client: Sql; emailService?: EmailService }): Express {
  const app = express();

  app.locals.client = deps.client;
  const db = createDrizzle(deps.client);
  app.locals.db = db;

  const emailService = deps.emailService ?? new SmtpEmailService();
  const authService = createAuthService({ db, emailService });
  const userService = createUserService({ db });

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
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(generalRateLimit);

  // Unversioned — this is what the ALB target group / ECS health check hits.
  app.use('/health', healthRouter);

  app.use('/api/v1', createV1Router({ authService, userService }));

  app.use(notFound());
  app.use(errorHandler());

  return app;
}
