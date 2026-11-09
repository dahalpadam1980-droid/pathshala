import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, KeyRound, UserX, Search, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Checkbox, useToast, StatCard } from '../lib/ui';

const ROLES = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'] as const;
const ROLE_TONE: Record<string, any> = {
  super_admin: 'navy', school_admin: 'navy', accountant: 'teal', office: 'teal',
  teacher: 'green', student: 'amber', parent: 'slate',
};

interface UserRow {
  id: string;
  role: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  nameEn: string;
  nameNe?: string | null;
  status: string;
  locale: string;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  studentId?: string | null;
  employeeId?: string | null;
}

const blankForm = {
  role: 'teacher', username: '', password: '', nameEn: '', nameNe: '',
  email: '', phone: '', locale: 'en', mustChangePassword: true,
  studentId: '', employeeId: '',
};

export default function UsersPage() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [form, setForm] = useState<typeof blankForm>(blankForm);
  const [editing, setEditing] = useState<UserRow | null>(null); // null = closed, {} handled by `open` flag
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [forceChange, setForceChange] = useState(true);
  const [busy, setBusy] = useState(false);

  const [lk, setLk] = useState<{ students: Opt[]; employees: Opt[] }>({ students: [], employees: [] });

  useEffect(() => {
    loadAll({ students: lookups.students, employees: lookups.employees }).then(setLk);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<UserRow>('/users');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((u) => {
        const hay = `${u.username} ${u.nameEn} ${u.nameNe ?? ''} ${u.email ?? ''}`.toLowerCase();
        return (!q || hay.includes(q.toLowerCase())) && (!roleFilter || u.role === roleFilter);
      }),
    [rows, q, roleFilter],
  );

  const openCreate = () => {
    setForm({ ...blankForm });
    setEditing(null);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setForm({
      ...blankForm,
      role: u.role, username: u.username, nameEn: u.nameEn, nameNe: u.nameNe ?? '',
      email: u.email ?? '', phone: u.phone ?? '', locale: u.locale === 'ne' ? 'ne' : 'en',
      studentId: u.studentId ?? '', employeeId: u.employeeId ?? '',
    });
    setEditing(u);
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.nameEn.trim()) return setFormError('Name is required');
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/users/${editing.id}`, {
          nameEn: form.nameEn,
          nameNe: form.nameNe || null,
          email: form.email || null,
          phone: form.phone || null,
          locale: form.locale,
          role: form.role,
        });
        toast.push(t('saved'), 'success');
      } else {
        if (!form.username.trim()) { setSaving(false); return setFormError('Username is required'); }
        if (form.password.length < 8) { setSaving(false); return setFormError('Password must be at least 8 characters'); }
        await api.post('/users', {
          role: form.role,
          username: form.username.trim(),
          password: form.password,
          nameEn: form.nameEn,
          nameNe: form.nameNe || null,
          email: form.email || null,
          phone: form.phone || null,
          locale: form.locale,
          studentId: form.studentId || null,
          employeeId: form.employeeId || null,
          mustChangePassword: form.mustChangePassword,
        });
        toast.push(t('created'), 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!resetUser) return;
    if (newPassword.length < 8) {
      toast.push('Password must be at least 8 characters', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, { newPassword, forceChange });
      toast.push('Password reset', 'success');
      setResetUser(null);
      setNewPassword('');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Reset failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (u: UserRow) => {
    if (!window.confirm(`Deactivate ${u.nameEn}? They will no longer be able to log in.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.push('Account deactivated', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  const active = rows.filter((r) => r.status === 'active').length;

  return (
    <>
      <PageHeader
        title={t('users')}
        subtitle="Login accounts — link a user to a student or staff profile for role-based access"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} /> {t('refresh')}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={15} /> {t('add')} {t('users')}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('total')} value={digits(rows.length)} accent="navy" />
        <StatCard label={t('active')} value={digits(active)} accent="green" />
        <StatCard label={t('inactive')} value={digits(rows.length - active)} accent="red" />
        <StatCard label="Admins" value={digits(rows.filter((r) => r.role === 'school_admin').length)} accent="teal" />
      </div>

      <Toolbar>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('search')}…`} className="pl-9" />
        </div>
        <Select className="w-auto min-w-[170px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{t('all')} — {t('role')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
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
                      <p className="text-xs text-slate-500">{r.nameEn}</p>
                    </div>
                  ),
                },
                { key: 'username', header: 'Username', render: (r) => <span className="font-mono text-xs">{r.username}</span> },
                { key: 'role', header: t('role'), render: (r) => <Badge tone={ROLE_TONE[r.role] ?? 'slate'}>{r.role}</Badge> },
                {
                  key: 'contact',
                  header: t('contact'),
                  render: (r) => (
                    <span className="block max-w-[200px] truncate text-xs text-slate-500">
                      {r.email ?? '—'}{r.phone ? ` · ${r.phone}` : ''}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: t('status'),
                  render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'red'}>{r.status}</Badge>,
                },
                {
                  key: 'lastLoginAt',
                  header: 'Last login',
                  render: (r) => <span className="text-xs text-slate-500">{r.lastLoginAt ? fmtAd(r.lastLoginAt) : '—'}</span>,
                },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(r)}
                        title={t('edit')}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-navy-800"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => { setResetUser(r); setNewPassword(''); }}
                        title="Reset password"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-navy-800"
                      >
                        <KeyRound size={15} />
                      </button>
                      {r.status === 'active' && (
                        <button
                          onClick={() => deactivate(r)}
                          title="Deactivate"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-navy-800"
                        >
                          <UserX size={15} />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              rows={filtered}
              empty={`${t('noData')} — ${t('users')}`}
            />
          </div>
        )}
      </Panel>

      {/* --------------------------------------------------- create / edit */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={editing ? `${t('edit')} — ${editing.username}` : `${t('create')} — ${t('users')}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {formError && (
            <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">
              {formError}
            </div>
          )}
          <Field label={t('role')} required>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={saving}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Username" required hint={editing ? 'Username cannot be changed' : 'letters, numbers, . _ -'}>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={Boolean(editing) || saving}
              autoComplete="off"
            />
          </Field>
          {!editing && (
            <Field label="Password" required hint="Minimum 8 characters">
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} disabled={saving} autoComplete="new-password" />
            </Field>
          )}
          <Field label={`${t('name')} (EN)`} required>
            <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} disabled={saving} />
          </Field>
          <Field label={`${t('name')} (नेपाली)`}>
            <Input value={form.nameNe} onChange={(e) => setForm({ ...form, nameNe: e.target.value })} disabled={saving} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={saving} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={saving} />
          </Field>
          <Field label="Locale">
            <Select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} disabled={saving}>
              <option value="en">English</option>
              <option value="ne">नेपाली</option>
            </Select>
          </Field>
          {!editing && form.role === 'student' && (
            <Field label={t('students')} hint="Links this login to the student profile">
              <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} disabled={saving}>
                <option value="">—</option>
                {lk.students.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
          )}
          {!editing && ['teacher', 'office', 'accountant'].includes(form.role) && (
            <Field label={t('staff')} hint="Links this login to the staff profile">
              <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} disabled={saving}>
                <option value="">—</option>
                {lk.employees.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </Field>
          )}
          {!editing && (
            <div className="sm:col-span-2">
              <Checkbox
                label="Force password change at first login"
                checked={form.mustChangePassword}
                disabled={saving}
                onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* -------------------------------------------------- reset password */}
      <Modal
        open={resetUser !== null}
        onClose={() => setResetUser(null)}
        title={`Reset password — ${resetUser?.nameEn ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetUser(null)} disabled={busy}>{t('cancel')}</Button>
            <Button onClick={resetPassword} loading={busy}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="New password" required hint="Minimum 8 characters">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Checkbox
            label="Require change at next login"
            checked={forceChange}
            onChange={(e) => setForceChange(e.target.checked)}
          />
        </div>
      </Modal>
    </>
  );
}
