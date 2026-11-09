import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Input, Select, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

export default function FinanceReportsPage() {
  const [tab, setTab] = useState('summary');
  return (
    <>
      <PageHeader
        title="Finance reports"
        subtitle="Cash book, trial balance, outstanding fees and collection analytics — all computed from posted transactions"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'summary', label: 'Overview' },
          { key: 'cashbook', label: 'Cash book' },
          { key: 'trial', label: 'Trial balance' },
          { key: 'outstanding', label: 'Outstanding fees' },
          { key: 'collection', label: 'Collection' },
        ]}
      />
      {tab === 'summary' && <SummaryTab />}
      {tab === 'cashbook' && <CashbookTab />}
      {tab === 'trial' && <TrialTab />}
      {tab === 'outstanding' && <OutstandingTab />}
      {tab === 'collection' && <CollectionTab />}
    </>
  );
}

/* ================================================================ summary */

function SummaryTab() {
  const { npr, digits } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<any>('/finance/reports/summary');
      setData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (error) return <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>;
  if (!data) return null;

  const trendByMonth = new Map<string, { income: number; expense: number }>();
  for (const row of data.trend ?? []) {
    const cur = trendByMonth.get(row.month) ?? { income: 0, expense: 0 };
    if (row.type === 'income') cur.income += Number(row.total);
    else cur.expense += Number(row.total);
    trendByMonth.set(row.month, cur);
  }
  const trend = [...trendByMonth.entries()].map(([month, v]) => ({ month, ...v }));

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="This month income" value={npr(data.month.income)} accent="green" />
        <StatCard label="This month expense" value={npr(data.month.expense)} accent="red" />
        <StatCard label="This month net" value={npr(data.month.net)} accent={data.month.net >= 0 ? 'teal' : 'amber'} />
        <StatCard label="Fee collection rate" value={`${digits(data.fees.collectionRate)}%`} accent="navy" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
            Fees (all time)
          </div>
          <div className="grid grid-cols-3 gap-3 px-4 py-4 text-sm">
            <div>
              <p className="text-xs uppercase text-slate-400">Billed</p>
              <p className="font-semibold">{npr(data.fees.billed)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Collected</p>
              <p className="font-semibold text-emerald-600">{npr(data.fees.collected)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Outstanding</p>
              <p className="font-semibold text-red-600">{npr(data.fees.outstanding)}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
            Income / expense by category (this month)
          </div>
          <div className="px-3 pb-3">
            <Table
              columns={[
                { key: 'category', header: 'Category', render: (r: any) => String(r.category ?? '—').replace(/_/g, ' ') },
                { key: 'type', header: 'Type', render: (r: any) => <Badge tone={r.type === 'income' ? 'green' : 'red'}>{r.type}</Badge> },
                { key: 'total', header: 'Amount', render: (r: any) => npr(r.total) },
              ]}
              rows={data.byGroup ?? []}
              empty="No transactions this month yet."
            />
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
          Cash flow — last 6 months
        </div>
        <div className="px-3 pb-3">
          <Table
            columns={[
              { key: 'month', header: 'Month', render: (r: any) => <span className="font-mono text-xs">{r.month}</span> },
              { key: 'income', header: 'Income', render: (r: any) => <span className="text-emerald-600">{npr(r.income)}</span> },
              { key: 'expense', header: 'Expense', render: (r: any) => <span className="text-red-600">{npr(r.expense)}</span> },
              {
                key: 'net',
                header: 'Net',
                render: (r: any) => (
                  <span className={r.income - r.expense >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                    {npr(r.income - r.expense)}
                  </span>
                ),
              },
            ]}
            rows={trend}
            empty="No transactions in the last 6 months."
          />
        </div>
      </Panel>
    </>
  );
}

/* ============================================================= cash book */

function CashbookTab() {
  const { npr, digits, fmtAd } = useI18n();
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [mode, setMode] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/reports/cashbook', { from, to, ...(mode ? { mode } : {}) });
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load cash book');
    } finally {
      setLoading(false);
    }
  }, [from, to, mode]);

  useEffect(() => {
    load();
  }, [load]);

  const print = () => window.print();

  return (
    <>
      <Toolbar>
        <label className="text-xs text-slate-500">From</label>
        <DateInput className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-xs text-slate-500">To</label>
        <DateInput className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select className="w-auto" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All modes</option>
          <option value="cash">Cash only</option>
          <option value="bank">Bank only</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Run</Button>
        <Button variant="teal" size="sm" onClick={print}>Print</Button>
        <span className="ml-auto text-sm">
          Balance: <b className={Number(meta?.balance ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}>{npr(meta?.balance ?? 0)}</b>
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
                { key: 'txnDate', header: 'Date', render: (r) => <span className="text-xs">{fmtAd(r.txnDate)}</span> },
                { key: 'headName', header: 'Account head', render: (r) => r.headName ?? '—' },
                { key: 'description', header: 'Particulars', render: (r) => <span className="block max-w-[280px] truncate">{r.description ?? '—'}</span> },
                { key: 'mode', header: 'Mode', render: (r) => <Badge tone="navy">{r.mode}</Badge> },
                {
                  key: 'amount',
                  header: 'Amount',
                  render: (r) => (
                    <span className={r.type === 'income' ? 'text-emerald-600' : 'text-red-600'}>
                      {r.type === 'income' ? '+' : '−'} {npr(r.amount)}
                    </span>
                  ),
                },
                { key: 'runningBalance', header: 'Balance', render: (r) => <b>{npr(r.runningBalance)}</b> },
              ]}
              rows={rows}
              empty="No entries in this period."
            />
            <p className="px-1 pt-2 text-xs text-slate-500">
              {digits(rows.length)} entries · {meta?.from} → {meta?.to}
            </p>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ========================================================= trial balance */

function TrialTab() {
  const { npr, digits } = useI18n();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/reports/trial-balance', { from, to });
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load trial balance');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Toolbar>
        <label className="text-xs text-slate-500">From</label>
        <DateInput className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-xs text-slate-500">To</label>
        <DateInput className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Run</Button>
        <Button variant="teal" size="sm" onClick={() => window.print()}>Print</Button>
      </Toolbar>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total debit" value={npr(meta?.totalDebit ?? 0)} accent="red" />
        <StatCard label="Total credit" value={npr(meta?.totalCredit ?? 0)} accent="green" />
        <StatCard label="Income" value={npr(meta?.incomeStatement?.income ?? 0)} accent="teal" />
        <StatCard
          label="Surplus / (deficit)"
          value={npr(meta?.incomeStatement?.surplus ?? 0)}
          accent={(meta?.incomeStatement?.surplus ?? 0) >= 0 ? 'green' : 'amber'}
        />
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
                { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code ?? '—'}</span> },
                { key: 'nameEn', header: 'Head', render: (r) => <span className="font-medium">{r.nameEn}</span> },
                { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'income' ? 'green' : r.type === 'expense' ? 'red' : 'navy'}>{r.type}</Badge> },
                { key: 'group', header: 'Group', render: (r) => <span className="text-xs">{String(r.group).replace(/_/g, ' ')}</span> },
                { key: 'debit', header: 'Debit', render: (r) => (Number(r.debit) ? <span className="text-red-600">{npr(r.debit)}</span> : '—') },
                { key: 'credit', header: 'Credit', render: (r) => (Number(r.credit) ? <span className="text-emerald-600">{npr(r.credit)}</span> : '—') },
              ]}
              rows={rows}
              empty="No account heads configured."
            />
            <p className="px-1 pt-2 text-xs text-slate-500">{digits(rows.length)} heads</p>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ========================================================== outstanding */

function OutstandingTab() {
  const { npr, digits } = useI18n();
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<Opt[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAll({ classes: lookups.classes }).then((d) => setClasses(d.classes));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/reports/outstanding', classId ? { classId } : undefined);
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load outstanding fees');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const blob = await api.download('/finance/reports/outstanding/export', { format: 'csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'outstanding-fees.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      /* handled by toast-free silent fail — user sees nothing change */
    }
  };

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Button>
        <Button variant="secondary" size="sm" onClick={exportCsv}><Download size={14} /> CSV</Button>
        <span className="ml-auto text-sm">
          Total outstanding: <b className="text-red-600">{npr(meta?.total ?? 0)}</b> · {digits(meta?.students ?? 0)} students
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
                {
                  key: 'nameEn',
                  header: 'Student',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.nameEn}</p>
                      <p className="text-xs text-slate-500">{digits(r.admissionNo)} · roll {digits(r.rollNo ?? '—')}</p>
                    </div>
                  ),
                },
                { key: 'className', header: 'Class', render: (r) => `${r.className ?? '—'}${r.sectionName ? ` · ${r.sectionName}` : ''}` },
                { key: 'dues', header: 'Dues', render: (r) => digits(r.dues) },
                { key: 'outstanding', header: 'Outstanding', render: (r) => <b className="text-red-600">{npr(r.outstanding)}</b> },
                { key: 'phone', header: 'Contact', render: (r) => digits(r.guardianPhone ?? r.fatherPhone ?? '—') },
              ]}
              rows={rows}
              empty="No outstanding dues — everything is collected."
            />
          </div>
        )}
      </Panel>
    </>
  );
}

/* =========================================================== collection */

function CollectionTab() {
  const { npr, digits } = useI18n();
  const year = new Date().getFullYear();
  const [yr, setYr] = useState(String(year));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/finance/reports/fee-collection', { year: yr });
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load collection report');
    } finally {
      setLoading(false);
    }
  }, [yr]);

  useEffect(() => {
    load();
  }, [load]);

  const byMonth = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const cur = byMonth.get(r.month) ?? { total: 0, count: 0 };
    cur.total += Number(r.total);
    cur.count += Number(r.count);
    byMonth.set(r.month, cur);
  }
  const monthRows = [...byMonth.entries()].map(([month, v]) => ({ month, ...v }));
  const grandTotal = monthRows.reduce((s, r) => s + r.total, 0);
  const years = Array.from({ length: 6 }, (_, i) => String(year - i));

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={yr} onChange={(e) => setYr(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Button>
        <span className="ml-auto text-sm">Total collected: <b className="text-emerald-600">{npr(grandTotal)}</b></span>
      </Toolbar>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
            By month — {yr}
          </div>
          <div className="px-3 pb-3">
            <Table
              columns={[
                { key: 'month', header: 'Month', render: (r) => <span className="font-mono text-xs">{r.month}</span> },
                { key: 'count', header: 'Receipts', render: (r) => digits(r.count) },
                { key: 'total', header: 'Collected', render: (r) => <b>{npr(r.total)}</b> },
              ]}
              rows={monthRows}
              empty="No payments recorded for this year."
            />
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">
            By method — {yr}
          </div>
          <div className="px-3 pb-3">
            <Table
              columns={[
                { key: 'method', header: 'Method', render: (r) => <Badge tone="navy">{r.method}</Badge> },
                { key: 'count', header: 'Receipts', render: (r) => digits(r.count) },
                { key: 'total', header: 'Collected', render: (r) => <b>{npr(r.total)}</b> },
              ]}
              rows={rows}
              empty="No payments recorded for this year."
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
