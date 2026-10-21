'use client';

import { memo, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, Star, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { Flash } from './Flash';
import { useTerminal } from './store';

type SortKey = 'pair' | 'bid' | 'chg';

const Row = memo(function Row({ symbol, base, active, fav }: { symbol: string; base: string; active: boolean; fav: boolean }) {
  const p = useTerminal((s) => s.prices[symbol]);
  const t = useTerminal((s) => s.tickers[symbol]);
  const setSymbol = useTerminal((s) => s.setSymbol);
  const toggle = useTerminal((s) => s.toggleFavorite);
  const chg = t?.changePct;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={active}
        onClick={() => setSymbol(symbol)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSymbol(symbol); } }}
        className={cn('grid cursor-pointer grid-cols-[18px_1fr_1fr_1fr_52px] items-center gap-1 px-2 font-mono text-xs transition-colors hover:bg-fg/[0.05]', active && 'bg-accent/[0.08] shadow-[inset_2px_0_0_rgb(var(--accent))]')}
        style={{ height: 26 }}
      >
        <button onClick={(e) => { e.stopPropagation(); toggle(symbol); }} aria-label={fav ? `Remove ${base} from favorites` : `Add ${base} to favorites`} aria-pressed={fav} className="grid h-4 w-4 place-items-center text-subtle hover:text-warn">
          <Star className={cn('h-3 w-3', fav && 'fill-warn text-warn')} />
        </button>
        <span className="truncate font-sans font-medium text-fg">{base}<span className="text-subtle">/USDT</span></span>
        <Flash value={p?.bid} className="num text-right text-up">{p ? fmtPrice(p.bid) : '—'}</Flash>
        <Flash value={p?.ask} className="num text-right text-down">{p ? fmtPrice(p.ask) : '—'}</Flash>
        <span className={cn('num text-right', chg == null ? 'text-subtle' : chg >= 0 ? 'text-up' : 'text-down')}>{chg == null ? '—' : `${chg >= 0 ? '+' : ''}${fmtNum(chg)}%`}</span>
      </div>
    </li>
  );
});

function WatchlistInner() {
  const symbols = useTerminal((s) => s.symbols);
  const favorites = useTerminal((s) => s.favorites);
  const active = useTerminal((s) => s.symbol);
  const pricesOk = useTerminal((s) => s.pricesOk);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const prices = useTerminal((s) => (sort?.key === 'bid' ? s.prices : null));
  const tickers = useTerminal((s) => (sort?.key === 'chg' ? s.tickers : null));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let l = symbols.filter((s) => (tab === 'all' || favorites.includes(s.symbol)) && (!needle || s.base.toLowerCase().includes(needle) || s.symbol.toLowerCase().includes(needle)));
    if (sort) {
      const val = (s: (typeof symbols)[number]) => (sort.key === 'pair' ? s.base : sort.key === 'bid' ? prices?.[s.symbol]?.bid ?? 0 : tickers?.[s.symbol]?.changePct ?? -1e9);
      l = [...l].sort((a, b) => {
        const av = val(a), bv = val(b);
        return (typeof av === 'string' ? av.localeCompare(String(bv)) : (av as number) - (bv as number)) * sort.dir;
      });
    }
    return l;
  }, [symbols, favorites, tab, q, sort, prices, tickers]);

  const toggleSort = (key: SortKey) => setSort((s) => (!s || s.key !== key ? { key, dir: key === 'pair' ? 1 : -1 } : s.dir === -1 && key !== 'pair' ? { key, dir: 1 } : s.dir === 1 && key === 'pair' ? { key, dir: -1 } : null));
  const Head = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <button onClick={() => toggleSort(k)} className={cn('inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-fg', right && 'justify-end', sort?.key === k && 'text-fg')}>
      {children}{sort?.key === k && (sort.dir === 1 ? <ArrowUp className="h-2.5 w-2.5 text-accent" /> : <ArrowDown className="h-2.5 w-2.5 text-accent" />)}
    </button>
  );

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Watchlist">
      <div className="space-y-1.5 border-b border-line p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 50 pairs…" aria-label="Search pairs" className="h-7 w-full rounded-md border border-line bg-panel2 pl-7 pr-6 text-xs placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle hover:text-fg"><X className="h-3 w-3" /></button>}
        </div>
        <div className="flex gap-1">
          {(['all', 'fav'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={cn('inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium', tab === t ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}>
              {t === 'fav' && <Star className="h-3 w-3" />}{t === 'all' ? `All · ${symbols.length || 50}` : `Favorites · ${favorites.length}`}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[18px_1fr_1fr_1fr_52px] gap-1 px-2 py-1 text-2xs text-subtle">
        <span /><Head k="pair">Pair</Head><Head k="bid" right>Bid</Head><span className="text-right uppercase tracking-wider">Ask</span><Head k="chg" right>24h</Head>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {symbols.length === 0 ? (
          <div className="space-y-1 p-2">{Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-5" />)}</div>
        ) : list.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted">{tab === 'fav' && !q ? 'Star a pair to pin it here.' : `No pairs match “${q}”.`}</div>
        ) : (
          <ul>{list.map((s) => <Row key={s.symbol} symbol={s.symbol} base={s.base} active={s.symbol === active} fav={favorites.includes(s.symbol)} />)}</ul>
        )}
      </div>
      {!pricesOk && <div role="status" className="border-t border-warn/30 bg-warn/10 px-2 py-1 text-2xs text-warn">Price feed interrupted — retrying…</div>}
    </section>
  );
}

export const Watchlist = memo(WatchlistInner);
