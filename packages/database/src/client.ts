import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import { loadDatabaseEnv } from './env.js';
import * as schema from './schema/index.js';

// Re-exported so consumers (e.g. apps/api) can reference the client type
// without needing 'postgres' as a direct dependency of their own.
export type { Sql } from 'postgres';

/** The typed Drizzle query builder over the full schema. */
export type DB = PostgresJsDatabase<typeof schema>;

/**
 * Opens a raw postgres.js client without binding it to the environment. Used
 * by apps/api's DB-backed integration tests to target a dedicated test
 * database — keeps the `postgres` driver dependency inside this package.
 */
export function createRawClient(url: string): Sql {
  return postgres(url, { max: 5 });
}

/**
 * Builds the typed Drizzle query builder over an existing raw `postgres`
 * client. Used by apps/api to construct its db handle from the client
 * injected into createApp() (which is a plain Sql in tests, not one created
 * via createDatabase()).
 */
export function createDrizzle(client: Sql): DB {
  return drizzle(client, { schema });
}

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

  const db = createDrizzle(client);

  return { db, client, close: () => client.end({ timeout: 5 }) };
}
