'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError, errMsg, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtPrice, fmtSigned, fmtUsd } from '@/lib/format';
import type { Account, AccountMetrics, Position, Side } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTerminalData } from './data';
import { beep } from './sound';
import { useTerminal } from './store';
import { buildOptimistic } from './optimistic';

const floorCents = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/**
 * MetaTrader-style one-click panel that floats on the chart:
 *   [ SELL bid ]  [ margin ]  [ BUY ask ]
 * Uses the leverage set in the order ticket.
 */
function OneClickTradeInner({ className }: { className?: string }) {
  const toast = useToast();
  const { accountId, account, metrics, positions, refresh, applyOpened, applyClosed, addOptimistic, dropOptimistic } = useTerminalData();
  const [closing, setClosing] = useState(false);
  const symbol = useTerminal((s) => s.symbol);
  const px = useTerminal((s) => s.prices[s.symbol]);
  const lev = useTerminal((s) => s.leverage);
  const margin = useTerminal((s) => s.quickMargin);
  const confirmOrders = useTerminal((s) => s.confirmOrders);
  const soundOn = useTerminal((s) => s.soundOn);
  const set = useTerminal((s) => s.set);
    const [confirm, setConfirm] = useState<Side | null>(null);

  const base = symbol.replace('USDT', '');
  const leverage = Math.min(lev, Math.min(200, account?.max_leverage ?? 200));
  const free = metrics?.free_margin ?? account?.equity ?? 0;
  const tradable = account?.status === 'active';
  const m = margin.trim() === '' ? NaN : Number(margin);
  const problem = !tradable ? 'This account cannot open new positions.'
    : !px ? 'Waiting for a price…'
    : !Number.isFinite(m) || m < 1 ? 'Minimum margin is 1 USDT.'
    : m > free + 1e-9 ? `Exceeds free margin (${fmtUsd(free)}).`
    : null;

  const submit = useCallback((side: Side) => {
    setConfirm(null);
    const margin = floorCents(m);
    // Instant: show the position at the live market price now; the server's confirmed row replaces it on reply.
    const tmp = buildOptimistic({ accountId, symbol, side, leverage, margin });
    if (tmp) addOptimistic(tmp);
    post<{ order: Position; account?: Account; metrics?: AccountMetrics }>('/trade/open', { account_id: accountId, symbol, side, leverage, margin }, { timeoutMs: 30_000 })
      .then((res) => {
        applyOpened(res, tmp?.id);
        toast.success(`${side === 'long' ? 'Buy' : 'Sell'} ${base}/USDT`, `${leverage}× at ${fmtPrice(res.order.entry_price)} · margin ${fmtUsd(res.order.margin)}`);
        if (soundOn) beep(side === 'long' ? 'up' : 'down');
      }, (e) => {
        if (tmp) dropOptimistic(tmp.id);
        toast.error('Order rejected', `${errMsg(e)}${e instanceof ApiError && e.code ? ` [${e.code}]` : ''}`);
        void refresh(); // on a timeout the order may still have gone through; either way re-read the truth
      });
  }, [accountId, symbol, leverage, m, toast, base, soundOn, refresh, applyOpened, addOptimistic, dropOptimistic]);

  const mine = useMemo(() => positions.filter((p) => p.symbol === symbol && !p.id.startsWith('tmp-')), [positions, symbol]);
  const minePnl = mine.reduce((a, p) => a + p.unrealized_pnl, 0);
  const closeAll = async () => {
    if (!mine.length || closing) return;
    setClosing(true);
    const res = await Promise.allSettled(mine.map((p) => post<{ account?: Account; metrics?: AccountMetrics }>('/trade/close', { order_id: p.id }).then((r) => { applyClosed(p.id, r); return r; })));
    const failed = res.filter((r) => r.status === 'rejected').length;
    if (failed) { toast.warn('Some positions did not close', `${failed} of ${mine.length} failed — try again.`); void refresh(); }
    else toast.success(`${base}/USDT closed`, `${mine.length} position${mine.length > 1 ? 's' : ''} closed`);
    setClosing(false);
  };

  const request = (side: Side) => {
    if (problem) { toast.warn('Check the order', problem); return; }
    if (confirmOrders) setConfirm(side); else void submit(side);
  };

  return (
    <>
      <div className={cn('inline-flex items-stretch overflow-hidden rounded-2xl border border-line2/70 bg-panel/90 shadow-pop backdrop-blur-md', className)} role="group" aria-label="One-click trading">
        <button onClick={() => request('short')} disabled={!px} className="flex min-w-[92px] flex-col items-start justify-center bg-down px-3 py-1 text-white transition-[filter] hover:brightness-110 disabled:opacity-50" title="Sell at bid (market)">
          <span className="flex items-center gap-1 text-2xs font-semibold opacity-90">Sell</span>
          <span className="num font-mono text-sm font-semibold leading-tight">{px ? fmtPrice(px.bid) : '—'}</span>
        </button>
        <label className="flex w-[104px] flex-col justify-center border-x border-line px-2 py-0.5">
          <span className="text-2xs text-subtle">Margin · {leverage}×</span>
          <input
            inputMode="decimal" autoComplete="off" spellCheck={false} value={margin} aria-label="One-click margin in USDT"
            onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v)) set({ quickMargin: v }); }}
            className="num w-full bg-transparent font-mono text-sm outline-none"
          />
        </label>
        <button onClick={() => request('long')} disabled={!px} className="flex min-w-[92px] flex-col items-end justify-center bg-up px-3 py-1 text-black transition-[filter] hover:brightness-110 disabled:opacity-50" title="Buy at ask (market)">
          <span className="flex items-center gap-1 text-2xs font-semibold opacity-80">Buy</span>
          <span className="num font-mono text-sm font-semibold leading-tight">{px ? fmtPrice(px.ask) : '—'}</span>
        </button>
        {mine.length > 0 && (
          <button onClick={() => void closeAll()} disabled={closing} className="flex min-w-[88px] items-center justify-center gap-1.5 border-l border-line px-3 text-xs font-semibold transition-colors hover:bg-down/15 disabled:opacity-50" title={`Close ${mine.length} ${base} position${mine.length > 1 ? 's' : ''} at market`}>
            <X className="h-3.5 w-3.5 text-muted" />
            <span className="flex flex-col items-start leading-tight"><span>Close{mine.length > 1 ? ` ${mine.length}` : ''}</span><span className={cn('num text-2xs font-medium', minePnl >= 0 ? 'text-up' : 'text-down')}>{fmtSigned(minePnl)}</span></span>
          </button>
        )}
      </div>

      <Modal
        open={confirm !== null} onClose={() => setConfirm(null)} size="sm"
        title={`Confirm ${confirm === 'long' ? 'buy' : 'sell'} · ${base}/USDT`}
        footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm === 'long' ? 'up' : 'down'} onClick={() => confirm && submit(confirm)} data-autofocus>Confirm</Button></>}
      >
        <div className="space-y-2 p-5 text-sm">
          <div className="flex justify-between"><span className="text-muted">Margin</span><span className="num font-mono">{fmtUsd(floorCents(m))}</span></div>
          <div className="flex justify-between"><span className="text-muted">Leverage</span><span className="num font-mono">{leverage}×</span></div>
          <div className="flex justify-between"><span className="text-muted">Position size</span><span className="num font-mono">{fmtUsd(floorCents(m) * leverage)}</span></div>
          <div className="flex justify-between"><span className="text-muted">Price</span><span className="num font-mono">{px ? fmtPrice(confirm === 'long' ? px.ask : px.bid) : '—'}</span></div>
        </div>
      </Modal>
    </>
  );
}

export const OneClickTrade = memo(OneClickTradeInner);
