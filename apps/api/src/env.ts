import { parseEnv } from '@social-cup/validation';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database (validated again inside @social-cup/database; duplicated here so
  // the API fails at startup, before it ever tries to open a connection).
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  // Comma-separated list of allowed browser origins (admin panel, barista
  // scan page, and — during development — the Expo dev server / web preview).
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  // Auth token signing (foundation only — see docs/architecture/authentication.md).
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),

  // .env.example documents SENTRY_DSN as blank locally ("optional locally;
  // required in staging/production"), and dotenv turns `SENTRY_DSN=` into
  // an empty string rather than an absent key — z.string().url().optional()
  // rejects that empty string, so an empty value must be treated the same
  // as an absent one.
  SENTRY_DSN: z.union([z.string().url(), z.literal('').transform(() => undefined)]).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Transactional email (verification, password reset). One SMTP transport
  // for every environment — MailDev locally (no auth), Amazon SES's SMTP
  // interface in staging/production (see docs/architecture/authentication.md)
  // — so no provider-specific code lives in the auth routes.
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('Social Cup <no-reply@socialcup.app>'),

  // Deep-link prefixes for the verification/reset links embedded in emails.
  // Defaults target the socialcup:// scheme (production mobile app); local
  // Expo Go development needs exp://<host>:<port>/--/verify-email?token= —
  // see apps/api/.env.example.
  EMAIL_VERIFICATION_URL_PREFIX: z.string().min(1).default('socialcup://verify-email?token='),
  PASSWORD_RESET_URL_PREFIX: z.string().min(1).default('socialcup://reset-password?token='),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Validates process.env once and caches the result. Called at process
 * startup (see src/index.ts) so a misconfigured environment fails fast with
 * every missing/invalid variable listed, instead of failing later and
 * confusingly at first use.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cachedEnv ??= parseEnv(envSchema, source);
  return cachedEnv;
}

/** For tests only: forces the next loadEnv() call to re-parse. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
