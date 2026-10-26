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
import { pnlAt as projectPnl } from './risk';

type Tone = 'up' | 'down' | 'warn' | 'info';
interface Chip {
  key: string;
  price: number;
  tone: Tone;
  /** solid pill in front of the chip (Long / Short) */
  pill?: { label: string; side: 'long' | 'short' };
  /** short tag used on phones: L / S / TP / SL / LMT / STP */
  tag: string;
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
  const { accountId, refresh, closePositions, cancelPending: removePending, isClosing } = useTerminalData();
  const pendingAll = useTerminal((s) => s.pending);
  const [busy, setBusy] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const closePosition = useCallback(async (p: Position) => {
    setBusy(p.id);
    try {
      const [o] = await closePositions([p.id]);
      if (o?.ok && !o.res) { void refresh(); return; }
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
        const opening = !!p.pending;
        const closingNow = isClosing(p.id) || opening;
        // capped at -margin past liquidation, like everywhere else in the terminal
        const pnlAt = (px: number) => projectPnl({ side: p.side, entry: p.entry_price, quantity: p.quantity, margin: p.margin, liquidation: p.liquidation_price }, px) ?? 0;
        out.push({
          key: `p:${p.id}`, price: p.entry_price, tone: 'info', pill: { label: long ? 'Long' : 'Short', side: p.side }, tag: long ? 'L' : 'S', size: qty,
          value: { text: opening ? 'Opening…' : closingNow ? 'Closing…' : `${fmtSigned(p.unrealized_pnl)} USD`, tone: closingNow ? undefined : p.unrealized_pnl >= 0 ? 'up' : 'down' },
          closeLabel: 'Close position', busy: busy === p.id || closingNow, onClose: () => void closePosition(p),
        });
        if (p.take_profit) out.push({ key: `p:${p.id}:tp`, price: p.take_profit, tone: 'up', dotted: true, tag: 'TP', size: qty, value: { text: `${fmtSigned(pnlAt(p.take_profit))} USD`, tone: 'up' }, closeLabel: 'Remove take-profit', busy: busy === `${p.id}:tp` || closingNow, onClose: () => void clearLevel(p, 'tp') });
        if (p.stop_loss) out.push({ key: `p:${p.id}:sl`, price: p.stop_loss, tone: 'warn', dotted: true, tag: 'SL', size: qty, value: { text: `${fmtSigned(pnlAt(p.stop_loss))} USD`, tone: 'down' }, closeLabel: 'Remove stop-loss', busy: busy === `${p.id}:sl` || closingNow, onClose: () => void clearLevel(p, 'sl') });
      }
    }
    if (showOrders) {
      for (const o of pendingAll) {
        if (o.accountId !== accountId || o.symbol !== symbol) continue;
        const qty = fmtNum((o.margin * o.leverage) / o.trigger, qtyDecimals(o.trigger) + 1);
        const long = o.side === 'long';
        out.push({
          key: `o:${o.id}`, price: o.trigger, tone: 'info', pill: { label: long ? 'Long' : 'Short', side: o.side }, tag: o.kind === 'limit' ? 'LMT' : 'STP', size: qty,
          value: { text: o.status === 'failed' ? 'Failed' : o.status === 'filling' ? 'Filling…' : o.kind === 'limit' ? 'Limit' : 'Stop', tone: o.status === 'failed' ? 'down' : undefined },
          closeLabel: 'Cancel order', onClose: () => removePending(o.id),
        });
        if (o.tp) out.push({ key: `o:${o.id}:tp`, price: o.tp, tone: 'up', dotted: true, tag: 'TP', size: qty, value: { text: 'TP', tone: 'up' }, closeLabel: 'Cancel order', onClose: () => removePending(o.id) });
        if (o.sl) out.push({ key: `o:${o.id}:sl`, price: o.sl, tone: 'warn', dotted: true, tag: 'SL', size: qty, value: { text: 'SL', tone: 'down' }, closeLabel: 'Cancel order', onClose: () => removePending(o.id) });
      }
    }
    return out;
  }, [positions, pendingAll, accountId, symbol, showLevels, showOrders, busy, closePosition, clearLevel, removePending, isClosing]);

  // glue every chip to its price, once per frame, straight on the DOM
  useEffect(() => {
    const el = host.current;
    if (!el || !series || !chips.length) return;
    let raf = 0;
    const tick = () => {
      // stop short of the price scale, whatever its current width (it grows with the number of digits)
      const scaleW = chart?.priceScale('right').width() ?? 72;
      const right = `${Math.max(scaleW, 48) + 8}px`;
      if (el.style.right !== right) el.style.right = right;
      const h = el.clientHeight;
      // place every visible chip on its price, then push neighbours apart so labels never overlap
      const items: { c: HTMLElement; y: number; h: number }[] = [];
      for (const c of Array.from(el.children) as HTMLElement[]) {
        const y = series.priceToCoordinate(Number(c.dataset.price));
        if (y == null || y < 4 || y > h - 4) { c.style.visibility = 'hidden'; continue; }
        items.push({ c, y, h: c.offsetHeight || 18 });
      }
      items.sort((a, b) => a.y - b.y);
      const GAP = 3;
      for (let i = 1; i < items.length; i++) {
        const prev = items[i - 1], cur = items[i];
        const min = prev.y + prev.h / 2 + GAP + cur.h / 2;
        if (cur.y < min) cur.y = min;
      }
      // if the stack ran off the bottom, slide it back up
      for (let i = items.length - 1; i >= 0; i--) {
        const cur = items[i];
        const max = i === items.length - 1 ? h - cur.h / 2 - 2 : items[i + 1].y - items[i + 1].h / 2 - GAP - cur.h / 2;
        if (cur.y > max) cur.y = max;
      }
      for (const it of items) {
        it.c.style.visibility = 'visible';
        it.c.style.transform = `translateY(${Math.round(it.y)}px) translateY(-50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chips, series, chart]);

  if (!chips.length) return null;

  return (
    <div ref={host} className="pointer-events-none absolute inset-y-0 left-0 right-20 z-[3] overflow-hidden" aria-label="Orders on chart">
      {compact ? chips.map((c) => {
        const valTone = c.value.tone === 'up' ? 'text-up' : c.value.tone === 'down' ? 'text-down' : 'text-fg';
        const tagCls = c.pill ? (c.pill.side === 'long' ? 'bg-up text-[#04140D]' : 'bg-down text-white') : c.tone === 'up' ? 'text-up' : 'text-warn';
        return (
          <div key={c.key} data-price={c.price} style={{ visibility: 'hidden', '--c': rgb(c.tone) } as CSSProperties} className="absolute right-1.5 top-0 will-change-transform">
            <span className={cn('pointer-events-auto inline-flex h-[18px] items-stretch overflow-hidden rounded-md border bg-panel/90 text-[10px] leading-none backdrop-blur-sm', c.dotted ? 'border-dotted' : 'border-solid')} style={{ borderColor: 'color-mix(in srgb, var(--c) 70%, transparent)' }}>
              <span className={cn('grid place-items-center px-1.5 font-bold', tagCls)}>{c.tag}</span>
              <span className={cn('num grid place-items-center px-1.5 font-semibold', valTone)}>{c.value.text.replace(' USD', '')}</span>
              {!c.pill && (
                <button onClick={c.onClose} disabled={c.busy} title={c.closeLabel} aria-label={c.closeLabel}
                  className="grid w-[22px] place-items-center border-l text-muted active:bg-down/20 disabled:opacity-40" style={{ borderColor: 'color-mix(in srgb, var(--c) 40%, transparent)' }}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
        );
      }) : chips.map((c) => (
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
            {!c.pill && <span className={cn('px-2 py-[3px] font-bold', c.tone === 'up' ? 'text-up' : 'text-warn')}>{c.tag}</span>}
            <span className={cn('num px-2 py-[3px] font-medium text-fg', !c.pill && 'border-l')} style={!c.pill ? { borderColor: 'color-mix(in srgb, var(--c) 40%, transparent)' } : undefined}>{c.size}</span>
            <span className={cn('num border-l px-2 py-[3px] font-semibold', c.value.tone === 'up' ? 'text-up' : c.value.tone === 'down' ? 'text-down' : 'text-fg')} style={{ borderColor: 'color-mix(in srgb, var(--c) 40%, transparent)' }}>
              {c.value.text}
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
