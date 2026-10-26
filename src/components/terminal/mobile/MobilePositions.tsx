'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Plus, Share2, SlidersHorizontal, X } from 'lucide-react';
import { errMsg, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateTime, fmtNum, fmtPrice, fmtSigned, fmtUsd, pnlClass, qtyDecimals, shortId } from '@/lib/format';
import type { Position } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { AccountPanel } from '../AccountPanel';
import { Flash } from '../Flash';
import { useTerminalData } from '../data';
import { PnlHint, ProtectionModal, SideTag, TypeTag, pnlAtPos, sym } from '../PositionsPanel';
import { beep } from '../sound';
import { useTerminal, type PendingOrder } from '../store';

type Sub = 'open' | 'pending';

function Cell({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}><dt className="text-2xs text-subtle">{k}</dt><dd className="num truncate font-mono text-sm">{children}</dd></div>;
}

function MobilePositionsInner() {
  const toast = useToast();
  const { positions, loading, error, refresh, accountId, closePositions, cancelPending: removePending } = useTerminalData();
  const setSymbol = useTerminal((s) => s.setSymbol);
  const set = useTerminal((s) => s.set);
  const soundOn = useTerminal((s) => s.soundOn);
  const allPending = useTerminal((s) => s.pending);
  const prices = useTerminal((s) => s.prices);
  const pending = useMemo(() => allPending.filter((o) => o.accountId === accountId), [allPending, accountId]);

  const [sub, setSub] = useState<Sub>('open');
  const [editing, setEditing] = useState<Position | null>(null);
  const [partialFor, setPartialFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  /** Two-tap confirm: first tap arms the button for 3.5s, second tap executes. */
  const arm = (key: string, run: () => void) => {
    if (armed === key) { clearTimeout(timer.current); setArmed(null); run(); return; }
    setArmed(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(null), 3500);
  };

  const close = useCallback(async (p: Position, percent: number) => {
    setBusy(p.id); setPartialFor(null);
    try {
      if (percent >= 100) {
        const [o] = await closePositions([p.id]);
        if (o?.ok && !o.res) { void refresh(); return; }
        if (!o?.ok || !o.res) throw o?.error ?? new Error('Close failed');
        const r = o.res;
        toast.success(`${sym(p.symbol)} closed`, `${fmtSigned(r.order.pnl)} USDT at ${fmtPrice(r.order.close_price)}`);
        if (soundOn) beep(r.order.pnl >= 0 ? 'up' : 'down');
      } else {
        const r = await post<{ closed: { pnl: number; close_price: number } }>('/trade/partial-close', { order_id: p.id, percent });
        toast.success(`${percent}% of ${sym(p.symbol)} closed`, `${fmtSigned(r.closed.pnl)} USDT at ${fmtPrice(r.closed.close_price)}`);
      }
      await refresh();
    } catch (e) { toast.error('Close failed', errMsg(e)); } finally { setBusy(null); }
  }, [toast, refresh, soundOn, closePositions]);

  const closeAll = useCallback(async () => {
    setBusy('all');
    const real = positions;
    const res = await closePositions(real.map((p) => p.id));
    const failed = res.filter((r) => !r.ok).length;
    if (failed) toast.warn('Some positions did not close', `${failed} of ${real.length} failed — try again.`);
    else toast.success('All positions closed');
    await refresh();
    setBusy(null);
  }, [positions, toast, refresh, closePositions]);

  const share = (p: Position) => set({ tradeCard: { id: p.id, label: `${sym(p.symbol)} ${p.side === 'long' ? 'Long' : 'Short'}`, live: true, data: { symbol: p.symbol, side: p.side, leverage: p.leverage, entry: p.entry_price, exit: p.mark_price, pnl: p.unrealized_pnl, margin: p.margin, size: p.position_size, opened: p.created_at, closed: null } } });

  const total = positions.reduce((a, p) => a + p.unrealized_pnl, 0);
  const goTrade = () => set({ mobileTab: 'chart' });

  return (
    <div className="pb-4">
      <Tabs<Sub> className="bg-panel px-3 pt-2" value={sub} onChange={setSub}
        tabs={[{ value: 'open', label: 'Open positions', count: positions.length }, { value: 'pending', label: 'Pending orders', count: pending.length }]} />

      {sub === 'open' && (
        <div className="space-y-2 p-2">
          {error && positions.length === 0 ? <ErrorState compact error={error} onRetry={() => void refresh()} title="Could not load positions" />
            : loading && positions.length === 0 ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
            : positions.length === 0 ? (
              <EmptyState compact icon={<Plus className="h-5 w-5" />} title="No open positions" description="Open a Long or Short from the chart. Positions update every two seconds."
                action={<Button variant="primary" onClick={goTrade}>Open a trade</Button>} />
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-muted">{positions.length} open · <span className={cn('num font-mono font-semibold', pnlClass(total))}>{fmtSigned(total)}</span> USDT</p>
                  {positions.length > 1 && (
                    <Button size="sm" variant="danger" loading={busy === 'all'} onClick={() => arm('all', () => void closeAll())}>
                      {armed === 'all' ? 'Tap to confirm' : `Close all (${positions.length})`}
                    </Button>
                  )}
                </div>
                <ul className="space-y-2">
                  {positions.map((p) => {
                    const key = `${p.id}:100`;
                    return (
                      <li key={p.id} className="rounded-xl card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => { setSymbol(p.symbol); goTrade(); }} className="text-md font-semibold hover:text-accent">{sym(p.symbol)}</button>
                              <TypeTag side={p.side} /><span className="num text-2xs text-subtle">{p.leverage}×</span>
                            </div>
                            <p className="mt-0.5 text-2xs text-subtle">#{shortId(p.id)} · {dateTime(p.created_at)}</p>
                          </div>
                          <div className="text-right">
                            <p className={cn('num font-mono text-lg font-semibold leading-tight', pnlClass(p.unrealized_pnl))}>{fmtSigned(p.unrealized_pnl)}</p>
                            <p className={cn('num font-mono text-2xs', pnlClass(p.unrealized_pnl))}>{fmtSigned(p.unrealized_pnl_pct, 1)}%</p>
                          </div>
                        </div>

                        <dl className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2">
                          <Cell k="Volume">{fmtNum(p.quantity, qtyDecimals(p.entry_price) + 1)}</Cell>
                          <Cell k="Price">{fmtPrice(p.entry_price)}</Cell>
                          <Cell k="Current"><Flash value={p.mark_price}>{fmtPrice(p.mark_price)}</Flash></Cell>
                          <Cell k="S / L"><button onClick={() => setEditing(p)} className="text-warn">{p.stop_loss ? <>{fmtPrice(p.stop_loss)}<PnlHint v={pnlAtPos(p, p.stop_loss)} /></> : <span className="text-subtle">Set</span>}</button></Cell>
                          <Cell k="T / P"><button onClick={() => setEditing(p)} className="text-up">{p.take_profit ? <>{fmtPrice(p.take_profit)}<PnlHint v={pnlAtPos(p, p.take_profit)} /></> : <span className="text-subtle">Set</span>}</button></Cell>
                          <Cell k="Liq."><span className="text-warn">{fmtPrice(p.liquidation_price)}</span></Cell>
                        </dl>

                        <div className="mt-3 flex items-center gap-2">
                          <Button size="md" variant="danger" className="h-11 flex-1 text-base" loading={busy === p.id || p.pending} onClick={() => arm(key, () => void close(p, 100))}>
                            {armed === key ? 'Tap again to close' : 'Close position'}
                          </Button>
                          <Button size="md" variant={partialFor === p.id ? 'outline' : 'secondary'} className="h-11 w-11 px-0" onClick={() => setPartialFor(partialFor === p.id ? null : p.id)} aria-expanded={partialFor === p.id} aria-label="More actions"><MoreHorizontal className="h-5 w-5" /></Button>
                        </div>

                        {partialFor === p.id && (
                          <div className="mt-2 space-y-2 rounded-lg border border-line bg-panel2 p-2" role="group" aria-label="More actions">
                            <div className="grid grid-cols-3 gap-2">
                              {[25, 50, 75].map((n) => {
                                const k = `${p.id}:${n}`;
                                return <Button key={n} size="md" variant={armed === k ? 'danger' : 'secondary'} className="h-10" disabled={busy === p.id} onClick={() => arm(k, () => void close(p, n))}>{armed === k ? 'Confirm' : `Close ${n}%`}</Button>;
                              })}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Button size="md" variant="secondary" className="h-10" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setEditing(p)}>Stop-loss / Take-profit</Button>
                              <Button size="md" variant="secondary" className="h-10" icon={<Share2 className="h-4 w-4" />} onClick={() => share(p)}>Trade card</Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
        </div>
      )}

      {sub === 'pending' && (
        <div className="space-y-2 p-2">
          {pending.length === 0 ? (
            <EmptyState compact title="No pending orders" description="Place a Limit or Stop order from the Trade tab to see it here."
              action={<Button variant="secondary" onClick={() => set({ mobileTab: 'trade' })}>Go to Trade</Button>} />
          ) : (
            <>
              <ul className="space-y-2">
                {pending.map((o: PendingOrder) => {
                  const px = prices[o.symbol];
                  return (
                    <li key={o.id} className="rounded-xl card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5"><span className="text-md font-semibold">{sym(o.symbol)}</span><SideTag side={o.side} /><span className="rounded border border-info/30 bg-info/10 px-1.5 py-0.5 text-2xs font-medium text-info">{o.status === 'working' ? o.kind : o.status}</span></div>
                        <Button size="md" variant="ghost" className="h-9" icon={<X className="h-3.5 w-3.5" />} disabled={o.status === 'filling'} onClick={() => removePending(o.id)}>Cancel</Button>
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-2">
                        <Cell k="Trigger">{fmtPrice(o.trigger)}</Cell>
                        <Cell k="Market">{px ? fmtPrice(o.side === 'long' ? px.ask : px.bid) : '—'}</Cell>
                        <Cell k="Margin">{fmtNum(o.margin)}</Cell>
                        <Cell k="Lev.">{o.leverage}×</Cell>
                        <Cell k="S / L"><span className="text-warn">{o.sl ? fmtPrice(o.sl) : '—'}</span></Cell>
                        <Cell k="T / P"><span className="text-up">{o.tp ? fmtPrice(o.tp) : '—'}</span></Cell>
                      </dl>
                      {o.error && <p role="alert" className="mt-2 text-xs text-down">{o.error}</p>}
                    </li>
                  );
                })}
              </ul>
              <p className="px-1 text-2xs text-subtle">Limit and stop orders live in this browser and fire as market orders only while the terminal is open.</p>
            </>
          )}
        </div>
      )}

      <AccountPanel />
      <ProtectionModal pos={editing} onClose={() => setEditing(null)} onDone={() => void refresh()} />
    </div>
  );
}

export const MobilePositions = memo(MobilePositionsInner);
