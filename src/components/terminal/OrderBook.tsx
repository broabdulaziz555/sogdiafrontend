'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice, priceDecimals, qtyDecimals } from '@/lib/format';
import type { Level } from '@/lib/binance';
import { groupLadder, useTerminal, type BookView } from './store';
import { useDepthFeed } from './useDepthFeed';
import { Skeleton } from '@/components/ui/Skeleton';

const ROW = 18;
const MID = 34;

function aggregate(levels: Level[], g: number, side: 'ask' | 'bid'): Level[] {
  if (!levels.length) return [];
  const m = new Map<number, number>();
  for (const [p, q] of levels) {
    const k = side === 'ask' ? Math.ceil(p / g - 1e-9) * g : Math.floor(p / g + 1e-9) * g;
    const key = +k.toFixed(10);
    m.set(key, (m.get(key) ?? 0) + q);
  }
  const arr = [...m.entries()] as Level[];
  arr.sort((a, b) => (side === 'ask' ? a[0] - b[0] : b[0] - a[0]));
  return arr;
}

function ViewIcon({ v, active }: { v: BookView; active: boolean }) {
  const up = 'rgb(var(--down))', dn = 'rgb(var(--up))', off = 'rgb(var(--subtle))';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="1" y="1" width="5" height="5" fill={v === 'bids' ? off : up} opacity={active ? 1 : 0.6} />
      <rect x="1" y="8" width="5" height="5" fill={v === 'asks' ? off : dn} opacity={active ? 1 : 0.6} />
      <rect x="8" y="2" width="5" height="2" fill="rgb(var(--subtle))" opacity="0.7" />
      <rect x="8" y="6" width="5" height="2" fill="rgb(var(--subtle))" opacity="0.7" />
      <rect x="8" y="10" width="5" height="2" fill="rgb(var(--subtle))" opacity="0.7" />
    </svg>
  );
}

function OrderBookInner() {
  const symbol = useTerminal((s) => s.symbol);
  useDepthFeed(symbol);

  const book = useTerminal((s) => s.book);
  const last = useTerminal((s) => s.last);
  const dir = useTerminal((s) => s.lastDir);
  const view = useTerminal((s) => s.bookView);
  const gi = useTerminal((s) => s.bookGroup);
  const px = useTerminal((s) => s.prices[s.symbol]);
  const set = useTerminal((s) => s.set);

  const hostRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(10);
  const pick = useRef(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const h = e.contentRect.height;
      const per = view === 'both' ? (h - MID) / 2 : h - MID;
      setRows(Math.max(3, Math.min(20, Math.floor(per / ROW))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const ref = last ?? book.asks[0]?.[0] ?? book.bids[0]?.[0] ?? 0;
  const ladder = useMemo(() => groupLadder(ref), [ref]);
  const g = ladder[Math.min(gi, ladder.length - 1)];
  const pdp = g >= 1 ? 0 : Math.min(8, Math.ceil(-Math.log10(g) - 1e-9));

  const { asks, bids, maxCum, buyPct, spread } = useMemo(() => {
    const a = aggregate(book.asks, g, 'ask').slice(0, rows);
    const b = aggregate(book.bids, g, 'bid').slice(0, rows);
    let cum = 0;
    const ac = a.map(([p, q]) => ({ p, q, c: (cum += q) }));
    cum = 0;
    const bc = b.map(([p, q]) => ({ p, q, c: (cum += q) }));
    const maxCum = Math.max(ac[ac.length - 1]?.c ?? 0, bc[bc.length - 1]?.c ?? 0, 1e-12);
    const tb = bc[bc.length - 1]?.c ?? 0, ta = ac[ac.length - 1]?.c ?? 0;
    const bestAsk = book.asks[0]?.[0], bestBid = book.bids[0]?.[0];
    const spread = bestAsk != null && bestBid != null ? { abs: bestAsk - bestBid, bps: ((bestAsk - bestBid) / bestAsk) * 1e4 } : null;
    return { asks: ac, bids: bc, maxCum, buyPct: tb + ta > 0 ? (tb / (tb + ta)) * 100 : 50, spread };
  }, [book, g, rows]);

  const qd = qtyDecimals(ref || 1);
  const empty = !book.asks.length && !book.bids.length;
  const live = book.at > 0 && Date.now() - book.at < 8000;
  const clickPrice = (price: number) => set({ pickedPrice: { price, n: ++pick.current } });

  /** Depth shading: a bar behind each row whose length is the cumulative size up to that level. */
  const Row = ({ p, q, c, side }: { p: number; q: number; c: number; side: 'ask' | 'bid' }) => {
    const w = `${(c / maxCum) * 100}%`;
    const col = side === 'ask' ? 'var(--down)' : 'var(--up)';
    return (
      <button
        type="button"
        onClick={() => clickPrice(p)}
        className="group relative grid w-full grid-cols-3 items-center px-2 text-left font-mono text-[11px] hover:bg-fg/[0.07]"
        style={{ height: ROW }}
        title="Use this price in the order ticket"
      >
        <span className="absolute inset-y-0 right-0 transition-[width] duration-150" style={{ width: w, background: `rgb(${col} / 0.16)`, boxShadow: `inset 1px 0 0 rgb(${col} / 0.55)` }} aria-hidden />
        <span className={cn('num relative', side === 'ask' ? 'text-down' : 'text-up')}>{fmtNum(p, pdp)}</span>
        <span className="num relative text-right text-fg/90">{fmtNum(q, qd)}</span>
        <span className="num relative text-right text-muted">{fmtNum(c, qd)}</span>
      </button>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Order book">
      <div className="panel-head">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="panel-title">Order book</h2>
          <span className={cn('h-1.5 w-1.5', live ? 'bg-up' : 'bg-subtle')} title={live ? 'Reference depth is live' : 'Waiting for depth data'} aria-hidden />
        </div>
        <div className="flex items-center gap-1">
          {(['both', 'bids', 'asks'] as BookView[]).map((v) => (
            <button key={v} onClick={() => set({ bookView: v })} aria-pressed={view === v} aria-label={`Show ${v}`} className={cn('grid h-5 w-5 place-items-center transition-colors', view === v ? 'bg-fg/10' : 'hover:bg-fg/[0.06]')}>
              <ViewIcon v={v} active={view === v} />
            </button>
          ))}
          <label className="flex items-center">
            <span className="sr-only">Price grouping</span>
            <select value={Math.min(gi, ladder.length - 1)} onChange={(e) => set({ bookGroup: Number(e.target.value) })} className="ml-1 h-5 border border-line bg-bg/60 px-1 font-mono text-2xs text-fg focus:border-accent focus:outline-none">
              {ladder.map((x, i) => <option key={x} value={i}>{x}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-line px-2 py-1 text-3xs font-semibold uppercase tracking-[0.1em] text-subtle">
        <span>Price</span><span className="text-right">Size ({symbol.replace('USDT', '')})</span><span className="text-right">Sum</span>
      </div>

      <div ref={hostRef} className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
        {empty ? (
          <div className="space-y-1 p-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-3.5" />)}</div>
        ) : (
          <>
            {view !== 'bids' && (
              <div className={cn('flex flex-col justify-end', view === 'asks' && 'flex-1')}>
                {[...asks].reverse().map((r) => <Row key={r.p} {...r} side="ask" />)}
              </div>
            )}

            <div className="flex flex-col justify-center border-y border-line2 bg-panel2 px-2" style={{ height: MID }}>
              <div className="flex items-center gap-2">
                <span className={cn('num flex items-center gap-1 font-mono text-sm font-semibold leading-none', dir > 0 ? 'text-up' : dir < 0 ? 'text-down' : 'text-fg')}>
                  {last != null ? fmtPrice(last, priceDecimals(last)) : '—'}
                  {dir > 0 ? <ArrowUp className="h-3 w-3" /> : dir < 0 ? <ArrowDown className="h-3 w-3" /> : null}
                </span>
                {spread && <span className="num ml-auto font-mono text-2xs text-subtle" title="Best ask − best bid on the reference book">Spr {fmtNum(spread.abs, pdp)} · {spread.bps.toFixed(1)}bp</span>}
              </div>
              {px && (
                <span className="num mt-0.5 truncate font-mono text-2xs text-subtle" title="Prices the engine fills your order at (reference price ± 5 bps spread). Orders do not interact with this ladder.">
                  Fill <span className="text-up">{fmtPrice(px.bid)}</span> / <span className="text-down">{fmtPrice(px.ask)}</span>
                </span>
              )}
            </div>

            {view !== 'asks' && (
              <div className={cn('flex flex-col', view === 'bids' && 'flex-1')}>
                {bids.map((r) => <Row key={r.p} {...r} side="bid" />)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-line px-2 py-1.5" aria-label="Buy and sell pressure">
        <div className="flex items-center gap-1.5 text-2xs font-medium">
          <span className="num font-mono text-up">B {buyPct.toFixed(0)}%</span>
          <div className="flex h-1 flex-1 overflow-hidden bg-down/50"><div className="bg-up transition-[width] duration-300" style={{ width: `${buyPct}%` }} /></div>
          <span className="num font-mono text-down">{(100 - buyPct).toFixed(0)}% S</span>
        </div>
        <p className="mt-1 text-3xs uppercase tracking-[0.08em] text-subtle">Reference depth · indicative only</p>
      </div>
    </section>
  );
}

export const OrderBook = memo(OrderBookInner);
