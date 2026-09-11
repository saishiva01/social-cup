import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataState } from '@/components/DataState';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api';
import { formatCents, formatDateTime } from '@/lib/format';

/** PRD Module 9 "Payouts": one cafe's statement for a period, CSV export, and recording a manual payment. */
export function PayoutStatementPage() {
  const { cafeId } = useParams<{ cafeId: string }>();
  const [searchParams] = useSearchParams();
  const periodStart = searchParams.get('periodStart')!;
  const periodEnd = searchParams.get('periodEnd')!;
  const { api } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'payouts', cafeId, periodStart, periodEnd],
    queryFn: () => api.getPayoutStatement(cafeId!, periodStart, periodEnd),
    enabled: !!cafeId && !!periodStart && !!periodEnd,
  });

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadCsv = useMutation({
    mutationFn: () => api.downloadPayoutStatementCsv(cafeId!, periodStart, periodEnd),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (err) => setDownloadError(err instanceof ApiError ? err.message : 'Download failed'),
  });

  return (
    <div>
      <Link
        to="/payouts"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Payouts
      </Link>

      <div className="mt-3">
        <DataState isLoading={isLoading} error={error} isEmpty={false} onRetry={() => void refetch()}>
          {data && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-card">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">{data.cafeName}</h1>
                  <p className="text-sm text-slate-500">
                    {formatDateTime(data.periodStart)} – {formatDateTime(data.periodEnd)}
                  </p>
                </div>
                <div className="text-right">
                  <Button
                    variant="secondary"
                    icon={<Download className="h-4 w-4" />}
                    onClick={() => {
                      setDownloadError(null);
                      downloadCsv.mutate();
                    }}
                    disabled={downloadCsv.isPending}
                  >
                    {downloadCsv.isPending ? 'Preparing…' : 'Download CSV'}
                  </Button>
                  {downloadError && (
                    <p className="mt-1 text-xs text-red-700" role="alert">
                      {downloadError}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard label="Redemptions" value={String(data.totals.redemptionCount)} />
                <StatCard label="Credits" value={String(data.totals.totalCredits)} />
                <StatCard label="Amount owed" value={formatCents(data.totals.totalAmountOwedCents)} />
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-900">Redemptions this period</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Member</th>
                        <th className="px-4 py-2.5">Drink</th>
                        <th className="px-4 py-2.5">Credits</th>
                        <th className="px-4 py-2.5">Payout</th>
                        <th className="px-4 py-2.5">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.redemptions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                            No redemptions in this period.
                          </td>
                        </tr>
                      )}
                      {data.redemptions.map((row) => (
                        <tr key={row.redemptionId} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2.5">{row.memberDisplayName}</td>
                          <td className="px-4 py-2.5 text-slate-600">{row.drinkName}</td>
                          <td className="px-4 py-2.5 text-slate-600">{row.creditAmount}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                            {formatCents(row.payoutAmountCents)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{formatDateTime(row.redeemedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <RecordPaymentForm
                cafeId={cafeId!}
                periodStart={periodStart}
                periodEnd={periodEnd}
                payments={data.payments}
                totalRecordedCents={data.totalRecordedCents}
                onRecorded={() =>
                  queryClient.invalidateQueries({
                    queryKey: ['admin', 'payouts', cafeId, periodStart, periodEnd],
                  })
                }
              />
            </div>
          )}
        </DataState>
      </div>
    </div>
  );
}

function RecordPaymentForm({
  cafeId,
  periodStart,
  periodEnd,
  payments,
  totalRecordedCents,
  onRecorded,
}: {
  cafeId: string;
  periodStart: string;
  periodEnd: string;
  payments: {
    id: string;
    amountCents: number;
    reference: string | null;
    recordedByAdminEmail: string;
    recordedAt: string;
  }[];
  totalRecordedCents: number;
  onRecorded: () => void;
}) {
  const { api } = useAuth();
  const [amountDollars, setAmountDollars] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.recordPayment(cafeId, {
        periodStart,
        periodEnd,
        amountCents: Math.round(Number(amountDollars) * 100),
        reference: reference || null,
      }),
    onSuccess: () => {
      setAmountDollars('');
      setReference('');
      onRecorded();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to record payment'),
  });

  return (
    <Card title="Recorded payments">
      <p className="text-xs text-slate-500">
        An operational record that a bank transfer already happened outside this system — recording
        a payment here does not move any money. Total recorded this period:{' '}
        <span className="font-medium text-slate-700">{formatCents(totalRecordedCents)}</span>.
      </p>

      {payments.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Amount</th>
              <th className="py-2">Reference</th>
              <th className="py-2">Recorded by</th>
              <th className="py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 text-right tabular-nums">{formatCents(payment.amountCents)}</td>
                <td className="py-2 text-slate-600">{payment.reference ?? '—'}</td>
                <td className="py-2 text-slate-600">{payment.recordedByAdminEmail}</td>
                <td className="py-2 text-slate-600">{formatDateTime(payment.recordedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Amount ($)</span>
          <input
            type="number"
            step="0.01"
            required
            value={amountDollars}
            onChange={(event) => setAmountDollars(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Reference</span>
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="e.g. ACH-1234"
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Recording…' : 'Record payment'}
        </Button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
