import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseEnv } from '../env.js';

describe('parseEnv', () => {
  const schema = z.object({
    PORT: z.coerce.number().int().positive(),
    NAME: z.string().min(1),
  });

  it('parses and coerces valid environment variables', () => {
    const result = parseEnv(schema, { PORT: '3000', NAME: 'social-cup' });
    expect(result).toEqual({ PORT: 3000, NAME: 'social-cup' });
  });

  it('throws a single error listing every invalid/missing variable', () => {
    expect(() => parseEnv(schema, { PORT: 'not-a-number' })).toThrowError(/PORT/);
  });
});
