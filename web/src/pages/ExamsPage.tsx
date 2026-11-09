import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Field, Input, Select, Modal, Badge, useToast, Table, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const EXAM_TYPES = [
  'terminal_1', 'terminal_2', 'terminal_3', 'final', 'unit', 'monthly',
  'practical', 'internal', 'ble', 'see_prep', 'neb', 'custom',
];
const STATUS_TONE: Record<string, any> = {
  draft: 'slate', marks_entry: 'amber', published: 'green', locked: 'navy',
};

export default function ExamsPage() {
  const { t, digits, fmtAd, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scales, setScales] = useState<Opt[]>([]);
  const [form, setForm] = useState({
    name: '', nameNe: '', type: 'terminal_1', startDate: '', endDate: '', gradingScaleId: '', remarks: '',
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/exams', {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      });
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadAll({ scales: lookups.gradingScales }).then((d) => setScales(d.scales));
  }, []);

  const create = async () => {
    if (!form.name.trim()) {
      setFormError('Exam name is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const row = await api.post<any>('/exams', {
        ...form,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        gradingScaleId: form.gradingScaleId || null,
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      navigate(`/exams/${row.id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const byStatus = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <>
      <PageHeader
        title={t('exams')}
        subtitle="Create exams, configure subjects, enter marks, publish results"
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={15} /> {t('create')} {t('exams')}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('total')} value={digits(rows.length)} accent="navy" />
        <StatCard label="Draft" value={digits(byStatus('draft'))} accent="amber" />
        <StatCard label="Marks entry" value={digits(byStatus('marks_entry'))} accent="teal" />
        <StatCard label={t('published')} value={digits(byStatus('published') + byStatus('locked'))} accent="green" />
      </div>

      <Toolbar>
        <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t('all')} — {t('status')}</option>
          <option value="draft">Draft</option>
          <option value="marks_entry">Marks entry</option>
          <option value="published">Published</option>
          <option value="locked">Locked</option>
        </Select>
        <Select className="w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">{t('all')} — Type</option>
          {EXAM_TYPES.map((x) => (
            <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>
          ))}
        </Select>
        <Button variant="secondary" size="sm" onClick={load}>{t('refresh')}</Button>
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
                {
                  key: 'name',
                  header: t('name'),
                  render: (r) => (
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{lang === 'ne' ? r.nameNe || r.name : r.name}</p>
                      <p className="text-xs text-slate-500">{r.className ?? t('all')} {r.yearName ? `· ${r.yearName}` : ''}</p>
                    </div>
                  ),
                },
                { key: 'type', header: 'Type', render: (r) => <Badge tone="navy">{String(r.type).replace(/_/g, ' ')}</Badge> },
                { key: 'startDate', header: t('from'), render: (r) => fmtAd(r.startDate) },
                { key: 'endDate', header: t('to'), render: (r) => fmtAd(r.endDate) },
                {
                  key: 'subjectCount',
                  header: t('subjects'),
                  render: (r) => (
                    <span className="text-xs">
                      {digits(r.subjectCount ?? 0)}
                      <span className="text-slate-400"> / {digits(r.markedCount ?? 0)} {t('marksEntry').toLowerCase()}</span>
                    </span>
                  ),
                },
                { key: 'status', header: t('status'), render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{String(r.status).replace(/_/g, ' ')}</Badge> },
                {
                  key: '__open',
                  header: '',
                  className: 'text-right',
                  render: (r) => (
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/exams/${r.id}`)}>
                      {t('view')} <ArrowRight size={13} />
                    </Button>
                  ),
                },
              ]}
              rows={rows}
              empty={`${t('noData')} — ${t('exams')}`}
              onRowClick={(r) => navigate(`/exams/${r.id}`)}
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${t('create')} — ${t('exams')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={create} loading={saving}>{t('create')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="sm:col-span-2">
            <Field label={`${t('name')} (EN)`} required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="First Terminal Exam 2083" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={`${t('name')} (नेपाली)`}>
              <Input value={form.nameNe} onChange={(e) => setForm({ ...form, nameNe: e.target.value })} placeholder="प्रथम टर्मिनल परीक्षा" />
            </Field>
          </div>
          <Field label="Type" required>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {EXAM_TYPES.map((x) => (
                <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('gradingScales')}>
            <Select value={form.gradingScaleId} onChange={(e) => setForm({ ...form, gradingScaleId: e.target.value })}>
              <option value="">— {t('none')} —</option>
              {scales.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('from')}>
            <DateInput value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label={t('to')}>
            <DateInput value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('remarks')}>
              <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </Field>
          </div>
          <p className="sm:col-span-2 text-xs text-slate-500">
            If no academic year is selected the current year is used. Save then open the exam to configure subjects and
            enter marks.
          </p>
        </div>
      </Modal>
    </>
  );
}
