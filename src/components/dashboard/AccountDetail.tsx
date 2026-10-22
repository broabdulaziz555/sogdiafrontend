'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CandlestickChart, Info, ShieldAlert } from 'lucide-react';
import { PageHead, Stat } from './PageHead';
import { EquityChart } from './Charts';
import { accountLabel } from './AccountCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, Meter, StatusBadge } from '@/components/ui/Primitives';
import { ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { SiteLink } from '@/components/ui/SiteLink';
import { useApi } from '@/hooks/useApi';
import { dateShort, dateTime, fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUsd, pnlClass, titleCase } from '@/lib/format';
import type { Account, AccountMetrics, EquityCurveResponse, HistoryOrder, HistoryResponse, Position, PositionsResponse, RiskState } from '@/lib/types';

interface Detail { account: Account; metrics: AccountMetrics; risk: RiskState }

function DdMeter({ label, used, limitPct, remaining }: { label: string; used: number; limitPct: number; remaining: number }) {
  const ratio = limitPct ? (used / limitPct) * 100 : 0;
  const tone = ratio >= 80 ? 'down' : ratio >= 50 ? 'warn' : 'up';
  return (
    <div>
      <div className="mb-2 flex items-end justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="num font-mono text-xs text-muted">{fmtPct(used)} of {limitPct}% used</span>
      </div>
      <Meter value={ratio} tone={tone} className="h-2" />
      <p className="mt-1.5 text-xs text-subtle">Headroom <span className="num font-mono text-fg">{fmtUsd(remaining)}</span></p>
    </div>
  );
}

export function AccountDetail({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useApi<Detail>(`/accounts/${id}`, undefined, { refreshInterval: 10_000 });
  const curve = useApi<EquityCurveResponse>(`/accounts/${id}/equity-curve`, { limit: 500 });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const open = useApi<PositionsResponse>('/trade/positions', { account_id: id }, { refreshInterval: (d) => (d?.positions?.length ? 4000 : 12_000), revalidateOnFocus: true });
  const hist = useApi<HistoryResponse>('/trade/history', { account_id: id, limit: pageSize, offset: page * pageSize, status: 'closed' });

  const back = (
    <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />All accounts</Link>
  );

  if (error && !data) return <>{back}<div className="rounded-2xl card"><ErrorState error={error} onRetry={() => mutate()} title="Could not load this account" /></div></>;
  if (isLoading && !data) {
    return (
      <>
        {back}
        <Skeleton className="mb-6 h-9 w-64" />
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-72 rounded-xl" />
      </>
    );
  }
  if (!data) return null;

  const { account: a, metrics: m, risk } = data;
  const pnl = a.balance - a.size;
  const points = curve.data?.points ?? [];

  const cols: Column<HistoryOrder>[] = [
    { key: 'time', header: 'Closed', cell: (o) => <span className="num text-muted">{dateTime(o.closed_at)}</span>, sortValue: (o) => o.closed_at ? new Date(o.closed_at).getTime() : 0, searchText: (o) => o.closed_at ?? '' },
    { key: 'symbol', header: 'Symbol', cell: (o) => <span className="font-medium">{o.symbol.replace('USDT', '')}<span className="text-subtle">/USDT</span></span>, sortValue: (o) => o.symbol, searchText: (o) => o.symbol },
    { key: 'side', header: 'Side', cell: (o) => <Badge tone={o.side === 'long' ? 'up' : 'down'}>{o.side} {o.leverage}×</Badge>, sortValue: (o) => o.side, searchText: (o) => o.side },
    { key: 'entry', header: 'Entry', align: 'right', hideBelow: 'md', cell: (o) => <span className="num font-mono">{fmtPrice(o.entry_price)}</span>, sortValue: (o) => o.entry_price },
    { key: 'exit', header: 'Exit', align: 'right', hideBelow: 'md', cell: (o) => <span className="num font-mono">{fmtPrice(o.close_price)}</span>, sortValue: (o) => o.close_price },
    { key: 'size', header: 'Size', align: 'right', hideBelow: 'lg', cell: (o) => <span className="num font-mono">{fmtUsd(o.position_size)}</span>, sortValue: (o) => o.position_size },
    { key: 'reason', header: 'Reason', hideBelow: 'lg', cell: (o) => <span className="text-muted">{titleCase(o.close_reason ?? 'manual')}</span>, sortValue: (o) => o.close_reason, searchText: (o) => o.close_reason ?? '' },
    { key: 'pnl', header: 'PnL', align: 'right', cell: (o) => <span className={`num font-mono font-medium ${pnlClass(o.pnl)}`}>{fmtSigned(o.pnl)}</span>, sortValue: (o) => o.pnl },
  ];

  const stats = hist.data?.stats;
  const openRows = open.data?.positions ?? [];
  const openPnl = openRows.reduce((t, x) => t + x.unrealized_pnl, 0);
  const openCols: Column<Position>[] = [
    { key: 'symbol', header: 'Symbol', cell: (o) => <span className="font-medium">{o.symbol.replace('USDT', '')}<span className="text-subtle">/USDT</span></span>, sortValue: (o) => o.symbol },
    { key: 'side', header: 'Side', cell: (o) => <Badge tone={o.side === 'long' ? 'up' : 'down'}>{o.side === 'long' ? 'long' : 'short'} {o.leverage}×</Badge>, sortValue: (o) => o.side },
    { key: 'size', header: 'Size', align: 'right', hideBelow: 'md', cell: (o) => <span className="num font-mono">{fmtUsd(o.position_size)}</span>, sortValue: (o) => o.position_size },
    { key: 'entry', header: 'Entry', align: 'right', cell: (o) => <span className="num font-mono">{fmtPrice(o.entry_price)}</span>, sortValue: (o) => o.entry_price },
    { key: 'mark', header: 'Current', align: 'right', hideBelow: 'md', cell: (o) => <span className="num font-mono">{fmtPrice(o.mark_price)}</span>, sortValue: (o) => o.mark_price },
    { key: 'liq', header: 'Liq.', align: 'right', hideBelow: 'lg', cell: (o) => <span className="num font-mono text-down">{fmtPrice(o.liquidation_price)}</span>, sortValue: (o) => o.liquidation_price },
    { key: 'time', header: 'Opened', hideBelow: 'lg', cell: (o) => <span className="num text-muted">{dateTime(o.created_at)}</span>, sortValue: (o) => new Date(o.created_at).getTime() },
    { key: 'pnl', header: 'Profit', align: 'right', cell: (o) => <span className={`num font-mono font-medium ${pnlClass(o.unrealized_pnl)}`}>{fmtSigned(o.unrealized_pnl)}</span>, sortValue: (o) => o.unrealized_pnl },
  ];

  return (
    <>
      {back}
      <PageHead
        title={accountLabel(a)}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /><span className="font-mono text-xs">#{a.id.slice(0, 8)}</span><span>Opened {dateShort(a.created_at)}</span></span>}
        actions={a.status === 'active' ? (
          <SiteLink site="trade" path={`/?account=${a.id}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-110">
            <CandlestickChart className="h-4 w-4" />Open in terminal
          </SiteLink>
        ) : undefined}
      />

      {(risk.breached || a.status === 'failed' || a.status === 'breached') && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-down/30 bg-down/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-down" />
          <div>
            <p className="font-medium text-down">Account {a.status}</p>
            <p className="text-muted">{risk.reason ? `Reason: ${titleCase(risk.reason)}.` : 'This account is no longer tradable.'} Open positions were closed at market.</p>
          </div>
        </div>
      )}
      {a.status === 'passed' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-up/30 bg-up/10 p-4 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-up" /><p>Evaluation passed — an Evaluation Passed certificate has been issued. Find it under Certificates.</p></div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance" value={fmtUsd(a.balance)} sub={<span className={pnlClass(pnl)}>{fmtSigned(pnl)} vs size</span>} />
        <Stat label="Equity" value={fmtUsd(m.equity)} sub={<span className={pnlClass(m.unrealized_pnl)}>{fmtSigned(m.unrealized_pnl)} unrealised</span>} />
        <Stat label="Free margin" value={fmtUsd(m.free_margin)} sub={`${fmtUsd(m.used_margin)} used · ${m.open_positions} open`} />
        <Stat label="Profit target" value={a.profit_target_pct != null ? fmtPct(m.profit_pct) : 'None'} sub={a.profit_target_pct != null ? `of ${a.profit_target_pct}% · goal ${fmtUsd(m.profit_target)}` : 'Instant accounts have no target'} tone={m.target_reached ? 'up' : undefined} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="rounded-2xl card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-md font-semibold">Equity curve</h2>
            <span className="text-xs text-subtle">{points.length} snapshots</span>
          </div>
          {curve.isLoading && !curve.data ? <Skeleton className="h-64" /> : curve.error ? <ErrorState error={curve.error} onRetry={() => curve.mutate()} compact /> : points.length < 2 ? (
            <p className="py-16 text-center text-sm text-muted">Not enough history yet — the curve builds as you close trades.</p>
          ) : (
            <EquityChart
              points={points}
              size={a.size}
              dailyFloor={m.daily_dd_limit}
              maxFloor={m.max_dd_limit}
              target={a.profit_target_pct != null ? m.profit_target : undefined}
            />
          )}
        </section>

        <section className="space-y-6 rounded-2xl card p-5">
          <h2 className="text-md font-semibold">Drawdown</h2>
          <DdMeter label="Daily" used={m.daily_dd_used_pct} limitPct={a.daily_dd_pct} remaining={m.daily_dd_remaining} />
          <DdMeter label="Maximum" used={m.max_dd_used_pct} limitPct={a.max_dd_pct} remaining={m.max_dd_remaining} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
            {[
              ['Daily floor', fmtUsd(m.daily_dd_limit)],
              ['Max floor', fmtUsd(m.max_dd_limit)],
              ['Leverage', `${a.max_leverage}×`],
              ['Payout split', `${a.payout_split_pct}%`],
              ['Payout cycle', `${a.payout_cycle_days}d`],
              ['Next payout', dateShort(a.next_payout_at)],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs text-subtle">{k}</dt><dd className="num font-mono">{v}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-md font-semibold">Open positions{openRows.length ? <span className="ml-2 num text-xs font-normal text-muted">{openRows.length} open · <span className={pnlClass(openPnl)}>{fmtSigned(openPnl)}</span></span> : null}</h2>
          {a.status === 'active' && <SiteLink site="trade" path={`/?account=${a.id}`} className="text-xs font-medium text-accent hover:underline">Manage or close in terminal →</SiteLink>}
        </div>
        <DataTable
          columns={openCols}
          rows={open.data ? openRows : undefined}
          rowKey={(o) => o.id}
          loading={open.isLoading}
          error={open.error}
          onRetry={() => open.mutate()}
          empty={{ title: 'No open positions', description: 'Positions you open in the terminal appear here with live profit.' }}
          initialSort={{ key: 'time', dir: 'desc' }}
        />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-md font-semibold">Trade history</h2>
          {stats && (
            <p className="text-xs text-muted">
              <span className="num">{stats.trades}</span> trades · win rate <span className="num text-fg">{fmtNum(stats.win_rate)}%</span> · net <span className={`num font-medium ${pnlClass(stats.net_pnl)}`}>{fmtSigned(stats.net_pnl)}</span>
            </p>
          )}
        </div>
        <DataTable
          columns={cols}
          rows={hist.data?.orders}
          rowKey={(o) => o.id}
          loading={hist.isLoading}
          error={hist.error}
          onRetry={() => hist.mutate()}
          searchPlaceholder="Search this page — symbol, side, reason"
          empty={{ title: 'No closed trades yet', description: 'Closed positions will be listed here with entry, exit and realised PnL.' }}
          initialSort={{ key: 'time', dir: 'desc' }}
          server={{ total: hist.data?.total ?? 0, page, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize, query: q, onQueryChange: setQ, clientSearch: true }}
          footerNote={q ? <span className="text-subtle">Search filters the current page</span> : undefined}
        />
      </section>
    </>
  );
}
