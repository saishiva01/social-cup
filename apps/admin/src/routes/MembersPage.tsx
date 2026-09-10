import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DataState } from '@/components/DataState';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/contexts/auth-context';
import { formatDate } from '@/lib/format';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = ['visitor', 'incomplete', 'active', 'past_due', 'canceled'] as const;

/** PRD Module 9 "Members": list every member with plan, status, join date, credits remaining. */
export function MembersPage() {
  const { api } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'members', page, search, status],
    queryFn: () =>
      api.getMembers({
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
      }),
  });

  return (
    <div>
      <h2 className="text-base font-medium">Members</h2>

      <div className="mt-4 flex gap-3">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.items.length ?? 0) === 0}
          emptyMessage="No members found."
        >
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Credits</th>
                <th className="px-4 py-2">Joined</th>
                <th className="px-4 py-2">Account</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/members/${member.id}`}
                      className="font-medium text-slate-900 underline-offset-2 hover:underline"
                    >
                      {member.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{member.email}</td>
                  <td className="px-4 py-2">{member.membershipStatus}</td>
                  <td className="px-4 py-2">{member.credits}</td>
                  <td className="px-4 py-2">{formatDate(member.createdAt)}</td>
                  <td className="px-4 py-2">{member.deactivatedAt ? 'Deactivated' : 'Active'}</td>
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
