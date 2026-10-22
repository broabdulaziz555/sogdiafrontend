'use client';

import { useEffect } from 'react';
import { FeedSocket, type Level } from '@/lib/binance';
import { useTerminal } from './store';

/**
 * Reference market depth (top 20 levels per side) for the selected symbol, written to `store.book`.
 *
 * Kept as its own hook so the existing price / ticker feeds are untouched. The book is INDICATIVE market
 * depth from the public reference venue — SOGDIA orders are filled by the execution engine at the prices
 * shown in the "fill" row of the order book, not against this ladder.
 */
const toLevels = (rows: unknown): Level[] =>
  Array.isArray(rows)
    ? (rows as [string, string][]).map(([p, q]) => [+p, +q] as Level).filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q) && q > 0)
    : [];

export function useDepthFeed(symbol: string) {
  useEffect(() => {
    let alive = true;
    let pending: { bids: Level[]; asks: Level[] } | null = null;

    // ~4 repaints / second keeps the ladder readable and the main thread idle
    const flush = setInterval(() => {
      if (!alive || !pending) return;
      const { bids, asks } = pending;
      pending = null;
      useTerminal.setState({ book: { bids, asks, at: Date.now() } });
    }, 250);

    const sock = new FeedSocket(
      [`${symbol.toLowerCase()}@depth20@100ms`],
      (_stream, data) => {
        const bids = toLevels(data?.bids ?? data?.b);
        const asks = toLevels(data?.asks ?? data?.a);
        if (bids.length || asks.length) pending = { bids, asks };
      },
      undefined,
      10_000,
    );

    return () => { alive = false; clearInterval(flush); sock.close(); };
  }, [symbol]);
}
