import { beforeAll, describe, expect, it, vi } from 'vitest';

import type * as passwordLib from '../lib/password.js';
import type * as tokenLib from '../lib/tokens.js';

vi.stubEnv('ACCESS_TOKEN_SECRET', 'a'.repeat(32));
vi.stubEnv('REFRESH_TOKEN_SECRET', 'b'.repeat(32));
vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/db');
vi.stubEnv('DATABASE_SSL', 'false');
vi.stubEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173');
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
vi.stubEnv('STRIPE_PRICE_ID', 'price_test_fake');

describe('password hashing', () => {
  let hashPassword: typeof passwordLib.hashPassword;
  let verifyPassword: typeof passwordLib.verifyPassword;

  beforeAll(async () => {
    ({ hashPassword, verifyPassword } = await import('../lib/password.js'));
  });

  it('never stores the plaintext and verifies correctly', async () => {
    const hash = await hashPassword('correct-horse');
    expect(hash).not.toContain('correct-horse');
    expect(hash).toMatch(/^\$2[aby]\$/);
    await expect(verifyPassword('correct-horse', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-horse', hash)).resolves.toBe(false);
  });

  it('produces a different hash for the same password (salted)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
  });
});

describe('token primitives', () => {
  let tokens: typeof tokenLib;

  beforeAll(async () => {
    tokens = await import('../lib/tokens.js');
  });

  it('generates high-entropy opaque tokens', () => {
    const token = tokens.generateOpaqueToken();
    expect(token).toHaveLength(64); // 32 random bytes, hex-encoded
    expect(tokens.generateOpaqueToken()).not.toBe(token);
  });

  it('stores tokens only as a deterministic hash — never the raw value', () => {
    const raw = tokens.generateOpaqueToken();
    const hash = tokens.hashToken(raw);
    expect(hash).not.toContain(raw);
    expect(tokens.hashToken(raw)).toBe(hash);
  });

  it('round-trips a signed access token and rejects tampering', () => {
    const signed = tokens.signAccessToken({ sub: 'user-1', email: 'ada@example.com' });
    const payload = tokens.verifyAccessToken(signed);
    expect(payload).toEqual({ sub: 'user-1', email: 'ada@example.com' });

    expect(tokens.verifyAccessToken('tampered')).toBeNull();
    const [, signature] = signed.split('.');
    const tampered = `${signed.split('.')[0]}.${signed.split('.')[1]}.${signature === 'x' ? 'y' : 'x'}`;
    expect(tokens.verifyAccessToken(tampered)).toBeNull();
  });
});
