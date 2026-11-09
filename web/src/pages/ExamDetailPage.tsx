import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wand2, Download, Upload, CheckCircle2, Lock, Unlock, RotateCcw, Printer,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { Tabs, PageHeader, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import {
  Button, Badge, Table, Modal, Field, Input, Select, StatCard, useToast,
} from '../lib/ui';
import { DateInput } from '../components/DateInput';

const STATUS_TONE: Record<string, any> = {
  draft: 'slate', marks_entry: 'amber', published: 'green', locked: 'navy',
};

interface ExamSubjectRow {
  id: string;
  classId: string;
  subjectId: string;
  theoryFull: number;
  theoryPass: number;
  practicalFull: number;
  practicalPass: number;
  internalFull: number;
  examDate?: string | null;
  startTime?: string | null;
  room?: string | null;
  subjectNameEn?: string;
  subjectNameNe?: string;
  subjectCode?: string;
  className?: string;
  marked: number;
  studentsTotal: number;
}

export default function ExamDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t, digits, fmtAd, lang } = useI18n();
  const toast = useToast();

  const [exam, setExam] = useState<any>(null);
  const [subjects, setSubjects] = useState<ExamSubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('subjects');

  const [classes, setClasses] = useState<Opt[]>([]);
  const [genClass, setGenClass] = useState('');
  const [genOpen, setGenOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // marks entry
  const [markSubject, setMarkSubject] = useState<ExamSubjectRow | null>(null);
  const [markRows, setMarkRows] = useState<any[]>([]);
  const [markConfig, setMarkConfig] = useState<any>(null);
  const [markLoading, setMarkLoading] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);

  // results
  const [results, setResults] = useState<any[]>([]);
  const [resultMeta, setResultMeta] = useState<any>(null);
  const [resultClass, setResultClass] = useState('');
  const [loadingResults, setLoadingResults] = useState(false);

  // routine
  const [routine, setRoutine] = useState<any[]>([]);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [routineForm, setRoutineForm] = useState({ classId: '', startDate: '', daysPerWeek: 6, startTime: '08:00', durationMinutes: 180 });

  const { user } = useAuth();
  const isAdmin = ['super_admin', 'school_admin'].includes(user?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<any>(`/exams/${id}`);
      setExam(r);
      // API nests exam-subject columns under `es` — flatten so rows expose
      // id / theoryFull / room / examDate directly.
      setSubjects(
        (r.subjects ?? []).map((s: any) => ({ ...s, ...(s.es ?? {}), id: s.es?.id ?? s.id })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load exam');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadAll({ classes: lookups.classes }).then((d) => setClasses(d.classes));
  }, []);

  useEffect(() => {
    if (tab !== 'results') return;
    let alive = true;
    setLoadingResults(true);
    api
      .list<any>(`/exams/${id}/results`, resultClass ? { classId: resultClass } : undefined)
      .then((r) => {
        if (!alive) return;
        setResults(Array.isArray(r.data) ? r.data : []);
        setResultMeta((r as any)?.meta ?? null);
      })
      .catch(() => alive && (setResults([]), setResultMeta(null)))
      .finally(() => alive && setLoadingResults(false));
    return () => {
      alive = false;
    };
  }, [tab, id, resultClass]);

  useEffect(() => {
    if (tab !== 'routine') return;
    let alive = true;
    api
      .get<any[]>(`/exams/${id}/routine`)
      .then((r) => alive && setRoutine(r))
      .catch(() => alive && setRoutine([]));
    return () => {
      alive = false;
    };
  }, [tab, id]);

  /* ------------------------------------------------------------- actions */

  const generateSubjects = async () => {
    if (!genClass) return;
    setBusy(true);
    try {
      const r = await api.post<{ created: number }>(`/exams/${id}/subjects/generate`, { classId: genClass });
      toast.push(`${r.created} subjects configured`, 'success');
      setGenOpen(false);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const statusAction = async (action: 'publish' | 'lock' | 'unlock' | 'reopen') => {
    const labels: Record<string, string> = { publish: 'Publish results', lock: 'Lock results', unlock: 'Unlock results', reopen: 'Reopen for editing' };
    if (!window.confirm(`${labels[action]}?`)) return;
    setBusy(true);
    try {
      await api.post(`/exams/${id}/${action}`);
      toast.push(`${labels[action]} completed`, 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openMarks = async (sub: ExamSubjectRow) => {
    setMarkSubject(sub);
    setMarkLoading(true);
    try {
      // api.list keeps the top-level `meta` (mark config) — api.get would drop it.
      const r = await api.list<any>(`/exams/subjects/${sub.id}/marks`);
      setMarkRows((r.data ?? []).map((x: any) => ({ ...x })));
      setMarkConfig((r.meta as any)?.config ?? null);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed to load roster', 'error');
      setMarkSubject(null);
    } finally {
      setMarkLoading(false);
    }
  };

  const setMark = (studentId: string, field: string, value: unknown) =>
    setMarkRows((rows) => rows.map((r) => (r.id === studentId ? { ...r, [field]: value } : r)));

  // Subjects configured without a practical component (legacy) show only Theory + Internal.
  const showPractical = !markConfig || Number(markConfig.practicalFull ?? 0) > 0;

  const saveMarks = async () => {
    if (!markSubject) return;
    setSavingMarks(true);
    try {
      const records = markRows.map((r) => ({
        studentId: r.id,
        theoryObtained: r.isAbsent ? null : r.theoryObtained === '' || r.theoryObtained === null ? null : Number(r.theoryObtained),
        practicalObtained: r.isAbsent ? null : r.practicalObtained === '' || r.practicalObtained === null ? null : Number(r.practicalObtained),
        internalObtained: r.isAbsent ? null : r.internalObtained === '' || r.internalObtained === null ? null : Number(r.internalObtained),
        isAbsent: Boolean(r.isAbsent),
      }));
      const res = await api.post<{ saved: number; gradingScale: string }>(`/exams/marks`, {
        examSubjectId: markSubject.id,
        records,
      });
      toast.push(
        `Saved ${res.saved} records · grading: ${res.gradingScale === 'applied' ? 'applied' : 'no scale found'}`,
        'success',
      );
      setMarkSubject(null);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSavingMarks(false);
    }
  };

  const generateRoutine = async () => {
    if (!routineForm.classId || !routineForm.startDate) return;
    setBusy(true);
    try {
      const r = await api.post<{ slots: number }>(`/exams/${id}/routine/generate`, routineForm);
      toast.push(`${r.slots} routine slots created`, 'success');
      setRoutineOpen(false);
      api.get<any[]>(`/exams/${id}/routine`).then(setRoutine).catch(() => undefined);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportResults = async () => {
    try {
      const blob = await api.download(`/exams/${id}/export`, resultClass ? { classId: resultClass } : undefined);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(exam?.name ?? 'exam').replace(/\W+/g, '-')}-results.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Export failed', 'error');
    }
  };

  if (loading) return <LoadingBlock />;
  if (error || !exam) return <ErrorBlock message={error ?? 'Exam not found'} onRetry={load} />;

  const summary = resultMeta?.summary;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate('/exams')} className="text-slate-400 hover:text-teal-600" aria-label="back">
              <ArrowLeft size={18} />
            </button>
            {lang === 'ne' ? exam.nameNe || exam.name : exam.name}
            <Badge tone={STATUS_TONE[exam.status] ?? 'slate'}>{String(exam.status).replace(/_/g, ' ')}</Badge>
          </span>
        }
        subtitle={`${exam.className ?? t('all')} · ${exam.yearName ?? ''} · ${fmtAd(exam.startDate)} → ${fmtAd(exam.endDate)}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setGenOpen(true)}>
              <Wand2 size={14} /> {t('generate')} {t('subjects')}
            </Button>
            <Button variant="secondary" size="sm" onClick={exportResults}>
              <Download size={14} /> {t('export')}
            </Button>
            {isAdmin && exam.status !== 'published' && exam.status !== 'locked' && (
              <Button variant="teal" size="sm" onClick={() => statusAction('publish')} loading={busy}>
                <CheckCircle2 size={14} /> {t('publish')}
              </Button>
            )}
            {isAdmin && exam.status === 'published' && (
              <Button variant="secondary" size="sm" onClick={() => statusAction('lock')} loading={busy}>
                <Lock size={14} /> Lock
              </Button>
            )}
            {isAdmin && exam.status === 'locked' && (
              <>
                <Button variant="secondary" size="sm" onClick={() => statusAction('unlock')} loading={busy}>
                  <Unlock size={14} /> Unlock
                </Button>
                <Button variant="secondary" size="sm" onClick={() => statusAction('reopen')} loading={busy}>
                  <RotateCcw size={14} /> Reopen
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer size={14} /> {t('print')}
            </Button>
          </>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'subjects', label: t('subjects'), badge: subjects.length },
          { key: 'results', label: t('results') },
          { key: 'routine', label: 'Routine' },
        ]}
      />

      {tab === 'subjects' && (
        <Panel>
          <div className="px-3 pb-3">
            <Table
              columns={[
                { key: 'className', header: t('classes'), render: (r) => r.className ?? '—' },
                {
                  key: 'subjectNameEn',
                  header: t('subjects'),
                  render: (r) => (
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {lang === 'ne' ? r.subjectNameNe || r.subjectNameEn : r.subjectNameEn}
                      {r.subjectCode ? <span className="ml-1.5 text-xs text-slate-400">{r.subjectCode}</span> : null}
                    </span>
                  ),
                },
                {
                  key: 'theoryFull',
                  header: 'Full marks',
                  render: (r) => (
                    <span className="text-xs">
                      T {digits(r.theoryFull)}/{digits(r.theoryPass)}
                      {Number(r.practicalFull ?? 0) > 0 && <> · P {digits(r.practicalFull)}/{digits(r.practicalPass)}</>}
                      {' '}· I {digits(r.internalFull ?? 0)}/{digits(r.internalPass ?? 0)}
                    </span>
                  ),
                },
                { key: 'examDate', header: 'Exam date', render: (r) => fmtAd(r.examDate) },
                { key: 'room', header: 'Room', render: (r) => digits(r.room ?? '—') },
                {
                  key: 'marked',
                  header: t('marksEntry'),
                  render: (r) => (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800">
                        <div
                          className={`h-full rounded-full ${r.marked >= r.studentsTotal ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${r.studentsTotal ? Math.round((r.marked / r.studentsTotal) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{digits(r.marked)}/{digits(r.studentsTotal)}</span>
                    </div>
                  ),
                },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => openMarks(r)}>{t('marksEntry')}</Button>
                      {isAdmin && (
                        <button
                          onClick={async () => {
                            if (!window.confirm('Remove this subject and its marks?')) return;
                            try {
                              await api.delete(`/exams/subjects/${r.id}`);
                              toast.push(t('deleted'), 'success');
                              load();
                            } catch (e) {
                              toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
                            }
                          }}
                          className="rounded-md px-2 text-xs text-slate-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={subjects}
              empty="No subjects configured yet — use “Generate subjects” to pull this class's subject list."
            />
          </div>
        </Panel>
      )}

      {tab === 'results' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label={t('students')} value={digits(summary?.students ?? 0)} accent="navy" />
            <StatCard label={t('pass')} value={digits(summary?.passed ?? 0)} accent="green" />
            <StatCard label={t('fail')} value={digits(summary?.failed ?? 0)} accent="red" />
            <StatCard label="GPA" value={digits((summary?.averageGpa ?? 0).toFixed(2))} accent="teal" />
            <StatCard label="%" value={digits((summary?.averagePercent ?? 0).toFixed(1))} accent="amber" />
          </div>

          <Panel>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-navy-800 print:hidden">
              <Select className="w-auto" value={resultClass} onChange={(e) => setResultClass(e.target.value)}>
                <option value="">{t('all')} — {t('classes')}</option>
                {(resultMeta?.classes ?? classes).map((c: any) => (
                  <option key={c.id ?? c.value} value={c.id ?? c.value}>{c.name ?? c.label}</option>
                ))}
              </Select>
              <span className="text-xs text-slate-500">
                {t('gradingScales')}: {resultMeta?.scale?.name ?? t('none')}
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" size="sm" onClick={exportResults}>
                  <Download size={13} /> {t('exportExcel')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <Printer size={13} /> {t('print')}
                </Button>
              </div>
            </div>

            {loadingResults ? (
              <LoadingBlock />
            ) : (
              <div className="px-3 pb-3">
                <Table
                  columns={[
                    { key: 'rank', header: '#', render: (r) => <span className="font-bold text-navy-700 dark:text-teal-300">{digits(r.rank)}</span> },
                    { key: 'rollNo', header: 'Roll', render: (r) => digits(r.rollNo ?? '—') },
                    {
                      key: 'nameEn',
                      header: t('name'),
                      render: (r) => <span className="font-medium">{lang === 'ne' ? r.nameNe || r.nameEn : r.nameEn}</span>,
                    },
                    { key: 'totalMarks', header: 'Marks', render: (r) => `${digits(r.totalMarks)}/${digits(r.maxMarks)}` },
                    { key: 'percent', header: '%', render: (r) => digits(Number(r.percent).toFixed(1)) },
                    { key: 'gpa', header: 'GPA', render: (r) => <span className="font-semibold">{digits(Number(r.gpa).toFixed(2))}</span> },
                    {
                      key: 'subjects',
                      header: t('subjects'),
                      render: (r) => (
                        <span className="flex flex-wrap gap-1">
                          {r.subjects.map((s: any, i: number) => (
                            <span
                              key={i}
                              title={`${lang === 'ne' ? s.subjectNameNe || s.subjectNameEn : s.subjectNameEn}: ${s.total}/${s.maxTotal}`}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${s.isPassed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}
                            >
                              {s.gradeLetter ?? (s.isPassed ? 'P' : 'F')}
                            </span>
                          ))}
                        </span>
                      ),
                    },
                    {
                      key: 'passed',
                      header: t('result'),
                      render: (r) => <Badge tone={r.passed ? 'green' : 'red'}>{r.passed ? t('pass') : t('fail')}</Badge>,
                    },
                  ]}
                  rows={results}
                  empty="No results yet — enter marks in the Subjects tab first."
                />
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === 'routine' && (
        <Panel>
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-navy-800 print:hidden">
            <span className="text-xs text-slate-500">{digits(routine.length)} slots</span>
            <Button size="sm" variant="secondary" onClick={() => setRoutineOpen(true)}>
              <Wand2 size={14} /> Generate routine
            </Button>
          </div>
          <div className="px-3 pb-3">
            <Table
              columns={[
                { key: 'date', header: t('date'), render: (r) => fmtAd(r.date) },
                { key: 'startTime', header: 'Time', render: (r) => `${digits(r.startTime)} – ${digits(r.endTime)}` },
                { key: 'className', header: t('classes'), render: (r) => r.className ?? '—' },
                {
                  key: 'subjectNameEn',
                  header: t('subjects'),
                  render: (r) => <span className="font-medium">{lang === 'ne' ? r.subjectNameNe || r.subjectNameEn : r.subjectNameEn}</span>,
                },
                { key: 'room', header: 'Room', render: (r) => digits(r.room ?? '—') },
              ]}
              rows={routine}
              empty="No routine generated yet."
            />
          </div>
        </Panel>
      )}

      {/* -------------------------------------------------- generate subjects */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title={`${t('generate')} ${t('subjects')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)} disabled={busy}>{t('cancel')}</Button>
            <Button onClick={generateSubjects} loading={busy}>{t('generate')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Copies every subject mapped to the chosen class (with its full/pass marks) into this exam. Existing
            combinations are skipped.
          </p>
          <Field label={t('classes')} required>
            <Select value={genClass} onChange={(e) => setGenClass(e.target.value)}>
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* ------------------------------------------------------- marks entry */}
      <Modal
        open={markSubject !== null}
        onClose={() => setMarkSubject(null)}
        wide
        title={`${t('marksEntry')} — ${markSubject ? (lang === 'ne' ? markSubject.subjectNameNe || markSubject.subjectNameEn : markSubject.subjectNameEn) : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMarkSubject(null)} disabled={savingMarks}>{t('cancel')}</Button>
            <Button onClick={saveMarks} loading={savingMarks}>
              {savingMarks ? t('saving') : t('save')}
            </Button>
          </>
        }
      >
        {markLoading ? (
          <LoadingBlock />
        ) : (
          <div>
            {markConfig && (
              <p className="mb-2 text-xs text-slate-500">
                {t('theory')} {digits(markConfig.theoryFull)}/{digits(markConfig.theoryPass)}
                {Number(markConfig.practicalFull ?? 0) > 0 && (
                  <> · Practical {digits(markConfig.practicalFull)}/{digits(markConfig.practicalPass)}</>
                )} · {t('internal')} {digits(markConfig.internalFull)}
                {Number(markConfig.internalPass ?? 0) > 0 && `/${digits(markConfig.internalPass)}`} — grading bands are applied automatically on save.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-navy-700">
                    <th className="px-2 py-2 text-left">Roll</th>
                    <th className="px-2 py-2 text-left">{t('name')}</th>
                    <th className="px-2 py-2 text-center">{t('theory')}</th>
                    {showPractical && <th className="px-2 py-2 text-center">Practical</th>}
                    <th className="px-2 py-2 text-center">{t('internal')}</th>
                    <th className="px-2 py-2 text-center">Absent</th>
                    <th className="px-2 py-2 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {markRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-navy-800/60">
                      <td className="px-2 py-1.5 text-xs text-slate-500">{digits(r.rollNo ?? '—')}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{lang === 'ne' ? r.nameNe || r.nameEn : r.nameEn}</span>
                        <span className="ml-1.5 text-[11px] text-slate-400">{digits(r.admissionNo)}</span>
                      </td>
                      {(['theoryObtained', 'practicalObtained', 'internalObtained'] as const)
                        .filter((f) => f !== 'practicalObtained' || showPractical)
                        .map((f) => (
                        <td key={f} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={200}
                            disabled={r.isAbsent}
                            value={r[f] ?? ''}
                            onChange={(e) => setMark(r.id, f, e.target.value === '' ? null : e.target.value)}
                            className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-center text-sm dark:border-navy-600 dark:bg-navy-800 disabled:opacity-40"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(r.isAbsent)}
                          onChange={(e) => setMark(r.id, 'isAbsent', e.target.checked)}
                          className="h-4 w-4 accent-red-600"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Badge tone={r.isPassed ? 'green' : r.isAbsent ? 'red' : 'slate'}>
                          {r.isAbsent ? 'ABS' : r.gradeLetter ?? '—'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {markRows.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No active students in this class.</p>
            )}
          </div>
        )}
      </Modal>

      {/* ----------------------------------------------------- exam routine */}
      <Modal
        open={routineOpen}
        onClose={() => setRoutineOpen(false)}
        title="Generate exam routine"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoutineOpen(false)} disabled={busy}>{t('cancel')}</Button>
            <Button onClick={generateRoutine} loading={busy}>{t('generate')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('classes')} required>
              <Select value={routineForm.classId} onChange={(e) => setRoutineForm({ ...routineForm, classId: e.target.value })}>
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Start date" required>
            <DateInput value={routineForm.startDate} onChange={(e) => setRoutineForm({ ...routineForm, startDate: e.target.value })} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={routineForm.startTime} onChange={(e) => setRoutineForm({ ...routineForm, startTime: e.target.value })} />
          </Field>
          <Field label="Days per week">
            <Input type="number" min={1} max={7} value={routineForm.daysPerWeek} onChange={(e) => setRoutineForm({ ...routineForm, daysPerWeek: Number(e.target.value) })} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" min={30} max={300} value={routineForm.durationMinutes} onChange={(e) => setRoutineForm({ ...routineForm, durationMinutes: Number(e.target.value) })} />
          </Field>
          <p className="sm:col-span-2 text-xs text-slate-500">
            One subject per day, ordered by the subject's configured exam date.
          </p>
        </div>
      </Modal>
    </>
  );
}
