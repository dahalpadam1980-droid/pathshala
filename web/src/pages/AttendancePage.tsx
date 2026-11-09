import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, BellRing, CheckCheck, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n, adToBs } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { Tabs, PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Select, Input, Badge, Table, useToast, Spinner, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

type Status = 'present' | 'absent' | 'late' | 'leave';
interface RosterRow {
  id: string;
  nameEn: string;
  nameNe?: string;
  rollNo?: number;
  admissionNo: string;
  status: Status | null;
  remarks?: string | null;
  className?: string;
  sectionName?: string;
}

const STATUSES: { value: Status; label: string; cls: string; active: string }[] = [
  { value: 'present', label: 'P', cls: 'border-emerald-300 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'absent', label: 'A', cls: 'border-red-300 text-red-700', active: 'bg-red-600 text-white border-red-600' },
  { value: 'late', label: 'L', cls: 'border-amber-300 text-amber-700', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'leave', label: 'Lv', cls: 'border-slate-300 text-slate-600', active: 'bg-slate-600 text-white border-slate-600' },
];

export default function AttendancePage() {
  const { t, digits, fmtAd, monthName } = useI18n();
  const toast = useToast();

  const [tab, setTab] = useState('students');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [classes, setClasses] = useState<Opt[]>([]);
  const [secRows, setSecRows] = useState<{ id: string; name: string; classId: string }[]>([]);
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  useEffect(() => {
    lookups.classes().then(setClasses);
    api
      .list<any>('/academics/sections', { pageSize: 500 })
      .then((r) => setSecRows((r.data ?? []).map((s: any) => ({ id: s.id, name: s.name, classId: s.classId }))))
      .catch(() => setSecRows([]));
  }, []);

  const sectionOptions = useMemo(
    () => secRows.filter((s) => !classId || s.classId === classId).map((s) => ({ value: s.id, label: s.name })),
    [secRows, classId],
  );

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<RosterRow[]>('/attendance/students', {
        date,
        ...(sectionId ? { sectionId } : {}),
        ...(classId ? { classId } : {}),
      });
      setRoster(r.map((x) => ({ ...x })));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, [date, classId, sectionId]);

  useEffect(() => {
    if (tab === 'students') loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, date, classId, sectionId]);

  // monthly report
  useEffect(() => {
    if (tab !== 'monthly') return;
    let alive = true;
    setLoadingMonthly(true);
    api
      .list<any>('/attendance/students/monthly', { month, ...(classId ? { classId } : {}) })
      .then((r) => alive && setMonthly(r.data ?? []))
      .catch(() => alive && setMonthly([]))
      .finally(() => alive && setLoadingMonthly(false));
    return () => {
      alive = false;
    };
  }, [tab, month, classId]);

  const setStatus = (id: string, status: Status) =>
    setRoster((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));

  const markAll = (status: Status) => setRoster((rows) => rows.map((r) => ({ ...r, status })));

  const save = async () => {
    const records = roster.filter((r) => r.status).map((r) => ({ studentId: r.id, status: r.status as Status }));
    if (!records.length) {
      toast.push('Nothing to save', 'info');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ saved: number }>('/attendance/students/mark', {
        date,
        sectionId: sectionId || null,
        records,
      });
      toast.push(`${t('attendanceSaved')} (${digits(res.saved)})`, 'success');
      loadRoster();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const notifyAbsent = async () => {
    try {
      const r = await api.post<{ queued: number; gateway: string }>('/attendance/students/notify-absent', {
        date,
        sectionId: sectionId || null,
      });
      toast.push(
        r.gateway === 'configured'
          ? `Queued ${r.queued} SMS notifications`
          : `${r.queued} notifications recorded — SMS gateway not configured`,
        r.gateway === 'configured' ? 'success' : 'info',
      );
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  const counts = roster.reduce(
    (acc, r) => {
      if (r.status) acc[r.status] += 1;
      else acc.unmarked += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 } as Record<string, number>,
  );

  return (
    <>
      <PageHeader
        title={t('attendance')}
        subtitle={`${t('date')}: ${digits(adToBs(date))} BS · ${digits(date)} AD`}
        actions={
          tab === 'students' ? (
            <>
              <Button variant="secondary" size="sm" onClick={notifyAbsent} disabled={!roster.length}>
                <BellRing size={14} /> Notify absent
              </Button>
              <Button variant="teal" size="sm" onClick={save} loading={saving} disabled={!roster.length}>
                <Save size={14} /> {saving ? t('saving') : t('saveAttendance')}
              </Button>
            </>
          ) : undefined
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'students', label: `${t('students')} · ${t('mark')}` },
          { key: 'monthly', label: `${t('month')} ${t('reports')}` },
        ]}
      />

      <Toolbar>
        {tab === 'students' ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">{t('date')}</span>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
              <span className="text-xs text-slate-500">BS {digits(adToBs(date))}</span>
            </div>
            <Select className="w-auto" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}>
              <option value="">{t('all')} — {t('classes')}</option>
              {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <Select className="w-auto" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">{t('all')} — {t('sections')}</option>
              {sectionOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Button variant="secondary" size="sm" onClick={() => markAll('present')}>
              <CheckCheck size={14} /> {t('markAllPresent')}
            </Button>
          </>
        ) : (
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-auto" />
            <span className="text-xs text-slate-500">{monthName(`${month}-01`)}</span>
            <Select className="w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t('all')} — {t('classes')}</option>
              {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </>
        )}
      </Toolbar>

      {tab === 'students' ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label={t('total')} value={digits(roster.length)} accent="navy" />
            <StatCard label={t('present')} value={digits(counts.present + counts.late)} accent="green" />
            <StatCard label={t('absent')} value={digits(counts.absent)} accent="red" />
            <StatCard label={t('leave')} value={digits(counts.leave)} accent="amber" />
            <StatCard label={t('unmarked')} value={digits(counts.unmarked)} accent="teal" />
          </div>

          <Panel>
            {loading ? (
              <LoadingBlock />
            ) : error ? (
              <div className="p-4"><ErrorBlock message={error} onRetry={loadRoster} /></div>
            ) : roster.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No students found for this filter. Pick a class/section or add students first.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-navy-800">
                {roster.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 font-mono text-xs text-slate-500">{digits(r.rollNo ?? '—')}</span>
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {r.nameNe || r.nameEn}
                      </p>
                      <p className="text-[11px] text-slate-500">{digits(r.admissionNo)} {r.sectionName ? `· ${r.sectionName}` : ''}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {STATUSES.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setStatus(r.id, s.value)}
                          title={s.value}
                          className={`w-10 rounded-md border px-1 py-1 text-xs font-bold transition ${
                            r.status === s.value ? s.active : `bg-white ${s.cls} dark:bg-navy-800`
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <Badge tone={r.status === 'present' ? 'green' : r.status === 'absent' ? 'red' : r.status ? 'amber' : 'slate'}>
                      {r.status ?? t('unmarked')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : (
        <Panel>
          {loadingMonthly ? (
            <LoadingBlock />
          ) : (
            <div className="px-3 pb-3">
              <Table
                columns={[
                  { key: 'rollNo', header: 'Roll', render: (r) => digits(r.rollNo ?? '—') },
                  { key: 'nameEn', header: t('name'), render: (r) => <span className="font-medium">{r.nameEn}</span> },
                  { key: 'className', header: t('classes'), render: (r) => `${r.className ?? '—'} ${r.sectionName ?? ''}` },
                  { key: 'present', header: t('present'), render: (r) => digits(r.present) },
                  { key: 'late', header: t('late'), render: (r) => digits(r.late) },
                  { key: 'absent', header: t('absent'), render: (r) => digits(r.absent) },
                  { key: 'leave', header: t('leave'), render: (r) => digits(r.leave) },
                  { key: 'total', header: t('total'), render: (r) => digits(r.total) },
                  {
                    key: 'percentage',
                    header: '%',
                    render: (r) => (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800">
                          <div
                            className={`h-full rounded-full ${r.percentage >= 90 ? 'bg-emerald-500' : r.percentage >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${r.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">{digits(r.percentage)}%</span>
                      </div>
                    ),
                  },
                ]}
                rows={monthly}
                empty={`${t('noData')} — ${t('attendance')}`}
              />
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
