import type { SendEmailParams } from '../EmailService.js';

export function passwordResetEmail(params: {
  to: string;
  displayName: string;
  resetUrl: string;
}): SendEmailParams {
  const { to, displayName, resetUrl } = params;
  return {
    to,
    subject: 'Reset your Social Cup password',
    text: `Hi ${displayName},\n\nWe received a request to reset your Social Cup password. Choose a new password here:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.`,
    html: `
      <p>Hi ${displayName},</p>
      <p>We received a request to reset your Social Cup password.</p>
      <p><a href="${resetUrl}">Reset my password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.</p>
    `.trim(),
  };
}
