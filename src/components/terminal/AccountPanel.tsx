'use client';

import { memo } from 'react';
import { Target } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtNum, fmtSigned, fmtUsd } from '@/lib/format';
import { Meter, StatusBadge } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTerminalData } from './data';
import { ddUsage, toneFor } from './risk';

function Stat({ k, v, tone, big }: { k: string; v: React.ReactNode; tone?: 'up' | 'down' | 'warn'; big?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-2xs uppercase tracking-wider text-subtle">{k}</dt>
      <dd className={cn('num truncate font-mono', big ? 'text-md font-semibold' : 'text-sm', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{v}</dd>
    </div>
  );
}

function Gauge({ label, used, left, tone }: { label: string; used: number; left: string; tone: 'up' | 'warn' | 'down' }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-2xs">
        <span className="text-subtle">{label}</span>
        <span className={cn('num font-mono', tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : 'text-muted')}>{fmtNum(used * 100, 0)}% used · {left} left</span>
      </div>
      <Meter value={used * 100} tone={tone} />
    </div>
  );
}

function AccountPanelInner() {
  const { account, metrics, loading } = useTerminalData();
  if (!account || !metrics) {
    return (
      <div className="space-y-3 p-3" aria-busy={loading}>
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        <Skeleton className="h-10" /><Skeleton className="h-10" />
      </div>
    );
  }
  const dd = ddUsage(account, metrics);
  const marginLevel = metrics.used_margin > 0 ? (metrics.equity / metrics.used_margin) * 100 : null;
  const mlTone = marginLevel == null ? undefined : marginLevel < 120 ? 'down' : marginLevel < 200 ? 'warn' : undefined;
  const target = metrics.profit_target;
  const pct = target && target > account.size ? Math.max(0, Math.min(100, ((metrics.equity - account.size) / (target - account.size)) * 100)) : null;

  return (
    <section className="space-y-3 border-t border-line p-3" aria-label="Account">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Account</h2>
        <StatusBadge status={account.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Stat big k="Equity" v={fmtUsd(metrics.equity)} />
        <Stat big k="Unrealized PnL" v={`${fmtSigned(metrics.unrealized_pnl)}`} tone={metrics.unrealized_pnl > 0 ? 'up' : metrics.unrealized_pnl < 0 ? 'down' : undefined} />
        <Stat k="Balance" v={fmtUsd(account.balance)} />
        <Stat k="Free margin" v={fmtUsd(metrics.free_margin)} />
        <Stat k="Used margin" v={fmtUsd(metrics.used_margin)} />
        <Stat k="Margin level" v={marginLevel == null ? '—' : `${fmtNum(marginLevel, 0)}%`} tone={mlTone} />
      </dl>
      <div className="space-y-2.5">
        <Gauge label="Daily drawdown" used={dd.daily} tone={toneFor(dd.daily)} left={fmtUsd(Math.max(0, metrics.daily_dd_remaining))} />
        <Gauge label="Max drawdown" used={dd.max} tone={toneFor(dd.max)} left={fmtUsd(Math.max(0, metrics.max_dd_remaining))} />
      </div>
      {pct != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-2xs">
            <span className="inline-flex items-center gap-1 text-subtle"><Target className="h-3 w-3" />Profit target {fmtUsd(target)}</span>
            <span className={cn('num font-mono', metrics.target_reached ? 'text-up' : 'text-muted')}>{metrics.target_reached ? 'Reached' : `${fmtNum(pct, 0)}%`}</span>
          </div>
          <Meter value={pct} tone="up" />
        </div>
      )}
      <p className="text-2xs leading-relaxed text-subtle">Limits are measured on equity. Breach closes every position at market.</p>
    </section>
  );
}

export const AccountPanel = memo(AccountPanelInner);
