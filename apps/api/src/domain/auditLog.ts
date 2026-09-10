import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';

import type { Tx } from './creditLedger.js';

/**
 * The smallest reusable audit trail for the admin mutations root CLAUDE.md
 * calls out by name: payout rate changes, PIN changes, cafe changes, drink
 * pricing changes, and member deactivation (voids and recorded payments
 * already carry their own admin/reason fields inline — see
 * `packages/database/src/schema/adminOps.ts` — and are not also logged here,
 * which would just duplicate the same fact in two tables). `metadata` must
 * never carry a secret (a PIN, a token, a password hash) — only small,
 * non-sensitive before/after context.
 */
export async function recordAuditLog(
  db: DB | Tx,
  entry: {
    adminUserId: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(schema.adminAuditLog).values({
    adminUserId: entry.adminUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata,
  });
}
