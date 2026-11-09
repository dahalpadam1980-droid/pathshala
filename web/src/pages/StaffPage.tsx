import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import CrudPage, { type CrudColumn, type FieldDef } from '../components/CrudPage';
import { Tabs, PageHeader, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { Table, Badge, Button, Select, Modal, Field, Input, Textarea, useToast } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const STATUS_TONE: Record<string, any> = {
  active: 'green', approved: 'green', present: 'green',
  pending: 'amber', suspended: 'amber',
  rejected: 'red', resigned: 'red', retired: 'slate',
};

export default function StaffPage() {
  const { t, digits, fmtAd, lang } = useI18n();
  const [tab, setTab] = useState('employees');
  const [empLookup, setEmpLookup] = useState<Opt[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [errorLeaves, setErrorLeaves] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const toast = useToast();

  useEffect(() => {
    loadAll({ employees: lookups.employees }).then((d) => setEmpLookup(d.employees));
  }, []);

  const loadLeaves = async () => {
    setLoadingLeaves(true);
    setErrorLeaves(null);
    try {
      const r = await api.list<any>('/staff/leaves/list', statusFilter ? { status: statusFilter } : undefined);
      setLeaves(r.data ?? []);
    } catch (e) {
      setErrorLeaves(e instanceof ApiError ? e.message : 'Failed to load leaves');
    } finally {
      setLoadingLeaves(false);
    }
  };

  useEffect(() => {
    if (tab === 'leaves') loadLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  const reviewLeave = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await api.post(`/staff/leaves/${id}/review`, { decision });
      toast.push(decision === 'approved' ? 'Leave approved' : 'Leave rejected', 'success');
      loadLeaves();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employeeId: '', leaveType: 'casual', fromDate: '', toDate: '', reason: '' });

  const applyLeave = async () => {
    if (!leaveForm.employeeId || !leaveForm.fromDate || !leaveForm.toDate) return;
    setApplying(true);
    try {
      await api.post('/staff/leaves', leaveForm);
      toast.push('Leave application submitted', 'success');
      setApplyOpen(false);
      setLeaveForm({ employeeId: '', leaveType: 'casual', fromDate: '', toDate: '', reason: '' });
      setTab('leaves');
      loadLeaves();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  const columns: CrudColumn[] = [
    { key: 'empCode', header: 'Code', render: (r) => <span className="font-mono text-xs font-semibold">{digits(r.empCode)}</span> },
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
            {r.subjectSpecialization && <p className="text-xs text-slate-500">{r.subjectSpecialization}</p>}
          </div>
        </div>
      ),
    },
    { key: 'designation', header: 'Designation' },
    { key: 'appointmentType', header: 'Type' },
    { key: 'level', header: 'Level', hideOnMobile: true },
    { key: 'isTeacher', header: 'Teacher', render: (r) => <Badge tone={r.isTeacher ? 'teal' : 'slate'}>{r.isTeacher ? t('yes') : t('no')}</Badge> },
    { key: 'phone', header: t('phone'), render: (r) => digits(r.phone ?? '—') },
    { key: 'status', header: t('status'), render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status}</Badge> },
  ];

  const fields: FieldDef[] = [
    { name: 'nameEn', label: 'nameEn', required: true },
    { name: 'nameNe', label: 'nameNe' },
    { name: 'empCode', label: 'Employee code', help: 'Leave blank to auto-generate', hideOnCreate: true },
    { name: 'photoUrl', label: 'photo', type: 'image', colSpan: 2 },
    { name: 'gender', label: 'gender', type: 'select', options: [
      { value: 'male', label: t('male') }, { value: 'female', label: t('female') }, { value: 'other', label: t('other') },
    ] },
    { name: 'dob', label: 'Date of birth', type: 'date' },
    { name: 'phone', label: 'phone' },
    { name: 'email', label: 'email' },
    { name: 'appointmentDate', label: 'Appointment date', type: 'date' },
    {
      name: 'appointmentType', label: 'Appointment type', type: 'select', required: true,
      options: [
        { value: 'permanent', label: 'Permanent' }, { value: 'temporary', label: 'Temporary' },
        { value: 'contract', label: 'Contract' }, { value: 'rahat', label: 'Rahat' },
        { value: 'private_source', label: 'Private source' }, { value: 'grant_supported', label: 'Grant supported' },
        { value: 'other', label: t('other') },
      ],
    },
    { name: 'designation', label: 'Designation' },
    { name: 'level', label: 'Govt. level', placeholder: '4 / 5' },
    { name: 'subjectSpecialization', label: 'Subject specialization' },
    { name: 'qualification', label: 'Qualification', help: 'JSON array [{degree, board, year}]', type: 'textarea', colSpan: 2, hideOnCreate: true },
    { name: 'teachingLicense', label: 'Teaching license no.' },
    { name: 'isTeacher', label: 'isTeacher', type: 'checkbox', placeholder: 'This staff teaches classes' },
    { name: 'bankName', label: 'Bank name' },
    { name: 'bankAccount', label: 'Bank account' },
    { name: 'panNo', label: 'PAN no.' },
    { name: 'address', label: 'address', colSpan: 2 },
    { name: 'municipality', label: 'Municipality' },
    { name: 'ward', label: 'Ward', type: 'number', min: 0, max: 35 },
    { name: 'district', label: 'District' },
    { name: 'province', label: 'Province' },
    { name: 'endDate', label: 'End date', type: 'date' },
    { name: 'notes', label: 'remarks', type: 'textarea', colSpan: 2 },
    {
      name: 'status', label: 'status', type: 'select', required: true,
      options: [
        { value: 'active', label: t('active') }, { value: 'suspended', label: 'Suspended' },
        { value: 'retired', label: 'Retired' }, { value: 'resigned', label: 'Resigned' },
      ],
    },
  ];

  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'employees', label: t('staff') },
          { key: 'leaves', label: t('leaves'), badge: leaves.length || undefined },
        ]}
      />

      {tab === 'employees' ? (
        <CrudPage
          endpoint="/staff"
          title={t('staff')}
          subtitle={`${t('staff')} · ${t('serviceRecords')}`}
          columns={columns}
          fields={fields}
          searchPlaceholder={`${t('search')} name / code / designation`}
          defaultSort="nameEn"
          defaultOrder="asc"
          createLabel={`${t('add')} ${t('staff')}`}
          filters={[
            { name: 'status', label: t('status'), options: [
              { value: 'active', label: t('active') }, { value: 'suspended', label: 'Suspended' },
              { value: 'retired', label: 'Retired' }, { value: 'resigned', label: 'Resigned' },
            ] },
            { name: 'isTeacher', label: 'Teacher', options: [
              { value: 'true', label: t('yes') }, { value: 'false', label: t('no') },
            ] },
            { name: 'appointmentType', label: 'Type', options: [
              { value: 'permanent', label: 'Permanent' }, { value: 'temporary', label: 'Temporary' },
              { value: 'contract', label: 'Contract' }, { value: 'rahat', label: 'Rahat' },
            ] },
          ]}
          lookups={async () => ({}) as Record<string, Opt[]>}
        />
      ) : (
        <Panel>
          <Toolbar>
            <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('all')} — {t('status')}</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
            <Button variant="secondary" size="sm" onClick={loadLeaves}>{t('refresh')}</Button>
            <Button size="sm" onClick={() => setApplyOpen(true)}>Apply leave</Button>
          </Toolbar>

          {loadingLeaves ? (
            <LoadingBlock />
          ) : errorLeaves ? (
            <div className="p-4"><ErrorBlock message={errorLeaves} onRetry={loadLeaves} /></div>
          ) : (
            <div className="px-3 pb-3">
              <Table
                columns={[
                  { key: 'employeeName', header: t('name'), render: (r) => <span className="font-medium">{r.employeeName ?? r.employeeId}</span> },
                  { key: 'leaveType', header: 'Type', render: (r) => <Badge tone="navy">{r.leaveType}</Badge> },
                  { key: 'fromDate', header: t('from'), render: (r) => fmtAd(r.fromDate) },
                  { key: 'toDate', header: t('to'), render: (r) => fmtAd(r.toDate) },
                  { key: 'days', header: 'Days', render: (r) => digits(r.days) },
                  { key: 'reason', header: t('reason'), render: (r) => <span className="block max-w-[240px] truncate">{r.reason ?? '—'}</span> },
                  { key: 'status', header: t('status'), render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status}</Badge> },
                  {
                    key: '__a',
                    header: t('actions'),
                    className: 'text-right',
                    render: (r) =>
                      r.status === 'pending' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="teal" onClick={() => reviewLeave(r.id, 'approved')}>
                            <Check size={13} /> Approve
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => reviewLeave(r.id, 'rejected')}>
                            <X size={13} /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{r.reviewedAt ? fmtAd(r.reviewedAt) : '—'}</span>
                      ),
                  },
                ]}
                rows={leaves}
                empty={`${t('noData')} — ${t('leaves')}`}
              />
            </div>
          )}
        </Panel>
      )}

      {/* -------------------------------------------------- apply leave */}
      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Apply leave"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>{t('cancel')}</Button>
            <Button onClick={applyLeave} loading={applying}>{t('save')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label={t('staff')} required>
              <Select value={leaveForm.employeeId} onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}>
                <option value="">—</option>
                {empLookup.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Leave type" required>
            <Select value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="earned">Earned</option>
              <option value="maternity">Maternity</option>
              <option value="study">Study</option>
              <option value="other">{t('other')}</option>
            </Select>
          </Field>
          <Field label={t('reason')}>
            <Input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          </Field>
          <Field label={`${t('from')}`} required>
            <DateInput value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
          </Field>
          <Field label={`${t('to')}`} required>
            <DateInput value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('remarks')}>
              <Textarea rows={3} value={(leaveForm as any).remarks ?? ''} onChange={(e) => setLeaveForm({ ...leaveForm, remarks: e.target.value } as any)} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
