'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Check, ChevronDown, Maximize2, RefreshCw } from 'lucide-react';
import { useTheme } from 'next-themes';
import { binanceGet, FeedSocket, mapKline, TIMEFRAMES, type Candle } from '@/lib/binance';
import { fmtCompact, fmtNum, fmtPrice, fmtSigned, priceDecimals, qtyDecimals } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Position } from '@/lib/types';
import { Spinner } from '@/components/ui/States';
import { OneClickTrade } from './OneClickTrade';
import { cssRgb } from './theme';
import { useTerminalLayout } from './useLayout';
import { useTerminal } from './store';

const MA_DEFS = [
  { len: 7, color: '#F0B90B' },
  { len: 25, color: '#C084FC' },
  { len: 99, color: '#38BDF8' },
] as const;
const EMA_DEFS = [
  { len: 20, color: '#34D399' },
  { len: 50, color: '#F472B6' },
] as const;
const BB_LEN = 20;
const BB_MULT = 2;
const BB_COLOR = '#60A5FA';

/* ── indicator maths ──────────────────────────────────────────────────────── */
function smaAt(candles: Candle[], idx: number, len: number): number | null {
  if (idx + 1 < len) return null;
  let s = 0;
  for (let i = idx - len + 1; i <= idx; i++) s += candles[i].close;
  return s / len;
}

function buildMA(candles: Candle[], len: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= len) sum -= candles[i - len].close;
    if (i >= len - 1) out.push({ time: candles[i].time as UTCTimestamp, value: sum / len });
  }
  return out;
}

function buildEMA(candles: Candle[], len: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  if (!candles.length) return out;
  const k = 2 / (len + 1);
  let e = candles[0].close;
  for (let i = 0; i < candles.length; i++) {
    if (i > 0) e = candles[i].close * k + e * (1 - k);
    if (i >= len - 1) out.push({ time: candles[i].time as UTCTimestamp, value: e });
  }
  return out;
}

function emaLast(candles: Candle[], len: number): number | null {
  if (candles.length < len) return null;
  const k = 2 / (len + 1);
  let e = candles[0].close;
  for (let i = 1; i < candles.length; i++) e = candles[i].close * k + e * (1 - k);
  return e;
}

function bbAt(candles: Candle[], idx: number): { up: number; mid: number; low: number } | null {
  if (idx + 1 < BB_LEN) return null;
  let s = 0;
  for (let i = idx - BB_LEN + 1; i <= idx; i++) s += candles[i].close;
  const mid = s / BB_LEN;
  let v = 0;
  for (let i = idx - BB_LEN + 1; i <= idx; i++) v += (candles[i].close - mid) ** 2;
  const sd = Math.sqrt(v / BB_LEN);
  return { up: mid + BB_MULT * sd, mid, low: mid - BB_MULT * sd };
}

function buildBB(candles: Candle[]) {
  const up: { time: UTCTimestamp; value: number }[] = [], mid: typeof up = [], low: typeof up = [];
  for (let i = 0; i < candles.length; i++) {
    const b = bbAt(candles, i);
    if (!b) continue;
    const time = candles[i].time as UTCTimestamp;
    up.push({ time, value: b.up }); mid.push({ time, value: b.mid }); low.push({ time, value: b.low });
  }
  return { up, mid, low };
}

/** Unix second at which the candle that opened at `open` closes (calendar-aware for the monthly candle). */
function candleClose(open: number, key: string, seconds: number): number {
  if (key === '1M') { const d = new Date(open * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000; }
  return open + seconds;
}

function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${p(h)}:${p(m)}:${p(r)}`;
  if (h > 0) return `${p(h)}:${p(m)}:${p(r)}`;
  return `${p(m)}:${p(r)}`;
}

interface Legend { o: number; h: number; l: number; c: number; v: number; chg: number }
interface LineSpec { key: string; price: number; color: string; style: LineStyle; title: string; width?: 1 | 2; axis?: boolean }

/* ── indicators / levels menu ─────────────────────────────────────────────── */
function MenuRow({ label, hint, checked, onToggle }: { label: string; hint?: string; checked: boolean; onToggle: () => void }) {
  return (
    <button role="menuitemcheckbox" aria-checked={checked} onClick={onToggle} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-fg/[0.06] lg:py-2">
      <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', checked ? 'border-accent bg-accent text-accent-fg' : 'border-line')}>{checked && <Check className="h-3 w-3" strokeWidth={3} />}</span>
      <span className="min-w-0 flex-1"><span className="block truncate">{label}</span>{hint && <span className="block truncate text-2xs text-subtle">{hint}</span>}</span>
    </button>
  );
}

function IndicatorsMenu() {
  const showVol = useTerminal((s) => s.showVol);
  const showMA = useTerminal((s) => s.showMA);
  const showEMA = useTerminal((s) => s.showEMA);
  const showBB = useTerminal((s) => s.showBB);
  const showLevels = useTerminal((s) => s.showLevels);
  const showOrders = useTerminal((s) => s.showOrders);
  const showQuotes = useTerminal((s) => s.showQuotes);
  const magnet = useTerminal((s) => s.magnet);
  const set = useTerminal((s) => s.set);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = [showVol, showMA, showEMA, showBB].filter(Boolean).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={cn('inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors lg:h-6 lg:px-2', open || active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted hover:text-fg')}>
        Indicators{active > 0 && <span className="num rounded bg-accent/20 px-1 text-2xs">{active}</span>}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" aria-label="Chart indicators and levels" className="absolute right-0 top-full z-40 mt-1 max-h-[70dvh] w-[270px] overflow-y-auto rounded-lg border border-line bg-panel py-1 shadow-2xl">
          <p className="px-3 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-subtle">Indicators</p>
          <MenuRow label="Volume" hint="Turn off to remove the bars" checked={showVol} onToggle={() => set({ showVol: !showVol })} />
          <MenuRow label="Moving averages" hint="MA 7 · 25 · 99" checked={showMA} onToggle={() => set({ showMA: !showMA })} />
          <MenuRow label="Exponential averages" hint="EMA 20 · 50" checked={showEMA} onToggle={() => set({ showEMA: !showEMA })} />
          <MenuRow label="Bollinger Bands" hint="Period 20 · deviation 2" checked={showBB} onToggle={() => set({ showBB: !showBB })} />
          <p className="border-t border-line px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle">On the chart</p>
          <MenuRow label="Positions" hint="Entry, take-profit, stop-loss, liquidation, entry arrow" checked={showLevels} onToggle={() => set({ showLevels: !showLevels })} />
          <MenuRow label="Pending orders" hint="Limit and stop trigger prices" checked={showOrders} onToggle={() => set({ showOrders: !showOrders })} />
          <MenuRow label="Bid / Ask lines" hint="Prices your orders fill at" checked={showQuotes} onToggle={() => set({ showQuotes: !showQuotes })} />
          <MenuRow label="Magnet crosshair" hint="Snap to the candle (G)" checked={magnet} onToggle={() => set({ magnet: !magnet })} />
        </div>
      )}
    </div>
  );
}

function PriceChartInner({ positions }: { positions: Position[] }) {
  const mob = useTerminalLayout() === 'mobile';
  const symbol = useTerminal((s) => s.symbol);
  const timeframe = useTerminal((s) => s.timeframe);
  const magnet = useTerminal((s) => s.magnet);
  const showMA = useTerminal((s) => s.showMA);
  const showVol = useTerminal((s) => s.showVol);
  const showEMA = useTerminal((s) => s.showEMA);
  const showBB = useTerminal((s) => s.showBB);
  const showLevels = useTerminal((s) => s.showLevels);
  const showOrders = useTerminal((s) => s.showOrders);
  const showQuotes = useTerminal((s) => s.showQuotes);
  const accountId = useTerminal((s) => s.accountId);
  const pendingAll = useTerminal((s) => s.pending);
  const quote = useTerminal((s) => s.prices[s.symbol]);
  const setStore = useTerminal((s) => s.set);
  const { resolvedTheme } = useTheme();

  const hostRef = useRef<HTMLDivElement>(null);
  const cdRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const emaRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const bbRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const dataRef = useRef<Candle[]>([]);
  const lineMap = useRef(new Map<string, IPriceLine>());
  const loadingOlder = useRef(false);
  const exhausted = useRef(false);
  const reqId = useRef(0);

  // live flags for the tick path, so hidden indicators cost nothing
  const flags = useRef({ vol: showVol, ma: showMA, ema: showEMA, bb: showBB });
  flags.current = { vol: showVol, ma: showMA, ema: showEMA, bb: showBB };
  const pendingTicks = useRef<Candle[]>([]);
  const raf = useRef(0);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [legend, setLegend] = useState<Legend | null>(null);
  const [hover, setHover] = useState(false);

  const tf = useMemo(() => TIMEFRAMES.find((t) => t.key === timeframe) ?? TIMEFRAMES[3], [timeframe]);
  const tfRef = useRef(tf);
  tfRef.current = tf;

  const palette = useCallback(() => ({
    text: cssRgb('muted'),
    grid: cssRgb('line', 0.45),
    border: cssRgb('line'),
    up: cssRgb('up'),
    down: cssRgb('down'),
    cross: cssRgb('subtle'),
    label: cssRgb('panel'),
  }), []);

  /* ── candle-close countdown, pinned under the last-price label (DOM only, no React state) ── */
  const updateCountdown = useCallback(() => {
    const el = cdRef.current, series = candleRef.current;
    const last = dataRef.current[dataRef.current.length - 1];
    if (!el || !series || !last) { if (el) el.style.display = 'none'; return; }
    const y = series.priceToCoordinate(last.close);
    if (y == null || Number.isNaN(y)) { el.style.display = 'none'; return; }
    const t = tfRef.current;
    const left = candleClose(last.time, t.key, t.seconds) - Date.now() / 1000;
    const upC = last.close >= last.open;
    el.textContent = fmtCountdown(left);
    el.style.display = 'block';
    el.style.top = `${Math.round(y + 10)}px`;
    el.style.background = upC ? cssRgb('up') : cssRgb('down');
    el.style.color = upC ? '#000' : '#fff';
  }, []);

  /* ── chart lifecycle ──────────────────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const p = palette();
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: p.text, fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: 11, attributionLogo: false } as any,
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      rightPriceScale: { borderColor: p.border, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: p.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: window.innerWidth < 640 ? 6 : 8, minBarSpacing: 1 },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: p.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: p.border },
        horzLine: { color: p.cross, width: 1, style: LineStyle.Dashed, labelBackgroundColor: p.border },
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      localization: { priceFormatter: (v: number) => fmtPrice(v) },
    });

    const candle = chart.addCandlestickSeries({
      upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down,
      priceLineWidth: 1, priceLineStyle: LineStyle.Dashed,
    });
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false, visible: flags.current.vol });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const line = (color: string, on: boolean, style: LineStyle = LineStyle.Solid) =>
      chart.addLineSeries({ color, lineWidth: 1, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: on });
    maRefs.current = MA_DEFS.map((d) => line(d.color, flags.current.ma));
    emaRefs.current = EMA_DEFS.map((d) => line(d.color, flags.current.ema));
    bbRefs.current = [line(BB_COLOR, flags.current.bb), line(BB_COLOR, flags.current.bb, LineStyle.Dotted), line(BB_COLOR, flags.current.bb)];

    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point || param.point.x < 0) { setLegend(null); return; }
      const c = param.seriesData.get(candle) as { open: number; high: number; low: number; close: number } | undefined;
      const v = param.seriesData.get(vol) as { value: number } | undefined;
      if (!c) { setLegend(null); return; }
      setLegend({ o: c.open, h: c.high, l: c.low, c: c.close, v: v?.value ?? 0, chg: c.open ? ((c.close - c.open) / c.open) * 100 : 0 });
    };
    chart.subscribeCrosshairMove(onMove);

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      updateCountdown();
      // lazy-load history when the user scrolls to the left edge
      if (!range || range.from > 30 || loadingOlder.current || exhausted.current || !dataRef.current.length) return;
      void loadOlder();
    });

    const cd = setInterval(updateCountdown, 1000);

    return () => {
      clearInterval(cd);
      cancelAnimationFrame(raf.current); raf.current = 0; pendingTicks.current = [];
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null; candleRef.current = null; volRef.current = null;
      maRefs.current = []; emaRefs.current = []; bbRefs.current = [];
      lineMap.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── theme ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // tokens switch on the next frame after next-themes flips the class
    const id = requestAnimationFrame(() => {
      const p = palette();
      chart.applyOptions({
        layout: { textColor: p.text },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        rightPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border },
        crosshair: { vertLine: { color: p.cross, labelBackgroundColor: p.border }, horzLine: { color: p.cross, labelBackgroundColor: p.border } },
      });
      candleRef.current?.applyOptions({ upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down });
      if (flags.current.vol && dataRef.current.length) paintVolume(dataRef.current);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  const paintVolume = (cs: Candle[]) => {
    const up = cssRgb('up', 0.45), down = cssRgb('down', 0.45);
    volRef.current?.setData(cs.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? up : down })));
  };

  /** Full repaint. Indicators that are switched off are skipped here and filled in when they are switched on. */
  const paintAll = (cs: Candle[], fit: boolean) => {
    const f = flags.current;
    const dp = priceDecimals(cs[cs.length - 1]?.close ?? 1);
    candleRef.current?.applyOptions({ priceFormat: { type: 'price', precision: dp, minMove: 1 / 10 ** dp } });
    candleRef.current?.setData(cs.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    // Switched-off indicators must be EMPTIED, not just skipped: a hidden series still holds the previous timeframe's
    // timestamps, and the time scale is the union of every series' times, so stale 15m/1h points make daily candles
    // spread out with huge gaps (this was the broken 6H/12H/1D/1W charts).
    if (f.vol) paintVolume(cs); else volRef.current?.setData([]);
    if (f.ma) MA_DEFS.forEach((d, i) => maRefs.current[i]?.setData(buildMA(cs, d.len))); else maRefs.current.forEach((r) => r.setData([]));
    if (f.ema) EMA_DEFS.forEach((d, i) => emaRefs.current[i]?.setData(buildEMA(cs, d.len))); else emaRefs.current.forEach((r) => r.setData([]));
    if (f.bb) { const bb = buildBB(cs); bbRefs.current[0]?.setData(bb.up); bbRefs.current[1]?.setData(bb.mid); bbRefs.current[2]?.setData(bb.low); } else bbRefs.current.forEach((r) => r.setData([]));
    if (fit) {
      // a new timeframe always starts at the normal zoom (an old pinch-zoom must not carry over), showing the latest candles
      const ts = chartRef.current?.timeScale();
      ts?.applyOptions({ barSpacing: window.innerWidth < 640 ? 6 : 8 });
      ts?.scrollToRealTime();
    }
    updateCountdown();
  };

  // switching an indicator on paints it from the data already in memory
  useEffect(() => {
    const cs = dataRef.current;
    volRef.current?.applyOptions({ visible: showVol });
    if (showVol && cs.length) paintVolume(cs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVol]);
  useEffect(() => {
    const cs = dataRef.current;
    maRefs.current.forEach((s) => s.applyOptions({ visible: showMA }));
    if (showMA && cs.length) MA_DEFS.forEach((d, i) => maRefs.current[i]?.setData(buildMA(cs, d.len)));
  }, [showMA]);
  useEffect(() => {
    const cs = dataRef.current;
    emaRefs.current.forEach((s) => s.applyOptions({ visible: showEMA }));
    if (showEMA && cs.length) EMA_DEFS.forEach((d, i) => emaRefs.current[i]?.setData(buildEMA(cs, d.len)));
  }, [showEMA]);
  useEffect(() => {
    const cs = dataRef.current;
    bbRefs.current.forEach((s) => s.applyOptions({ visible: showBB }));
    if (showBB && cs.length) { const bb = buildBB(cs); bbRefs.current[0]?.setData(bb.up); bbRefs.current[1]?.setData(bb.mid); bbRefs.current[2]?.setData(bb.low); }
  }, [showBB]);
  useEffect(() => { chartRef.current?.applyOptions({ crosshair: { mode: magnet ? CrosshairMode.Magnet : CrosshairMode.Normal } }); }, [magnet]);

  /* ── history ──────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setStatus('loading');
    exhausted.current = false;
    dataRef.current = [];
    pendingTicks.current = [];
    try {
      const rows = await binanceGet<(string | number)[][]>('/api/v3/klines', { symbol, interval: timeframe, limit: 500 });
      if (id !== reqId.current) return;
      const cs = rows.map(mapKline);
      dataRef.current = cs;
      paintAll(cs, true);
      setLegend(null);
      setStatus('ready');
    } catch {
      if (id === reqId.current) setStatus('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  const loadOlder = useCallback(async () => {
    const first = dataRef.current[0];
    if (!first || loadingOlder.current) return;
    loadingOlder.current = true;
    const id = reqId.current;
    try {
      const rows = await binanceGet<(string | number)[][]>('/api/v3/klines', { symbol, interval: timeframe, limit: 500, endTime: first.time * 1000 - 1 });
      if (id !== reqId.current) return;
      if (!rows.length) { exhausted.current = true; return; }
      const older = rows.map(mapKline);
      const range = chartRef.current?.timeScale().getVisibleLogicalRange();
      dataRef.current = [...older, ...dataRef.current];
      paintAll(dataRef.current, false);
      if (range) chartRef.current?.timeScale().setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length });
    } catch { /* silent: user can scroll again */ } finally { loadingOlder.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  useEffect(() => { void load(); }, [load]);

  /* ── live candle: data is updated immediately, drawing is batched to one frame ──── */
  const flushTicks = useCallback(() => {
    raf.current = 0;
    const list = pendingTicks.current;
    pendingTicks.current = [];
    const candle = candleRef.current;
    if (!candle || !list.length || document.hidden) return;
    const f = flags.current;
    const data = dataRef.current;
    for (const c of list) {
      const time = c.time as UTCTimestamp;
      candle.update({ time, open: c.open, high: c.high, low: c.low, close: c.close });
      if (f.vol) volRef.current?.update({ time, value: c.volume, color: c.close >= c.open ? cssRgb('up', 0.45) : cssRgb('down', 0.45) });
    }
    const idx = data.length - 1;
    const time = data[idx].time as UTCTimestamp;
    if (f.ma) MA_DEFS.forEach((d, i) => { const v = smaAt(data, idx, d.len); if (v != null) maRefs.current[i]?.update({ time, value: v }); });
    if (f.ema) EMA_DEFS.forEach((d, i) => { const v = emaLast(data, d.len); if (v != null) emaRefs.current[i]?.update({ time, value: v }); });
    if (f.bb) { const b = bbAt(data, idx); if (b) { bbRefs.current[0]?.update({ time, value: b.up }); bbRefs.current[1]?.update({ time, value: b.mid }); bbRefs.current[2]?.update({ time, value: b.low }); } }
    updateCountdown();
  }, [updateCountdown]);

  const applyTick = useCallback((c: Candle) => {
    const data = dataRef.current;
    if (!data.length || !candleRef.current) return;
    const last = data[data.length - 1];
    if (c.time < last.time) return;
    if (c.time === last.time) data[data.length - 1] = c; else data.push(c);
    const q = pendingTicks.current;
    if (q.length && q[q.length - 1].time === c.time) q[q.length - 1] = c; else q.push(c);
    if (!raf.current) raf.current = requestAnimationFrame(flushTicks);
  }, [flushTicks]);

  // tab hidden → drawing is skipped; repaint once when it comes back
  useEffect(() => {
    const onVis = () => { if (!document.hidden && dataRef.current.length) paintAll(dataRef.current, false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let wsLive = false;
    const sock = new FeedSocket(
      [`${symbol.toLowerCase()}@kline_${timeframe}`],
      (_s, d) => { if (d?.k) applyTick({ time: Math.floor(d.k.t / 1000), open: +d.k.o, high: +d.k.h, low: +d.k.l, close: +d.k.c, volume: +d.k.v }); },
      (st) => { wsLive = st === 'live'; },
    );
    // when the socket is down, keep the forming candle alive from the trade tape
    const unsub = useTerminal.subscribe((s, prev) => {
      if (wsLive || s.last == null || s.last === prev.last) return;
      const last = dataRef.current[dataRef.current.length - 1];
      if (!last) return;
      const t = tfRef.current;
      const now = Math.floor(Date.now() / 1000);
      if (now < candleClose(last.time, t.key, t.seconds)) applyTick({ ...last, close: s.last, high: Math.max(last.high, s.last), low: Math.min(last.low, s.last) });
      else if (t.seconds <= 86400) { const bucket = Math.floor(now / t.seconds) * t.seconds; applyTick({ time: bucket, open: s.last, high: s.last, low: s.last, close: s.last, volume: 0 }); }
    });
    return () => { sock.close(); unsub(); };
  }, [symbol, timeframe, applyTick]);

  /* ── trade levels: positions, pending orders, bid / ask ──────────────────── */
  const pending = useMemo(() => pendingAll.filter((o) => o.accountId === accountId && o.symbol === symbol), [pendingAll, accountId, symbol]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    const specs: LineSpec[] = [];
    const up = cssRgb('up'), down = cssRgb('down'), warn = cssRgb('warn'), info = cssRgb('info'), muted = cssRgb('muted', 0.8);

    if (showLevels) {
      for (const p of positions) {
        if (p.symbol !== symbol) continue;
        const long = p.side === 'long';
        const qty = fmtNum(p.quantity, qtyDecimals(p.entry_price) + 1);
        const add = (suffix: string, price: number | null | undefined, color: string, style: LineStyle, title: string, width: 1 | 2 = 1, axis = true) => {
          if (price != null && Number.isFinite(price) && price > 0) specs.push({ key: `p:${p.id}:${suffix}`, price, color, style, title, width, axis });
        };
        // like TradingView / MT5: the tag shows live profit and is coloured by it; side is shown by the entry arrow
        add('entry', p.entry_price, p.unrealized_pnl >= 0 ? up : down, LineStyle.LargeDashed, mob ? fmtSigned(p.unrealized_pnl) : `${long ? 'BUY' : 'SELL'} ${qty}  ${fmtSigned(p.unrealized_pnl)}`);
        add('liq', p.liquidation_price, warn, LineStyle.Dotted, mob ? 'LIQ' : 'LIQUIDATION', 1, false);
        add('tp', p.take_profit, up, LineStyle.Dashed, mob ? 'TP' : 'TAKE PROFIT');
        add('sl', p.stop_loss, down, LineStyle.Dashed, mob ? 'SL' : 'STOP LOSS');
      }
    }
    if (showOrders) {
      for (const o of pending) {
        specs.push({ key: `o:${o.id}`, price: o.trigger, color: o.status === 'failed' ? down : muted, style: LineStyle.Dashed, title: `${o.side === 'long' ? 'BUY' : 'SELL'} ${o.kind.toUpperCase()}${o.status === 'failed' ? ' · FAILED' : ''}` });
      }
    }
    if (showQuotes && quote && !mob) {
      specs.push({ key: 'q:bid', price: quote.bid, color: muted, style: LineStyle.Dotted, title: 'BID' });
      specs.push({ key: 'q:ask', price: quote.ask, color: muted, style: LineStyle.Dotted, title: 'ASK' });
    }

    const keep = new Set(specs.map((s) => s.key));
    for (const [k, l] of lineMap.current) {
      if (!keep.has(k)) { try { series.removePriceLine(l); } catch { /* already gone */ } lineMap.current.delete(k); }
    }
    for (const sp of specs) {
      const opts = { price: sp.price, color: sp.color, lineWidth: sp.width ?? 1, lineStyle: sp.style, axisLabelVisible: sp.axis !== false, title: sp.title };
      const ex = lineMap.current.get(sp.key);
      if (ex) ex.applyOptions(opts); else lineMap.current.set(sp.key, series.createPriceLine(opts));
    }
  }, [positions, pending, quote, symbol, showLevels, showOrders, showQuotes, status, mob]);

  // BUY / SELL arrows on the candle each open position was entered on
  useEffect(() => {
    const series = candleRef.current;
    if (!series || status !== 'ready') return;
    const markers: SeriesMarker<Time>[] = [];
    const cs = dataRef.current;
    if (showLevels && cs.length) {
      for (const p of positions) {
        if (p.symbol !== symbol) continue;
        const t = Date.parse(p.created_at) / 1000;
        if (!Number.isFinite(t) || t < cs[0].time) continue;
        // candle that was open at entry time = last candle opening at or before it
        let lo = 0, hi = cs.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cs[mid].time <= t) lo = mid; else hi = mid - 1; }
        const long = p.side === 'long';
        markers.push({ time: cs[lo].time as UTCTimestamp, position: long ? 'belowBar' : 'aboveBar', color: long ? cssRgb('up') : cssRgb('down'), shape: long ? 'arrowUp' : 'arrowDown', size: 0.8 });
      }
      markers.sort((a, b) => (a.time as number) - (b.time as number));
    }
    try { series.setMarkers(markers); } catch { /* time outside the loaded range */ }
  }, [positions, symbol, tf.seconds, showLevels, status]);

  const shown: Legend | null = useMemo(() => {
    if (legend) return legend;
    const last = dataRef.current[dataRef.current.length - 1];
    return last ? { o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume, chg: last.open ? ((last.close - last.open) / last.open) * 100 : 0 } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legend, status]);

  const tone = shown && shown.c >= shown.o ? 'text-up' : 'text-down';
  const lastIdx = dataRef.current.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-1.5 py-1 sm:px-2">
        <div role="tablist" aria-label="Timeframe" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scroll-none">
          {TIMEFRAMES.map((t, i) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={timeframe === t.key}
              title={i < 9 ? `${t.label} (Alt+${i + 1})` : t.label}
              onClick={() => setStore({ timeframe: t.key })}
              className={cn('h-8 shrink-0 rounded px-2 text-xs font-medium transition-colors lg:h-6', timeframe === t.key ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IndicatorsMenu />
          <button onClick={() => chartRef.current?.timeScale().scrollToRealTime()} title="Jump to the latest candle" className="inline-flex h-8 items-center gap-1 rounded px-1.5 text-xs text-muted hover:bg-fg/[0.06] hover:text-fg lg:h-6"><Maximize2 className="h-3.5 w-3.5" /><span className="max-xl:sr-only">Latest</span></button>
          <button onClick={() => void load()} title="Reload the chart" className="inline-flex h-8 items-center gap-1 rounded px-1.5 text-xs text-muted hover:bg-fg/[0.06] hover:text-fg lg:h-6"><RefreshCw className="h-3.5 w-3.5" /><span className="max-xl:sr-only">Reload</span></button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" role="img" aria-label={`${symbol} ${tf.label} candlestick chart`} />

        {shown && status === 'ready' && !mob && (
          <div className="pointer-events-none absolute left-2 top-1.5 z-[1] max-w-[calc(100%-72px)] space-y-0.5 text-2xs">
            <div className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
              <span className="font-sans text-xs font-semibold text-fg">{symbol.replace('USDT', '/USDT')} · {tf.label}</span>
              <span className="text-subtle">O <span className={tone}>{fmtPrice(shown.o)}</span></span>
              <span className="text-subtle">H <span className={tone}>{fmtPrice(shown.h)}</span></span>
              <span className="text-subtle">L <span className={tone}>{fmtPrice(shown.l)}</span></span>
              <span className="text-subtle">C <span className={tone}>{fmtPrice(shown.c)}</span></span>
              <span className={tone}>{shown.chg >= 0 ? '+' : ''}{fmtNum(shown.chg)}%</span>
              {showVol && <span className="text-subtle max-sm:hidden">Vol <span className="text-muted">{fmtCompact(shown.v)}</span></span>}
            </div>
            {(showMA || showEMA || showBB) && (
              <div className="num flex flex-wrap gap-x-3 font-mono">
                {showMA && MA_DEFS.map((d) => { const v = smaAt(dataRef.current, lastIdx, d.len); return <span key={`ma${d.len}`} style={{ color: d.color }}>MA{d.len} {v != null ? fmtPrice(v) : '—'}</span>; })}
                {showEMA && EMA_DEFS.map((d) => { const v = emaLast(dataRef.current, d.len); return <span key={`ema${d.len}`} style={{ color: d.color }}>EMA{d.len} {v != null ? fmtPrice(v) : '—'}</span>; })}
                {showBB && <span style={{ color: BB_COLOR }}>BB({BB_LEN}, {BB_MULT})</span>}
              </div>
            )}
          </div>
        )}

        {/* time left until the current candle closes */}
        <div ref={cdRef} aria-label="Time until the candle closes" title="Time until the candle closes" className="num pointer-events-none absolute right-0 z-[2] hidden min-w-[58px] rounded-sm px-1.5 py-px text-center font-mono text-2xs font-semibold" />

        <div className="absolute left-2 top-11 z-[3] max-lg:hidden"><OneClickTrade /></div>

        {status === 'loading' && (
          <div className="absolute inset-0 z-[2] grid place-items-center bg-panel/60 backdrop-blur-[1px]"><div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" />Loading {symbol.replace('USDT', '/USDT')}…</div></div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-[2] grid place-items-center bg-panel/80">
            <div className="max-w-xs text-center">
              <p className="text-sm font-medium">Chart data is unavailable</p>
              <p className="mt-1 text-xs text-muted">The market-data provider could not be reached. Trading and positions still work.</p>
              <button onClick={() => void load()} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-panel2 px-3 text-sm hover:border-accent/60"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
            </div>
          </div>
        )}
        <span className={cn('pointer-events-none absolute bottom-1.5 left-2 z-[1] text-2xs text-subtle transition-opacity max-lg:hidden', hover ? 'opacity-0' : 'opacity-70')}>Scroll to zoom · drag to pan</span>
      </div>
    </div>
  );
}

export const PriceChart = memo(PriceChartInner);
