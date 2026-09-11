import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge, membershipStatusTone } from '@/components/Badge';
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

  const { data, isLoading, error, refetch } = useQuery({
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
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Members</h1>
      <p className="mt-1 text-sm text-slate-500">Membership status, credits, and account state.</p>

      <div className="mt-5 flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
        <DataState
          isLoading={isLoading}
          error={error}
          isEmpty={(data?.items.length ?? 0) === 0}
          emptyMessage="No members found."
          onRetry={() => void refetch()}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Credits</th>
                  <th className="px-4 py-2.5">Joined</th>
                  <th className="px-4 py-2.5">Account</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/members/${member.id}`}
                        className="font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {member.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{member.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={membershipStatusTone(member.membershipStatus)}>
                        {member.membershipStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{member.credits}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      {member.deactivatedAt ? (
                        <Badge tone="danger">Deactivated</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
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
