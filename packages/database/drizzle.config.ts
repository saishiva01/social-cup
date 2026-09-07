// Must run before process.env is read below — nothing else in this CLI
// entrypoint loads packages/database/.env automatically.
import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env in packages/database (or export it) before running drizzle-kit.',
  );
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
