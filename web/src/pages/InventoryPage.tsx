import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, History, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import CrudPage, { type CrudColumn, type FieldDef } from '../components/CrudPage';
import { PageHeader, Tabs, Panel, Toolbar, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Modal, Field, Input, Select, Textarea, useToast, StatCard } from '../lib/ui';
import { DateInput } from '../components/DateInput';

const CATEGORIES = [
  'furniture', 'computer', 'projector', 'laboratory', 'sports', 'library',
  'teaching_material', 'office', 'vehicle', 'building', 'other',
];
const CONDITIONS = ['good', 'fair', 'damaged', 'lost'];
const MOVEMENT_TYPES = ['purchase', 'distribute', 'return', 'repair', 'transfer', 'dispose', 'lost'];

export default function InventoryPage() {
  const [tab, setTab] = useState('assets');
  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Fixed assets with purchase cost, warranty, condition and a full movement history"
      />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'assets', label: 'Assets' },
          { key: 'movements', label: 'Recent movements' },
        ]}
      />
      {tab === 'assets' && <AssetsTab />}
      {tab === 'movements' && <MovementsTab />}
    </>
  );
}

/* ============================================================= assets */

function AssetsTab() {
  const { t, digits, npr, fmtAd } = useI18n();
  const toast = useToast();
  const [historyFor, setHistoryFor] = useState<any>(null);

  const columns: CrudColumn[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span> },
    {
      key: 'name',
      header: 'Asset',
      render: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-slate-500">{r.supplier ?? '—'}{r.location ? ` · ${r.location}` : ''}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => <Badge tone="navy">{String(r.category).replace(/_/g, ' ')}</Badge> },
    { key: 'quantity', header: 'Qty', render: (r) => `${digits(r.quantity)} ${r.unit ?? 'pcs'}` },
    { key: 'purchaseCost', header: 'Unit cost', render: (r) => npr(r.purchaseCost) },
    { key: 'condition', header: 'Condition', render: (r) => <Badge tone={r.condition === 'good' ? 'green' : r.condition === 'fair' ? 'amber' : 'red'}>{r.condition}</Badge> },
    { key: 'warrantyUntil', header: 'Warranty', render: (r) => (r.warrantyUntil ? <span className="text-xs">{fmtAd(r.warrantyUntil)}</span> : '—') },
    {
      key: '__h',
      header: '',
      align: 'right',
      render: (r) => (
        <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setHistoryFor(r); }}>
          <History size={13} /> History
        </Button>
      ),
    },
  ];

  const fields: FieldDef[] = [
    { name: 'code', label: 'Asset code', required: true, placeholder: 'AST-001' },
    { name: 'name', label: 'Name', required: true },
    { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, ' ') })) },
    { name: 'quantity', label: 'Quantity', type: 'number', min: 1, max: 100000, required: true },
    { name: 'unit', label: 'Unit', placeholder: 'pcs' },
    { name: 'purchaseCost', label: 'Unit cost (NPR)', type: 'number', min: 0, max: 1000000000 },
    { name: 'purchaseDate', label: 'from', type: 'date', bsField: 'purchaseDateBs' },
    { name: 'supplier', label: 'Supplier' },
    { name: 'warrantyUntil', label: 'Warranty until', type: 'date' },
    { name: 'condition', label: 'Condition', type: 'select', options: CONDITIONS.map((c) => ({ value: c, label: c })) },
    { name: 'location', label: 'Location' },
    { name: 'assignedTo', label: 'Assigned to' },
    { name: 'depreciationRate', label: 'Depreciation %/yr', type: 'number', min: 0, max: 100 },
    { name: 'notes', label: 'notes', type: 'textarea', colSpan: 2 },
  ];

  return (
    <>
      <CrudPage
        endpoint="/inventory"
        title="Assets"
        subtitle="Everything the school owns, with cost and condition"
        columns={columns}
        fields={fields}
        defaultSort="name"
        defaultOrder="asc"
        createLabel="Add asset"
        mapIn={(v) => ({
          ...v,
          quantity: Number(v.quantity || 1),
          purchaseCost: Number(v.purchaseCost || 0),
          depreciationRate: Number(v.depreciationRate || 0),
          purchaseDate: v.purchaseDate || null,
          warrantyUntil: v.warrantyUntil || null,
        })}
      />
      <MovementModal asset={historyFor} onClose={() => setHistoryFor(null)} />
    </>
  );
}

/* ========================================================= movements */

function MovementModal({ asset, onClose }: { asset: any; onClose: () => void }) {
  const { t, npr, fmtAd, digits } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), type: 'distribute', quantity: '1', party: '', cost: '0', remarks: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!asset) return;
    setLoading(true);
    try {
      const r = await api.list<any>(`/inventory/${asset.id}/movements`);
      setRows(r.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [asset]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!form.quantity || Number(form.quantity) < 1) {
      toast.push('Quantity is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/inventory/${asset.id}/movements`, {
        date: form.date,
        type: form.type,
        quantity: Number(form.quantity),
        party: form.party || null,
        cost: Number(form.cost || 0),
        remarks: form.remarks || null,
      });
      toast.push('Movement recorded', 'success');
      setOpen(false);
      setForm({ ...form, party: '', cost: '0', remarks: '' });
      load();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={asset !== null} onClose={onClose} wide title={`History — ${asset?.name ?? ''}`} footer={<Button variant="secondary" onClick={onClose}>{t('close')}</Button>}>
      <div className="space-y-3">
        <Toolbar>
          <span className="text-xs text-slate-500">
            {asset?.code} · {digits(asset?.quantity ?? 0)} {asset?.unit ?? 'pcs'} · {npr(asset?.purchaseCost)} each
          </span>
          <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}><Plus size={14} /> Record movement</Button>
        </Toolbar>

        {loading ? (
          <LoadingBlock />
        ) : (
          <Table
            columns={[
              { key: 'date', header: 'Date', render: (r) => <span className="text-xs">{fmtAd(r.date)}</span> },
              { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'lost' || r.type === 'dispose' ? 'red' : r.type === 'repair' ? 'amber' : 'navy'}>{r.type}</Badge> },
              { key: 'quantity', header: 'Qty', render: (r) => digits(r.quantity) },
              { key: 'party', header: 'Party', render: (r) => r.party ?? '—' },
              { key: 'cost', header: 'Cost', render: (r) => (Number(r.cost) ? npr(r.cost) : '—') },
              { key: 'remarks', header: 'Remarks', render: (r) => <span className="block max-w-[220px] truncate">{r.remarks ?? '—'}</span> },
            ]}
            rows={rows}
            empty="No movements recorded yet."
          />
        )}

        {open && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-900 dark:bg-teal-900/20">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Date" required>
                <DateInput value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Type" required>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {MOVEMENT_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </Field>
              <Field label="Quantity" required>
                <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </Field>
              <Field label="Cost (NPR)">
                <Input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </Field>
              <Field label="Party (person / vendor)">
                <Input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} />
              </Field>
              <Field label="Remarks">
                <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </Field>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>{t('cancel')}</Button>
                <Button size="sm" onClick={add} loading={saving}>{t('save')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Global movements feed (all assets). */
function MovementsTab() {
  const { npr, fmtAd, digits } = useI18n();
  const [assets, setAssets] = useState<any[]>([]);
  const [entries, setEntries] = useState<Array<any & { assetName?: string; assetCode?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.list<any>('/inventory');
      const rows = list.data ?? [];
      setAssets(rows);
      const perAsset = await Promise.all(
        rows.slice(0, 40).map((a: any) =>
          api.list<any>(`/inventory/${a.id}/movements`).then((r) => (r.data ?? []).map((m: any) => ({ ...m, assetName: a.name, assetCode: a.code }))).catch(() => []),
        ),
      );
      const all = perAsset.flat().sort((x, y) => String(y.date).localeCompare(String(x.date)));
      setEntries(all.slice(0, 200));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load movements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalValue = assets.reduce((s, a) => s + Number(a.purchaseCost) * Number(a.quantity), 0);

  return (
    <>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Button>
        <span className="ml-auto text-xs text-slate-500">
          {digits(assets.length)} assets · book value <b>{npr(totalValue)}</b>
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
                { key: 'date', header: 'Date', render: (r) => <span className="text-xs">{fmtAd(r.date)}</span> },
                {
                  key: 'assetName',
                  header: 'Asset',
                  render: (r) => (
                    <div>
                      <p className="font-medium">{r.assetName}</p>
                      <p className="text-xs text-slate-500">{r.assetCode}</p>
                    </div>
                  ),
                },
                { key: 'type', header: 'Type', render: (r) => <Badge tone={r.type === 'lost' || r.type === 'dispose' ? 'red' : 'navy'}>{r.type}</Badge> },
                { key: 'quantity', header: 'Qty', render: (r) => digits(r.quantity) },
                { key: 'party', header: 'Party', render: (r) => r.party ?? '—' },
                { key: 'cost', header: 'Cost', render: (r) => (Number(r.cost) ? npr(r.cost) : '—') },
              ]}
              rows={entries}
              empty="No asset movements yet."
            />
          </div>
        )}
      </Panel>
    </>
  );
}
