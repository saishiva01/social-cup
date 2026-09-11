import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataState } from '@/components/DataState';
import { Detail, DetailGrid } from '@/components/Detail';
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
    refetch,
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
      <Link
        to="/redemptions"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Redemptions
      </Link>

      <div className="mt-3">
        <DataState isLoading={isLoading} error={loadError} isEmpty={false} onRetry={() => void refetch()}>
          {data && (
            <div className="space-y-6">
              <Card
                title={`${data.drinkName} at ${data.cafeName}`}
                action={data.voided ? <Badge tone="danger">Voided</Badge> : <Badge tone="success">Completed</Badge>}
              >
                <DetailGrid>
                  <Detail label="Member">
                    {data.memberDisplayName} ({data.memberEmail})
                  </Detail>
                  <Detail label="Credits deducted">{data.creditAmount}</Detail>
                  <Detail label="Payout rate">{formatCents(data.payoutRateCents)}/credit</Detail>
                  <Detail label="Payout amount">{formatCents(data.payoutAmountCents)}</Detail>
                  <Detail label="Redeemed at">{formatDateTime(data.redeemedAt)}</Detail>
                </DetailGrid>
              </Card>

              {data.voided ? (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium">This redemption was voided.</p>
                    <p className="mt-1">
                      {data.voidReason} — {data.voidedAt && formatDateTime(data.voidedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <Card title="Void this redemption">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setError(null);
                      voidMutation.mutate();
                    }}
                  >
                    <p className="text-xs text-slate-500">
                      Restores the member&apos;s credit and removes this redemption from the cafe&apos;s
                      payout. The original record stays visible for audit; this action cannot be
                      undone.
                    </p>
                    <label className="mt-3 block text-sm">
                      <span className="font-medium text-slate-700">Reason (required)</span>
                      <textarea
                        required
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </label>
                    {error && (
                      <p className="mt-2 text-sm text-red-700" role="alert">
                        {error}
                      </p>
                    )}
                    <Button type="submit" variant="danger" disabled={voidMutation.isPending} className="mt-3">
                      {voidMutation.isPending ? 'Voiding…' : 'Void redemption'}
                    </Button>
                  </form>
                </Card>
              )}
            </div>
          )}
        </DataState>
      </div>
    </div>
  );
}
