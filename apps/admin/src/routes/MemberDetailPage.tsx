import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { DataState } from '@/components/DataState';
import { useAuth } from '@/contexts/auth-context';
import { formatDateTime } from '@/lib/format';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'members', id],
    queryFn: () => api.getMember(id!),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'members', id] });
  const deactivate = useMutation({
    mutationFn: () => api.deactivateMember(id!),
    onSuccess: invalidate,
  });
  const reactivate = useMutation({
    mutationFn: () => api.reactivateMember(id!),
    onSuccess: invalidate,
  });

  return (
    <div>
      <Link to="/members" className="text-sm text-slate-500 hover:underline">
        ← Members
      </Link>

      <DataState isLoading={isLoading} error={error} isEmpty={false}>
        {data && (
          <div className="mt-4 space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-medium">{data.displayName}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Detail label="Email" value={data.email} />
                <Detail label="Neighborhood" value={data.neighborhood ?? '—'} />
                <Detail label="Membership status" value={data.membershipStatus} />
                <Detail label="Credits remaining" value={String(data.credits)} />
                <Detail
                  label="Renews"
                  value={data.currentPeriodEnd ? formatDateTime(data.currentPeriodEnd) : '—'}
                />
                <Detail label="Joined" value={formatDateTime(data.createdAt)} />
                <Detail label="Email verified" value={data.emailVerified ? 'Yes' : 'No'} />
                <Detail
                  label="Account"
                  value={
                    data.deactivatedAt
                      ? `Deactivated ${formatDateTime(data.deactivatedAt)}`
                      : 'Active'
                  }
                />
              </dl>
              <div className="mt-4">
                {data.deactivatedAt ? (
                  <button
                    type="button"
                    onClick={() => reactivate.mutate()}
                    disabled={reactivate.isPending}
                    className="rounded border border-slate-300 px-4 py-2 text-sm"
                  >
                    Reactivate account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Deactivate ${data.email}? They will not be able to sign in.`))
                        deactivate.mutate();
                    }}
                    disabled={deactivate.isPending}
                    className="rounded border border-red-300 px-4 py-2 text-sm text-red-700"
                  >
                    Deactivate account
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Recent redemptions</h3>
              {data.recentRedemptions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No redemptions yet.</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2">Cafe</th>
                      <th className="py-2">Drink</th>
                      <th className="py-2">Credits</th>
                      <th className="py-2">When</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRedemptions.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2">{row.cafeName}</td>
                        <td className="py-2">{row.drinkName}</td>
                        <td className="py-2">{row.creditAmount}</td>
                        <td className="py-2">{formatDateTime(row.redeemedAt)}</td>
                        <td className="py-2">{row.voided ? 'Voided' : 'Completed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
