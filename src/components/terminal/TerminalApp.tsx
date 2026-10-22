'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { OrderTicket } from './OrderTicket';
import { PairBar } from './PairBar';
import { usePendingEngine } from './pendingEngine';
import { PositionsPanel } from './PositionsPanel';
import { PriceChart } from './PriceChart';
import { useTerminal } from './store';
import { TopBar } from './TopBar';
import { TradeCardModal } from './TradeCard';
import { useTerminalLayout } from './useLayout';
import { Watchlist } from './Watchlist';

const LAST_ACCOUNT = 'sg-terminal-account';

const Panel = ({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) => (
  <div className={cn('min-h-0 min-w-0 bg-panel', className)}><ErrorBoundary label={label} compact>{children}</ErrorBoundary></div>
);

function Workspace({ accountsList, onAccountChange }: { accountsList: Account[]; onAccountChange: (id: string) => void }) {
  const { accountId, positions, refresh } = useTerminalData();
  const symbol = useTerminal((s) => s.symbol);
  const layout = useTerminalLayout();

  useEffect(() => { useTerminal.setState({ accountId }); }, [accountId]);
  usePendingEngine(accountId, refresh);

  let body: React.ReactNode;
  if (layout === null) body = <div className="grid flex-1 place-items-center"><BootScreen label="Loading terminal" /></div>;
  else if (layout === 'mobile') body = <MobileTerminal />;
  else {
    // MetaTrader layout: Market Watch · chart + terminal · order ticket
    body = (
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_290px] gap-px bg-line xl:grid-cols-[240px_minmax(0,1fr)_300px] 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Panel label="Market Watch"><Watchlist /></Panel>
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_minmax(200px,34%)] gap-px bg-line">
          <PairBar />
          <Panel label="Chart"><PriceChart positions={positions} /></Panel>
          <Panel label="Terminal"><PositionsPanel className="h-full" /></Panel>
        </div>
        <Panel label="Order ticket" className="overflow-y-auto overscroll-contain">
          <OrderTicket />
          <AccountPanel />
        </Panel>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex min-h-0 w-full flex-col overflow-hidden bg-bg" data-symbol={symbol}>
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
      <Workspace accountsList={tradable} onAccountChange={change} />
    </TerminalDataProvider>
  );
}
