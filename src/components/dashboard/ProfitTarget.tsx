'use client';

import Link from 'next/link';
import { ChevronRight, Target, Trophy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtSigned, fmtUsd } from '@/lib/format';
import type { Account } from '@/lib/types';
import { accountLabel } from './AccountCard';

/** Progress figures toward the evaluation profit target, measured on equity (what the engine checks). */
export function targetProgress(a: Pick<Account, 'size' | 'equity' | 'profit_target_pct' | 'status'>) {
  if (a.profit_target_pct == null || a.profit_target_pct <= 0) return null;
  const goal = a.size * (a.profit_target_pct / 100);
  const profit = a.equity - a.size;
  const done = a.status === 'passed';
  const pct = done ? 100 : Math.max(0, Math.min(100, (profit / goal) * 100));
  return { goal, profit, pct, remaining: Math.max(0, goal - profit), done: done || profit >= goal, targetEquity: a.size + goal };
}

/** Big progress bar with 25 / 50 / 75 % ticks, current profit vs goal and what is left. */
export function ProfitTargetBar({ account: a, compact }: { account: Account; compact?: boolean }) {
  const t = targetProgress(a);
  if (!t) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('num font-semibold', compact ? 'text-sm' : 'text-lg', t.profit > 0 ? 'text-up' : t.profit < 0 ? 'text-down' : 'text-fg')}>
          {fmtSigned(t.profit)} <span className="text-xs font-normal text-subtle">/ {fmtUsd(t.goal)}</span>
        </p>
        <p className={cn('num font-semibold', compact ? 'text-sm' : 'text-lg', t.done ? 'text-up' : 'text-fg')}>{t.pct.toFixed(t.pct < 10 && t.pct > 0 ? 1 : 0)}%</p>
      </div>
      <div className={cn('relative mt-2 w-full overflow-hidden rounded-full bg-fg/[0.07]', compact ? 'h-2' : 'h-3')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(t.pct)} aria-label="Profit target progress">
        <div className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-700', t.done ? 'from-up/70 to-up' : 'from-accent/60 to-accent')} style={{ width: `${Math.max(t.pct, t.pct > 0 ? 2 : 0)}%` }} />
        {[25, 50, 75].map((m) => <span key={m} className="absolute inset-y-0 w-px bg-bg/60" style={{ left: `${m}%` }} aria-hidden />)}
      </div>
      <p className="num mt-1.5 text-xs text-subtle">
        {t.done
          ? 'Target reached'
          : <>{fmtUsd(t.remaining)} to go · target equity {fmtUsd(t.targetEquity)} ({a.profit_target_pct}%)</>}
      </p>
    </div>
  );
}

/** Dashboard panel: one row per evaluation account that has a profit target. */
export function ProfitTargetsPanel({ accounts }: { accounts: Account[] }) {
  const list = accounts.filter((a) => a.profit_target_pct != null && (a.status === 'active' || a.status === 'passed'));
  if (!list.length) return null;
  return (
    <section className="card mb-6 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 text-accent"><Target className="h-4 w-4" /></span>
        <h2 className="text-md font-semibold">Profit targets</h2>
        <span className="ml-auto text-xs text-subtle">{list.filter((a) => targetProgress(a)?.done).length} of {list.length} reached</span>
      </div>
      <ul className="space-y-4">
        {list.map((a) => (
          <li key={a.id}>
            <Link href={`/accounts/${a.id}`} className="group block rounded-xl p-2 -m-2 transition-colors hover:bg-fg/[0.03]">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                {targetProgress(a)?.done && <Trophy className="h-3.5 w-3.5 text-up" />}
                <span className="truncate">{accountLabel(a)}</span>
                <span className="num text-xs text-subtle">#{a.id.slice(0, 8)}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />
              </p>
              <ProfitTargetBar account={a} compact />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
