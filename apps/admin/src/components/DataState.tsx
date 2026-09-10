import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api';

/**
 * Shared loading/error/empty rendering for every admin table/list (section
 * 19: "Tables should handle: loading, empty state, error state..."). Pass
 * `isEmpty` explicitly rather than inferring it, since an empty page-2 of
 * results and a genuinely empty dataset should usually read differently.
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'Nothing here yet.',
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  }
  if (error) {
    const message =
      error instanceof ApiError ? error.message : 'Something went wrong loading this data.';
    return (
      <p className="p-6 text-sm text-red-700" role="alert">
        {message}
      </p>
    );
  }
  if (isEmpty) {
    return <p className="p-6 text-sm text-slate-500">{emptyMessage}</p>;
  }
  return <>{children}</>;
}
