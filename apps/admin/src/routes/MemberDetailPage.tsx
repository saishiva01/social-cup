import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge, membershipStatusTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataState } from '@/components/DataState';
import { Detail, DetailGrid } from '@/components/Detail';
import { useAuth } from '@/contexts/auth-context';
import { formatDateTime } from '@/lib/format';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'members', id],
    queryFn: () => api.getMember(id!),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'members', id] });
  const deactivate = useMutation({
    mutationFn: () => api.deactivateMember(id!),
    onSuccess: () => {
      setConfirmingDeactivate(false);
      invalidate();
    },
  });
  const reactivate = useMutation({
    mutationFn: () => api.reactivateMember(id!),
    onSuccess: invalidate,
  });

  return (
    <div>
      <Link
        to="/members"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Members
      </Link>

      <div className="mt-3">
        <DataState isLoading={isLoading} error={error} isEmpty={false} onRetry={() => void refetch()}>
          {data && (
            <div className="space-y-6">
              <Card
                title={data.displayName}
                action={<Badge tone={membershipStatusTone(data.membershipStatus)}>{data.membershipStatus}</Badge>}
              >
                <DetailGrid>
                  <Detail label="Email">{data.email}</Detail>
                  <Detail label="Neighborhood">{data.neighborhood ?? '—'}</Detail>
                  <Detail label="Credits remaining">{data.credits}</Detail>
                  <Detail label="Renews">
                    {data.currentPeriodEnd ? formatDateTime(data.currentPeriodEnd) : '—'}
                  </Detail>
                  <Detail label="Joined">{formatDateTime(data.createdAt)}</Detail>
                  <Detail label="Email verified">{data.emailVerified ? 'Yes' : 'No'}</Detail>
                  <Detail label="Account">
                    {data.deactivatedAt ? (
                      <span>Deactivated {formatDateTime(data.deactivatedAt)}</span>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </Detail>
                </DetailGrid>
                <div className="mt-4">
                  {data.deactivatedAt ? (
                    <Button
                      variant="secondary"
                      onClick={() => reactivate.mutate()}
                      disabled={reactivate.isPending}
                    >
                      {reactivate.isPending ? 'Reactivating…' : 'Reactivate account'}
                    </Button>
                  ) : (
                    <Button
                      variant="dangerOutline"
                      onClick={() => setConfirmingDeactivate(true)}
                      disabled={deactivate.isPending}
                    >
                      Deactivate account
                    </Button>
                  )}
                </div>
              </Card>

              <Card title="Recent redemptions">
                {data.recentRedemptions.length === 0 ? (
                  <p className="text-sm text-slate-500">No redemptions yet.</p>
                ) : (
                  <table className="w-full text-sm">
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
                          <td className="py-2">
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
                )}
              </Card>
            </div>
          )}
        </DataState>
      </div>

      <ConfirmDialog
        open={confirmingDeactivate}
        title="Deactivate this account?"
        description={
          <>
            {data?.email} will not be able to sign in until reactivated. Their credits and history
            are kept.
          </>
        }
        confirmLabel="Deactivate"
        danger
        busy={deactivate.isPending}
        onConfirm={() => deactivate.mutate()}
        onCancel={() => setConfirmingDeactivate(false)}
      />
    </div>
  );
}
