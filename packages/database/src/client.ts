import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { loadDatabaseEnv } from './env.js';
import * as schema from './schema/index.js';

// Re-exported so consumers (e.g. apps/api) can reference the client type
// without needing 'postgres' as a direct dependency of their own.
export type { Sql } from 'postgres';

export type Database = ReturnType<typeof createDatabase>;

/**
 * Creates a new Drizzle database client backed by a `postgres` connection
 * pool. Callers own the client's lifetime and should call `client.close()`
 * during graceful shutdown (see apps/api's shutdown handler).
 */
export function createDatabase(env: NodeJS.ProcessEnv = process.env) {
  const { DATABASE_URL, DATABASE_SSL } = loadDatabaseEnv(env);

  const client = postgres(DATABASE_URL, {
    ssl: DATABASE_SSL ? 'require' : false,
    max: 10,
  });

  const db = drizzle(client, { schema });

  return { db, client, close: () => client.end({ timeout: 5 }) };
}
