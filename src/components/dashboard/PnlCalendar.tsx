'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { PageHead, Stat } from './PageHead';
import { accountLabel } from './AccountCard';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Primitives';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAccounts, useAllHistory } from '@/hooks/useAccounts';
import { fmtNum, fmtSigned, fmtUsd, pnlClass } from '@/lib/format';
import type { HistoryOrder } from '@/lib/types';
import { cn } from '@/lib/cn';

interface Day { date: string; pnl: number; trades: number; wins: number; losses: number; best: number; worst: number }

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function aggregate(orders: HistoryOrder[]): Map<string, Day> {
  const map = new Map<string, Day>();
  for (const o of orders) {
    if (!o.closed_at) continue;
    const k = o.closed_at.slice(0, 10); // UTC day — matches the 00:00 UTC risk reset
    const d = map.get(k) ?? { date: k, pnl: 0, trades: 0, wins: 0, losses: 0, best: -Infinity, worst: Infinity };
    d.pnl += o.pnl;
    d.trades += 1;
    if (o.pnl > 0) d.wins += 1; else if (o.pnl < 0) d.losses += 1;
    d.best = Math.max(d.best, o.pnl);
    d.worst = Math.min(d.worst, o.pnl);
    map.set(k, d);
  }
  return map;
}

export function PnlCalendar() {
  const { accounts, error: accErr, isLoading: accLoading, mutate: accMutate } = useAccounts();
  const [accountId, setAccountId] = useState<string | null>(null);
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getUTCFullYear(), m: now.getUTCMonth() });

  useEffect(() => {
    if (!accountId && accounts?.length) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const { data, error, isLoading, mutate } = useAllHistory(accountId);
  const days = useMemo(() => aggregate(data?.orders ?? []), [data]);

  const month = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7; // Monday-first
    const cells: ({ d: number; data?: Day } | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ d, data: days.get(key(cursor.y, cursor.m, d)) });
    while (cells.length % 7) cells.push(null);

    const traded = cells.filter((c): c is { d: number; data: Day } => !!c?.data);
    const net = traded.reduce((s, c) => s + c.data.pnl, 0);
    const maxAbs = Math.max(1, ...traded.map((c) => Math.abs(c.data.pnl)));
    const weeks: { pnl: number; trades: number }[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const w = cells.slice(i, i + 7).filter((c): c is { d: number; data: Day } => !!c?.data);
      weeks.push({ pnl: w.reduce((s, c) => s + c.data.pnl, 0), trades: w.reduce((s, c) => s + c.data.trades, 0) });
    }
    return {
      cells, weeks, maxAbs, net,
      tradingDays: traded.length,
      winDays: traded.filter((c) => c.data.pnl > 0).length,
      lossDays: traded.filter((c) => c.data.pnl < 0).length,
      trades: traded.reduce((s, c) => s + c.data.trades, 0),
      best: traded.length ? Math.max(...traded.map((c) => c.data.pnl)) : 0,
      worst: traded.length ? Math.min(...traded.map((c) => c.data.pnl)) : 0,
    };
  }, [cursor, days]);

  const shift = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const title = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const isThisMonth = cursor.y === now.getUTCFullYear() && cursor.m === now.getUTCMonth();
  const todayKey = key(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const loading = (isLoading && !data) || (accLoading && !accounts);

  return (
    <>
      <PageHead
        title="PnL Calendar"
        subtitle="Realised profit and loss by trading day. Days roll over at 00:00 UTC, matching the risk engine."
        actions={
          accounts?.length ? (
            <Select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value)} aria-label="Account" className="h-9 w-auto min-w-[200px]">
              {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)} · #{a.id.slice(0, 6)}</option>)}
            </Select>
          ) : undefined
        }
      />

      {accErr && !accounts ? (
        <div className="rounded-2xl border border-line bg-panel"><ErrorState error={accErr} onRetry={() => accMutate()} /></div>
      ) : accounts && accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line"><EmptyState icon={<CalendarX2 className="h-5 w-5" />} title="No accounts yet" description="Your PnL calendar appears once you have an account with closed trades." /></div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-xl" />) : (
              <>
                <Stat label="Month PnL" value={fmtSigned(month.net)} tone={month.net > 0 ? 'up' : month.net < 0 ? 'down' : undefined} className="col-span-2 lg:col-span-1" />
                <Stat label="Trading days" value={month.tradingDays} sub={`${month.winDays}W · ${month.lossDays}L`} />
                <Stat label="Trades" value={month.trades} />
                <Stat label="Best day" value={fmtSigned(month.best)} tone={month.best > 0 ? 'up' : undefined} />
                <Stat label="Worst day" value={fmtSigned(month.worst)} tone={month.worst < 0 ? 'down' : undefined} />
              </>
            )}
          </div>

          <section className="rounded-2xl border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <h2 className="text-md font-semibold">{title}</h2>
              <div className="flex items-center gap-1.5">
                {!isThisMonth && <Button size="sm" variant="ghost" onClick={() => setCursor({ y: now.getUTCFullYear(), m: now.getUTCMonth() })}>Today</Button>}
                <Button size="sm" variant="secondary" aria-label="Previous month" onClick={() => shift(-1)} icon={<ChevronLeft className="h-4 w-4" />} className="px-2" />
                <Button size="sm" variant="secondary" aria-label="Next month" onClick={() => shift(1)} icon={<ChevronRight className="h-4 w-4" />} className="px-2" />
              </div>
            </div>

            {error && !data ? (
              <ErrorState error={error} onRetry={() => mutate()} />
            ) : (
              <div className="p-3 sm:p-5">
                <div className="grid grid-cols-7 gap-1.5 md:grid-cols-[repeat(7,minmax(0,1fr))_minmax(88px,0.9fr)] md:gap-2">
                  {DOW.map((d) => <div key={d} className="px-1 pb-1 text-center text-2xs font-medium uppercase tracking-wider text-subtle">{d}</div>)}
                  <div className="hidden px-1 pb-1 text-center text-2xs font-medium uppercase tracking-wider text-subtle md:block">Week</div>

                  {loading
                    ? Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="aspect-[1/0.9] min-h-[56px] rounded-lg md:min-h-[84px]" />)
                    : month.cells.flatMap((c, i) => {
                        const col = i % 7;
                        const out: React.ReactNode[] = [];
                        if (!c) out.push(<div key={`e${i}`} className="aspect-[1/0.9] min-h-[56px] rounded-lg bg-fg/[0.02] md:min-h-[84px]" aria-hidden />);
                        else {
                          const d = c.data;
                          const k = key(cursor.y, cursor.m, c.d);
                          const intensity = d ? 0.14 + 0.36 * Math.min(1, Math.abs(d.pnl) / month.maxAbs) : 0;
                          const win = d && d.pnl > 0;
                          const loss = d && d.pnl < 0;
                          out.push(
                            <div
                              key={k}
                              tabIndex={d ? 0 : -1}
                              aria-label={d ? `${k}: ${fmtSigned(d.pnl)} USD from ${d.trades} trade${d.trades === 1 ? '' : 's'}` : `${k}: no trades`}
                              style={d && (win || loss) ? { backgroundColor: `rgb(var(${win ? '--up' : '--down'}) / ${intensity})` } : undefined}
                              className={cn(
                                'group relative aspect-[1/0.9] min-h-[56px] rounded-lg border p-1.5 transition-all md:min-h-[84px] md:p-2.5',
                                d ? 'cursor-default border-transparent hover:z-20 hover:scale-[1.04] hover:shadow-pop focus-visible:z-20 focus-visible:scale-[1.04]' : 'border-line/60 bg-panel2/40',
                                d && !win && !loss && 'border-line bg-fg/[0.05]',
                                k === todayKey && 'ring-1 ring-accent',
                              )}
                            >
                              <span className={cn('num text-2xs font-medium md:text-xs', d ? 'text-fg/80' : 'text-subtle')}>{c.d}</span>
                              {d && (
                                <div className="absolute inset-x-1.5 bottom-1.5 md:inset-x-2.5 md:bottom-2">
                                  <p className={cn('num truncate font-mono text-xs font-bold leading-tight md:text-sm', win ? 'text-up' : loss ? 'text-down' : 'text-muted')}>{fmtSigned(d.pnl, Math.abs(d.pnl) >= 1000 ? 0 : 2)}</p>
                                  <p className="hidden text-2xs text-fg/60 md:block">{d.trades} trade{d.trades === 1 ? '' : 's'}</p>
                                </div>
                              )}

                              {d && (
                                <div
                                  role="tooltip"
                                  className={cn(
                                    'pointer-events-none invisible absolute bottom-[calc(100%+8px)] z-30 w-52 rounded-xl border border-line bg-panel p-3 text-left opacity-0 shadow-pop transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100',
                                    col <= 1 ? 'left-0' : col >= 5 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                                  )}
                                >
                                  <p className="text-xs text-subtle">{new Date(`${k}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
                                  <p className={cn('num mt-1 font-mono text-lg font-bold', pnlClass(d.pnl))}>{fmtSigned(d.pnl)} <span className="text-xs font-medium text-subtle">USD</span></p>
                                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 text-xs">
                                    <dt className="text-subtle">Trades</dt><dd className="num text-right font-mono">{d.trades}</dd>
                                    <dt className="text-subtle">Wins / losses</dt><dd className="num text-right font-mono">{d.wins} / {d.losses}</dd>
                                    <dt className="text-subtle">Best trade</dt><dd className="num text-right font-mono text-up">{fmtSigned(d.best)}</dd>
                                    <dt className="text-subtle">Worst trade</dt><dd className="num text-right font-mono text-down">{fmtSigned(d.worst)}</dd>
                                  </dl>
                                </div>
                              )}
                            </div>,
                          );
                        }
                        if (col === 6) {
                          const w = month.weeks[Math.floor(i / 7)];
                          out.push(
                            <div key={`w${i}`} className="hidden min-h-[84px] flex-col justify-center rounded-lg border border-line bg-panel2/60 p-2.5 md:flex">
                              <p className="text-2xs uppercase tracking-wider text-subtle">Wk {Math.floor(i / 7) + 1}</p>
                              <p className={cn('num font-mono text-sm font-bold', w.trades ? pnlClass(w.pnl) : 'text-subtle')}>{w.trades ? fmtSigned(w.pnl) : '—'}</p>
                              <p className="text-2xs text-subtle">{w.trades} trade{w.trades === 1 ? '' : 's'}</p>
                            </div>,
                          );
                        }
                        return out;
                      })}
                </div>

                {!loading && month.trades === 0 && (
                  <p className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3 text-sm text-muted"><CalendarX2 className="h-4 w-4" />No closed trades in {title}.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel2/50 px-4 py-3 text-xs text-muted sm:px-5">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-up/40" />Profit</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-down/40" />Loss</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-line bg-panel2" />No trades</span>
              </div>
              {data?.truncated ? (
                <span className="flex items-center gap-1.5 text-warn"><Info className="h-3.5 w-3.5" />Showing the most recent 3,000 trades</span>
              ) : (
                <span>Net total <span className={cn('num font-mono font-medium', pnlClass(data?.orders.reduce((s, o) => s + o.pnl, 0)))}>{fmtUsd(data?.orders.reduce((s, o) => s + o.pnl, 0) ?? 0)}</span> · {fmtNum(data?.orders.length ?? 0, 0)} closed trades</span>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
