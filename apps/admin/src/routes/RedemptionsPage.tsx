import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/Badge';
import { DataState } from '@/components/DataState';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/contexts/auth-context';
import { formatCents, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;

/** PRD Module 9 "Redemption log": every redemption across every cafe, filterable by date range and cafe. */
export function RedemptionsPage() {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [voided, setVoided] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'redemptions', page, dateFrom, dateTo, voided],
    queryFn: () =>
      api.getRedemptions({
        page,
        pageSize: PAGE_SIZE,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
        voided: voided === '' ? undefined : voided === 'true',
      }),
  });

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Redemptions</h1>
      <p className="mt-1 text-sm text-slate-500">Every redemption across every partner cafe.</p>

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-card">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">Status</span>
          <select
            value={voided}
            onChange={(event) => {
              setVoided(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All</option>
            <option value="false">Completed</option>
            <option value="true">Voided</option>
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.items.length ?? 0) === 0}
          emptyMessage="No redemptions found."
          onRetry={() => void refetch()}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Member</th>
                  <th className="px-4 py-2.5">Cafe</th>
                  <th className="px-4 py-2.5">Drink</th>
                  <th className="px-4 py-2.5">Credits</th>
                  <th className="px-4 py-2.5">Payout</th>
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/redemptions/${row.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {row.memberDisplayName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{row.cafeName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.drinkName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.creditAmount}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatCents(row.payoutAmountCents)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDateTime(row.redeemedAt)}</td>
                    <td className="px-4 py-2.5">
                      {row.voided ? (
                        <Badge tone="danger">Voided</Badge>
                      ) : (
                        <Badge tone="success">Completed</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
          )}
        </DataState>
      </div>
    </div>
  );
}
