import type { SendEmailParams } from '../EmailService.js';

export function verificationEmail(params: {
  to: string;
  displayName: string;
  verifyUrl: string;
}): SendEmailParams {
  const { to, displayName, verifyUrl } = params;
  return {
    to,
    subject: 'Verify your email for Social Cup',
    text: `Hi ${displayName},\n\nConfirm your email address to finish setting up your Social Cup account:\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create a Social Cup account, you can ignore this email.`,
    html: `
      <p>Hi ${displayName},</p>
      <p>Confirm your email address to finish setting up your Social Cup account.</p>
      <p><a href="${verifyUrl}">Verify my email</a></p>
      <p>This link expires in 24 hours. If you didn't create a Social Cup account, you can ignore this email.</p>
    `.trim(),
  };
}
