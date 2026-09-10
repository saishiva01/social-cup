/** Server-side pagination control shared by every admin table — never fetches or filters a full unbounded dataset client-side (section 19). */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-slate-600">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
