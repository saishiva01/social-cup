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
  // scan page, apps/web's verify-email/reset-password pages, and — during
  // development — the Expo dev server / web preview).
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

  // Transactional email (verification, password reset), sent through the
  // EmailService abstraction (apps/api/src/services/email/) — no
  // provider-specific code lives in the auth routes. EMAIL_PROVIDER selects
  // the implementation: `maildev` (SMTP, local dev, see docker-compose.yml)
  // or `resend` (Resend's HTTP API, staging/production).
  EMAIL_PROVIDER: z.enum(['maildev', 'resend']).default('maildev'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('Social Cup <no-reply@socialcup.app>'),

  // Base URL of the public web app (apps/web) that hosts the /verify-email
  // and /reset-password landing pages linked from emails — see
  // docs/architecture/authentication.md. Must be a real https:// origin in
  // staging/production; the local default points at apps/web's dev server.
  APP_WEB_URL: z.string().url().default('http://localhost:5175'),

  // Stripe (PRD Module 7, docs/architecture/payments.md). The secret key and
  // webhook signing secret are real secrets (ADR-0007: AWS Secrets Manager in
  // staging/production, git-ignored .env locally) — never exposed to any
  // client. STRIPE_PRICE_ID is the server-owned price for the one $24.99/mo
  // plan (ADR-0009) — the mobile client never supplies a price or amount.
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_ID: z.string().min(1),
  // The Stripe API version pinned for the ephemeral key issued to the mobile
  // PaymentSheet (Stripe requires this to match the version the client SDK
  // was compiled against, which can differ from this server's own pinned
  // library version) — see docs/architecture/payments.md. Adjustable without
  // a code change if @stripe/stripe-react-native's expected version changes.
  STRIPE_API_VERSION: z.string().min(1).default('2024-06-20'),
});

export type Env = z.infer<typeof envSchema>;

const validatedEnvSchema = envSchema.superRefine((value, ctx) => {
  if (value.EMAIL_PROVIDER === 'resend' && !value.RESEND_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    });
  }
  // A production-like environment that falls back to MailDev would silently
  // stop delivering real user email — fail startup instead.
  if (value.NODE_ENV === 'production' && value.EMAIL_PROVIDER !== 'resend') {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_PROVIDER'],
      message: 'EMAIL_PROVIDER must be "resend" when NODE_ENV=production',
    });
  }
});

let cachedEnv: Env | undefined;

/**
 * Validates process.env once and caches the result. Called at process
 * startup (see src/index.ts) so a misconfigured environment fails fast with
 * every missing/invalid variable listed, instead of failing later and
 * confusingly at first use.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  cachedEnv ??= parseEnv(validatedEnvSchema, source);
  return cachedEnv;
}

/** For tests only: forces the next loadEnv() call to re-parse. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}
