'use client';

import { useMemo, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHead, Stat } from '@/components/dashboard/PageHead';
import { StatStrip } from '@/components/ui/Panel';
import { AccountCard, AccountCardSkeleton } from '@/components/dashboard/AccountCard';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Segmented } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { SiteLink } from '@/components/ui/SiteLink';
import { useAccounts } from '@/hooks/useAccounts';
import { fmtPct, fmtSigned, fmtUsd } from '@/lib/format';

type Filter = 'all' | 'active' | 'passed' | 'ended';

export default function OverviewPage() {
  const t = useTranslations('dash.nav');
  const { accounts, error, isLoading, mutate } = useAccounts();
  const [filter, setFilter] = useState<Filter>('all');

  const stats = useMemo(() => {
    const list = accounts ?? [];
    const live = list.filter((a) => a.status === 'active' || a.status === 'passed');
    const balance = live.reduce((s, a) => s + a.balance, 0);
    const equity = live.reduce((s, a) => s + a.equity, 0);
    const size = live.reduce((s, a) => s + a.size, 0);
    return { live: live.length, balance, equity, funded: size, pnl: balance - size, total: list.length };
  }, [accounts]);

  const shown = useMemo(() => {
    const list = accounts ?? [];
    switch (filter) {
      case 'active': return list.filter((a) => a.status === 'active');
      case 'passed': return list.filter((a) => a.status === 'passed');
      case 'ended': return list.filter((a) => !['active', 'passed'].includes(a.status));
      default: return list;
    }
  }, [accounts, filter]);

  const loading = isLoading && !accounts;

  return (
    <>
      <PageHead
        title={t('overview')}
        subtitle="Live balances, equity curves and drawdown headroom for every account you own."
        actions={
          <SiteLink site="www" path="/#pricing" className="inline-flex h-8 items-center gap-2 border border-accent bg-accent px-3.5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90">
            <Plus className="h-4 w-4" />{t('buyAccount')}
          </SiteLink>
        }
      />

      <StatStrip className="mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-panel p-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-3 h-6 w-28" /></div>)
        ) : (
          <>
            <Stat label="Total balance" value={fmtUsd(stats.balance)} sub="Active & passed accounts" />
            <Stat label="Total equity" value={fmtUsd(stats.equity)} sub={`${stats.live} live account${stats.live === 1 ? '' : 's'}`} />
            <Stat label="Net realised PnL" value={fmtSigned(stats.pnl)} tone={stats.pnl > 0 ? 'up' : stats.pnl < 0 ? 'down' : undefined} sub={stats.funded ? fmtPct((stats.pnl / stats.funded) * 100, 2, true) + ' of account size' : '—'} />
            <Stat label="Accounts" value={stats.total} sub="All time" />
          </>
        )}
      </StatStrip>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          size="sm"
          ariaLabel="Filter accounts"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All${accounts ? ` · ${accounts.length}` : ''}` },
            { value: 'active', label: 'Active' },
            { value: 'passed', label: 'Passed' },
            { value: 'ended', label: 'Ended' },
          ]}
        />
      </div>

      {error && !accounts ? (
        <div className="border border-line bg-panel"><ErrorState error={error} onRetry={() => mutate()} /></div>
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <AccountCardSkeleton key={i} />)}</div>
      ) : shown.length === 0 ? (
        <div className="border border-dashed border-line2 bg-panel/50">
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title={accounts?.length ? 'No accounts match this filter' : 'No accounts yet'}
            description={accounts?.length ? 'Try another filter to see the rest of your accounts.' : 'Purchase a One-Step or Instant account and it will appear here the moment your payment confirms.'}
            action={!accounts?.length ? (
              <SiteLink site="www" path="/#pricing" className="inline-flex h-8 items-center gap-2 border border-accent bg-accent px-3.5 text-sm font-semibold text-accent-fg hover:bg-accent/90">
                <Plus className="h-4 w-4" />Choose an account
              </SiteLink>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => <AccountCard key={a.id} account={a} />)}
        </div>
      )}
    </>
  );
}
