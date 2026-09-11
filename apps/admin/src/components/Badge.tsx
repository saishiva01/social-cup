import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-brand-50 text-brand-700',
};

/**
 * The one status-pill primitive. Before this, every enumerable status in
 * the admin panel (membership status, payout status, redemption status,
 * "Featured"/"PIN set") rendered as unstyled plain text — no way to spot a
 * problem row (past_due, unpaid) at a glance in a table (root CLAUDE.md UI
 * audit). Tones are deliberately restrained (tinted background, no border,
 * no icon) — this is a label, not a decoration.
 */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Maps PRD membership states (docs/architecture) to a tone — active is healthy, past_due/incomplete need attention. */
export function membershipStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'past_due':
    case 'incomplete':
      return 'warning';
    case 'canceled':
      return 'neutral';
    case 'visitor':
      return 'info';
    default:
      return 'neutral';
  }
}

/** Maps Module 7.5 payout payment states (PayoutPaymentStatus) to a tone. */
export function paymentStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'recorded':
      return 'success';
    case 'partially_recorded':
      return 'warning';
    case 'unpaid':
      return 'danger';
    default:
      return 'neutral';
  }
}
