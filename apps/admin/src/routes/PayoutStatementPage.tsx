import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { DataState } from '@/components/DataState';
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

  const { data, isLoading, error } = useQuery({
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
      <Link to="/payouts" className="text-sm text-slate-500 hover:underline">
        ← Payouts
      </Link>

      <DataState isLoading={isLoading} error={error} isEmpty={false}>
        {data && (
          <div className="mt-4 space-y-6">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h2 className="text-base font-medium">{data.cafeName}</h2>
                <p className="text-sm text-slate-500">
                  {formatDateTime(data.periodStart)} – {formatDateTime(data.periodEnd)}
                </p>
              </div>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setDownloadError(null);
                    downloadCsv.mutate();
                  }}
                  disabled={downloadCsv.isPending}
                  className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
                >
                  {downloadCsv.isPending ? 'Preparing…' : 'Download CSV'}
                </button>
                {downloadError && (
                  <p className="mt-1 text-xs text-red-700" role="alert">
                    {downloadError}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Detail label="Redemptions" value={String(data.totals.redemptionCount)} />
                <Detail label="Credits" value={String(data.totals.totalCredits)} />
                <Detail label="Amount owed" value={formatCents(data.totals.totalAmountOwedCents)} />
              </dl>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Member</th>
                    <th className="px-4 py-2">Drink</th>
                    <th className="px-4 py-2">Credits</th>
                    <th className="px-4 py-2">Payout</th>
                    <th className="px-4 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.redemptions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-slate-500">
                        No redemptions in this period.
                      </td>
                    </tr>
                  )}
                  {data.redemptions.map((row) => (
                    <tr key={row.redemptionId} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2">{row.memberDisplayName}</td>
                      <td className="px-4 py-2">{row.drinkName}</td>
                      <td className="px-4 py-2">{row.creditAmount}</td>
                      <td className="px-4 py-2">{formatCents(row.payoutAmountCents)}</td>
                      <td className="px-4 py-2">{formatDateTime(row.redeemedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">Recorded payments</h3>
      <p className="text-xs text-slate-500">
        An operational record that a bank transfer already happened outside this system — recording
        a payment here does not move any money. Total recorded this period:{' '}
        {formatCents(totalRecordedCents)}.
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
                <td className="py-2">{formatCents(payment.amountCents)}</td>
                <td className="py-2">{payment.reference ?? '—'}</td>
                <td className="py-2">{payment.recordedByAdminEmail}</td>
                <td className="py-2">{formatDateTime(payment.recordedAt)}</td>
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
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Reference</span>
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="e.g. ACH-1234"
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Recording…' : 'Record payment'}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
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
