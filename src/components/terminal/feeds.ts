'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { binanceGet, FeedSocket, mapMini, mapRest24 } from '@/lib/binance';
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
      refreshInterval: 3000,
      dedupingInterval: 2000,
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

/**
 * Last traded price for the selected symbol. The terminal no longer renders a depth ladder or a trade
 * tape, so only the (light) aggTrade stream is opened — and its updates are throttled to ~4 per second.
 */
export function useSymbolFeed(symbol: string) {
  useEffect(() => {
    const s = symbol.toLowerCase();
    let alive = true;
    let wsLive = false;
    let lastPx: number | null = null;
    let dirty = false;
    const st = useTerminal.getState;

    const seed = async () => {
      try {
        const r = await binanceGet<{ price: string }>('/api/v3/ticker/price', { symbol });
        if (!alive) return;
        lastPx = +r.price;
        if (Number.isFinite(lastPx)) st().setLast(lastPx);
      } catch { /* the websocket / next poll will fill in */ }
    };
    seed();
    const restPoll = setInterval(() => { if (!wsLive) seed(); }, 4000);

    const flush = setInterval(() => {
      if (!alive || !dirty || lastPx == null) return;
      dirty = false;
      st().setLast(lastPx);
    }, 250);

    const sock = new FeedSocket(
      [`${s}@aggTrade`],
      (_stream, data) => { const px = +data?.p; if (Number.isFinite(px)) { lastPx = px; dirty = true; } },
      (status) => { wsLive = status === 'live'; useTerminal.setState({ socket: status }); },
    );

    return () => { alive = false; clearInterval(restPoll); clearInterval(flush); sock.close(); };
  }, [symbol]);
}
