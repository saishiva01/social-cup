import { NavLink, Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '@/contexts/auth-context';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/cafes', label: 'Cafes' },
  { to: '/members', label: 'Members' },
  { to: '/redemptions', label: 'Redemptions' },
  { to: '/payouts', label: 'Payouts' },
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
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center">
          <h1 className="text-base font-semibold text-slate-900">Access denied</h1>
          <p className="mt-2 text-sm text-slate-600">
            Signed in as {user?.email}, which does not have administrator access.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-4 rounded border border-slate-300 px-4 py-2 text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Social Cup Admin</h1>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span>{user?.email}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded border border-slate-300 px-3 py-1"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mt-4 flex gap-4 text-sm">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive
                  ? 'font-medium text-slate-900 underline underline-offset-4'
                  : 'text-slate-500 hover:text-slate-900'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
