'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, RefreshCw, Tag } from 'lucide-react';
import { Reveal, SectionHead } from './Reveal';
import { Segmented } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePricing } from '@/hooks/usePricing';
import { PLAN_SIZES } from '@/lib/pricing-fallback';
import { fmtSize, fmtUsd0 } from '@/lib/format';
import type { Plan } from '@/lib/types';
import { cn } from '@/lib/cn';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="num font-mono font-medium">{value}</span>
    </div>
  );
}

function PlanCard({ type, plans, size, loading }: { type: 'one_step' | 'instant'; plans: Plan[]; size: number; loading: boolean }) {
  const t = useTranslations('pricing');
  const selected = plans.find((p) => p.size === size);
  const cheapest = plans.length ? Math.min(...plans.map((p) => p.effective_price)) : null;
  const name = type === 'one_step' ? t('oneStepName') : t('instantName');
  const tag = type === 'one_step' ? t('oneStepTag') : t('instantTag');
  const desc = type === 'one_step' ? t('oneStepDesc') : t('instantDesc');
  const discounted = selected && selected.effective_price < selected.price;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden border border-line bg-panel p-6 transition-colors sm:p-8',
        'hover:border-accent/60 focus-within:border-accent/60',
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
      <span className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-accent/0 blur-3xl transition-colors duration-500 group-hover:bg-accent/10" aria-hidden />

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="label text-accent">{tag}</p>
          <h3 className="mt-1.5 text-3xl font-bold tracking-tight">{name}</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-subtle">{t('from')}</p>
          {loading ? <Skeleton className="ml-auto h-7 w-16" /> : <p className="num text-2xl font-bold">{fmtUsd0(cheapest)}</p>}
        </div>
      </header>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{desc}</p>

      <div className="mt-7 rounded-xl border border-line bg-bg/60 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="label">{t('accountSize')}</p>
            <p className="num mt-1 text-4xl font-extrabold tracking-tight">{fmtSize(size)}</p>
          </div>
          <div className="text-right">
            {loading || !selected ? (
              <Skeleton className="ml-auto h-9 w-24" />
            ) : (
              <>
                {discounted && <p className="num text-sm text-subtle line-through">{fmtUsd0(selected.price)}</p>}
                <p className="num text-4xl font-extrabold tracking-tight text-accent">{fmtUsd0(selected.effective_price)}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {selected ? (
          <>
            <Row label={t('target')} value={selected.profit_target_pct != null ? `${selected.profit_target_pct}%` : t('targetNone')} />
            <Row label={t('daily')} value={`${selected.daily_dd_pct}%`} />
            <Row label={t('max')} value={`${selected.max_dd_pct}%`} />
            <Row label={t('leverage')} value={`${selected.max_leverage}×`} />
            <Row label={t('split')} value={`${selected.payout_split_pct}%`} />
            <Row label={t('cycle')} value={t('days', { n: selected.payout_cycle_days })} />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="py-2.5"><Skeleton className="h-4" /></div>)
        )}
      </div>

      <div className="mt-7">
        {/* Stretched link makes the whole card route to checkout */}
        <Link
          href={selected ? `/checkout?plan=${selected.key}` : '#pricing'}
          aria-label={selected ? t('choose', { name, size: fmtSize(size) }) : undefined}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-md font-semibold text-accent-fg shadow-[0_0_0_1px_rgb(var(--accent)/0.4)] transition-all after:absolute after:inset-0 after:content-[''] group-hover:shadow-[0_0_0_1px_rgb(var(--accent)/0.7),0_10px_36px_-10px_rgb(var(--accent)/0.6)]"
        >
          {t('choose', { name, size: fmtSize(size) })}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </article>
  );
}

export function Pricing() {
  const t = useTranslations('pricing');
  const { pricing, live, loading, failed, retry } = usePricing();
  const [size, setSize] = useState<number>(10000);

  const byType = useMemo(
    () => ({
      one_step: pricing.plans.filter((p) => p.type === 'one_step').sort((a, b) => a.size - b.size),
      instant: pricing.plans.filter((p) => p.type === 'instant').sort((a, b) => a.size - b.size),
    }),
    [pricing.plans],
  );

  const sizes = (byType.one_step.length ? byType.one_step.map((p) => p.size) : [...PLAN_SIZES]) as number[];

  return (
    <section id="pricing" className="scroll-mt-20 border-b border-line bg-panel2/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Segmented
              ariaLabel={t('accountSize')}
              value={size}
              onChange={setSize}
              options={sizes.map((s) => ({ value: s, label: fmtSize(s) }))}
            />
            <p className="flex items-center gap-1.5 text-xs text-subtle">
              <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-up animate-pulse-dot' : 'bg-warn')} />
              {live ? t('livePricing') : failed ? t('fallbackNotice') : t('livePricing')}
              {failed && (
                <button onClick={retry} aria-label="Retry loading pricing" className="ml-1 grid h-5 w-5 place-items-center rounded hover:bg-fg/10"><RefreshCw className="h-3 w-3" /></button>
              )}
            </p>
          </div>
        </Reveal>

        {pricing.discounts.site_wide_pct > 0 && (
          <p className="mt-6 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
            <Tag className="h-4 w-4" /> {t('siteWide', { pct: pricing.discounts.site_wide_pct })}
          </p>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal><PlanCard type="one_step" plans={byType.one_step} size={size} loading={loading} /></Reveal>
          <Reveal delay={100}><PlanCard type="instant" plans={byType.instant} size={size} loading={loading} /></Reveal>
        </div>

        {pricing.promos.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="label">{t('promo')}</span>
            {pricing.promos.slice(0, 4).map((p) => (
              <span key={p.code} className="inline-flex items-center gap-2 rounded-md border border-dashed border-accent/40 bg-accent/[0.06] px-3 py-1.5 text-xs">
                <Check className="h-3 w-3 text-accent" />
                <span className="font-mono font-semibold text-accent">{p.code}</span>
                <span className="text-muted">{p.kind === 'percent' ? `${p.value}% off` : `$${p.value} off`}{p.note ? ` · ${p.note}` : ''}</span>
              </span>
            ))}
            <span className="text-xs text-subtle">{t('promoNote')}</span>
          </div>
        )}
      </div>
    </section>
  );
}
