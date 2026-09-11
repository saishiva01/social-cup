import {
  Coffee,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '@/contexts/auth-context';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    label: 'Operations',
    items: [
      { to: '/cafes', label: 'Cafes', icon: Coffee },
      { to: '/members', label: 'Members', icon: Users },
      { to: '/redemptions', label: 'Redemptions', icon: ReceiptText },
    ],
  },
  { label: 'Finance', items: [{ to: '/payouts', label: 'Payouts', icon: Wallet }] },
];

/**
 * Every admin screen renders through here, which enforces the client-side
 * gate: unauthenticated -> redirect to /login; authenticated but not an
 * admin -> an explicit access-denied screen, never the admin UI (root
 * CLAUDE.md: this is a UX convenience only — every actual admin API route
 * independently re-checks the role server-side via `requireAdmin`, so this
 * client-side check being bypassed grants no real access).
 */
export function RootLayout() {
  const { status, user, isAdmin, logout } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-card">
          <h1 className="text-base font-semibold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as {user?.email}, which does not have administrator access.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-4 rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
            SC
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">Social Cup</p>
            <p className="text-xs leading-tight text-slate-500">Admin console</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {group.label}
              </p>
              <div className="mt-2 space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-100 px-3 py-4">
          <div className="flex items-center gap-2 rounded-md px-3 py-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {(user?.email ?? '?').charAt(0).toUpperCase()}
            </div>
            <p className="min-w-0 flex-1 truncate text-xs text-slate-600">{user?.email}</p>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Sign out"
              title="Sign out"
              className="flex-shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
