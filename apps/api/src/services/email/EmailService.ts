export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Provider-agnostic boundary for transactional email. Routes/services only
 * ever depend on this interface — never on nodemailer or a specific
 * provider directly (see docs/architecture/authentication.md).
 */
export interface EmailService {
  send(params: SendEmailParams): Promise<void>;
}
