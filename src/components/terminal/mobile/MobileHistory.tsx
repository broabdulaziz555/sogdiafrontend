'use client';

import { memo, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, History, Search, Share2, X } from 'lucide-react';
import { get } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, fmtNum, fmtPrice, fmtSigned, pnlClass, qtyDecimals, shortId } from '@/lib/format';
import type { HistoryOrder, HistoryResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useTerminalData } from '../data';
import { REASON, TypeTag, sym } from '../PositionsPanel';
import { useTerminal } from '../store';

const SIZE = 20;
type Filter = 'all' | 'win' | 'loss';
type Sort = 'new' | 'old' | 'best' | 'worst';

function Stat({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="min-w-0 rounded-lg card px-2.5 py-2"><dt className="truncate text-2xs text-subtle">{k}</dt><dd className="num truncate font-mono text-md font-semibold">{children}</dd></div>;
}

function MobileHistoryInner() {
  const { accountId } = useTerminalData();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('new');
  const set = useTerminal((s) => s.set);

  const { data, error, isLoading, mutate } = useSWR<HistoryResponse>(
    ['terminal-history', accountId, page, SIZE],
    () => get<HistoryResponse>('/trade/history', { account_id: accountId, limit: SIZE, offset: page * SIZE, status: 'closed' }),
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 5000 },
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let l = (data?.orders ?? []).filter((o) => (filter === 'all' || (filter === 'win' ? o.pnl > 0 : o.pnl < 0)) && (!needle || `${o.symbol} ${o.side} ${o.id} ${o.close_reason ?? ''}`.toLowerCase().includes(needle)));
    l = [...l].sort((a, b) => {
      if (sort === 'best') return b.pnl - a.pnl;
      if (sort === 'worst') return a.pnl - b.pnl;
      const ta = a.closed_at ? Date.parse(a.closed_at) : 0, tb = b.closed_at ? Date.parse(b.closed_at) : 0;
      return sort === 'new' ? tb - ta : ta - tb;
    });
    return l;
  }, [data, q, filter, sort]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const stats = data?.stats;

  return (
    <div className="pb-6">
      <dl className="grid grid-cols-2 gap-2 p-2">
        {stats ? (<>
          <Stat k="Net profit"><span className={pnlClass(stats.net_pnl)}>{fmtSigned(stats.net_pnl)}</span></Stat>
          <Stat k="Win rate">{fmtNum(stats.win_rate, 1)}%</Stat>
          <Stat k="Trades">{stats.trades}</Stat>
          <Stat k="Wins / Losses">{stats.wins} / {stats.losses}</Stat>
        </>) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </dl>

      <div className="space-y-2 px-2 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol, ticket, reason" aria-label="Search trade history" className="h-11 w-full rounded-lg card pl-9 pr-9 text-base placeholder:text-subtle focus:border-accent focus:outline-none" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-subtle"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex items-center gap-2">
          <Segmented<Filter> size="sm" ariaLabel="Result filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'win', label: 'Wins' }, { value: 'loss', label: 'Losses' }]} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort trades" className="ml-auto h-9 rounded-lg card px-2 text-sm focus:border-accent focus:outline-none">
            <option value="new">Newest</option><option value="old">Oldest</option><option value="best">Best profit</option><option value="worst">Worst profit</option>
          </select>
        </div>
      </div>

      <div className="px-2">
        {error && !data ? <ErrorState compact error={error} onRetry={() => void mutate()} title="Could not load history" />
          : isLoading && !data ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          : rows.length === 0 ? (
            <EmptyState compact icon={<History className="h-5 w-5" />} title={data?.orders.length ? 'No trades match' : 'No closed trades yet'}
              description={data?.orders.length ? 'Change the filter or search on this page.' : 'Settled trades, partial closes and liquidations appear here.'} />
          ) : (
            <ul className="space-y-2">
              {rows.map((o: HistoryOrder) => (
                <li key={o.id} className="rounded-xl card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-md font-semibold">{sym(o.symbol)}</span><TypeTag side={o.side} /><span className="num text-2xs text-subtle">{o.leverage}×</span>
                        {o.close_reason && o.close_reason !== 'manual' && <span className={cn('rounded border px-1.5 py-px text-2xs font-medium ', o.close_reason === 'liquidation' ? 'border-down/30 bg-down/10 text-down' : o.close_reason === 'take_profit' ? 'border-up/30 bg-up/10 text-up' : 'border-warn/30 bg-warn/10 text-warn')}>{REASON[o.close_reason] ?? o.close_reason}</span>}
                      </div>
                      <p className="mt-0.5 text-2xs text-subtle">#{shortId(o.id)} · {dateTime(o.closed_at)}</p>
                    </div>
                    <p className={cn('num font-mono text-lg font-semibold leading-tight', pnlClass(o.pnl))}>{fmtSigned(o.pnl)}</p>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-2 text-sm">
                    <div className="min-w-0"><dt className="text-2xs text-subtle">Volume</dt><dd className="num truncate font-mono">{o.entry_price ? fmtNum(o.position_size / o.entry_price, qtyDecimals(o.entry_price) + 1) : '—'}</dd></div>
                    <div className="min-w-0"><dt className="text-2xs text-subtle">Price</dt><dd className="num truncate font-mono">{fmtPrice(o.entry_price)}</dd></div>
                    <div className="min-w-0"><dt className="text-2xs text-subtle">Close</dt><dd className="num truncate font-mono">{fmtPrice(o.close_price)}</dd></div>
                  </dl>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-2xs text-subtle">Opened {dateTime(o.created_at)}</p>
                    <Button size="sm" variant="secondary" icon={<Share2 className="h-3.5 w-3.5" />} onClick={() => set({ tradeCard: { id: o.id, label: `${sym(o.symbol)} ${o.side === 'long' ? 'Long' : 'Short'}`, live: false, data: { symbol: o.symbol, side: o.side, leverage: o.leverage, entry: o.entry_price, exit: o.close_price, pnl: o.pnl, margin: o.margin, size: o.position_size, opened: o.created_at, closed: o.closed_at, reason: o.close_reason } } })}>Trade card</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      {total > SIZE && (
        <nav aria-label="History pages" className="mt-3 flex items-center justify-between gap-2 px-2">
          <Button variant="secondary" icon={<ChevronLeft className="h-4 w-4" />} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
          <p className="num text-xs text-muted">{page * SIZE + 1}–{Math.min(total, (page + 1) * SIZE)} of {total}</p>
          <Button variant="secondary" iconRight={<ChevronRight className="h-4 w-4" />} disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </nav>
      )}
    </div>
  );
}

export const MobileHistory = memo(MobileHistoryInner);
