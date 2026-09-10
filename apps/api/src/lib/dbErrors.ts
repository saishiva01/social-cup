/**
 * postgres.js error code for a unique-constraint violation. Used to detect a
 * concurrent-insert race atomically — the DB constraint is the authority, not
 * a read-then-write check that two concurrent requests could both pass (see
 * authService's registration flow and membershipService's Stripe-customer
 * creation for the two current callers).
 */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  // Drizzle wraps the underlying PostgresError in a DrizzleQueryError — the
  // Postgres code is on .cause, not on the outer error.
  const code =
    (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  return code === UNIQUE_VIOLATION;
}
