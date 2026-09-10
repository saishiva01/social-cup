import { useQuery } from '@tanstack/react-query';

import { DataState } from '@/components/DataState';
import { useAuth } from '@/contexts/auth-context';
import { formatCents } from '@/lib/format';

/** PRD Module 9 Dashboard: total members, active cafes, redemptions this month, credits redeemed, total owed to cafes, total margin for the period. */
export function DashboardPage() {
  const { api } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.getDashboardSummary(),
  });

  return (
    <div>
      <h2 className="text-base font-medium">Dashboard</h2>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white">
        <DataState isLoading={isLoading} error={error} isEmpty={false}>
          {data && (
            <dl className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3">
              <Stat label="Total members" value={String(data.totalMembers)} />
              <Stat label="Active cafes" value={String(data.activeCafes)} />
              <Stat label="Redemptions this month" value={String(data.redemptionsThisMonth)} />
              <Stat
                label="Credits redeemed this month"
                value={String(data.creditsRedeemedThisMonth)}
              />
              <Stat
                label="Owed to cafes this month"
                value={formatCents(data.totalOwedToCafesThisMonthCents)}
              />
              <Stat label="Margin this month" value={formatCents(data.totalMarginThisMonthCents)} />
            </dl>
          )}
        </DataState>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
