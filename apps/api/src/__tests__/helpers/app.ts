import type { Express } from 'express';
import type { Sql } from '@social-cup/database';

import type { EmailService, SendEmailParams } from '../../services/email/EmailService.js';

/**
 * Captures every email the services try to send so tests can assert
 * recipient/subject/body without touching the network (tests must never
 * send real email — see docs/development/testing-strategy.md).
 */
export class RecordingEmailService implements EmailService {
  sent: SendEmailParams[] = [];

  async send(params: SendEmailParams): Promise<void> {
    this.sent.push(params);
  }

  reset(): void {
    this.sent = [];
  }
}

/**
 * Builds a fresh app instance with the recording email service. createApp is
 * imported lazily (never statically) so env stubs set by the caller are in
 * place before loadEnv() caches its first parse. A fresh app per test also
 * isolates the per-endpoint rate-limit counters (see
 * apps/api/src/middleware/rateLimit.ts).
 */
export async function makeTestApp(client: Sql, emails: RecordingEmailService): Promise<Express> {
  const { createApp } = await import('../../app.js');
  return createApp({ client, emailService: emails });
}
