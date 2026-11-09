import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wand2, Printer, Eraser, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Select, Field, Input, Modal, Badge, useToast, Spinner } from '../lib/ui';

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_NE = ['आइतबार', 'सोमबार', 'मंगलबार', 'बुधबार', 'बिहीबार', 'शुक्रबार', 'शनिबार'];
const TYPE_TONE: Record<string, any> = { class: 'teal', break: 'amber', lunch: 'amber', assembly: 'navy' };

interface Slot {
  id?: string;
  sectionId: string;
  day: number;
  periodNo: number;
  startTime: string;
  endTime: string;
  type: string;
  subjectId?: string | null;
  employeeId?: string | null;
  room?: string | null;
}

export default function RoutinePage() {
  const { t, digits, lang } = useI18n();
  const toast = useToast();

  const [sections, setSections] = useState<{ value: string; label: string }[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [teachers, setTeachers] = useState<Opt[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Partial<Slot> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ periodsPerDay: 8, startTime: '06:00', periodMinutes: 45, breakAfter: 3, breakMinutes: 20 });

  useEffect(() => {
    (async () => {
      const [cl, sec, sub, tea] = await Promise.all([
        lookups.classes(),
        lookups.sections(),
        lookups.subjects(),
        lookups.teachers(),
      ]);
      const classBy = new Map(cl.map((c) => [c.value, c.label]));
      setSections(sec.map((s) => ({ value: s.value, label: `${classBy.get((s as any).classId) ?? ''} · ${s.label}`.trim() })));
      setSubjects(sub);
      setTeachers(tea);
    })();
  }, []);

  const load = async () => {
    if (!sectionId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<Slot[]>('/academics/routine', { sectionId });
      setSlots(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load routine');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSlots([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const periods = useMemo(() => {
    const max = slots.reduce((m, s) => Math.max(m, s.periodNo), 0);
    return Math.max(max, sectionId ? 6 : 0);
  }, [slots, sectionId]);

  const grid = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of slots) map.set(`${s.day}:${s.periodNo}`, s);
    return map;
  }, [slots]);

  const timeFor = (periodNo: number) => {
    const existing = slots.find((s) => s.periodNo === periodNo);
    if (existing) return `${existing.startTime}–${existing.endTime}`;
    const [h, m] = (gen.startTime || '06:00').split(':').map(Number);
    const start = h * 60 + m + (periodNo - 1) * gen.periodMinutes;
    const end = start + gen.periodMinutes;
    const fmt = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return `${fmt(start)}–${fmt(end)}`;
  };

  const saveSlot = async () => {
    if (!editing || !sectionId) return;
    setSaving(true);
    try {
      await api.put('/academics/routine', { ...editing, sectionId });
      toast.push(t('saved'), 'success');
      setEditing(null);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (id: string) => {
    try {
      await api.delete(`/academics/routine/${id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post('/academics/routine/generate', { sectionId, ...gen });
      toast.push('Routine generated', 'success');
      setGenOpen(false);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const clearAll = async () => {
    if (!sectionId) return;
    if (!window.confirm('Clear the entire routine for this section?')) return;
    try {
      await api.delete(`/academics/routine/section/${sectionId}`);
      toast.push('Routine cleared', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  const days = lang === 'ne' ? DAYS_NE : DAYS_EN;

  return (
    <>
      <PageHeader
        title={t('routines')}
        subtitle="Weekly class routine — click any slot to assign a subject and teacher"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer size={14} /> {t('print')}
            </Button>
            <Button variant="secondary" size="sm" onClick={load} disabled={!sectionId} className="print:hidden">
              <RefreshCw size={14} /> {t('refresh')}
            </Button>
            {sectionId && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setGenOpen(true)} className="print:hidden">
                  <Wand2 size={14} /> Auto-generate
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} className="print:hidden">
                  <Eraser size={14} /> Clear
                </Button>
              </>
            )}
          </>
        }
      />

      <Toolbar className="print:hidden">
        <Select className="w-auto min-w-[240px]" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">— Select section —</option>
          {sections.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        {sectionId && <Badge tone="teal">{digits(slots.length)} {t('routines').toLowerCase()}</Badge>}
      </Toolbar>

      {!sectionId ? (
        <Panel className="p-10 text-center text-sm text-slate-500">
          Choose a section to view or build its weekly routine.
        </Panel>
      ) : loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-navy-50 dark:bg-navy-800">
                <th className="border border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-navy-700 dark:border-navy-700 dark:text-teal-300">
                  {t('periods')}
                </th>
                {days.map((d, i) => (
                  <th key={d} className="border border-slate-200 px-2 py-2 text-xs font-semibold text-navy-700 dark:border-navy-700 dark:text-teal-300">
                    {d}
                    {i === 6 && <span className="ml-1 text-[10px] text-slate-400">(off)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: periods }, (_, p) => p + 1).map((p) => (
                <tr key={p}>
                  <td className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-center dark:border-navy-700 dark:bg-navy-800/60">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">P{digits(p)}</div>
                    <div className="text-[10px] text-slate-500">{digits(timeFor(p))}</div>
                  </td>
                  {DAYS_EN.map((_, d) => {
                    const slot = grid.get(`${d}:${p}`);
                    return (
                      <td key={d} className="border border-slate-200 p-1 align-top dark:border-navy-700">
                        <button
                          onClick={() =>
                            setEditing(
                              slot
                                ? { ...slot }
                                : {
                                    day: d,
                                    periodNo: p,
                                    startTime: timeFor(p).split('–')[0],
                                    endTime: timeFor(p).split('–')[1],
                                    type: 'class',
                                  },
                            )
                          }
                          className={`group w-full rounded-md px-2 py-1.5 text-left transition ${
                            slot
                              ? 'bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/30 dark:hover:bg-teal-900/50'
                              : 'bg-slate-50 hover:bg-slate-100 dark:bg-navy-800/50 dark:hover:bg-navy-800'
                          }`}
                          title={slot ? 'Edit slot' : 'Add slot'}
                        >
                          {slot ? (
                            <>
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate text-xs font-semibold text-navy-800 dark:text-teal-200">
                                  {lang === 'ne'
                                    ? subjects.find((s) => s.value === slot.subjectId)?.label ?? slot.type
                                    : subjects.find((s) => s.value === slot.subjectId)?.label ?? slot.type}
                                </span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (slot.id) removeSlot(slot.id);
                                  }}
                                  onKeyDown={(e) => e.key === 'Enter' && slot.id && removeSlot(slot.id)}
                                  className="hidden rounded p-0.5 text-slate-400 hover:text-red-600 group-hover:block print:hidden"
                                >
                                  <Trash2 size={12} />
                                </span>
                              </div>
                              {slot.employeeId && (
                                <div className="truncate text-[11px] text-slate-500">
                                  {teachers.find((x) => x.value === slot.employeeId)?.label ?? ''}
                                </div>
                              )}
                              {slot.type !== 'class' && (
                                <div className="text-[10px] uppercase text-amber-600">{slot.type}</div>
                              )}
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-400 group-hover:text-teal-600 print:hidden">
                              <Plus size={12} /> {t('add')}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* ------------------------------------------------------- slot form */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit routine slot' : 'New routine slot'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={saveSlot} loading={saving}>{t('save')}</Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Day" required>
              <Select
                value={editing.day ?? 0}
                onChange={(e) => setEditing({ ...editing, day: Number(e.target.value) })}
              >
                {DAYS_EN.map((d, i) => (
                  <option key={d} value={i}>{days[i]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Period no." required>
              <Input
                type="number"
                min={1}
                max={30}
                value={editing.periodNo ?? 1}
                onChange={(e) => setEditing({ ...editing, periodNo: Number(e.target.value) })}
              />
            </Field>
            <Field label="Start time" required>
              <Input
                type="time"
                value={editing.startTime ?? '06:00'}
                onChange={(e) => setEditing({ ...editing, startTime: e.target.value })}
              />
            </Field>
            <Field label="End time" required>
              <Input
                type="time"
                value={editing.endTime ?? '06:45'}
                onChange={(e) => setEditing({ ...editing, endTime: e.target.value })}
              />
            </Field>
            <Field label="Type" required>
              <Select value={editing.type ?? 'class'} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                <option value="class">Class</option>
                <option value="break">Break</option>
                <option value="lunch">Lunch</option>
                <option value="assembly">Assembly</option>
              </Select>
            </Field>
            <Field label="Room">
              <Input value={editing.room ?? ''} onChange={(e) => setEditing({ ...editing, room: e.target.value })} />
            </Field>
            <Field label={t('subjects')}>
              <Select
                value={editing.subjectId ?? ''}
                onChange={(e) => setEditing({ ...editing, subjectId: e.target.value || null })}
              >
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Teacher">
              <Select
                value={editing.employeeId ?? ''}
                onChange={(e) => setEditing({ ...editing, employeeId: e.target.value || null })}
              >
                <option value="">—</option>
                {teachers.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------ generator */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Auto-generate routine"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)} disabled={generating}>{t('cancel')}</Button>
            <Button onClick={generate} loading={generating}>{generating ? 'Generating…' : 'Generate'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-300">
            Allocates this section's subjects across periods while avoiding teacher clashes with other sections.
          </p>
          <Field label="Periods per day">
            <Input type="number" min={1} max={12} value={gen.periodsPerDay}
              onChange={(e) => setGen({ ...gen, periodsPerDay: Number(e.target.value) })} />
          </Field>
          <Field label="First period starts">
            <Input type="time" value={gen.startTime} onChange={(e) => setGen({ ...gen, startTime: e.target.value })} />
          </Field>
          <Field label="Period minutes">
            <Input type="number" min={10} max={120} value={gen.periodMinutes}
              onChange={(e) => setGen({ ...gen, periodMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Break after period">
            <Input type="number" min={0} max={12} value={gen.breakAfter}
              onChange={(e) => setGen({ ...gen, breakAfter: Number(e.target.value) })} />
          </Field>
          <Field label="Break minutes">
            <Input type="number" min={5} max={60} value={gen.breakMinutes}
              onChange={(e) => setGen({ ...gen, breakMinutes: Number(e.target.value) })} />
          </Field>
          <div className="flex items-end">
            {generating && <Spinner size={16} />}
          </div>
        </div>
      </Modal>
    </>
  );
}
