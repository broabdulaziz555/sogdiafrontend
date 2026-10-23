import type { Account, AccountMetrics, Position } from '@/lib/types';
import { useTerminal } from './store';

/** The engine's house spread (5 bps against the trader, on entry and again on exit) — same figure the backend applies. */
export const SPREAD = 0.0005;

/**
 * Best live price the browser holds for a symbol: the websocket last trade for the chart symbol (updated several
 * times a second), otherwise the engine quote. Read at call time, so nothing re-renders on a tick.
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

/**
 * The database hands numeric columns back as strings in some setups ("81234.5"). Every numeric field of a position is
 * parsed with Number() here, once, before anything reads it. A position is NEVER dropped: a field that is not a number
 * is logged and kept at 0 so the row still renders.
 */
const NUM_FIELDS = ['leverage', 'margin', 'position_size', 'quantity', 'entry_price', 'liquidation_price', 'mark_price', 'unrealized_pnl', 'unrealized_pnl_pct'] as const;
export function normalizePosition(raw: Position): Position {
  const p = { ...raw } as Position & Record<string, unknown>;
  for (const k of NUM_FIELDS) {
    const n = Number(raw[k]);
    if (!Number.isFinite(n)) console.warn('[positions] field is not a number, showing 0', { id: raw.id, field: k, value: raw[k] });
    p[k] = Number.isFinite(n) ? n : 0;
  }
  for (const k of ['take_profit', 'stop_loss'] as const) {
    const v = raw[k];
    p[k] = v == null || v === (0 as unknown) ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  }
  return p;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A server position re-priced at the live market price, for display between two polls only. It never adds, removes
 * or hides a position: the list always comes from the server.
 */
export function markPosition(p: Position): Position {
  const mid = liveMid(p.symbol);
  if (mid == null) return p;
  const exit = p.side === 'long' ? mid * (1 - SPREAD) : mid * (1 + SPREAD);
  const pnl = r2((p.side === 'long' ? exit - p.entry_price : p.entry_price - exit) * p.quantity);
  return { ...p, mark_price: mid, unrealized_pnl: pnl, unrealized_pnl_pct: p.margin > 0 ? r2((pnl / p.margin) * 100) : 0 };
}

/** Account figures for the positions on screen, so the table and the account panel always agree. Limits come from the server. */
export function deriveMetrics(m: AccountMetrics, a: Account, positions: Position[]): AccountMetrics {
  const balance = Number(a.balance);
  let unreal = 0;
  let used = 0;
  for (const p of positions) { unreal += p.unrealized_pnl; used += p.margin; }
  unreal = r2(unreal);
  used = r2(used);
  const equity = r2(balance + unreal);
  const start = Number(a.daily_start_balance);
  const size = Number(a.size);
  return {
    ...m,
    equity,
    unrealized_pnl: unreal,
    used_margin: used,
    free_margin: r2(balance - used),
    open_positions: positions.length,
    daily_dd_remaining: r2(equity - m.daily_dd_limit),
    max_dd_remaining: r2(equity - m.max_dd_limit),
    daily_dd_used_pct: start > 0 ? r2(((start - equity) / start) * 100) : 0,
    max_dd_used_pct: size > 0 ? r2(((size - equity) / size) * 100) : 0,
    profit_pct: size > 0 ? r2(((equity - size) / size) * 100) : 0,
    target_reached: m.profit_target !== null && balance >= m.profit_target,
  };
}
