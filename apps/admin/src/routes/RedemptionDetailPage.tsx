import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { DataState } from '@/components/DataState';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { formatCents, formatDateTime } from '@/lib/format';

/** PRD 9.7: void a redemption (restores the member's credits, removes it from the cafe's payout), with every void recorded (who + reason). */
export function RedemptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ['admin', 'redemptions', id],
    queryFn: () => api.getRedemption(id!),
    enabled: !!id,
  });

  const voidMutation = useMutation({
    mutationFn: () => api.voidRedemption(id!, reason),
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'redemptions', id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to void'),
  });

  return (
    <div>
      <Link to="/redemptions" className="text-sm text-slate-500 hover:underline">
        ← Redemptions
      </Link>

      <DataState isLoading={isLoading} error={loadError} isEmpty={false}>
        {data && (
          <div className="mt-4 space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-medium">
                {data.drinkName} at {data.cafeName}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Detail label="Member" value={`${data.memberDisplayName} (${data.memberEmail})`} />
                <Detail label="Credits deducted" value={String(data.creditAmount)} />
                <Detail label="Payout rate" value={`${formatCents(data.payoutRateCents)}/credit`} />
                <Detail label="Payout amount" value={formatCents(data.payoutAmountCents)} />
                <Detail label="Redeemed at" value={formatDateTime(data.redeemedAt)} />
                <Detail label="Status" value={data.voided ? 'Voided' : 'Completed'} />
              </dl>
            </div>

            {data.voided ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">This redemption was voided.</p>
                <p className="mt-1">
                  {data.voidReason} — {data.voidedAt && formatDateTime(data.voidedAt)}
                </p>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);
                  voidMutation.mutate();
                }}
                className="rounded-lg border border-red-200 bg-white p-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">Void this redemption</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Restores the member&apos;s credit and removes this redemption from the cafe&apos;s
                  payout. The original record stays visible for audit; this action cannot be undone.
                </p>
                <label className="mt-3 block text-sm">
                  <span className="font-medium text-slate-700">Reason (required)</span>
                  <textarea
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                {error && (
                  <p className="mt-2 text-sm text-red-700" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={voidMutation.isPending}
                  className="mt-3 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {voidMutation.isPending ? 'Voiding…' : 'Void redemption'}
                </button>
              </form>
            )}
          </div>
        )}
      </DataState>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}
