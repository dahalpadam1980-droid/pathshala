import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, ArrowLeftRight, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, useToast, StatCard, Card } from '../lib/ui';
import { DateInput } from '../components/DateInput';
import { ImageInput } from '../components/ImageInput';

export default function SettingsPage() {
  const [tab, setTab] = useState('school');
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="School profile, academic years, date tools, system defaults and school statistics"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'school', label: 'School profile' },
          { key: 'years', label: 'Academic years' },
          { key: 'dates', label: 'Date tools' },
          { key: 'defaults', label: 'Defaults' },
          { key: 'stats', label: 'Statistics' },
        ]}
      />
      {tab === 'school' && <SchoolTab />}
      {tab === 'years' && <YearsTab />}
      {tab === 'dates' && <DatesTab />}
      {tab === 'defaults' && <DefaultsTab />}
      {tab === 'stats' && <StatsTab />}
    </>
  );
}

/* ======================================================= school profile */

const SETTING_KEYS: Array<{ key: string; label: string; type: 'text' | 'number' | 'select' | 'textarea'; options?: string[]; hint?: string }> = [
  { key: 'schoolName', label: 'School name (English)', type: 'text' },
  { key: 'schoolNameNe', label: 'School name (नेपाली)', type: 'text' },
  { key: 'slogan', label: 'Slogan / motto', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'municipality', label: 'Municipality / Rural municipality', type: 'text' },
  { key: 'wardNo', label: 'Ward no.', type: 'number' },
  { key: 'district', label: 'District', type: 'text' },
  { key: 'province', label: 'Province', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'website', label: 'Website URL', type: 'text' },
  { key: 'panNo', label: 'PAN / Registration no.', type: 'text' },
  { key: 'affiliation', label: 'Affiliation (e.g. NEB, CDC)', type: 'text' },
  { key: 'gradingSystem', label: 'Default grading system', type: 'select', options: ['neb_gpa', 'neb_percentage', 'custom'] },
  { key: 'currency', label: 'Currency', type: 'select', options: ['NPR'] },
  { key: 'dateFormat', label: 'Date format', type: 'select', options: ['bs', 'ad', 'both'] },
  { key: 'language', label: 'Default language', type: 'select', options: ['en', 'ne'] },
  { key: 'attendanceGraceMinutes', label: 'Late grace (minutes)', type: 'number', hint: 'Minutes after which attendance is marked late' },
  { key: 'feeDueDay', label: 'Fee due day of month', type: 'number' },
  { key: 'smsSender', label: 'SMS sender ID', type: 'text' },
  { key: 'principalName', label: 'Principal name', type: 'text' },
  { key: 'vicePrincipalName', label: 'Vice principal name', type: 'text' },
  { key: 'chairmanName', label: 'SMC chairman name', type: 'text' },
];

function SchoolTab() {
  const { t } = useI18n();
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [school, setSchool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ settings: Record<string, any>; school: any }>('/settings');
      setSettings(r.settings ?? {});
      setSchool(r.school ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { settings });
      toast.push(t('saved'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Upload/remove the school logo (saved immediately to the school row). */
  const saveLogo = async (logoUrl: string | null) => {
    if (!school?.id) return;
    try {
      const updated = await api.patch<any>(`/schools/${school.id}`, { logoUrl });
      setSchool({ ...school, logoUrl: updated?.logoUrl ?? logoUrl });
      toast.push(t('saved'), 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Logo save failed', 'error');
      load(); // revert the preview to the stored value
    }
  };

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (error) return <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>;

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={save} loading={saving}><Save size={14} /> {saving ? t('saving') : t('save')}</Button>
        <span className="ml-auto text-xs text-slate-500">
          {school?.code ? <>School code: <b className="font-mono">{school.code}</b> · public site: <code>/website/{school.code}</code></> : ''}
        </span>
      </Toolbar>

      <Panel>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="School logo" hint="Shown on the login page, dashboards, ID cards and certificates">
              <ImageInput
                value={typeof school?.logoUrl === 'string' ? school.logoUrl : ''}
                disabled={saving}
                onChange={(url) => void saveLogo(url || null)}
              />
            </Field>
          </div>
          {SETTING_KEYS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              {f.type === 'select' ? (
                <Select
                  value={String(settings[f.key] ?? '')}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                >
                  <option value="">—</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  rows={2}
                  value={String(settings[f.key] ?? '')}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                />
              ) : (
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={String(settings[f.key] ?? '')}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      // Numbers are stored as strings — settings is a string-keyed map.
                      [f.key]: e.target.value,
                    })
                  }
                />
              )}
            </Field>
          ))}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-navy-800">
          Changes are stored per school and used across dashboards, reports and certificates.
          {school?.status && <> · status: <Badge tone={school.status === 'active' ? 'green' : 'amber'}>{school.status}</Badge></>}
        </div>
      </Panel>
    </>
  );
}

/* ==================================================== academic years */

function YearsTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', startAd: '', endAd: '', isCurrent: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/settings/academic-years');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load academic years');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (!form.name.trim() || !form.startAd || !form.endAd) return setFormError('Name and date range are required');
    if (form.endAd <= form.startAd) return setFormError('End date must be after start date');
    setSaving(true);
    try {
      await api.post('/settings/academic-years', {
        name: form.name.trim(),
        startAd: form.startAd,
        endAd: form.endAd,
        isCurrent: form.isCurrent,
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ name: '', startAd: '', endAd: '', isCurrent: false });
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => { setFormError(null); setOpen(true); }}><Plus size={14} /> New academic year</Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} years</span>
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
                { key: 'name', header: 'Year', render: (r) => <b>{r.name}</b> },
                { key: 'startAd', header: 'Start', render: (r) => <span className="text-xs">{fmtAd(r.startAd)}</span> },
                { key: 'endAd', header: 'End', render: (r) => <span className="text-xs">{fmtAd(r.endAd)}</span> },
                {
                  key: 'isCurrent',
                  header: 'Current',
                  render: (r) => (r.isCurrent ? <Badge tone="green">active</Badge> : <Badge tone="slate">past</Badge>),
                },
              ]}
              rows={rows}
              empty="No academic years yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New academic year"
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
            <Field label="Name" required hint="e.g. 2083/84 or 2026/27">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Start" required>
            <DateInput value={form.startAd} onChange={(e) => setForm({ ...form, startAd: e.target.value })} />
          </Field>
          <Field label="End" required>
            <DateInput value={form.endAd} onChange={(e) => setForm({ ...form, endAd: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
            Make this the current academic year
          </label>
        </div>
      </Modal>
    </>
  );
}

/* ======================================================== date tools */

function DatesTab() {
  const { digits, fmtBs, fmtAdRaw, todayBs } = useI18n();
  const toast = useToast();
  const [today, setToday] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState<'adToBs' | 'bsToAd'>('adToBs');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any>('/settings/dates/today').then(setToday).catch(() => undefined);
  }, []);

  const convert = async () => {
    if (!date.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ result: string }>('/settings/dates/convert', { date: date.trim(), direction });
      setResult(r.result);
    } catch (e) {
      setResult(null);
      toast.push(e instanceof ApiError ? e.message : 'Conversion failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">Today</div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-navy-50 p-4 dark:bg-navy-800">
            <p className="text-xs uppercase tracking-wide text-slate-500">Bikram Sambat (BS)</p>
            <p className="text-xl font-bold text-navy-800 dark:text-white">{today?.bs ?? todayBs()}</p>
            <p className="mt-1 text-sm text-slate-500">AD: {today?.ad ?? fmtAdRaw(new Date().toISOString().slice(0, 10))}</p>
            {today?.monthName && <p className="text-sm text-slate-500">{today.monthName}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-700">
              <p className="text-xs uppercase text-slate-400">Weekday</p>
              <p className="font-semibold">{today?.weekday ?? '—'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-700">
              <p className="text-xs uppercase text-slate-400">Nepali digits</p>
              <p className="font-semibold">{digits(today?.bs ?? todayBs())}</p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">Convert a date</div>
        <div className="space-y-3 p-5">
          <Field label={direction === 'adToBs' ? 'AD date' : 'BS date (YYYY-MM-DD)'} required>
            <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder={direction === 'adToBs' ? '2026-11-07' : '2083-07-21'} />
          </Field>
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'adToBs' | 'bsToAd')}>
              <option value="adToBs">AD → BS</option>
              <option value="bsToAd">BS → AD</option>
            </Select>
          </Field>
          <Button onClick={convert} loading={busy} variant="teal"><ArrowLeftRight size={14} /> Convert</Button>
          {result && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-teal-800 dark:border-teal-900 dark:bg-teal-900/20 dark:text-teal-200">
              <p className="text-xs uppercase tracking-wide opacity-70">Result</p>
              <p className="text-lg font-bold">{result}</p>
              <p className="mt-1 text-xs opacity-70">
                {direction === 'adToBs' ? `Gregorian: ${fmtAdRaw(date)}` : `Nepali: ${fmtBs(date)}`}
              </p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Conversions use the standard Bikram Sambat calendar. BS months have 29–32 days.
          </p>
        </div>
      </Panel>
    </div>
  );
}

/* ========================================================= defaults */

const DEFAULT_GROUPS: Record<string, Array<{ key: string; label: string; type: 'text' | 'number' | 'select' | 'checkbox'; options?: string[]; hint?: string }>> = {
  Academics: [
    { key: 'defaultGradingScale', label: 'Default grading scale', type: 'select', options: ['NEB GPA 4.0', 'NEB percentage', 'Custom'], hint: 'Used for new exams unless overridden' },
    { key: 'passMarksPercent', label: 'Pass marks (%)', type: 'number', hint: 'Default pass threshold for new grading scales' },
    { key: 'showRank', label: 'Show rank on results', type: 'checkbox' },
    { key: 'autoPublishResults', label: 'Auto-publish results after entry', type: 'checkbox' },
  ],
  Attendance: [
    { key: 'attendanceGraceMinutes', label: 'Late grace (minutes)', type: 'number' },
    { key: 'attendanceStart', label: 'School start time', type: 'text', hint: 'HH:MM, e.g. 09:30' },
    { key: 'smsAbsentAlert', label: 'SMS parents on absence', type: 'checkbox' },
  ],
  Fees: [
    { key: 'feeDueDay', label: 'Fee due day', type: 'number', hint: 'Day of month (1-31)' },
    { key: 'lateFeePercent', label: 'Late fee (%)', type: 'number' },
    { key: 'receiptPrefix', label: 'Receipt no. prefix', type: 'text', hint: 'e.g. RCP' },
    { key: 'autoReceipt', label: 'Auto-generate receipt numbers', type: 'checkbox' },
  ],
  Notifications: [
    { key: 'smsEnabled', label: 'SMS enabled', type: 'checkbox' },
    { key: 'emailEnabled', label: 'Email enabled', type: 'checkbox' },
    { key: 'pushEnabled', label: 'Push enabled', type: 'checkbox' },
    { key: 'feeReminderDays', label: 'Fee reminder before due (days)', type: 'number' },
  ],
  Localization: [
    { key: 'dateFormat', label: 'Default date format', type: 'select', options: ['bs', 'ad', 'both'] },
    { key: 'language', label: 'Default language', type: 'select', options: ['en', 'ne'] },
    { key: 'currency', label: 'Currency', type: 'select', options: ['NPR'] },
  ],
};

function DefaultsTab() {
  const { t } = useI18n();
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ settings: Record<string, any> }>('/settings');
      setSettings(r.settings ?? {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { settings });
      toast.push(t('saved'), 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (error) return <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>;

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={save} loading={saving}><Save size={14} /> {saving ? t('saving') : t('save')}</Button>
      </Toolbar>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Object.entries(DEFAULT_GROUPS).map(([group, fields]) => (
          <Panel key={group}>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">{group}</div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {fields.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  {f.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 pt-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(settings[f.key])}
                        onChange={(e) => setSettings({ ...settings, [f.key]: e.target.checked })}
                      />
                      {settings[f.key] ? 'On' : 'Off'}
                    </label>
                  ) : f.type === 'select' ? (
                    <Select value={String(settings[f.key] ?? '')} onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}>
                      <option value="">—</option>
                      {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={String(settings[f.key] ?? '')}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          // Keep numbers as strings — the settings map is string-valued.
                          [f.key]: e.target.value,
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

/* ======================================================== statistics */

function StatsTab() {
  const { digits } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<any>('/settings/stats');
      setData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load statistics');
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

  const entries = Object.entries(data).filter(([, v]) => typeof v === 'number' || typeof v === 'string');

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Button>
        <span className="ml-auto text-xs text-slate-500">Live row counts in this school's database</span>
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {entries.map(([k, v]) => (
          <StatCard
            key={k}
            label={k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
            value={typeof v === 'number' ? digits(v) : String(v)}
            accent="navy"
          />
        ))}
      </div>

      <Panel>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-navy-800">All counters</div>
        <div className="px-3 pb-3">
          <Table
            columns={[
              { key: 'k', header: 'Entity', render: (r: any) => <b>{r.k}</b> },
              { key: 'v', header: 'Count', render: (r: any) => digits(String(r.v)) },
            ]}
            rows={entries.map(([k, v]) => ({ k, v }))}
            empty="No statistics."
          />
        </div>
      </Panel>
    </>
  );
}
