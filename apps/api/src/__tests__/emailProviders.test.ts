import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '../env.js';

const BASE_ENV = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  DATABASE_SSL: 'false',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  ACCESS_TOKEN_SECRET: 'a'.repeat(32),
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
  EMAIL_PROVIDER: 'maildev',
  RESEND_API_KEY: '',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  STRIPE_PRICE_ID: 'price_test_fake',
};

// Every module under test is imported lazily (never statically) — several of
// them (via lib/logger.js) call loadEnv() at module top level, and that must
// run only after this file's env stubs are in place. See the identical
// pattern/comment in __tests__/helpers/db.ts.
async function importEmailModules() {
  const { createEmailService } = await import('../services/email/createEmailService.js');
  const { ResendEmailService } = await import('../services/email/ResendEmailService.js');
  const { SmtpEmailService } = await import('../services/email/SmtpEmailService.js');
  return { createEmailService, ResendEmailService, SmtpEmailService };
}

beforeEach(() => {
  resetEnvCache();
  for (const [key, value] of Object.entries(BASE_ENV)) {
    vi.stubEnv(key, value);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('createEmailService', () => {
  it('selects SmtpEmailService for EMAIL_PROVIDER=maildev', async () => {
    const { createEmailService, SmtpEmailService } = await importEmailModules();
    expect(createEmailService({ EMAIL_PROVIDER: 'maildev' })).toBeInstanceOf(SmtpEmailService);
  });

  it('selects ResendEmailService for EMAIL_PROVIDER=resend', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    const { createEmailService, ResendEmailService } = await importEmailModules();
    expect(createEmailService({ EMAIL_PROVIDER: 'resend' })).toBeInstanceOf(ResendEmailService);
  });
});

describe('env validation for email provider selection', () => {
  it('rejects EMAIL_PROVIDER=resend with no RESEND_API_KEY', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', '');

    const { loadEnv } = await import('../env.js');
    expect(() => loadEnv()).toThrow(/RESEND_API_KEY/);
  });

  it('accepts EMAIL_PROVIDER=resend with a RESEND_API_KEY set', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');

    const { loadEnv } = await import('../env.js');
    expect(() => loadEnv()).not.toThrow();
  });

  it('rejects NODE_ENV=production with EMAIL_PROVIDER=maildev', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'maildev');

    const { loadEnv } = await import('../env.js');
    expect(() => loadEnv()).toThrow(/EMAIL_PROVIDER/);
  });

  it('accepts NODE_ENV=production with EMAIL_PROVIDER=resend and a key', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');

    const { loadEnv } = await import('../env.js');
    expect(() => loadEnv()).not.toThrow();
  });
});

describe('ResendEmailService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test_key_should_never_be_logged');
    vi.stubEnv('EMAIL_FROM', 'Social Cup <no-reply@socialcup.app>');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the Resend API with the expected request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { ResendEmailService } = await importEmailModules();
    const service = new ResendEmailService();
    await service.send({
      to: 'ada@example.com',
      subject: 'Verify your Social Cup email',
      html: '<p>hi</p>',
      text: 'hi',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test_key_should_never_be_logged');
    const body = JSON.parse(init.body) as Record<string, string>;
    expect(body).toEqual({
      from: 'Social Cup <no-reply@socialcup.app>',
      to: 'ada@example.com',
      subject: 'Verify your Social Cup email',
      html: '<p>hi</p>',
      text: 'hi',
    });
  });

  it('never logs the Resend API key, even when the send fails', async () => {
    const { logger } = await import('../lib/logger.js');
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const { ResendEmailService } = await importEmailModules();
    const service = new ResendEmailService();
    await service.send({ to: 'ada@example.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' });

    expect(errorSpy).toHaveBeenCalled();
    const loggedArgs = JSON.stringify(errorSpy.mock.calls);
    expect(loggedArgs).not.toContain('re_test_key_should_never_be_logged');
    errorSpy.mockRestore();
  });

  it('logs, but does not throw, when Resend responds with a non-2xx status', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 422 }) as unknown as typeof fetch;

    const { ResendEmailService } = await importEmailModules();
    const service = new ResendEmailService();
    await expect(
      service.send({ to: 'ada@example.com', subject: 'Hi', html: '<p>hi</p>', text: 'hi' }),
    ).resolves.toBeUndefined();
  });
});
