import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, BedDouble, MessageSquareWarning } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { lookups, type Opt } from '../lib/lookups';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

export default function HostelPage() {
  const [tab, setTab] = useState('hostels');
  return (
    <>
      <PageHeader
        title="Hostel"
        subtitle="Hostels with rooms, bed allocations per student and a complaint register"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'hostels', label: 'Hostels & rooms' },
          { key: 'complaints', label: 'Complaints' },
        ]}
      />
      {tab === 'hostels' && <HostelsTab />}
      {tab === 'complaints' && <ComplaintsTab />}
    </>
  );
}

/* =========================================================== hostels */

function HostelsTab() {
  const { t, digits } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', type: 'boys', warden: '', phone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [roomFor, setRoomFor] = useState<any>(null);
  const [roomForm, setRoomForm] = useState({ roomNo: '', capacity: '4' });
  const [roomBusy, setRoomBusy] = useState(false);

  const [allocFor, setAllocFor] = useState<any>(null);
  const [allocForm, setAllocForm] = useState({ studentId: '', bedNo: '', from: new Date().toISOString().slice(0, 10) });
  const [students, setStudents] = useState<Opt[]>([]);
  const [allocBusy, setAllocBusy] = useState(false);

  useEffect(() => {
    lookups.students().then(setStudents);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/hostel');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load hostels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    if (!form.name.trim()) return setFormError('Name is required');
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        warden: form.warden || null,
        phone: form.phone || null,
        notes: form.notes || null,
      };
      if (editing) {
        await api.patch(`/hostel/${editing.id}`, body);
        toast.push(t('saved'), 'success');
      } else {
        await api.post('/hostel', body);
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
    if (!window.confirm(`Delete hostel "${r.name}" with all its rooms and allocations?`)) return;
    try {
      await api.delete(`/hostel/${r.id}`);
      toast.push(t('deleted'), 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    }
  };

  const addRoom = async () => {
    if (!roomFor || !roomForm.roomNo.trim()) {
      toast.push('Room number is required', 'error');
      return;
    }
    setRoomBusy(true);
    try {
      await api.post(`/hostel/${roomFor.id}/rooms`, {
        roomNo: roomForm.roomNo.trim(),
        capacity: Number(roomForm.capacity || 1),
      });
      toast.push('Room added', 'success');
      setRoomForm({ roomNo: '', capacity: '4' });
      const r = await api.list<any>('/hostel');
      setRows(r.data ?? []);
      const updated = (r.data ?? []).find((h: any) => h.id === roomFor.id);
      if (updated) setRoomFor(updated);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    } finally {
      setRoomBusy(false);
    }
  };

  const allocate = async () => {
    if (!allocFor || !allocForm.studentId) {
      toast.push('Select a student', 'error');
      return;
    }
    setAllocBusy(true);
    try {
      await api.post(`/hostel/rooms/${allocFor.id}/allocate`, {
        studentId: allocForm.studentId,
        bedNo: allocForm.bedNo || null,
        from: allocForm.from,
      });
      toast.push('Bed allocated', 'success');
      setAllocFor(null);
      setAllocForm({ studentId: '', bedNo: '', from: new Date().toISOString().slice(0, 10) });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Allocation failed', 'error');
    } finally {
      setAllocBusy(false);
    }
  };

  const deallocate = async (a: any) => {
    if (!window.confirm(`Release ${a.studentName} from bed ${a.bedNo ?? '?'}?`)) return;
    try {
      await api.delete(`/hostel/allocations/${a.id}`);
      toast.push('Released', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed', 'error');
    }
  };

  const totalRooms = rows.reduce((s, h) => s + (h.rooms?.length ?? 0), 0);
  const totalBeds = rows.reduce(
    (s, h) => s + (h.rooms?.reduce((x: number, r: any) => x + Number(r.capacity), 0) ?? 0),
    0,
  );
  const totalOccupied = rows.reduce(
    (s, h) => s + (h.rooms?.reduce((x: number, r: any) => x + (r.allocations?.length ?? 0), 0) ?? 0),
    0,
  );

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => { setEditing(null); setForm({ name: '', type: 'boys', warden: '', phone: '', notes: '' }); setFormError(null); setOpen(true); }}>
          <Plus size={14} /> Add hostel
        </Button>
        <span className="ml-auto text-xs text-slate-500">{digits(rows.length)} hostels</span>
      </Toolbar>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Hostels" value={digits(rows.length)} accent="navy" />
        <StatCard label="Rooms" value={digits(totalRooms)} accent="teal" />
        <StatCard label="Beds" value={digits(totalBeds)} accent="amber" />
        <StatCard
          label="Occupied"
          value={`${digits(totalOccupied)}/${digits(totalBeds)}`}
          accent={totalBeds > totalOccupied ? 'green' : 'red'}
        />
      </div>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No hostels yet — add one, then create rooms and allocate students to beds.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((h) => (
              <div key={h.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {h.name} <Badge tone="navy">{h.type}</Badge>
                      {!h.active && <Badge tone="slate">inactive</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      Warden: {h.warden ?? '—'}{h.phone ? ` · ${h.phone}` : ''} · {digits(h.rooms?.length ?? 0)} rooms
                    </p>
                    {h.notes && <p className="mt-1 text-xs text-slate-500">{h.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => { setRoomFor(h); setRoomForm({ roomNo: '', capacity: '4' }); }}>
                      <BedDouble size={13} /> Rooms
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => { setEditing(h); setForm({ name: h.name, type: h.type, warden: h.warden ?? '', phone: h.phone ?? '', notes: h.notes ?? '' }); setFormError(null); setOpen(true); }}>
                      {t('edit')}
                    </Button>
                    <button onClick={() => remove(h)} className="rounded-md p-1.5 text-slate-400 hover:text-red-600" title={t('delete')}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {!!h.rooms?.length && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {h.rooms.map((room: any) => (
                      <div key={room.id} className="rounded-lg border border-slate-200 p-2.5 dark:border-navy-700">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">Room {room.roomNo}</p>
                          <span className={`text-xs ${room.allocations?.length >= room.capacity ? 'text-red-600' : 'text-emerald-600'}`}>
                            {digits(room.allocations?.length ?? 0)}/{digits(room.capacity)}
                          </span>
                        </div>
                        {!!room.allocations?.length && (
                          <ul className="mt-1.5 space-y-1">
                            {room.allocations.map((a: any) => (
                              <li key={a.id} className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                                <span>{a.bedNo ? `B${a.bedNo} · ` : ''}{a.studentName}</span>
                                <button onClick={() => deallocate(a)} className="text-slate-400 hover:text-red-600" title="Release">
                                  <Trash2 size={13} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          className="mt-2 w-full rounded-md border border-teal-300 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300"
                          onClick={() => { setAllocFor(room); setAllocForm({ studentId: '', bedNo: '', from: new Date().toISOString().slice(0, 10) }); }}
                        >
                          + Allocate student
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* -------------------------------------------------- hostel form */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit hostel' : 'Add hostel'}
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
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Boys Hostel A" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={Boolean(editing)}>
              <option value="boys">Boys</option>
              <option value="girls">Girls</option>
              <option value="mixed">Mixed</option>
            </Select>
          </Field>
          <Field label="Warden">
            <Input value={form.warden} onChange={(e) => setForm({ ...form, warden: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------ rooms */}
      <Modal
        open={roomFor !== null}
        onClose={() => setRoomFor(null)}
        wide
        title={`Rooms — ${roomFor?.name ?? ''}`}
        footer={<Button variant="secondary" onClick={() => setRoomFor(null)}>{t('close')}</Button>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_110px_auto] items-end gap-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-900 dark:bg-teal-900/20">
            <Field label="Room number" required>
              <Input value={roomForm.roomNo} onChange={(e) => setRoomForm({ ...roomForm, roomNo: e.target.value })} placeholder="101" />
            </Field>
            <Field label="Beds">
              <Input type="number" min={1} max={100} value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} />
            </Field>
            <Button onClick={addRoom} loading={roomBusy}><Plus size={14} /> Add room</Button>
          </div>

          <Table
            columns={[
              { key: 'roomNo', header: 'Room', render: (r: any) => <b>{r.roomNo}</b> },
              { key: 'capacity', header: 'Beds', render: (r: any) => digits(r.capacity) },
              { key: 'occupied', header: 'Occupied', render: (r: any) => digits(r.allocations?.length ?? 0) },
              {
                key: 'free',
                header: 'Free',
                render: (r: any) => (
                  <span className={r.allocations?.length >= r.capacity ? 'text-red-600' : 'text-emerald-600'}>
                    {digits(Math.max(0, r.capacity - (r.allocations?.length ?? 0)))}
                  </span>
                ),
              },
              {
                key: '__a',
                header: '',
                className: 'text-right',
                render: (r: any) => (
                  <Button
                    variant="teal"
                    size="sm"
                    onClick={() => { setAllocFor(r); setAllocForm({ studentId: '', bedNo: '', from: new Date().toISOString().slice(0, 10) }); }}
                  >
                    Allocate
                  </Button>
                ),
              },
            ]}
            rows={roomFor?.rooms ?? []}
            empty="No rooms yet — add the first room above."
          />
        </div>
      </Modal>

      {/* ------------------------------------------------- allocate bed */}
      <Modal
        open={allocFor !== null}
        onClose={() => setAllocFor(null)}
        title={`Allocate — Room ${allocFor?.roomNo ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAllocFor(null)} disabled={allocBusy}>{t('cancel')}</Button>
            <Button onClick={allocate} loading={allocBusy}>{allocBusy ? 'Allocating…' : 'Allocate bed'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Student" required>
              <Select value={allocForm.studentId} onChange={(e) => setAllocForm({ ...allocForm, studentId: e.target.value })}>
                <option value="">—</option>
                {students.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Bed no.">
            <Input value={allocForm.bedNo} onChange={(e) => setAllocForm({ ...allocForm, bedNo: e.target.value })} placeholder="A1" />
          </Field>
          <Field label="From" required>
            <DateInput value={allocForm.from} onChange={(e) => setAllocForm({ ...allocForm, from: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

/* ======================================================= complaints */

function ComplaintsTab() {
  const { t, digits, fmtAd } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ body: '' });
  const [saving, setSaving] = useState(false);

  const [resolveFor, setResolveFor] = useState<any>(null);
  const [resolution, setResolution] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<any>('/hostel/complaints', status ? { status } : undefined);
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!form.body.trim()) {
      toast.push('Describe the complaint', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/hostel/complaints', { body: form.body.trim() });
      toast.push('Complaint filed', 'success');
      setOpen(false);
      setForm({ body: '' });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Submit failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (r: any, newStatus: string) => {
    try {
      await api.patch(`/hostel/complaints/${r.id}`, { status: newStatus });
      toast.push(`Marked ${newStatus}`, 'success');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Update failed', 'error');
    }
  };

  const resolve = async () => {
    if (!resolveFor) return;
    try {
      await api.patch(`/hostel/complaints/${resolveFor.id}`, {
        status: 'resolved',
        resolution: resolution || null,
      });
      toast.push('Resolved', 'success');
      setResolveFor(null);
      setResolution('');
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Update failed', 'error');
    }
  };

  const tone = (s: string) => (s === 'resolved' ? 'green' : s === 'rejected' ? 'red' : s === 'in_progress' ? 'amber' : 'teal');

  return (
    <>
      <Toolbar>
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('refresh')}</Button>
        <Button size="sm" onClick={() => setOpen(true)}><MessageSquareWarning size={14} /> File complaint</Button>
        <span className="ml-auto text-xs text-slate-500">
          {digits(rows.filter((r) => r.status !== 'resolved' && r.status !== 'rejected').length)} unresolved
        </span>
      </Toolbar>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="p-4"><ErrorBlock message={error} onRetry={load} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No complaints recorded.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-800">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-[260px]">
                  <p className="text-sm text-slate-800 dark:text-slate-100">{r.body}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <Badge tone={tone(r.status)}>{r.status.replace(/_/g, ' ')}</Badge>{' '}
                    {fmtAd(r.createdAt)}{r.raisedByName ? ` · ${r.raisedByName}` : ''}
                  </p>
                  {r.resolution && (
                    <p className="mt-1 max-w-[560px] text-xs text-teal-700 dark:text-teal-300">Resolution: {r.resolution}</p>
                  )}
                </div>
                {r.status !== 'resolved' && r.status !== 'rejected' && (
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => updateStatus(r, 'in_progress')}>Start</Button>
                    <Button variant="teal" size="sm" onClick={() => { setResolveFor(r); setResolution(r.resolution ?? ''); }}>Resolve</Button>
                    <Button variant="secondary" size="sm" onClick={() => updateStatus(r, 'rejected')}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="File a complaint"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
            <Button onClick={submit} loading={saving}>{saving ? t('saving') : 'Submit'}</Button>
          </>
        }
      >
        <Field label="Complaint" required hint="Who it concerns, what happened, when">
          <Textarea rows={4} value={form.body} onChange={(e) => setForm({ body: e.target.value })} />
        </Field>
      </Modal>

      <Modal
        open={resolveFor !== null}
        onClose={() => setResolveFor(null)}
        title="Resolve complaint"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolveFor(null)}>{t('cancel')}</Button>
            <Button onClick={resolve}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">{resolveFor?.body}</p>
          <Field label="Resolution notes">
            <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
