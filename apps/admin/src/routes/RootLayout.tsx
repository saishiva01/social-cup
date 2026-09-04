import { Outlet } from 'react-router-dom';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold">Social Cup Admin</h1>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
