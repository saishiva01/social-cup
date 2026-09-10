import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'payouts', periodStartIso, periodEndIso],
    queryFn: () => api.getPayoutSummary(periodStartIso, periodEndIso),
  });

  return (
    <div>
      <h2 className="text-base font-medium">Payouts</h2>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Period start</span>
          <input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Period end</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.length ?? 0) === 0}
          emptyMessage="No redemptions in this period."
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Cafe</th>
                <th className="px-4 py-2">Redemptions</th>
                <th className="px-4 py-2">Credits</th>
                <th className="px-4 py-2">Owed</th>
                <th className="px-4 py-2">Recorded</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr
                  key={row.cafeId}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">{row.cafeName}</td>
                  <td className="px-4 py-2">{row.redemptionCount}</td>
                  <td className="px-4 py-2">{row.totalCredits}</td>
                  <td className="px-4 py-2">{formatCents(row.amountOwedCents)}</td>
                  <td className="px-4 py-2">{formatCents(row.amountRecordedCents)}</td>
                  <td className="px-4 py-2">{STATUS_LABEL[row.paymentStatus]}</td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/payouts/${row.cafeId}?periodStart=${encodeURIComponent(periodStartIso)}&periodEnd=${encodeURIComponent(periodEndIso)}`}
                      className="text-slate-700 underline-offset-2 hover:underline"
                    >
                      Statement
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </div>
    </div>
  );
}
