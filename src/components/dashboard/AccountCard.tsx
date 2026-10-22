'use client';

import Link from 'next/link';
import { ArrowUpRight, CandlestickChart } from 'lucide-react';
import { StatusBadge, Badge } from '@/components/ui/Primitives';
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

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** Drawdown headroom, derived from the same formulas the risk engine uses (see API contract §6). */
function drawdown(a: Account) {
  const dailyRoom = a.daily_start_balance * (a.daily_dd_pct / 100);
  const maxRoom = a.size * (a.max_dd_pct / 100);
  return {
    daily: { used: clamp01(dailyRoom ? (a.daily_start_balance - a.equity) / dailyRoom : 0), floor: a.daily_start_balance - dailyRoom },
    max: { used: clamp01(maxRoom ? (a.size - a.equity) / maxRoom : 0), floor: a.size - maxRoom },
  };
}

/** Segmented gauge: 20 hairline cells that fill left→right. Colour escalates lime → amber → red with usage. */
function Gauge({ label, limitPct, used, floor }: { label: string; limitPct: number; used: number; floor: number }) {
  const cells = 20;
  const filled = Math.round(used * cells);
  const tone = used >= 0.8 ? 'bg-down' : used >= 0.5 ? 'bg-warn' : 'bg-accent';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">{label} <span className="text-subtle/80">· {limitPct}%</span></span>
        <span className={cn('num font-mono text-2xs', used >= 0.8 ? 'text-down' : 'text-muted')}>{(used * 100).toFixed(0)}% used</span>
      </div>
      <div className="flex gap-px" role="meter" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)}>
        {Array.from({ length: cells }).map((_, i) => <span key={i} className={cn('h-1.5 flex-1', i < filled ? tone : 'bg-fg/[0.08]')} />)}
      </div>
      <p className="num mt-1 font-mono text-2xs text-subtle">Floor {fmtUsd(floor)}</p>
    </div>
  );
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
  const dd = drawdown(a);
  const up = pnl >= 0;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden border border-line bg-panel transition-colors',
        'hover:border-line2 focus-within:border-line2',
        // a 2px status edge on the left reads like a ticker row in a terminal
        'shadow-[inset_2px_0_0_var(--edge)]',
        !tradable && 'opacity-90',
      )}
      style={{ ['--edge' as string]: tradable ? 'rgb(var(--accent))' : a.status === 'passed' ? 'rgb(var(--up))' : 'rgb(var(--line2))' }}
    >
      {/* instrument header strip */}
      <header className="flex h-8 items-center justify-between gap-2 border-b border-line bg-panel2/70 pl-4 pr-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone={a.type === 'one_step' ? 'info' : 'accent'}>{a.type === 'one_step' ? 'One-Step' : 'Instant'}</Badge>
          {a.is_gifted && <Badge>Gifted</Badge>}
          <span className="num truncate font-mono text-2xs text-subtle">#{shortId(a.id)}</span>
        </div>
        <StatusBadge status={a.status} />
      </header>

      <div className="px-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-muted">{accountLabel(a)}</h3>
            <p className="num mt-1 font-mono text-[26px] font-semibold leading-none tracking-tight">{fmtUsd(a.balance)}</p>
          </div>
          <div className="text-right">
            <p className={cn('num font-mono text-sm font-semibold', pnlClass(pnl))}>{fmtSigned(pnl)}</p>
            <p className={cn('num font-mono text-2xs', up ? 'text-up/80' : 'text-down/80')}>{fmtPct(pnlPct, 2, true)}</p>
          </div>
        </div>
      </div>

      {/* equity curve — full bleed */}
      <div className="mt-3 h-14 border-y border-line/70 bg-bg/40">
        {isLoading && !data ? <Skeleton className="h-full rounded-none" /> : <Sparkline values={values} baseline={a.size} height={56} className="h-14" />}
      </div>

      {/* instrument readouts */}
      <dl className="grid grid-cols-4 divide-x divide-line border-b border-line text-center">
        {[
          ['Equity', fmtUsd(a.equity).replace(/\.00$/, '')],
          ['Daily DD', `${a.daily_dd_pct}%`],
          ['Max DD', `${a.max_dd_pct}%`],
          ['Lev', `${a.max_leverage}×`],
        ].map(([k, v]) => (
          <div key={k} className="px-1 py-2">
            <dt className="text-3xs font-medium uppercase tracking-[0.1em] text-subtle">{k}</dt>
            <dd className="num mt-0.5 truncate font-mono text-xs font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 px-4 py-3">
        {progress != null && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="label">Profit target · {targetPct}%</span>
              <span className={cn('num font-mono text-2xs', progress >= 100 ? 'text-up' : 'text-muted')}>{progress.toFixed(0)}%</span>
            </div>
            <div className="relative h-1.5 bg-fg/[0.08]">
              <div className={cn('h-full transition-[width] duration-500', a.status === 'passed' || progress >= 100 ? 'bg-up' : 'bg-accent')} style={{ width: `${progress}%` }} />
              {[25, 50, 75].map((t) => <span key={t} className="absolute top-0 h-full w-px bg-bg/80" style={{ left: `${t}%` }} aria-hidden />)}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Gauge label="Daily DD" limitPct={a.daily_dd_pct} used={dd.daily.used} floor={dd.daily.floor} />
          <Gauge label="Max DD" limitPct={a.max_dd_pct} used={dd.max.used} floor={dd.max.floor} />
        </div>
        {a.next_payout_at && (
          <p className="flex items-center justify-between border-t border-line/70 pt-2.5 text-2xs">
            <span className="label">Next payout window</span>
            <span className="num font-mono text-muted">{dateShort(a.next_payout_at)}</span>
          </p>
        )}
      </div>

      <footer className="mt-auto grid grid-cols-[1fr_auto] border-t border-line">
        {tradable ? (
          <SiteLink site="trade" path={`/?account=${a.id}`} className="relative z-10 inline-flex h-9 items-center justify-center gap-2 bg-accent text-xs font-semibold uppercase tracking-[0.08em] text-accent-fg transition-colors hover:bg-accent/90">
            <CandlestickChart className="h-4 w-4" /> Open terminal
          </SiteLink>
        ) : (
          <span className="inline-flex h-9 cursor-not-allowed items-center justify-center text-xs uppercase tracking-[0.08em] text-subtle">Not tradable</span>
        )}
        <Link
          href={`/accounts/${a.id}`}
          aria-label={`Details for ${accountLabel(a)}`}
          className="inline-flex h-9 items-center gap-1 border-l border-line px-3.5 text-xs font-medium uppercase tracking-[0.08em] text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg after:absolute after:inset-0 after:z-0 after:content-['']"
        >
          Details <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </article>
  );
}

export function AccountCardSkeleton() {
  return (
    <div className="border border-line bg-panel" role="status" aria-label="Loading account">
      <div className="flex h-8 items-center justify-between border-b border-line bg-panel2/70 px-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-14" /></div>
      <div className="space-y-2 p-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-40" /></div>
      <Skeleton className="h-14 rounded-none" />
      <div className="grid grid-cols-4 gap-px p-px">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      <div className="space-y-3 p-4"><Skeleton className="h-3" /><Skeleton className="h-8" /></div>
      <Skeleton className="h-9 rounded-none" />
    </div>
  );
}
