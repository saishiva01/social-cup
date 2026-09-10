import { describe, expect, it } from 'vitest';

import { loadDatabaseEnv } from '../env.js';

describe('loadDatabaseEnv', () => {
  it('accepts a valid postgres connection string and defaults DATABASE_SSL to false', () => {
    const env = loadDatabaseEnv({ DATABASE_URL: 'postgres://user:pass@localhost:5432/db' });
    expect(env.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db');
    expect(env.DATABASE_SSL).toBe(false);
  });

  it('coerces DATABASE_SSL=true to a boolean', () => {
    const env = loadDatabaseEnv({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      DATABASE_SSL: 'true',
    });
    expect(env.DATABASE_SSL).toBe(true);
  });

  it('rejects a non-postgres connection string', () => {
    expect(() =>
      loadDatabaseEnv({ DATABASE_URL: 'mysql://user:pass@localhost:3306/db' }),
    ).toThrow();
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadDatabaseEnv({})).toThrow();
  });
});
