import {
  Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useI18n } from './i18n';

/* ------------------------------------------------------------------ theme */

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('pathshala.theme', theme);
}
export function initialTheme(): 'light' | 'dark' {
  return (localStorage.getItem('pathshala.theme') as 'light' | 'dark') || 'light';
}

/* ---------------------------------------------------------------- buttons */

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'teal';

export function Button({
  children, variant = 'primary', size = 'md', loading, className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }[size];
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-navy-700 text-white hover:bg-navy-800 disabled:bg-navy-300 dark:bg-navy-600 dark:hover:bg-navy-500',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800',
    teal: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-300',
  };
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed ${sizes} ${variants[variant]} ${className}`}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-label="loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ cards */

export function Card({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-navy-700 dark:bg-navy-900 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-navy-800">
          {typeof title === 'string' ? <h3 className="text-sm font-semibold text-navy-700 dark:text-teal-300">{title}</h3> : title}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, accent = 'navy', icon }: {
  label: string; value: ReactNode; hint?: ReactNode; accent?: 'navy' | 'teal' | 'amber' | 'red' | 'green'; icon?: ReactNode;
}) {
  const accents = {
    navy: 'bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-200',
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-900 dark:text-teal-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  }[accent];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-navy-700 dark:bg-navy-900">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-navy-800 dark:text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
        {icon && <span className={`rounded-lg p-2 ${accents}`}>{icon}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

export function Field({ label, required, hint, error, children }: { label?: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-0.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:bg-slate-100 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-20 ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ''}`}>
      {children}
    </select>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-slate-300 accent-teal-600" />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ table */

export function Table({ columns, rows, empty, onRowClick, renderCell }: {
  columns: { key: string; header: ReactNode; render?: (row: any) => ReactNode; className?: string }[];
  rows: any[];
  empty?: ReactNode;
  onRowClick?: (row: any) => void;
  renderCell?: (key: string, row: any) => ReactNode;
}) {
  const { t } = useI18n();
  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-slate-500">{empty ?? t('noData')}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-navy-700">
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 font-semibold ${c.className ?? ''}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-slate-100 last:border-0 dark:border-navy-800/60 ${onRowClick ? 'cursor-pointer hover:bg-teal-50/60 dark:hover:bg-navy-800' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 text-slate-700 dark:text-slate-300 ${c.className ?? ''}`}>
                  {renderCell ? renderCell(c.key, row) : c.render ? c.render(row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'teal' | 'navy' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
    navy: 'bg-navy-100 text-navy-800 dark:bg-navy-800 dark:text-navy-200',
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {subtitle && <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-6" onMouseDown={onClose}>
      <div
        className={`my-8 w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} rounded-xl bg-white shadow-xl dark:bg-navy-900 dark:border dark:border-navy-700`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-navy-800">
          <h3 className="font-semibold text-navy-800 dark:text-white">{title}</h3>
          <button onClick={onClose} aria-label={t('close')} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-800">✕</button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-navy-800">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- toasts */

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}
const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = idRef.current++;
    setToasts((ts) => [...ts, { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((tst) => (
          <div
            key={tst.id}
            className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              tst.tone === 'success' ? 'bg-teal-600' : tst.tone === 'error' ? 'bg-red-600' : 'bg-navy-700'
            }`}
          >
            {tst.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ------------------------------------------------------- error boundary */

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h2 className="font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm">{this.state.error.message}</p>
          <button className="mt-4 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
