import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2, Search, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n, adToBs, bsToAdStr } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import {
  Button, Card, Field, Input, Select, Textarea, Checkbox, Table, Badge, Modal, useToast, Spinner,
} from '../lib/ui';
import { PageHeader, Toolbar, LoadingBlock, ErrorBlock } from './page';
import { DateInput } from './DateInput';
import { ImageInput } from './ImageInput';

export interface LookupOption {
  value: string;
  label: string;
}

export type FieldType =
  | 'text' | 'number' | 'date' | 'bsdate' | 'select' | 'textarea' | 'checkbox' | 'password' | 'time' | 'month'
  | 'image' | 'multiselect';

export interface FieldDef {
  name: string;
  /** i18n key (falls back to the raw name when missing). */
  label?: string;
  type?: FieldType;
  required?: boolean;
  /** Static options, or a key into the loaded lookups. */
  options?: LookupOption[] | string;
  /** Dynamic options derived from the current form values (overrides `options`). */
  optionsFn?: (values: Record<string, any>) => LookupOption[];
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  colSpan?: 1 | 2;
  readOnly?: boolean;
  /** For `date` fields: also write the BS equivalent into this column. */
  bsField?: string;
  /** Skip this field when creating (server default / computed). */
  hideOnCreate?: boolean;
  /** Hide the field (and omit its value) when the predicate matches the form state. */
  hidden?: (values: Record<string, any>) => boolean;
  /** Transform the value right before submit. */
  transform?: (value: unknown, values: Record<string, unknown>) => unknown;
  /** Derive the value from the whole form (overrides user input on submit). */
  compute?: (values: Record<string, unknown>) => unknown;
  help?: string;
  /** Dynamic help text derived from the current form values. */
  helpFn?: (values: Record<string, any>) => string;
}

export interface CrudColumn {
  key: string;
  /** i18n key or literal label. */
  header: string;
  render?: (row: any) => ReactNode;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

export interface CrudFilter {
  /** Query param name — must be a real column on the table for server-side filtering. */
  name: string;
  label: string;
  options: LookupOption[];
  /** Show "all" option (default true). */
  allowAll?: boolean;
}

export interface CrudPageProps {
  /** API path, e.g. '/academics/classes'. */
  endpoint: string;
  title: string;
  subtitle?: string;
  columns: CrudColumn[];
  fields: FieldDef[];
  /** Lazily load select options: { key: options[] }. */
  lookups?: () => Promise<Record<string, LookupOption[]>>;
  filters?: CrudFilter[];
  searchPlaceholder?: string;
  searchable?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  defaultSort?: string;
  defaultOrder?: 'asc' | 'desc';
  pageSize?: number;
  /** Convert a row into form values. */
  mapOut?: (row: any) => Record<string, any>;
  /** Convert form values into the request body. */
  mapIn?: (values: Record<string, any>) => Record<string, any>;
  /** Extra actions rendered in the row action cell. */
  rowActions?: (row: any, reload: () => void) => ReactNode;
  /** Extra toolbar buttons. */
  toolbar?: ReactNode;
  /** Server export path (e.g. '/students/export'). */
  exportPath?: string;
  createLabel?: string;
  emptyText?: string;
  /** Disable the default id column mapping (rows without id). */
  rowKey?: string;
  onSaved?: (row: any) => void;
  /** Initial values for the create form. */
  initialValues?: Record<string, any>;
  /** Bump this counter to auto-open the create form (e.g. "add event on this day"). */
  autoOpenKey?: number;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

export default function CrudPage(props: CrudPageProps) {
  const {
    endpoint, title, subtitle, columns, fields, lookups, filters, searchPlaceholder, searchable = true,
    canCreate = true, canEdit = true, canDelete = true, defaultSort, defaultOrder, pageSize = 25,
    mapOut, mapIn, rowActions, toolbar, exportPath, createLabel, emptyText, rowKey = 'id', onSaved, initialValues,
    autoOpenKey,
  } = props;

  const { t, digits, npr } = useI18n();
  const { user } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ page: number; pageSize: number; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [lookupData, setLookupData] = useState<Record<string, LookupOption[]>>({});
  const [reloadKey, setReloadKey] = useState(0);

  // form state
  const [editing, setEditing] = useState<any | null>(null); // null = closed, {} = create
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const canWrite = (mode: 'create' | 'edit' | 'delete') => {
    if (!user) return false;
    const admins = ['super_admin', 'school_admin'];
    if (mode === 'delete') return canDelete && admins.includes(user.role);
    if (mode === 'create') return canCreate && user.role !== 'student' && user.role !== 'parent';
    return canEdit && user.role !== 'student' && user.role !== 'parent';
  };

  /* ------------------------------------------------------------- lookups */
  // Deps: `endpoint` identifies the logical CrudPage. Tabbed pages swap props on
  // the SAME mounted instance (React keeps same-type siblings), so a mount-only
  // effect would never call the new lookups prop — fetch whenever endpoint changes.
  useEffect(() => {
    if (!lookups) { return; }
    let alive = true;
    lookups()
      .then((d) => { if (alive && d) setLookupData(d); })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  /* ---------------------------------------------------------------- list */
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const query: Record<string, unknown> = { page, pageSize };
    if (q.trim()) query.q = q.trim();
    if (defaultSort) query.sort = defaultSort;
    if (defaultOrder) query.order = defaultOrder;
    for (const [k, v] of Object.entries(activeFilters)) if (v) query[k] = v;

    api
      .list<any>(endpoint, query)
      .then((r) => {
        if (!alive) return;
        setRows(r.data ?? []);
        const m = r.meta as any;
        // Some endpoints return aggregate stats in meta (e.g. {titles, copies}) —
        // only pagination-shaped meta ({page, total, …}) drives the counter.
        setMeta(m && typeof m.page === 'number' && typeof m.total === 'number' ? m : null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'Failed to load records');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [endpoint, page, q, activeFilters, reloadKey, defaultSort, defaultOrder, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [q, activeFilters]);

  /* --------------------------------------------------------------- form */
  const openCreate = () => {
    const base: Record<string, any> = {};
    for (const f of fields) base[f.name] = f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : '';
    setFormValues({ ...base, ...(initialValues ?? {}) });
    setEditing({});
    setFormError(null);
  };

  // Auto-open the create form when the parent bumps autoOpenKey (e.g. calendar "add this day").
  useEffect(() => {
    if (autoOpenKey && autoOpenKey > 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenKey]);

  const openEdit = (row: any) => {
    const base: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === 'bsdate' && f.bsField && row[f.bsField]) {
        try {
          base[f.name] = bsToAdStr(row[f.bsField]);
        } catch {
          base[f.name] = '';
        }
      } else if (f.type === 'checkbox') base[f.name] = Boolean(row[f.name]);
      else if (f.type === 'multiselect') base[f.name] = Array.isArray(row[f.name]) ? row[f.name] : [];
      else base[f.name] = isEmpty(row[f.name]) ? '' : row[f.name];
    }
    setFormValues({ ...(mapOut ? mapOut(row) : base), ...(mapOut ? base : {}) });
    setEditing(row);
    setFormError(null);
  };

  const setValue = (name: string, value: unknown) => setFormValues((v) => ({ ...v, [name]: value }));

  const validate = (): string | null => {
    for (const f of fields) {
      if (!f.required || f.hideOnCreate && editing && !editing[rowKey]) continue;
      if (f.hidden?.(formValues)) continue;
      const v = formValues[f.name];
      if (f.type === 'multiselect') {
        if (!Array.isArray(v) || !v.length) return `${labelOf(f)} — ${t('required')}`;
        continue;
      }
      if (isEmpty(v) || (f.type === 'checkbox' && v === false && f.required)) {
        return `${labelOf(f)} — ${t('required')}`;
      }
      if (f.type === 'number' && v !== '' && v !== undefined && v !== null) {
        const n = Number(v);
        if (Number.isNaN(n)) return `${labelOf(f)} — invalid number`;
        if (f.min !== undefined && n < f.min) return `${labelOf(f)} — min ${f.min}`;
        if (f.max !== undefined && n > f.max) return `${labelOf(f)} — max ${f.max}`;
      }
    }
    return null;
  };

  const labelOf = (f: FieldDef) => (f.label ? t(f.label) : f.name);

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const isCreate = !editing[rowKey];
      const body: Record<string, any> = {};
      for (const f of fields) {
        if (f.hideOnCreate && editing && !editing[rowKey]) continue;
        if (f.hidden?.(formValues)) continue; // hidden fields are omitted (server keeps stored values)
        let v = formValues[f.name];
        if (f.type === 'multiselect') {
          const arr = Array.isArray(v) ? v.map(String) : [];
          if (!arr.length && isCreate) continue; // omit empty on create
          body[f.name] = arr; // [] on edit clears the stored selection
          continue;
        }
        if (f.compute) v = f.compute(formValues);
        if (f.transform) v = f.transform(v, formValues);
        if (v === '' || v === undefined || v === null) {
          if (f.type === 'checkbox') v = false;
          else if (f.type === 'number') continue; // let the server default apply
          else if (isCreate && !f.required) continue; // omit on create so server-side defaults (e.g. language='en') apply
          else if (!f.required) v = null; // on edit, null clears the stored value
        } else if (f.type === 'number') {
          v = Number(v);
        } else if (f.type === 'checkbox') {
          v = Boolean(v);
        }
        body[f.name] = v;
        if (f.bsField && f.type === 'date' && v) {
          try {
            body[f.bsField] = adToBs(String(v));
          } catch {
            /* ignore invalid date */
          }
        }
      }
      const finalBody = mapIn ? mapIn(body) : body;
      const row = isCreate
        ? await api.post<any>(endpoint, finalBody)
        : await api.patch<any>(`${endpoint}/${editing[rowKey]}`, finalBody);
      toast.push(isCreate ? t('created') : t('saved'), 'success');
      setEditing(null);
      reload();
      onSaved?.(row);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`${endpoint}/${deleting[rowKey]}`);
      toast.push(t('deleted'), 'success');
      setDeleting(null);
      reload();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
      setDeleting(null);
    }
  };

  const exportFile = async () => {
    if (!exportPath) return;
    try {
      const blob = await api.download(exportPath, Object.keys(activeFilters).length ? activeFilters : undefined);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${endpoint.replace(/\W+/g, '-')}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Export failed', 'error');
    }
  };

  /* -------------------------------------------------------------- render */
  const resolvedColumns = useMemo(() => {
    const actionCol: CrudColumn = {
      key: '__actions',
      header: t('actions'),
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canWrite('edit') && (
            <button
              onClick={() => openEdit(row)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-navy-800"
              title={t('edit')}
            >
              <Pencil size={15} />
            </button>
          )}
          {rowActions?.(row, reload)}
          {canWrite('delete') && (
            <button
              onClick={() => setDeleting(row)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-navy-800"
              title={t('delete')}
            >
              <Trash2 size={15} />
            </button>
          )}
          {!canWrite('edit') && !canWrite('delete') && !rowActions && <span className="text-xs text-slate-400">—</span>}
        </div>
      ),
    };
    return [...columns, actionCol];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, user?.role, canCreate, canEdit, canDelete, reload]);

  const selectOptions = (f: FieldDef): LookupOption[] => {
    if (f.optionsFn) return f.optionsFn(formValues);
    if (Array.isArray(f.options)) return f.options;
    if (typeof f.options === 'string') return lookupData[f.options] ?? [];
    return [];
  };

  const toggleMultiselect = (name: string, value: string) =>
    setFormValues((fv) => {
      const cur: string[] = Array.isArray(fv[name]) ? fv[name] : [];
      return { ...fv, [name]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {exportPath && (
              <Button variant="secondary" size="sm" onClick={exportFile}>
                <Download size={14} /> {t('exportCsv')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={reload} title={t('refresh')}>
              <RefreshCw size={14} /> {t('refresh')}
            </Button>
            {canWrite('create') && (
              <Button size="sm" onClick={openCreate}>
                <Plus size={15} /> {createLabel ?? t('add')}
              </Button>
            )}
          </>
        }
      />

      <Toolbar>
        {searchable && (
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder ?? `${t('search')}…`}
              className="pl-9"
            />
          </div>
        )}
        {filters?.map((f) => (
          <Select
            key={f.name}
            className="w-auto min-w-[150px]"
            value={activeFilters[f.name] ?? ''}
            onChange={(e) => setActiveFilters((af) => ({ ...af, [f.name]: e.target.value }))}
          >
            <option value="">{t('all')} — {f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ))}
        {toolbar}
        {meta ? (
          <span className="ml-auto text-xs text-slate-500">
            {t('showing')} {digits((meta.page - 1) * meta.pageSize + (rows.length ? 1 : 0))}–{digits((meta.page - 1) * meta.pageSize + rows.length)} {t('of')} {digits(meta.total)} {t('records')}
          </span>
        ) : (
          <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} {t('records')}</span>
        )}
      </Toolbar>

      <Card>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : (
          <>
            <Table
              columns={resolvedColumns}
              rows={rows}
              empty={emptyText}
              renderCell={(key, row) => {
                const col = resolvedColumns.find((c) => c.key === key)!;
                return col.render ? col.render(row) : renderDefault(key, row, { digits, npr, t });
              }}
            />
            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2.5 dark:border-navy-800 print:hidden">
                <span className="text-xs text-slate-500">
                  {t('page')} {digits(meta.page)} {t('of')} {digits(meta.pages)}
                </span>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={14} /> {t('previous')}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={meta.page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
                    {t('next')} <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ------------------------------------------------------ create/edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        wide
        title={editing && editing[rowKey] ? `${t('edit')} — ${title}` : (createLabel ?? `${t('create')} — ${title}`)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} loading={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {formError && (
            <div className="col-span-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
              {formError}
            </div>
          )}
          {fields
            .filter((f) => !(f.hideOnCreate && editing && !editing[rowKey]))
            .filter((f) => !f.hidden?.(formValues))
            .map((f) => {
              const label = labelOf(f);
              const common = {
                id: `f-${f.name}`,
                disabled: f.readOnly || saving,
                placeholder: f.placeholder,
              };
              const help = f.helpFn ? f.helpFn(formValues) : f.help;
              return (
                <div key={f.name} className={f.colSpan === 2 ? 'sm:col-span-2' : ''}>
                  <Field label={label} required={f.required} hint={f.hint} error={undefined}>
                    {f.type === 'select' ? (
                      <Select
                        {...common}
                        value={formValues[f.name] ?? ''}
                        onChange={(e) => setValue(f.name, e.target.value)}
                      >
                        <option value="">{t('none')}</option>
                        {selectOptions(f).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    ) : f.type === 'textarea' ? (
                      <Textarea {...common} value={formValues[f.name] ?? ''} onChange={(e) => setValue(f.name, e.target.value)} />
                    ) : f.type === 'checkbox' ? (
                      <Checkbox
                        label={f.placeholder ?? label}
                        checked={Boolean(formValues[f.name])}
                        disabled={saving}
                        onChange={(e) => setValue(f.name, e.target.checked)}
                      />
                    ) : f.type === 'date' || f.type === 'bsdate' ? (
                      <DateInput
                        {...common}
                        value={formValues[f.name] ?? ''}
                        onChange={(e) => setValue(f.name, e.target.value)}
                      />
                    ) : f.type === 'image' ? (
                      <ImageInput
                        id={common.id}
                        value={typeof formValues[f.name] === 'string' ? formValues[f.name] : ''}
                        disabled={f.readOnly || saving}
                        onChange={(url) => setValue(f.name, url)}
                      />
                    ) : f.type === 'multiselect' ? (
                      <div className="max-h-44 overflow-auto rounded-lg border border-slate-200 p-2 dark:border-navy-600">
                        {selectOptions(f).length === 0 ? (
                          <span className="text-xs text-slate-400">{t('none')}</span>
                        ) : (
                          selectOptions(f).map((o) => {
                            const arr: string[] = Array.isArray(formValues[f.name]) ? formValues[f.name] : [];
                            return (
                              <label key={o.value} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-navy-700">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                  checked={arr.includes(o.value)}
                                  disabled={saving}
                                  onChange={() => toggleMultiselect(f.name, o.value)}
                                />
                                {o.label}
                              </label>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <Input
                        {...common}
                        type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : f.type === 'time' ? 'time' : f.type === 'month' ? 'month' : 'text'}
                        inputMode={f.type === 'number' ? 'decimal' : undefined}
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={formValues[f.name] ?? ''}
                        onChange={(e) => setValue(f.name, e.target.value)}
                      />
                    )}
                    {help && <span className="mt-1 block text-xs text-slate-400">{help}</span>}
                  </Field>
                </div>
              );
            })}
          <div className="col-span-full">
            <Button type="submit" className="hidden" />
          </div>
        </form>
      </Modal>

      {/* ----------------------------------------------------------- delete */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('delete')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
            <Button variant="danger" onClick={confirmDelete}>{t('delete')}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('confirmDelete')}</p>
      </Modal>
    </>
  );
}

/** Sensible defaults for common column keys so pages stay concise. */
function renderDefault(key: string, row: any, helpers: { digits: (v: any) => string; npr: (v: any) => string; t: (k: string) => string }): ReactNode {
  const v = row[key];
  if (isEmpty(v)) return <span className="text-slate-400">—</span>;
  if (typeof v === 'boolean') return v ? helpers.t('yes') : helpers.t('no');
  if (key === 'status' || key === 'role' || key === 'priority' || key === 'type' || key === 'gender' || key === 'frequency') {
    const tone =
      ['active', 'paid', 'published', 'approved', 'present', 'male'].includes(String(v))
        ? 'green'
        : ['inactive', 'failed', 'rejected', 'absent', 'withdrawn'].includes(String(v))
          ? 'red'
          : ['draft', 'pending', 'partial', 'late'].includes(String(v))
            ? 'amber'
            : 'slate';
    return <Badge tone={tone as any}>{String(v)}</Badge>;
  }
  if (key === 'amount' || key === 'paidAmount' || key === 'balance' || key === 'total' || key === 'salary' || key === 'gross' || key === 'net' || key === 'collected' || key === 'billed') {
    return helpers.npr(v);
  }
  if (/At$|Date$/.test(key) && typeof v === 'string') {
    const ad = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ad)) return helpers.digits(String(v));
    try {
      const bs = adToBs(ad);
      if (bs) return helpers.digits(bs);
    } catch {
      /* fall through to raw AD */
    }
    return helpers.digits(ad);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return helpers.digits(String(v));
}
