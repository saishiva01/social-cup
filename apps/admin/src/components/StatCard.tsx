import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
}

/** One KPI figure — the shared shape for the dashboard grid and a payout statement's totals, so "important number" always gets the same visual weight (root CLAUDE.md UI audit: these previously had two different type scales). */
export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-slate-400" aria-hidden /> : null}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
