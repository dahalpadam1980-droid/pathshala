import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Printer, CheckCircle2, Banknote, Pencil, Download } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MoneyItem { name: string; amount: string }

export default function PayrollPage() {
  const [tab, setTab] = useState('structures');
  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Salary structures per employee, monthly payroll runs, salary slips and bank payment sheets"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'structures', label: 'Salary structures' },
          { key: 'runs', label: 'Payroll runs' },
        ]}
      />
      {tab === 'structures' && <StructuresTab />}
      {tab === 'runs' && <RunsTab />}
    </>
  );
}

/* ==================================================== salary structures */

function StructuresTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Opt[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    employeeId: '', grade: '', level: '', basic: '', effectiveFrom: '',
    allowances: [] as MoneyItem[], deductions: [] as MoneyItem[],
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    lookups.employees().then(setEmployees);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/payroll/structures');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load salary structures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      employeeId: '', grade: '', level: '', basic: '', effectiveFrom: '',
      allowances: [{ name: 'Allowance', amount: '' }],
      deductions: [{ name: 'Deduction', amount: '' }],
    });
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      employeeId: r.employeeId,
      grade: r.grade ?? '',
      level: r.level ?? '',
      basic: String(r.basic ?? 0),
      effectiveFrom: r.effectiveFrom ?? '',
      allowances: (r.allowances ?? []).map((a: any) => ({ name: a.name, amount: String(a.amount) })),
      deductions: (r.deductions ?? []).map((d: any) => ({ name: d.name, amount: String(d.amount) })),
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.basic || Number(form.basic) < 0) return setFormError('Basic salary is required');
    const clean = (items: MoneyItem[]) =>
      items.filter((i) => i.name.trim() && i.amount !== '').map((i) => ({ name: i.name.trim(), amount: Number(i.amount) }));
    setSaving(true);
    try {
      const body = {
        grade: form.grade || null,
        level: form.level || null,
        basic: Number(form.basic),
        allowances: clean(form.allowances),
        deductions: clean(form.deductions),
        effectiveFrom: form.effectiveFrom || null,
      };
      if (editing) {
        await api.patch(`/payroll/structures/${editing.id}`, body);
        toast.push(t('saved'), 'success');
      } else {
        if (!form.employeeId) { setSaving(false); return setFormError('Select an employee'); }
        await api.post('/payroll/structures', { ...body, employeeId: form.employeeId });
        toast.push(t('created'), 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete salary structure for ${r.nameEn ?? 'this employee'}?`)) return;
    try {
      await api.delete(`/payroll/structures/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const grossOf = (r: any) =>
    Number(r.basic) + (r.allowances ?? []).reduce((s: number, a: any) => s + Number(a.amount), 0);

  const totalNet = rows.reduce((s, r) => s + grossOf(r) - (r.deductions ?? []).reduce((x: number, d: any) => x + Number(d.amount), 0), 0);

  const editList = (key: 'allowances' | 'deductions') => (
    <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3 dark:border-navy-700">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{key === 'allowances' ? 'Allowances' : 'Deductions'}</p>
      <div className="space-y-2">
        {form[key].map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <Input
              value={item.name}
              placeholder="Name (e.g. DA, TA, PF)"
              onChange={(e) =>
                setForm({ ...form, [key]: form[key].map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) })
              }
            />
            <Input
              type="number"
              min={0}
              value={item.amount}
              placeholder="Amount"
              className="w-36"
              onChange={(e) =>
                setForm({ ...form, [key]: form[key].map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)) })
              }
            />
            <button
              type="button"
              className="rounded-md p-2 text-slate-400 hover:text-red-600"
              onClick={() => setForm({ ...form, [key]: form[key].filter((_, i) => i !== idx) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setForm({ ...form, [key]: [...form[key], { name: '', amount: '' }] })}
        >
          <Plus size={13} /> Add line
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> Add structure</Button>
        <span className="ml-auto text-xs text-slate-500">
          {digits(rows.length)} structures · monthly net total <b>{npr(totalNet)}</b>
        </span>
      </Toolbar>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Structures" value={digits(rows.length)} accent="navy" />
        <StatCard label="Current" value={digits(rows.filter((r) => r.isCurrent).length)} accent="green" />
        <StatCard label="Avg. basic" value={npr(rows.length ? rows.reduce((s, r) => s + Number(r.basic), 0) / rows.length : 0)} accent="teal" />
        <StatCard label="Monthly net" value={npr(totalNet)} accent="amber" />
      </div>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : (
          <div className="px-3 pb-3">
            <Table
              columns={[
                {
                  key: 'nameEn',
                  header: 'Employee',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.nameEn}</p>
                      <p className="text-xs text-slate-500">{r.empCode ?? ''} {r.designation ? `· ${r.designation}` : ''}</p>
                    </div>
                  ),
                },
                { key: 'grade', header: 'Grade / Level', render: (r) => `${r.grade ?? '—'}${r.level ? ` · ${r.level}` : ''}` },
                { key: 'basic', header: 'Basic', render: (r) => <b>{npr(r.basic)}</b> },
                {
                  key: 'allowances',
                  header: 'Allowances',
                  render: (r) => (
                    <div className="max-w-[220px] text-xs text-slate-500">
                      {(r.allowances ?? []).map((a: any) => `${a.name} ${npr(a.amount)}`).join(', ') || '—'}
                    </div>
                  ),
                },
                {
                  key: 'deductions',
                  header: 'Deductions',
                  render: (r) => (
                    <div className="max-w-[220px] text-xs text-slate-500">
                      {(r.deductions ?? []).map((d: any) => `${d.name} ${npr(d.amount)}`).join(', ') || '—'}
                    </div>
                  ),
                },
                { key: 'gross', header: 'Gross', render: (r) => npr(grossOf(r)) },
                {
                  key: 'isCurrent',
                  header: 'Status',
                  render: (r) => <Badge tone={r.isCurrent ? 'green' : 'slate'}>{r.isCurrent ? 'current' : 'superseded'}</Badge>,
                },
                { key: 'effectiveFrom', header: 'Effective', render: (r) => (r.effectiveFrom ? fmtAd(r.effectiveFrom) : '—') },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title={t('edit')}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title={t('delete')}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No salary structures yet — add one per employee before running payroll."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={editing ? 'Edit salary structure' : 'Add salary structure'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
              {formError}
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label="Employee" required>
              <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} disabled={Boolean(editing)}>
                <option value="">—</option>
                {employees.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Basic salary (NPR)" required>
            <Input type="number" min={0} value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} />
          </Field>
          <Field label="Effective from">
            <DateInput value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          </Field>
          <Field label="Grade">
            <Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="e.g. 8" />
          </Field>
          <Field label="Level">
            <Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="e.g. Assistant" />
          </Field>
          {editList('allowances')}
          {editList('deductions')}
          <p className="sm:col-span-2 text-xs text-slate-500">
            Saving creates a new current structure and supersedes the previous one for this employee.
          </p>
        </div>
      </Modal>
    </>
  );
}

/* ======================================================= payroll runs */

function RunsTab() {
  const { t, digits, npr } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), label: '', absentDaysDefault: '0' });
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [slip, setSlip] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/payroll/runs');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load payroll runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      const r = await api.post<{ items: number; totalNet: number }>(`/payroll/runs`, {
        month: Number(form.month),
        year: Number(form.year),
        label: form.label || null,
        absentDaysDefault: Number(form.absentDaysDefault || 0),
      });
      toast.push(`Run created — ${r.items} employees, net ${npr(r.totalNet)}`, 'success');
      setOpen(false);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Create failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (r: any) => {
    setDetailLoading(true);
    setDetail({ __loading: true, ...r });
    try {
      const d = await api.get<any>(`/payroll/runs/${r.id}`);
      setDetail(d);
    } catch (e) {
      setDetail(null);
      toast.push(e instanceof ApiError ? e.message : 'Failed to load run', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const act = async (r: any, action: 'finalize' | 'pay') => {
    if (action === 'pay' && !window.confirm(`Mark payroll ${r.label ?? `${r.month}/${r.year}`} as PAID? This posts the salary expense to the cash book.`)) return;
    if (action === 'finalize' && !window.confirm('Finalize this run? It locks the amounts.')) return;
    setBusy(true);
    try {
      await api.post(`/payroll/runs/${r.id}/${action}`);
      toast.push(action === 'pay' ? 'Run marked as paid and expense posted' : 'Run finalized', 'success');
      load();
      if (detail?.id === r.id) openDetail(r);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete payroll run ${r.label ?? `${r.month}/${r.year}`}?`)) return;
    try {
      await api.delete(`/payroll/runs/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const openSlip = async (runId: string, employeeId: string) => {
    try {
      const s = await api.get<any>(`/payroll/runs/${runId}/slip/${employeeId}`);
      setSlip(s);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed to load slip', 'error');
    }
  };

  const downloadBankSheet = async (r: any) => {
    try {
      const blob = await api.download(`/payroll/runs/${r.id}/bank-sheet`, { format: 'xlsx' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bank-sheet-${r.month}-${r.year}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Export failed', 'error');
    }
  };

  const statusTone = (s: string) => (s === 'paid' ? 'green' : s === 'finalized' ? 'amber' : 'slate');

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> New payroll run</Button>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : (
          <div className="px-3 pb-3">
            <Table
              columns={[
                { key: 'label', header: 'Run', render: (r) => <span className="font-medium">{r.label ?? `${r.month}/${r.year}`}</span> },
                { key: 'month', header: 'Month', render: (r) => `${MONTHS[(r.month ?? 1) - 1] ?? r.month} ${digits(r.year)}` },
                { key: 'totalGross', header: 'Gross', render: (r) => npr(r.totalGross) },
                { key: 'totalDeductions', header: 'Deductions', render: (r) => npr(r.totalDeductions) },
                { key: 'totalNet', header: 'Net payable', render: (r) => <b>{npr(r.totalNet)}</b> },
                { key: 'status', header: t('status'), render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="secondary" size="sm" onClick={() => openDetail(r)}>View</Button>
                      {r.status === 'draft' && (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(r, 'finalize')}>
                          <CheckCircle2 size={13} /> Finalize
                        </Button>
                      )}
                      {r.status !== 'paid' && (
                        <Button variant="teal" size="sm" disabled={busy} onClick={() => act(r, 'pay')}>
                          <Banknote size={13} /> Pay
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => downloadBankSheet(r)} title="Bank payment sheet">
                        <Download size={13} />
                      </Button>
                      {r.status !== 'paid' && (
                        <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No payroll runs yet. Add salary structures, then create a run for the month."
            />
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------------- create run */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New payroll run"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={create} loading={saving}>{saving ? t('saving') : 'Generate run'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-300">
            Computes gross/net from every <b>current</b> salary structure for active employees. One run per month.
          </p>
          <Field label="Month" required>
            <Select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Year" required>
            <Input type="number" min={2070} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </Field>
          <Field label="Label (optional)">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Mangsir salary" />
          </Field>
          <Field label="Default absent days">
            <Input type="number" min={0} max={31} value={form.absentDaysDefault} onChange={(e) => setForm({ ...form, absentDaysDefault: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* -------------------------------------------------------- run detail */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        wide
        title={`Payroll — ${detail?.label ?? (detail ? `${detail.month}/${detail.year}` : '')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>{t('close')}</Button>
            {detail?.status === 'draft' && (
              <Button variant="secondary" disabled={busy} onClick={() => act(detail, 'finalize')}><CheckCircle2 size={14} /> Finalize</Button>
            )}
            {detail && detail.status !== 'paid' && (
              <Button variant="teal" disabled={busy} onClick={() => act(detail, 'pay')}><Banknote size={14} /> Mark paid</Button>
            )}
            <Button variant="teal" onClick={() => window.print()}><Printer size={14} /> Print</Button>
          </>
        }
      >
        {detailLoading || detail?.__loading ? (
          <LoadingBlock />
        ) : detail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-navy-800">
                <p className="text-xs uppercase text-slate-400">Gross</p>
                <p className="font-semibold">{npr(detail.totalGross)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-navy-800">
                <p className="text-xs uppercase text-slate-400">Deductions</p>
                <p className="font-semibold">{npr(detail.totalDeductions)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-navy-800">
                <p className="text-xs uppercase text-slate-400">Net</p>
                <p className="font-semibold text-teal-700">{npr(detail.totalNet)}</p>
              </div>
            </div>
            <Table
              columns={[
                {
                  key: 'nameEn',
                  header: 'Employee',
                  render: (r: any) => (
                    <div>
                      <p className="font-medium">{r.nameEn}</p>
                      <p className="text-xs text-slate-500">{r.empCode ?? ''} {r.designation ? `· ${r.designation}` : ''}</p>
                    </div>
                  ),
                },
                { key: 'basic', header: 'Basic', render: (r: any) => npr(r.basic) },
                { key: 'gross', header: 'Gross', render: (r: any) => npr(r.gross) },
                { key: 'totalDeductions', header: 'Deductions', render: (r: any) => npr(r.totalDeductions) },
                { key: 'net', header: 'Net', render: (r: any) => <b>{npr(r.net)}</b> },
                { key: 'status', header: 'Status', render: (r: any) => <Badge tone={r.status === 'paid' ? 'green' : 'slate'}>{r.status}</Badge> },
                {
                  key: '__s',
                  header: '',
                  className: 'text-right',
                  render: (r: any) => (
                    <Button variant="secondary" size="sm" onClick={() => openSlip(detail.id, r.employeeId)}>Slip</Button>
                  ),
                },
              ]}
              rows={detail.items ?? []}
              empty="No items in this run."
            />
          </div>
        ) : null}
      </Modal>

      {/* ------------------------------------------------------- salary slip */}
      <Modal
        open={slip !== null}
        onClose={() => setSlip(null)}
        title={`Salary slip — ${slip?.employee?.nameEn ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSlip(null)}>{t('close')}</Button>
            <Button variant="teal" onClick={() => window.print()}><Printer size={14} /> {t('print')}</Button>
          </>
        }
      >
        {slip ? (
          <div className="space-y-3 text-sm print:text-black">
            <div className="border-b border-dashed border-slate-300 pb-2">
              <p className="text-base font-bold">{slip.school?.nameEn}</p>
              <p className="text-xs text-slate-500">{slip.school?.address ?? ''} {slip.school?.municipality ? `· ${slip.school.municipality}` : ''}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs uppercase text-slate-400">Employee</p>
                <p className="font-medium">{slip.employee?.nameEn}</p>
                <p className="text-xs text-slate-500">
                  {slip.employee?.empCode ?? ''} · {slip.employee?.designation ?? ''}
                </p>
                <p className="text-xs text-slate-500">
                  {slip.employee?.bankName ?? '—'} {slip.employee?.bankAccount ?? ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-400">Period</p>
                <p className="font-medium">{MONTHS[(slip.run.month ?? 1) - 1]} {slip.run.year}</p>
                <Badge tone={slip.run.status === 'paid' ? 'green' : 'slate'}>{slip.run.status}</Badge>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100 dark:border-navy-800">
                  <td className="py-1.5">Basic</td>
                  <td className="py-1.5 text-right">{npr(slip.salary.basic)}</td>
                </tr>
                {(slip.salary.allowances ?? []).map((a: any, i: number) => (
                  <tr key={`a${i}`} className="border-b border-slate-100 dark:border-navy-800">
                    <td className="py-1.5">{a.name}</td>
                    <td className="py-1.5 text-right text-emerald-600">+ {npr(a.amount)}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-100 font-semibold dark:border-navy-800">
                  <td className="py-1.5">Gross</td>
                  <td className="py-1.5 text-right">{npr(slip.salary.gross)}</td>
                </tr>
                {(slip.salary.deductions ?? []).map((d: any, i: number) => (
                  <tr key={`d${i}`} className="border-b border-slate-100 dark:border-navy-800">
                    <td className="py-1.5">{d.name}</td>
                    <td className="py-1.5 text-right text-red-600">− {npr(d.amount)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-2">Net payable</td>
                  <td className="py-2 text-right text-teal-700">{npr(slip.salary.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
