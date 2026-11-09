import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Printer, FileBadge2, IdCard } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, Checkbox, useToast, StatCard } from '../lib/ui';

export default function CertificatesPage() {
  const [tab, setTab] = useState('issue');
  return (
    <>
      <PageHeader
        title="Certificates & documents"
        subtitle="Issue character/transfer/bonafide certificates from editable templates, keep a register, print ID cards"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'issue', label: 'Issue' },
          { key: 'issued', label: 'Issued register' },
          { key: 'templates', label: 'Templates' },
          { key: 'idcard', label: 'ID card' },
        ]}
      />
      {tab === 'issue' && <IssueTab />}
      {tab === 'issued' && <IssuedTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'idcard' && <IdCardTab />}
    </>
  );
}

/* ============================================================= issue */

function IssueTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [types, setTypes] = useState<Array<{ type: string; en: string; ne: string }>>([]);
  const [students, setStudents] = useState<Opt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [form, setForm] = useState({ type: 'character', subjectType: 'student', subjectId: '' });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => {
    api.list<any>('/certificates/types').then((r) => setTypes(r.data ?? [])).catch(() => undefined);
    loadAll({ students: lookups.students, employees: lookups.employees }).then((d) => {
      setStudents(d.students);
      setEmployees(d.employees);
    });
  }, []);

  const issue = async () => {
    if (!form.subjectId) {
      toast.push('Select a student or staff member', 'error');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type: form.type, extra: {} };
      if (form.subjectType === 'student') body.studentId = form.subjectId;
      else body.employeeId = form.subjectId;
      const r = await api.post<any>('/certificates/issue', body);
      toast.push(`Issued ${r.serialNo}`, 'success');
      setPreview(r);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Issue failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedType = types.find((x) => x.type === form.type);

  return (
    <>
      <Toolbar>
        <Select className="w-auto min-w-[180px]" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {types.map((x) => <option key={x.type} value={x.type}>{x.en}</option>)}
        </Select>
        <Select className="w-auto" value={form.subjectType} onChange={(e) => setForm({ ...form, subjectType: e.target.value, subjectId: '' })}>
          <option value="student">For student</option>
          <option value="employee">For staff</option>
        </Select>
        <Select className="w-auto min-w-[220px]" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
          <option value="">— select —</option>
          {(form.subjectType === 'student' ? students : employees).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Button size="sm" onClick={issue} loading={busy}><FileBadge2 size={14} /> Issue certificate</Button>
      </Toolbar>

      <Panel>
        <div className="p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Choose a certificate type and the person it is for. The document is generated from the school's template
            with real data (admission number, class, parents, dates) and added to the register with a serial number.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((x) => (
              <button
                key={x.type}
                onClick={() => setForm({ ...form, type: x.type })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  form.type === x.type
                    ? 'border-teal-500 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/20'
                    : 'border-slate-200 hover:border-teal-300 dark:border-navy-700'
                }`}
              >
                <p className="text-sm font-semibold">{x.en}</p>
                <p className="text-xs text-slate-500">{x.ne}</p>
              </button>
            ))}
          </div>
          {selectedType && (
            <p className="mt-4 text-xs text-slate-500">
              Template placeholders are filled automatically from the selected {form.subjectType}'s record.
            </p>
          )}
        </div>
      </Panel>

      {/* preview of just-issued certificate */}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        wide
        title={`Certificate ${preview?.serialNo ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>{t('close')}</Button>
            <Button variant="teal" onClick={() => window.print()}><Printer size={14} /> {t('print')}</Button>
          </>
        }
      >
        {preview ? <CertificateView data={preview} /> : null}
      </Modal>
    </>
  );
}

function CertificateView({ data }: { data: any }) {
  const school = data.school ?? {};
  const serial = data.serialNo ?? data.data?.serialNo;
  return (
    <div className="rounded-lg border-2 border-slate-300 p-6 text-sm print:border-black">
      <div className="mb-3 flex items-start justify-between border-b border-slate-200 pb-3 print:border-black">
        <div>
          <p className="text-base font-bold">{school.nameEn ?? 'School'}</p>
          <p className="text-xs text-slate-500">
            {school.address ?? ''} {school.municipality ? `· ${school.municipality}` : ''} {school.district ? `· ${school.district}` : ''}
          </p>
          <p className="text-xs text-slate-500">{school.phone ?? ''}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p className="font-mono font-semibold">{serial ?? ''}</p>
          <p>{data.data?.date ?? ''}</p>
        </div>
      </div>
      <div
        className="prose prose-sm max-w-none text-slate-800 dark:text-slate-200"
        dangerouslySetInnerHTML={{ __html: data.bodyHtml ?? '' }}
      />
      <div className="mt-8 flex justify-between gap-6 text-center text-xs">
        <div>
          <p className="mb-6">&nbsp;</p>
          <p className="border-t border-slate-400 pt-1">Prepared by</p>
        </div>
        <div>
          <p className="mb-6">&nbsp;</p>
          <p className="border-t border-slate-400 pt-1">Office seal</p>
        </div>
        <div>
          <p className="mb-6">&nbsp;</p>
          <p className="border-t border-slate-400 pt-1">{school.principalName ?? 'Principal'}</p>
        </div>
      </div>
    </div>
  );
}

/* ======================================================= issued list */

function IssuedTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [printFor, setPrintFor] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/certificates/issued', type ? { type } : undefined);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load register');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const openPrint = async (r: any) => {
    try {
      const d = await api.get<any>(`/certificates/issued/${r.id}/print`);
      setPrintFor({ ...d, issuedAt: r.issuedAt });
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed to load certificate', 'error');
    }
  };

  const revoke = async (r: any) => {
    if (!window.confirm(`Revoke certificate ${r.serialNo}?`)) return;
    try {
      await api.delete(`/certificates/issued/${r.id}`);
      toast.push('Revoked', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Revoke failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="character">Character</option>
          <option value="transfer">Transfer</option>
          <option value="bonafide">Bonafide</option>
          <option value="study">Study</option>
          <option value="admission">Admission form</option>
          <option value="appointment">Appointment</option>
          <option value="experience">Experience</option>
          <option value="salary">Salary</option>
          <option value="recommendation">Recommendation</option>
          <option value="fee_receipt">Fee receipt</option>
          <option value="official_letter">Official letter</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} issued</span>
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
                { key: 'serialNo', header: 'Serial', render: (r) => <span className="font-mono text-xs font-semibold">{r.serialNo}</span> },
                { key: 'type', header: 'Type', render: (r) => <Badge tone="navy">{String(r.type).replace(/_/g, ' ')}</Badge> },
                { key: 'person', header: 'Issued to', render: (r) => r.studentName ?? r.employeeName ?? '—' },
                { key: 'issuedAt', header: 'Issued', render: (r) => <span className="text-xs">{fmtAd(r.issuedAt)}</span> },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="teal" size="sm" onClick={() => openPrint(r)}><Printer size={13} /> Print</Button>
                      <button onClick={() => revoke(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title="Revoke">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No certificates issued yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={printFor !== null}
        onClose={() => setPrintFor(null)}
        wide
        title={`Certificate ${printFor?.serialNo ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPrintFor(null)}>{t('close')}</Button>
            <Button variant="teal" onClick={() => window.print()}><Printer size={14} /> {t('print')}</Button>
          </>
        }
      >
        {printFor ? (
          <div className="space-y-3">
            <CertificateView data={printFor} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/* ========================================================= templates */

function TemplatesTab() {
  const { t } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<Array<{ type: string; en: string; ne: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ type: 'character', name: '', locale: 'both', bodyHtml: '', isDefault: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tpl, tp] = await Promise.all([
        api.list<any>('/certificates/templates'),
        api.list<any>('/certificates/types').catch(() => null),
      ]);
      setRows(tpl.data ?? []);
      setTypes(tp?.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ type: 'character', name: '', locale: 'both', bodyHtml: '<p>{{name}}</p>', isDefault: true });
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ type: r.type, name: r.name, locale: r.locale ?? 'both', bodyHtml: r.bodyHtml ?? '', isDefault: Boolean(r.isDefault) });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.name.trim() || !form.bodyHtml.trim()) return setFormError('Name and body are required');
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/certificates/templates/${editing.id}`, {
          name: form.name,
          locale: form.locale,
          bodyHtml: form.bodyHtml,
          isDefault: form.isDefault,
        });
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/certificates/templates', {
          type: form.type,
          name: form.name,
          locale: form.locale,
          bodyHtml: form.bodyHtml,
          isDefault: form.isDefault,
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

  const remove = async (r: any) => {
    if (!window.confirm(`Delete template "${r.name}"?`)) return;
    try {
      await api.delete(`/certificates/templates/${r.id}`);
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
        <Button size="sm" onClick={openCreate}><Plus size={14} /> New template</Button>
        <span className="ml-auto text-xs text-slate-500">
          Placeholders: {'{{name}} {{admissionNo}} {{className}} {{sectionName}} {{rollNo}} {{father}} {{mother}} {{date}} {{school}} …'}
        </span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No custom templates — a default template is created automatically the first time each certificate type is issued.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-[220px]">
                  <p className="font-medium">{r.name} {r.isDefault && <Badge tone="green">default</Badge>}</p>
                  <p className="text-xs text-slate-500">
                    <Badge tone="navy">{String(r.type).replace(/_/g, ' ')}</Badge> · {r.locale} · {r.pageSize ?? 'a4'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>Edit</Button>
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
        title={editing ? 'Edit template' : 'New template'}
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
            {!editing && (
              <Field label="Type" required>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {types.map((x) => <option key={x.type} value={x.type}>{x.en}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Locale">
              <Select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
                <option value="en">English</option>
                <option value="ne">नेपाली</option>
                <option value="both">Both</option>
              </Select>
            </Field>
            <div className="flex items-end pb-1">
              <Checkbox label="Default for this type" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            </div>
          </div>
          <Field label="Body (HTML with {{placeholders}})" required>
            <Textarea rows={10} value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ========================================================== ID card */

function IdCardTab() {
  const { t, digits } = useI18n();
  const toast = useToast();
  const [students, setStudents] = useState<Opt[]>([]);
  const [studentId, setStudentId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    lookups.students().then(setStudents);
  }, []);

  const load = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const r = await api.get<any>(`/certificates/id-card/student/${studentId}`);
      setData(r);
    } catch (e) {
      setData(null);
      toast.push(e instanceof ApiError ? e.message : 'Failed to load ID card', 'error');
    } finally {
      setLoading(false);
    }
  };

  const s = data?.student;
  const school = data?.school;

  return (
    <>
      <Toolbar>
        <Select className="w-auto min-w-[260px]" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— select student —</option>
          {students.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
        <Button size="sm" onClick={load} loading={loading} disabled={!studentId}><IdCard size={14} /> Generate</Button>
        {data && (
          <Button variant="teal" size="sm" onClick={() => window.print()}><Printer size={14} /> {t('print')}</Button>
        )}
      </Toolbar>

      <Panel>
        {!data ? (
          <div className="py-14 text-center text-sm text-slate-500">
            Select a student to generate a printable ID card with their photo space, class and contact details.
          </div>
        ) : (
          <div className="grid place-items-center p-6 print:p-0">
            <div className="w-[340px] overflow-hidden rounded-xl border-2 border-navy-700 bg-white text-slate-800 shadow-lg print:border-black print:shadow-none">
              <div className="bg-navy-800 px-4 py-3 text-center text-white">
                <p className="text-sm font-bold">{school?.nameEn}</p>
                <p className="text-[11px] opacity-80">{school?.municipality ?? ''} {school?.district ? `· ${school.district}` : ''}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-widest text-teal-300">Student Identity Card</p>
              </div>
              <div className="flex gap-3 p-4">
                <div className="grid h-24 w-20 shrink-0 place-items-center rounded-lg border border-dashed border-slate-400 text-[10px] text-slate-400">
                  PHOTO
                </div>
                <div className="min-w-0 text-[11px] leading-5">
                  <p className="truncate text-sm font-bold">{s?.nameEn}</p>
                  {s?.nameNe && <p className="truncate text-xs">{s.nameNe}</p>}
                  <p>Adm: <b>{digits(s?.admissionNo ?? '')}</b></p>
                  <p>Class: <b>{data?.className ?? '—'} {data?.sectionName ?? ''}</b> · Roll <b>{digits(s?.rollNo ?? '—')}</b></p>
                  <p>DOB: <b>{digits(s?.dobBs ?? s?.dobAd ?? '—')}</b></p>
                  <p>Phone: <b>{digits(s?.fatherPhone ?? s?.guardianPhone ?? '—')}</b></p>
                </div>
              </div>
              <div className="border-t border-slate-200 px-4 py-2 text-[10px] text-slate-500">
                If found, please return to {school?.nameEn} · {school?.phone ?? ''}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
