import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-10 text-center shadow-card">
      <Compass className="h-8 w-8 text-slate-300" aria-hidden />
      <h1 className="mt-3 text-base font-semibold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">This page doesn't exist or may have moved.</p>
      <Link
        to="/"
        className="mt-4 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
