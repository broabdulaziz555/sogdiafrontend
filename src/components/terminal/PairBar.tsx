'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtCompact, fmtNum, fmtPrice } from '@/lib/format';
import { Flash } from './Flash';
import { useTerminal } from './store';

export const OPEN_SYMBOL_SEARCH = 'sg:open-symbol-search';

function Picker() {
  const symbol = useTerminal((s) => s.symbol);
  const symbols = useTerminal((s) => s.symbols);
  const tickers = useTerminal((s) => s.tickers);
  const favorites = useTerminal((s) => s.favorites);
  const setSymbol = useTerminal((s) => s.setSymbol);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = symbol.replace('USDT', '');

  const list = useMemo(() => {
    const needle = q.trim().toUpperCase().replace('/', '');
    const rows = symbols.filter((s) => !needle || s.symbol.includes(needle));
    return rows.sort((a, b) => {
      const fa = favorites.includes(a.symbol) ? 1 : 0, fb = favorites.includes(b.symbol) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return (tickers[b.symbol]?.quoteVol ?? 0) - (tickers[a.symbol]?.quoteVol ?? 0);
    });
  }, [symbols, tickers, favorites, q]);

  useEffect(() => { setIdx(0); }, [q, open]);
  useEffect(() => {
    const openIt = () => { setOpen(true); setTimeout(() => input.current?.focus(), 0); };
    window.addEventListener(OPEN_SYMBOL_SEARCH, openIt);
    return () => window.removeEventListener(OPEN_SYMBOL_SEARCH, openIt);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (s: string) => { setSymbol(s); setOpen(false); setQ(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && list[idx]) { e.preventDefault(); pick(list[idx].symbol); }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen((o) => !o); setTimeout(() => input.current?.focus(), 0); }} aria-haspopup="listbox" aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-md font-bold tracking-tight hover:bg-fg/[0.06]">
        {base}<span className="text-subtle">/USDT</span><span className="ml-1 rounded bg-accent/15 px-1 py-px text-2xs font-semibold text-accent">PERP</span>
        <ChevronDown className={cn('h-4 w-4 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(92vw,360px)] overflow-hidden rounded-lg border border-line bg-panel shadow-2xl" onKeyDown={onKey}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 text-subtle" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pair  (BTC, SOL…)" aria-label="Search pair" className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
            <span className="kbd">Esc</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 text-2xs uppercase tracking-wider text-subtle"><span>Pair</span><span className="text-right">Last</span><span className="w-14 text-right">24h</span></div>
          <ul role="listbox" aria-label="Pairs" className="max-h-[340px] overflow-y-auto pb-1">
            {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{symbols.length ? 'No pairs match your search.' : 'Loading pairs…'}</li>}
            {list.map((s, i) => {
              const t = tickers[s.symbol];
              return (
                <li key={s.symbol} role="option" aria-selected={s.symbol === symbol}>
                  <button onClick={() => pick(s.symbol)} onMouseEnter={() => setIdx(i)}
                    className={cn('grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1.5 text-left text-sm', i === idx && 'bg-fg/[0.06]', s.symbol === symbol && 'text-accent')}>
                    <span className="flex items-center gap-1.5 font-medium">{favorites.includes(s.symbol) && <Star className="h-3 w-3 fill-warn text-warn" />}{s.base}<span className="text-subtle">/USDT</span></span>
                    <span className="num font-mono text-xs">{t ? fmtPrice(t.last) : '—'}</span>
                    <span className={cn('num w-14 text-right font-mono text-xs', !t ? 'text-subtle' : t.changePct >= 0 ? 'text-up' : 'text-down')}>{t ? `${t.changePct >= 0 ? '+' : ''}${fmtNum(t.changePct)}%` : '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Cell({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) {
  return <div className={cn('shrink-0', className)}><div className="text-2xs uppercase tracking-wider text-subtle">{k}</div><div className="num font-mono text-xs">{children}</div></div>;
}

function PairBarInner() {
  const symbol = useTerminal((s) => s.symbol);
  const t = useTerminal((s) => s.tickers[s.symbol]);
  const p = useTerminal((s) => s.prices[s.symbol]);
  const lastLive = useTerminal((s) => s.last);
  const dir = useTerminal((s) => s.lastDir);
  const last = lastLive ?? t?.last ?? p?.price ?? null;
  const chg = t?.changePct;
  const base = symbol.replace('USDT', '');

  return (
    <div className="flex items-center gap-4 overflow-x-auto border-b border-line bg-panel px-2 py-1.5 scroll-none" aria-label="Instrument">
      <Picker />
      <div className="shrink-0">
        <Flash value={last} className={cn('num font-mono text-lg font-semibold leading-none', dir > 0 ? 'text-up' : dir < 0 ? 'text-down' : 'text-fg')}>{last != null ? fmtPrice(last) : '—'}</Flash>
        <div className="mt-0.5 text-2xs text-subtle">≈ ${last != null ? fmtPrice(last) : '—'}</div>
      </div>
      <Cell k="24h change"><span className={chg == null ? 'text-subtle' : chg >= 0 ? 'text-up' : 'text-down'}>{chg == null ? '—' : `${chg >= 0 ? '+' : ''}${fmtNum(chg)}%`}</span></Cell>
      <Cell k="24h high">{t ? fmtPrice(t.high) : '—'}</Cell>
      <Cell k="24h low">{t ? fmtPrice(t.low) : '—'}</Cell>
      <Cell k={`24h vol (${base})`}>{t ? fmtCompact(t.baseVol) : '—'}</Cell>
      <Cell k="24h vol (USDT)">{t ? fmtCompact(t.quoteVol) : '—'}</Cell>
      <Cell k="Engine bid" className="max-md:hidden"><span className="text-up">{p ? fmtPrice(p.bid) : '—'}</span></Cell>
      <Cell k="Engine ask" className="max-md:hidden"><span className="text-down">{p ? fmtPrice(p.ask) : '—'}</span></Cell>
    </div>
  );
}

export const PairBar = memo(PairBarInner);
