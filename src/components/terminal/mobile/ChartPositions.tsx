'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { errMsg, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice, fmtSigned, pnlClass, qtyDecimals } from '@/lib/format';
import type { Position } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { useTerminalData } from '../data';
import { TypeTag, sym } from '../PositionsPanel';
import { beep } from '../sound';
import { useTerminal } from '../store';

/**
 * Open positions shown right under the chart (like the MetaTrader mobile "Trade" strip): symbol, side, volume,
 * live profit and a two-tap Close on every row. Collapsible so the chart can use the full height.
 */
function ChartPositionsInner() {
  const toast = useToast();
  const { positions, refresh } = useTerminalData();
  const setSymbol = useTerminal((s) => s.setSymbol);
  const current = useTerminal((s) => s.symbol);
  const soundOn = useTerminal((s) => s.soundOn);
  const set = useTerminal((s) => s.set);
  const [open, setOpen] = useState(true);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const total = positions.reduce((a, p) => a + p.unrealized_pnl, 0);

  const close = async (p: Position) => {
    setBusy(p.id);
    try {
      const r = await post<{ order: { pnl: number; close_price: number } }>('/trade/close', { order_id: p.id });
      toast.success(`${sym(p.symbol)} closed`, `${fmtSigned(r.order.pnl)} USDT at ${fmtPrice(r.order.close_price)}`);
      if (soundOn) beep(r.order.pnl >= 0 ? 'up' : 'down');
      await refresh();
    } catch (e) { toast.error('Close failed', errMsg(e)); } finally { setBusy(null); }
  };
  const press = (p: Position) => {
    if (armed === p.id) { clearTimeout(timer.current); setArmed(null); void close(p); return; }
    setArmed(p.id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(null), 3500);
  };

  return (
    <section className="shrink-0 border-t border-line bg-panel" aria-label="Open positions">
      <div className="flex items-center">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 flex-1 items-center justify-between gap-2 px-3 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold">Positions <span className="num rounded bg-fg/[0.07] px-1.5 text-2xs text-muted">{positions.length}</span></span>
          <span className="flex items-center gap-2"><span className={cn('num font-mono text-sm font-semibold', pnlClass(total))}>{positions.length ? fmtSigned(total) : '—'}</span>{open ? <ChevronDown className="h-4 w-4 text-subtle" /> : <ChevronUp className="h-4 w-4 text-subtle" />}</span>
        </button>
        <button onClick={() => set({ mobileTab: 'positions' })} className="h-11 shrink-0 border-l border-line px-3 text-xs font-medium text-accent">All</button>
      </div>
      {open && (
        <ul className="max-h-[34dvh] divide-y divide-line overflow-y-auto overscroll-contain border-t border-line">
          {positions.length === 0 ? (
            <li className="px-3 py-3 text-xs text-muted">No open positions. Tap Buy or Sell below to open one.</li>
          ) : positions.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => setSymbol(p.symbol)} className="min-w-0 flex-1 text-left" aria-label={`Show ${sym(p.symbol)} on the chart`}>
                <span className="flex items-center gap-1.5"><span className={cn('text-sm font-semibold', p.symbol === current && 'text-accent')}>{sym(p.symbol)}</span><TypeTag side={p.side} /><span className="num text-2xs text-subtle">{p.leverage}×</span></span>
                <span className="num block truncate font-mono text-2xs text-subtle">{fmtNum(p.quantity, qtyDecimals(p.entry_price) + 1)} @ {fmtPrice(p.entry_price)}</span>
              </button>
              <span className={cn('num font-mono text-sm font-semibold', pnlClass(p.unrealized_pnl))}>{fmtSigned(p.unrealized_pnl)}</span>
              <button onClick={() => press(p)} disabled={busy === p.id} className={cn('h-9 min-w-[72px] rounded-md border px-2 text-xs font-semibold disabled:opacity-50', armed === p.id ? 'border-down bg-down text-white' : 'border-down/30 bg-down/10 text-down')}>
                {busy === p.id ? '…' : armed === p.id ? 'Confirm' : 'Close'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export const ChartPositions = memo(ChartPositionsInner);
