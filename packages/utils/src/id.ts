/**
 * Uses the platform-global Web Crypto API rather than `node:crypto` so this
 * function works unmodified in both server (Node 19+) and browser bundles.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Short id suitable for correlation/request ids in logs (not a security token). */
export function generateShortId(): string {
  return crypto.randomUUID().split('-')[0]!;
}
