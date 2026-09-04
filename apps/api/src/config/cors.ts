import type { CorsOptions } from 'cors';

import { loadEnv } from '../env.js';

/**
 * Explicit origin allowlist from CORS_ALLOWED_ORIGINS (comma-separated).
 * Never falls back to reflecting the request origin or `*` — the admin
 * panel and barista scan page are known, fixed origins per environment.
 */
export function buildCorsOptions(): CorsOptions {
  const env = loadEnv();
  const allowed = new Set(env.CORS_ALLOWED_ORIGINS);

  return {
    origin(origin, callback) {
      // Same-origin requests, curl, and server-to-server calls have no Origin header.
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86_400,
  };
}
