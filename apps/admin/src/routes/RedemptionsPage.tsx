import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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

  const { data, isLoading, error } = useQuery({
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
      <h2 className="text-base font-medium">Redemptions</h2>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-700">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
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
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
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
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="false">Completed</option>
            <option value="true">Voided</option>
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.items.length ?? 0) === 0}
          emptyMessage="No redemptions found."
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Cafe</th>
                <th className="px-4 py-2">Drink</th>
                <th className="px-4 py-2">Credits</th>
                <th className="px-4 py-2">Payout</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/redemptions/${row.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.memberDisplayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{row.cafeName}</td>
                  <td className="px-4 py-2">{row.drinkName}</td>
                  <td className="px-4 py-2">{row.creditAmount}</td>
                  <td className="px-4 py-2">{formatCents(row.payoutAmountCents)}</td>
                  <td className="px-4 py-2">{formatDateTime(row.redeemedAt)}</td>
                  <td className="px-4 py-2">{row.voided ? 'Voided' : 'Completed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
          )}
        </DataState>
      </div>
    </div>
  );
}
