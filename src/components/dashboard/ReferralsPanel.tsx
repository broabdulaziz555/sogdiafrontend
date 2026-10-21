'use client';

import { useMemo } from 'react';
import { Gift, Link2, Percent, Users } from 'lucide-react';
import { PageHead, Stat } from './PageHead';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { CopyButton, StatusBadge } from '@/components/ui/Primitives';
import { ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { useApi } from '@/hooks/useApi';
import { dateTime, fmtUsd } from '@/lib/format';
import { siteHref } from '@/lib/sites';
import type { Referrals } from '@/lib/types';

type Row = Referrals['history'][number] & { _i: number };

export function ReferralsPanel() {
  const { data, error, isLoading, mutate } = useApi<Referrals>('/referrals');

  const link = useMemo(() => {
    if (!data) return '';
    const h = siteHref('www', `/register?ref=${encodeURIComponent(data.referral_code)}`);
    return h.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${h}` : h;
  }, [data]);
  const rows: Row[] | undefined = data?.history.map((h, i) => ({ ...h, _i: i }));

  const cols: Column<Row>[] = [
    { key: 'date', header: 'Date', cell: (r) => <span className="num text-muted">{dateTime(r.created_at)}</span>, sortValue: (r) => new Date(r.created_at).getTime(), searchText: (r) => r.created_at },
    { key: 'amount', header: 'Commission', align: 'right', cell: (r) => <span className="num font-mono font-medium text-up">{fmtUsd(r.amount)}</span>, sortValue: (r) => r.amount },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status, searchText: (r) => r.status },
  ];

  return (
    <>
      <PageHead title="Referrals" subtitle="Earn commission on every account your referrals purchase. It never touches a trading account." />

      {error && !data ? (
        <div className="rounded-2xl border border-line bg-panel"><ErrorState error={error} onRetry={() => mutate()} title="Could not load referral data" /></div>
      ) : (
        <>
          <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="grid gap-px bg-line md:grid-cols-2">
              <div className="bg-panel p-5">
                <p className="label">Your referral code</p>
                {isLoading && !data ? <Skeleton className="mt-3 h-10 w-48" /> : (
                  <div className="mt-2 flex items-center gap-3">
                    <code className="num rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-xl font-bold tracking-widest text-accent">{data?.referral_code}</code>
                    <CopyButton value={data?.referral_code ?? ''} label="Copy code" />
                  </div>
                )}
              </div>
              <div className="bg-panel p-5">
                <p className="label">Share link</p>
                {isLoading && !data ? <Skeleton className="mt-3 h-10 w-full" /> : (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2.5">
                    <Link2 className="h-4 w-4 shrink-0 text-subtle" />
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
                    <CopyButton value={link} label="Copy link" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line px-5 py-3 text-sm text-muted">
              <span className="inline-flex items-center gap-2"><Percent className="h-4 w-4 text-accent" />You earn <b className="text-fg">{data?.commission_pct ?? '—'}%</b> of each referred purchase</span>
              <span className="inline-flex items-center gap-2"><Gift className="h-4 w-4 text-accent" />Friends get <b className="text-fg">{data?.friend_discount_pct ?? '—'}%</b> off</span>
            </div>
          </section>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {isLoading && !data ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl border border-line bg-panel p-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-3 h-7 w-24" /></div>) : (
              <>
                <Stat label="Sign-ups" value={data?.signups ?? 0} sub={<span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Referred traders</span>} />
                <Stat label="Total earned" value={fmtUsd(data?.earned_total)} tone={(data?.earned_total ?? 0) > 0 ? 'up' : undefined} />
                <Stat label="Paid" value={fmtUsd(data?.earned_paid)} />
                <Stat label="Pending" value={fmtUsd(data?.earned_pending)} />
              </>
            )}
          </div>

          <section className="rounded-2xl border border-line bg-panel">
            <div className="border-b border-line px-5 py-4"><h2 className="text-md font-semibold">Commission history</h2></div>
            <DataTable
              columns={cols}
              rows={rows}
              rowKey={(r) => String(r._i)}
              loading={isLoading && !rows}
              initialSort={{ key: 'date', dir: 'desc' }}
              pageSize={10}
              searchPlaceholder="Search commissions…"
              empty={{ title: 'No commissions yet', description: 'Share your link — commissions appear here when a referral completes a purchase.', icon: <Gift className="h-5 w-5" /> }}
              className="rounded-none border-0"
            />
          </section>
        </>
      )}
    </>
  );
}
