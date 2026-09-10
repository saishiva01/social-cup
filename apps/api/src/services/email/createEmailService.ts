import type { Env } from '../../env.js';
import type { EmailService } from './EmailService.js';
import { ResendEmailService } from './ResendEmailService.js';
import { SmtpEmailService } from './SmtpEmailService.js';

/**
 * Selects the EmailService implementation from EMAIL_PROVIDER. This is the
 * only place that knows both implementations exist — routes/services depend
 * only on the EmailService interface (see EmailService.ts).
 */
export function createEmailService(env: Pick<Env, 'EMAIL_PROVIDER'>): EmailService {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      return new ResendEmailService();
    case 'maildev':
      return new SmtpEmailService();
  }
}
