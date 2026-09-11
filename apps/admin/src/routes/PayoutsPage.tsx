import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, paymentStatusTone } from '@/components/Badge';
import { DataState } from '@/components/DataState';
import { useAuth } from '@/contexts/auth-context';
import { toDateInputValue } from '@/lib/format';
import { formatCents } from '@/lib/format';

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toDateInputValue(start), end: toDateInputValue(now) };
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: 'Unpaid',
  partially_recorded: 'Partially recorded',
  recorded: 'Recorded',
};

/** PRD Module 9 "Payouts": choose a period, see each cafe's redemptions/credits/amount owed. */
export function PayoutsPage() {
  const { api } = useAuth();
  const initial = defaultPeriod();
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);

  const periodStartIso = new Date(periodStart).toISOString();
  // The query's [periodStart, periodEnd) window is half-open — add one day so the picked end date is included.
  const periodEndIso = new Date(new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'payouts', periodStartIso, periodEndIso],
    queryFn: () => api.getPayoutSummary(periodStartIso, periodEndIso),
  });

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Payouts</h1>
      <p className="mt-1 text-sm text-slate-500">What each cafe is owed for a period, and what's been paid.</p>

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-card">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Period start</span>
          <input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Period end</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.length ?? 0) === 0}
          emptyMessage="No redemptions in this period."
          onRetry={() => void refetch()}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Cafe</th>
                  <th className="px-4 py-2.5">Redemptions</th>
                  <th className="px-4 py-2.5">Credits</th>
                  <th className="px-4 py-2.5">Owed</th>
                  <th className="px-4 py-2.5">Recorded</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {data?.map((row) => (
                  <tr
                    key={row.cafeId}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.cafeName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.redemptionCount}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.totalCredits}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {formatCents(row.amountOwedCents)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {formatCents(row.amountRecordedCents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={paymentStatusTone(row.paymentStatus)}>
                        {STATUS_LABEL[row.paymentStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/payouts/${row.cafeId}?periodStart=${encodeURIComponent(periodStartIso)}&periodEnd=${encodeURIComponent(periodEndIso)}`}
                        className="inline-flex items-center gap-1 text-slate-700 underline-offset-2 hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        Statement
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </div>
    </div>
  );
}
