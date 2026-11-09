import { useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Select, StatCard } from '../lib/ui';

export default function ReportsPage() {
  const [tab, setTab] = useState('overview');
  return (
    <>
      <PageHeader
        title="Reports & analytics"
        subtitle="School-wide overview, attendance, exam performance, fee collection, library and inventory stats"
        actions={
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={14} /> Print</Button>
        }
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'attendance', label: 'Attendance' },
          { key: 'exams', label: 'Exams' },
          { key: 'fees', label: 'Fees' },
          { key: 'library', label: 'Library' },
          { key: 'inventory', label: 'Inventory' },
        ]}
      />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'exams' && <ExamsTab />}
      {tab === 'fees' && <FeesTab />}
      {tab === 'library' && <LibraryTab />}
      {tab === 'inventory' && <InventoryTab />}
    </>
  );
}

function useReport<T>(path: string, query?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(query ?? {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<T>(path, JSON.parse(key));
      setData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

function Block<T>({ path, query, children }: { path: string; query?: Record<string, unknown>; children: (d: T) => React.ReactNode }) {
  const { data, loading, error, reload } = useReport<T>(path, query);
  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (error) return <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>;
  if (!data) return null;
  return <>{children(data)}</>;
}

/* =========================================================== overview */

function OverviewTab() {
  const { npr, digits } = useI18n();
  return (
    <Block<any> path="/reports/overview">
      {(d) => (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Students" value={digits(d.students ?? 0)} hint={`${digits(d.classes ?? 0)} classes`} accent="navy" />
            <StatCard label="Teachers" value={digits(d.teachers ?? 0)} hint={`${digits(d.employees ?? 0)} staff`} accent="teal" />
            <StatCard
              label="Attendance today"
              value={`${digits(d.attendanceToday?.percent ?? 0)}%`}
              hint={`${digits(d.attendanceToday?.present ?? 0)} / ${digits(d.attendanceToday?.total ?? 0)} present`}
              accent="green"
            />
            <StatCard
              label="Fees outstanding"
              value={npr(d.fees?.outstanding ?? 0)}
              hint={`collected ${npr(d.fees?.collected ?? 0)}`}
              accent="amber"
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">Students by class</div>
              <div className="px-3 pb-3">
                <Table
                  columns={[
                    { key: 'name', header: 'Class', render: (r: any) => <b>{r.name}</b> },
                    { key: 'count', header: 'Students', render: (r: any) => digits(r.count ?? 0) },
                  ]}
                  rows={(d.studentsByClass ?? []).map((r: any) => ({ name: r.class ?? '—', count: r.count }))}
                  empty="No students enrolled."
                />
              </div>
            </Panel>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">This year at a glance</div>
              <div className="grid grid-cols-2 gap-4 p-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-slate-400">Academic year</p>
                  <p className="font-semibold">{d.academicYear?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Published notices</p>
                  <p className="font-semibold">{digits(d.publishedNotices ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Fee collected</p>
                  <p className="font-semibold text-emerald-600">{npr(d.fees?.collected ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Fee due</p>
                  <p className="font-semibold text-red-600">{npr(d.fees?.due ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Classes</p>
                  <p className="font-semibold">{digits(d.classes ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-400">Staff</p>
                  <p className="font-semibold">{digits(d.employees ?? 0)}</p>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}
    </Block>
  );
}

/* ========================================================= attendance */

function AttendanceTab() {
  const { digits } = useI18n();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-500">Per-student summary for the selected month</span>
      </Toolbar>

      <Block<any[]> path="/reports/attendance" query={{ month }}>
        {(rows) => {
          const list = Array.isArray(rows) ? rows : [];
          const sum = (k: string) => list.reduce((s, r) => s + Number(r[k] ?? 0), 0);
          const avg = list.length ? Math.round(list.reduce((s, r) => s + Number(r.percent ?? 0), 0) / list.length) : 0;
          const days = list.reduce((m, r) => Math.max(m, Number(r.total ?? 0)), 0);
          return (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Working days" value={digits(days)} accent="navy" />
                <StatCard label="Avg. attendance" value={`${digits(avg)}%`} accent={avg >= 90 ? 'green' : avg >= 75 ? 'amber' : 'red'} />
                <StatCard label="Present" value={digits(sum('present'))} accent="green" />
                <StatCard label="Absent" value={digits(sum('absent'))} accent="red" />
              </div>

              <Panel>
                <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">Students — {month}</div>
                <div className="px-3 pb-3">
                  <Table
                    columns={[
                      { key: 'roll', header: 'Roll', render: (r: any) => digits(r.roll ?? '—') },
                      {
                        key: 'name',
                        header: 'Student',
                        render: (r: any) => (
                          <div>
                            <p className="font-medium">{r.name}</p>
                            <p className="text-xs text-slate-500">{r.class ?? '—'}{r.section ? ` · ${r.section}` : ''}</p>
                          </div>
                        ),
                      },
                      { key: 'present', header: 'Present', render: (r: any) => <span className="text-emerald-600">{digits(r.present)}</span> },
                      { key: 'absent', header: 'Absent', render: (r: any) => <span className="text-red-600">{digits(r.absent)}</span> },
                      { key: 'late', header: 'Late', render: (r: any) => digits(r.late) },
                      { key: 'leave', header: 'Leave', render: (r: any) => digits(r.leave) },
                      {
                        key: 'percent',
                        header: 'Rate',
                        render: (r: any) => {
                          const rate = Number(r.percent ?? 0);
                          return <Badge tone={rate >= 90 ? 'green' : rate >= 75 ? 'amber' : 'red'}>{digits(rate)}%</Badge>;
                        },
                      },
                    ]}
                    rows={list}
                    empty="No attendance recorded for this month."
                  />
                </div>
              </Panel>
            </>
          );
        }}
      </Block>
    </>
  );
}

/* ============================================================== exams */

function ExamsTab() {
  const { digits } = useI18n();
  const [examId, setExamId] = useState('');
  const [exams, setExams] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    api
      .list<any>('/exams', { pageSize: 200 })
      .then((r) => setExams((r.data ?? []).map((e: any) => ({ value: e.id, label: e.name ?? e.title ?? e.id }))))
      .catch(() => undefined);
  }, []);

  const { data, loading, error, reload } = useReport<any>('/reports/exams', examId ? { examId } : undefined);

  if (!loading && error && /no exams/i.test(error)) {
    return (
      <Panel>
        <div className="py-14 text-center text-sm text-slate-500">
          No exams yet — create an exam under Exams and enter marks to see performance analytics here.
        </div>
      </Panel>
    );
  }

  return (
    <>
      <Toolbar>
        <Select className="w-auto min-w-[220px]" value={examId} onChange={(e) => setExamId(e.target.value)}>
          <option value="">Latest exam</option>
          {exams.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
        <span className="ml-auto text-xs text-slate-500">Pass rate, subject and class performance</span>
      </Toolbar>

      {loading ? (
        <Panel><LoadingBlock /></Panel>
      ) : error ? (
        <div className="p-4"><ErrorBlock message={error} onRetry={reload} /></div>
      ) : !data ? null : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Exam" value={data.exam?.name ?? '—'} accent="navy" />
            <StatCard label="Marks entered" value={digits(data.summary?.marksEntered ?? 0)} accent="teal" />
            <StatCard
              label="Pass / fail"
              value={`${digits(data.summary?.pass ?? 0)} / ${digits(data.summary?.fail ?? 0)}`}
              accent="green"
            />
            <StatCard label="Overall average" value={`${digits(data.summary?.overallPercent ?? 0)}%`} accent="amber" />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">By subject</div>
              <div className="px-3 pb-3">
                <Table
                  columns={[
                    { key: 'subject', header: 'Subject', render: (r: any) => <b>{r.subject}</b> },
                    { key: 'average', header: 'Avg %', render: (r: any) => digits(Number(r.average)) },
                    {
                      key: 'passPercent',
                      header: 'Pass %',
                      render: (r: any) => {
                        const rate = Number(r.passPercent ?? 0);
                        return <Badge tone={rate >= 90 ? 'green' : rate >= 60 ? 'amber' : 'red'}>{digits(rate)}%</Badge>;
                      },
                    },
                    { key: 'highest', header: 'High', render: (r: any) => digits(Number(r.highest)) },
                    { key: 'lowest', header: 'Low', render: (r: any) => digits(Number(r.lowest)) },
                  ]}
                  rows={data.summary?.subjects ?? []}
                  empty="No subject marks entered yet."
                />
              </div>
            </Panel>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">By class</div>
              <div className="px-3 pb-3">
                <Table
                  columns={[
                    { key: 'className', header: 'Class', render: (r: any) => <b>{r.className}</b> },
                    { key: 'students', header: 'Students', render: (r: any) => digits(r.students) },
                    { key: 'average', header: 'Average %', render: (r: any) => digits(Number(r.average)) },
                  ]}
                  rows={data.summary?.classes ?? []}
                  empty="No class results yet."
                />
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

/* =============================================================== fees */

function FeesTab() {
  const { npr, digits } = useI18n();
  return (
    <Block<any> path="/reports/fees">
      {(d) => {
        const t = d.totals ?? {};
        const rate = Number(t.billed) > 0 ? Math.round((Number(t.collected) / Number(t.billed)) * 100) : 0;
        return (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Billed" value={npr(t.billed ?? 0)} hint={d.academicYear?.name} accent="navy" />
              <StatCard label="Collected" value={npr(t.collected ?? 0)} hint={`${digits(t.receipts ?? 0)} receipts`} accent="green" />
              <StatCard label="Outstanding" value={npr(t.outstanding ?? 0)} accent="red" />
              <StatCard label="Collection rate" value={`${digits(rate)}%`} accent="teal" />
            </div>

            <Panel>
              <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
                By class — {d.academicYear?.name ?? ''}
              </div>
              <div className="px-3 pb-3">
                <Table
                  columns={[
                    { key: 'className', header: 'Class', render: (r: any) => <b>{r.className}</b> },
                    { key: 'billed', header: 'Billed', render: (r: any) => npr(r.billed) },
                    { key: 'collected', header: 'Collected', render: (r: any) => <span className="text-emerald-600">{npr(r.collected)}</span> },
                    {
                      key: 'outstanding',
                      header: 'Outstanding',
                      render: (r: any) => <span className="text-red-600">{npr(Number(r.billed) - Number(r.collected))}</span>,
                    },
                  ]}
                  rows={d.byClass ?? []}
                  empty="No fee records for this academic year yet."
                />
              </div>
            </Panel>
          </>
        );
      }}
    </Block>
  );
}

/* ============================================================ library */

function LibraryTab() {
  const { digits, fmtAd } = useI18n();
  return (
    <Block<any> path="/reports/library">
      {(d) => (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Books in catalogue" value={digits(d.books ?? 0)} accent="navy" />
            <StatCard label="Currently issued" value={digits(d.issued ?? 0)} accent="teal" />
            <StatCard label="Overdue" value={digits(d.overdue?.length ?? 0)} accent="red" />
            <StatCard
              label="Available"
              value={digits(Math.max(0, Number(d.books ?? 0) - Number(d.issued ?? 0)))}
              accent="green"
            />
          </div>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">Overdue issues</div>
            <div className="px-3 pb-3">
              <Table
                columns={[
                  { key: 'bookTitle', header: 'Book', render: (r: any) => <b>{r.bookTitle ?? '—'}</b> },
                  { key: 'borrowerName', header: 'Borrower', render: (r: any) => r.borrowerName ?? '—' },
                  { key: 'issuedToType', header: 'Type', render: (r: any) => <Badge tone="navy">{r.issuedToType}</Badge> },
                  { key: 'dueDate', header: 'Due', render: (r: any) => <span className="text-xs font-semibold text-red-600">{fmtAd(r.dueDate)}</span> },
                ]}
                rows={d.overdue ?? []}
                empty="Nothing overdue — all books are returned on time."
              />
            </div>
          </Panel>
        </>
      )}
    </Block>
  );
}

/* ========================================================== inventory */

function InventoryTab() {
  const { npr, digits } = useI18n();
  return (
    <Block<any> path="/reports/inventory">
      {(d) => (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Asset types" value={digits(d.items ?? 0)} accent="navy" />
            <StatCard label="Total units" value={digits(d.units ?? 0)} accent="teal" />
            <StatCard label="Stock value" value={npr(d.stockValue ?? 0)} accent="green" />
            <StatCard label="Damaged / lost" value={digits(d.damagedOrLost ?? 0)} accent="red" />
          </div>

          <Panel>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">By category</div>
            <div className="px-3 pb-3">
              <Table
                columns={[
                  { key: 'category', header: 'Category', render: (r: any) => <b>{String(r.category ?? '—').replace(/_/g, ' ')}</b> },
                  { key: 'quantity', header: 'Units', render: (r: any) => digits(r.quantity ?? 0) },
                ]}
                rows={d.byCategory ?? []}
                empty="No assets recorded yet."
              />
            </div>
          </Panel>
        </>
      )}
    </Block>
  );
}
