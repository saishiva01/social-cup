import nodemailer, { type Transporter } from 'nodemailer';

import { loadEnv } from '../../env.js';
import { logger } from '../../lib/logger.js';
import type { EmailService, SendEmailParams } from './EmailService.js';

/**
 * One SMTP transport for every environment: MailDev locally, Amazon SES's
 * SMTP interface in staging/production — see the note in
 * docs/architecture/authentication.md for why this avoids an AWS SDK
 * dependency entirely.
 */
export class SmtpEmailService implements EmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const env = loadEnv();
    this.from = env.EMAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
    });
  }

  async send(params: SendEmailParams): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
    } catch (err) {
      // Never let a transient SMTP failure fail the request that triggered
      // it (see docs/architecture/authentication.md) — the caller already
      // completed the account-affecting write (e.g. token creation) before
      // sending, so a delivery failure here is logged, not thrown.
      logger.error({ err, to: params.to, subject: params.subject }, 'Failed to send email');
    }
  }
}
