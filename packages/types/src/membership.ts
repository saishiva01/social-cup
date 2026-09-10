/**
 * DTOs for the Phase 4 membership/credits API surface (PRD Module 7). The
 * server normalizes Stripe's richer subscription-status set down to these
 * four states (see apps/api/src/services/stripe/stripeMappers.ts) — nothing
 * client-side ever branches on a raw Stripe status string.
 */
export type MembershipStatus = 'incomplete' | 'active' | 'past_due' | 'canceled';

/** data payload of GET /api/v1/membership */
export interface MembershipStatusResult {
  isMember: boolean;
  status: MembershipStatus;
  /** Derived from the append-only credit ledger (ADR-0003) — 0 for a Visitor who has never subscribed. */
  credits: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** data payload of POST /api/v1/membership/subscribe */
export interface StartSubscriptionResult {
  paymentIntentClientSecret: string;
  ephemeralKeySecret: string;
  customerId: string;
  subscriptionId: string;
}

/** data payload of POST /api/v1/membership/billing-portal */
export interface BillingPortalResult {
  url: string;
}
