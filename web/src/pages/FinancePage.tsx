import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, Trash2, Wand2, Printer, Pencil } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import CrudPage, { type CrudColumn, type FieldDef } from '../components/CrudPage';
import { Tabs, PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Checkbox, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const METHODS = ['cash', 'bank', 'esewa', 'khalti', 'fonepay', 'connectips', 'qr', 'cheque', 'other'];
const STATUS_TONE: Record<string, any> = { paid: 'green', partial: 'amber', unpaid: 'red', waived: 'slate' };
const FEE_STATUS = ['unpaid', 'partial', 'paid', 'waived'];

export default function FinancePage() {
  const { t, digits, npr, fmtAd, lang } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState('dues');

  return (
    <>
      <PageHeader
        title={t('finance')}
        subtitle="Fee heads, structures, dues, payments, scholarships, ledger accounts and transactions"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'dues', label: 'Student dues' },
          { key: 'payments', label: 'Payments' },
          { key: 'structures', label: 'Fee structures' },
          { key: 'feeHeads', label: 'Fee heads' },
          { key: 'scholarships', label: t('scholarships') },
          { key: 'accounts', label: 'Account heads' },
          { key: 'transactions', label: 'Transactions' },
        ]}
      />
      {tab === 'dues' && <DuesTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'feeHeads' && <FeeHeadsTab />}
      {tab === 'scholarships' && <ScholarshipsTab />}
      {tab === 'accounts' && <AccountHeadsTab />}
      {tab === 'transactions' && <TransactionsTab />}
      {void npr}{void fmtAd}{void lang}{void digits}
    </>
  );
}

/* ============================================================ student dues */

function DuesTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [classId, setClassId] = useState('');
  const [feeHeadId, setFeeHeadId] = useState('');

  const [lk, setLk] = useState<{ classes: Opt[]; feeHeads: Opt[]; students: Opt[]; years: Opt[] }>({
    classes: [], feeHeads: [], students: [], years: [],
  });

  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ feeHeadId: '', label: '', period: '', dueDate: '', classId: '', amount: '', overwrite: false });
  const [genBusy, setGenBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ studentId: '', amount: '', method: 'cash', reference: '', remarks: '', autoAllocate: true });
  const [payBusy, setPayBusy] = useState(false);

  const [editRow, setEditRow] = useState<any>(null);
  const [edit, setEdit] = useState({ fine: '', discount: '', status: 'unpaid', dueDate: '', waivedReason: '' });
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    loadAll({ classes: lookups.classes, feeHeads: lookups.feeHeads, students: lookups.students, years: lookups.academicYears }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/student-fees', {
        ...(status ? { status } : {}),
        ...(classId ? { classId } : {}),
        ...(feeHeadId ? { feeHeadId } : {}),
      });
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load dues');
    } finally {
      setLoading(false);
    }
  }, [status, classId, feeHeadId]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    if (!gen.feeHeadId || !gen.label.trim()) {
      toast.push('Fee head and label are required', 'error');
      return;
    }
    setGenBusy(true);
    try {
      const r = await api.post<{ created: number; skipped: number; students: number }>(
        '/finance/student-fees/generate',
        {
          feeHeadId: gen.feeHeadId,
          label: gen.label.trim(),
          period: gen.period || null,
          dueDate: gen.dueDate || null,
          classId: gen.classId || null,
          amount: gen.amount === '' ? undefined : Number(gen.amount),
          overwrite: gen.overwrite,
        },
      );
      toast.push(`Created ${r.created}, skipped ${r.skipped} of ${r.students} students`, 'success');
      setGenOpen(false);
      setGen({ feeHeadId: '', label: '', period: '', dueDate: '', classId: '', amount: '', overwrite: false });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Generation failed', 'error');
    } finally {
      setGenBusy(false);
    }
  };

  const recordPayment = async () => {
    if (!pay.studentId || !pay.amount || Number(pay.amount) <= 0) {
      toast.push('Select a student and enter an amount', 'error');
      return;
    }
    setPayBusy(true);
    try {
      const r = await api.post<{ receiptNo: string; allocations: number }>('/finance/payments', {
        studentId: pay.studentId,
        amount: Number(pay.amount),
        method: pay.method,
        reference: pay.reference || null,
        remarks: pay.remarks || null,
        autoAllocate: pay.autoAllocate,
        allocations: [],
      });
      toast.push(`Receipt ${r.receiptNo} recorded (${r.allocations} dues adjusted)`, 'success');
      setPayOpen(false);
      setPay({ studentId: '', amount: '', method: 'cash', reference: '', remarks: '', autoAllocate: true });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Payment failed', 'error');
    } finally {
      setPayBusy(false);
    }
  };

  const openEdit = (r: any) => {
    setEditRow(r);
    setEdit({
      fine: String(r.fine ?? 0),
      discount: String(r.discount ?? 0),
      status: r.status ?? 'unpaid',
      dueDate: r.dueDate ?? '',
      waivedReason: '',
    });
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setEditBusy(true);
    try {
      await api.patch(`/finance/student-fees/${editRow.id}`, {
        fine: Number(edit.fine || 0),
        discount: Number(edit.discount || 0),
        status: edit.status,
        dueDate: edit.dueDate || null,
        ...(edit.status === 'waived' && edit.waivedReason ? { waivedReason: edit.waivedReason } : {}),
      });
      toast.push(t('saved'), 'success');
      setEditRow(null);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setEditBusy(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete the due "${r.label}" for ${r.studentName}?`)) return;
    try {
      await api.delete(`/finance/student-fees/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('all')} — {t('status')}</option>
          {FEE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select className="w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('all')} — {t('classes')}</option>
          {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select className="w-auto" value={feeHeadId} onChange={(e) => setFeeHeadId(e.target.value)}>
          <option value="">{t('all')} — Fee head</option>
          {lk.feeHeads.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={() => setGenOpen(true)}>
          <Wand2 size={14} /> Generate dues
        </Button>
        <Button variant="teal" size="sm" onClick={() => setPayOpen(true)}>
          <Receipt size={14} /> Record payment
        </Button>
        <span className="ml-auto text-xs font-medium text-slate-500">
          Outstanding: <span className="text-red-600 dark:text-red-400">{npr(meta?.outstanding ?? 0)}</span>
        </span>
      </Toolbar>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Dues" value={digits(rows.length)} accent="navy" />
        <StatCard label={t('paid')} value={digits(rows.filter((r) => r.status === 'paid').length)} accent="green" />
        <StatCard label="Partial" value={digits(rows.filter((r) => r.status === 'partial').length)} accent="amber" />
        <StatCard label={t('unpaid')} value={digits(rows.filter((r) => r.status === 'unpaid').length)} accent="red" />
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
                  key: 'studentName',
                  header: t('students'),
                  render: (r) => (
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{r.studentName}</p>
                      <p className="text-xs text-slate-500">{digits(r.admissionNo)} · {r.className ?? '—'} {r.sectionName ?? ''}</p>
                    </div>
                  ),
                },
                {
                  key: 'label',
                  header: 'Dues',
                  render: (r) => (
                    <div>
                      <p className="text-sm font-medium">{r.label}</p>
                      <p className="text-xs text-slate-500">{r.headName ?? '—'}{r.period ? ` · ${r.period}` : ''}</p>
                    </div>
                  ),
                },
                { key: 'dueDate', header: 'Due', render: (r) => <span className="text-xs">{r.dueDate ? fmtAd(r.dueDate) : '—'}</span> },
                { key: 'amount', header: 'Amount', render: (r) => npr(r.amount) },
                { key: 'discount', header: 'Less', render: (r) => (Number(r.discount) ? <span className="text-teal-600">− {npr(r.discount)}</span> : '—') },
                { key: 'fine', header: 'Fine', render: (r) => (Number(r.fine) ? <span className="text-amber-600">+ {npr(r.fine)}</span> : '—') },
                { key: 'paidAmount', header: 'Paid', render: (r) => <span className="text-emerald-600">{npr(r.paidAmount)}</span> },
                {
                  key: 'due',
                  header: 'Balance',
                  render: (r) => <span className={`font-semibold ${r.due > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'}`}>{npr(r.due)}</span>,
                },
                { key: 'status', header: t('status'), render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status}</Badge> },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(r)}
                        title={t('edit')}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-navy-800"
                      >
                        <Pencil size={15} />
                      </button>
                      {!Number(r.paidAmount) && (
                        <button
                          onClick={() => remove(r)}
                          title={t('delete')}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-navy-800"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No dues yet — use “Generate dues” to bill students from a fee structure."
            />
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------------ generate */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate student dues"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)} disabled={genBusy}>{t('cancel')}</Button>
            <Button onClick={generate} loading={genBusy}>{t('create')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-300">
            Bills every active student (optionally filtered by class). If no amount is given, the amount is taken from
            the class fee structure for the current academic year.
          </p>
          <Field label="Fee head" required>
            <Select value={gen.feeHeadId} onChange={(e) => setGen({ ...gen, feeHeadId: e.target.value })}>
              <option value="">—</option>
              {lk.feeHeads.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </Select>
          </Field>
          <Field label="Label" required hint="e.g. Monthly fee — Mangsir">
            <Input value={gen.label} onChange={(e) => setGen({ ...gen, label: e.target.value })} />
          </Field>
          <Field label="Period">
            <Input value={gen.period} onChange={(e) => setGen({ ...gen, period: e.target.value })} placeholder="2083-08" />
          </Field>
          <Field label="Due date">
            <DateInput value={gen.dueDate} onChange={(e) => setGen({ ...gen, dueDate: e.target.value })} />
          </Field>
          <Field label={t('classes')}>
            <Select value={gen.classId} onChange={(e) => setGen({ ...gen, classId: e.target.value })}>
              <option value="">{t('all')} classes</option>
              {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Amount (NPR)" hint="blank = use fee structure">
            <Input type="number" min={0} value={gen.amount} onChange={(e) => setGen({ ...gen, amount: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Overwrite existing dues with the same label"
              checked={gen.overwrite}
              onChange={(e) => setGen({ ...gen, overwrite: e.target.checked })}
            />
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------ payment */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record fee payment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={payBusy}>{t('cancel')}</Button>
            <Button onClick={recordPayment} loading={payBusy}>{payBusy ? t('saving') : 'Receive'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('students')} required>
              <Select value={pay.studentId} onChange={(e) => setPay({ ...pay, studentId: e.target.value })}>
                <option value="">—</option>
                {lk.students.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Amount (NPR)" required>
            <Input type="number" min={0.01} step={0.01} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          </Field>
          <Field label="Method">
            <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Cheque / txn id" />
          </Field>
          <Field label={t('remarks')}>
            <Input value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Auto-allocate to the oldest unpaid dues"
              checked={pay.autoAllocate}
              onChange={(e) => setPay({ ...pay, autoAllocate: e.target.checked })}
            />
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------- edit due */}
      <Modal
        open={editRow !== null}
        onClose={() => setEditRow(null)}
        title={`Adjust due — ${editRow?.studentName ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRow(null)} disabled={editBusy}>{t('cancel')}</Button>
            <Button onClick={saveEdit} loading={editBusy}>{t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fine (NPR)">
            <Input type="number" min={0} value={edit.fine} onChange={(e) => setEdit({ ...edit, fine: e.target.value })} />
          </Field>
          <Field label="Discount (NPR)">
            <Input type="number" min={0} value={edit.discount} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} />
          </Field>
          <Field label={t('status')}>
            <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {FEE_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Due date">
            <DateInput value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
          </Field>
          {edit.status === 'waived' && (
            <div className="sm:col-span-2">
              <Field label="Waiver reason" required>
                <Input value={edit.waivedReason} onChange={(e) => setEdit({ ...edit, waivedReason: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

/* ============================================================== payments */

function PaymentsTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/payments', method ? { method } : undefined);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [method]);

  useEffect(() => {
    load();
  }, [load]);

  const openReceipt = async (row: any) => {
    setReceiptLoading(true);
    setReceipt({ __loading: true });
    try {
      const r = await api.get<any>(`/finance/payments/${row.id}/receipt`);
      setReceipt(r);
    } catch (e) {
      setReceipt(null);
      toast.push(e instanceof ApiError ? e.message : 'Failed to load receipt', 'error');
    } finally {
      setReceiptLoading(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete receipt ${r.receiptNo}? This reverses its allocations.`)) return;
    try {
      await api.delete(`/finance/payments/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">{t('all')} — {t('method')}</option>
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-500">
          {digits(rows.length)} {t('receipts')} · {npr(total)}
        </span>
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
                { key: 'receiptNo', header: 'Receipt', render: (r) => <span className="font-mono text-xs font-semibold">{r.receiptNo}</span> },
                {
                  key: 'studentName',
                  header: t('students'),
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.studentName}</p>
                      <p className="text-xs text-slate-500">{digits(r.admissionNo)} · {r.className ?? ''} {r.sectionName ?? ''}</p>
                    </div>
                  ),
                },
                { key: 'amount', header: t('amount'), render: (r) => <span className="font-semibold">{npr(r.amount)}</span> },
                { key: 'method', header: t('method'), render: (r) => <Badge tone="navy">{r.method}</Badge> },
                { key: 'reference', header: 'Ref', render: (r) => <span className="text-xs">{r.reference ?? '—'}</span> },
                { key: 'paidAt', header: t('date'), render: (r) => <span className="text-xs">{fmtAd(r.paidAt)}</span> },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="secondary" size="sm" onClick={() => openReceipt(r)}>
                        <Receipt size={13} /> {t('view')}
                      </Button>
                      <button
                        onClick={() => remove(r)}
                        title={t('delete')}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-navy-800"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No payments recorded yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={receipt !== null}
        onClose={() => setReceipt(null)}
        wide
        title={`Receipt ${receipt?.payment?.receiptNo ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceipt(null)}>{t('close')}</Button>
            <Button variant="teal" onClick={() => window.print()} disabled={receiptLoading}>
              <Printer size={14} /> {t('print')}
            </Button>
          </>
        }
      >
        {receiptLoading || receipt?.__loading ? (
          <LoadingBlock />
        ) : receipt ? (
          <div className="space-y-3 text-sm print:text-black">
            <div className="flex items-start justify-between gap-4 border-b border-dashed border-slate-300 pb-3">
              <div>
                <p className="text-base font-bold text-navy-800 dark:text-white">{receipt.school?.nameEn}</p>
                <p className="text-xs text-slate-500">
                  {receipt.school?.address ?? ''} {receipt.school?.municipality ? `· ${receipt.school.municipality}` : ''}{' '}
                  {receipt.school?.district ? `· ${receipt.school.district}` : ''}
                </p>
                <p className="text-xs text-slate-500">{receipt.school?.phone ?? ''}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold">{receipt.payment.receiptNo}</p>
                <p className="text-xs text-slate-500">{fmtAd(receipt.payment.paidAt)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs uppercase text-slate-400">{t('students')}</p>
                <p className="font-medium">{receipt.student?.nameEn}</p>
                <p className="text-xs text-slate-500">
                  {digits(receipt.student?.admissionNo ?? '')} · {receipt.student?.className ?? ''} {receipt.student?.sectionName ?? ''} · Roll{' '}
                  {digits(receipt.student?.rollNo ?? '—')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-400">{t('amount')}</p>
                <p className="text-lg font-bold text-teal-700">{npr(receipt.payment.amount)}</p>
                <p className="text-xs text-slate-500">{receipt.payment.method}</p>
              </div>
            </div>
            <Table
              columns={[
                { key: 'label', header: 'Particulars', render: (i: any) => `${i.label}${i.period ? ` (${i.period})` : ''}` },
                { key: 'feeHeadName', header: 'Head', render: (i: any) => i.feeHeadName ?? '—' },
                { key: 'amount', header: t('amount'), render: (i: any) => npr(i.amount) },
              ]}
              rows={receipt.items ?? []}
              empty="Auto-allocated (see ledger)"
            />
            <div className="flex justify-between border-t border-dashed border-slate-300 pt-3 text-xs text-slate-500">
              <span>Received by: {receipt.payment.receivedBy ? 'Authorized staff' : '—'}</span>
              <span>{receipt.payment.remarks ?? ''}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/* =========================================================== structures */

function StructuresTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lk, setLk] = useState<{ classes: Opt[]; feeHeads: Opt[] }>({ classes: [], feeHeads: [] });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ classId: '', name: '', items: [] as { feeHeadId: string; amount: string }[] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll({ classes: lookups.classes, feeHeads: lookups.feeHeads }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/fee-structures');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load structures');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ classId: '', name: '', items: lk.feeHeads.map((h) => ({ feeHeadId: h.value, amount: '' })) });
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      classId: r.classId,
      name: r.name ?? '',
      items: lk.feeHeads.map((h) => {
        const existing = (r.items ?? []).find((i: any) => i.feeHeadId === h.value);
        return { feeHeadId: h.value, amount: existing ? String(existing.amount) : '' };
      }),
    });
    setOpen(true);
  };

  // If the modal was opened before the fee-head lookup resolved, fill the rows once it arrives.
  useEffect(() => {
    if (open && !editing && form.items.length === 0 && lk.feeHeads.length) {
      setForm((f) => ({ ...f, items: lk.feeHeads.map((h) => ({ feeHeadId: h.value, amount: '' })) }));
    }
  }, [open, editing, form.items.length, lk.feeHeads]);

  const save = async () => {
    if (!form.classId) {
      toast.push('Select a class', 'error');
      return;
    }
    const items = form.items.filter((i) => i.amount !== '' && Number(i.amount) > 0).map((i) => ({ feeHeadId: i.feeHeadId, amount: Number(i.amount) }));
    if (!items.length) {
      toast.push('Enter at least one amount', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/finance/fee-structures/${editing.id}`, { name: form.name || undefined, items });
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/finance/fee-structures', { classId: form.classId, name: form.name || undefined, items });
        toast.push(t('created'), 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete the fee structure for ${r.className ?? 'this class'}?`)) return;
    try {
      await api.delete(`/finance/fee-structures/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={openCreate}>
          <Plus size={14} /> {t('add')} {t('structures')}
        </Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} {t('records')}</span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No fee structures yet. Create one per class so dues can be generated automatically.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-[180px]">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{r.className ?? '—'}</p>
                  <p className="text-xs text-slate-500">{r.name ?? 'Standard fee structure'}{r.academicYearId ? '' : ' · current year'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(r.items ?? []).map((i: any) => (
                    <span key={i.id ?? i.feeHeadId} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-navy-800 dark:text-slate-200">
                      {i.headName} · <b>{npr(i.amount)}</b>
                      {i.frequency && i.frequency !== 'monthly' ? ` / ${i.frequency}` : ''}
                    </span>
                  ))}
                  {!r.items?.length && <span className="text-xs text-slate-400">No items</span>}
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(r)}><Pencil size={13} /> {t('edit')}</Button>
                  <button
                    onClick={() => remove(r)}
                    className="rounded-md p-1.5 text-slate-400 hover:text-red-600"
                    title={t('delete')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={editing ? `${t('edit')} — ${t('structures')}` : `${t('create')} — ${t('structures')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('classes')} required>
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} disabled={Boolean(editing)}>
                <option value="">—</option>
                {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label={`${t('name')} (optional)`}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard fee structure" />
            </Field>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-navy-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-navy-700">
                  <th className="px-3 py-2">Fee head</th>
                  <th className="px-3 py-2 w-40">Amount (NPR)</th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, idx) => {
                  const head = lk.feeHeads.find((h) => h.value === it.feeHeadId);
                  return (
                    <tr key={it.feeHeadId} className="border-b border-slate-100 last:border-0 dark:border-navy-800/60">
                      <td className="px-3 py-1.5">{head?.label ?? it.feeHeadId}</td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          value={it.amount}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              items: form.items.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)),
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
                {!form.items.length && (
                  <tr>
                    <td colSpan={2} className="px-3 py-4 text-center text-xs text-slate-500">
                      No fee heads defined yet — create them in the “Fee heads” tab first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Blank amounts are skipped. {fmtAd(new Date())} is today’s date for reference.
          </p>
        </div>
      </Modal>
    </>
  );
}

/* ============================================================ fee heads */

function FeeHeadsTab() {
  const { t, digits } = useI18n();
  const columns: CrudColumn[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code ?? '—'}</span> },
    { key: 'nameEn', header: t('nameEn'), render: (r) => <span className="font-medium">{r.nameEn}</span> },
    { key: 'nameNe', header: t('nameNe'), render: (r) => r.nameNe ?? '—' },
    { key: 'frequency', header: t('frequency'), render: (r) => <Badge tone="navy">{r.frequency}</Badge> },
    { key: 'active', header: t('active'), render: (r) => (r.active ? t('yes') : t('no')) },
    { key: 'orderIndex', header: '#', render: (r) => digits(r.orderIndex ?? 0) },
  ];
  const fields: FieldDef[] = [
    { name: 'code', label: 'Code', placeholder: 'Tuition' },
    { name: 'frequency', label: t('frequency'), type: 'select', required: true, options: [
      { value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' },
      { value: 'one_time', label: 'One time' }, { value: 'event', label: 'Event' },
      { value: 'quarterly', label: 'Quarterly' },
    ] },
    { name: 'nameEn', label: 'nameEn', required: true },
    { name: 'nameNe', label: 'nameNe' },
    { name: 'orderIndex', label: 'Order', type: 'number', min: 0, max: 999 },
    { name: 'active', label: t('active'), type: 'checkbox', placeholder: 'Active' },
    { name: 'description', label: 'description', type: 'textarea', colSpan: 2 },
  ];
  return (
    <CrudPage
      endpoint="/finance/fee-heads"
      title="Fee heads"
      subtitle="What the school charges for — frequencies drive due generation"
      columns={columns}
      fields={fields}
      defaultSort="orderIndex"
      defaultOrder="asc"
      createLabel="Add fee head"
      lookups={async () => ({})}
    />
  );
}

/* ========================================================== scholarships */

function ScholarshipsTab() {
  const { t, digits, npr } = useI18n();
  const columns: CrudColumn[] = [
    {
      key: 'studentName',
      header: t('students'),
      render: (r) => (
        <div>
          <p className="font-medium">{r.studentName}</p>
          <p className="text-xs text-slate-500">{digits(r.admissionNo)} · {r.className ?? '—'}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => <Badge tone="teal">{r.type}</Badge> },
    { key: 'name', header: t('name'), render: (r) => r.name ?? '—' },
    { key: 'percent', header: '%', render: (r) => digits(r.percent) },
    { key: 'amount', header: t('amount'), render: (r) => (Number(r.amount) ? npr(r.amount) : '—') },
    { key: 'reason', header: t('reason'), render: (r) => <span className="block max-w-[200px] truncate">{r.reason ?? '—'}</span> },
    { key: 'active', header: t('active'), render: (r) => (r.active ? <Badge tone="green">active</Badge> : <Badge tone="slate">inactive</Badge>) },
  ];
  const fields: FieldDef[] = [
    { name: 'studentId', label: 'students', type: 'select', options: 'students', required: true },
    {
      name: 'type', label: 'Type', type: 'select', required: true, options: [
        { value: 'discount', label: 'Discount' }, { value: 'full_waiver', label: 'Full waiver' },
        { value: 'scholarship', label: 'Scholarship' }, { value: 'sibling', label: 'Sibling' },
        { value: 'staff_child', label: 'Staff child' }, { value: 'govt', label: 'Government' },
      ],
    },
    { name: 'name', label: t('name') },
    { name: 'percent', label: 'Percent', type: 'number', min: 0, max: 100 },
    { name: 'amount', label: 'Amount (NPR)', type: 'number', min: 0, max: 10000000 },
    { name: 'startDate', label: 'from', type: 'date' },
    { name: 'endDate', label: 'to', type: 'date' },
    { name: 'reason', label: 'reason', type: 'textarea', colSpan: 2 },
  ];
  return (
    <CrudPage
      endpoint="/finance/scholarships"
      title={t('scholarships')}
      subtitle="Discounts and waivers applied automatically when dues are generated"
      columns={columns}
      fields={fields}
      createLabel="Add scholarship"
      lookups={async () => loadAll({ students: lookups.students }) as any}
    />
  );
}

/* ======================================================== account heads */

function AccountHeadsTab() {
  const { t } = useI18n();
  const GROUPS = [
    'government_grant', 'local_grant', 'fee_income', 'donation', 'other_income',
    'salary', 'administrative', 'teaching_material', 'infrastructure', 'utility', 'other_expense',
    'asset', 'liability',
  ];
  const columns: CrudColumn[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code ?? '—'}</span> },
    { key: 'nameEn', header: t('nameEn'), render: (r) => <span className="font-medium">{r.nameEn}</span> },
    { key: 'nameNe', header: t('nameNe'), render: (r) => r.nameNe ?? '—' },
    { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'income' ? 'green' : r.type === 'expense' ? 'red' : 'navy'}>{r.type}</Badge> },
    { key: 'group', header: 'Group', render: (r) => <span className="text-xs">{String(r.group).replace(/_/g, ' ')}</span> },
    { key: 'active', header: t('active'), render: (r) => (r.active ? t('yes') : t('no')) },
  ];
  const fields: FieldDef[] = [
    { name: 'code', label: 'Code' },
    {
      name: 'type', label: 'Type', type: 'select', required: true, options: [
        { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' },
        { value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' },
      ],
    },
    { name: 'nameEn', label: 'nameEn', required: true },
    { name: 'nameNe', label: 'nameNe' },
    { name: 'group', label: 'Group', type: 'select', required: true, options: GROUPS.map((g) => ({ value: g, label: g.replace(/_/g, ' ') })) },
    { name: 'active', label: t('active'), type: 'checkbox', placeholder: 'Active' },
  ];
  return (
    <CrudPage
      endpoint="/finance/account-heads"
      title="Account heads"
      subtitle="Government/local grants, fee income and expense categories for the cash book"
      columns={columns}
      fields={fields}
      defaultSort="code"
      defaultOrder="asc"
      createLabel="Add account head"
      lookups={async () => ({})}
    />
  );
}

/* ========================================================== transactions */

function TransactionsTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [heads, setHeads] = useState<Opt[]>([]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ txnDate: new Date().toISOString().slice(0, 10), headId: '', type: 'expense', amount: '', mode: 'cash', description: '', reference: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    lookups.accountHeads().then(setHeads);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/transactions', type ? { type } : undefined);
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.headId || !form.amount || Number(form.amount) <= 0) {
      toast.push('Account head and amount are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/finance/transactions', {
        txnDate: form.txnDate,
        headId: form.headId,
        type: form.type,
        amount: Number(form.amount),
        mode: form.mode,
        description: form.description || null,
        reference: form.reference || null,
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ ...form, amount: '', description: '', reference: '' });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/finance/transactions/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('all')} — Type</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus size={14} /> Post transaction
        </Button>
        <span className="ml-auto flex gap-4 text-xs">
          <span className="text-emerald-600">In {npr(meta?.income ?? 0)}</span>
          <span className="text-red-600">Out {npr(meta?.expense ?? 0)}</span>
          <span className="font-semibold">Net {npr(meta?.net ?? 0)}</span>
        </span>
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
                { key: 'txnDate', header: t('date'), render: (r) => <span className="text-xs">{fmtAd(r.txnDate)}</span> },
                {
                  key: 'headName',
                  header: 'Head',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{langHead(r)}</p>
                      <p className="text-xs text-slate-500">{r.headCode ?? ''} {r.category ? `· ${String(r.category).replace(/_/g, ' ')}` : ''}</p>
                    </div>
                  ),
                },
                { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'income' ? 'green' : 'red'}>{r.type}</Badge> },
                { key: 'mode', header: 'Mode', render: (r) => <Badge tone="navy">{r.mode}</Badge> },
                { key: 'description', header: t('details'), render: (r) => <span className="block max-w-[280px] truncate">{r.description ?? '—'}</span> },
                { key: 'reference', header: 'Ref', render: (r) => <span className="text-xs">{r.reference ?? '—'}</span> },
                {
                  key: 'amount',
                  header: t('amount'),
                  render: (r) => (
                    <span className={`font-semibold ${r.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {r.type === 'income' ? '+' : '−'} {npr(r.amount)}
                    </span>
                  ),
                },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <button
                      onClick={() => remove(r)}
                      className="rounded-md p-1.5 text-slate-400 hover:text-red-600"
                      title={t('delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  ),
                },
              ]}
              rows={rows}
              empty="No transactions posted yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Post transaction"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('date')} required>
            <DateInput value={form.txnDate} onChange={(e) => setForm({ ...form, txnDate: e.target.value })} />
          </Field>
          <Field label="Type" required>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="income">Income (receipt)</option>
              <option value="expense">Expense (payment)</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Account head" required hint="Must match the transaction type">
              <Select value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}>
                <option value="">—</option>
                {heads
                  .filter((h) => true)
                  .map((h) => {
                    const full = heads.find((x) => x.value === h.value);
                    return <option key={h.value} value={h.value}>{full?.label ?? h.label}</option>;
                  })}
              </Select>
            </Field>
          </div>
          <Field label="Amount (NPR)" required>
            <Input type="number" min={0.01} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Mode">
            <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="cheque">Cheque</option>
              <option value="digital">Digital</option>
            </Select>
          </Field>
          <Field label={t('details')}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function langHead(r: any): string {
  return r.headName ?? '—';
}
