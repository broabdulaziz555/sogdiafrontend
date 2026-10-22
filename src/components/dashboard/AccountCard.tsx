'use client';

import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, CandlestickChart, Layers } from 'lucide-react';
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

/** Drawdown gauge: a smooth rounded bar that fills with usage. Colour escalates lime → amber → red. */
function Gauge({ label, limitPct, used, floor }: { label: string; limitPct: number; used: number; floor: number }) {
  const tone = used >= 0.8 ? 'from-down/80 to-down' : used >= 0.5 ? 'from-warn/80 to-warn' : 'from-accent/70 to-accent';
  return (
    <div className="rounded-2xl bg-panel2/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label} <span className="text-subtle">· {limitPct}%</span></span>
        <span className={cn('num text-xs font-semibold', used >= 0.8 ? 'text-down' : 'text-fg')}>{(used * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/[0.08]" role="meter" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)}>
        <div className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500', tone)} style={{ width: `${Math.max(used * 100, used > 0 ? 3 : 0)}%` }} />
      </div>
      <p className="num mt-1.5 text-2xs text-subtle">Floor {fmtUsd(floor)}</p>
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
      className={cn('card group relative flex flex-col overflow-hidden rounded-3xl transition duration-200', 'hover:-translate-y-0.5 hover:border-line2 focus-within:border-line2', !tradable && 'opacity-90')}
      style={{ ['--edge' as string]: tradable ? 'rgb(var(--accent) / 0.8)' : a.status === 'passed' ? 'rgb(var(--up) / 0.8)' : 'rgb(var(--line2))' }}
    >
      {/* status light across the top edge */}
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--edge)] to-transparent" />

      <div className="p-5 pb-0">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line/70 bg-gradient-to-br from-accent/20 to-accent/[0.04] text-accent"><Layers className="h-5 w-5" strokeWidth={1.75} /></span>
            <div className="min-w-0">
              <h3 className="truncate text-md font-semibold tracking-tight">{accountLabel(a)}</h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
                <span className="num">#{shortId(a.id)}</span>
                {a.is_gifted && <Badge className="!py-0">Gifted</Badge>}
              </p>
            </div>
          </div>
          <StatusBadge status={a.status} />
        </header>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">Balance</p>
            <span className={cn('num inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', up ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>
              {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {fmtSigned(pnl)} <span className="opacity-75">({fmtPct(pnlPct, 2, true)})</span>
            </span>
          </div>
          <p className="num mt-1.5 text-[34px] font-semibold leading-none tracking-tight">{fmtUsd(a.balance)}</p>
        </div>
      </div>

      {/* equity curve */}
      <div className="mx-5 mt-4 h-16 overflow-hidden rounded-2xl border border-line/50 bg-bg/40">
        {isLoading && !data ? <Skeleton className="h-full rounded-none" /> : <Sparkline values={values} baseline={a.size} height={64} className="h-16" />}
      </div>

      {/* readouts */}
      <dl className="mx-5 mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          ['Equity', fmtUsd(a.equity).replace(/\.\d+$/, '')],
          ['Daily DD', `${a.daily_dd_pct}%`],
          ['Max DD', `${a.max_dd_pct}%`],
          ['Leverage', `1:${a.max_leverage}`],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl bg-panel2/60 px-1 py-2.5">
            <dt className="text-2xs font-medium text-subtle">{k}</dt>
            <dd className="num mt-0.5 truncate text-[13px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 px-5 pt-4">
        {progress != null && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-muted">Profit target <span className="text-subtle">· {targetPct}%</span></span>
              <span className={cn('num text-xs font-semibold', progress >= 100 ? 'text-up' : 'text-fg')}>{progress.toFixed(0)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-fg/[0.08]">
              <div className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500', a.status === 'passed' || progress >= 100 ? 'from-up/70 to-up' : 'from-accent/60 to-accent')} style={{ width: `${Math.max(progress, progress > 0 ? 3 : 0)}%` }} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Gauge label="Daily DD" limitPct={a.daily_dd_pct} used={dd.daily.used} floor={dd.daily.floor} />
          <Gauge label="Max DD" limitPct={a.max_dd_pct} used={dd.max.used} floor={dd.max.floor} />
        </div>
        {a.next_payout_at && (
          <p className="flex items-center justify-between text-xs">
            <span className="text-muted">Next payout window</span>
            <span className="num font-medium">{dateShort(a.next_payout_at)}</span>
          </p>
        )}
      </div>

      <footer className="mt-auto grid grid-cols-[1fr_auto] gap-2.5 p-5">
        {tradable ? (
          <SiteLink site="trade" path={`/?account=${a.id}`} className="relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-accent to-[rgb(154_226_84)] text-sm font-semibold text-accent-fg shadow-btn transition hover:brightness-105 active:scale-[0.985]">
            <CandlestickChart className="h-4 w-4" /> Open terminal
          </SiteLink>
        ) : (
          <span className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-xl bg-fg/[0.05] text-sm text-subtle">Not tradable</span>
        )}
        <Link
          href={`/accounts/${a.id}`}
          aria-label={`Details for ${accountLabel(a)}`}
          className="inline-flex h-11 items-center gap-1 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:border-line2 hover:bg-fg/[0.05] hover:text-fg after:absolute after:inset-0 after:z-0 after:content-['']"
        >
          Details <ArrowUpRight className="h-4 w-4" />
        </Link>
      </footer>
    </article>
  );
}

export function AccountCardSkeleton() {
  return (
    <div className="card rounded-3xl p-5" role="status" aria-label="Loading account">
      <div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-2xl" /><div className="space-y-2"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-16" /></div></div>
      <Skeleton className="mt-5 h-8 w-44" />
      <Skeleton className="mt-4 h-16 rounded-2xl" />
      <div className="mt-3 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      <div className="mt-4 space-y-3"><Skeleton className="h-3" /><Skeleton className="h-16 rounded-2xl" /></div>
      <Skeleton className="mt-5 h-11 rounded-xl" />
    </div>
  );
}
