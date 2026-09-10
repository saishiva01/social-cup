import type { CreateRedemptionResult } from '@social-cup/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenContainer } from '@/components/screen-container';
import { StatusMessage } from '@/components/status-message';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

/**
 * Redemption (PRD Module 8): confirm the drink and credit cost, generate the
 * five-minute code, show it (plus the six-digit backup) to present to the
 * barista, and wait for the server-confirmed result. The server is the only
 * source of truth throughout — this screen never marks itself "redeemed"
 * from anything other than a polled GET /redemptions/:id response, and
 * never deducts credits locally (docs/architecture/redemption.md).
 */
export default function RedeemScreen() {
  const { drinkId, drinkName, cafeId, cafeName, creditPrice } = useLocalSearchParams<{
    drinkId: string;
    drinkName?: string;
    cafeId: string;
    cafeName?: string;
    creditPrice?: string;
  }>();
  const { getMembership, createRedemption, getRedemptionStatus } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();

  const [redemption, setRedemption] = useState<CreateRedemptionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const membershipQuery = useQuery({ queryKey: ['membership'], queryFn: () => getMembership() });

  const statusQuery = useQuery({
    queryKey: ['redemptions', redemption?.id],
    queryFn: () => getRedemptionStatus(redemption!.id),
    enabled: Boolean(redemption),
    // The countdown itself is client-side only; this polling is what
    // actually finds out whether the barista scanned it — the mobile UI is
    // never the source of truth for "redeemed."
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 2000 : false),
  });

  const status = statusQuery.data?.status;

  useEffect(() => {
    if (status === 'redeemed') {
      void queryClient.invalidateQueries({ queryKey: ['membership'] });
    }
  }, [status, queryClient]);

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createRedemption(cafeId, drinkId);
      setRedemption(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start redemption.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'redeemed') {
    return (
      <ScreenContainer header center>
        <ThemedText type="subtitle" style={styles.centered}>
          Redeemed!
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          Enjoy your {drinkName ?? 'drink'}.
        </ThemedText>
        <View style={styles.doneActions}>
          <PrimaryButton
            label="Rate this drink"
            onPress={() =>
              router.replace({
                pathname: '/rate/[drinkId]',
                params: { drinkId, drinkName, cafeName },
              })
            }
            testID="redeem-rate-drink"
          />
          <PrimaryButton
            label="Back to café"
            variant="secondary"
            onPress={() => router.back()}
            testID="redeem-back"
          />
        </View>
      </ScreenContainer>
    );
  }

  if (status === 'expired' || status === 'canceled') {
    return (
      <ScreenContainer header center>
        <ThemedText type="subtitle" style={styles.centered}>
          {status === 'expired' ? 'Code expired' : 'Code no longer valid'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          No credits were used. Generate a new code when you&apos;re ready to redeem.
        </ThemedText>
        <PrimaryButton
          label="Generate a new code"
          busy={busy}
          onPress={() => {
            setRedemption(null);
            void handleGenerate();
          }}
          testID="redeem-retry"
        />
      </ScreenContainer>
    );
  }

  if (redemption) {
    return (
      <ScreenContainer header center>
        <ThemedText type="subtitle" style={styles.centered}>
          Show this to your barista
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {redemption.drinkName} at {redemption.cafeName}
        </ThemedText>

        <View style={[styles.codeBox, { borderColor: theme.border }]}>
          <ThemedText type="code" style={styles.codeText} testID="redeem-code">
            {redemption.code}
          </ThemedText>
        </View>

        <CountdownLabel expiresAt={redemption.expiresAt} />

        <View style={styles.backupRow}>
          <ThemedText type="small" themeColor="textMuted">
            Camera not working? Backup code:
          </ThemedText>
          <ThemedText type="smallBold" testID="redeem-backup-code">
            {redemption.backupCode}
          </ThemedText>
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          Waiting for the barista to scan your code…
        </ThemedText>
      </ScreenContainer>
    );
  }

  const membership = membershipQuery.data;
  const cost = creditPrice ? Number(creditPrice) : null;

  return (
    <ScreenContainer header center>
      <ThemedText type="subtitle" style={styles.centered}>
        Confirm redemption
      </ThemedText>

      <View style={styles.context}>
        <ThemedText type="smallBold">{drinkName ?? 'This drink'}</ThemedText>
        {cafeName ? (
          <ThemedText type="small" themeColor="textSecondary">
            {cafeName}
          </ThemedText>
        ) : null}
      </View>

      {cost !== null ? (
        <ThemedText type="small" themeColor="primary">
          {cost} {cost === 1 ? 'credit' : 'credits'}
          {membership ? ` · ${membership.credits} available now` : ''}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textMuted" style={styles.centered}>
        Your credits are not deducted until a barista scans your code at the counter.
      </ThemedText>

      {error ? (
        <StatusMessage variant="error" testID="redeem-error">
          {error}
        </StatusMessage>
      ) : null}

      <PrimaryButton
        label="Generate code"
        busy={busy}
        onPress={handleGenerate}
        testID="redeem-generate"
      />
    </ScreenContainer>
  );
}

/** Client-side-only countdown (docs/architecture/redemption.md: informational, never authoritative — the server rejects an expired code regardless). */
function CountdownLabel({ expiresAt }: { expiresAt: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(expiresAt));

  useEffect(() => {
    const interval = setInterval(() => setSecondsLeft(secondsUntil(expiresAt)), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(Math.max(0, secondsLeft) / 60);
  const seconds = Math.max(0, secondsLeft) % 60;

  return (
    <ThemedText
      type="smallBold"
      themeColor={secondsLeft <= 30 ? 'error' : 'textSecondary'}
      testID="redeem-countdown"
    >
      {minutes}:{seconds.toString().padStart(2, '0')}
    </ThemedText>
  );
}

function secondsUntil(isoDate: string): number {
  return Math.round((new Date(isoDate).getTime() - Date.now()) / 1000);
}

const styles = StyleSheet.create({
  context: {
    gap: 2,
    alignItems: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  doneActions: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  codeText: {
    fontSize: 26,
    letterSpacing: 2,
    textAlign: 'center',
  },
  backupRow: {
    alignItems: 'center',
    gap: 2,
  },
});
