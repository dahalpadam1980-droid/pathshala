import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, Pin, Send, Bell } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, Checkbox, useToast } from '../lib/ui';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const CHANNELS = ['inapp', 'sms', 'email', 'push'];
const ROLES = ['super_admin', 'school_admin', 'accountant', 'office', 'teacher', 'student', 'parent'];

export default function NoticesPage() {
  const [tab, setTab] = useState('notices');
  return (
    <>
      <PageHeader
        title="Notices & notifications"
        subtitle="Publish targeted notices, send broadcasts over SMS/email/push and track the delivery inbox"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'notices', label: 'Notices' },
          { key: 'broadcast', label: 'Broadcast' },
          { key: 'notifications', label: 'Notifications' },
        ]}
      />
      {tab === 'notices' && <NoticesTab />}
      {tab === 'broadcast' && <BroadcastTab />}
      {tab === 'notifications' && <NotificationsTab />}
    </>
  );
}

/* ============================================================ notices */

function NoticesTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');

  const [lk, setLk] = useState<{ classes: Opt[] }>({ classes: [] });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    titleEn: '', titleNe: '', bodyEn: '', bodyNe: '',
    priority: 'normal', status: 'published', pinned: false,
  });
  const [audience, setAudience] = useState({ all: true, roles: [] as string[], classIds: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadAll({ classes: lookups.classes }).then((d) => setLk(d));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, unknown> = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (q.trim()) query.q = q.trim();
      const r = await api.list<any>('/communication/notices', query);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  }, [status, priority, q]);

  useEffect(() => {
    const id = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const openCreate = () => {
    setEditing(null);
    setForm({ titleEn: '', titleNe: '', bodyEn: '', bodyNe: '', priority: 'normal', status: 'published', pinned: false });
    setAudience({ all: true, roles: [], classIds: [] });
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      titleEn: r.titleEn ?? '', titleNe: r.titleNe ?? '',
      bodyEn: r.bodyEn ?? '', bodyNe: r.bodyNe ?? '',
      priority: r.priority ?? 'normal', status: r.status ?? 'published', pinned: Boolean(r.pinned),
    });
    const a = r.audience ?? {};
    setAudience({
      all: Boolean(a.all ?? true),
      roles: a.roles ?? [],
      classIds: a.classIds ?? [],
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.titleEn.trim()) return setFormError('Title (English) is required');
    if (!form.bodyEn.trim()) return setFormError('Body (English) is required');
    const body = {
      titleEn: form.titleEn.trim(),
      titleNe: form.titleNe.trim() || null,
      bodyEn: form.bodyEn,
      bodyNe: form.bodyNe.trim() || null,
      priority: form.priority,
      status: form.status,
      pinned: form.pinned,
      audience: {
        all: audience.all,
        roles: audience.all ? [] : audience.roles,
        classIds: audience.all ? [] : audience.classIds,
        sectionIds: [],
      },
      notifyRoles: audience.all ? [] : audience.roles,
      attachments: [],
    };
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/communication/notices/${editing.id}`, body);
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/communication/notices', body);
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

  const remove = async (r: any) => {
    if (!window.confirm(`Delete notice "${r.titleEn}"?`)) return;
    try {
      await api.delete(`/communication/notices/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const togglePin = async (r: any) => {
    try {
      await api.patch(`/communication/notices/${r.id}`, { pinned: !r.pinned });
      toast.push(r.pinned ? 'Unpinned' : 'Pinned', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Update failed', 'error');
    }
  };

  const tone = (s: string) => (s === 'published' ? 'green' : s === 'archived' ? 'slate' : 'amber');
  const prioTone = (p: string) => (p === 'urgent' ? 'red' : p === 'high' ? 'amber' : p === 'low' ? 'slate' : 'navy');

  return (
    <>
      <Toolbar>
        <Input
          className="w-auto min-w-[180px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notices…"
        />
        <Select className="w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> New notice</Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} notices</span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No notices found.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-[260px]">
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {r.pinned && <Pin size={13} className="mr-1 inline text-teal-600" />}
                    {r.titleEn}
                    {r.titleNe && <span className="ml-2 text-sm font-normal text-slate-500">{r.titleNe}</span>}
                  </p>
                  {r.bodyEn && <p className="mt-0.5 max-w-[620px] text-xs text-slate-500">{r.bodyEn}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    <Badge tone={prioTone(r.priority)}>{r.priority}</Badge>{' '}
                    <Badge tone={tone(r.status)}>{r.status}</Badge>{' '}
                    {fmtAd(r.publishedAt ?? r.createdAt)}
                    {r.authorName ? ` · ${r.authorName}` : ''}
                    {r.audience?.all ? ' · everyone' : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => togglePin(r)} title="Pin">
                    <Pin size={13} />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(r)}><Pencil size={13} /> {t('edit')}</Button>
                  <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={editing ? 'Edit notice' : 'New notice'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">{formError}</div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title (English)" required>
              <Input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </Field>
            <Field label="Title (नेपाली)">
              <Input value={form.titleNe} onChange={(e) => setForm({ ...form, titleNe: e.target.value })} />
            </Field>
          </div>
          <Field label="Body (English)" required>
            <Textarea rows={4} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
          </Field>
          <Field label="Body (नेपाली)">
            <Textarea rows={3} value={form.bodyNe} onChange={(e) => setForm({ ...form, bodyNe: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <div className="flex items-end pb-1.5">
              <Checkbox label="Pin to top" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Audience</p>
            <Checkbox
              label="Everyone in the school"
              checked={audience.all}
              onChange={(e) => setAudience({ ...audience, all: e.target.checked })}
            />
            {!audience.all && (
              <div className="mt-2 space-y-2">
                <div>
                  <p className="mb-1 text-xs text-slate-500">Roles (also sends them an in-app notification)</p>
                  <div className="flex flex-wrap gap-3">
                    {ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={audience.roles.includes(role)}
                          onChange={(e) =>
                            setAudience({
                              ...audience,
                              roles: e.target.checked ? [...audience.roles, role] : audience.roles.filter((x) => x !== role),
                            })
                          }
                        />
                        {role.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-500">Classes</p>
                  <div className="flex flex-wrap gap-3">
                    {lk.classes.map((c) => (
                      <label key={c.value} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={audience.classIds.includes(c.value)}
                          onChange={(e) =>
                            setAudience({
                              ...audience,
                              classIds: e.target.checked
                                ? [...audience.classIds, c.value]
                                : audience.classIds.filter((x) => x !== c.value),
                            })
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ========================================================== broadcast */

function BroadcastTab() {
  const { t, digits } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', body: '', channels: ['inapp'] as string[], audienceAll: true });
  const [roles, setRoles] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [lk, setLk] = useState<{ classes: Opt[] }>({ classes: [] });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ queued: number; recipients: number } | null>(null);

  useEffect(() => {
    loadAll({ classes: lookups.classes }).then((d) => setLk(d));
  }, []);

  const toggleChannel = (c: string) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c],
    }));

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.push('Title and body are required', 'error');
      return;
    }
    if (!form.channels.length) {
      toast.push('Select at least one channel', 'error');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ queued: number; recipients: number }>('/communication/broadcast', {
        title: form.title.trim(),
        body: form.body.trim(),
        channels: form.channels,
        audience: form.audienceAll
          ? { all: true }
          : { all: false, roles, classIds, sectionIds: [] },
      });
      setResult(r);
      toast.push(`Queued for ${r.recipients} recipients`, 'success');
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Broadcast failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel>
        <div className="max-w-3xl space-y-4 p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Sends one message to many people at once. In-app notifications are delivered immediately; SMS/email/push
            are queued (SMS/email need a gateway configured under Settings).
          </p>

          <Field label="Title" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="School closed tomorrow" />
          </Field>
          <Field label="Message" required>
            <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Channels</p>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.channels.includes(c)} onChange={() => toggleChannel(c)} />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-navy-700">
            <Checkbox
              label="Everyone in the school"
              checked={form.audienceAll}
              onChange={(e) => setForm({ ...form, audienceAll: e.target.checked })}
            />
            {!form.audienceAll && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="mb-1 text-xs text-slate-500">Roles</p>
                  <div className="flex flex-wrap gap-3">
                    {ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={roles.includes(role)}
                          onChange={(e) => setRoles((rs) => (e.target.checked ? [...rs, role] : rs.filter((x) => x !== role)))}
                        />
                        {role.replace(/_/g, ' ')}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-500">Classes</p>
                  <div className="flex flex-wrap gap-3">
                    {lk.classes.map((c) => (
                      <label key={c.value} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={classIds.includes(c.value)}
                          onChange={(e) =>
                            setClassIds((xs) => (e.target.checked ? [...xs, c.value] : xs.filter((x) => x !== c.value)))
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={send} loading={busy} variant="teal"><Send size={14} /> Send broadcast</Button>
            {result && (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                <Badge tone="green">queued</Badge> {digits(result.queued)} messages · {digits(result.recipients)} recipients
              </span>
            )}
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ====================================================== notifications */

function NotificationsTab() {
  const { t, digits, fmtAd } = useI18n();
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ total?: number; sent?: number; failed?: number; pending?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, unknown> = {};
      if (channel) query.channel = channel;
      if (status) query.status = status;
      const r = await api.list<any>('/communication/notifications', query);
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [channel, status]);

  useEffect(() => {
    load();
  }, [load]);

  const tone = (s: string) => (s === 'sent' ? 'green' : s === 'failed' ? 'red' : s === 'pending' ? 'amber' : 'slate');

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span><Bell size={12} className="mr-1 inline" />{digits(meta?.total ?? rows.length)} total</span>
          {meta?.sent != null && <span>sent: <b>{digits(meta.sent)}</b></span>}
          {meta?.pending != null && <span>pending: <b>{digits(meta.pending)}</b></span>}
          {meta?.failed != null && <span>failed: <b className="text-red-600">{digits(meta.failed)}</b></span>}
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
                  key: 'title',
                  header: 'Message',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="max-w-[420px] truncate text-xs text-slate-500">{r.body ?? '—'}</p>
                    </div>
                  ),
                },
                { key: 'channel', header: 'Channel', render: (r) => <Badge tone="navy">{r.channel}</Badge> },
                {
                  key: 'recipient',
                  header: 'Recipient',
                  render: (r) =>
                    r.recipientName ? (
                      <span>
                        {r.recipientName}{' '}
                        <span className="text-xs text-slate-400">({String(r.recipientRole ?? '').replace(/_/g, ' ')})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    ),
                },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> },
                { key: 'createdAt', header: 'Queued', render: (r) => <span className="text-xs">{fmtAd(r.createdAt)}</span> },
                { key: 'sentAt', header: 'Sent', render: (r) => (r.sentAt ? <span className="text-xs">{fmtAd(r.sentAt)}</span> : '—') },
                { key: 'error', header: 'Error', render: (r) => <span className="max-w-[180px] truncate text-xs text-red-600">{r.error ?? '—'}</span> },
              ]}
              rows={rows}
              empty="No notifications yet — publish a notice or send a broadcast."
            />
          </div>
        )}
      </Panel>
    </>
  );
}
