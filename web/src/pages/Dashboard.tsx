import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, CalendarCheck, Wallet, Megaphone, Layers, ArrowRight, BadgeCheck,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth, ROLE_HOME } from '../lib/auth';
import { StatCard, Card, Badge, Button, Spinner } from '../lib/ui';
import { PageHeader, KpiGrid, ErrorBlock } from '../components/page';

interface Overview {
  academicYear: { name: string; startBs?: string; endBs?: string; isCurrent?: boolean } | null;
  students: number;
  teachers: number;
  employees: number;
  classes: number;
  fees: { collected: number; due: number; outstanding: number };
  attendanceToday: { total: number; present: number; percent: number };
  publishedNotices: number;
  studentsByClass: { class: string; count: number }[];
}

interface NoticeRow {
  id: string;
  titleEn: string;
  titleNe?: string;
  bodyEn: string;
  priority: string;
  pinned: boolean;
  publishedAt?: string;
  createdAt: string;
  authorName?: string;
}

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'];

export default function Dashboard() {
  const { user } = useAuth();
  const { t, digits, npr, fmtAd, lang, todayBs } = useI18n();
  const navigate = useNavigate();

  const [data, setData] = useState<Overview | null>(null);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ov, nt] = await Promise.all([
          api.get<Overview>('/reports/overview'),
          api.get<NoticeRow[]>('/communication/notices').catch(() => [] as NoticeRow[]),
        ]);
        if (!alive) return;
        setData(ov);
        setNotices(Array.isArray(nt) ? nt.slice(0, 6) : []);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? e.message : 'Failed to load dashboard');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid place-items-center py-24 text-teal-600">
        <Spinner size={30} />
      </div>
    );
  }

  if (error || !data) return <ErrorBlock message={error ?? 'No data'} onRetry={() => location.reload()} />;

  const axis = dark ? '#94a3b8' : '#64748b';
  const grid = dark ? '#1e3a5f' : '#e2e8f0';
  const attendancePie = [
    { name: t('present'), value: data.attendanceToday.present },
    { name: t('unmarked'), value: Math.max(0, data.attendanceToday.total - data.attendanceToday.present) },
  ];
  const feeRate = data.fees.due > 0 ? Math.round((data.fees.collected / data.fees.due) * 100) : 0;

  const quickActions = [
    { to: '/students', label: t('students'), roles: ['school_admin', 'office', 'teacher', 'accountant'] },
    { to: '/attendance', label: t('attendance'), roles: ['school_admin', 'office', 'teacher'] },
    { to: '/exams', label: t('exams'), roles: ['school_admin', 'office', 'teacher', 'accountant'] },
    { to: '/finance', label: t('payments'), roles: ['school_admin', 'accountant'] },
    { to: '/notices', label: t('notices'), roles: ['school_admin', 'office', 'teacher', 'accountant'] },
    { to: '/reports', label: t('reports'), roles: ['school_admin', 'accountant', 'office'] },
  ].filter((a) => a.roles.includes(user?.role ?? ''));

  return (
    <>
      <PageHeader
        title={`${t('dashboard')} · ${lang === 'ne' ? user?.nameNe || user?.nameEn : user?.nameEn || ''}`}
        subtitle={`${t('today')}: ${digits(todayBs())} BS${data.academicYear ? ` · ${t('academicYear')}: ${digits(data.academicYear.name)}` : ` · ${t('noYear')}`}`}
        actions={
          quickActions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {quickActions.slice(0, 3).map((a) => (
                <Link key={a.to} to={a.to}>
                  <Button variant="secondary" size="sm">{a.label}</Button>
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />

      <KpiGrid>
        <StatCard
          label={t('totalStudents')}
          value={digits(data.students)}
          hint={`${digits(data.classes)} ${t('classes').toLowerCase()}`}
          accent="navy"
          icon={<GraduationCap size={18} />}
        />
        <StatCard
          label={t('totalTeachers')}
          value={digits(data.teachers)}
          hint={`${digits(data.employees)} ${t('staff').toLowerCase()}`}
          accent="teal"
          icon={<Users size={18} />}
        />
        <StatCard
          label={t('attendanceToday')}
          value={`${digits(data.attendanceToday.percent)}%`}
          hint={`${digits(data.attendanceToday.present)} / ${digits(data.attendanceToday.total)}`}
          accent="green"
          icon={<CalendarCheck size={18} />}
        />
        <StatCard
          label={t('feesCollected')}
          value={npr(data.fees.collected)}
          hint={`${t('feesOutstanding')}: ${npr(data.fees.outstanding)}`}
          accent="amber"
          icon={<Wallet size={18} />}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* students by class */}
        <Card
          className="xl:col-span-2"
          title={`${t('studentsByClass')} — ${t('students')}`}
          actions={<Link to="/students" className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline">{t('view')} <ArrowRight size={13} /></Link>}
        >
          <div className="h-64">
            {data.studentsByClass.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-slate-500">{t('noData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.studentsByClass} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <XAxis dataKey="class" tick={{ fill: axis, fontSize: 11 }} stroke={grid} />
                  <YAxis tick={{ fill: axis, fontSize: 11 }} stroke={grid} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: dark ? '#0f172a' : '#fff', border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: dark ? '#e2e8f0' : '#0f172a' }}
                  />
                  <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* attendance today */}
        <Card title={t('attendanceToday')}>
          <div className="h-52">
            {data.attendanceToday.total === 0 ? (
              <div className="grid h-full place-items-center text-sm text-slate-500">{t('noData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attendancePie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    <Cell fill="#10b981" />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: dark ? '#0f172a' : '#fff', border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-600 dark:bg-navy-800 dark:text-slate-300">
            {t('present')}: <b>{digits(data.attendanceToday.present)}</b> / {digits(data.attendanceToday.total)}
          </div>
        </Card>

        {/* fees */}
        <Card title={t('finance')}>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-500">{t('feesCollected')}</span>
                <span className="font-semibold text-navy-700 dark:text-teal-300">{digits(feeRate)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800">
                <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${feeRate}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 px-2 py-2.5 dark:bg-emerald-900/30">
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{t('feesCollected')}</p>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{npr(data.fees.collected)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-2 py-2.5 dark:bg-amber-900/30">
                <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('feesOutstanding')}</p>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">{npr(data.fees.outstanding)}</p>
              </div>
            </div>
            <Link to="/finance" className="block">
              <Button variant="secondary" size="sm" className="w-full">{t('view')} <ArrowRight size={13} /></Button>
            </Link>
          </div>
        </Card>

        {/* notices */}
        <Card
          className="xl:col-span-2"
          title={`${t('recentNotices')} (${digits(data.publishedNotices)})`}
          actions={<Link to="/notices" className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline">{t('view')} <ArrowRight size={13} /></Link>}
        >
          {notices.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">{t('noData')}</div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {notices.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5">
                    <Badge tone={n.priority === 'urgent' || n.priority === 'high' ? 'red' : n.pinned ? 'amber' : 'slate'}>
                      {n.priority}
                    </Badge>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {lang === 'ne' ? n.titleNe || n.titleEn : n.titleEn || n.titleNe}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {n.authorName ? `${n.authorName} · ` : ''}{fmtAd(n.publishedAt ?? n.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* quick actions */}
      {quickActions.length > 0 && (
        <Card className="mt-4" title={t('quickActions')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map((a) => (
              <button
                key={a.to}
                onClick={() => navigate(a.to)}
                className="group flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:border-teal-400 hover:bg-teal-50 dark:border-navy-700 dark:text-slate-200 dark:hover:bg-navy-800"
              >
                {a.label}
                <ArrowRight size={14} className="text-slate-400 group-hover:text-teal-600" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {data.academicYear?.isCurrent && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <BadgeCheck size={13} className="text-teal-500" />
          {t('academicYear')}: {digits(data.academicYear.name)}
        </p>
      )}
    </>
  );
}
