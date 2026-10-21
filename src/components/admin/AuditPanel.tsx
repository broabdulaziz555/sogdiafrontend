'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { dateTime } from '@/lib/format';
import type { AuditLog } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Modal';
import { Badge, CopyButton, Input, Select } from '@/components/ui/Primitives';
import { KV, XTag, useDebounced } from './AdminKit';

const ACTIONS = [
  'account.gift', 'account.adjust', 'account.rules_override', 'account.freeze', 'account.unfreeze', 'account.breach', 'account.close', 'account.delete',
  'kyc.approve', 'kyc.reject', 'kyc.force', 'payout.approve', 'payout.reject', 'payout.paid', 'payout.force', 'certificate.manual',
  'user.role_change', 'user.impersonate', 'settings.update', 'promo.create', 'promo.update', 'promo.delete',
];

const tone = (a: string): 'down' | 'warn' | 'up' | 'info' | 'neutral' =>
  /delete|breach|reject|impersonate|role_change/.test(a) ? 'down' : /force|adjust|override|freeze|settings|close/.test(a) ? 'warn' : /approve|paid|create|gift|unfreeze/.test(a) ? 'up' : 'info';

interface Res { logs: AuditLog[]; total: number }

export function AuditPanel() {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [sel, setSel] = useState<AuditLog | null>(null);
  const dActor = useDebounced(actor.trim());
  const dTarget = useDebounced(target.trim());
  const { data, error, isLoading, mutate } = useApi<Res>('/xdepartment/audit', { action: action || undefined, actor_id: dActor || undefined, target_id: dTarget || undefined, limit: size, offset: page * size });

  const cols: Column<AuditLog>[] = useMemo(() => [
    { key: 'when', header: 'When', sortValue: (l) => Date.parse(l.created_at), cell: (l) => <span className="num whitespace-nowrap text-xs text-muted">{dateTime(l.created_at)}</span> },
    { key: 'action', header: 'Action', sortValue: (l) => l.action, searchText: (l) => `${l.action} ${l.actor_email} ${l.target_id} ${l.target_type}`, cell: (l) => <Badge tone={tone(l.action)}>{l.action}</Badge> },
    { key: 'actor', header: 'Actor', sortValue: (l) => l.actor_email, cell: (l) => <span className="block min-w-0"><span className="block truncate text-sm">{l.actor_email}</span><span className="text-2xs uppercase tracking-wider text-subtle">{l.actor_role}</span></span> },
    { key: 'target', header: 'Target', hideBelow: 'md', cell: (l) => <span className="font-mono text-xs"><span className="text-subtle">{l.target_type} </span>{l.target_id?.slice(0, 8)}</span> },
    { key: 'ip', header: 'IP', hideBelow: 'lg', cell: (l) => <span className="font-mono text-xs text-muted">{l.ip ?? '—'}</span> },
  ], []);

  const filtered = action || actor || target;

  return (
    <>
      <PageHead title="Audit logs" subtitle={<>Every staff write with actor, target, IP and before/after payload. <XTag className="ml-1" /></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Select aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</Select>
        <Input aria-label="Actor ID" placeholder="Actor user ID" value={actor} onChange={(e) => { setActor(e.target.value); setPage(0); }} className="font-mono text-xs" />
        <Input aria-label="Target ID" placeholder="Target ID (account, user…)" value={target} onChange={(e) => { setTarget(e.target.value); setPage(0); }} className="font-mono text-xs" />
        {filtered && <button onClick={() => { setAction(''); setActor(''); setTarget(''); setPage(0); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-muted hover:text-fg"><X className="h-3.5 w-3.5" />Clear</button>}
      </div>
      <DataTable<AuditLog>
        columns={cols} rows={data?.logs} rowKey={(l) => l.id} loading={isLoading && !data} error={error && !data ? error : undefined} onRetry={() => void mutate()}
        onRowClick={setSel} activeRowKey={sel?.id} searchPlaceholder="Search this page" pageSizes={[25, 50, 100]} initialSort={{ key: 'when', dir: 'desc' }}
        server={{ total: data?.total ?? 0, page, pageSize: size, onPageChange: setPage, onPageSizeChange: (n) => { setSize(n); setPage(0); }, query: q, onQueryChange: setQ, clientSearch: true }}
        empty={{ title: 'No log entries', description: filtered ? 'Nothing matches these filters.' : 'Staff actions will be recorded here.' }}
      />
      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel?.action} subtitle={sel ? dateTime(sel.created_at) : undefined} width="max-w-xl">
        {sel && (
          <div className="space-y-4 p-5">
            <dl className="divide-y divide-line rounded-xl border border-line px-4">
              <KV k="Actor" v={sel.actor_email} />
              <KV k="Actor role" v={sel.actor_role} />
              <KV k="Actor ID" v={<span className="inline-flex items-center gap-1.5">{sel.actor_id.slice(0, 8)}…<CopyButton value={sel.actor_id} /></span>} mono />
              <KV k="Target" v={`${sel.target_type}`} />
              <KV k="Target ID" v={<span className="inline-flex items-center gap-1.5 break-all">{sel.target_id}<CopyButton value={sel.target_id} /></span>} mono />
              <KV k="IP" v={sel.ip ?? '—'} mono />
              <KV k="Log ID" v={sel.id.slice(0, 8)} mono />
            </dl>
            <div>
              <div className="mb-1.5 flex items-center justify-between"><p className="label">Payload</p>{sel.payload && <CopyButton value={JSON.stringify(sel.payload, null, 2)} label="Copy JSON" />}</div>
              <pre className="max-h-[420px] overflow-auto rounded-xl border border-line bg-panel2 p-4 font-mono text-xs leading-relaxed">{sel.payload ? JSON.stringify(sel.payload, null, 2) : 'No payload'}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
