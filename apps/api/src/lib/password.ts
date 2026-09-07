import bcrypt from 'bcrypt';

// Cost factor 12 is a reasonable balance for an interactive login path in
// 2026 hardware terms — see OWASP's current bcrypt guidance.
const SALT_ROUNDS = 12;

export function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export function verifyPassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
