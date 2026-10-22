import type { Position, Side } from '@/lib/types';
import { useTerminal } from './store';

/** The engine's house spread (5 bps against the trader, on entry and again on exit) — same figure the backend applies. */
export const SPREAD = 0.0005;

/** Prefix of provisional position ids. They are never sent to the API. */
export const TMP_PREFIX = 'tmp-';

/**
 * Best live price the browser holds for a symbol: the websocket last trade for the chart symbol (updated several
 * times a second), otherwise the engine quote. Read at click time, so nothing re-renders on a tick.
 */
export function liveMid(symbol: string): number | null {
  const st = useTerminal.getState();
  if (st.symbol === symbol && st.last != null && st.last > 0) return st.last;
  const px = st.prices[symbol];
  return px && px.price > 0 ? px.price : null;
}

/** Live bid/ask for a symbol, derived the way the engine derives them from the mid price. */
export function liveQuote(symbol: string): { bid: number; ask: number } | null {
  const mid = liveMid(symbol);
  return mid == null ? null : { bid: mid * (1 - SPREAD), ask: mid * (1 + SPREAD) };
}

export interface OptimisticInput {
  accountId: string;
  symbol: string;
  side: Side;
  leverage: number;
  margin: number;
  tp?: number | null;
  sl?: number | null;
  /** Limit orders open at their own price; market orders (null) open at the live market price. */
  limitPrice?: number | null;
}

/**
 * The position the trader should see the instant they press Long / Short, built from the live price in the browser.
 * The server's confirmed row (authoritative fill price) replaces it when the reply arrives.
 */
export function buildOptimistic(i: OptimisticInput): Position | null {
  const long = i.side === 'long';
  let mid: number;
  let entry: number;
  if (i.limitPrice != null && Number.isFinite(i.limitPrice) && i.limitPrice > 0) {
    entry = i.limitPrice;
    mid = long ? entry / (1 + SPREAD) : entry / (1 - SPREAD);
  } else {
    const live = liveMid(i.symbol);
    if (live == null) return null; // no price in the browser yet: fall back to waiting for the server
    mid = live;
    entry = long ? mid * (1 + SPREAD) : mid * (1 - SPREAD);
  }

  const size = i.margin * i.leverage;
  const qty = size / entry;
  const exit = long ? mid * (1 - SPREAD) : mid * (1 + SPREAD);
  const pnl = (long ? exit - entry : entry - exit) * qty;

  return {
    id: `${TMP_PREFIX}${crypto.randomUUID()}`,
    account_id: i.accountId,
    symbol: i.symbol,
    side: i.side,
    leverage: i.leverage,
    margin: i.margin,
    position_size: size,
    quantity: qty,
    entry_price: entry,
    liquidation_price: long ? entry * (1 - 1 / i.leverage) : entry * (1 + 1 / i.leverage),
    mark_price: mid,
    unrealized_pnl: pnl,
    unrealized_pnl_pct: i.margin > 0 ? (pnl / i.margin) * 100 : 0,
    status: 'open',
    created_at: new Date().toISOString(),
    take_profit: i.tp ?? null,
    stop_loss: i.sl ?? null,
  };
}
