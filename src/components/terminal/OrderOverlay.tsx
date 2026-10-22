'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { X } from 'lucide-react';
import { errMsg, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice, fmtSigned, qtyDecimals } from '@/lib/format';
import type { Account, AccountMetrics, Position } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { useTerminalData } from './data';
import { useTerminal } from './store';

type Tone = 'up' | 'down' | 'warn' | 'info';
interface Chip {
  key: string;
  price: number;
  tone: Tone;
  /** solid pill in front of the chip (Long / Short) */
  pill?: { label: string; side: 'long' | 'short' };
  size: string;
  value: { text: string; tone?: 'up' | 'down' };
  dotted?: boolean;
  closeLabel: string;
  onClose: () => void;
  busy?: boolean;
}

const rgb = (t: Tone, a = 1) => `rgb(var(--${t}) / ${a})`;

/**
 * TradingView-style order markers drawn over the chart: a side pill, the size and either the live P/L or the
 * order type, and a ✕ that closes the position / cancels the order / clears the TP or SL.
 * Positions are written straight to the DOM each frame from the series' own price→pixel mapping, so the chips
 * stay glued to their price line while the chart pans, zooms or autoscales — with no React re-render.
 */
function OrderOverlayInner({ chart, series, symbol, positions, showLevels, showOrders, compact }: {
  chart: IChartApi | null; series: ISeriesApi<'Candlestick'> | null; symbol: string; positions: Position[];
  showLevels: boolean; showOrders: boolean; compact: boolean;
}) {
  const toast = useToast();
  const { accountId, refresh, closePositions } = useTerminalData();
  const pendingAll = useTerminal((s) => s.pending);
  const removePending = useTerminal((s) => s.removePending);
  const [busy, setBusy] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const closePosition = useCallback(async (p: Position) => {
    setBusy(p.id);
    try {
      const [o] = await closePositions([p.id]);
      if (!o?.ok || !o.res) throw o?.error ?? new Error('Close failed');
      const r = o.res;
      toast.success(`${symbol.replace('USDT', '/USDT')} closed`, `${fmtSigned(r.order.pnl)} USDT at ${fmtPrice(r.order.close_price)}`);
    } catch (e) { toast.error('Close failed', errMsg(e)); void refresh(); } finally { setBusy(null); }
  }, [toast, symbol, refresh, closePositions]);

  const clearLevel = useCallback(async (p: Position, which: 'tp' | 'sl') => {
    setBusy(`${p.id}:${which}`);
    try {
      await post('/trade/protection', {
        order_id: p.id,
        take_profit: which === 'tp' ? null : p.take_profit ?? null,
        stop_loss: which === 'sl' ? null : p.stop_loss ?? null,
      });
      toast.success(which === 'tp' ? 'Take-profit removed' : 'Stop-loss removed');
      await refresh();
    } catch (e) { toast.error('Could not update TP/SL', errMsg(e)); } finally { setBusy(null); }
  }, [toast, refresh]);

  const chips = useMemo(() => {
    const out: Chip[] = [];
    if (showLevels) {
      for (const p of positions) {
        if (p.symbol !== symbol) continue;
        const long = p.side === 'long';
        const qty = fmtNum(p.quantity, qtyDecimals(p.entry_price) + 1);
        const opening = p.id.startsWith('tmp-');
        const pnlAt = (px: number) => p.quantity * (long ? px - p.entry_price : p.entry_price - px);
        out.push({
          key: `p:${p.id}`, price: p.entry_price, tone: 'info', pill: { label: long ? 'Long' : 'Short', side: p.side }, size: qty,
          value: { text: opening ? 'Opening…' : `${fmtSigned(p.unrealized_pnl)} USD`, tone: opening ? undefined : p.unrealized_pnl >= 0 ? 'up' : 'down' },
          closeLabel: 'Close position', busy: busy === p.id || opening, onClose: () => void closePosition(p),
        });
        if (p.take_profit) out.push({ key: `p:${p.id}:tp`, price: p.take_profit, tone: 'up', dotted: true, size: qty, value: { text: `${fmtSigned(pnlAt(p.take_profit))} USD`, tone: 'up' }, closeLabel: 'Remove take-profit', busy: busy === `${p.id}:tp` || opening, onClose: () => void clearLevel(p, 'tp') });
        if (p.stop_loss) out.push({ key: `p:${p.id}:sl`, price: p.stop_loss, tone: 'warn', dotted: true, size: qty, value: { text: `${fmtSigned(pnlAt(p.stop_loss))} USD`, tone: 'down' }, closeLabel: 'Remove stop-loss', busy: busy === `${p.id}:sl` || opening, onClose: () => void clearLevel(p, 'sl') });
      }
    }
    if (showOrders) {
      for (const o of pendingAll) {
        if (o.accountId !== accountId || o.symbol !== symbol) continue;
        const qty = fmtNum((o.margin * o.leverage) / o.trigger, qtyDecimals(o.trigger) + 1);
        const long = o.side === 'long';
        out.push({
          key: `o:${o.id}`, price: o.trigger, tone: 'info', pill: { label: long ? 'Long' : 'Short', side: o.side }, size: qty,
          value: { text: o.status === 'failed' ? 'Failed' : o.status === 'filling' ? 'Filling…' : o.kind === 'limit' ? 'Limit' : 'Stop', tone: o.status === 'failed' ? 'down' : undefined },
          closeLabel: 'Cancel order', onClose: () => removePending(o.id),
        });
        if (o.tp) out.push({ key: `o:${o.id}:tp`, price: o.tp, tone: 'up', dotted: true, size: qty, value: { text: 'TP', tone: 'up' }, closeLabel: 'Cancel order', onClose: () => removePending(o.id) });
        if (o.sl) out.push({ key: `o:${o.id}:sl`, price: o.sl, tone: 'warn', dotted: true, size: qty, value: { text: 'SL', tone: 'down' }, closeLabel: 'Cancel order', onClose: () => removePending(o.id) });
      }
    }
    return out;
  }, [positions, pendingAll, accountId, symbol, showLevels, showOrders, busy, closePosition, clearLevel, removePending]);

  // glue every chip to its price, once per frame, straight on the DOM
  useEffect(() => {
    const el = host.current;
    if (!el || !series || !chips.length) return;
    let raf = 0;
    const tick = () => {
      const h = el.clientHeight;
      for (const c of Array.from(el.children) as HTMLElement[]) {
        const y = series.priceToCoordinate(Number(c.dataset.price));
        if (y == null || y < 4 || y > h - 24) { c.style.visibility = 'hidden'; continue; }
        c.style.visibility = 'visible';
        c.style.transform = `translateY(${Math.round(y)}px) translateY(-50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chips, series, chart]);

  if (!chips.length) return null;

  return (
    <div ref={host} className="pointer-events-none absolute inset-y-0 left-0 right-[72px] z-[3] overflow-hidden" aria-label="Orders on chart">
      {chips.map((c) => (
        <div
          key={c.key}
          data-price={c.price}
          style={{ visibility: 'hidden', '--c': rgb(c.tone), '--g': rgb(c.tone, 0.35) } as CSSProperties}
          className="absolute right-3 top-0 flex items-center gap-1.5 will-change-transform"
        >
          {c.pill && (
            <span className={cn('pointer-events-auto rounded-full px-2.5 py-[3px] text-xs font-semibold shadow-[0_0_14px_-2px_var(--g)]', c.pill.side === 'long' ? 'bg-up text-[#04140D]' : 'bg-down text-white')}>
              {c.pill.label}
            </span>
          )}
          <span
            className={cn(
              'pointer-events-auto inline-flex items-stretch overflow-hidden rounded-full border bg-panel/90 text-xs shadow-[0_0_16px_-4px_var(--g)] backdrop-blur-sm',
              c.dotted ? 'border-dotted' : 'border-dashed',
            )}
            style={{ borderColor: 'var(--c)' }}
          >
            <span className="num px-2 py-[3px] font-medium text-fg">{c.size}</span>
            <span className={cn('num border-l px-2 py-[3px] font-semibold', c.value.tone === 'up' ? 'text-up' : c.value.tone === 'down' ? 'text-down' : 'text-fg')} style={{ borderColor: 'color-mix(in srgb, var(--c) 40%, transparent)' }}>
              {compact && c.pill ? c.value.text.replace(' USD', '') : c.value.text}
            </span>
            <button
              onClick={c.onClose}
              disabled={c.busy}
              title={c.closeLabel}
              aria-label={c.closeLabel}
              className="grid w-7 place-items-center border-l text-muted transition-colors hover:bg-down/20 hover:text-down disabled:opacity-40"
              style={{ borderColor: 'color-mix(in srgb, var(--c) 40%, transparent)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

export const OrderOverlay = memo(OrderOverlayInner);
