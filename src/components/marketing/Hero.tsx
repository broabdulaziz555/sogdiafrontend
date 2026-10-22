'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

/* Deterministic candle series (seeded LCG) so SSR and client markup are identical. */
function candles(n: number) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let price = 50;
  const out: { o: number; c: number; h: number; l: number }[] = [];
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = Math.sin(i / 7) * 0.9 + (rnd() - 0.46) * 5;
    const c = o + drift;
    const h = Math.max(o, c) + rnd() * 2.4;
    const l = Math.min(o, c) - rnd() * 2.4;
    out.push({ o, c, h, l });
    price = c;
  }
  return out;
}
const CANDLES = candles(46);

function TerminalPreview() {
  const W = 760, H = 460;
  const chart = { x: 14, y: 52, w: 470, h: 280 };
  const min = Math.min(...CANDLES.map((c) => c.l));
  const max = Math.max(...CANDLES.map((c) => c.h));
  const sy = (v: number) => chart.y + chart.h - ((v - min) / (max - min)) * (chart.h - 20) - 10;
  const step = chart.w / CANDLES.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Illustrative terminal layout" className="h-auto w-full">
      <defs>
        <linearGradient id="hp-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent))" stopOpacity="0.14" />
          <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="14" fill="rgb(var(--panel))" stroke="rgb(var(--line))" />
      {/* top bar */}
      <rect x="1" y="1" width={W - 2} height="38" rx="13" fill="rgb(var(--panel2))" />
      <rect x="1" y="26" width={W - 2} height="13" fill="rgb(var(--panel2))" />
      <line x1="0" x2={W} y1="39.5" y2="39.5" stroke="rgb(var(--line))" />
      {[0, 1, 2].map((i) => <circle key={i} cx={20 + i * 14} cy="20" r="4" fill="rgb(var(--line))" />)}
      <rect x="86" y="12" width="62" height="16" rx="4" fill="rgb(var(--fg) / 0.1)" />
      <rect x="160" y="14" width="44" height="12" rx="3" fill="rgb(var(--up) / 0.55)" />
      {[0, 1, 2].map((i) => <rect key={i} x={226 + i * 62} y="15" width="48" height="10" rx="3" fill="rgb(var(--fg) / 0.08)" />)}
      <rect x={W - 150} y="12" width="132" height="16" rx="4" fill="rgb(var(--accent) / 0.18)" />

      {/* chart */}
      {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={chart.x} x2={chart.x + chart.w} y1={chart.y + 20 + i * 58} y2={chart.y + 20 + i * 58} stroke="rgb(var(--line) / 0.6)" strokeDasharray="2 5" />)}
      <path
        d={`M ${chart.x} ${sy(CANDLES[0].c)} ${CANDLES.map((c, i) => `L ${chart.x + i * step + step / 2} ${sy(c.c)}`).join(' ')} L ${chart.x + chart.w} ${chart.y + chart.h} L ${chart.x} ${chart.y + chart.h} Z`}
        fill="url(#hp-fade)"
      />
      {CANDLES.map((c, i) => {
        const x = chart.x + i * step + step / 2;
        const up = c.c >= c.o;
        const col = up ? 'rgb(var(--up))' : 'rgb(var(--down))';
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={sy(c.h)} y2={sy(c.l)} stroke={col} strokeWidth="1" />
            <rect x={x - step * 0.3} y={sy(Math.max(c.o, c.c))} width={step * 0.6} height={Math.max(1.5, Math.abs(sy(c.o) - sy(c.c)))} fill={col} rx="0.5" />
          </g>
        );
      })}
      {/* last price line */}
      <line x1={chart.x} x2={chart.x + chart.w} y1={sy(CANDLES[CANDLES.length - 1].c)} y2={sy(CANDLES[CANDLES.length - 1].c)} stroke="rgb(var(--accent))" strokeDasharray="3 3" strokeWidth="1" />
      <rect x={chart.x + chart.w - 52} y={sy(CANDLES[CANDLES.length - 1].c) - 8} width="52" height="16" rx="3" fill="rgb(var(--accent))" />
      {/* volume */}
      {CANDLES.map((c, i) => (
        <rect key={i} x={chart.x + i * step + step * 0.2} y={chart.y + chart.h + 6 - ((c.h - c.l) * 3.2)} width={step * 0.6} height={(c.h - c.l) * 3.2} fill={c.c >= c.o ? 'rgb(var(--up) / 0.3)' : 'rgb(var(--down) / 0.3)'} />
      ))}

      {/* order book */}
      <line x1="498.5" x2="498.5" y1="40" y2="340" stroke="rgb(var(--line))" />
      {Array.from({ length: 11 }).map((_, i) => {
        const ask = i < 5;
        const mid = i === 5;
        const y = 52 + i * 24;
        const w = ask ? 40 + ((5 - i) * 37 + (i % 2) * 18) % 110 : 40 + ((i - 5) * 31 + (i % 3) * 14) % 110;
        if (mid) return <rect key={i} x="510" y={y + 2} width="100" height="16" rx="3" fill="rgb(var(--fg) / 0.1)" />;
        return (
          <g key={i}>
            <rect x={750 - w} y={y} width={w} height="20" fill={ask ? 'rgb(var(--down) / 0.16)' : 'rgb(var(--up) / 0.16)'} />
            <rect x="510" y={y + 6} width={40 + (i % 4) * 6} height="8" rx="2" fill={ask ? 'rgb(var(--down) / 0.7)' : 'rgb(var(--up) / 0.7)'} />
            <rect x="640" y={y + 6} width="34" height="8" rx="2" fill="rgb(var(--fg) / 0.14)" />
          </g>
        );
      })}

      {/* positions */}
      <line x1="0" x2={W} y1="350.5" y2="350.5" stroke="rgb(var(--line))" />
      {[0, 1, 2].map((i) => <rect key={i} x={16 + i * 70} y="364" width="54" height="9" rx="3" fill={i === 0 ? 'rgb(var(--accent) / 0.6)' : 'rgb(var(--fg) / 0.1)'} />)}
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <rect x="16" y={388 + r * 24} width="46" height="12" rx="3" fill="rgb(var(--fg) / 0.14)" />
          <rect x="70" y={388 + r * 24} width="28" height="12" rx="3" fill={r === 1 ? 'rgb(var(--down) / 0.55)' : 'rgb(var(--up) / 0.55)'} />
          {[0, 1, 2, 3, 4].map((c) => <rect key={c} x={140 + c * 100} y={390 + r * 24} width="62" height="8" rx="2" fill="rgb(var(--fg) / 0.1)" />)}
          <rect x={650} y={388 + r * 24} width="82" height="12" rx="3" fill={r === 1 ? 'rgb(var(--down) / 0.25)' : 'rgb(var(--up) / 0.25)'} />
        </g>
      ))}
    </svg>
  );
}

export function Hero() {
  const t = useTranslations('hero');
  const facts = [
    { v: t('fact1Value'), l: t('fact1Label') },
    { v: t('fact2Value'), l: t('fact2Label') },
    { v: t('fact3Value'), l: t('fact3Label') },
    { v: t('fact4Value'), l: t('fact4Label') },
  ];

  return (
    <section className="relative isolate overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-[-10%] -z-10 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-accent/[0.09] blur-[120px]" aria-hidden />

      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.02fr_1fr] lg:pb-24 lg:pt-24">
        <div>
          <p className="mb-6 inline-flex animate-fade-up items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1.5 font-mono text-2xs text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
            {t('eyebrow')}
          </p>

          <h1 className="animate-fade-up text-balance text-[44px] font-extrabold leading-[0.98] tracking-[-0.035em] [animation-delay:60ms] sm:text-6xl lg:text-[72px]">
            {t('titleA')}
            <br />
            <span className="bg-gradient-to-r from-accent via-accent to-accent/60 bg-clip-text text-transparent">{t('titleB')}</span>
          </h1>

          <p className="mt-6 max-w-xl animate-fade-up text-lg text-muted [animation-delay:120ms]">{t('subtitle')}</p>

          <div className="mt-9 flex animate-fade-up flex-wrap items-center gap-3 [animation-delay:180ms]">
            <Link
              href="/#pricing"
              className="group inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-6 text-md font-semibold text-accent-fg shadow-[0_0_0_1px_rgb(var(--accent)/0.5),0_12px_40px_-10px_rgb(var(--accent)/0.6)] transition-all hover:-translate-y-0.5 hover:brightness-110"
            >
              {t('ctaPrimary')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/#rules"
              className="group inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-panel/60 px-6 text-md font-medium backdrop-blur transition-all hover:border-accent/50 hover:text-accent"
            >
              {t('ctaSecondary')}
              <ArrowUpRight className="h-4 w-4 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <dl className="mt-12 grid max-w-xl animate-fade-up grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line [animation-delay:240ms] sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.l} className="bg-panel px-4 py-4">
                <dt className="order-2 mt-1 text-xs text-muted">{f.l}</dt>
                <dd className="num text-2xl font-bold tracking-tight">{f.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-fade-up [animation-delay:200ms]">
          <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-accent/10 via-transparent to-transparent blur-2xl" aria-hidden />
          <div className="relative [transform:perspective(1600px)_rotateY(-6deg)_rotateX(2deg)] transition-transform duration-700 hover:[transform:perspective(1600px)_rotateY(0)_rotateX(0)] max-lg:[transform:none]">
            <div className="rounded-2xl shadow-[0_40px_120px_-30px_rgb(0_0_0/0.7)]">
              <TerminalPreview />
            </div>
          </div>
          <p className="mt-3 text-center font-mono text-2xs text-subtle">
            {t('previewLabel')} · {t('previewNote')}
          </p>
        </div>
      </div>
    </section>
  );
}
