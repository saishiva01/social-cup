import type { MembershipStatusResult } from '@social-cup/types';
import { useStripe } from '@stripe/stripe-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { STRIPE_MERCHANT_COUNTRY_CODE } from '@/lib/stripe-config';

const MEMBERSHIP_QUERY_KEY = ['membership'];

/**
 * A PaymentSheet success does not itself mean the backend has activated the
 * membership — only the verified Stripe webhook does that (ADR-0005). This
 * is a short, bounded refresh — not an indefinite poll — while the webhook
 * catches up; if it hasn't landed by the last attempt, the screen just shows
 * whatever the server currently reports (the user can pull to refresh, or
 * simply reopen the screen later).
 */
const ACTIVATION_POLL_DELAYS_MS = [1200, 1800, 2500, 3500];

/**
 * Membership screen (PRD Module 7). Price/credits/credit-value are server-
 * confirmed facts, not client assumptions — the plan text below is fixed
 * copy (ADR-0009: $24.99/mo, 30 credits, 1 credit = $1, all fixed for Phase
 * 1), but every account-state-dependent decision (are they a member, do they
 * have credits, is payment failing) comes from GET /membership.
 */
export default function MembershipScreen() {
  const { status, getMembership, subscribeMembership, createBillingPortalSession } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const membershipQuery = useQuery({
    queryKey: MEMBERSHIP_QUERY_KEY,
    queryFn: () => getMembership(),
    enabled: status === 'authenticated',
  });

  async function handleSubscribe() {
    if (subscribing) return;
    setSubscribing(true);
    setSubscribeError(null);
    try {
      const { paymentIntentClientSecret, ephemeralKeySecret, customerId } =
        await subscribeMembership();

      const init = await initPaymentSheet({
        merchantDisplayName: 'Social Cup',
        customerId,
        customerEphemeralKeySecret: ephemeralKeySecret,
        paymentIntentClientSecret,
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: STRIPE_MERCHANT_COUNTRY_CODE },
        googlePay: { merchantCountryCode: STRIPE_MERCHANT_COUNTRY_CODE, testEnv: __DEV__ },
        returnURL: 'socialcup://stripe-redirect',
      });
      if (init.error) {
        setSubscribeError(init.error.message);
        return;
      }

      const presented = await presentPaymentSheet();
      if (presented.error) {
        // "Canceled" is the member backing out of PaymentSheet themselves —
        // not a failure worth an error message.
        if (presented.error.code !== 'Canceled') {
          setSubscribeError(presented.error.message);
        }
        return;
      }

      setActivating(true);
      for (const delayMs of ACTIVATION_POLL_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const result = await getMembership();
        queryClient.setQueryData(MEMBERSHIP_QUERY_KEY, result);
        if (result.isMember) break;
      }
    } catch (err) {
      setSubscribeError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setActivating(false);
      setSubscribing(false);
    }
  }

  async function handleManageBilling() {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      const { url } = await createBillingPortalSession();
      await openBrowserAsync(url);
    } catch (err) {
      setPortalError(
        err instanceof ApiError ? err.message : 'Could not open billing management right now.',
      );
    } finally {
      setPortalBusy(false);
    }
  }

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  if (membershipQuery.isLoading) {
    return (
      <ScreenContainer header center>
        <ActivityIndicator size="large" color={theme.primary} testID="membership-loading" />
      </ScreenContainer>
    );
  }

  if (membershipQuery.isError || !membershipQuery.data) {
    return (
      <ScreenContainer header center>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load your membership"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void membershipQuery.refetch()}
          testID="membership-error"
        />
      </ScreenContainer>
    );
  }

  const membership = membershipQuery.data;

  return (
    <ScreenContainer header center={false}>
      <ThemedText type="subtitle">Social Cup Membership</ThemedText>

      <PlanSummary />

      {membership.status === 'past_due' ? (
        <PastDueNotice onManageBilling={handleManageBilling} busy={portalBusy} />
      ) : membership.isMember ? (
        <ActiveMembership
          membership={membership}
          onManageBilling={handleManageBilling}
          busy={portalBusy}
        />
      ) : (
        <NotMember
          membership={membership}
          onSubscribe={handleSubscribe}
          busy={subscribing}
          activating={activating}
        />
      )}

      {subscribeError ? (
        <StatusMessage variant="error" testID="membership-subscribe-error">
          {subscribeError}
        </StatusMessage>
      ) : null}
      {portalError ? (
        <StatusMessage variant="error" testID="membership-portal-error">
          {portalError}
        </StatusMessage>
      ) : null}
    </ScreenContainer>
  );
}

function PlanSummary() {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface }]}
      testID="membership-plan-summary"
    >
      <ThemedText type="heading">$24.99/month</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        30 drink credits every month, no rollover — 1 credit is always worth $1 at any partner café.
      </ThemedText>
    </View>
  );
}

function NotMember({
  membership,
  onSubscribe,
  busy,
  activating,
}: {
  membership: MembershipStatusResult;
  onSubscribe: () => void;
  busy: boolean;
  activating: boolean;
}) {
  return (
    <View style={styles.section} testID="membership-not-member">
      {membership.status === 'canceled' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Your membership has ended. Subscribe again any time to pick up right where you left off.
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Subscribe to start redeeming drinks at every partner café.
        </ThemedText>
      )}
      {activating ? (
        <ThemedText type="small" themeColor="textSecondary" testID="membership-activating">
          Activating your membership…
        </ThemedText>
      ) : null}
      <PrimaryButton
        label="Subscribe"
        busy={busy}
        onPress={onSubscribe}
        testID="membership-subscribe"
      />
    </View>
  );
}

function PastDueNotice({ onManageBilling, busy }: { onManageBilling: () => void; busy: boolean }) {
  return (
    <View style={styles.section} testID="membership-past-due">
      <StatusMessage variant="error">
        Your last payment failed. Update your card to keep your membership active.
      </StatusMessage>
      <PrimaryButton
        label="Update payment method"
        busy={busy}
        onPress={onManageBilling}
        testID="membership-update-card"
      />
    </View>
  );
}

function ActiveMembership({
  membership,
  onManageBilling,
  busy,
}: {
  membership: MembershipStatusResult;
  onManageBilling: () => void;
  busy: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section} testID="membership-active">
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ThemedText type="smallBold" themeColor="success">
          Active membership
        </ThemedText>
        <ThemedText type="default" testID="membership-credits">
          {membership.credits} {membership.credits === 1 ? 'credit' : 'credits'} available
        </ThemedText>
        {membership.currentPeriodEnd ? (
          <ThemedText type="small" themeColor="textSecondary">
            {membership.cancelAtPeriodEnd
              ? `Membership ends ${formatDate(membership.currentPeriodEnd)}`
              : `Renews ${formatDate(membership.currentPeriodEnd)}`}
          </ThemedText>
        ) : null}
      </View>
      <PrimaryButton
        label="Manage billing"
        variant="secondary"
        busy={busy}
        onPress={onManageBilling}
        testID="membership-manage-billing"
      />
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
