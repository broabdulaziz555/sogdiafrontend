'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CandlestickChart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtPct, fmtSigned, fmtUsd, pnlClass } from '@/lib/format';
import type { Account } from '@/lib/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/Primitives';
import { SiteLink } from '@/components/ui/SiteLink';
import { accountLabel, drawdown } from './AccountCard';

/** A thin usage bar with its percentage, coloured like the cards' gauges. */
function UseBar({ used, tone = 'risk' }: { used: number; tone?: 'risk' | 'target' }) {
  const pct = Math.max(0, Math.min(100, used * 100));
  const bar = tone === 'target' ? (pct >= 100 ? 'bg-up' : 'bg-accent') : pct >= 80 ? 'bg-down' : pct >= 50 ? 'bg-warn' : 'bg-up';
  return (
    <div className="flex min-w-[96px] items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-fg/[0.08]"><div className={cn('h-full rounded-full', bar)} style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }} /></div>
      <span className="num w-9 text-right font-mono text-xs text-muted">{pct.toFixed(0)}%</span>
    </div>
  );
}

/** Dense, sortable list of accounts — the alternative to the card grid for traders with several accounts. */
export function AccountsTable({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const cols: Column<Account>[] = [
    { key: 'acc', header: 'Account', sortValue: (a) => a.size, searchText: (a) => `${accountLabel(a)} ${a.id}`, cell: (a) => (
      <div className="min-w-0"><p className="truncate font-medium">{accountLabel(a)}</p><p className="num font-mono text-2xs text-subtle">#{a.id.slice(0, 8)}</p></div>) },
    { key: 'status', header: 'Status', sortValue: (a) => a.status, cell: (a) => <StatusBadge status={a.status} /> },
    { key: 'bal', header: 'Balance', align: 'right', sortValue: (a) => a.balance, cell: (a) => <span className="num font-mono">{fmtUsd(a.balance)}</span> },
    { key: 'pnl', header: 'P&L', align: 'right', sortValue: (a) => a.balance - a.size, cell: (a) => {
      const p = a.balance - a.size;
      return <span className={cn('num font-mono font-medium', pnlClass(p))}>{fmtSigned(p)} <span className="text-2xs opacity-75">({fmtPct((p / a.size) * 100, 2, true)})</span></span>;
    } },
    { key: 'target', header: 'Target', align: 'right', hideBelow: 'md', sortValue: (a) => (a.profit_target_pct ? (a.equity - a.size) / (a.size * (a.profit_target_pct / 100)) : -1), cell: (a) =>
      a.profit_target_pct ? <UseBar tone="target" used={a.status === 'passed' ? 1 : (a.equity - a.size) / (a.size * (a.profit_target_pct / 100))} /> : <span className="text-xs text-subtle">—</span> },
    { key: 'daily', header: 'Daily loss', align: 'right', hideBelow: 'lg', sortValue: (a) => drawdown(a).daily.used, cell: (a) => <UseBar used={drawdown(a).daily.used} /> },
    { key: 'max', header: 'Max loss', align: 'right', hideBelow: 'lg', sortValue: (a) => drawdown(a).max.used, cell: (a) => <UseBar used={drawdown(a).max.used} /> },
    { key: 'go', header: <span className="sr-only">Actions</span>, align: 'right', cell: (a) => (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {a.status === 'active' && (
          <SiteLink site="trade" path={`/?account=${a.id}`} title="Open in terminal" className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25"><CandlestickChart className="h-4 w-4" /></SiteLink>
        )}
        <Link href={`/accounts/${a.id}`} title="Details" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-fg"><ArrowUpRight className="h-4 w-4" /></Link>
      </div>) },
  ];
  return (
    <DataTable columns={cols} rows={accounts} rowKey={(a) => a.id} onRowClick={(a) => router.push(`/accounts/${a.id}`)}
      initialSort={{ key: 'bal', dir: 'desc' }} empty={{ title: 'No accounts', description: 'Accounts you buy appear here.' }} />
  );
}
