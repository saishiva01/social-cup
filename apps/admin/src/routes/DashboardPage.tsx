import { useQuery } from '@tanstack/react-query';
import { Coffee, CreditCard, DollarSign, ReceiptText, TrendingUp, Users } from 'lucide-react';

import { DataState } from '@/components/DataState';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/contexts/auth-context';
import { formatCents } from '@/lib/format';

/** PRD Module 9 Dashboard: total members, active cafes, redemptions this month, credits redeemed, total owed to cafes, total margin for the period. */
export function DashboardPage() {
  const { api } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.getDashboardSummary(),
  });

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">This month's activity across every partner cafe.</p>

      <div className="mt-5">
        <DataState isLoading={isLoading} error={error} isEmpty={false} onRetry={() => void refetch()}>
          {data && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Total members" value={String(data.totalMembers)} icon={Users} />
              <StatCard label="Active cafes" value={String(data.activeCafes)} icon={Coffee} />
              <StatCard
                label="Redemptions this month"
                value={String(data.redemptionsThisMonth)}
                icon={ReceiptText}
              />
              <StatCard
                label="Credits redeemed"
                value={String(data.creditsRedeemedThisMonth)}
                icon={CreditCard}
              />
              <StatCard
                label="Owed to cafes"
                value={formatCents(data.totalOwedToCafesThisMonthCents)}
                icon={DollarSign}
              />
              <StatCard
                label="Margin this month"
                value={formatCents(data.totalMarginThisMonthCents)}
                icon={TrendingUp}
              />
            </div>
          )}
        </DataState>
      </div>
    </div>
  );
}
