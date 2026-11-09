import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Download, Send, CheckSquare, Eye, Pencil } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { useAuth } from '../lib/auth';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, Checkbox, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

export default function LmsPage() {
  const [tab, setTab] = useState('materials');
  return (
    <>
      <PageHeader
        title="Learning management"
        subtitle="Study materials, assignments with submissions and grading, and quizzes with auto-evaluation"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'materials', label: 'Materials' },
          { key: 'assignments', label: 'Assignments' },
          { key: 'quizzes', label: 'Quizzes' },
        ]}
      />
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'assignments' && <AssignmentsTab />}
      {tab === 'quizzes' && <QuizzesTab />}
    </>
  );
}

/* ========================================================== materials */

function MaterialsTab() {
  const { t, digits } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = ['super_admin', 'school_admin', 'office', 'teacher'].includes(user?.role ?? '');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classId, setClassId] = useState('');
  const [lk, setLk] = useState<{ classes: Opt[]; subjects: Opt[] }>({ classes: [], subjects: [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', type: 'pdf', url: '', classId: '', subjectId: '', published: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadAll({ classes: lookups.classes, subjects: lookups.subjects }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/lms/materials', classId ? { classId } : undefined);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (!form.title.trim() || !form.url.trim()) return setFormError('Title and URL are required');
    setSaving(true);
    try {
      await api.post('/lms/materials', {
        title: form.title.trim(),
        description: form.description || null,
        type: form.type,
        url: form.url.trim(),
        classId: form.classId || null,
        subjectId: form.subjectId || null,
        published: form.published,
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ ...form, title: '', description: '', url: '' });
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const open_ = async (r: any) => {
    try {
      await api.post(`/lms/materials/${r.id}/download`, {});
      window.open(r.url, '_blank', 'noopener');
    } catch {
      window.open(r.url, '_blank', 'noopener');
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    try {
      await api.delete(`/lms/materials/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        {canWrite && (
          <Button size="sm" onClick={() => { setFormError(null); setOpen(true); }}>
            <Plus size={14} /> Add material
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} resources</span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No study materials yet.{canWrite ? ' Add PDFs, videos or links for your classes.' : ''}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-[220px]">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    <Badge tone="navy">{r.type}</Badge>{' '}
                    {r.className ?? 'All classes'}{r.subjectNameEn ? ` · ${r.subjectNameEn}` : ''} · {r.teacherName ?? ''} · {digits(r.downloads ?? 0)} downloads
                  </p>
                  {r.description && <p className="mt-1 max-w-[600px] text-xs text-slate-500">{r.description}</p>}
                </div>
                <div className="flex gap-1.5">
                  <Button variant="teal" size="sm" onClick={() => open_(r)}><Eye size={13} /> Open</Button>
                  {canWrite && (
                    <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add study material"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">{formError}</div>
          )}
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
          </div>
          <Field label="Type" required>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {['pdf', 'doc', 'ppt', 'video', 'audio', 'link', 'image'].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Class">
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">All classes</option>
              {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="URL" required hint="Upload the file first (Uploads page) or paste an external link">
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/uploads/notes.pdf" />
            </Field>
          </div>
          <Field label="Subject">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">—</option>
              {lk.subjects.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Checkbox label="Published" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ======================================================= assignments */

function AssignmentsTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = ['super_admin', 'school_admin', 'office', 'teacher'].includes(user?.role ?? '');
  const isStudent = user?.role === 'student';

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lk, setLk] = useState<{ classes: Opt[]; subjects: Opt[] }>({ classes: [], subjects: [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', classId: '', subjectId: '', dueDate: '', totalMarks: '100' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [subsFor, setSubsFor] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [gradeFor, setGradeFor] = useState<any>(null);
  const [grade, setGrade] = useState({ marks: '', feedback: '' });

  const [submitFor, setSubmitFor] = useState<any>(null);
  const [submission, setSubmission] = useState({ fileUrl: '', note: '' });

  useEffect(() => {
    loadAll({ classes: lookups.classes, subjects: lookups.subjects }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/lms/assignments');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (!form.title.trim() || !form.classId) return setFormError('Title and class are required');
    setSaving(true);
    try {
      await api.post('/lms/assignments', {
        title: form.title.trim(),
        description: form.description || null,
        classId: form.classId,
        subjectId: form.subjectId || null,
        dueDate: form.dueDate || null,
        totalMarks: Number(form.totalMarks || 100),
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ ...form, title: '', description: '', dueDate: '' });
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openSubs = async (r: any) => {
    setSubsFor(r);
    setSubsLoading(true);
    try {
      const d = await api.list<any>(`/lms/assignments/${r.id}/submissions`);
      setSubs(d.data ?? []);
    } catch {
      setSubs([]);
    } finally {
      setSubsLoading(false);
    }
  };

  const saveGrade = async () => {
    if (!gradeFor || grade.marks === '') return;
    try {
      await api.post(`/lms/submissions/${gradeFor.id}/grade`, {
        marksObtained: Number(grade.marks),
        feedback: grade.feedback || null,
      });
      toast.push('Graded', 'success');
      setGradeFor(null);
      openSubs(subsFor);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Grading failed', 'error');
    }
  };

  const submitAssignment = async () => {
    if (!submitFor) return;
    if (!submission.fileUrl.trim() && !submission.note.trim()) {
      toast.push('Provide a file URL or a note', 'error');
      return;
    }
    try {
      await api.post(`/lms/assignments/${submitFor.id}/submit`, {
        fileUrl: submission.fileUrl || null,
        note: submission.note || null,
      });
      toast.push('Submitted', 'success');
      setSubmitFor(null);
      setSubmission({ fileUrl: '', note: '' });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Submission failed', 'error');
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete assignment "${r.title}" and its submissions?`)) return;
    try {
      await api.delete(`/lms/assignments/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        {canWrite && (
          <Button size="sm" onClick={() => { setFormError(null); setOpen(true); }}>
            <Plus size={14} /> New assignment
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} assignments</span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No assignments yet.</div>
        ) : (
          <div className="px-3 pb-3">
            <Table
              columns={[
                {
                  key: 'title',
                  header: 'Assignment',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-slate-500">
                        {r.className ?? '—'}{r.subjectNameEn ? ` · ${r.subjectNameEn}` : ''} · {r.teacherName ?? ''}
                      </p>
                    </div>
                  ),
                },
                { key: 'dueDate', header: 'Due', render: (r) => (r.dueDate ? <span className="text-xs">{fmtAd(r.dueDate)}</span> : '—') },
                { key: 'totalMarks', header: 'Marks', render: (r) => digits(r.totalMarks) },
                { key: 'submissionCount', header: 'Submitted', render: (r) => <Badge tone={r.submissionCount ? 'green' : 'slate'}>{digits(r.submissionCount)}</Badge> },
                {
                  key: 'mySubmission',
                  header: 'My status',
                  render: (r) =>
                    isStudent ? (
                      r.mySubmission ? (
                        <Badge tone={r.mySubmission.status === 'graded' ? 'green' : r.mySubmission.status === 'late' ? 'amber' : 'teal'}>
                          {r.mySubmission.status}
                        </Badge>
                      ) : (
                        <Badge tone="red">not submitted</Badge>
                      )
                    ) : (
                      '—'
                    ),
                },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {canWrite && (
                        <Button variant="secondary" size="sm" onClick={() => openSubs(r)}>
                          <CheckSquare size={13} /> Submissions
                        </Button>
                      )}
                      {isStudent && (
                        <Button variant="teal" size="sm" onClick={() => setSubmitFor(r)}>
                          <Send size={13} /> Submit
                        </Button>
                      )}
                      {canWrite && (
                        <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No assignments yet."
            />
          </div>
        )}
      </Panel>

      {/* --------------------------------------------------- create */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New assignment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">{formError}</div>
          )}
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
          </div>
          <Field label="Class" required>
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">—</option>
              {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">—</option>
              {lk.subjects.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Due date">
            <DateInput value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
          <Field label="Total marks">
            <Input type="number" min={0} max={1000} value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Instructions">
              <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------ submissions */}
      <Modal
        open={subsFor !== null}
        onClose={() => setSubsFor(null)}
        wide
        title={`Submissions — ${subsFor?.title ?? ''}`}
        footer={<Button variant="secondary" onClick={() => setSubsFor(null)}>{t('close')}</Button>}
      >
        {subsLoading ? (
          <LoadingBlock />
        ) : (
          <Table
            columns={[
              {
                key: 'studentName',
                header: 'Student',
                render: (r) => (
                  <div>
                    <p className="font-medium">{r.studentName}</p>
                    <p className="text-xs text-slate-500">{r.admissionNo} · roll {r.rollNo ?? '—'}</p>
                  </div>
                ),
              },
              { key: 'submittedAt', header: 'Submitted', render: (r) => <span className="text-xs">{fmtAd(r.submittedAt)}</span> },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <Badge tone={r.status === 'graded' ? 'green' : r.status === 'late' ? 'amber' : 'teal'}>{r.status}</Badge>,
              },
              {
                key: 'fileUrl',
                header: 'File / note',
                render: (r) => (
                  <div className="max-w-[240px] text-xs">
                    {r.fileUrl && <a className="text-teal-600 underline" href={r.fileUrl} target="_blank" rel="noreferrer">file</a>}
                    {r.note && <p className="truncate text-slate-500">{r.note}</p>}
                    {!r.fileUrl && !r.note && '—'}
                  </div>
                ),
              },
              { key: 'marksObtained', header: 'Marks', render: (r) => (r.marksObtained != null ? <b>{digits(r.marksObtained)}/{digits(subsFor?.totalMarks ?? '—')}</b> : '—') },
              { key: 'feedback', header: 'Feedback', render: (r) => <span className="block max-w-[180px] truncate">{r.feedback ?? '—'}</span> },
              {
                key: '__a',
                header: '',
                className: 'text-right',
                render: (r) => (
                  <Button variant="secondary" size="sm" onClick={() => { setGradeFor(r); setGrade({ marks: r.marksObtained != null ? String(r.marksObtained) : '', feedback: r.feedback ?? '' }); }}>
                    <Pencil size={13} /> Grade
                  </Button>
                ),
              },
            ]}
            rows={subs}
            empty="No submissions yet."
          />
        )}
      </Modal>

      {/* ------------------------------------------------------ grade */}
      <Modal
        open={gradeFor !== null}
        onClose={() => setGradeFor(null)}
        title={`Grade — ${gradeFor?.studentName ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGradeFor(null)}>{t('cancel')}</Button>
            <Button onClick={saveGrade}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={`Marks (out of ${subsFor?.totalMarks ?? 100})`} required>
            <Input type="number" min={0} max={subsFor?.totalMarks ?? 1000} value={grade.marks} onChange={(e) => setGrade({ ...grade, marks: e.target.value })} />
          </Field>
          <Field label="Feedback">
            <Textarea rows={3} value={grade.feedback} onChange={(e) => setGrade({ ...grade, feedback: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* ---------------------------------------------------- submit */}
      <Modal
        open={submitFor !== null}
        onClose={() => setSubmitFor(null)}
        title={`Submit — ${submitFor?.title ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitFor(null)}>{t('cancel')}</Button>
            <Button onClick={submitAssignment} variant="teal"><Send size={14} /> Submit</Button>
          </>
        }
      >
        <div className="space-y-3">
          {submitFor?.mySubmission && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              You already submitted this assignment — submitting again replaces the previous submission.
            </p>
          )}
          <Field label="File URL" hint="Link to your document (Google Drive, uploads, etc.)">
            <Input value={submission.fileUrl} onChange={(e) => setSubmission({ ...submission, fileUrl: e.target.value })} />
          </Field>
          <Field label="Note">
            <Textarea rows={3} value={submission.note} onChange={(e) => setSubmission({ ...submission, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* =========================================================== quizzes */

interface QuizQ {
  type: 'mcq' | 'short';
  question: string;
  options: string[];
  correctIndex: number | null;
  correctAnswer: string;
  marks: string;
}

function QuizzesTab() {
  const { t, digits } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite = ['super_admin', 'school_admin', 'office', 'teacher'].includes(user?.role ?? '');
  const isStudent = user?.role === 'student';

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lk, setLk] = useState<{ classes: Opt[]; subjects: Opt[] }>({ classes: [], subjects: [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', classId: '', subjectId: '', timeLimitMinutes: '30' });
  const [questions, setQuestions] = useState<QuizQ[]>([{ type: 'mcq', question: '', options: ['', ''], correctIndex: 0, correctAnswer: '', marks: '1' }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [attemptFor, setAttemptFor] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadAll({ classes: lookups.classes, subjects: lookups.subjects }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/lms/quizzes');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setQ = (idx: number, patch: Partial<QuizQ>) =>
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const save = async () => {
    setFormError(null);
    if (!form.title.trim() || !form.classId) return setFormError('Title and class are required');
    const cleaned = questions
      .filter((q) => q.question.trim())
      .map((q) => ({
        type: q.type,
        question: q.question.trim(),
        options: q.type === 'mcq' ? q.options.filter((o) => o.trim()) : [],
        correctIndex: q.type === 'mcq' ? q.correctIndex ?? -1 : null,
        correctAnswer: q.type === 'short' ? q.correctAnswer || null : null,
        marks: Number(q.marks || 1),
      }));
    if (!cleaned.length) return setFormError('Add at least one question');
    setSaving(true);
    try {
      await api.post('/lms/quizzes', {
        title: form.title.trim(),
        description: form.description || null,
        classId: form.classId,
        subjectId: form.subjectId || null,
        timeLimitMinutes: Number(form.timeLimitMinutes || 30),
        questions: cleaned,
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ ...form, title: '', description: '' });
      setQuestions([{ type: 'mcq', question: '', options: ['', ''], correctIndex: 0, correctAnswer: '', marks: '1' }]);
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openAttempt = async (r: any) => {
    setAttemptFor(r);
    setAttemptLoading(true);
    setResult(null);
    setAnswers({});
    try {
      const d = await api.get<any>(`/lms/quizzes/${r.id}/attempt`);
      setAttempt(d);
      if (d.attempt?.answers) setAnswers(d.attempt.answers);
    } catch (e) {
      setAttemptFor(null);
      toast.push(e instanceof ApiError ? e.message : 'Failed to load quiz', 'error');
    } finally {
      setAttemptLoading(false);
    }
  };

  const submitAttempt = async () => {
    if (!attemptFor) return;
    if (!window.confirm('Submit your answers? You cannot change them afterwards.')) return;
    try {
      const r = await api.post<any>(`/lms/quizzes/${attemptFor.id}/submit`, { answers });
      setResult(r);
      toast.push(`Scored ${r.score}/${r.maxScore} (${r.percent}%)`, 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Submit failed', 'error');
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete quiz "${r.title}" and all attempts?`)) return;
    try {
      await api.delete(`/lms/quizzes/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        {canWrite && (
          <Button size="sm" onClick={() => { setFormError(null); setOpen(true); }}>
            <Plus size={14} /> New quiz
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} quizzes</span>
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
                  key: 'title',
                  header: 'Quiz',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-slate-500">{r.className ?? '—'}{r.subjectNameEn ? ` · ${r.subjectNameEn}` : ''}</p>
                    </div>
                  ),
                },
                { key: 'questionCount', header: 'Questions', render: (r) => digits(r.questionCount) },
                { key: 'totalMarks', header: 'Marks', render: (r) => digits(r.totalMarks) },
                { key: 'timeLimitMinutes', header: 'Time limit', render: (r) => `${digits(r.timeLimitMinutes)} min` },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="teal" size="sm" onClick={() => openAttempt(r)}>
                        {canWrite ? <Eye size={13} /> : <Send size={13} />} {canWrite ? 'View' : 'Attempt'}
                      </Button>
                      {canWrite && (
                        <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No quizzes yet."
            />
          </div>
        )}
      </Panel>

      {/* -------------------------------------------------- create quiz */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="New quiz"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">{formError}</div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Title" required>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
            </div>
            <Field label="Class" required>
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">—</option>
                {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Subject">
              <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">—</option>
                {lk.subjects.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Time limit (minutes)">
              <Input type="number" min={1} max={600} value={form.timeLimitMinutes} onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })} />
            </Field>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Questions</p>
          {questions.map((q, idx) => (
            <div key={idx} className="rounded-lg border border-slate-200 p-3 dark:border-navy-700">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="navy">Q{idx + 1}</Badge>
                <Select
                  className="w-auto"
                  value={q.type}
                  onChange={(e) => setQ(idx, { type: e.target.value as 'mcq' | 'short' })}
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="short">Short answer</option>
                </Select>
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-xs text-slate-500">Marks</span>
                  <Input type="number" min={1} max={100} className="w-20" value={q.marks} onChange={(e) => setQ(idx, { marks: e.target.value })} />
                  <button
                    className="rounded-md p-1.5 text-slate-400 hover:text-red-600"
                    onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== idx))}
                    title="Remove"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <Textarea rows={2} placeholder="Question text" value={q.question} onChange={(e) => setQ(idx, { question: e.target.value })} />
              {q.type === 'mcq' ? (
                <div className="mt-2 space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${idx}`}
                        checked={q.correctIndex === oi}
                        onChange={() => setQ(idx, { correctIndex: oi })}
                        title="Correct answer"
                      />
                      <Input
                        value={opt}
                        placeholder={`Option ${oi + 1}`}
                        onChange={(e) => setQ(idx, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })}
                      />
                      <button
                        className="rounded-md p-1.5 text-slate-400 hover:text-red-600"
                        onClick={() => setQ(idx, { options: q.options.filter((_, i) => i !== oi), correctIndex: q.correctIndex === oi ? null : q.correctIndex })}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => setQ(idx, { options: [...q.options, ''] })}>
                    <Plus size={12} /> Add option
                  </Button>
                </div>
              ) : (
                <div className="mt-2">
                  <Input
                    value={q.correctAnswer}
                    placeholder="Correct answer (case-insensitive)"
                    onChange={(e) => setQ(idx, { correctAnswer: e.target.value })}
                  />
                </div>
              )}
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setQuestions((qs) => [...qs, { type: 'mcq', question: '', options: ['', ''], correctIndex: 0, correctAnswer: '', marks: '1' }])}>
            <Plus size={14} /> Add question
          </Button>
        </div>
      </Modal>

      {/* ------------------------------------------------------ attempt */}
      <Modal
        open={attemptFor !== null}
        onClose={() => setAttemptFor(null)}
        wide
        title={`${attemptFor?.title ?? ''} ${isStudent ? '' : '(preview)'}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAttemptFor(null)}>{t('close')}</Button>
            {isStudent && attempt && !attempt.attempt?.submitted && !result && (
              <Button variant="teal" onClick={submitAttempt}><Send size={14} /> Submit answers</Button>
            )}
          </>
        }
      >
        {attemptLoading ? (
          <LoadingBlock />
        ) : attempt ? (
          <div className="space-y-4">
            {result && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm dark:border-teal-900 dark:bg-teal-900/20">
                <b className="text-teal-700 dark:text-teal-300">Score: {digits(result.score)}/{digits(result.maxScore)} ({digits(result.percent)}%)</b>
              </div>
            )}
            {attempt.attempt?.submitted && !result && (
              <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm dark:bg-navy-800">
                Already submitted — score <b>{digits(attempt.attempt.score)}/{digits(attempt.attempt.maxScore)}</b>
              </div>
            )}
            {attempt.questions.map((q: any, i: number) => (
              <div key={q.id} className="rounded-lg border border-slate-200 p-3 dark:border-navy-700">
                <p className="mb-2 text-sm font-medium">
                  <Badge tone="navy">Q{i + 1}</Badge> {q.question} <span className="text-xs text-slate-400">({digits(q.marks)} mark{q.marks > 1 ? 's' : ''})</span>
                </p>
                {q.type === 'mcq' ? (
                  <div className="space-y-1">
                    {q.options.map((o: string, oi: number) => (
                      <label key={oi} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={q.id}
                          disabled={!isStudent || !!attempt.attempt?.submitted || !!result}
                          checked={Number(answers[q.id]) === oi}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: String(oi) }))}
                        />
                        <span>{o}</span>
                        {!isStudent && q.correctIndex === oi && <Badge tone="green">correct</Badge>}
                      </label>
                    ))}
                  </div>
                ) : (
                  <Input
                    disabled={!isStudent || !!attempt.attempt?.submitted || !!result}
                    value={answers[q.id] ?? ''}
                    placeholder="Your answer"
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
