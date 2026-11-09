import { useState, type ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
      <div>
        <h2 className="text-lg font-bold text-navy-800 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: ReactNode; badge?: ReactNode }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 print:hidden dark:border-navy-700">
      {tabs.map((tb) => (
        <button
          key={tb.key}
          onClick={() => onChange(tb.key)}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
            active === tb.key
              ? 'border-teal-600 text-teal-700 dark:text-teal-300'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {tb.label}
          {tb.badge !== undefined && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] dark:bg-navy-800">{tb.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Panel that matches the app card look, for tab content. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-navy-700 dark:bg-navy-900 ${className}`}>
      {children}
    </div>
  );
}

/** Simple horizontal toolbar (search + filters + buttons). */
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-3 flex flex-wrap items-center gap-2 print:hidden ${className}`}>{children}</div>;
}

/** KPI row helper. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** Loading / error states used across pages. */
export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
      <p className="font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
          Retry
        </button>
      )}
    </div>
  );
}

/** Keeps `state` in sync with a boolean toggle; small helper for tab pages. */
export function useToggle(initial = false): [boolean, () => void, (v: boolean) => void] {
  const [v, setV] = useState(initial);
  return [v, () => setV((x) => !x), setV];
}
