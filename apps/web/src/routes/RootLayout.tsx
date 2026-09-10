import { Outlet } from 'react-router-dom';

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-brand-primary">Social Cup</span>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
