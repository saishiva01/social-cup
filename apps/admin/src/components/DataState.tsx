import { AlertCircle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/Button';
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
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }
  if (error) {
    const message =
      error instanceof ApiError ? error.message : 'Something went wrong loading this data.';
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center" role="alert">
        <AlertCircle className="h-5 w-5 text-red-600" aria-hidden />
        <p className="text-sm text-red-700">{message}</p>
        {onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return <p className="p-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }
  return <>{children}</>;
}
