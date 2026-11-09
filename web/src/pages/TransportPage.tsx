import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Pencil } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, loadAll, type Opt } from '../lib/lookups';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const VEHICLE_TYPES = ['bus', 'van', 'car', 'micro'];
const EXPENSE_TYPES = ['fuel', 'maintenance', 'insurance', 'tax', 'other'];

export default function TransportPage() {
  const [tab, setTab] = useState('vehicles');
  return (
    <>
      <PageHeader
        title="Transport"
        subtitle="Vehicles with insurance/fitness expiry, routes with stops and fares, student allocations and running costs"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'vehicles', label: 'Vehicles' },
          { key: 'routes', label: 'Routes' },
          { key: 'allocations', label: 'Allocations' },
          { key: 'expenses', label: 'Expenses' },
        ]}
      />
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'routes' && <RoutesTab />}
      {tab === 'allocations' && <AllocationsTab />}
      {tab === 'expenses' && <ExpensesTab />}
    </>
  );
}

/* =========================================================== vehicles */

function VehiclesTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    plateNo: '', type: 'bus', model: '', capacity: '', insuranceExpiry: '', fitnessExpiry: '',
    driverName: '', driverPhone: '', helperName: '', helperPhone: '', notes: '', status: 'active',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/transport/vehicles');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ plateNo: '', type: 'bus', model: '', capacity: '', insuranceExpiry: '', fitnessExpiry: '', driverName: '', driverPhone: '', helperName: '', helperPhone: '', notes: '', status: 'active' });
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      plateNo: r.plateNo, type: r.type, model: r.model ?? '', capacity: r.capacity ? String(r.capacity) : '',
      insuranceExpiry: r.insuranceExpiry ?? '', fitnessExpiry: r.fitnessExpiry ?? '',
      driverName: r.driverName ?? '', driverPhone: r.driverPhone ?? '', helperName: r.helperName ?? '',
      helperPhone: r.helperPhone ?? '', notes: r.notes ?? '', status: r.status ?? 'active',
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.plateNo.trim() && !editing) return setFormError('Plate number is required');
    setSaving(true);
    try {
      const body = {
        type: form.type,
        model: form.model || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        insuranceExpiry: form.insuranceExpiry || null,
        fitnessExpiry: form.fitnessExpiry || null,
        driverName: form.driverName || null,
        driverPhone: form.driverPhone || null,
        helperName: form.helperName || null,
        helperPhone: form.helperPhone || null,
        notes: form.notes || null,
        ...(editing ? { status: form.status } : { plateNo: form.plateNo.trim() }),
      };
      if (editing) {
        await api.patch(`/transport/vehicles/${editing.id}`, body);
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/transport/vehicles', body);
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
    if (!window.confirm(`Delete vehicle ${r.plateNo}?`)) return;
    try {
      await api.delete(`/transport/vehicles/${r.id}`);
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
        <Button size="sm" onClick={openCreate}><Plus size={14} /> Add vehicle</Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} vehicles</span>
      </Toolbar>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vehicles" value={digits(rows.length)} accent="navy" />
        <StatCard label="Active" value={digits(rows.filter((r) => r.status === 'active').length)} accent="green" />
        <StatCard label="In maintenance" value={digits(rows.filter((r) => r.status === 'maintenance').length)} accent="amber" />
        <StatCard
          label="Docs expiring/expired"
          value={digits(rows.filter((r) => r.insuranceExpired || r.fitnessExpired).length)}
          accent="red"
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
                { key: 'plateNo', header: 'Plate', render: (r) => <span className="font-mono text-xs font-semibold">{r.plateNo}</span> },
                {
                  key: 'type',
                  header: 'Vehicle',
                  render: (r) => (
                    <div>
                      <p className="font-medium capitalize">{r.type} {r.model ? `· ${r.model}` : ''}</p>
                      <p className="text-xs text-slate-500">Capacity {digits(r.capacity ?? '—')}</p>
                    </div>
                  ),
                },
                {
                  key: 'driver',
                  header: 'Driver',
                  render: (r) => (
                    <div className="text-xs">
                      <p>{r.driverName ?? '—'}{r.driverPhone ? ` · ${digits(r.driverPhone)}` : ''}</p>
                      {r.helperName && <p className="text-slate-500">Helper: {r.helperName}</p>}
                    </div>
                  ),
                },
                {
                  key: 'insuranceExpiry',
                  header: 'Insurance',
                  render: (r) => (
                    <span className={`text-xs ${r.insuranceExpired ? 'font-semibold text-red-600' : ''}`}>
                      {r.insuranceExpiry ? fmtAd(r.insuranceExpiry) : '—'}{r.insuranceExpired ? ' ⚠' : ''}
                    </span>
                  ),
                },
                {
                  key: 'fitnessExpiry',
                  header: 'Fitness',
                  render: (r) => (
                    <span className={`text-xs ${r.fitnessExpired ? 'font-semibold text-red-600' : ''}`}>
                      {r.fitnessExpiry ? fmtAd(r.fitnessExpiry) : '—'}{r.fitnessExpired ? ' ⚠' : ''}
                    </span>
                  ),
                },
                { key: 'status', header: t('status'), render: (r) => <Badge tone={r.status === 'active' ? 'green' : r.status === 'maintenance' ? 'amber' : 'red'}>{r.status}</Badge> },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(r)} className="rounded-md p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title={t('edit')}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={rows}
              empty="No vehicles registered yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={editing ? `Edit ${editing.plateNo}` : 'Add vehicle'}
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
          <Field label="Plate number" required>
            <Input value={form.plateNo} onChange={(e) => setForm({ ...form, plateNo: e.target.value })} disabled={Boolean(editing)} placeholder="BA 1 CHA 1234" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {VEHICLE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </Field>
          <Field label="Capacity (seats)">
            <Input type="number" min={1} max={200} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </Field>
          <Field label="Insurance expiry">
            <DateInput value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} />
          </Field>
          <Field label="Fitness expiry">
            <DateInput value={form.fitnessExpiry} onChange={(e) => setForm({ ...form, fitnessExpiry: e.target.value })} />
          </Field>
          <Field label="Driver name">
            <Input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
          </Field>
          <Field label="Driver phone">
            <Input value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} />
          </Field>
          <Field label="Helper name">
            <Input value={form.helperName} onChange={(e) => setForm({ ...form, helperName: e.target.value })} />
          </Field>
          <Field label="Helper phone">
            <Input value={form.helperPhone} onChange={(e) => setForm({ ...form, helperPhone: e.target.value })} />
          </Field>
          {editing && (
            <Field label={t('status')}>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ============================================================= routes */

function RoutesTab() {
  const { t, digits, npr } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Opt[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '', vehicleId: '', monthlyFare: '' });
  const [stops, setStops] = useState<Array<{ name: string; time: string; fare: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    lookups.vehicles().then(setVehicles);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/transport/routes');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', vehicleId: '', monthlyFare: '' });
    setStops([{ name: '', time: '', fare: '' }]);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ name: r.name, description: r.description ?? '', vehicleId: r.vehicleId ?? '', monthlyFare: String(r.monthlyFare ?? 0) });
    setStops((r.stops ?? []).map((s: any) => ({ name: s.name ?? '', time: s.time ?? '', fare: String(s.fare ?? 0) })));
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Route name is required');
    const cleanStops = stops
      .filter((s) => s.name.trim())
      .map((s) => ({ name: s.name.trim(), time: s.time || '', fare: Number(s.fare || 0) }));
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description || null,
        vehicleId: form.vehicleId || null,
        stops: cleanStops,
        monthlyFare: Number(form.monthlyFare || 0),
      };
      if (editing) {
        await api.patch(`/transport/routes/${editing.id}`, body);
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/transport/routes', body);
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
    if (!window.confirm(`Delete route "${r.name}" and its allocations?`)) return;
    try {
      await api.delete(`/transport/routes/${r.id}`);
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
        <Button size="sm" onClick={openCreate}><Plus size={14} /> Add route</Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} routes</span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No routes yet — add one with its stops and fare.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-[240px]">
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {r.name} {!r.active && <Badge tone="slate">inactive</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.vehiclePlate ? `Vehicle ${r.vehiclePlate}` : 'No vehicle'} · monthly fare <b>{npr(r.monthlyFare)}</b> · {digits(r.studentsAllocated)} students
                  </p>
                  {!!r.stops?.length && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.stops.map((s: any, i: number) => (
                        <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-navy-800 dark:text-slate-300">
                          {s.name}{s.time ? ` · ${s.time}` : ''}{s.fare ? ` · ${npr(s.fare)}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.description && <p className="mt-1 text-xs text-slate-500">{r.description}</p>}
                </div>
                <div className="flex gap-1.5">
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
        title={editing ? 'Edit route' : 'Add route'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={save} loading={saving}>{saving ? t('saving') : t('save')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-300">{formError}</div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Route name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campus – City route" />
            </Field>
            <Field label="Vehicle">
              <Select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                <option value="">—</option>
                {vehicles.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Monthly fare (NPR)">
              <Input type="number" min={0} max={1000000} value={form.monthlyFare} onChange={(e) => setForm({ ...form, monthlyFare: e.target.value })} />
            </Field>
            <Field label="Description">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Stops</p>
            <div className="space-y-1.5">
              {stops.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_110px_auto] gap-2">
                  <Input value={s.name} placeholder="Stop name" onChange={(e) => setStops((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input value={s.time} placeholder="Time" onChange={(e) => setStops((xs) => xs.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
                  <Input type="number" min={0} value={s.fare} placeholder="Fare" onChange={(e) => setStops((xs) => xs.map((x, j) => (j === i ? { ...x, fare: e.target.value } : x)))} />
                  <button className="rounded-md p-2 text-slate-400 hover:text-red-600" onClick={() => setStops((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setStops((xs) => [...xs, { name: '', time: '', fare: '' }])}>
                <Plus size={13} /> Add stop
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ======================================================== allocations */

function AllocationsTab() {
  const { t, digits, npr } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lk, setLk] = useState<{ routes: Opt[]; students: Opt[] }>({ routes: [], students: [] });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ routeId: '', studentId: '', stopName: '', monthlyFare: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll({ routes: lookups.routes, students: lookups.students }).then(setLk);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/transport/allocations');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load allocations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allocate = async () => {
    if (!form.routeId || !form.studentId) {
      toast.push('Select a route and a student', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/transport/allocations', {
        routeId: form.routeId,
        studentId: form.studentId,
        stopName: form.stopName || null,
        monthlyFare: form.monthlyFare === '' ? undefined : Number(form.monthlyFare),
      });
      toast.push('Student allocated to route', 'success');
      setOpen(false);
      setForm({ routeId: '', studentId: '', stopName: '', monthlyFare: '' });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Allocation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm(`Remove ${r.studentName} from ${r.routeName}?`)) return;
    try {
      await api.delete(`/transport/allocations/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const totalMonthly = rows.filter((r) => r.active).reduce((s, r) => s + Number(r.monthlyFare), 0);

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Allocate student</Button>
        <span className="ml-auto text-xs text-slate-500">
          {digits(rows.filter((r) => r.active).length)} active · monthly fare roll <b>{npr(totalMonthly)}</b>
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
                  key: 'studentName',
                  header: 'Student',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.studentName}</p>
                      <p className="text-xs text-slate-500">{digits(r.admissionNo)} · {r.className ?? ''} {r.sectionName ?? ''} · roll {digits(r.rollNo ?? '—')}</p>
                    </div>
                  ),
                },
                { key: 'routeName', header: 'Route', render: (r) => r.routeName ?? '—' },
                { key: 'stopName', header: 'Stop', render: (r) => r.stopName ?? '—' },
                { key: 'monthlyFare', header: 'Monthly fare', render: (r) => <b>{npr(r.monthlyFare)}</b> },
                { key: 'active', header: 'Status', render: (r) => (r.active ? <Badge tone="green">active</Badge> : <Badge tone="slate">inactive</Badge>) },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title="Remove">
                      <Trash2 size={15} />
                    </button>
                  ),
                },
              ]}
              rows={rows}
              empty="No students allocated to any route yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Allocate student to route"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={allocate} loading={saving}>{saving ? t('saving') : 'Allocate'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Route" required>
              <Select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
                <option value="">—</option>
                {lk.routes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Student" required>
              <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
                <option value="">—</option>
                {lk.students.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Stop">
            <Input value={form.stopName} onChange={(e) => setForm({ ...form, stopName: e.target.value })} placeholder="e.g. Mahendrapul" />
          </Field>
          <Field label="Monthly fare (NPR)" hint="blank = route default">
            <Input type="number" min={0} value={form.monthlyFare} onChange={(e) => setForm({ ...form, monthlyFare: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ========================================================== expenses */

function ExpensesTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [vehicles, setVehicles] = useState<Opt[]>([]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    vehicleId: '', date: new Date().toISOString().slice(0, 10), type: 'fuel',
    description: '', liters: '', odometer: '', amount: '', vendor: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    lookups.vehicles().then(setVehicles);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/transport/expenses', type ? { type } : undefined);
      setRows(r.data ?? []);
      setMeta(r.meta ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (!form.vehicleId || !form.amount || Number(form.amount) <= 0) return setFormError('Vehicle and amount are required');
    setSaving(true);
    try {
      await api.post('/transport/expenses', {
        vehicleId: form.vehicleId,
        date: form.date,
        type: form.type,
        description: form.description || null,
        liters: form.liters === '' ? null : Number(form.liters),
        odometer: form.odometer === '' ? null : Number(form.odometer),
        amount: Number(form.amount),
        vendor: form.vendor || null,
      });
      toast.push(t('created'), 'success');
      setOpen(false);
      setForm({ ...form, description: '', liters: '', odometer: '', amount: '', vendor: '' });
      load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: any) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await api.delete(`/transport/expenses/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {EXPENSE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Add expense</Button>
        <span className="ml-auto text-sm">Total: <b>{npr(meta?.total ?? 0)}</b></span>
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
                { key: 'date', header: 'Date', render: (r) => <span className="text-xs">{fmtAd(r.date)}</span> },
                { key: 'plateNo', header: 'Vehicle', render: (r) => <span className="font-mono text-xs">{r.plateNo ?? '—'}</span> },
                { key: 'type', header: 'Type', render: (r) => <Badge tone="navy">{r.type}</Badge> },
                { key: 'description', header: 'Details', render: (r) => <span className="block max-w-[260px] truncate">{r.description ?? '—'}{r.liters ? ` · ${digits(r.liters)} L` : ''}{r.odometer ? ` · odo ${digits(r.odometer)}` : ''}</span> },
                { key: 'vendor', header: 'Vendor', render: (r) => r.vendor ?? '—' },
                { key: 'amount', header: 'Amount', render: (r) => <b className="text-red-600">{npr(r.amount)}</b> },
                {
                  key: '__a',
                  header: t('actions'),
                  className: 'text-right',
                  render: (r) => (
                    <button onClick={() => remove(r)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                      <Trash2 size={15} />
                    </button>
                  ),
                },
              ]}
              rows={rows}
              empty="No vehicle expenses recorded yet."
            />
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add vehicle expense"
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
          <Field label="Vehicle" required>
            <Select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
              <option value="">—</option>
              {vehicles.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Date" required>
            <DateInput value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {EXPENSE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Amount (NPR)" required>
            <Input type="number" min={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Litres (fuel)">
            <Input type="number" min={0} step={0.1} value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} />
          </Field>
          <Field label="Odometer">
            <Input type="number" min={0} value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
          </Field>
          <Field label="Vendor">
            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
