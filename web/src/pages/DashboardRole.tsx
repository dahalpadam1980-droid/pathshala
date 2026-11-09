import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, CalendarCheck, Award, BookOpen, KeyRound, Megaphone } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Card, Badge, StatCard, Button, Modal, Field, Input, useToast, Spinner } from '../lib/ui';
import { PageHeader, KpiGrid, ErrorBlock, LoadingBlock } from '../components/page';

interface MyStudent {
  id: string;
  admissionNo: string;
  nameEn: string;
  nameNe?: string;
  rollNo?: number;
  className?: string;
  sectionName?: string;
  status: string;
  dobBs?: string;
  fatherName?: string;
  motherName?: string;
  address?: string;
  admissionDate?: string;
}
interface AttRow {
  studentId: string;
  nameEn: string;
  nameNe?: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  total: number;
  percentage: number;
}
interface ExamRow {
  id: string;
  name: string;
  type: string;
  status: string;
  publishedAt?: string;
}
interface ResultSubject {
  subjectNameEn: string;
  subjectNameNe?: string;
  total: number;
  maxTotal: number;
  percent: number;
  gradeLetter?: string;
  gradePoint: number;
  isPassed: boolean;
}
interface ResultRow {
  studentId: string;
  nameEn: string;
  rollNo?: number;
  gpa: number;
  percent: number;
  passed: boolean;
  rank?: number;
  subjects: ResultSubject[];
}
interface Assignment {
  id: string;
  title: string;
  dueDate?: string;
  totalMarks: number;
  className?: string;
  subjectNameEn?: string;
  teacherName?: string;
  mySubmission?: { status: string; marksObtained?: number } | null;
}

export default function DashboardRole() {
  const { user } = useAuth();
  const { t, digits, fmtAd, lang, todayBs } = useI18n();
  const toast = useToast();

  const [students, setStudents] = useState<MyStudent[]>([]);
  const [attendance, setAttendance] = useState<AttRow[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [examId, setExamId] = useState('');
  const [result, setResult] = useState<ResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultLoading, setResultLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [st, at, ex, as, nt] = await Promise.all([
          api.get<MyStudent[]>('/students/my').catch(() => [] as MyStudent[]),
          api.get<AttRow[]>('/attendance/my').catch(() => [] as AttRow[]),
          api.get<ExamRow[]>('/exams').catch(() => [] as ExamRow[]),
          api.get<Assignment[]>('/lms/assignments').catch(() => [] as Assignment[]),
          api.get<any[]>('/communication/notices').catch(() => [] as any[]),
        ]);
        if (!alive) return;
        setStudents(st);
        setAttendance(at);
        const published = ex.filter((e) => e.status === 'published' || e.status === 'locked');
        setExams(published.length ? published : ex);
        setAssignments(as.slice(0, 8));
        setNotices(nt.slice(0, 5));
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : 'Failed to load');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // auto-load the newest result
  useEffect(() => {
    if (!examId && exams.length) setExamId(exams[0].id);
  }, [exams, examId]);

  useEffect(() => {
    if (!examId) return;
    let alive = true;
    setResultLoading(true);
    api
      .get<{ data?: ResultRow[] } | ResultRow[]>(`/exams/${examId}/results`)
      .then((r: any) => {
        if (!alive) return;
        const rows = Array.isArray(r) ? r : (r?.data ?? []);
        const myIds = new Set(students.map((s) => s.id));
        const mine =
          rows.find((x: ResultRow) => myIds.has(x.studentId)) ??
          rows.find((x: ResultRow) => x.nameEn === user?.nameEn) ??
          null;
        setResult(mine);
      })
      .catch(() => alive && setResult(null))
      .finally(() => alive && setResultLoading(false));
    return () => {
      alive = false;
    };
  }, [examId, students, user?.nameEn]);

  const changePassword = async () => {
    if (pwd.next !== pwd.confirm) {
      toast.push('Passwords do not match', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pwd.current, newPassword: pwd.next });
      toast.push(t('saved'), 'success');
      setPwdOpen(false);
      setPwd({ current: '', next: '', confirm: '' });
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const totalAtt = useMemo(() => {
    const s = attendance.reduce(
      (acc, a) => ({ present: acc.present + a.present + a.late, total: acc.total + a.total }),
      { present: 0, total: 0 },
    );
    return s.total ? Math.round((s.present / s.total) * 1000) / 10 : 0;
  }, [attendance]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={() => location.reload()} />;

  const isStudent = user?.role === 'student';
  const primary = students[0];

  return (
    <>
      <PageHeader
        title={`${t('welcomeBack')}, ${lang === 'ne' ? user?.nameNe || user?.nameEn : user?.nameEn || ''}`}
        subtitle={`${user?.schoolName ?? ''} · ${t('today')}: ${digits(todayBs())} BS`}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setPwdOpen(true)}>
            <KeyRound size={14} /> {t('password')}
          </Button>
        }
      />

      {/* profile / children */}
      {students.length === 0 ? (
        <Card className="mb-4">
          <p className="text-sm text-slate-500">
            {isStudent
              ? 'No student profile is linked to this account yet. Please contact the school office.'
              : 'No children found linked to this account. Please contact the school office to link your child.'}
          </p>
        </Card>
      ) : (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {students.map((s) => (
            <Card key={s.id} title={
              <span className="flex items-center gap-2">
                <GraduationCap size={16} className="text-teal-600" />
                {lang === 'ne' ? s.nameNe || s.nameEn : s.nameEn}
                <Badge tone="green">{digits(s.admissionNo)}</Badge>
              </span>
            }>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div><dt className="text-xs text-slate-500">{t('classes')}</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{s.className ?? '—'} {s.sectionName ? `· ${s.sectionName}` : ''}</dd></div>
                <div><dt className="text-xs text-slate-500">Roll</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{digits(s.rollNo ?? '—')}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('date')}</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{fmtAd(s.admissionDate)}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('status')}</dt><dd><Badge tone={s.status === 'active' ? 'green' : 'amber'}>{s.status}</Badge></dd></div>
                {s.fatherName && <div className="col-span-2"><dt className="text-xs text-slate-500">Father</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{s.fatherName}</dd></div>}
              </dl>
            </Card>
          ))}
        </div>
      )}

      <KpiGrid>
        <StatCard label={t('attendance')} value={`${digits(totalAtt)}%`} hint={attendance[0] ? `${t('month')}: ${digits(attendance[0].total)} ${t('records').toLowerCase()}` : t('noData')} accent="teal" icon={<CalendarCheck size={18} />} />
        <StatCard label={t('exams')} value={digits(exams.length)} hint={exams[0] ? exams[0].name : t('noData')} accent="navy" icon={<Award size={18} />} />
        <StatCard label={t('assignments')} value={digits(assignments.length)} hint={`${t('lms')}`} accent="amber" icon={<BookOpen size={18} />} />
        <StatCard label={t('notices')} value={digits(notices.length)} hint={t('publishedNotices')} accent="green" icon={<Megaphone size={18} />} />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* attendance detail */}
        <Card className="lg:col-span-2" title={t('attendance')}>
          {attendance.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{t('noData')}</p>
          ) : (
            <div className="space-y-4">
              {attendance.map((a) => (
                <div key={a.studentId}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {lang === 'ne' ? a.nameNe || a.nameEn : a.nameEn}
                    </span>
                    <span className="font-semibold text-teal-700 dark:text-teal-300">{digits(a.percentage)}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${a.percentage}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{t('present')}: <b className="text-emerald-600">{digits(a.present)}</b></span>
                    <span>{t('late')}: <b className="text-amber-600">{digits(a.late)}</b></span>
                    <span>{t('absent')}: <b className="text-red-600">{digits(a.absent)}</b></span>
                    <span>{t('leave')}: <b>{digits(a.leave)}</b></span>
                    <span>{t('total')}: {digits(a.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* results */}
        <Card
          title={t('results')}
          actions={
            exams.length > 0 ? (
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                className="max-w-[170px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-navy-600 dark:bg-navy-800"
              >
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            ) : undefined
          }
        >
          {!examId ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {exams.length === 0 ? 'No exams published yet.' : t('noYear')}
            </p>
          ) : resultLoading ? (
            <Spinner size={22} />
          ) : !result ? (
            <p className="py-6 text-center text-sm text-slate-500">Result not published for you yet.</p>
          ) : (
            <div>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-navy-50 py-2 dark:bg-navy-800">
                  <p className="text-[11px] text-slate-500">GPA</p>
                  <p className="text-lg font-bold text-navy-700 dark:text-teal-300">{digits(result.gpa.toFixed(2))}</p>
                </div>
                <div className="rounded-lg bg-teal-50 py-2 dark:bg-teal-900/30">
                  <p className="text-[11px] text-teal-700 dark:text-teal-300">%</p>
                  <p className="text-lg font-bold text-teal-700 dark:text-teal-200">{digits(result.percent.toFixed(1))}</p>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-navy-800">
                  <p className="text-[11px] text-slate-500">{t('rank')}</p>
                  <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{digits(result.rank ?? '—')}</p>
                </div>
              </div>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {result.subjects.map((s, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-navy-800">
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {lang === 'ne' ? s.subjectNameNe || s.subjectNameEn : s.subjectNameEn}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">{digits(s.total)}/{digits(s.maxTotal)}</span>
                      <Badge tone={s.isPassed ? 'green' : 'red'}>{s.gradeLetter ?? (s.isPassed ? 'P' : 'F')}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`${t('assignments')}`} actions={<Link to="/lms" className="text-xs font-medium text-teal-600 hover:underline">{t('view')}</Link>}>
          {assignments.length === 0 ? (
            <p className="py-5 text-center text-sm text-slate-500">{t('noData')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{a.title}</p>
                    <p className="text-xs text-slate-500">
                      {a.subjectNameEn ?? ''} {a.className ? `· ${a.className}` : ''} {a.dueDate ? `· ${t('to')} ${fmtAd(a.dueDate)}` : ''}
                    </p>
                  </div>
                  <Badge tone={a.mySubmission ? 'green' : 'amber'}>
                    {a.mySubmission ? a.mySubmission.status : t('unmarked')}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('notices')} actions={<Link to="/notices" className="text-xs font-medium text-teal-600 hover:underline">{t('view')}</Link>}>
          {notices.length === 0 ? (
            <p className="py-5 text-center text-sm text-slate-500">{t('noData')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {notices.map((n) => (
                <li key={n.id} className="py-2">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {lang === 'ne' ? n.titleNe || n.titleEn : n.titleEn}
                  </p>
                  <p className="text-xs text-slate-500">{fmtAd(n.publishedAt ?? n.createdAt)} · {n.priority}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        title={t('password')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwdOpen(false)}>{t('cancel')}</Button>
            <Button onClick={changePassword} loading={savingPwd}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={`${t('password')} (current)`} required>
            <Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
          </Field>
          <Field label={`${t('password')} (new)`} required>
            <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
          </Field>
          <Field label="Confirm" required>
            <Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
