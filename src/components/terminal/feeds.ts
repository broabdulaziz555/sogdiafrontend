'use client';

import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { binanceGet, FeedSocket, mapMini, mapRest24, type AggTrade, type Level } from '@/lib/binance';
import { get } from '@/lib/api';
import type { MarketPricesResponse, MarketSymbol } from '@/lib/types';
import { useTerminal } from './store';

/** Contract prices (the exact bid/ask the engine fills at) — polled every 2 s. */
export function usePricesFeed() {
  const setPrices = useTerminal((s) => s.setPrices);
  useSWR<MarketPricesResponse>(
    ['terminal-prices'],
    () => get<MarketPricesResponse>('/market/prices'),
    {
      refreshInterval: 2000,
      dedupingInterval: 1000,
      revalidateOnFocus: true,
      keepPreviousData: true,
      onSuccess: (d) => setPrices(d.prices),
      onError: () => useTerminal.setState({ pricesOk: false }),
      shouldRetryOnError: true,
      errorRetryInterval: 3000,
    },
  );
  return useTerminal((s) => s.pricesOk);
}

export function useSymbolsFeed() {
  const r = useSWR<{ count: number; symbols: MarketSymbol[] }>(['terminal-symbols'], () => get('/market/symbols'), {
    revalidateOnFocus: false,
    onSuccess: (d) => useTerminal.setState({ symbols: d.symbols }),
  });
  return r;
}

/** 24 h stats for every listed symbol: websocket !miniTicker@arr with a REST fallback. */
export function useTickersFeed(symbols: MarketSymbol[]) {
  const key = symbols.map((s) => s.symbol).join(',');
  useEffect(() => {
    if (!symbols.length) return;
    const wanted = new Set(symbols.map((s) => s.symbol));
    const merge = useTerminal.getState().mergeTickers;
    let alive = true;
    let wsLive = false;

    const poll = async () => {
      if (wsLive) return;
      try {
        const rows = await binanceGet<any[]>('/api/v3/ticker/24hr', { symbols: JSON.stringify([...wanted]) });
        if (alive) merge(rows.map(mapRest24));
      } catch { /* retry on next tick */ }
    };
    poll();
    const iv = setInterval(poll, 10_000);

    let buf: any[] | null = null;
    const flush = setInterval(() => {
      if (buf) {
        merge(buf.filter((t) => wanted.has(t.s)).map(mapMini));
        buf = null;
      }
    }, 1000);

    const sock = new FeedSocket(
      ['!miniTicker@arr'],
      (_s, data) => { if (Array.isArray(data)) buf = data; },
      (st) => { wsLive = st === 'live'; useTerminal.setState({ tickerSocket: st }); },
      20_000,
    );
    return () => { alive = false; clearInterval(iv); clearInterval(flush); sock.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Order book + aggregated trades + last price for the selected symbol. */
export function useSymbolFeed(symbol: string) {
  const mounted = useRef(0);
  useEffect(() => {
    const id = ++mounted.current;
    const s = symbol.toLowerCase();
    let alive = true;
    let wsLive = false;

    let bids: Level[] = [];
    let asks: Level[] = [];
    let bookDirty = false;
    let tradeBuf: AggTrade[] = [];
    let trades: AggTrade[] = [];
    let lastPx: number | null = null;

    const st = useTerminal.getState;
    const set = useTerminal.setState;

    const parseLevels = (a: string[][]): Level[] => a.map(([p, q]) => [+p, +q] as Level);
    const parseTrade = (d: any): AggTrade => ({ id: d.a, price: +d.p, qty: +d.q, time: d.T, sell: !!d.m });

    // REST seeding / fallback
    const seed = async () => {
      try {
        const [d, t] = await Promise.all([
          binanceGet<{ bids: string[][]; asks: string[][] }>('/api/v3/depth', { symbol, limit: 20 }),
          binanceGet<any[]>('/api/v3/aggTrades', { symbol, limit: 60 }),
        ]);
        if (!alive || id !== mounted.current) return;
        if (!wsLive) { bids = parseLevels(d.bids); asks = parseLevels(d.asks); bookDirty = true; }
        if (!trades.length) {
          trades = t.map(parseTrade).reverse();
          lastPx = trades[0]?.price ?? lastPx;
          set({ trades: trades.slice(0, 60) });
          if (lastPx != null) st().setLast(lastPx);
        }
      } catch { /* the websocket / next poll will fill in */ }
    };
    seed();
    const restPoll = setInterval(() => { if (!wsLive) seed(); }, 2000);

    const flush = setInterval(() => {
      if (!alive) return;
      if (bookDirty) { bookDirty = false; set({ book: { bids, asks, at: Date.now() } }); }
      if (tradeBuf.length) {
        trades = [...tradeBuf.reverse(), ...trades].slice(0, 60);
        tradeBuf = [];
        set({ trades });
      }
      if (lastPx != null) st().setLast(lastPx);
    }, 150);

    const sock = new FeedSocket(
      [`${s}@depth20@100ms`, `${s}@aggTrade`],
      (stream, data) => {
        if (stream.includes('@depth')) {
          bids = parseLevels(data.bids); asks = parseLevels(data.asks); bookDirty = true;
        } else if (stream.includes('@aggTrade')) {
          const t = parseTrade(data);
          tradeBuf.push(t);
          if (tradeBuf.length > 80) tradeBuf = tradeBuf.slice(-80);
          lastPx = t.price;
        }
      },
      (status) => { wsLive = status === 'live'; set({ socket: status }); },
    );

    return () => { alive = false; clearInterval(restPoll); clearInterval(flush); sock.close(); };
  }, [symbol]);
}
