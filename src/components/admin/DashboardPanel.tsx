'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { Activity, BadgeCheck, CircleDollarSign, Clock, Layers, Users, Wallet } from 'lucide-react';
import { get } from '@/lib/api';
import { fmtUsd, fmtUsd0 } from '@/lib/format';
import { FALLBACK_PLANS } from '@/lib/pricing-fallback';
import type { Account, AdminStats } from '@/lib/types';
import { useApi } from '@/hooks/useApi';
import { PageHead } from '@/components/dashboard/PageHead';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatStrip } from '@/components/ui/Panel';
import { Section } from './AdminKit';
import type { DayPoint } from './RevenueChart';

const RevenueChart = dynamic(() => import('./RevenueChart'), { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> });

const PRICE = new Map(FALLBACK_PLANS.map((p) => [p.key, p.price]));
const PAGE = 100;
const MAX_PAGES = 15;
const DAYS = 30;

/**
 * The contract has no revenue time-series, so the chart is derived from the account list:
 * list price of each non-gifted account by creation day. It is an estimate (discounts and promos are not applied).
 */
function useSalesSeries() {
  return useSWR<{ points: DayPoint[]; unknown: number; truncated: boolean }>(['admin-sales-series'], async () => {
    const cutoff = Date.now() - DAYS * 86400_000;
    const rows: Account[] = [];
    let total = Infinity, offset = 0, pages = 0, desc: boolean | null = null;
    while (offset < total && pages < MAX_PAGES) {
      const r = await get<{ accounts: Account[]; total: number }>('/admin/accounts', { limit: PAGE, offset });
      total = r.total; rows.push(...r.accounts); offset += PAGE; pages++;
      if (!r.accounts.length) break;
      if (desc === null && r.accounts.length > 1) desc = Date.parse(r.accounts[0].created_at) >= Date.parse(r.accounts[r.accounts.length - 1].created_at);
      if (desc && Date.parse(r.accounts[r.accounts.length - 1].created_at) < cutoff) break;
    }
    const days: Record<string, DayPoint> = {};
    for (let i = DAYS - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10); days[d] = { day: d, revenue: 0, sales: 0 }; }
    let unknown = 0;
    for (const a of rows) {
      if (a.is_gifted) continue;
      const day = a.created_at.slice(0, 10);
      if (!days[day]) continue;
      const price = PRICE.get(a.plan_key);
      if (price == null) { unknown++; continue; }
      days[day].revenue += price; days[day].sales += 1;
    }
    return { points: Object.values(days), unknown, truncated: offset < total && !(desc && true) };
  }, { revalidateOnFocus: false, dedupingInterval: 60_000 });
}

function Kpi({ icon: Icon, label, value, sub, warn }: { icon: typeof Users; label: string; value: React.ReactNode; sub?: string; warn?: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden bg-panel px-3.5 py-3">
      <div className="flex items-center justify-between gap-2"><p className="label truncate">{label}</p><Icon className={warn ? 'h-4 w-4 shrink-0 text-warn' : 'h-4 w-4 shrink-0 text-subtle'} /></div>
      <p className="num mt-1.5 whitespace-nowrap font-mono text-[clamp(1rem,4.6vw,1.375rem)] font-semibold leading-tight tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = { active: 'bg-up', passed: 'bg-accent', frozen: 'bg-info', failed: 'bg-down', breached: 'bg-warn', closed: 'bg-subtle' };

export function DashboardPanel() {
  const stats = useApi<AdminStats>('/admin/stats', undefined, { refreshInterval: 30_000 });
  const series = useSalesSeries();
  const s = stats.data;
  const totalAccounts = useMemo(() => (s ? Object.values(s.accounts).reduce((a, b) => a + b, 0) : 0), [s]);
  const periodTotal = series.data?.points.reduce((a, p) => a + p.revenue, 0) ?? 0;
  const periodSales = series.data?.points.reduce((a, p) => a + p.sales, 0) ?? 0;

  return (
    <>
      <PageHead title="Dashboard" subtitle="Platform health at a glance. Figures refresh every 30 seconds." />

      {stats.error && !s ? (
        <div className="border border-line bg-panel"><ErrorState error={stats.error} onRetry={() => stats.mutate()} /></div>
      ) : (
        <StatStrip>
          {!s ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-none" />) : (
            <>
              <Kpi icon={Users} label="Users" value={s.users.toLocaleString()} />
              <Kpi icon={Layers} label="Accounts" value={totalAccounts.toLocaleString()} sub={`${(s.accounts.active ?? 0).toLocaleString()} active`} />
              <Kpi icon={CircleDollarSign} label="Revenue" value={fmtUsd0(s.revenue_usd)} sub="Confirmed purchases" />
              <Kpi icon={Wallet} label="Payouts paid" value={fmtUsd0(s.payouts_paid_usd)} />
              <Kpi icon={Clock} label="Payouts pending" value={s.payouts_pending} sub={s.payouts_pending ? 'Needs action' : 'Queue is clear'} warn={s.payouts_pending > 0} />
              <Kpi icon={BadgeCheck} label="KYC pending" value={s.kyc_pending} sub={s.kyc_pending ? 'Awaiting review' : 'Nothing waiting'} warn={s.kyc_pending > 0} />
              <Kpi icon={Activity} label="Open positions" value={s.open_positions.toLocaleString()} />
              <Kpi icon={Layers} label="Failed / breached" value={`${(s.accounts.failed ?? 0).toLocaleString()} / ${(s.accounts.breached ?? 0).toLocaleString()}`} />
            </>
          )}
        </StatStrip>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Section title="Sales value · last 30 days" actions={<span className="num text-xs text-muted">{fmtUsd(periodTotal)} · {periodSales} sold</span>}>
          <div className="p-4">
            {series.isLoading && !series.data ? <Skeleton className="h-[280px] w-full" />
              : series.error && !series.data ? <ErrorState compact error={series.error} onRetry={() => series.mutate()} />
              : periodSales === 0 ? <EmptyState compact title="No sales in this period" description="Purchased accounts will appear here as they are created." />
              : <RevenueChart data={series.data!.points} />}
            <p className="mt-3 text-2xs leading-relaxed text-subtle">
              Estimated from the account list at <b>list price</b>; gifted accounts are excluded and promo discounts are not applied. The Revenue card above is the authoritative total.
              {series.data && series.data.unknown > 0 && ` ${series.data.unknown} account(s) on unrecognised plans were skipped.`}
            </p>
          </div>
        </Section>

        <Section title="Accounts by status">
          <div className="space-y-3 p-4">
            {!s ? <Skeleton className="h-40 w-full" /> : totalAccounts === 0 ? <EmptyState compact title="No accounts yet" /> : (
              <>
                <div className="flex h-2 gap-px overflow-hidden bg-fg/[0.08]" role="img" aria-label="Account status distribution">
                  {Object.entries(s.accounts).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className={STATUS_TONE[k] ?? 'bg-muted'} style={{ width: `${(n / totalAccounts) * 100}%` }} title={`${k}: ${n}`} />)}
                </div>
                <ul className="space-y-2">
                  {Object.entries(s.accounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                    <li key={k} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 capitalize"><span className={`h-2 w-2 ${STATUS_TONE[k] ?? 'bg-muted'}`} />{k}</span><span className="num font-mono">{n.toLocaleString()} <span className="text-xs text-subtle">({((n / totalAccounts) * 100).toFixed(1)}%)</span></span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}
