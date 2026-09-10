import { describe, expect, it } from 'vitest';

import { passwordResetEmail } from '../services/email/templates/passwordResetEmail.js';
import { verificationEmail } from '../services/email/templates/verificationEmail.js';

describe('verificationEmail', () => {
  const verifyUrl = 'https://socialcup.app/verify-email?token=abc123def456';

  it('has the expected subject line', () => {
    const email = verificationEmail({ to: 'ada@example.com', displayName: 'Ada', verifyUrl });
    expect(email.subject).toBe('Verify your Social Cup email');
  });

  it('renders the verify link as a real anchor with the verification URL as its href', () => {
    const email = verificationEmail({ to: 'ada@example.com', displayName: 'Ada', verifyUrl });

    const hrefMatch = email.html.match(/<a[^>]+href="([^"]+)"[^>]*>Verify my email<\/a>/);
    expect(hrefMatch).not.toBeNull();
    expect(hrefMatch![1]).toBe(verifyUrl);
  });

  it('includes the full verification URL in the plain-text fallback', () => {
    const email = verificationEmail({ to: 'ada@example.com', displayName: 'Ada', verifyUrl });

    expect(email.text).toContain(verifyUrl);
  });
});

describe('passwordResetEmail', () => {
  const resetUrl = 'https://socialcup.app/reset-password?token=abc123def456';

  it('has the expected subject line', () => {
    const email = passwordResetEmail({ to: 'ada@example.com', displayName: 'Ada', resetUrl });
    expect(email.subject).toBe('Reset your Social Cup password');
  });

  it('renders the reset link as a real anchor with the reset URL as its href', () => {
    const email = passwordResetEmail({ to: 'ada@example.com', displayName: 'Ada', resetUrl });

    const hrefMatch = email.html.match(/<a[^>]+href="([^"]+)"[^>]*>Reset my password<\/a>/);
    expect(hrefMatch).not.toBeNull();
    expect(hrefMatch![1]).toBe(resetUrl);
  });

  it('includes the full reset URL in the plain-text fallback', () => {
    const email = passwordResetEmail({ to: 'ada@example.com', displayName: 'Ada', resetUrl });

    expect(email.text).toContain(resetUrl);
  });
});
