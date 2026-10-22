'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowRight, BarChart3, CalendarDays, Command, CreditCard, Crosshair, Layers, LineChart, ShieldCheck, WalletCards, WifiOff,
} from 'lucide-react';
import { Reveal, SectionHead } from './Reveal';
import { usePricing } from '@/hooks/usePricing';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtUsd0 } from '@/lib/format';
import { cn } from '@/lib/cn';

/* ── How it works ───────────────────────────────────────────────────── */
export function HowItWorks() {
  const t = useTranslations('how');
  const steps = [
    { icon: CreditCard, title: t('s1Title'), body: t('s1Body') },
    { icon: LineChart, title: t('s2Title'), body: t('s2Body') },
    { icon: WalletCards, title: t('s3Title'), body: t('s3Body') },
  ];
  return (
    <section id="how" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal><SectionHead eyebrow={t('eyebrow')} title={t('title')} /></Reveal>
        <div className="relative mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 90} className="group relative bg-panel p-7 transition-colors hover:bg-panel2 sm:p-8">
              <div className="mb-10 flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-bg text-accent transition-all group-hover:border-accent/50 group-hover:shadow-[0_0_24px_-4px_rgb(var(--accent)/0.5)]">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="num font-mono text-5xl font-bold text-fg/[0.06]">0{i + 1}</span>
              </div>
              <h3 className="text-xl font-semibold">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Rules matrix ───────────────────────────────────────────────────── */
export function Rules() {
  const t = useTranslations('rules');
  const { pricing, loading } = usePricing();

  const one = pricing.plans.filter((p) => p.type === 'one_step');
  const ins = pricing.plans.filter((p) => p.type === 'instant');
  const from = (l: typeof one) => (l.length ? Math.min(...l.map((p) => p.effective_price)) : null);
  const sizes = (l: typeof one) => (l.length ? `$${Math.min(...l.map((p) => p.size)) / 1000}K – $${Math.max(...l.map((p) => p.size)) / 1000}K` : '—');
  const a = one[0];
  const b = ins[0];

  const rows: { label: string; note?: string; x: React.ReactNode; y: React.ReactNode; emphasize?: boolean }[] = [
    { label: t('size'), x: sizes(one), y: sizes(ins) },
    { label: t('fee'), x: loading ? <Skeleton className="ml-auto h-4 w-16 sm:ml-0" /> : `${fmtUsd0(from(one))}+`, y: loading ? <Skeleton className="ml-auto h-4 w-16 sm:ml-0" /> : `${fmtUsd0(from(ins))}+` },
    { label: t('target'), x: a?.profit_target_pct != null ? `${a.profit_target_pct}%` : t('targetNone'), y: b?.profit_target_pct != null ? `${b.profit_target_pct}%` : t('targetNone') },
    { label: t('daily'), note: t('dailyNote'), x: `${a?.daily_dd_pct ?? 4}%`, y: `${b?.daily_dd_pct ?? 3}%` },
    { label: t('max'), note: t('maxNote'), x: `${a?.max_dd_pct ?? 6}%`, y: `${b?.max_dd_pct ?? 5}%` },
    { label: t('leverage'), x: `${a?.max_leverage ?? 200}×`, y: `${b?.max_leverage ?? 200}×` },
    { label: t('markets'), x: t('marketsValue'), y: t('marketsValue') },
    { label: t('hours'), x: t('hoursValue'), y: t('hoursValue') },
    { label: t('split'), x: `${pricing.payout_split_pct}%`, y: `${pricing.payout_split_pct}%`, emphasize: true },
    { label: t('cycle'), x: t('cycleValue', { days: pricing.payout_cycle_days }), y: t('cycleValue', { days: pricing.payout_cycle_days }) },
  ];

  return (
    <section id="rules" className="scroll-mt-20 border-b border-line bg-panel2/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal><SectionHead eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} /></Reveal>

        <Reveal className="mt-12 overflow-hidden rounded-2xl card">
          <div role="table" aria-label={t('title')} className="text-sm">
            <div role="row" className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-line bg-panel2 px-4 py-3 sm:px-6">
              <span role="columnheader" className="label">{t('colRule')}</span>
              <span role="columnheader" className="label text-right sm:text-left">{t('oneStep')}</span>
              <span role="columnheader" className="label text-right sm:text-left">{t('instant')}</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.label}
                role="row"
                className={cn('grid grid-cols-[1.3fr_1fr_1fr] items-center border-b border-line/60 px-4 py-3.5 transition-colors last:border-0 hover:bg-fg/[0.03] sm:px-6', r.emphasize && 'bg-accent/[0.05]')}
              >
                <div role="rowheader">
                  <span className="font-medium">{r.label}</span>
                  {r.note && <span className="mt-0.5 block text-xs text-subtle">{r.note}</span>}
                </div>
                <div role="cell" className={cn('num text-right font-mono sm:text-left', r.emphasize && 'font-bold text-accent')}>{r.x}</div>
                <div role="cell" className={cn('num text-right font-mono sm:text-left', r.emphasize && 'font-bold text-accent')}>{r.y}</div>
              </div>
            ))}
          </div>
        </Reveal>
        <p className="mt-4 flex items-start gap-2 text-xs text-subtle">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('footnote')}
        </p>
      </div>
    </section>
  );
}

/* ── Platform ───────────────────────────────────────────────────────── */
export function Platform() {
  const t = useTranslations('platform');
  const items = [
    { icon: Layers, title: t('f1Title'), body: t('f1Body') },
    { icon: BarChart3, title: t('f2Title'), body: t('f2Body') },
    { icon: Command, title: t('f3Title'), body: t('f3Body') },
    { icon: Crosshair, title: t('f4Title'), body: t('f4Body') },
    { icon: CalendarDays, title: t('f5Title'), body: t('f5Body') },
    { icon: WifiOff, title: t('f6Title'), body: t('f6Body') },
  ];
  return (
    <section id="platform" className="scroll-mt-20 border-b border-line">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <Reveal><SectionHead eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} /></Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="group relative h-full overflow-hidden rounded-xl card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-glow">
                <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/0 blur-2xl transition-colors duration-500 group-hover:bg-accent/15" aria-hidden />
                <f.icon className="mb-5 h-5 w-5 text-accent" />
                <h3 className="text-md font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Closing CTA ────────────────────────────────────────────────────── */
export function FinalCta() {
  const t = useTranslations('cta');
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-full bg-[radial-gradient(60%_80%_at_50%_100%,rgb(var(--accent)/0.12),transparent)]" aria-hidden />
      <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:py-32">
        <Reveal>
          <h2 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{t('title')}</h2>
          <p className="mx-auto mt-5 max-w-xl text-md text-muted">{t('subtitle')}</p>
          <Link
            href="/#pricing"
            className="group mt-9 inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-7 text-md font-semibold text-accent-fg shadow-[0_0_0_1px_rgb(var(--accent)/0.5),0_12px_40px_-10px_rgb(var(--accent)/0.6)] transition-all hover:-translate-y-0.5 hover:brightness-110"
          >
            {t('button')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
