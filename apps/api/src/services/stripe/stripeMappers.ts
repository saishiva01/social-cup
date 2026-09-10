import type Stripe from 'stripe';

/**
 * The four membership states the product actually distinguishes (PRD 7.3,
 * 7.4; ADR-0008's Redeem-button behavior). Stripe's own subscription status
 * enum is richer (`trialing`, `paused`, `incomplete_expired`, `unpaid`, ...)
 * — Social Cup has no trial and no pause feature, so those collapse into the
 * nearest state below rather than being modeled 1:1. This is the only place
 * that mapping happens; nothing else in the codebase should branch on a raw
 * Stripe subscription status string.
 */
export type MembershipStatus = 'incomplete' | 'active' | 'past_due' | 'canceled';

export function normalizeSubscriptionStatus(status: Stripe.Subscription.Status): MembershipStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    case 'incomplete':
    case 'paused':
    default:
      return 'incomplete';
  }
}

/** A Stripe subscription always has exactly one item for Social Cup's one-plan model (ADR: no multi-item subscriptions). */
export function subscriptionPeriod(subscription: Stripe.Subscription): {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
} {
  const item = subscription.items.data[0];
  if (!item) {
    throw new Error(
      `Subscription ${subscription.id} has no items — cannot determine its billing period`,
    );
  }
  return {
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  };
}
