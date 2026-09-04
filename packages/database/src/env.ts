import { parseEnv } from '@social-cup/validation';
import { z } from 'zod';

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgres', {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
  }),
  // RDS in staging/production requires TLS; local Docker Postgres does not.
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

export function loadDatabaseEnv(source: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  return parseEnv(databaseEnvSchema, source);
}
