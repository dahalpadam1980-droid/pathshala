import { useCallback, useEffect, useState } from 'react';
import { Eye, Upload, ArrowUpRight, Download } from 'lucide-react';
import CrudPage, { type CrudColumn, type FieldDef } from '../components/CrudPage';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { Button, Modal, Field, Input, Select, Badge, useToast, Spinner } from '../lib/ui';

type Row = any;

export default function StudentsPage() {
  const { t, digits, fmtAd, lang } = useI18n();
  const toast = useToast();

  const [lk, setLk] = useState<{ classes: Opt[]; sections: Opt[] }>({ classes: [], sections: [] });
  // Optional-subject metadata: per-class choice count + the class's optional pool.
  const [classMeta, setClassMeta] = useState<{ counts: Record<string, number>; pool: Record<string, Opt[]> }>({ counts: {}, pool: {} });
  const [detail, setDetail] = useState<Row | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promo, setPromo] = useState({ fromClassId: '', toClassId: '' });
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    loadAll({ classes: lookups.classes, sections: lookups.sections }).then((d) => setLk(d));
  }, []);

  // Load per-class optional-subject counts + optional pools (for the subject picker).
  useEffect(() => {
    (async () => {
      try {
        const [cls, cs, subjLk] = await Promise.all([
          api.list<Row>('/academics/classes', { all: 1, pageSize: 500 }),
          api.list<Row>('/academics/class-subjects', { all: 1, pageSize: 500 }),
          loadAll({ subjects: lookups.subjects }),
        ]);
        const counts: Record<string, number> = {};
        for (const c of cls.data) counts[c.id] = Number(c.optionalCount ?? 0);
        const labels = new Map(subjLk.subjects.map((s) => [s.value, s.label]));
        const pool: Record<string, Opt[]> = {};
        for (const row of cs.data) {
          if (row.isCompulsory === false) {
            if (!pool[row.classId]) pool[row.classId] = [];
            pool[row.classId].push({ value: row.subjectId, label: labels.get(row.subjectId) ?? row.subjectId });
          }
        }
        setClassMeta({ counts, pool });
      } catch {
        /* optional metadata — the form still works without it */
      }
    })();
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const r = await api.get<Row>(`/students/${id}`);
      setDetail(r);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  const columns: CrudColumn[] = [
    {
      key: 'admissionNo',
      header: 'ADM No',
      render: (r) => <span className="font-mono text-xs font-semibold text-navy-700 dark:text-teal-300">{digits(r.admissionNo)}</span>,
    },
    {
      key: 'nameEn',
      header: t('name'),
      render: (r) => (
        <div className="flex items-center gap-2">
          {r.photoUrl ? (
            <img src={r.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover dark:border-navy-600" />
          ) : null}
          <div className="min-w-0">
            <p className="font-medium text-slate-800 dark:text-slate-100">{lang === 'ne' ? r.nameNe || r.nameEn : r.nameEn}</p>
            {lang !== 'ne' && r.nameNe && <p className="text-xs text-slate-500">{r.nameNe}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'className',
      header: t('classes'),
      render: (r) => (
        <span className="text-xs">
          {r.className ?? '—'}
          {r.sectionName ? <span className="text-slate-500"> · {r.sectionName}</span> : null}
        </span>
      ),
    },
    { key: 'rollNo', header: 'Roll', render: (r) => (r.rollNo ? digits(r.rollNo) : '—') },
    {
      key: 'gender',
      header: t('gender'),
      render: (r) => <Badge tone={r.gender === 'female' ? 'teal' : r.gender === 'male' ? 'navy' : 'slate'}>{r.gender ?? '—'}</Badge>,
    },
    { key: 'fatherName', header: 'Father', hideOnMobile: true },
    { key: 'phone', header: t('phone'), render: (r) => digits(r.phone ?? r.fatherPhone ?? '—'), hideOnMobile: true },
    { key: 'status', header: t('status') },
  ];

  const fields: FieldDef[] = [
    { name: 'nameEn', label: 'nameEn', required: true, colSpan: 2 },
    { name: 'nameNe', label: 'nameNe' },
    { name: 'admissionNo', label: 'Admission no.', help: 'Leave blank to auto-generate', hideOnCreate: true },
    { name: 'photoUrl', label: 'photo', type: 'image', colSpan: 2 },
    { name: 'dobAd', label: 'Date of birth', type: 'date', bsField: 'dobBs' },
    { name: 'gender', label: 'gender', type: 'select', options: [
      { value: 'male', label: t('male') }, { value: 'female', label: t('female') }, { value: 'other', label: t('other') },
    ] },
    { name: 'bloodGroup', label: 'Blood group', placeholder: 'O+' },
    { name: 'phone', label: 'phone' },
    { name: 'email', label: 'email' },
    { name: 'classId', label: 'classes', type: 'select', options: 'classes' },
    { name: 'sectionId', label: 'sections', type: 'select', options: 'sections' },
    {
      name: 'subjectIds',
      label: 'optionalSubjects',
      type: 'multiselect',
      required: true,
      colSpan: 2,
      optionsFn: (values) => classMeta.pool[values.classId] ?? [],
      // Only when the class requires choices AND has optional subjects mapped.
      hidden: (values) => !(classMeta.counts[values.classId] > 0 && (classMeta.pool[values.classId]?.length ?? 0) > 0),
      helpFn: (values) => {
        const n = classMeta.counts[values.classId] ?? 0;
        if (!n) return '';
        const have = (classMeta.pool[values.classId] ?? []).length;
        const need = Math.min(n, have);
        return `${t('chooseExactly')} ${digits(need)} ${t('optionalSubjects')}`;
      },
    },
    { name: 'rollNo', label: 'Roll no.', type: 'number', min: 0, max: 999, hideOnCreate: true },
    { name: 'admissionDate', label: 'Admission date', type: 'date' },
    { name: 'fatherName', label: 'Father name' },
    { name: 'fatherPhone', label: 'Father phone' },
    { name: 'motherName', label: 'Mother name' },
    { name: 'motherPhone', label: 'Mother phone' },
    { name: 'guardianName', label: 'Guardian name' },
    { name: 'guardianRelation', label: 'Guardian relation', placeholder: 'Father / Mother / Uncle' },
    { name: 'guardianPhone', label: 'Guardian phone' },
    { name: 'address', label: 'address', colSpan: 2 },
    { name: 'municipality', label: 'Municipality', placeholder: 'गाउँपालिका/नगरपालिका' },
    { name: 'ward', label: 'Ward', type: 'number', min: 1, max: 35 },
    { name: 'district', label: 'District' },
    { name: 'province', label: 'Province' },
    { name: 'prevSchool', label: 'Previous school' },
    { name: 'house', label: 'House' },
    { name: 'notes', label: 'remarks', type: 'textarea', colSpan: 2 },
    {
      name: 'status',
      label: 'status',
      type: 'select',
      options: [
        { value: 'active', label: t('active') },
        { value: 'transferred', label: 'Transferred' },
        { value: 'withdrawn', label: 'Withdrawn' },
        { value: 'alumni', label: 'Alumni' },
        { value: 'suspended', label: 'Suspended' },
      ],
      required: true,
    },
  ];

  const doImport = async (file: File) => {
    setImporting(true);
    try {
      const r = await api.upload<{ imported?: number; errors?: number }>('/students/import', file);
      toast.push(`Imported ${r.imported ?? 0} students${r.errors ? `, ${r.errors} skipped` : ''}`, 'success');
      setImportOpen(false);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const doPromote = async () => {
    if (!promo.fromClassId || !promo.toClassId) return;
    setPromoting(true);
    try {
      const r = await api.post<{ promoted: number }>('/students/promote', promo);
      toast.push(`Promoted ${r.promoted} students`, 'success');
      setPromoteOpen(false);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Promotion failed', 'error');
    } finally {
      setPromoting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const blob = await api.download('/students/template');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'students-template.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Download failed', 'error');
    }
  };

  return (
    <>
      <CrudPage
        endpoint="/students"
        title={t('students')}
        subtitle={`${t('students')} · ${t('import')}/${t('export')}`}
        columns={columns}
        fields={fields}
        searchPlaceholder={`${t('search')} name / ADM no / father`}
        defaultSort="rollNo"
        defaultOrder="asc"
        pageSize={25}
        createLabel={`${t('add')} ${t('students')}`}
        exportPath="/students/export"
        lookups={async () => {
          const d = await loadAll({ classes: lookups.classes, sections: lookups.sections });
          return d as unknown as Record<string, Opt[]>;
        }}
        filters={[
          { name: 'classId', label: t('classes'), options: lk.classes },
          { name: 'sectionId', label: t('sections'), options: lk.sections },
          { name: 'status', label: t('status'), options: [
            { value: 'active', label: t('active') },
            { value: 'transferred', label: 'Transferred' },
            { value: 'withdrawn', label: 'Withdrawn' },
            { value: 'alumni', label: 'Alumni' },
            { value: 'suspended', label: 'Suspended' },
          ] },
          { name: 'gender', label: t('gender'), options: [
            { value: 'male', label: t('male') }, { value: 'female', label: t('female') }, { value: 'other', label: t('other') },
          ] },
        ]}
        rowActions={(row, reload) => (
          <button
            onClick={() => loadDetail(row.id)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-navy-50 hover:text-navy-700 dark:hover:bg-navy-800"
            title={t('view')}
          >
            <Eye size={15} />
          </button>
        )}
        toolbar={
          <>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload size={14} /> {t('import')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPromoteOpen(true)}>
              <ArrowUpRight size={14} /> Promote
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download size={14} /> Template
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} wide title={detail ? `${t('details')} — ${detail.nameEn}` : t('details')}>
        {detailLoading || !detail ? (
          <div className="grid place-items-center py-10"><Spinner /></div>
        ) : (
          <div className="space-y-4">
            {detail.photoUrl && (
              <div className="flex items-center gap-3">
                <img src={detail.photoUrl} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover dark:border-navy-600" />
                <div className="text-sm text-slate-500">{t('photoHint')}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['ADM No', digits(detail.admissionNo)],
                [t('classes'), `${detail.className ?? '—'} ${detail.sectionName ?? ''}`],
                ['Roll', digits(detail.rollNo ?? '—')],
                [t('date'), fmtAd(detail.admissionDate)],
                [t('gender'), detail.gender ?? '—'],
                ['Blood', detail.bloodGroup ?? '—'],
                [t('phone'), digits(detail.phone ?? '—')],
                [t('email'), detail.email ?? '—'],
                ['Status', detail.status],
                ['Father', detail.fatherName ?? '—'],
                ['Mother', detail.motherName ?? '—'],
                ['Guardian', detail.guardianName ? `${detail.guardianName} (${detail.guardianRelation ?? '—'})` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-navy-800">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p>
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{v as any}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('address')}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {[detail.address, detail.municipality, detail.ward ? `Ward ${detail.ward}` : '', detail.district, detail.province]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </p>
            </div>

            {Array.isArray(detail.subjectIds) && detail.subjectIds.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('optionalSubjects')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.subjectIds.map((sid: string) => {
                    const pool = [
                      ...(classMeta.pool[detail.classId ?? ''] ?? []),
                      ...Object.values(classMeta.pool).flat(),
                    ];
                    const label = pool.find((s) => s.value === sid)?.label ?? sid.slice(0, 8);
                    return <Badge key={sid} tone="teal">{label}</Badge>;
                  })}
                </div>
              </div>
            )}

            {detail.history?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment history</p>
                <ul className="space-y-1">
                  {detail.history.map((h: any) => (
                    <li key={h.id} className="flex justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs dark:border-navy-800">
                      <span>{h.yearName} · {h.className} {h.sectionName ?? ''}</span>
                      <Badge tone={h.status === 'studying' ? 'green' : 'slate'}>{h.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.documents?.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</p>
                <ul className="space-y-1">
                  {detail.documents.map((d: any) => (
                    <li key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1.5 text-xs dark:border-navy-800">
                      <span>{d.title} · {d.type}</span>
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">{t('view')}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ------------------------------------------------------- import */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={`${t('import')} — ${t('students')}`}
        footer={<Button variant="secondary" onClick={() => setImportOpen(false)}>{t('close')}</Button>}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Upload an .xlsx or .csv file with the columns from the template. Required: <b>nameEn</b>. Optional: nameNe,
            dobBs, dobAd, gender, phone, fatherName, class, section, rollNo, address, district…
          </p>
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download size={14} /> {t('download')} template
          </Button>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doImport(f);
            }}
            className="block w-full rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-navy-600"
          />
          {importing && <p className="flex items-center gap-2 text-slate-500"><Spinner size={14} /> {t('loading')}</p>}
        </div>
      </Modal>

      {/* ----------------------------------------------------- promote */}
      <Modal open={promoteOpen} onClose={() => setPromoteOpen(false)} title="Promote students"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPromoteOpen(false)}>{t('cancel')}</Button>
            <Button onClick={doPromote} loading={promoting}>Promote</Button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Moves every active student of the selected class to the next class for the current academic year.
          </p>
          <Field label="From class" required>
            <Select value={promo.fromClassId} onChange={(e) => setPromo({ ...promo, fromClassId: e.target.value })}>
              <option value="">—</option>
              {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="To class" required>
            <Select value={promo.toClassId} onChange={(e) => setPromo({ ...promo, toClassId: e.target.value })}>
              <option value="">—</option>
              {lk.classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
