'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarClock, CandlestickChart, Target } from 'lucide-react';
import { StatusBadge, Badge, Meter } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { SiteLink } from '@/components/ui/SiteLink';
import { Sparkline } from './Charts';
import { useApi } from '@/hooks/useApi';
import { dateShort, fmtPct, fmtSize, fmtSigned, fmtUsd, pnlClass, shortId } from '@/lib/format';
import type { Account, EquityCurveResponse } from '@/lib/types';
import { cn } from '@/lib/cn';

export function accountLabel(a: Pick<Account, 'type' | 'size'>) {
  return `${a.type === 'one_step' ? 'One-Step' : 'Instant'} ${fmtSize(a.size)}`;
}

export function AccountCard({ account: a }: { account: Account }) {
  const { data, isLoading } = useApi<EquityCurveResponse>(`/accounts/${a.id}/equity-curve`, { limit: 60 }, { revalidateOnFocus: false });
  const values = data?.points.map((p) => p.equity) ?? [];
  if (values.length) values.push(a.equity);

  const pnl = a.balance - a.size;
  const pnlPct = (pnl / a.size) * 100;
  const tradable = a.status === 'active';
  const targetPct = a.profit_target_pct;
  const progress = targetPct ? Math.max(0, Math.min(100, ((a.equity - a.size) / (a.size * (targetPct / 100))) * 100)) : null;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-all duration-300',
        'hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glow focus-within:border-accent/40',
        !tradable && 'opacity-90',
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />

      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={a.type === 'one_step' ? 'info' : 'accent'}>{a.type === 'one_step' ? 'One-Step' : 'Instant'}</Badge>
            {a.is_gifted && <Badge>Gifted</Badge>}
          </div>
          <h3 className="mt-2.5 truncate text-lg font-semibold tracking-tight">{accountLabel(a)}</h3>
          <p className="font-mono text-2xs text-subtle">#{shortId(a.id)}</p>
        </div>
        <StatusBadge status={a.status} />
      </div>

      <div className="px-5">
        <p className="label">Balance</p>
        <p className="num mt-0.5 text-3xl font-bold tracking-tight">{fmtUsd(a.balance)}</p>
        <div className="mt-1 flex items-center gap-3 text-xs">
          <span className="text-muted">Equity <span className="num font-mono text-fg">{fmtUsd(a.equity)}</span></span>
          <span className={cn('num font-mono font-medium', pnlClass(pnl))}>{fmtSigned(pnl)} ({fmtPct(pnlPct, 2, true)})</span>
        </div>
      </div>

      <div className="mt-3 h-12 px-5">
        {isLoading && !data ? <Skeleton className="h-10" /> : <Sparkline values={values} baseline={a.size} height={44} />}
      </div>

      <div className="mt-3 space-y-3 px-5 pb-4">
        {progress != null && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted"><Target className="h-3 w-3" />Target {targetPct}%</span>
              <span className="num font-mono">{progress.toFixed(0)}%</span>
            </div>
            <Meter value={progress} tone={a.status === 'passed' ? 'up' : 'accent'} />
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Daily DD', `${a.daily_dd_pct}%`],
            ['Max DD', `${a.max_dd_pct}%`],
            ['Leverage', `${a.max_leverage}×`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-panel2 px-2 py-1.5">
              <p className="text-2xs text-subtle">{k}</p>
              <p className="num font-mono text-xs font-medium">{v}</p>
            </div>
          ))}
        </div>
        {a.next_payout_at && (
          <p className="flex items-center gap-1.5 text-xs text-muted"><CalendarClock className="h-3.5 w-3.5" />Next payout window <span className="num text-fg">{dateShort(a.next_payout_at)}</span></p>
        )}
      </div>

      <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 border-t border-line bg-panel2/50 p-3">
        {tradable ? (
          <SiteLink site="trade" path={`/?account=${a.id}`} className="relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-accent-fg transition-all hover:brightness-110">
            <CandlestickChart className="h-4 w-4" /> Trade
          </SiteLink>
        ) : (
          <span className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md border border-line text-sm text-subtle">Not tradable</span>
        )}
        <Link
          href={`/accounts/${a.id}`}
          aria-label={`Details for ${accountLabel(a)}`}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-3 text-sm font-medium text-muted transition-colors hover:border-subtle/70 hover:text-fg after:absolute after:inset-0 after:z-0 after:content-['']"
        >
          Details <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

export function AccountCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5" role="status" aria-label="Loading account">
      <div className="flex justify-between"><div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-5 w-32" /></div><Skeleton className="h-5 w-14" /></div>
      <Skeleton className="mt-6 h-8 w-40" />
      <Skeleton className="mt-2 h-3 w-52" />
      <Skeleton className="mt-5 h-10" />
      <div className="mt-5 grid grid-cols-3 gap-2"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
      <Skeleton className="mt-5 h-9" />
    </div>
  );
}
