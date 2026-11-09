import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Star, Copy } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Modal, Field, Input, Select, Checkbox, useToast, Table } from '../lib/ui';

interface Band {
  minPercent: number;
  maxPercent: number;
  letter: string;
  gradePoint: number;
  remark?: string | null;
  isNg: boolean;
}
interface Scale {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  classId?: string | null;
  examType?: string | null;
  gpaFormula: string;
  ngThresholdPercent?: string | null;
  isDefault: boolean;
  active: boolean;
  bands: Band[];
}

const NEB_TEMPLATE: Band[] = [
  { minPercent: 90, maxPercent: 100, letter: 'A+', gradePoint: 4, isNg: false, remark: 'Outstanding' },
  { minPercent: 80, maxPercent: 89.99, letter: 'A', gradePoint: 3.6, isNg: false, remark: 'Excellent' },
  { minPercent: 70, maxPercent: 79.99, letter: 'B+', gradePoint: 3.2, isNg: false, remark: 'Very Good' },
  { minPercent: 60, maxPercent: 69.99, letter: 'B', gradePoint: 2.8, isNg: false, remark: 'Good' },
  { minPercent: 50, maxPercent: 59.99, letter: 'C+', gradePoint: 2.4, isNg: false, remark: 'Satisfactory' },
  { minPercent: 40, maxPercent: 49.99, letter: 'C', gradePoint: 2, isNg: false, remark: 'Acceptable' },
  { minPercent: 35, maxPercent: 39.99, letter: 'D', gradePoint: 1.6, isNg: false, remark: 'Weak' },
  { minPercent: 0, maxPercent: 34.99, letter: 'NG', gradePoint: 0, isNg: true, remark: 'Not Graded' },
];

export default function GradingPage() {
  const { t, digits } = useI18n();
  const toast = useToast();

  const [scales, setScales] = useState<Scale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Scale | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Scale | null>(null);

  const blank = (): Scale => ({
    id: '',
    name: '',
    code: '',
    description: '',
    gpaFormula: 'weighted',
    isDefault: false,
    active: true,
    bands: NEB_TEMPLATE.map((b) => ({ ...b })),
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<Scale[]>('/exams/grading-scales');
      setScales(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load grading scales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(blank());
    setIsNew(true);
    setFormError(null);
  };

  const openEdit = (s: Scale) => {
    setEditing({ ...s, bands: s.bands.map((b) => ({ ...b })) });
    setIsNew(false);
    setFormError(null);
  };

  const setBand = (i: number, patch: Partial<Band>) =>
    setEditing((s) => (s ? { ...s, bands: s.bands.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) } : s));

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.code.trim()) {
      setFormError('Name and code are required');
      return;
    }
    if (!editing.bands.length) {
      setFormError('At least one grade band is required');
      return;
    }
    for (const b of editing.bands) {
      if (b.maxPercent < b.minPercent) {
        setFormError(`Band "${b.letter}": max must be ≥ min`);
        return;
      }
      if (!b.letter.trim()) {
        setFormError('Every band needs a letter grade');
        return;
      }
    }
    const payload = {
      name: editing.name,
      code: editing.code,
      description: editing.description || null,
      classId: editing.classId || null,
      examType: editing.examType || null,
      gpaFormula: editing.gpaFormula,
      isDefault: editing.isDefault,
      bands: editing.bands.map((b) => ({
        minPercent: Number(b.minPercent),
        maxPercent: Number(b.maxPercent),
        letter: b.letter,
        gradePoint: Number(b.gradePoint),
        remark: b.remark || null,
        isNg: Boolean(b.isNg),
      })),
    };
    setSaving(true);
    setFormError(null);
    try {
      if (isNew) {
        await api.post('/exams/grading-scales', payload);
        toast.push(t('created'), 'success');
      } else {
        await api.patch(`/exams/grading-scales/${editing.id}`, payload);
        toast.push(t('saved'), 'success');
      }
      setEditing(null);
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/exams/grading-scales/${deleting.id}`);
      toast.push(t('deleted'), 'success');
      setDeleting(null);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
      setDeleting(null);
    }
  };

  const duplicate = (s: Scale) => {
    setEditing({
      ...blank(),
      name: `${s.name} (copy)`,
      code: `${s.code}-copy`,
      description: s.description,
      gpaFormula: s.gpaFormula,
      bands: s.bands.map((b) => ({ ...b })),
    });
    setIsNew(true);
    setFormError(null);
  };

  return (
    <>
      <PageHeader
        title={t('gradingScales')}
        subtitle="Grade bands, grade points and GPA formula — nothing is hardcoded; exams resolve the scale at result time"
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus size={15} /> {t('create')} {t('gradingScales')}
          </Button>
        }
      />

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : scales.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-slate-500">
          No grading scale yet. Create one (or duplicate the NEB template) so results can be graded.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {scales.map((s) => (
            <Panel key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-navy-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-navy-800 dark:text-white">{s.name}</h3>
                    {s.isDefault && <Badge tone="teal">default</Badge>}
                    {!s.active && <Badge tone="slate">inactive</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    code <span className="font-mono">{s.code}</span> · GPA {s.gpaFormula}
                    {s.examType ? ` · exam type ${s.examType}` : ''} · {digits(s.bands.length)} bands
                  </p>
                  {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => duplicate(s)} title="Duplicate" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-800">
                    <Copy size={15} />
                  </button>
                  <button onClick={() => openEdit(s)} title={t('edit')} className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-navy-800">
                    <Pencil size={15} />
                  </button>
                  {!s.isDefault && (
                    <button onClick={() => setDeleting(s)} title={t('delete')} className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-navy-800">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-3 pb-3 pt-2">
                <Table
                  columns={[
                    { key: 'letter', header: 'Grade', render: (b: any) => <span className="font-bold text-navy-700 dark:text-teal-300">{b.letter}</span> },
                    { key: 'range', header: '% range', render: (b: any) => `${digits(b.minPercent)} – ${digits(b.maxPercent)}` },
                    { key: 'gradePoint', header: 'Point', render: (b: any) => digits(Number(b.gradePoint).toFixed(2)) },
                    { key: 'remark', header: 'Remark', render: (b: any) => b.remark ?? '—' },
                    { key: 'isNg', header: 'NG', render: (b: any) => (b.isNg ? <Badge tone="red">NG</Badge> : '—') },
                  ]}
                  rows={s.bands}
                  empty="No bands"
                />
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------- edit modal */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        wide
        title={isNew ? `${t('create')} ${t('gradingScales')}` : `${t('edit')} — ${editing?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={`${t('name')}`} required>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="NEB SEE grading" />
              </Field>
              <Field label="Code" required>
                <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} placeholder="neb_see" />
              </Field>
              <Field label="GPA formula">
                <Select value={editing.gpaFormula} onChange={(e) => setEditing({ ...editing, gpaFormula: e.target.value })}>
                  <option value="weighted">Weighted by credit hours</option>
                  <option value="average">Simple average</option>
                </Select>
              </Field>
              <Field label="Exam type (optional)" hint="Limits this scale to one exam type">
                <Select value={editing.examType ?? ''} onChange={(e) => setEditing({ ...editing, examType: e.target.value || null })}>
                  <option value="">— all —</option>
                  {['terminal_1', 'terminal_2', 'terminal_3', 'final', 'unit', 'monthly', 'see_prep', 'neb', 'ble'].map((x) => (
                    <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2 flex flex-wrap gap-4 pt-1">
                <Checkbox
                  label="Default scale (used when no class/exam-specific scale matches)"
                  checked={editing.isDefault}
                  onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                />
                <Checkbox
                  label={t('active')}
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
              </div>
              <div className="sm:col-span-2">
                <Field label={t('description')}>
                  <Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </Field>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-navy-700 dark:text-teal-300">Grade bands</h4>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      bands: [...editing.bands, { minPercent: 0, maxPercent: 0, letter: '', gradePoint: 0, isNg: false }],
                    })
                  }
                >
                  <Plus size={13} /> Add band
                </Button>
              </div>
              <div className="space-y-2">
                {editing.bands.map((b, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-navy-700">
                    <Field label="Min %">
                      <Input type="number" min={0} max={100} value={b.minPercent} onChange={(e) => setBand(i, { minPercent: Number(e.target.value) })} />
                    </Field>
                    <Field label="Max %">
                      <Input type="number" min={0} max={100} value={b.maxPercent} onChange={(e) => setBand(i, { maxPercent: Number(e.target.value) })} />
                    </Field>
                    <Field label="Letter">
                      <Input value={b.letter} onChange={(e) => setBand(i, { letter: e.target.value })} />
                    </Field>
                    <Field label="Point">
                      <Input type="number" min={0} max={4} step={0.1} value={b.gradePoint} onChange={(e) => setBand(i, { gradePoint: Number(e.target.value) })} />
                    </Field>
                    <div className="flex items-center gap-2 pb-2">
                      <Checkbox label="NG" checked={b.isNg} onChange={(e) => setBand(i, { isNg: e.target.checked })} />
                      <button
                        onClick={() => setEditing({ ...editing, bands: editing.bands.filter((_, idx) => idx !== i) })}
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                        title={t('delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="col-span-full">
                      <Input
                        placeholder="Remark (optional)"
                        value={b.remark ?? ''}
                        onChange={(e) => setBand(i, { remark: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                <Star size={12} className="text-amber-500" /> Bands are matched by percentage when a result is computed —
                keep ranges contiguous from 0 to 100.
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('delete')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
            <Button variant="danger" onClick={remove}>{t('delete')}</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Delete the grading scale <b>{deleting?.name}</b> and its {deleting?.bands.length} bands? Results already
          computed keep their stored grades.
        </p>
      </Modal>
    </>
  );
}
