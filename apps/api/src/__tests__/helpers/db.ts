import { fileURLToPath } from 'node:url';

import type { Sql } from '@social-cup/database';
import { createDrizzle, createRawClient, type DB } from '@social-cup/database';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * DB-backed integration tests connect to a real PostgreSQL instance — the
 * same one the app uses, per docs/development/testing-strategy.md (a mocked
 * ORM cannot prove constraint/index/transaction behavior). The suite is
 * skipped unless TEST_DATABASE_URL is set so `pnpm test` still works on a
 * machine without Docker; local CI/dev runs it with:
 *
 *   TEST_DATABASE_URL=postgres://social_cup:social_cup_dev@localhost:5433/social_cup_test
 *
 * The database must exist and be migrated (or let beforeEach() migrate it —
 * drizzle's migrator is idempotent).
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../../../packages/database/migrations', import.meta.url),
);

export async function setupTestDatabase(
  url: string,
): Promise<{ client: Sql; db: DB; close: () => Promise<void> }> {
  const client = createRawClient(url);
  const db = createDrizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    client,
    db,
    close: () => client.end({ timeout: 5 }),
  };
}

/** Wipes every table so each test starts from a clean, migrated schema. */
export async function truncateAll(client: Sql): Promise<void> {
  await client.unsafe(
    'TRUNCATE TABLE users, email_verification_tokens, password_reset_tokens, refresh_tokens RESTART IDENTITY CASCADE',
  );
}

/** Extracts the raw (un-hashed) token from a verification/reset email URL. */
export function extractTokenFromUrl(url: string): string {
  const token = url.split('token=')[1];
  if (!token) throw new Error(`No token= parameter in URL: ${url}`);
  return token;
}
