import { describe, expect, it } from 'vitest';

import { addMinutes, isPast } from '../time.js';

describe('addMinutes', () => {
  it('adds minutes to a date', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const result = addMinutes(start, 5);
    expect(result.toISOString()).toBe('2026-01-01T00:05:00.000Z');
  });
});

describe('isPast', () => {
  it('returns true for dates in the past', () => {
    expect(isPast(new Date('2000-01-01'))).toBe(true);
  });

  it('returns false for dates in the future', () => {
    expect(isPast(new Date('2999-01-01'))).toBe(false);
  });
});
