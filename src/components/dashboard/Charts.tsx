'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { dateTime, fmtUsd } from '@/lib/format';

/** Inline equity sparkline: hairline stroke, soft fill, dashed baseline (account size), square end marker. */
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
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
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
          <stop offset="0" stopColor={col} stopOpacity="0.20" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgb(var(--line))" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
      {geo.by != null && <line x1="0" x2={W} y1={geo.by} y2={geo.by} stroke="rgb(var(--subtle))" strokeOpacity="0.6" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      <path d={geo.area} fill={`url(#${gid})`} />
      <path d={geo.line} fill="none" stroke={col} strokeWidth="1.25" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
      <rect x={geo.last.x - 1.6} y={geo.last.y - 1.6} width="3.2" height="3.2" fill={col} />
    </svg>
  );
}

export interface CurvePoint { equity: number; balance: number; taken_at: string }

/** Full-size equity chart with hover crosshair + tooltip and optional drawdown floors. */
export function EquityChart({ points, size, dailyFloor, maxFloor, target, height = 260 }: {
  points: CurvePoint[]; size: number; dailyFloor?: number; maxFloor?: number; target?: number; height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();

  const W = 900, H = height, PAD = { l: 56, r: 12, t: 12, b: 24 };

  const geo = useMemo(() => {
    if (points.length < 1) return null;
    const vals = points.map((p) => p.equity);
    const refs = [size, dailyFloor, maxFloor, target].filter((v): v is number => v != null);
    const lo = Math.min(...vals, ...refs);
    const hi = Math.max(...vals, ...refs);
    const pad = (hi - lo) * 0.08 || size * 0.01;
    const min = lo - pad, max = hi + pad;
    const x = (i: number) => PAD.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.equity).toFixed(1)}`).join(' ');
    const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
    return { x, y, line, ticks, min, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, size, dailyFloor, maxFloor, target, H]);

  if (!geo) return null;
  const last = points[points.length - 1];
  const up = last.equity >= size;
  const col = up ? 'rgb(var(--up))' : 'rgb(var(--down))';

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const frac = (px - PAD.l) / (W - PAD.l - PAD.r);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1)))));
  };

  const hp = hover != null ? points[hover] : null;

  const Line = ({ v, label, color, dash }: { v?: number; label: string; color: string; dash?: string }) =>
    v == null ? null : (
      <g>
        <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke={color} strokeDasharray={dash ?? '4 4'} strokeOpacity="0.7" />
        <text x={W - PAD.r - 4} y={geo.y(v) - 4} textAnchor="end" fontSize="10" fill={color} fillOpacity="0.9">{label}</text>
      </g>
    );

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Equity curve"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={col} stopOpacity="0.22" />
            <stop offset="1" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} stroke="rgb(var(--line))" strokeOpacity="0.7" />
            <text x={PAD.l - 8} y={geo.y(t) + 3} textAnchor="end" fontSize="10" fill="rgb(var(--subtle))" className="num">{fmtUsd(t).replace('.00', '')}</text>
          </g>
        ))}
        <Line v={size} label="Initial size" color="rgb(var(--subtle))" />
        <Line v={target} label="Profit target" color="rgb(var(--up))" />
        <Line v={maxFloor} label="Max drawdown" color="rgb(var(--down))" dash="2 4" />
        <Line v={dailyFloor} label="Daily drawdown" color="rgb(var(--warn))" dash="2 4" />
        <path d={`${geo.line} L${geo.x(points.length - 1)} ${H - PAD.b} L${geo.x(0)} ${H - PAD.b} Z`} fill={`url(#${gid})`} />
        <path d={geo.line} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="miter" />
        {hover != null && hp && (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="rgb(var(--fg))" strokeOpacity="0.25" />
            <rect x={geo.x(hover) - 3} y={geo.y(hp.equity) - 3} width="6" height="6" fill={col} stroke="rgb(var(--panel))" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hp && hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 border border-line2 bg-panel px-3 py-2 text-xs"
          style={{ left: `${(geo.x(hover) / W) * 100}%`, transform: hover > points.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
        >
          <p className="num font-mono text-sm font-semibold">{fmtUsd(hp.equity)}</p>
          <p className="text-subtle">{dateTime(hp.taken_at)} UTC</p>
        </div>
      )}
    </div>
  );
}
