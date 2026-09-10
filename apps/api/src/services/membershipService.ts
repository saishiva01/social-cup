import type { DB } from '@social-cup/database';
import { schema } from '@social-cup/database';
import type {
  BillingPortalResult,
  MembershipStatusResult,
  StartSubscriptionResult,
} from '@social-cup/types';
import { eq } from 'drizzle-orm';

import { getCreditBalance } from '../domain/creditLedger.js';
import { ConflictError } from '../errors/AppError.js';
import { isUniqueViolation } from '../lib/dbErrors.js';
import type { StripeService } from './stripe/StripeService.js';
import { normalizeSubscriptionStatus } from './stripe/stripeMappers.js';

const { memberships } = schema;

type MembershipRow = typeof memberships.$inferSelect;

export interface MembershipService {
  getStatus(userId: string): Promise<MembershipStatusResult>;
  startSubscription(input: {
    userId: string;
    email: string;
    displayName: string;
  }): Promise<StartSubscriptionResult>;
  createBillingPortalSession(userId: string): Promise<BillingPortalResult>;
}

async function getMembership(db: DB, userId: string): Promise<MembershipRow | undefined> {
  const [row] = await db.select().from(memberships).where(eq(memberships.userId, userId));
  return row;
}

/**
 * Membership status reads and the Stripe-facing side of subscribing/billing
 * management (PRD Module 7). Every method takes userId from the verified
 * access token, never the request body, so a client can never read or act on
 * another account's membership (ownership is enforced here, not just at the
 * route layer). State-changing Stripe events (webhook-driven grants,
 * activation, cancellation) are handled by stripeWebhookService — this
 * service only ever reads Stripe/membership state or kicks off a new
 * subscription/portal session.
 */
export function createMembershipService(deps: {
  db: DB;
  stripeService: StripeService;
  priceId: string;
}): MembershipService {
  const { db, stripeService, priceId } = deps;

  /**
   * Every user gets at most one Stripe customer, ever. Recoverable if the
   * Stripe call succeeds but the local insert fails or races with a
   * concurrent request (section 7): the unique constraint on `userId` is the
   * actual guarantee, not this read-then-write, which only avoids the
   * common case of an extra Stripe API call.
   */
  async function getOrCreateCustomerId(input: {
    userId: string;
    email: string;
    displayName: string;
  }): Promise<string> {
    const existing = await getMembership(db, input.userId);
    if (existing) return existing.stripeCustomerId;

    const customer = await stripeService.createCustomer({
      email: input.email,
      name: input.displayName,
      userId: input.userId,
    });

    try {
      await db.insert(memberships).values({ userId: input.userId, stripeCustomerId: customer.id });
      return customer.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Lost the race — another request already created the row first. The
      // Stripe customer just created here is an orphan (acceptable, rare);
      // the row that won is the one everything else uses from now on.
      const winner = await getMembership(db, input.userId);
      return winner!.stripeCustomerId;
    }
  }

  return {
    async getStatus(userId) {
      const membership = await getMembership(db, userId);
      if (!membership) {
        return {
          isMember: false,
          status: 'incomplete',
          credits: 0,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }

      const credits = await getCreditBalance(db, userId, membership.currentPeriodEnd);
      return {
        isMember: membership.status === 'active',
        status: membership.status as MembershipStatusResult['status'],
        credits,
        currentPeriodEnd: membership.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      };
    },

    async startSubscription({ userId, email, displayName }) {
      const customerId = await getOrCreateCustomerId({ userId, email, displayName });
      const membership = await getMembership(db, userId);

      if (membership?.status === 'active') {
        throw new ConflictError('You already have an active Social Cup membership.');
      }

      // Resume an existing not-yet-paid subscription (e.g. the app was
      // closed mid-checkout) instead of creating a second one in Stripe —
      // repeated subscribe calls must not create duplicate subscriptions.
      if (membership?.stripeSubscriptionId && membership.status === 'incomplete') {
        const existing = await stripeService.retrieveSubscription(membership.stripeSubscriptionId);
        if (existing.status !== 'canceled' && existing.status !== 'incomplete_expired') {
          if (!existing.latestInvoicePaymentIntentClientSecret) {
            throw new ConflictError('Your membership setup is already being processed.');
          }
          return {
            paymentIntentClientSecret: existing.latestInvoicePaymentIntentClientSecret,
            ephemeralKeySecret: (await stripeService.createEphemeralKey(customerId)).secret,
            customerId,
            subscriptionId: existing.id,
          };
        }
      }

      const subscription = await stripeService.createSubscription({ customerId, priceId, userId });
      if (!subscription.latestInvoicePaymentIntentClientSecret) {
        throw new Error(
          `Stripe subscription ${subscription.id} was created without a payment intent`,
        );
      }

      // getOrCreateCustomerId guarantees a membership row already exists by
      // this point — a plain update, not an upsert.
      await db
        .update(memberships)
        .set({
          stripeSubscriptionId: subscription.id,
          status: normalizeSubscriptionStatus(subscription.status),
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          updatedAt: new Date(),
        })
        .where(eq(memberships.userId, userId));

      const ephemeralKey = await stripeService.createEphemeralKey(customerId);

      return {
        paymentIntentClientSecret: subscription.latestInvoicePaymentIntentClientSecret,
        ephemeralKeySecret: ephemeralKey.secret,
        customerId,
        subscriptionId: subscription.id,
      };
    },

    async createBillingPortalSession(userId) {
      const membership = await getMembership(db, userId);
      if (!membership) {
        throw new ConflictError('You need to subscribe before you can manage billing.');
      }

      // A custom URL scheme deep link (apps/mobile app.json's `scheme`) —
      // Stripe redirects the in-app browser here once the customer is done
      // in the portal, and the OS hands it back to the app. Server-owned, not
      // client-supplied, so a caller can never redirect the portal elsewhere.
      const RETURN_URL = 'socialcup://profile';

      const session = await stripeService.createBillingPortalSession({
        customerId: membership.stripeCustomerId,
        returnUrl: RETURN_URL,
      });
      return { url: session.url };
    },
  };
}
