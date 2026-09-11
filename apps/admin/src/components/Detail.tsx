import type { ReactNode } from 'react';

/** One label/value pair — replaces three byte-for-byte-identical local `Detail` components (Member/Redemption/Payout detail pages). */
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/** Wraps a grid of `Detail`s — the shared layout every detail page's "facts" block uses. */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">{children}</dl>;
}
