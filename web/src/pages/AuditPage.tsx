import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PageHeader, Toolbar, Panel, LoadingBlock, ErrorBlock } from '../components/page';
import { Button, Badge, Table, Input, Select, StatCard } from '../lib/ui';

interface AuditRow {
  id: string;
  userId?: string | null;
  schoolId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
  ip?: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const { t, digits, fmtAd } = useI18n();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.list<AuditRow>('/schools/audit-logs');
      setRows(r.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    const hay = `${r.action} ${r.entity} ${r.entityId ?? ''} ${JSON.stringify(r.detail ?? {})}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (!action || r.action === action);
  });

  const actions = [...new Set(rows.map((r) => r.action))].sort();

  return (
    <>
      <PageHeader
        title={t('auditLogs')}
        subtitle="Platform-wide audit trail — every create/update/delete, login and broadcast is recorded"
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} /> {t('refresh')}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('total')} value={digits(rows.length)} accent="navy" icon={<ShieldCheck size={18} />} />
        <StatCard label="Creates" value={digits(rows.filter((r) => r.action.startsWith('create') || r.action === 'issue_certificate').length)} accent="teal" />
        <StatCard label="Updates" value={digits(rows.filter((r) => r.action.startsWith('update') || r.action.startsWith('status')).length)} accent="amber" />
        <StatCard label="Deletes" value={digits(rows.filter((r) => r.action.startsWith('delete') || r.action.startsWith('deactivate')).length)} accent="red" />
      </div>

      <Toolbar>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('search')}…`} />
        </div>
        <Select className="w-auto min-w-[180px]" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">{t('all')} — {t('actions')}</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
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
                  key: 'createdAt',
                  header: t('date'),
                  render: (r) => <span className="whitespace-nowrap text-xs">{fmtAd(r.createdAt)}</span>,
                },
                {
                  key: 'action',
                  header: t('actions'),
                  render: (r) => (
                    <Badge tone={r.action.includes('delete') || r.action.includes('deactivat') ? 'red' : r.action.includes('create') || r.action.includes('issue') ? 'green' : r.action.includes('login') ? 'navy' : 'amber'}>
                      {r.action}
                    </Badge>
                  ),
                },
                { key: 'entity', header: 'Entity', render: (r) => <span className="font-medium">{r.entity}</span> },
                {
                  key: 'entityId',
                  header: 'ID',
                  render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.entityId ? r.entityId.slice(0, 8) : '—'}</span>,
                },
                {
                  key: 'detail',
                  header: t('details'),
                  render: (r) => (
                    <span className="block max-w-[320px] truncate font-mono text-[11px] text-slate-500" title={JSON.stringify(r.detail ?? {})}>
                      {r.detail ? JSON.stringify(r.detail) : '—'}
                    </span>
                  ),
                },
                { key: 'userId', header: 'User', render: (r) => <span className="font-mono text-[11px]">{r.userId ? r.userId.slice(0, 8) : '—'}</span> },
                { key: 'ip', header: 'IP', render: (r) => <span className="text-xs text-slate-500">{r.ip ?? '—'}</span> },
              ]}
              rows={filtered}
              empty={`${t('noData')} — ${t('auditLogs')}`}
            />
          </div>
        )}
      </Panel>
    </>
  );
}
