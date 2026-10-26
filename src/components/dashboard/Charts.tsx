'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { dateTime, fmtUsd } from '@/lib/format';

/** Inline equity sparkline: smooth rounded stroke, soft gradient fill, dashed baseline (account size). */
export function Sparkline({ values, baseline, className, height = 40 }: { values: number[]; baseline?: number; className?: string; height?: number }) {
  const gid = useId();
  const W = 160;
  const H = height;

  const geo = useMemo(() => {
    if (values.length < 2) return null;
    const min = Math.min(...values, baseline ?? Infinity);
    const max = Math.max(...values, baseline ?? -Infinity);
    const span = max - min || 1;
    const x = (i: number) => (i / (values.length - 1)) * W;
    const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
    // smooth path (Catmull-Rom → cubic Bézier) so the curve reads organic instead of jagged
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    let line = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      line += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return { line, area: `${line} L${W} ${H} L0 ${H} Z`, by: baseline != null ? y(baseline) : null, last: { x: x(values.length - 1), y: y(values[values.length - 1]) } };
  }, [values, baseline, H]);

  if (!geo) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-10 w-full', className)} aria-hidden preserveAspectRatio="none">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgb(var(--line2))" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  const up = values[values.length - 1] >= (baseline ?? values[0]);
  const col = up ? 'rgb(var(--up))' : 'rgb(var(--down))';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-10 w-full overflow-visible', className)} preserveAspectRatio="none" role="img" aria-label="Equity curve">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity="0.28" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geo.by != null && <line x1="0" x2={W} y1={geo.by} y2={geo.by} stroke="rgb(var(--subtle))" strokeOpacity="0.45" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <path d={geo.area} fill={`url(#${gid})`} />
      <path d={geo.line} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface CurvePoint { equity: number; balance: number; taken_at: string }

type Range = '1W' | '1M' | '3M' | 'ALL';
const RANGE_MS: Record<Range, number> = { '1W': 7 * 864e5, '1M': 30 * 864e5, '3M': 91 * 864e5, ALL: Infinity };

/** "Nice" axis ticks (1 / 2 / 2.5 / 5 × 10ⁿ) covering [lo, hi]. */
function niceTicks(lo: number, hi: number, count: number) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(8));
  return out;
}
const compactUsd = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `$${(v / 1e3).toFixed(1)}K` : `$${Math.round(v).toLocaleString('en-US')}`);
const dayLabel = (t: number, withTime: boolean) => {
  const d = new Date(t);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return withTime ? `${day} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}` : day;
};

/**
 * Account performance chart (FTMO / FundingPips / The5ers style): equity and balance over real time, the starting
 * balance as the zero line (green above, red below), profit target and loss limits as labelled reference lines,
 * range tabs, and a scrubbable tooltip. Measured to its real width, so text stays crisp on phones, tablets and desktops.
 */
export function EquityChart({ points, size, dailyFloor, maxFloor, target, height }: {
  points: CurvePoint[]; size: number; dailyFloor?: number; maxFloor?: number; target?: number; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [range, setRange] = useState<Range>('ALL');
  const [show, setShow] = useState({ equity: true, balance: true });
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = W > 0 && W < 520;
  const H = height ?? (narrow ? 230 : W < 900 ? 280 : 320);
  const PAD = { l: 8, r: narrow ? 58 : 76, t: 14, b: 26 };

  const all = useMemo(() => points.map((p) => ({ ...p, t: Date.parse(p.taken_at) })).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t), [points]);
  const view = useMemo(() => {
    if (range === 'ALL' || all.length < 2) return all;
    const from = all[all.length - 1].t - RANGE_MS[range];
    const i = all.findIndex((p) => p.t >= from);
    return i <= 0 ? all : all.slice(i - 1); // keep one point before the window so the line starts at its left edge
  }, [all, range]);

  const geo = useMemo(() => {
    if (!W || view.length < 1) return null;
    const vals = view.flatMap((p) => [show.equity ? p.equity : NaN, show.balance ? p.balance : NaN]).filter(Number.isFinite);
    if (!vals.length) vals.push(size);
    const refs = [size, target, maxFloor, dailyFloor].filter((v): v is number => v != null && Number.isFinite(v));
    let lo = Math.min(...vals, ...refs), hi = Math.max(...vals, ...refs);
    const pad = (hi - lo) * 0.08 || size * 0.01;
    lo -= pad; hi += pad;
    const t0 = view[0].t, t1 = view[view.length - 1].t === t0 ? t0 + 1 : view[view.length - 1].t;
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
    const path = (k: 'equity' | 'balance') => view.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
    const ticks = niceTicks(lo, hi, narrow ? 5 : 7).filter((v) => v >= lo && v <= hi);
    const span = t1 - t0;
    const nX = Math.max(2, Math.min(narrow ? 3 : 6, Math.floor(iw / 110)));
    const xt = Array.from({ length: nX }, (_, i) => t0 + (span * i) / (nX - 1));
    return { x, y, eq: path('equity'), bal: path('balance'), ticks, xt, withTime: span < 3 * 864e5, base: y(size), iw, ih };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, view, show, size, target, maxFloor, dailyFloor, narrow]);

  const last = view[view.length - 1];
  const first = view[0];
  const hp = hover != null ? view[hover] : null;
  const pick = (clientX: number) => {
    if (!geo || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const px = clientX - r.left;
    let best = 0, bd = Infinity;
    view.forEach((p, i) => { const d = Math.abs(geo.x(p.t) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  const change = last ? last.equity - size : 0;
  const rangeChange = last && first ? last.equity - first.equity : 0;
  const refLines = [
    target != null && { v: target, label: 'Target', color: 'rgb(var(--up))', dash: '6 4' },
    { v: size, label: 'Start', color: 'rgb(var(--subtle))', dash: '2 4' },
    dailyFloor != null && { v: dailyFloor, label: 'Daily loss', color: 'rgb(var(--warn))', dash: '6 4' },
    maxFloor != null && { v: maxFloor, label: 'Max loss', color: 'rgb(var(--down))', dash: '6 4' },
  ].filter(Boolean) as { v: number; label: string; color: string; dash: string }[];

  // reference tags in the right gutter: spaced so they never overlap, and the axis numbers under them are hidden
  const tags = geo ? refLines.map((r) => ({ ...r, y: geo.y(r.v) })).sort((a, b) => a.y - b.y) : [];
  for (let i = 1; i < tags.length; i++) if (tags[i].y - tags[i - 1].y < 18) tags[i].y = tags[i - 1].y + 18;
  const yTicks = geo ? geo.ticks.filter((v) => tags.every((t) => Math.abs(geo.y(v) - t.y) > 13)) : [];

  return (
    <div>
      {/* summary + controls */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-2xl font-semibold tracking-tight">{last ? fmtUsd(last.equity) : '—'}</p>
          <p className="num mt-0.5 text-xs text-muted">
            <span className={change > 0 ? 'text-up' : change < 0 ? 'text-down' : ''}>{change >= 0 ? '+' : '−'}{fmtUsd(Math.abs(change))} ({((change / size) * 100).toFixed(2)}%)</span> since start
            {range !== 'ALL' && <> · <span className={rangeChange > 0 ? 'text-up' : rangeChange < 0 ? 'text-down' : ''}>{rangeChange >= 0 ? '+' : '−'}{fmtUsd(Math.abs(rangeChange))}</span> in {range}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Series">
            {(['equity', 'balance'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={show[k]} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium capitalize transition-colors', show[k] ? 'border-line2 bg-fg/[0.05] text-fg' : 'border-line text-subtle')}>
                <span className={cn('inline-block h-0.5 w-3.5 rounded', k === 'equity' ? 'bg-info' : 'border-t-2 border-dashed border-muted bg-transparent')} />{k}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Range">
            {(['1W', '1M', '3M', 'ALL'] as Range[]).map((r) => (
              <button key={r} type="button" role="tab" aria-selected={range === r} onClick={() => { setRange(r); setHover(null); }}
                className={cn('h-7 rounded-md px-2.5 text-xs font-medium transition-colors', range === r ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg')}>{r === 'ALL' ? 'All' : r}</button>
            ))}
          </div>
        </div>
      </div>

      <div ref={box} className="relative w-full select-none" style={{ height: H, touchAction: 'pan-y' }}
        onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        {geo && W > 0 && (
          <svg width={W} height={H} role="img" aria-label="Equity and balance over time" className="block">
            <defs>
              <linearGradient id={`${gid}u`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(var(--up))" stopOpacity="0.22" /><stop offset="1" stopColor="rgb(var(--up))" stopOpacity="0.02" /></linearGradient>
              <linearGradient id={`${gid}d`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="rgb(var(--down))" stopOpacity="0.22" /><stop offset="1" stopColor="rgb(var(--down))" stopOpacity="0.02" /></linearGradient>
              <clipPath id={`${gid}a`}><rect x={0} y={0} width={W} height={Math.max(0, geo.base)} /></clipPath>
              <clipPath id={`${gid}b`}><rect x={0} y={geo.base} width={W} height={Math.max(0, H - geo.base)} /></clipPath>
            </defs>
            {/* grid + y labels */}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="rgb(var(--line))" strokeOpacity="0.6" />
                <text x={W - PAD.r + 8} y={geo.y(v) + 3.5} fontSize={narrow ? 10 : 11} fill="rgb(var(--subtle))" className="num">{narrow ? compactUsd(v) : fmtUsd(v).replace(/\.00$/, '')}</text>
              </g>
            ))}
            {/* x labels */}
            {geo.xt.map((t, i) => (
              <text key={i} x={geo.x(t)} y={H - 7} fontSize={narrow ? 10 : 11} fill="rgb(var(--subtle))" textAnchor={i === 0 ? 'start' : i === geo.xt.length - 1 ? 'end' : 'middle'}>{dayLabel(t, geo.withTime)}</text>
            ))}
            {/* profit / loss shading against the starting balance */}
            {show.equity && view.length > 1 && (() => {
              const area = `${geo.eq} L${geo.x(last.t).toFixed(1)} ${geo.base.toFixed(1)} L${geo.x(first.t).toFixed(1)} ${geo.base.toFixed(1)} Z`;
              return (<><path d={area} fill={`url(#${gid}u)`} clipPath={`url(#${gid}a)`} /><path d={area} fill={`url(#${gid}d)`} clipPath={`url(#${gid}b)`} /></>);
            })()}
            {/* reference lines */}
            {tags.map((r) => (
              <g key={r.label}>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(r.v)} y2={geo.y(r.v)} stroke={r.color} strokeDasharray={r.dash} strokeOpacity="0.8" />
                <rect x={W - PAD.r + 2} y={r.y - 8} width={PAD.r - 4} height={16} rx={4} fill={r.color} fillOpacity="0.16" />
                <text x={W - PAD.r + 6} y={r.y + 3.5} fontSize={narrow ? 9 : 10} fontWeight={600} fill={r.color}><title>{`${r.label}: ${fmtUsd(r.v)}`}</title>{narrow ? r.label.split(' ')[0] : r.label}</text>
              </g>
            ))}
            {show.balance && <path d={geo.bal} fill="none" stroke="rgb(var(--muted))" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />}
            {show.equity && <path d={geo.eq} fill="none" stroke="rgb(var(--info))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {show.equity && last && <circle cx={geo.x(last.t)} cy={geo.y(last.equity)} r={3.5} fill="rgb(var(--info))" stroke="rgb(var(--panel))" strokeWidth={2} />}
            {hp && (
              <g>
                <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--fg))" strokeOpacity="0.25" />
                {show.balance && <circle cx={geo.x(hp.t)} cy={geo.y(hp.balance)} r={3.5} fill="rgb(var(--muted))" stroke="rgb(var(--panel))" strokeWidth={2} />}
                {show.equity && <circle cx={geo.x(hp.t)} cy={geo.y(hp.equity)} r={4.5} fill="rgb(var(--info))" stroke="rgb(var(--panel))" strokeWidth={2} />}
              </g>
            )}
          </svg>
        )}
        {geo && hp && (
          <div className="pointer-events-none absolute top-1 z-10 min-w-[168px] rounded-xl border border-line2/70 bg-panel2/95 px-3 py-2.5 text-xs shadow-pop backdrop-blur-sm"
            style={narrow ? { left: '50%', transform: 'translateX(-50%)' } : { left: geo.x(hp.t), transform: geo.x(hp.t) > W / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
            <p className="mb-1.5 text-subtle">{dateTime(hp.taken_at)} UTC</p>
            <div className="num space-y-0.5 font-mono">
              <p className="flex justify-between gap-4"><span className="font-sans text-muted">Equity</span><span className="font-semibold">{fmtUsd(hp.equity)}</span></p>
              <p className="flex justify-between gap-4"><span className="font-sans text-muted">Balance</span><span>{fmtUsd(hp.balance)}</span></p>
              <p className="flex justify-between gap-4"><span className="font-sans text-muted">vs start</span><span className={hp.equity - size >= 0 ? 'text-up' : 'text-down'}>{hp.equity - size >= 0 ? '+' : '−'}{fmtUsd(Math.abs(hp.equity - size))}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
