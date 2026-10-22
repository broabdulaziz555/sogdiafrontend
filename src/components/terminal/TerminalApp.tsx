'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Wallet } from 'lucide-react';
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
import { MobileTerminal } from './mobile/MobileTerminal';
import { OrderBook } from './OrderBook';
import { OrderTicket } from './OrderTicket';
import { PairBar } from './PairBar';
import { usePendingEngine } from './pendingEngine';
import { PositionsPanel } from './PositionsPanel';
import { useTerminal } from './store';
import { TopBar } from './TopBar';
import { useTerminalLayout } from './useLayout';
import { Watchlist } from './Watchlist';

// the charting library and the share-card modal are only needed once the terminal is up — keep them out of the first bundle
const PriceChart = dynamic(() => import('./PriceChart').then((m) => m.PriceChart), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading chart…</div> });
const TradeCardModal = dynamic(() => import('./TradeCard').then((m) => m.TradeCardModal), { ssr: false });

const LAST_ACCOUNT = 'sg-terminal-account';

const Panel = ({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) => (
  <div className={cn('card min-h-0 min-w-0 overflow-hidden rounded-2xl', className)}><ErrorBoundary label={label} compact>{children}</ErrorBoundary></div>
);

function Workspace({ accountsList, onAccountChange, onInactive }: { accountsList: Account[]; onAccountChange: (id: string) => void; onInactive: () => void }) {
  const { accountId, account, positions, refresh, applyOpened, addOptimistic, dropOptimistic } = useTerminalData();
  const symbol = useTerminal((s) => s.symbol);
  const layout = useTerminalLayout();

  useEffect(() => { useTerminal.setState({ accountId }); }, [accountId]);
  usePendingEngine(accountId, refresh, applyOpened, addOptimistic, dropOptimistic);
  // the engine failed / passed this account: re-read the account list so the terminal moves off it instead of showing a dead account
  const notified = useRef('');
  useEffect(() => {
    if (!account || account.status === 'active') return;
    const key = `${accountId}:${account.status}`;
    if (notified.current === key) return; // once per change, never in a loop
    notified.current = key;
    onInactive();
  }, [accountId, account, onInactive]);

  let body: React.ReactNode;
  if (layout === null) body = <div className="grid flex-1 place-items-center"><BootScreen label="Loading terminal" /></div>;
  else if (layout === 'mobile') body = <MobileTerminal />;
  else {
    // Match-Trader style: [Market Watch / Order book] · [instrument bar / chart / positions ledger] · [order ticket / account]
    body = (
      <div className="flex min-h-0 flex-1 flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)_288px] gap-2 xl:grid-cols-[248px_minmax(0,1fr)_304px] 2xl:grid-cols-[272px_minmax(0,1fr)_328px]">
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2">
            <Panel label="Market Watch"><Watchlist /></Panel>
            <Panel label="Order book"><OrderBook /></Panel>
          </div>
          <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_minmax(176px,32%)] gap-2">
            <PairBar />
            <Panel label="Chart"><PriceChart positions={positions} /></Panel>
            <Panel label="Terminal"><PositionsPanel className="h-full" /></Panel>
          </div>
          <Panel label="Order ticket" className="overflow-y-auto overscroll-contain">
            <OrderTicket />
            <AccountPanel />
          </Panel>
        </div>
      </div>
    );
  }

  // Chrome's "Desktop site" mode gives phones a ~1000px layout viewport and shrinks everything. Scale it back up so the mobile layout is readable.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const calc = () => {
      const sw = Math.min(window.screen.width, window.screen.height);
      const z = sw < 600 && window.innerWidth > sw * 1.25 ? Math.min(3, window.innerWidth / Math.max(sw, 360)) : 1;
      setZoom(+z.toFixed(3));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  return (
    <div className="fixed inset-0 flex min-h-0 w-full flex-col overflow-hidden bg-bg pl-safe pr-safe" style={zoom !== 1 ? ({ zoom } as React.CSSProperties) : undefined} data-symbol={symbol}>
      <TopBar accounts={accountsList} onAccountChange={onAccountChange} />
      {body}
      <Hotkeys />
      <TradeCardModal />
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
      <Workspace accountsList={tradable} onAccountChange={change} onInactive={() => void mutate()} />
    </TerminalDataProvider>
  );
}
