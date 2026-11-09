import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, Checkbox, useToast } from '../lib/ui';

export default function WebsitePage() {
  const [tab, setTab] = useState('pages');
  return (
    <>
      <PageHeader
        title="Public website"
        subtitle="Manage the school's public site — pages, gallery and live preview by school code"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'pages', label: 'Pages' },
          { key: 'gallery', label: 'Gallery' },
          { key: 'preview', label: 'Preview' },
        ]}
      />
      {tab === 'pages' && <PagesTab />}
      {tab === 'gallery' && <GalleryTab />}
      {tab === 'preview' && <PreviewTab />}
    </>
  );
}

/* ============================================================== pages */

function PagesTab() {
  const { t, digits } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    slug: '', titleEn: '', titleNe: '', bodyEn: '', bodyNe: '',
    published: true, orderIndex: '0', seoDescription: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/website/pages');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ slug: '', titleEn: '', titleNe: '', bodyEn: '', bodyNe: '', published: false, orderIndex: String(rows.length), seoDescription: '' });
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      slug: r.slug, titleEn: r.titleEn ?? '', titleNe: r.titleNe ?? '',
      bodyEn: r.bodyEn ?? '', bodyNe: r.bodyNe ?? '',
      published: Boolean(r.published), orderIndex: String(r.orderIndex ?? 0),
      seoDescription: r.seoDescription ?? '',
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.slug.trim() || !form.titleEn.trim()) return setFormError('Slug and English title are required');
    setSaving(true);
    try {
      const body = {
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        titleEn: form.titleEn.trim(),
        titleNe: form.titleNe || null,
        bodyEn: form.bodyEn,
        bodyNe: form.bodyNe || null,
        published: form.published,
        orderIndex: Number(form.orderIndex || 0),
        seoDescription: form.seoDescription || null,
      };
      if (editing) {
        await api.patch(`/website/pages/${editing.id}`, body);
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/website/pages', body);
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
    if (!window.confirm(`Delete page "${r.titleEn}"?`)) return;
    try {
      await api.delete(`/website/pages/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const toggle = async (r: any) => {
    try {
      await api.patch(`/website/pages/${r.id}`, { published: !r.published });
      toast.push(r.published ? 'Unpublished' : 'Published', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Update failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={openCreate}><Plus size={14} /> New page</Button>
        <span className="ml-auto text-xs text-slate-500">
          {digits(rows.filter((r) => r.published).length)}/{digits(rows.length)} published
        </span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No pages yet — create Home, About, Admissions, Contact…
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-[240px]">
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {r.titleEn} {r.titleNe && <span className="text-sm font-normal text-slate-500">({r.titleNe})</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    <Badge tone="navy">/{r.slug}</Badge> · order {digits(r.orderIndex)} · {digits((r.bodyEn ?? '').length)} chars
                  </p>
                  {r.seoDescription && <p className="mt-0.5 max-w-[520px] truncate text-xs text-slate-400">{r.seoDescription}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => toggle(r)}>
                    {r.published ? <EyeOff size={13} /> : <Eye size={13} />} {r.published ? 'Unpublish' : 'Publish'}
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
        title={editing ? `Edit ${editing.titleEn}` : 'New page'}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Slug" required hint="URL: /{slug}">
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="about-us" />
            </Field>
            <Field label="Title (English)" required>
              <Input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </Field>
            <Field label="Title (नेपाली)">
              <Input value={form.titleNe} onChange={(e) => setForm({ ...form, titleNe: e.target.value })} />
            </Field>
            <Field label="Order">
              <Input type="number" min={0} max={999} value={form.orderIndex} onChange={(e) => setForm({ ...form, orderIndex: e.target.value })} />
            </Field>
            <div className="flex items-end pb-1 sm:col-span-2">
              <Checkbox label="Published (visible on the public site)" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
            </div>
          </div>
          <Field label="Body (English) — HTML allowed">
            <Textarea rows={8} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
          </Field>
          <Field label="Body (नेपाली) — HTML allowed">
            <Textarea rows={6} value={form.bodyNe} onChange={(e) => setForm({ ...form, bodyNe: e.target.value })} />
          </Field>
          <Field label="SEO description">
            <Input value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} placeholder="Shown in search results" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ============================================================ gallery */

function GalleryTab() {
  const { t, digits } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', type: 'image', published: true, orderIndex: '0' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/website/gallery');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load gallery');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (!form.title.trim() || !form.url.trim()) return setFormError('Title and URL are required');
    setSaving(true);
    try {
      await api.post('/website/gallery', {
        title: form.title.trim(),
        url: form.url.trim(),
        type: form.type,
        published: form.published,
        orderIndex: Number(form.orderIndex || 0),
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ title: '', url: '', type: 'image', published: true, orderIndex: String(rows.length) });
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Delete "${r.title}" from the gallery?`)) return;
    try {
      await api.delete(`/website/gallery/${r.id}`);
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
        <Button size="sm" onClick={() => { setFormError(null); setOpen(true); }}><Plus size={14} /> Add item</Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} items</span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No gallery items yet — add photos of campus, events and activities.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((r) => (
              <div key={r.id} className="group relative overflow-hidden rounded-lg border border-slate-200 dark:border-navy-700">
                {r.type === 'image' ? (
                  <img src={r.url} alt={r.title} className="h-32 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-32 w-full place-items-center bg-navy-50 text-xs text-navy-500 dark:bg-navy-800">
                    {r.type}
                  </div>
                )}
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="truncate text-xs font-medium">{r.title}</span>
                  <button onClick={() => remove(r)} className="shrink-0 text-slate-400 hover:text-red-600" title={t('delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {!r.published && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    draft
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add gallery item"
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
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Annual day celebration" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="URL" required hint="Upload first, then paste the /uploads/... path">
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/uploads/gallery/photo.jpg" />
            </Field>
          </div>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="document">Document</option>
            </Select>
          </Field>
          <Field label="Order">
            <Input type="number" min={0} value={form.orderIndex} onChange={(e) => setForm({ ...form, orderIndex: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox label="Published" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ============================================================ preview */

function PreviewTab() {
  const { t, digits } = useI18n();
  const toast = useToast();
  const [code, setCode] = useState('demo-school');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<any>(`/website/public/${encodeURIComponent(code.trim())}`);
      setData(r);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : 'Failed to load public site');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPublic = () => {
    const url = `${window.location.origin}/website/${code}`;
    window.open(url, '_blank', 'noopener');
    toast.push('Public site opens in a new tab (build the public route to serve it)', 'info');
  };

  return (
    <>
      <Toolbar>
        <label className="text-xs text-slate-500">School code</label>
        <Input className="w-auto min-w-[180px]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="demo-school" />
        <Button variant="secondary" size="sm" onClick={load} loading={loading}><RefreshCw size={14} /> Load</Button>
        <Button variant="teal" size="sm" onClick={openPublic}><ExternalLink size={14} /> Open public site</Button>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : !data ? (
          <div className="py-12 text-center text-sm text-slate-500">Enter a school code to preview its public content.</div>
        ) : (
          <div>
            <div className="border-b border-slate-100 bg-navy-800 px-6 py-5 text-white dark:border-navy-700">
              <p className="text-lg font-bold">{data.school?.nameEn}</p>
              <p className="text-sm opacity-80">{data.school?.nameNe}</p>
              <p className="mt-1 text-xs opacity-60">
                {data.school?.address ?? ''} {data.school?.municipality ? `· ${data.school.municipality}` : ''} {data.school?.district ? `· ${data.school.district}` : ''}
                {data.school?.phone ? ` · ${data.school.phone}` : ''}
              </p>
            </div>

            <div className="p-6">
              {!data.pages?.length ? (
                <p className="py-8 text-center text-sm text-slate-500">No published pages yet.</p>
              ) : (
                <div className="space-y-6">
                  {data.pages.map((p: any) => (
                    <article key={p.id}>
                      <h3 className="text-base font-bold text-navy-800 dark:text-white">{p.titleEn}</h3>
                      {p.titleNe && <p className="text-sm text-slate-500">{p.titleNe}</p>}
                      <div
                        className="prose prose-sm mt-2 max-w-none text-slate-700 dark:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: p.bodyEn ?? '' }}
                      />
                    </article>
                  ))}
                </div>
              )}

              {!!data.gallery?.length && (
                <div className="mt-6">
                  <h3 className="mb-2 text-base font-bold text-navy-800 dark:text-white">Gallery</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {data.gallery.map((g: any) => (
                      <img key={g.id} src={g.url} alt={g.title} className="h-24 w-full rounded object-cover" loading="lazy" />
                    ))}
                  </div>
                </div>
              )}

              {!!data.notices?.length && (
                <div className="mt-6">
                  <h3 className="mb-2 text-base font-bold text-navy-800 dark:text-white">Notices</h3>
                  <ul className="space-y-1.5 text-sm">
                    {data.notices.map((n: any) => (
                      <li key={n.id} className="rounded border border-slate-100 px-3 py-2 dark:border-navy-800">
                        <b>{n.titleEn}</b>
                        {n.titleNe && <span className="ml-1.5 font-normal text-slate-500">{n.titleNe}</span>}
                        {n.bodyEn && <p className="text-xs text-slate-500">{n.bodyEn}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-6 text-xs text-slate-400">
                {digits(data.pages?.length ?? 0)} pages · {digits(data.gallery?.length ?? 0)} gallery items · {digits(data.notices?.length ?? 0)} notices
              </p>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
