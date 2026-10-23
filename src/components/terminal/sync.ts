/**
 * Terminal sync model — pure functions, no React, no network.
 *
 *   screen  =  last server snapshot  +  ledger of what the trader asked for and the server has not caught up with yet
 *
 * The server is the source of truth, but a request can be slow, lost or answered after the next poll. Instead of
 * guessing from timing, every action is an INTENT in a ledger with a client-generated id (the same id the server stores
 * the order under, so retrying is always safe). An intent leaves the ledger only when the server's own data settles it:
 *   open  — the position is listed by the server (or a snapshot taken after the server confirmed it no longer has it)
 *   close — a snapshot no longer lists the position
 * Everything the trader sees (positions, margin, profit, balance) is derived from the same list, so the panel and the
 * table cannot disagree.
 */
import type { Account, AccountMetrics, Position } from '@/lib/types';

export interface OpenBody {
  account_id: string;
  order_id: string;
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  margin: number;
  take_profit?: number | null;
  stop_loss?: number | null;
}

export interface OpenIntent {
  id: string;
  /** What the trader sees until the server's row arrives. Null when the browser had no price yet. */
  pos: Position | null;
  body: OpenBody;
  createdAt: number;
  phase: 'sending' | 'acked' | 'lost';
  ackedAt?: number;
  lostAt?: number;
  /** The server's row, once it confirmed. */
  confirmed?: Position;
}

export interface CloseIntent {
  id: string;
  createdAt: number;
  phase: 'sending' | 'acked' | 'lost';
  ackedAt?: number;
  lostAt?: number;
  /** Realised PnL from the server's reply. */
  pnl?: number;
}

export interface Ledger {
  opens: Record<string, OpenIntent>;
  closes: Record<string, CloseIntent>;
}

export const EMPTY_LEDGER: Ledger = { opens: {}, closes: {} };

export interface Snapshot {
  positions: Position[];
  account: Account;
  metrics: AccountMetrics;
  /** When the request that produced this snapshot was SENT: the data reflects the database at or after this instant. */
  startedAt: number;
}

/** A request that never got an answer may still be running on the server for about this long (database deadline + margin). */
export const SETTLE_MS = 25_000;

export interface Dropped {
  /** Orders that were never stored (every attempt failed and the server does not have them). */
  notPlaced: OpenIntent[];
  /** Closes that were never applied (the server still lists the position). */
  notClosed: CloseIntent[];
}

/** Settle intents against a snapshot. Returns the same ledger object when nothing changed. */
export function reconcile(ledger: Ledger, snap: Snapshot): { ledger: Ledger; dropped: Dropped } {
  const listed = new Set(snap.positions.map((p) => p.id));
  const dropped: Dropped = { notPlaced: [], notClosed: [] };
  const opens: Record<string, OpenIntent> = {};
  const closes: Record<string, CloseIntent> = {};
  let changed = false;

  for (const o of Object.values(ledger.opens)) {
    if (listed.has(o.id)) { changed = true; continue; } // the server has it: its row takes over
    if (o.phase === 'acked' && o.ackedAt != null && snap.startedAt > o.ackedAt) { changed = true; continue; } // confirmed, then gone (SL/TP/liquidation)
    if (o.phase === 'lost' && o.lostAt != null && snap.startedAt > o.lostAt + SETTLE_MS) { changed = true; dropped.notPlaced.push(o); continue; }
    opens[o.id] = o;
  }

  for (const c of Object.values(ledger.closes)) {
    if (opens[c.id]) { closes[c.id] = c; continue; } // the position itself is still being confirmed: wait
    if (!listed.has(c.id)) { changed = true; continue; } // gone from the server: settled
    if (c.phase === 'acked' && c.ackedAt != null && snap.startedAt > c.ackedAt) { changed = true; dropped.notClosed.push(c); continue; }
    if (c.phase === 'lost' && c.lostAt != null && snap.startedAt > c.lostAt + SETTLE_MS) { changed = true; dropped.notClosed.push(c); continue; }
    closes[c.id] = c;
  }

  return { ledger: changed ? { opens, closes } : ledger, dropped };
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface View {
  positions: Position[];
  account: Account;
  metrics: AccountMetrics;
  /** Ids shown but not yet stored/confirmed by the server (cannot be closed or edited yet). */
  unconfirmed: Set<string>;
}

/**
 * What the screen shows. `mark` applies the live price to a position (identity when there is none).
 * Account figures are recomputed from the visible positions and the balance, never patched piecemeal.
 */
export function deriveView(snap: Snapshot, ledger: Ledger, mark: (p: Position) => Position = (p) => p): View {
  const unconfirmed = new Set<string>();
  const shown: Position[] = [];
  const have = new Set<string>();

  // positions the trader opened that the server list does not have yet (newest first, like the server's order)
  const fresh = Object.values(ledger.opens)
    .filter((o) => !ledger.closes[o.id])
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const o of fresh) {
    const p = o.confirmed ?? o.pos;
    if (!p) continue;
    if (o.phase === 'sending') unconfirmed.add(o.id);
    shown.push(mark(p));
    have.add(o.id);
  }

  // positions being closed leave the table at once; their realised result moves into the balance
  let realised = 0;
  for (const sp of snap.positions) {
    const closing = ledger.closes[sp.id];
    if (closing) {
      realised += closing.pnl ?? mark(sp).unrealized_pnl;
      continue;
    }
    if (have.has(sp.id)) continue;
    shown.push(mark(sp));
  }

  const balance = r2(Number(snap.account.balance) + realised);
  return { positions: shown, account: { ...snap.account, balance }, metrics: deriveMetrics(snap.metrics, snap.account, balance, shown), unconfirmed };
}

/** Account figures from a balance and the positions on screen. Limits (drawdown floors, target) come from the server. */
export function deriveMetrics(m: AccountMetrics, a: Account, balance: number, positions: Position[]): AccountMetrics {
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

/** Errors that mean the server understood and refused: retrying cannot help. Anything else (timeout, network, 5xx) is retried. */
export const DEFINITIVE_CODES = new Set([
  'VALIDATION_ERROR', 'INSUFFICIENT_MARGIN', 'ACCOUNT_NOT_TRADABLE', 'SYMBOL_NOT_ALLOWED',
  'FORBIDDEN', 'NOT_FOUND', 'DUPLICATE', 'UNAUTHORIZED', 'KYC_REQUIRED', 'FEATURE_UNAVAILABLE',
]);

export const RETRY_DELAYS_MS = [0, 800, 1600, 3200, 6000, 8000];

/**
 * Run `call` until it succeeds, the server definitively refuses, or `budgetMs` is spent. Every attempt reuses the same
 * request (same order id), so a retry after a lost answer returns the stored result instead of repeating the action.
 */
export async function withRetry<T>(
  call: () => Promise<T>,
  opts: { budgetMs: number; isDefinitive: (e: unknown) => boolean; sleep?: (ms: number) => Promise<void>; now?: () => number },
): Promise<{ ok: true; value: T } | { ok: false; error: unknown; definitive: boolean }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const t0 = now();
  let last: unknown;
  for (let i = 0; ; i += 1) {
    const wait = RETRY_DELAYS_MS[Math.min(i, RETRY_DELAYS_MS.length - 1)];
    if (wait) await sleep(wait);
    try {
      return { ok: true, value: await call() };
    } catch (error) {
      last = error;
      if (opts.isDefinitive(error)) return { ok: false, error, definitive: true };
    }
    if (now() - t0 + (RETRY_DELAYS_MS[Math.min(i + 1, RETRY_DELAYS_MS.length - 1)] || 0) > opts.budgetMs) break;
  }
  return { ok: false, error: last, definitive: false };
}
