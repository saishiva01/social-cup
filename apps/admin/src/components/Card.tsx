import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** The one card shell — a titled section with consistent padding/elevation, used for every grouped block instead of each route hand-rolling `rounded-lg border border-slate-200 bg-white p-4`. */
export function Card({ title, action, children, className = '' }: CardProps) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-card ${className}`}>
      {title ? (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {action}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
