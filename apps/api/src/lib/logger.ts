import pino from 'pino';

import { loadEnv } from '../env.js';

const env = loadEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  // Pretty-print in development only; staging/production emit JSON lines
  // for CloudWatch to ingest.
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.accessToken',
      '*.refreshToken',
      '*.token',
    ],
    censor: '[redacted]',
  },
  base: { service: 'social-cup-api' },
});

export type Logger = typeof logger;
