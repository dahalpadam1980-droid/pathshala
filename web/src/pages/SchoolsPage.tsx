import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Power, Wrench, School } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, useToast, StatCard } from '../lib/ui';

interface SchoolRow {
  id: string;
  code: string;
  nameEn: string;
  nameNe?: string | null;
  type: string;
  status: string;
  plan: string;
  address?: string | null;
  municipality?: string | null;
  ward?: number | null;
  district?: string | null;
  province?: string | null;
  phone?: string | null;
  email?: string | null;
  principalName?: string | null;
  registrationNo?: string | null;
  emisCode?: string | null;
  createdAt?: string;
}

const blankSchool = {
  code: '', nameEn: '', nameNe: '', type: 'private', address: '', municipality: '',
  ward: '', district: '', province: '', phone: '', email: '', principalName: '',
  registrationNo: '', emisCode: '',
};
const blankAdmin = { nameEn: '', username: '', password: '', email: '', phone: '' };

export default function SchoolsPage() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');

  const [open, setOpen] = useState(false);
  const [school, setSchool] = useState(blankSchool);
  const [admin, setAdmin] = useState(blankAdmin);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [statusFor, setStatusFor] = useState<SchoolRow | null>(null);
  const [newStatus, setNewStatus] = useState('active');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, ps] = await Promise.all([
        api.list<SchoolRow>('/schools'),
        api.get<any>('/schools/platform-stats').catch(() => null),
      ]);
      setRows(list.data ?? []);
      setStats(ps);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load schools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setFormError(null);
    if (!school.code.trim() || !school.nameEn.trim()) return setFormError('Code and name are required');
    if (admin.password.length < 8) return setFormError('Admin password must be at least 8 characters');
    setSaving(true);
    try {
      await api.post('/schools/with-admin', {
        school: {
          ...school,
          ward: school.ward === '' ? null : Number(school.ward),
          email: school.email || null,
        },
        admin: { ...admin, email: admin.email || null },
      });
      toast.push('School registered with its administrator', 'success');
      setOpen(false);
      setSchool(blankSchool);
      setAdmin(blankAdmin);
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    if (!statusFor) return;
    setBusy(true);
    try {
      await api.post(`/schools/${statusFor.id}/status`, { status: newStatus });
      toast.push(`Status set to ${newStatus}`, 'success');
      setStatusFor(null);
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onboard = async (s: SchoolRow) => {
    if (!window.confirm(`Run default onboarding for ${s.nameEn}? It creates an academic year, classes, grading scale and account heads (idempotent).`)) return;
    setBusy(true);
    try {
      const r = await api.post<{ created: Record<string, number> }>(`/schools/${s.id}/onboard`);
      const parts = Object.entries(r.created ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      toast.push(parts ? `Onboarded — ${parts}` : 'Already onboarded', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Onboarding failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const filtered = rows.filter((s) =>
    !q || `${s.nameEn} ${s.nameNe ?? ''} ${s.code} ${s.district ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title={t('schools')}
        subtitle="Platform directory — register schools, manage their status and run default onboarding"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} /> {t('refresh')}
            </Button>
            <Button size="sm" onClick={() => { setSchool(blankSchool); setAdmin(blankAdmin); setFormError(null); setOpen(true); }}>
              <Plus size={15} /> Register school
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('schools')} value={digits(stats?.schools?.total ?? rows.length)} accent="navy" icon={<School size={18} />} />
        <StatCard label={t('active')} value={digits(stats?.schools?.active ?? rows.filter((r) => r.status === 'active').length)} accent="green" />
        <StatCard label={t('students')} value={digits(stats?.students ?? 0)} accent="teal" />
        <StatCard label={t('staff')} value={digits(stats?.employees ?? 0)} accent="amber" />
      </div>

      <Toolbar>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('search')} school…`} />
        </div>
        <span className="ml-auto text-xs text-slate-500">
          {t('showing')} {digits(filtered.length)} {t('of')} {digits(rows.length)} {t('records')}
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
                  header: t('name'),
                  render: (r) => (
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{r.nameNe || r.nameEn}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{r.code}</span>
                        {r.municipality ? ` · ${r.municipality}` : ''}{r.district ? `, ${r.district}` : ''}
                      </p>
                    </div>
                  ),
                },
                { key: 'type', header: 'Type', render: (r) => <Badge tone="navy">{r.type}</Badge> },
                { key: 'plan', header: 'Plan', render: (r) => <Badge tone="teal">{r.plan}</Badge> },
                {
                  key: 'status',
                  header: t('status'),
                  render: (r) => (
                    <Badge tone={r.status === 'active' ? 'green' : r.status === 'trial' ? 'amber' : 'red'}>{r.status}</Badge>
                  ),
                },
                { key: 'principalName', header: 'Principal', render: (r) => r.principalName ?? '—' },
                { key: 'phone', header: 'Phone', render: (r) => digits(r.phone ?? '—') },
                { key: 'createdAt', header: t('created'), render: (r) => (r.createdAt ? fmtAd(r.createdAt) : '—') },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="secondary" size="sm" onClick={() => onboard(r)} disabled={busy}>
                        <Wrench size={13} /> Onboard
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setStatusFor(r); setNewStatus(r.status); }}
                      >
                        <Power size={13} /> {t('status')}
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={filtered}
              empty={`${t('noData')} — ${t('schools')}`}
            />
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------ register school */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="Register school + administrator"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={create} loading={saving}>{saving ? t('saving') : 'Create'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
              {formError}
            </div>
          )}
          <p className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            School
          </p>
          <Field label="Code" required hint="lowercase letters, numbers, hyphens — used in the portal URL">
            <Input value={school.code} onChange={(e) => setSchool({ ...school, code: e.target.value })} placeholder="green-vidya" />
          </Field>
          <Field label={`${t('name')} (EN)`} required>
            <Input value={school.nameEn} onChange={(e) => setSchool({ ...school, nameEn: e.target.value })} />
          </Field>
          <Field label={`${t('name')} (नेपाली)`}>
            <Input value={school.nameNe} onChange={(e) => setSchool({ ...school, nameNe: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={school.type} onChange={(e) => setSchool({ ...school, type: e.target.value })}>
              <option value="private">Private</option>
              <option value="community">Community</option>
              <option value="public">Public</option>
            </Select>
          </Field>
          <Field label="Address">
            <Input value={school.address} onChange={(e) => setSchool({ ...school, address: e.target.value })} />
          </Field>
          <Field label="Municipality">
            <Input value={school.municipality} onChange={(e) => setSchool({ ...school, municipality: e.target.value })} />
          </Field>
          <Field label="Ward">
            <Input type="number" min={0} max={35} value={school.ward} onChange={(e) => setSchool({ ...school, ward: e.target.value })} />
          </Field>
          <Field label="District">
            <Input value={school.district} onChange={(e) => setSchool({ ...school, district: e.target.value })} />
          </Field>
          <Field label="Province">
            <Input value={school.province} onChange={(e) => setSchool({ ...school, province: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={school.phone} onChange={(e) => setSchool({ ...school, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={school.email} onChange={(e) => setSchool({ ...school, email: e.target.value })} />
          </Field>
          <Field label="Principal">
            <Input value={school.principalName} onChange={(e) => setSchool({ ...school, principalName: e.target.value })} />
          </Field>
          <Field label="Registration no.">
            <Input value={school.registrationNo} onChange={(e) => setSchool({ ...school, registrationNo: e.target.value })} />
          </Field>
          <Field label="EMIS code">
            <Input value={school.emisCode} onChange={(e) => setSchool({ ...school, emisCode: e.target.value })} />
          </Field>

          <p className="sm:col-span-2 pt-2 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
            Administrator account
          </p>
          <Field label={`${t('name')} (EN)`} required>
            <Input value={admin.nameEn} onChange={(e) => setAdmin({ ...admin, nameEn: e.target.value })} />
          </Field>
          <Field label="Username" required>
            <Input value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Password" required hint="Minimum 8 characters — the admin must change it at first login">
            <Input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Phone">
            <Input value={admin.phone} onChange={(e) => setAdmin({ ...admin, phone: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* ---------------------------------------------------- status modal */}
      <Modal
        open={statusFor !== null}
        onClose={() => setStatusFor(null)}
        title={`School status — ${statusFor?.nameEn ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusFor(null)} disabled={busy}>{t('cancel')}</Button>
            <Button onClick={changeStatus} loading={busy}>{t('save')}</Button>
          </>
        }
      >
        <Field label={t('status')}>
          <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
      </Modal>
    </>
  );
}
