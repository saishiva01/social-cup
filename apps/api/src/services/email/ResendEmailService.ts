import { loadEnv } from '../../env.js';
import { logger } from '../../lib/logger.js';
import type { EmailService, SendEmailParams } from './EmailService.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Resend's HTTP API — the real email provider for staging/production (see
 * docs/architecture/authentication.md). Resend only sends from a domain
 * that's been added and verified in the Resend dashboard; EMAIL_FROM must be
 * an address on that domain or every send fails (see apps/web/README.md).
 */
export class ResendEmailService implements EmailService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const env = loadEnv();
    if (!env.RESEND_API_KEY) {
      // env.ts already requires this when EMAIL_PROVIDER=resend; this guard
      // is only reachable if the service is constructed directly.
      throw new Error('RESEND_API_KEY is required to use ResendEmailService');
    }
    this.apiKey = env.RESEND_API_KEY;
    this.from = env.EMAIL_FROM;
  }

  async send(params: SendEmailParams): Promise<void> {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!response.ok) {
        // Never include the API key or the raw response body (which could
        // echo request content back) in the log.
        logger.error(
          { to: params.to, subject: params.subject, status: response.status },
          'Resend API rejected an email send',
        );
      }
    } catch (err) {
      // Same fire-and-forget contract as SmtpEmailService: a delivery
      // failure is logged, never allowed to fail the request that already
      // completed its account-affecting write.
      logger.error(
        { err, to: params.to, subject: params.subject },
        'Failed to send email via Resend',
      );
    }
  }
}
