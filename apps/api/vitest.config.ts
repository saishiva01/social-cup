import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The DB-backed integration suites (auth, profile) share a single test
    // database and truncate it in beforeEach — running files in parallel
    // would let one file's truncate wipe the other's rows mid-test. The
    // whole apps/api suite is small; serial is the correct tradeoff.
    fileParallelism: false,
  },
});
