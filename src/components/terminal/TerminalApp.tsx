'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BarChart3, LineChart, ListOrdered, Wallet } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { cn } from '@/lib/cn';
import type { Account } from '@/lib/types';
import { BootScreen } from '@/components/ui/AuthGate';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { SiteLink } from '@/components/ui/SiteLink';
import { AccountPanel } from './AccountPanel';
import { TerminalDataProvider, useTerminalData } from './data';
import { useSymbolFeed, useSymbolsFeed, usePricesFeed, useTickersFeed } from './feeds';
import { Hotkeys } from './hotkeys';
import { MarketTrades } from './MarketTrades';
import { OrderBook } from './OrderBook';
import { OrderTicket } from './OrderTicket';
import { PairBar } from './PairBar';
import { usePendingEngine } from './pendingEngine';
import { PositionsPanel } from './PositionsPanel';
import { PriceChart } from './PriceChart';
import { useTerminal, type MobileTab } from './store';
import { TopBar } from './TopBar';
import { Watchlist } from './Watchlist';

const LAST_ACCOUNT = 'sg-terminal-account';

function useMedia(query: string): boolean | null {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => null as unknown as boolean,
  );
}

const Panel = ({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) => (
  <div className={cn('min-h-0 min-w-0 bg-panel', className)}><ErrorBoundary label={label} compact>{children}</ErrorBoundary></div>
);

function Workspace({ accountsList, onAccountChange }: { accountsList: Account[]; onAccountChange: (id: string) => void }) {
  const { accountId, positions, refresh } = useTerminalData();
  const symbol = useTerminal((s) => s.symbol);
  const mobileTab = useTerminal((s) => s.mobileTab);
  const set = useTerminal((s) => s.set);
  const wide = useMedia('(min-width: 1680px)');
  const desktop = useMedia('(min-width: 1024px)');

  useEffect(() => { useTerminal.setState({ accountId }); }, [accountId]);
  usePendingEngine(accountId, refresh);

  const chart = <PriceChart positions={positions} />;

  let body: React.ReactNode;
  if (desktop === null) body = <div className="grid flex-1 place-items-center"><BootScreen label="Loading terminal" /></div>;
  else if (desktop) {
    body = (
      <div className={cn('grid min-h-0 flex-1 gap-px bg-line', wide ? 'grid-cols-[300px_minmax(0,1fr)_290px_330px]' : 'grid-cols-[minmax(0,1fr)_280px_320px]')}>
        {wide && <Panel label="Watchlist"><Watchlist /></Panel>}
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_minmax(180px,34%)] gap-px bg-line">
          <PairBar />
          <Panel label="Chart">{chart}</Panel>
          <Panel label="Positions"><PositionsPanel className="h-full" /></Panel>
        </div>
        <div className="grid min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-px bg-line">
          <Panel label="Order book"><OrderBook /></Panel>
          <Panel label="Market trades"><MarketTrades /></Panel>
        </div>
        <Panel label="Order ticket" className="overflow-y-auto overscroll-contain">
          <OrderTicket />
          <AccountPanel />
        </Panel>
      </div>
    );
  } else {
    body = (
      <>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg pb-16">
          {mobileTab === 'markets' && <Panel label="Watchlist" className="h-[calc(100dvh-7rem)]"><Watchlist /></Panel>}
          {mobileTab === 'chart' && (
            <div className="space-y-px bg-line">
              <PairBar />
              <Panel label="Chart" className="h-[52dvh] min-h-[320px]">{chart}</Panel>
              <Panel label="Order book" className="h-[380px]"><OrderBook /></Panel>
              <Panel label="Market trades" className="h-[300px]"><MarketTrades /></Panel>
            </div>
          )}
          {mobileTab === 'trade' && <Panel label="Order ticket"><PairBar /><OrderTicket /><AccountPanel /></Panel>}
          {mobileTab === 'positions' && <Panel label="Positions" className="min-h-[60dvh]"><PositionsPanel className="min-h-[60dvh]" /><AccountPanel /></Panel>}
        </div>
        <nav aria-label="Terminal sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
          {([['markets', 'Markets', ListOrdered], ['chart', 'Chart', LineChart], ['trade', 'Trade', BarChart3], ['positions', 'Positions', Wallet]] as [MobileTab, string, typeof Wallet][]).map(([k, label, Icon]) => (
            <button key={k} onClick={() => set({ mobileTab: k })} aria-current={mobileTab === k ? 'page' : undefined}
              className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 text-2xs font-medium', mobileTab === k ? 'text-accent' : 'text-muted')}>
              <Icon className="h-5 w-5" />{label}
              {k === 'positions' && positions.length > 0 && <span className="num absolute right-[calc(50%-20px)] top-1.5 rounded-full bg-accent px-1 text-[10px] text-accent-fg">{positions.length}</span>}
            </button>
          ))}
        </nav>
      </>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-bg" data-symbol={symbol}>
      <TopBar accounts={accountsList} onAccountChange={onAccountChange} />
      {body}
      <Hotkeys />
    </div>
  );
}

/** Starts the market-data feeds once, for the whole terminal. */
function Feeds() {
  const symbol = useTerminal((s) => s.symbol);
  const { data } = useSymbolsFeed();
  usePricesFeed();
  useTickersFeed(data?.symbols ?? []);
  useSymbolFeed(symbol);
  return null;
}

export function TerminalApp() {
  const { accounts, isLoading, error, mutate } = useAccounts();
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('app-locked');
    return () => document.body.classList.remove('app-locked');
  }, []);

  const tradable = useMemo(() => (accounts ?? []).filter((a) => a.status === 'active'), [accounts]);

  // pick: ?account= → last used → first active
  useEffect(() => {
    if (!tradable.length) return;
    let want: string | null = null;
    try { want = new URL(window.location.href).searchParams.get('account') || window.localStorage.getItem(LAST_ACCOUNT); } catch { /* storage blocked */ }
    setChosen((cur) => (cur && tradable.some((a) => a.id === cur) ? cur : tradable.find((a) => a.id === want)?.id ?? tradable[0].id));
  }, [tradable]);

  const change = useCallback((id: string) => {
    setChosen(id);
    try { window.localStorage.setItem(LAST_ACCOUNT, id); } catch { /* ignore */ }
  }, []);

  if (isLoading && !accounts) return <BootScreen label="Loading accounts" />;
  if (error && !accounts) return <div className="grid h-dvh place-items-center bg-bg"><ErrorState error={error} onRetry={() => mutate()} title="Could not load your accounts" /></div>;

  if (!tradable.length || !chosen) {
    const other = (accounts ?? []).filter((a) => a.status !== 'active');
    return (
      <div className="grid h-dvh place-items-center bg-bg p-6">
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title={other.length ? 'No active trading account' : 'No trading account yet'}
          description={other.length ? `Your accounts are ${[...new Set(other.map((a) => a.status))].join(', ')}. Open the dashboard to review them or buy a new one.` : 'Choose an account size to start trading.'}
          action={<div className="flex gap-2"><SiteLink site="app" path="/"><Button variant="secondary">Open dashboard</Button></SiteLink><SiteLink site="www" path="/#pricing"><Button variant="primary">View plans</Button></SiteLink></div>}
        />
      </div>
    );
  }

  return (
    <TerminalDataProvider accountId={chosen}>
      <Feeds />
      <Workspace accountsList={tradable} onAccountChange={change} />
    </TerminalDataProvider>
  );
}
