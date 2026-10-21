'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Search } from 'lucide-react';
import { get } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, fmtNum, fmtPrice, fmtSigned, fmtUsd, pnlClass } from '@/lib/format';
import type { HistoryOrder, HistoryResponse, PositionsResponse } from '@/lib/types';
import { PageHead } from '@/components/dashboard/PageHead';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input, StatusBadge, Tabs } from '@/components/ui/Primitives';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Section } from './AdminKit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trade lookup by account ID. The contract has no dedicated staff trades endpoint, so this reuses
 * GET /trade/history and /trade/positions with the target account_id. If the backend scopes those
 * to the caller, the error is shown instead of hiding it.
 */
export function TradesLookup() {
  const [input, setInput] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [tab, setTab] = useState<'history' | 'open'>('history');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [q, setQ] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('account');
    if (p && UUID.test(p)) { setInput(p); setId(p); }
  }, []);

  const hist = useSWR<HistoryResponse>(id && tab === 'history' ? ['staff-history', id, page, size] : null, () => get<HistoryResponse>('/trade/history', { account_id: id!, limit: size, offset: page * size, status: 'closed' }), { keepPreviousData: true, revalidateOnFocus: false });
  const open = useSWR<PositionsResponse>(id && tab === 'open' ? ['staff-open', id] : null, () => get<PositionsResponse>('/trade/positions', { account_id: id! }), { refreshInterval: 5000 });

  const submit = (e: React.FormEvent) => { e.preventDefault(); const v = input.trim(); if (UUID.test(v)) { setId(v); setPage(0); } };

  const histCols: Column<HistoryOrder>[] = useMemo(() => [
    { key: 'symbol', header: 'Symbol', sortValue: (o) => o.symbol, searchText: (o) => `${o.symbol} ${o.side} ${o.close_reason ?? ''}`, cell: (o) => <span className="font-medium">{o.symbol.replace('USDT', '/USDT')} <span className={cn('ml-1 text-2xs font-semibold uppercase', o.side === 'long' ? 'text-up' : 'text-down')}>{o.side}</span> <span className="num text-2xs text-subtle">{o.leverage}×</span></span> },
    { key: 'size', header: 'Size', align: 'right', hideBelow: 'md', sortValue: (o) => o.position_size, cell: (o) => <span className="num font-mono">{fmtNum(o.position_size)}</span> },
    { key: 'entry', header: 'Entry', align: 'right', hideBelow: 'sm', sortValue: (o) => o.entry_price, cell: (o) => <span className="num font-mono">{fmtPrice(o.entry_price)}</span> },
    { key: 'exit', header: 'Exit', align: 'right', hideBelow: 'sm', sortValue: (o) => o.close_price, cell: (o) => <span className="num font-mono">{fmtPrice(o.close_price)}</span> },
    { key: 'pnl', header: 'PnL', align: 'right', sortValue: (o) => o.pnl, cell: (o) => <span className={cn('num font-mono font-semibold', pnlClass(o.pnl))}>{fmtSigned(o.pnl)}</span> },
    { key: 'reason', header: 'Reason', hideBelow: 'lg', cell: (o) => <span className="text-xs text-muted">{o.close_reason ?? '—'}</span> },
    { key: 'dur', header: 'Held', align: 'right', hideBelow: 'lg', sortValue: (o) => (o.closed_at ? Date.parse(o.closed_at) - Date.parse(o.created_at) : 0), cell: (o) => { if (!o.closed_at) return '—'; const s = Math.round((Date.parse(o.closed_at) - Date.parse(o.created_at)) / 1000); return <span className="num font-mono text-xs text-muted">{s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`}</span>; } },
    { key: 'closed', header: 'Closed', align: 'right', sortValue: (o) => (o.closed_at ? Date.parse(o.closed_at) : 0), cell: (o) => <span className="num text-xs text-muted">{dateTime(o.closed_at)}</span> },
  ], []);

  return (
    <>
      <PageHead title="Trades" subtitle="Inspect an account’s trading activity — useful when reviewing abusive patterns before a breach." />
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Account ID (UUID)" aria-label="Account ID" className="pl-8 font-mono text-xs" spellCheck={false} /></div>
        <Button type="submit" variant="primary" disabled={!UUID.test(input.trim())}>Look up</Button>
      </form>
      {input.trim() && !UUID.test(input.trim()) && <p className="-mt-2 mb-3 text-2xs text-subtle">That doesn’t look like an account ID. Copy it from the Accounts page.</p>}

      {!id ? (
        <div className="rounded-xl border border-dashed border-line"><EmptyState title="Enter an account ID" description="Open the Accounts page, copy an account ID and paste it above." /></div>
      ) : (
        <>
          <Tabs className="mb-4" value={tab} onChange={(v) => { setTab(v); setPage(0); }} tabs={[{ value: 'history', label: 'Closed trades', count: hist.data?.total }, { value: 'open', label: 'Open positions', count: open.data?.positions.length }]} />
          {tab === 'history' ? (
            <>
              {hist.data?.stats && (
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {([['Trades', String(hist.data.stats.trades)], ['Win rate', `${fmtNum(hist.data.stats.win_rate)}%`], ['W / L', `${hist.data.stats.wins} / ${hist.data.stats.losses}`], ['Net PnL', fmtSigned(hist.data.stats.net_pnl)]] as const).map(([k, v]) => <div key={k} className="rounded-xl border border-line bg-panel px-4 py-3"><p className="label">{k}</p><p className="num mt-1 text-lg font-bold">{v}</p></div>)}
                </div>
              )}
              <DataTable<HistoryOrder> columns={histCols} rows={hist.data?.orders} rowKey={(o) => o.id} loading={hist.isLoading && !hist.data} error={hist.error && !hist.data ? hist.error : undefined} onRetry={() => void hist.mutate()}
                pageSizes={[25, 50, 100]} initialSort={{ key: 'closed', dir: 'desc' }} searchPlaceholder="Search this page"
                server={{ total: hist.data?.total ?? 0, page, pageSize: size, onPageChange: setPage, onPageSizeChange: (n) => { setSize(n); setPage(0); }, query: q, onQueryChange: setQ, clientSearch: true }}
                empty={{ title: 'No closed trades', description: 'This account has not closed any trades yet.' }} />
            </>
          ) : open.error && !open.data ? <div className="rounded-xl border border-line bg-panel"><ErrorState error={open.error} onRetry={() => open.mutate()} /></div> : (
            <Section title={open.data ? `${fmtUsd(open.data.metrics.equity)} equity · ${open.data.account.status}` : 'Open positions'} actions={open.data && <StatusBadge status={open.data.account.status} />}>
              <DataTable<PositionRow> bare columns={openCols} rows={open.data?.positions} rowKey={(p) => p.id} loading={open.isLoading && !open.data} pageSize={25} searchPlaceholder="Search positions" empty={{ title: 'No open positions' }} />
            </Section>
          )}
        </>
      )}
    </>
  );
}

type PositionRow = PositionsResponse['positions'][number];
const openCols: Column<PositionRow>[] = [
  { key: 'symbol', header: 'Symbol', sortValue: (p) => p.symbol, searchText: (p) => p.symbol, cell: (p) => <span className="font-medium">{p.symbol.replace('USDT', '/USDT')} <span className={cn('ml-1 text-2xs font-semibold uppercase', p.side === 'long' ? 'text-up' : 'text-down')}>{p.side}</span> <span className="num text-2xs text-subtle">{p.leverage}×</span></span> },
  { key: 'size', header: 'Size', align: 'right', sortValue: (p) => p.position_size, cell: (p) => <span className="num font-mono">{fmtNum(p.position_size)}</span> },
  { key: 'entry', header: 'Entry', align: 'right', hideBelow: 'sm', cell: (p) => <span className="num font-mono">{fmtPrice(p.entry_price)}</span> },
  { key: 'mark', header: 'Mark', align: 'right', hideBelow: 'sm', cell: (p) => <span className="num font-mono">{fmtPrice(p.mark_price)}</span> },
  { key: 'liq', header: 'Liq.', align: 'right', hideBelow: 'md', cell: (p) => <span className="num font-mono text-warn">{fmtPrice(p.liquidation_price)}</span> },
  { key: 'pnl', header: 'PnL', align: 'right', sortValue: (p) => p.unrealized_pnl, cell: (p) => <span className={cn('num font-mono font-semibold', pnlClass(p.unrealized_pnl))}>{fmtSigned(p.unrealized_pnl)}</span> },
  { key: 'opened', header: 'Opened', align: 'right', hideBelow: 'md', sortValue: (p) => Date.parse(p.created_at), cell: (p) => <span className="num text-xs text-muted">{dateTime(p.created_at)}</span> },
];
