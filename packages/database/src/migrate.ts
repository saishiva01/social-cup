import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabase } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Applies any pending SQL migrations from ./migrations. Run via
 * `pnpm db:migrate`. Safe to run repeatedly — already-applied migrations
 * are tracked in the `drizzle` schema's migrations table and skipped.
 */
async function main() {
  const { db, close } = createDatabase();
  try {
    await migrate(db, { migrationsFolder });
    console.log('Migrations applied successfully.');
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
