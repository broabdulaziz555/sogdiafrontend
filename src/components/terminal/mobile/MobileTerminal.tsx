'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { BarChart3, History, LineChart, ListOrdered, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice, fmtSigned, fmtUsd, pnlClass } from '@/lib/format';
import type { Side } from '@/lib/types';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AccountPanel } from '../AccountPanel';
import { useTerminalData } from '../data';
import { OrderTicket } from '../OrderTicket';
import { PairBar } from '../PairBar';
import { PriceChart } from '../PriceChart';
import { useTerminal, type MobileTab } from '../store';
import { Watchlist } from '../Watchlist';
import { BottomSheet } from './BottomSheet';
import { ChartPositions } from './ChartPositions';
import { MobileHistory } from './MobileHistory';
import { MobilePositions } from './MobilePositions';

const Boundary = ({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) => (
  <div className={cn('flex min-h-0 min-w-0 flex-col bg-panel', className)}><ErrorBoundary label={label} compact>{children}</ErrorBoundary></div>
);

/** Equity / profit / free margin / margin level — always visible, like the MetaTrader mobile header. */
function EquityStrip() {
  const { metrics, positions } = useTerminalData();
  const ml = metrics && metrics.used_margin > 0 ? (metrics.equity / metrics.used_margin) * 100 : null;
  const total = positions.reduce((a, p) => a + p.unrealized_pnl, 0);
  const Item = ({ k, v, cls }: { k: string; v: string; cls?: string }) => (
    <div className="min-w-0"><div className="truncate text-2xs uppercase tracking-wider text-subtle">{k}</div><div className={cn('num truncate font-mono text-xs font-semibold', cls)}>{v}</div></div>
  );
  return (
    <div className="grid shrink-0 grid-cols-4 gap-2 border-b border-line bg-panel px-3 py-1.5" aria-label="Account summary">
      <Item k="Equity" v={metrics ? fmtUsd(metrics.equity).replace(/\.00$/, '') : '—'} />
      <Item k="Profit" v={metrics ? fmtSigned(total) : '—'} cls={pnlClass(total)} />
      <Item k="Free" v={metrics ? fmtUsd(metrics.free_margin).replace(/\.00$/, '') : '—'} />
      <Item k="Level" v={ml == null ? '—' : `${fmtNum(ml, 0)}%`} cls={ml != null && ml < 120 ? 'text-down' : ml != null && ml < 200 ? 'text-warn' : undefined} />
    </div>
  );
}

const NAV: [MobileTab, string, typeof Wallet][] = [
  ['markets', 'Quotes', ListOrdered],
  ['chart', 'Chart', LineChart],
  ['trade', 'Trade', BarChart3],
  ['positions', 'Positions', Wallet],
  ['history', 'History', History],
];

function MobileTerminalInner() {
  const tab = useTerminal((s) => s.mobileTab);
  const set = useTerminal((s) => s.set);
  const symbol = useTerminal((s) => s.symbol);
  const px = useTerminal((s) => s.prices[s.symbol]);
  const { positions } = useTerminalData();
  const [sheet, setSheet] = useState<Side | null>(null);

  // picking a quote jumps to its chart
  const prevSymbol = useRef(symbol);
  useEffect(() => {
    if (prevSymbol.current !== symbol && tab === 'markets') set({ mobileTab: 'chart' });
    prevSymbol.current = symbol;
  }, [symbol, tab, set]);

  const base = symbol.replace('USDT', '');
  const scrolls = tab === 'trade' || tab === 'positions' || tab === 'history';

  return (
    <>
      <EquityStrip />

      <div className={cn('min-h-0 flex-1 bg-bg', scrolls ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden')}>
        {tab === 'markets' && <Boundary label="Market Watch" className="flex-1"><Watchlist /></Boundary>}
        {tab === 'chart' && (
          <>
            <PairBar compact />
            <Boundary label="Chart" className="min-h-[240px] flex-1"><PriceChart positions={positions} /></Boundary>
            <ChartPositions />
          </>
        )}
        {tab === 'trade' && (
          <>
            <PairBar compact />
            <Boundary label="Order ticket"><OrderTicket /></Boundary>
            <AccountPanel />
          </>
        )}
        {tab === 'positions' && <Boundary label="Positions"><MobilePositions /></Boundary>}
        {tab === 'history' && <Boundary label="History"><MobileHistory /></Boundary>}
      </div>

      {tab === 'chart' && (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line bg-panel p-2">
          <button onClick={() => setSheet('short')} className="flex h-12 flex-col items-center justify-center rounded-lg bg-down text-white active:brightness-90">
            <span className="text-sm font-bold uppercase leading-none">Sell</span>
            <span className="num mt-0.5 font-mono text-2xs opacity-90">{px ? fmtPrice(px.bid) : '—'}</span>
          </button>
          <button onClick={() => setSheet('long')} className="flex h-12 flex-col items-center justify-center rounded-lg bg-up text-black active:brightness-90">
            <span className="text-sm font-bold uppercase leading-none">Buy</span>
            <span className="num mt-0.5 font-mono text-2xs opacity-80">{px ? fmtPrice(px.ask) : '—'}</span>
          </button>
        </div>
      )}

      <nav aria-label="Terminal sections" className="grid shrink-0 grid-cols-5 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
        {NAV.map(([k, label, Icon]) => (
          <button key={k} onClick={() => set({ mobileTab: k })} aria-current={tab === k ? 'page' : undefined}
            className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium', tab === k ? 'text-accent' : 'text-muted')}>
            <Icon className="h-5 w-5" />{label}
            {k === 'positions' && positions.length > 0 && <span className="num absolute right-[calc(50%-24px)] top-1.5 min-w-[16px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold text-accent-fg">{positions.length}</span>}
          </button>
        ))}
      </nav>

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet ? `${sheet === 'long' ? 'Buy' : 'Sell'} ${base}/USDT` : ''}>
        {sheet && <OrderTicket key={sheet} initialSide={sheet} onPlaced={() => setSheet(null)} />}
      </BottomSheet>
    </>
  );
}

export const MobileTerminal = memo(MobileTerminalInner);
