'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Logical } from 'lightweight-charts';
import {
  ArrowLeftToLine, ArrowRightToLine, Eye, EyeOff, Lock, Minus, MousePointer2, MoveUpRight, SeparatorVertical, Slash, Square, Trash2, Unlock, X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtPrice } from '@/lib/format';
import { useTerminal, type DrawDash, type DrawTool, type Drawing } from './store';

interface Candle { time: number }
type Pt = { t: number; p: number };

const COLORS = ['#60A5FA', '#26D694', '#F85B70', '#FBBF24', '#C084FC', '#F472B6', '#E5E7EB', '#64748B'];
const DASH: Record<DrawDash, string | undefined> = { solid: undefined, dashed: '7 5', dotted: '1.5 4' };
const TOOLS: { tool: DrawTool; label: string; icon: typeof Minus }[] = [
  { tool: 'hline', label: 'Horizontal line', icon: Minus },
  { tool: 'vline', label: 'Vertical line', icon: SeparatorVertical },
  { tool: 'trend', label: 'Trend line', icon: Slash },
  { tool: 'ray', label: 'Ray', icon: MoveUpRight },
  { tool: 'rect', label: 'Zone (rectangle)', icon: Square },
];
const needsTwo = (t: DrawTool) => t === 'trend' || t === 'ray' || t === 'rect';
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Drawing tools over the price chart: horizontal / vertical line, trend line, ray and rectangle zone.
 * Points are stored as (unix seconds, price), so drawings stay put through zoom, pan and timeframe changes.
 * Idle, only the shapes themselves take the pointer — the chart still pans and zooms everywhere else.
 */
function ChartDrawingsInner({ chart, series, getData, tfSeconds, symbol, compact, version }: {
  chart: IChartApi | null; series: ISeriesApi<'Candlestick'> | null; getData: () => Candle[]; tfSeconds: number; symbol: string; compact: boolean; version: unknown;
}) {
  const tool = useTerminal((s) => s.drawTool);
  const barOpen = useTerminal((s) => s.drawBarOpen);
  const list = useTerminal((s) => s.drawings[symbol]) ?? EMPTY;
  const setStore = useTerminal((s) => s.set);
  const setDrawings = useTerminal((s) => s.setDrawings);

  const [, setFrame] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: string; part: 'move' | 'a' | 'b'; x: number; y: number; orig: Drawing } | null>(null);
  const [dragging, setDragging] = useState(false);

  /* ── coordinate mapping ─────────────────────────────────────────────── */
  const pane = () => chart?.paneSize() ?? { width: 0, height: 0 };

  const tToLogical = useCallback((t: number): number | null => {
    const d = getData();
    if (!d.length) return null;
    const first = d[0].time, last = d[d.length - 1].time;
    if (t <= first) return (t - first) / tfSeconds;
    if (t >= last) return d.length - 1 + (t - last) / tfSeconds;
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (d[mid].time <= t) lo = mid; else hi = mid; }
    const span = d[hi].time - d[lo].time || tfSeconds;
    return lo + (t - d[lo].time) / span;
  }, [getData, tfSeconds]);

  const logicalToT = useCallback((l: number): number | null => {
    const d = getData();
    if (!d.length) return null;
    if (l <= 0) return d[0].time + l * tfSeconds;
    if (l >= d.length - 1) return d[d.length - 1].time + (l - (d.length - 1)) * tfSeconds;
    const i = Math.floor(l);
    return d[i].time + (l - i) * (d[i + 1].time - d[i].time);
  }, [getData, tfSeconds]);

  const toXY = useCallback((pt: Pt): { x: number; y: number } | null => {
    if (!chart || !series) return null;
    const l = tToLogical(pt.t);
    // logicalToCoordinate only accepts whole bars (a fractional index silently returns 0): interpolate between neighbours
    let x: number | null = null;
    if (l != null) {
      const ts = chart.timeScale(), i = Math.floor(l);
      const xi = ts.logicalToCoordinate(i as Logical), xj = ts.logicalToCoordinate((i + 1) as Logical);
      if (xi != null && xj != null) x = xi + (l - i) * (xj - xi);
    }
    const y = series.priceToCoordinate(pt.p);
    return x == null || y == null ? null : { x, y };
  }, [chart, series, tToLogical]);

  const toPt = useCallback((x: number, y: number): Pt | null => {
    if (!chart || !series) return null;
    const ts = chart.timeScale();
    // coordinateToLogical rounds to whole bars; derive a fractional index from the bar spacing instead
    const x0 = ts.logicalToCoordinate(0 as Logical), x1 = ts.logicalToCoordinate(1 as Logical);
    if (x0 == null || x1 == null || x1 === x0) return null;
    const t = logicalToT((x - x0) / (x1 - x0));
    const p = series.coordinateToPrice(y);
    return t == null || p == null ? null : { t, p: Number(p) };
  }, [chart, series, logicalToT]);

  /* ── redraw whenever the viewport moves (pan, zoom, autoscale, resize) ── */
  useEffect(() => {
    if (!chart || !series) return;
    let raf = 0, sig = '';
    const tick = () => {
      const r = chart.timeScale().getVisibleLogicalRange();
      const ps = chart.paneSize();
      const d = getData();
      const ref = d.length ? series.priceToCoordinate((d[d.length - 1] as unknown as { close: number }).close) : null;
      const ref2 = d.length ? series.priceToCoordinate((d[d.length - 1] as unknown as { close: number }).close * 1.01) : null;
      const next = `${r?.from}|${r?.to}|${ps.width}|${ps.height}|${ref}|${ref2}|${d.length}`;
      if (next !== sig) { sig = next; setFrame((f) => f + 1); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chart, series, getData, version]);

  /* ── create ─────────────────────────────────────────────────────────── */
  const commit = useCallback((d: Drawing) => {
    setDrawings(symbol, (l) => [...l, d]);
    setDraft(null);
    setSelected(d.id);
    setStore({ drawTool: null });
  }, [setDrawings, setStore, symbol]);

  const fresh = (t: DrawTool, a: Pt, b?: Pt): Drawing => ({
    id: uid(), tool: t, a, b, color: t === 'rect' ? '#60A5FA' : t === 'hline' ? '#FBBF24' : '#60A5FA', width: t === 'rect' ? 1 : 2, dash: 'solid',
    fill: t === 'rect' ? 0.14 : undefined, extendRight: t === 'ray' ? true : undefined,
  });

  const local = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const onCaptureDown = (e: React.PointerEvent) => {
    if (!tool) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = local(e);
    const pt = toPt(x, y);
    if (!pt) return;
    setHover({ x, y });
    if (!needsTwo(tool)) { commit(fresh(tool, pt)); return; }
    if (draft) { commit({ ...draft, b: pt }); return; } // second tap of a tap-tap drawing
    down.current = { x, y };
    setDraft(fresh(tool, pt, pt));
  };
  const onCaptureMove = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    setHover({ x, y });
    if (draft) { const pt = toPt(x, y); if (pt) setDraft({ ...draft, b: pt }); }
  };
  const onCaptureUp = (e: React.PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!draft || !start) return;
    const { x, y } = local(e);
    if (Math.hypot(x - start.x, y - start.y) > 6) { const pt = toPt(x, y); if (pt) commit({ ...draft, b: pt }); }
    // otherwise: a tap — wait for the second tap
  };

  /* ── select / move / resize ─────────────────────────────────────────── */
  const update = useCallback((id: string, patch: Partial<Drawing>) => setDrawings(symbol, (l) => l.map((d) => (d.id === id ? { ...d, ...patch } : d))), [setDrawings, symbol]);
  const remove = useCallback((id: string) => { setDrawings(symbol, (l) => l.filter((d) => d.id !== id)); setSelected(null); }, [setDrawings, symbol]);

  const startDrag = (e: React.PointerEvent, d: Drawing, part: 'move' | 'a' | 'b') => {
    e.stopPropagation();
    e.preventDefault();
    setSelected(d.id);
    if (d.locked) return;
    drag.current = { id: d.id, part, x: e.clientX, y: e.clientY, orig: d };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const g = drag.current;
      if (!g) return;
      const o = g.orig;
      const shift = (pt: Pt | undefined) => {
        if (!pt) return pt;
        const xy = toXY(pt);
        if (!xy) return pt;
        return toPt(xy.x + (e.clientX - g.x), xy.y + (e.clientY - g.y)) ?? pt;
      };
      if (g.part === 'move') update(g.id, { a: shift(o.a)!, b: shift(o.b) });
      else if (g.part === 'a') update(g.id, { a: shift(o.a)! });
      else update(g.id, { b: shift(o.b) });
    };
    const onUp = () => { drag.current = null; setDragging(false); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
  }, [dragging, toXY, toPt, update]);

  /* ── keyboard: Esc cancels, Delete removes the selection ─────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') { if (draft || tool) { setDraft(null); setStore({ drawTool: null }); } else setSelected(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); remove(selected); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, tool, selected, remove, setStore]);

  // a click on empty chart space deselects
  useEffect(() => {
    if (!chart) return;
    const off = () => setSelected(null);
    chart.subscribeClick(off);
    return () => chart.unsubscribeClick(off);
  }, [chart]);

  // a tool switch or a new symbol drops any half-made drawing / selection
  useEffect(() => { setDraft(null); }, [tool]);
  useEffect(() => { setSelected(null); setDraft(null); setConfirmClear(false); }, [symbol]);
  useEffect(() => { if (!confirmClear) return; const t = setTimeout(() => setConfirmClear(false), 3000); return () => clearTimeout(t); }, [confirmClear]);

  if (!chart || !series) return null;
  const { width: W, height: H } = pane();
  if (!W || !H) return null;

  /* ── geometry ───────────────────────────────────────────────────────── */
  const extend = (p1: { x: number; y: number }, p2: { x: number; y: number }, left?: boolean, right?: boolean) => {
    let a = p1, b = p2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    if (dx === 0 && dy === 0) return { a, b };
    const far = (from: { x: number; y: number }, dir: 1 | -1) => {
      const k = 4 * (W + H) / Math.hypot(dx, dy);
      return { x: from.x + dir * dx * k, y: from.y + dir * dy * k };
    };
    if (right) b = far(p2, 1);
    if (left) a = far(p1, -1);
    return { a, b };
  };

  const shapes = (hidden ? [] : list).concat(draft ? [draft] : []);
  const sel = list.find((d) => d.id === selected) ?? null;

  const render = (d: Drawing) => {
    const A = toXY(d.a), B = d.b ? toXY(d.b) : null;
    const isSel = d.id === selected;
    const common = { stroke: d.color, strokeWidth: d.width, strokeDasharray: DASH[d.dash], fill: 'none', vectorEffect: 'non-scaling-stroke' as const };
    const hit = () => ({ stroke: 'transparent', strokeWidth: 14, fill: 'none', style: { pointerEvents: 'stroke' as const, cursor: d.locked ? 'default' : 'move' }, onPointerDown: (e: React.PointerEvent) => startDrag(e, d, 'move') });
    const handle = (p: { x: number; y: number } | null, part: 'a' | 'b') => p && isSel && !d.locked && (
      <circle cx={p.x} cy={p.y} r={compact ? 7 : 5} fill="rgb(var(--panel))" stroke={d.color} strokeWidth={2} style={{ pointerEvents: 'all', cursor: 'grab' }} onPointerDown={(e) => startDrag(e, d, part)} />
    );
    const label = (x: number, y: number, anchor: 'start' | 'end' = 'start') => d.label && (
      <text x={x} y={y} textAnchor={anchor} fontSize={11} fill={d.color} style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgb(var(--bg))', strokeWidth: 3 }}>{d.label}</text>
    );

    if (d.tool === 'hline') {
      if (!A) return null;
      return (
        <g key={d.id}>
          <line x1={0} x2={W} y1={A.y} y2={A.y} {...common} />
          <line {...hit()} x1={0} x2={W} y1={A.y} y2={A.y} />
          {label(6, A.y - 5)}
          <g style={{ pointerEvents: 'none' }}>
            <rect x={W - 70} y={A.y - 9} width={70} height={18} rx={3} fill={d.color} />
            <text x={W - 35} y={A.y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0B0F17" className="num">{fmtPrice(d.a.p)}</text>
          </g>
          {isSel && !d.locked && <circle cx={W / 2} cy={A.y} r={compact ? 7 : 5} fill="rgb(var(--panel))" stroke={d.color} strokeWidth={2} style={{ pointerEvents: 'all', cursor: 'ns-resize' }} onPointerDown={(e) => startDrag(e, d, 'move')} />}
        </g>
      );
    }
    if (d.tool === 'vline') {
      if (!A) return null;
      return (
        <g key={d.id}>
          <line x1={A.x} x2={A.x} y1={0} y2={H} {...common} />
          <line {...hit()} x1={A.x} x2={A.x} y1={0} y2={H} />
          {label(A.x + 5, 14)}
          {isSel && !d.locked && <circle cx={A.x} cy={H / 2} r={compact ? 7 : 5} fill="rgb(var(--panel))" stroke={d.color} strokeWidth={2} style={{ pointerEvents: 'all', cursor: 'ew-resize' }} onPointerDown={(e) => startDrag(e, d, 'move')} />}
        </g>
      );
    }
    if (!A || !B) return null;
    if (d.tool === 'rect') {
      const x = Math.min(A.x, B.x), y = Math.min(A.y, B.y), w = Math.abs(B.x - A.x), h = Math.abs(B.y - A.y);
      const top = Math.max(d.a.p, d.b!.p), bottom = Math.min(d.a.p, d.b!.p);
      return (
        <g key={d.id}>
          <rect x={x} y={y} width={w} height={h} {...common} fill={d.color} fillOpacity={d.fill ?? 0.14} />
          <rect {...hit()} x={x} y={y} width={w} height={h} />
          {isSel && <rect x={x} y={y} width={w} height={h} fill="transparent" style={{ pointerEvents: 'all', cursor: d.locked ? 'default' : 'move' }} onPointerDown={(e) => startDrag(e, d, 'move')} />}
          {label(x + 6, y + 14)}
          {isSel && (
            <text x={x + w - 4} y={y - 5} textAnchor="end" fontSize={10} fill={d.color} className="num" style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgb(var(--bg))', strokeWidth: 3 }}>
              {fmtPrice(bottom)} – {fmtPrice(top)} · {(((top - bottom) / bottom) * 100).toFixed(2)}%
            </text>
          )}
          {handle(A, 'a')}{handle(B, 'b')}
        </g>
      );
    }
    // trend / ray
    const e = extend(A, B, d.extendLeft, d.extendRight || d.tool === 'ray');
    return (
      <g key={d.id}>
        <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} {...common} strokeLinecap="round" />
        <line {...hit()} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} />
        {label(A.x, A.y - 7)}
        {handle(A, 'a')}{handle(B, 'b')}
      </g>
    );
  };

  const btn = 'grid place-items-center rounded-md transition-colors';
  const bsz = compact ? 'h-9 w-9' : 'h-7 w-7';

  return (
    <>
      {/* shapes */}
      <svg className="pointer-events-none absolute left-0 top-0 z-[3] overflow-hidden" width={W} height={H} aria-hidden>
        {shapes.map(render)}
        {tool && hover && (
          <g style={{ pointerEvents: 'none' }} stroke="rgb(var(--subtle))" strokeDasharray="3 3" strokeWidth={1}>
            <line x1={0} x2={W} y1={hover.y} y2={hover.y} />
            <line x1={hover.x} x2={hover.x} y1={0} y2={H} />
          </g>
        )}
      </svg>

      {/* capture layer while a tool is armed: the chart must not pan under the pen */}
      {tool && (
        <div
          className="absolute left-0 top-0 z-[4] cursor-crosshair touch-none"
          style={{ width: W, height: H }}
          onPointerDown={onCaptureDown}
          onPointerMove={onCaptureMove}
          onPointerUp={onCaptureUp}
          onPointerLeave={() => setHover(null)}
        />
      )}

      {/* toolbar */}
      {barOpen && (
        <div className={cn('absolute left-1.5 top-1/2 z-[5] flex -translate-y-1/2 flex-col gap-0.5 rounded-lg border border-line bg-panel/95 p-0.5 shadow-pop backdrop-blur-sm')} role="toolbar" aria-label="Drawing tools">
          <button type="button" title="Select / move (Esc)" aria-label="Select" aria-pressed={!tool} onClick={() => setStore({ drawTool: null })} className={cn(btn, bsz, !tool ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}><MousePointer2 className="h-4 w-4" /></button>
          {TOOLS.map(({ tool: t, label, icon: Icon }) => (
            <button key={t} type="button" title={label} aria-label={label} aria-pressed={tool === t} onClick={() => { setSelected(null); setStore({ drawTool: tool === t ? null : t }); }}
              className={cn(btn, bsz, tool === t ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}><Icon className="h-4 w-4" /></button>
          ))}
          <span className="mx-1 my-0.5 h-px bg-line" />
          <button type="button" title={hidden ? 'Show drawings' : 'Hide drawings'} aria-label={hidden ? 'Show drawings' : 'Hide drawings'} onClick={() => { setHidden((h) => !h); setSelected(null); }} className={cn(btn, bsz, 'text-muted hover:bg-fg/[0.06] hover:text-fg')}>{hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          <button type="button" disabled={!list.length} title={confirmClear ? 'Tap again to delete all drawings on this pair' : 'Delete all drawings on this pair'} aria-label="Delete all drawings"
            onClick={() => { if (!confirmClear) { setConfirmClear(true); return; } setDrawings(symbol, () => []); setSelected(null); setConfirmClear(false); }}
            className={cn(btn, bsz, confirmClear ? 'bg-down/20 text-down' : 'text-muted hover:bg-fg/[0.06] hover:text-down', 'disabled:opacity-30')}><Trash2 className="h-4 w-4" /></button>
        </div>
      )}

      {/* hint while drawing */}
      {tool && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-[5] -translate-x-1/2 rounded-md bg-panel/95 px-2.5 py-1 text-2xs text-muted shadow-pop">
          {needsTwo(tool) ? (draft ? 'Tap or release at the second point' : 'Drag, or tap two points') : 'Tap to place'} · Esc to cancel
        </div>
      )}

      {/* style editor for the selected drawing */}
      {sel && !tool && !dragging && (
        <div className={cn('absolute left-1/2 top-2 z-[6] flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-lg border border-line bg-panel/95 p-1 shadow-pop backdrop-blur-sm', compact && 'top-1')} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 px-0.5" role="radiogroup" aria-label="Colour">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={sel.color === c} aria-label={`Colour ${c}`} onClick={() => update(sel.id, { color: c })}
                className={cn('h-5 w-5 rounded-full border-2 transition-transform', sel.color === c ? 'scale-110 border-fg' : 'border-transparent')} style={{ background: c }} />
            ))}
          </div>
          <span className="h-5 w-px bg-line" />
          <div className="flex items-center" role="radiogroup" aria-label="Thickness">
            {([1, 2, 3, 4] as const).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={sel.width === w} title={`${w}px`} onClick={() => update(sel.id, { width: w })}
                className={cn('grid h-7 w-7 place-items-center rounded-md', sel.width === w ? 'bg-fg/10' : 'hover:bg-fg/[0.06]')}><span className="block w-4 rounded-full bg-fg" style={{ height: w }} /></button>
            ))}
          </div>
          <span className="h-5 w-px bg-line" />
          <div className="flex items-center" role="radiogroup" aria-label="Line style">
            {(['solid', 'dashed', 'dotted'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sel.dash === s} title={s} onClick={() => update(sel.id, { dash: s })}
                className={cn('grid h-7 w-8 place-items-center rounded-md', sel.dash === s ? 'bg-fg/10' : 'hover:bg-fg/[0.06]')}>
                <svg width="18" height="4" aria-hidden><line x1="1" x2="17" y1="2" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray={s === 'solid' ? undefined : s === 'dashed' ? '5 3' : '1 3'} strokeLinecap="round" /></svg>
              </button>
            ))}
          </div>
          {sel.tool === 'rect' && (<>
            <span className="h-5 w-px bg-line" />
            <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Fill">
              {[0, 0.08, 0.16, 0.3].map((f) => (
                <button key={f} type="button" role="radio" aria-checked={(sel.fill ?? 0.14) === f} title={`Fill ${Math.round(f * 100)}%`} onClick={() => update(sel.id, { fill: f })}
                  className={cn('h-6 w-6 rounded-md border', (sel.fill ?? 0.14) === f ? 'border-fg' : 'border-line')} style={{ background: f ? `color-mix(in srgb, ${sel.color} ${Math.round(f * 100)}%, transparent)` : 'transparent' }} />
              ))}
            </div>
          </>)}
          {(sel.tool === 'trend' || sel.tool === 'ray') && (<>
            <span className="h-5 w-px bg-line" />
            <button type="button" title="Extend left" aria-pressed={!!sel.extendLeft} onClick={() => update(sel.id, { extendLeft: !sel.extendLeft })} className={cn('grid h-7 w-7 place-items-center rounded-md', sel.extendLeft ? 'bg-fg/10 text-fg' : 'text-muted hover:bg-fg/[0.06]')}><ArrowLeftToLine className="h-4 w-4" /></button>
            <button type="button" title="Extend right" aria-pressed={!!(sel.extendRight || sel.tool === 'ray')} onClick={() => update(sel.id, sel.tool === 'ray' ? { tool: 'trend', extendRight: false } : { extendRight: !sel.extendRight })} className={cn('grid h-7 w-7 place-items-center rounded-md', sel.extendRight || sel.tool === 'ray' ? 'bg-fg/10 text-fg' : 'text-muted hover:bg-fg/[0.06]')}><ArrowRightToLine className="h-4 w-4" /></button>
          </>)}
          <span className="h-5 w-px bg-line" />
          <input value={sel.label ?? ''} onChange={(e) => update(sel.id, { label: e.target.value.slice(0, 40) })} placeholder="Label" aria-label="Label"
            className="h-7 w-24 rounded-md border border-line bg-panel2/80 px-2 text-xs outline-none focus:border-accent/70" />
          <button type="button" title={sel.locked ? 'Unlock' : 'Lock'} aria-pressed={!!sel.locked} onClick={() => update(sel.id, { locked: !sel.locked })} className={cn('grid h-7 w-7 place-items-center rounded-md', sel.locked ? 'bg-fg/10 text-fg' : 'text-muted hover:bg-fg/[0.06]')}>{sel.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button>
          <button type="button" title="Delete (Del)" aria-label="Delete drawing" onClick={() => remove(sel.id)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-down/15 hover:text-down"><Trash2 className="h-4 w-4" /></button>
          <button type="button" title="Done" aria-label="Deselect" onClick={() => setSelected(null)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-fg/[0.06]"><X className="h-4 w-4" /></button>
        </div>
      )}
    </>
  );
}

const EMPTY: Drawing[] = [];

export const ChartDrawings = memo(ChartDrawingsInner);
