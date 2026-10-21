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
  type UTCTimestamp,
} from 'lightweight-charts';
import { Crosshair, Maximize2, RefreshCw, Spline } from 'lucide-react';
import { useTheme } from 'next-themes';
import { binanceGet, FeedSocket, mapKline, TIMEFRAMES, type Candle } from '@/lib/binance';
import { fmtCompact, fmtNum, fmtPrice, priceDecimals } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Position } from '@/lib/types';
import { Spinner } from '@/components/ui/States';
import { cssRgb } from './theme';
import { useTerminal } from './store';

const MA_DEFS = [
  { len: 7, color: '#F0B90B' },
  { len: 25, color: '#C084FC' },
  { len: 99, color: '#38BDF8' },
] as const;

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

interface Legend { o: number; h: number; l: number; c: number; v: number; chg: number }

function PriceChartInner({ positions }: { positions: Position[] }) {
  const symbol = useTerminal((s) => s.symbol);
  const timeframe = useTerminal((s) => s.timeframe);
  const magnet = useTerminal((s) => s.magnet);
  const showMA = useTerminal((s) => s.showMA);
  const setStore = useTerminal((s) => s.set);
  const { resolvedTheme } = useTheme();

  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const maRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const dataRef = useRef<Candle[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const loadingOlder = useRef(false);
  const exhausted = useRef(false);
  const reqId = useRef(0);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [legend, setLegend] = useState<Legend | null>(null);
  const [hover, setHover] = useState(false);

  const tf = useMemo(() => TIMEFRAMES.find((t) => t.key === timeframe) ?? TIMEFRAMES[3], [timeframe]);

  const palette = useCallback(() => ({
    text: cssRgb('muted'),
    grid: cssRgb('line', 0.45),
    border: cssRgb('line'),
    up: cssRgb('up'),
    down: cssRgb('down'),
    cross: cssRgb('subtle'),
    label: cssRgb('panel'),
  }), []);

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
      timeScale: { borderColor: p.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 2 },
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
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    maRefs.current = MA_DEFS.map((d) => chart.addLineSeries({ color: d.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));

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

    // lazy-load history when the user scrolls to the left edge
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || range.from > 30 || loadingOlder.current || exhausted.current || !dataRef.current.length) return;
      void loadOlder();
    });

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null; candleRef.current = null; volRef.current = null; maRefs.current = []; linesRef.current = [];
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
      if (dataRef.current.length) paintVolume(dataRef.current);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);

  useEffect(() => { chartRef.current?.applyOptions({ crosshair: { mode: magnet ? CrosshairMode.Magnet : CrosshairMode.Normal } }); }, [magnet]);
  useEffect(() => { maRefs.current.forEach((s) => s.applyOptions({ visible: showMA })); }, [showMA]);

  const paintVolume = (cs: Candle[]) => {
    const up = cssRgb('up', 0.45), down = cssRgb('down', 0.45);
    volRef.current?.setData(cs.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? up : down })));
  };

  const paintAll = (cs: Candle[], fit: boolean) => {
    const dp = priceDecimals(cs[cs.length - 1]?.close ?? 1);
    candleRef.current?.applyOptions({ priceFormat: { type: 'price', precision: dp, minMove: 1 / 10 ** dp } });
    candleRef.current?.setData(cs.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    paintVolume(cs);
    MA_DEFS.forEach((d, i) => maRefs.current[i]?.setData(buildMA(cs, d.len)));
    if (fit) chartRef.current?.timeScale().scrollToRealTime();
  };

  /* ── history ──────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setStatus('loading');
    exhausted.current = false;
    dataRef.current = [];
    try {
      const rows = await binanceGet<(string | number)[][]>('/api/v3/klines', { symbol, interval: timeframe, limit: 500 });
      if (id !== reqId.current) return;
      const cs = rows.map(mapKline);
      dataRef.current = cs;
      paintAll(cs, true);
      const last = cs[cs.length - 1];
      if (last) setLegend(null);
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

  /* ── live candle ──────────────────────────────────────────────────────── */
  const applyTick = useCallback((c: Candle) => {
    const data = dataRef.current;
    if (!data.length || !candleRef.current) return;
    const last = data[data.length - 1];
    if (c.time < last.time) return;
    if (c.time === last.time) data[data.length - 1] = c; else data.push(c);
    candleRef.current.update({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
    volRef.current?.update({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? cssRgb('up', 0.45) : cssRgb('down', 0.45) });
    const idx = data.length - 1;
    MA_DEFS.forEach((d, i) => { const v = smaAt(data, idx, d.len); if (v != null) maRefs.current[i]?.update({ time: c.time as UTCTimestamp, value: v }); });
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
      const now = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(now / tf.seconds) * tf.seconds;
      if (bucket === last.time) applyTick({ ...last, close: s.last, high: Math.max(last.high, s.last), low: Math.min(last.low, s.last) });
      else if (bucket > last.time) applyTick({ time: bucket, open: s.last, high: s.last, low: s.last, close: s.last, volume: 0 });
    });
    return () => { sock.close(); unsub(); };
  }, [symbol, timeframe, tf.seconds, applyTick]);

  /* ── position lines ───────────────────────────────────────────────────── */
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    linesRef.current.forEach((l) => { try { series.removePriceLine(l); } catch { /* already gone */ } });
    linesRef.current = [];
    for (const p of positions) {
      if (p.symbol !== symbol) continue;
      const long = p.side === 'long';
      const add = (price: number | null | undefined, color: string, title: string, style: LineStyle) => {
        if (price == null || !Number.isFinite(price)) return;
        linesRef.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
      };
      add(p.entry_price, long ? cssRgb('up') : cssRgb('down'), `${long ? 'LONG' : 'SHORT'} ${p.leverage}×`, LineStyle.Solid);
      add(p.liquidation_price, cssRgb('down'), 'LIQ', LineStyle.Dotted);
      add(p.take_profit, cssRgb('up'), 'TP', LineStyle.Dashed);
      add(p.stop_loss, cssRgb('warn'), 'SL', LineStyle.Dashed);
    }
  }, [positions, symbol, status]);

  const shown: Legend | null = useMemo(() => {
    if (legend) return legend;
    const last = dataRef.current[dataRef.current.length - 1];
    return last ? { o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume, chg: last.open ? ((last.close - last.open) / last.open) * 100 : 0 } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legend, status]);

  const tone = shown && shown.c >= shown.o ? 'text-up' : 'text-down';

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center gap-1 border-b border-line px-2 py-1">
        <div role="tablist" aria-label="Timeframe" className="flex items-center">
          {TIMEFRAMES.map((t, i) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={timeframe === t.key}
              title={`${t.label} (Alt+${i + 1})`}
              onClick={() => setStore({ timeframe: t.key })}
              className={cn('h-6 rounded px-2 text-xs font-medium transition-colors', timeframe === t.key ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <button onClick={() => setStore({ magnet: !magnet })} aria-pressed={magnet} title="Magnet crosshair (G)" className={cn('inline-flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors', magnet ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}>
          <Crosshair className="h-3.5 w-3.5" /><span className="max-md:hidden">Magnet</span>
        </button>
        <button onClick={() => setStore({ showMA: !showMA })} aria-pressed={showMA} title="Moving averages" className={cn('inline-flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors', showMA ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}>
          <Spline className="h-3.5 w-3.5" /><span className="max-md:hidden">MA</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-2xs uppercase tracking-wider text-subtle max-sm:hidden">UTC</span>
          <button onClick={() => chartRef.current?.timeScale().scrollToRealTime()} title="Jump to latest" className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-fg/[0.06] hover:text-fg"><Maximize2 className="h-3.5 w-3.5" /><span className="sr-only">Jump to latest</span></button>
          <button onClick={() => void load()} title="Reload" className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-fg/[0.06] hover:text-fg"><RefreshCw className="h-3.5 w-3.5" /><span className="sr-only">Reload chart</span></button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" role="img" aria-label={`${symbol} ${tf.label} candlestick chart`} />

        {shown && status === 'ready' && (
          <div className="pointer-events-none absolute left-2 top-1.5 z-[1] max-w-[calc(100%-80px)] space-y-0.5 text-2xs">
            <div className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
              <span className="font-sans text-xs font-semibold text-fg">{symbol.replace('USDT', '/USDT')} · {tf.label}</span>
              <span className="text-subtle">O <span className={tone}>{fmtPrice(shown.o)}</span></span>
              <span className="text-subtle">H <span className={tone}>{fmtPrice(shown.h)}</span></span>
              <span className="text-subtle">L <span className={tone}>{fmtPrice(shown.l)}</span></span>
              <span className="text-subtle">C <span className={tone}>{fmtPrice(shown.c)}</span></span>
              <span className={tone}>{shown.chg >= 0 ? '+' : ''}{fmtNum(shown.chg)}%</span>
              <span className="text-subtle">Vol <span className="text-muted">{fmtCompact(shown.v)}</span></span>
            </div>
            {showMA && (
              <div className="num flex gap-3 font-mono">
                {MA_DEFS.map((d) => { const v = smaAt(dataRef.current, dataRef.current.length - 1, d.len); return <span key={d.len} style={{ color: d.color }}>MA{d.len} {v != null ? fmtPrice(v) : '—'}</span>; })}
              </div>
            )}
          </div>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 z-[2] grid place-items-center bg-panel/60 backdrop-blur-[1px]"><div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" />Loading {symbol.replace('USDT', '/USDT')}…</div></div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-[2] grid place-items-center bg-panel/80">
            <div className="max-w-xs text-center">
              <p className="text-sm font-medium">Chart data is unavailable</p>
              <p className="mt-1 text-xs text-muted">The market-data provider could not be reached. Trading and positions still work.</p>
              <button onClick={() => void load()} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel2 px-3 text-sm hover:border-accent/60"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
            </div>
          </div>
        )}
        <span className={cn('pointer-events-none absolute bottom-1.5 left-2 z-[1] text-2xs text-subtle transition-opacity', hover ? 'opacity-0' : 'opacity-70')}>Scroll to zoom · drag to pan</span>
      </div>
    </div>
  );
}

export const PriceChart = memo(PriceChartInner);
