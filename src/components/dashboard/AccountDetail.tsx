'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CandlestickChart, CheckCircle2, CircleDashed, Info, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Stat } from './PageHead';
import { EquityChart } from './Charts';
import { accountLabel } from './AccountCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, CopyButton, StatusBadge } from '@/components/ui/Primitives';
import { ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { SiteLink } from '@/components/ui/SiteLink';
import { useApi } from '@/hooks/useApi';
import { dateShort, dateTime, fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUsd, pnlClass, titleCase } from '@/lib/format';
import type { Account, AccountMetrics, EquityCurveResponse, HistoryOrder, HistoryResponse, Position, PositionsResponse, RiskState } from '@/lib/types';

interface Detail { account: Account; metrics: AccountMetrics; risk: RiskState }

type ObjState = 'done' | 'progress' | 'ok' | 'failed';
interface Objective { title: string; hint: string; state: ObjState; pct: number; value: string; foot: string; tone: 'accent' | 'risk' }

/** One trading objective: status icon, title, value, progress bar and what is left. */
function ObjectiveRow({ o }: { o: Objective }) {
  const Icon = o.state === 'done' ? CheckCircle2 : o.state === 'failed' ? XCircle : o.state === 'ok' ? ShieldCheck : CircleDashed;
  const iconCls = o.state === 'done' ? 'text-up' : o.state === 'failed' ? 'text-down' : o.state === 'ok' ? 'text-up' : 'text-warn';
  const bar = o.tone === 'accent'
    ? (o.state === 'done' ? 'bg-up' : 'bg-accent')
    : (o.state === 'failed' || o.pct >= 80 ? 'bg-down' : o.pct >= 50 ? 'bg-warn' : 'bg-up');
  return (
    <li>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', iconCls)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{o.title}</p>
            <p className="num shrink-0 font-mono text-xs text-muted">{o.value}</p>
          </div>
          <p className="text-2xs text-subtle">{o.hint}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(o.pct)} aria-label={o.title}>
            <div className={cn('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${Math.max(o.pct, o.pct > 0 ? 2 : 0)}%` }} />
          </div>
          <p className={cn('mt-1 text-2xs', o.state === 'failed' ? 'text-down' : 'text-muted')}>{o.state === 'failed' ? 'Breached' : o.foot}</p>
        </div>
      </div>
    </li>
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
  // saved snapshots + the live figure, so the chart (and its headline) always ends at "now"
  const saved = curve.data?.points ?? [];
  const points = saved.length ? [...saved, { equity: m.equity, balance: a.balance, taken_at: new Date().toISOString() }] : saved;

  const cols: Column<HistoryOrder>[] = [
    { key: 'time', header: 'Closed', cell: (o) => <span className="num text-muted">{dateTime(o.closed_at)}</span>, sortValue: (o) => o.closed_at ? new Date(o.closed_at).getTime() : 0, searchText: (o) => o.closed_at ?? '' },
    { key: 'symbol', header: 'Symbol', cell: (o) => <span className="font-medium">{o.symbol.replace('USDT', '')}<span className="text-subtle">/USDT</span></span>, sortValue: (o) => o.symbol, searchText: (o) => o.symbol },
    { key: 'side', header: 'Side', cell: (o) => <Badge tone={o.side === 'long' ? 'up' : 'down'}><span translate="no">{o.side} {o.leverage}×</span></Badge>, sortValue: (o) => o.side, searchText: (o) => o.side },
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
    { key: 'side', header: 'Side', cell: (o) => <Badge tone={o.side === 'long' ? 'up' : 'down'}><span translate="no">{o.side === 'long' ? 'long' : 'short'} {o.leverage}×</span></Badge>, sortValue: (o) => o.side },
    { key: 'size', header: 'Size', align: 'right', hideBelow: 'md', cell: (o) => <span className="num font-mono">{fmtUsd(o.position_size)}</span>, sortValue: (o) => o.position_size },
    { key: 'entry', header: 'Entry', align: 'right', cell: (o) => <span className="num font-mono">{fmtPrice(o.entry_price)}</span>, sortValue: (o) => o.entry_price },
    { key: 'mark', header: 'Current', align: 'right', hideBelow: 'md', cell: (o) => <span className="num font-mono">{fmtPrice(o.mark_price)}</span>, sortValue: (o) => o.mark_price },
    { key: 'liq', header: 'Liq.', align: 'right', hideBelow: 'lg', cell: (o) => <span className="num font-mono text-down">{fmtPrice(o.liquidation_price)}</span>, sortValue: (o) => o.liquidation_price },
    { key: 'time', header: 'Opened', hideBelow: 'lg', cell: (o) => <span className="num text-muted">{dateTime(o.created_at)}</span>, sortValue: (o) => new Date(o.created_at).getTime() },
    { key: 'pnl', header: 'Profit', align: 'right', cell: (o) => <span className={`num font-mono font-medium ${pnlClass(o.unrealized_pnl)}`}>{fmtSigned(o.unrealized_pnl)}</span>, sortValue: (o) => o.unrealized_pnl },
  ];

  const todayPnl = m.equity - a.daily_start_balance;
  const failed = a.status === 'failed' || a.status === 'breached';
  const passed = a.status === 'passed' || m.target_reached;
  const goal = a.profit_target_pct != null ? a.size * (a.profit_target_pct / 100) : null;
  const profit = m.equity - a.size;
  const dailyLimitUsd = a.size * (a.daily_dd_pct / 100);
  const maxLimitUsd = a.size * (a.max_dd_pct / 100);
  const minDays = a.min_trading_days ?? 0;
  const days = stats?.trading_days ?? 0;

  const objectives: Objective[] = [
    ...(goal != null ? [{
      title: `Profit target ${a.profit_target_pct}%`, hint: `Reach ${fmtUsd(a.size + goal)} equity`,
      state: (passed ? 'done' : failed ? 'failed' : 'progress') as ObjState,
      pct: Math.max(0, Math.min(100, (profit / goal) * 100)),
      value: `${fmtSigned(profit)} / ${fmtUsd(goal)}`, foot: passed ? 'Target reached' : `${fmtUsd(Math.max(0, goal - profit))} to go`, tone: 'accent' as const,
    }] : []),
    {
      title: `Max daily loss ${a.daily_dd_pct}%`, hint: 'From the day\'s starting equity, resets 00:00 UTC',
      state: (failed && risk.reason === 'DAILY_DRAWDOWN' ? 'failed' : 'ok') as ObjState,
      pct: Math.min(100, a.daily_dd_pct ? (m.daily_dd_used_pct / a.daily_dd_pct) * 100 : 0),
      value: `${fmtUsd(dailyLimitUsd * Math.min(1, a.daily_dd_pct ? m.daily_dd_used_pct / a.daily_dd_pct : 0))} / ${fmtUsd(dailyLimitUsd)}`, foot: `${fmtUsd(m.daily_dd_remaining)} left today · floor ${fmtUsd(m.daily_dd_limit)}`, tone: 'risk' as const,
    },
    {
      title: `Max loss ${a.max_dd_pct}%`, hint: 'From the initial account size',
      state: (failed && risk.reason === 'MAX_DRAWDOWN' ? 'failed' : 'ok') as ObjState,
      pct: Math.min(100, a.max_dd_pct ? (m.max_dd_used_pct / a.max_dd_pct) * 100 : 0),
      value: `${fmtUsd(maxLimitUsd * Math.min(1, a.max_dd_pct ? m.max_dd_used_pct / a.max_dd_pct : 0))} / ${fmtUsd(maxLimitUsd)}`, foot: `${fmtUsd(m.max_dd_remaining)} left · floor ${fmtUsd(m.max_dd_limit)}`, tone: 'risk' as const,
    },
    ...(minDays > 0 ? [{
      title: `Minimum ${minDays} trading days`, hint: 'Days with at least one closed trade',
      state: (days >= minDays ? 'done' : failed ? 'failed' : 'progress') as ObjState,
      pct: Math.min(100, (days / minDays) * 100), value: `${days} / ${minDays}`, foot: days >= minDays ? 'Requirement met' : `${minDays - days} more`, tone: 'accent' as const,
    }] : []),
  ];

  const statItems: [string, React.ReactNode, string?][] = stats ? [
    ['Win rate', `${fmtNum(stats.win_rate, 1)}%`, `${stats.wins} W · ${stats.losses} L`],
    ['Profit factor', stats.profit_factor == null ? '—' : fmtNum(stats.profit_factor, 2)],
    ['Net PnL', <span key="n" className={pnlClass(stats.net_pnl)}>{fmtSigned(stats.net_pnl)}</span>],
    ['Expectancy', <span key="e" className={pnlClass(stats.expectancy ?? 0)}>{fmtSigned(stats.expectancy ?? 0)}</span>, 'per trade'],
    ['Average win', <span key="aw" className="text-up">{fmtSigned(stats.avg_win ?? 0)}</span>],
    ['Average loss', <span key="al" className="text-down">{fmtSigned(stats.avg_loss ?? 0)}</span>],
    ['Best trade', <span key="b" className={pnlClass(stats.best_trade ?? 0)}>{fmtSigned(stats.best_trade ?? 0)}</span>],
    ['Worst trade', <span key="w" className={pnlClass(stats.worst_trade ?? 0)}>{fmtSigned(stats.worst_trade ?? 0)}</span>],
    ['Trades', String(stats.trades), `${stats.longs ?? 0} long · ${stats.shorts ?? 0} short`],
    ['Trading days', String(stats.trading_days ?? 0)],
    ['Win streak', String(stats.max_win_streak ?? 0), 'longest'],
    ['Loss streak', String(stats.max_loss_streak ?? 0), 'longest'],
  ] : [];

  return (
    <>
      {back}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{accountLabel(a)}</h1>
            <StatusBadge status={a.status} />
            <Badge tone={a.type === 'instant' ? 'accent' : 'neutral'} className="capitalize">{a.profit_target_pct != null ? 'Evaluation' : 'Funded'}</Badge>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="num font-mono text-xs">#{a.id.slice(0, 8)}</span><CopyButton value={a.id} label="Copy account ID" /></span>
            <span>Started {dateShort(a.created_at)}</span>
            {a.next_payout_at && <span>Next payout {dateShort(a.next_payout_at)}</span>}
          </p>
        </div>
        {a.status === 'active' && (
          <SiteLink site="trade" path={`/?account=${a.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[rgb(154_226_84)] px-4 text-sm font-semibold text-accent-fg shadow-btn transition hover:brightness-105">
            <CandlestickChart className="h-4 w-4" />Open terminal
          </SiteLink>
        )}
      </header>

      {(risk.breached || failed) && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-down/30 bg-down/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-down" />
          <div>
            <p className="font-medium text-down">Account {a.status}</p>
            <p className="text-muted">{risk.reason ? `Reason: ${titleCase(risk.reason)}.` : a.breach_reason ? a.breach_reason : 'This account is no longer tradable.'} Open positions were closed at market.</p>
          </div>
        </div>
      )}
      {a.status === 'passed' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-up/30 bg-up/10 p-4 text-sm"><Info className="mt-0.5 h-4 w-4 shrink-0 text-up" /><p>Evaluation passed — your certificate has been issued. Find it under Certificates.</p></div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance" value={fmtUsd(a.balance)} sub={<span className={pnlClass(pnl)}>{fmtSigned(pnl)} ({fmtPct((pnl / a.size) * 100, 2, true)})</span>} />
        <Stat label="Equity" value={fmtUsd(m.equity)} sub={<span className={pnlClass(m.unrealized_pnl)}>{fmtSigned(m.unrealized_pnl)} unrealised</span>} />
        <Stat label="Today's P&L" value={<span className={pnlClass(todayPnl)}>{fmtSigned(todayPnl)}</span>} sub="Since 00:00 UTC" />
        <Stat label="Free margin" value={fmtUsd(m.free_margin)} sub={`${fmtUsd(m.used_margin)} used · ${m.open_positions} open`} />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-md font-semibold">Performance</h2>
            <span className="text-xs text-subtle">{points.length} snapshots</span>
          </div>
          {curve.isLoading && !curve.data ? <Skeleton className="h-72" /> : curve.error ? <ErrorState error={curve.error} onRetry={() => curve.mutate()} compact /> : points.length < 2 ? (
            <p className="py-16 text-center text-sm text-muted">Not enough history yet — the curve builds as you close trades.</p>
          ) : (
            <EquityChart points={points} size={a.size} dailyFloor={m.daily_dd_limit} maxFloor={m.max_dd_limit} target={goal != null ? a.size + goal : undefined} />
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="mb-1 text-md font-semibold">Trading objectives</h2>
          <p className="mb-4 text-xs text-subtle">Measured on equity, live.</p>
          <ul className="space-y-4">{objectives.map((o) => <ObjectiveRow key={o.title} o={o} />)}</ul>
        </section>
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card p-4 sm:p-5">
          <h2 className="mb-4 text-md font-semibold">Statistics</h2>
          {!stats ? <Skeleton className="h-40" /> : stats.trades === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Statistics appear after your first closed trade.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
              {statItems.map(([k, v, sub]) => (
                <div key={k} className="bg-panel px-3.5 py-3">
                  <dt className="text-xs text-subtle">{k}</dt>
                  <dd className="num mt-1 font-mono text-[15px] font-semibold">{v}</dd>
                  {sub && <dd className="mt-0.5 text-2xs text-subtle">{sub}</dd>}
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="mb-4 text-md font-semibold">Account details</h2>
          <dl className="divide-y divide-line/70 text-sm">
            {[
              ['Account size', fmtUsd(a.size)],
              ['Max leverage', `1:${a.max_leverage}`],
              ['Profit split', `${a.payout_split_pct}%`],
              ['Payout cycle', `Every ${a.payout_cycle_days} days`],
              ['Next payout', dateShort(a.next_payout_at)],
              ['Daily loss floor', fmtUsd(m.daily_dd_limit)],
              ['Max loss floor', fmtUsd(m.max_dd_limit)],
              ['Started', dateShort(a.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2.5"><dt className="text-muted">{k}</dt><dd className="num font-mono font-medium">{v}</dd></div>
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
