'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { ApiError, get, post } from '@/lib/api';
import { fmtSigned, fmtPrice } from '@/lib/format';
import type { Account, AccountMetrics, Position, PositionsResponse, RiskState, ServerPending, Side } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { beep } from './sound';
import { deriveMetrics, markPosition, normalizePosition, optimisticPosition } from './liveprice';
import { diag } from '@/lib/diag';
import { useTerminal, type PendingOrder } from './store';

/*
 * Terminal data layer: plain request / response.
 *
 *   • ONE SWR query, GET /trade/positions, is the only source of what is open. The table, the account panel and the
 *     chart all read it.
 *   • Open / close / place-order are ordinary awaited requests (30 s deadline, no retries). While one is running the
 *     button that started it shows a spinner.
 *   • Open is optimistic, with SWR's own mutation: the new row (flagged `pending`) is in the table at once. On 200 the
 *     positions query is re-read and the database's row replaces it; on an error the row is taken out again and the
 *     trader is told. SWR ignores poll results while a mutation runs, so a poll cannot remove or duplicate the row.
 *   • Close is not optimistic: the row stays (with a spinner) until the database no longer lists it.
 *   • After a timeout the positions are re-read, so the screen ends up showing whatever the database holds.
 */

/** Deadline for POST /trade/open, /trade/close and the order endpoints. Generous on purpose: a slow answer is not a failure. */
export const TRADE_TIMEOUT_MS = 30_000;
/** Mutable only so the tests can shorten the deadline. */
export const TUNING = { tradeMs: TRADE_TIMEOUT_MS };
/** How long a request waits for the table re-read that follows a 200 before it reports the result (the re-read carries on regardless). */
const REFRESH_WAIT_MS = 3_000;

export const TIMEOUT_TOAST = { title: 'Order execution is taking longer than expected', body: 'Check your positions.' };

export interface OpenInput {
  /** Reuse an id (a limit order that fills keeps its own id, which makes the fill idempotent). */
  id?: string;
  symbol: string;
  side: Side;
  leverage: number;
  margin: number;
  tp?: number | null;
  sl?: number | null;
}

export type OpenOutcome =
  | { ok: true; id: string; order: Position; replayed: boolean }
  /** `timedOut`: no answer in time. The order may or may not exist; the provider has already told the trader to check positions. */
  | { ok: false; id: string; error: unknown; timedOut: boolean };

export interface CloseResult { order: { pnl: number; close_price: number } }
/** `ok` without `res`: the position was already closed. */
export interface CloseOutcome { id: string; ok: boolean; res?: CloseResult; error?: unknown }

export interface PendingInput {
  symbol: string;
  side: Side;
  kind: 'limit' | 'stop';
  trigger: number;
  leverage: number;
  margin: number;
  tp: number | null;
  sl: number | null;
}

interface Ctx {
  accountId: string;
  account: Account | null;
  metrics: AccountMetrics | null;
  risk: RiskState | null;
  positions: Position[];
  loading: boolean;
  error: unknown;
  /** The last poll failed but older data is still shown. */
  stale: boolean;
  /** Trade requests currently waiting for the server (used to hold back an app update). */
  inFlight: number;
  /** True while a close request for this position is running (its Close button shows a spinner). */
  isClosing: (id: string) => boolean;
  refresh: () => Promise<unknown>;
  openPosition: (i: OpenInput) => Promise<OpenOutcome>;
  closePositions: (ids: string[]) => Promise<CloseOutcome[]>;
  placePending: (i: PendingInput) => Promise<{ ok: true; id: string } | { ok: false; error: unknown }>;
  cancelPending: (id: string) => Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);
export const useTerminalData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useTerminalData outside provider');
  return c;
};

const errCode = (e: unknown) => (e instanceof ApiError ? `${e.code}${e.status ? ` ${e.status}` : ''}` : e instanceof Error ? e.name : 'error');
/** No answer, or a server-side failure after which a write may or may not have landed (as opposed to an answer saying no). */
const isUnanswered = (e: unknown) => e instanceof ApiError && (e.code === 'TIMEOUT' || e.code === 'NETWORK_ERROR' || e.status >= 500);

/** Run one request and leave a line in the Diagnostics trail (what, how long, how it ended). */
async function traced<T>(what: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    diag(`${what} ok ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    diag(`${what} FAILED ${errCode(e)} after ${Date.now() - t0}ms`);
    throw e;
  }
}

/** Closed trades changed: reload every History list now and once more shortly after (the server write can lag the reply). */
function refreshHistory() {
  const match = (k: unknown) => Array.isArray(k) && k[0] === 'terminal-history';
  void globalMutate(match);
  setTimeout(() => { void globalMutate(match); }, 3000);
}

const REASON: Record<string, string> = { liquidation: 'Liquidated', stop_loss: 'Stop-loss hit', take_profit: 'Take-profit hit' };
const label = (symbol: string) => symbol.replace('USDT', '/USDT');

const fromServer = (s: ServerPending): PendingOrder => ({
  id: s.id, accountId: s.account_id, symbol: s.symbol, side: s.side, kind: s.kind, trigger: s.trigger_price,
  leverage: s.leverage, margin: s.margin, tp: s.take_profit, sl: s.stop_loss, createdAt: Date.parse(s.created_at) || Date.now(),
  status: s.status === 'failed' ? 'failed' : 'working', error: s.error ?? undefined, server: true,
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Single shared poll of /trade/positions (2.5 s with open trades or working orders, 10 s when flat). */
export function TerminalDataProvider({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const toast = useToast();
  const seen = useRef(new Set<string>());
  const soundOn = useTerminal((s) => s.soundOn);

  // ── the one query ───────────────────────────────────────────────────────────────────────────────────────────
  const lastCount = useRef(-1);
  const swr = useSWR<PositionsResponse>(
    ['terminal-positions', accountId],
    async () => {
      const t0 = Date.now();
      const raw = await get<PositionsResponse>('/trade/positions', { account_id: accountId }, { timeoutMs: 20_000 });
      const ms = Date.now() - t0;
      const count = Array.isArray(raw.positions) ? raw.positions.length : -1;
      // the raw JSON, on the first poll and whenever the number of positions changes (every 2.5 s would drown the console)
      if (count !== lastCount.current) console.log('[positions] raw response', raw);
      if (!Array.isArray(raw.positions)) throw new ApiError('INTERNAL_ERROR', 'Unexpected positions response (no positions array).', 0, raw);
      if (ms > 1500 || count !== lastCount.current) {
        const d = raw.debug;
        diag(`poll ok ${ms}ms · ${count} position(s), ${raw.pending?.length ?? 0} working order(s)${d ? ` · server read ${d.db_open_orders} from the database, returned ${d.returned}${d.closed_by_cycle ? `, closed ${d.closed_by_cycle}` : ''}${d.risk_engine ? ` · risk engine ${d.risk_engine}` : ''}` : ''}`);
      }
      lastCount.current = count;
      return { ...raw, positions: raw.positions.map(normalizePosition) };
    },
    // the server runs its engine cycle on every call, so poll fast only while something is open or waiting
    { refreshInterval: (d) => (d?.positions?.length || d?.pending?.length ? 2500 : 10_000), dedupingInterval: 1000, revalidateOnFocus: true, keepPreviousData: true, errorRetryInterval: 3000, shouldRetryOnError: true, onError: (e) => diag(`poll FAILED ${errCode(e)}`) },
  );
  const data = swr.data;
  const { mutate } = swr; // stable across renders, unlike the `swr` object
  const refresh = useCallback(() => mutate(), [mutate]);

  /** Invalidate the positions query and wait (briefly) for the table to be re-read from the database. */
  const invalidate = useCallback(async () => {
    await Promise.race([mutate().catch(() => undefined), sleep(REFRESH_WAIT_MS)]);
  }, [mutate]);

  // liquidations / SL / TP hits and account breaches reported by the server
  useEffect(() => {
    if (!data) return;
    for (const ev of data.liquidated ?? []) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      const title = `${label(ev.symbol)} · ${REASON[ev.reason ?? 'liquidation'] ?? 'Closed'}`;
      const body = `Closed at ${fmtPrice(ev.close_price)} · PnL ${fmtSigned(ev.pnl)} USDT`;
      (ev.reason === 'take_profit' ? toast.success : ev.reason === 'stop_loss' ? toast.warn : toast.error)(title, body);
      if (soundOn) beep(ev.reason === 'take_profit' ? 'up' : 'down');
    }
    if (data.risk?.breached) {
      const key = `breach-${accountId}-${data.risk.reason}`;
      if (!seen.current.has(key)) {
        seen.current.add(key);
        toast.error('Account breached', data.risk.reason === 'DAILY_DRAWDOWN' ? 'Daily drawdown limit reached. All positions were closed.' : 'Maximum drawdown limit reached. All positions were closed.');
      }
    }
  }, [data, toast, accountId, soundOn]);

  // server-side limit / stop orders: the server's list is the truth, the store just mirrors it
  useEffect(() => {
    if (!data?.pending) return; // older backend: browser-side orders only
    const st = useTerminal.getState();
    const srv = new Map(data.pending.map((s) => [s.id, s]));
    const open = new Set(data.positions.map((p) => p.id));

    let changed = false;
    const out: PendingOrder[] = [];
    for (const o of st.pending) {
      if (o.accountId !== accountId || !o.server) { out.push(o); continue; }
      const s = srv.get(o.id);
      if (s) {
        const upd = fromServer(s);
        if (o.status !== upd.status || o.error !== upd.error) { changed = true; out.push({ ...o, status: upd.status, error: upd.error }); } else out.push(o);
        continue;
      }
      changed = true; // filled, cancelled elsewhere, or dismissed
      if (open.has(o.id)) {
        const p = data.positions.find((x) => x.id === o.id);
        toast.success(`${o.kind === 'limit' ? 'Limit' : 'Stop'} filled · ${label(o.symbol)}`, `${o.side} ${o.leverage}×${p ? ` at ${fmtPrice(p.entry_price)}` : ''}`);
        if (useTerminal.getState().soundOn) beep(o.side === 'long' ? 'up' : 'down');
      }
    }
    for (const s of data.pending) {
      if (out.some((o) => o.id === s.id)) continue;
      changed = true;
      out.push(fromServer(s));
    }
    if (changed) useTerminal.setState({ pending: out });
  }, [data, accountId, toast]);

  // ── live price layer ─────────────────────────────────────────────────────────────────────────────────────
  // Between polls the numbers follow the browser's live price (same spread and maths as the server). Display only.
  const [tick, setTick] = useState(0);
  const hasOpen = (data?.positions.length ?? 0) > 0;
  useEffect(() => {
    if (!hasOpen) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [hasOpen]);

  const view = useMemo(() => {
    if (!data) return null;
    const positions = data.positions.map(markPosition);
    return { positions, metrics: deriveMetrics(data.metrics, data.account, positions) };
    // `tick` re-prices the live layer without a new snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick]);

  // ── requests in flight ───────────────────────────────────────────────────────────────────────────────────
  const [inFlight, setInFlight] = useState(0);
  const track = useCallback(async <T,>(run: () => Promise<T>): Promise<T> => {
    setInFlight((n) => n + 1);
    try { return await run(); } finally { setInFlight((n) => n - 1); }
  }, []);

  // ── open ─────────────────────────────────────────────────────────────────────────────────────────────────
  // SWR's optimistic mutation: the row is shown at once, the POST runs, then the positions are re-read and the real row
  // replaces it. While a mutation runs SWR ignores the results of polls, so a poll can neither remove nor duplicate the
  // row; on an error SWR puts the previous data back.
  const dataRef = useRef(data);
  dataRef.current = data;
  const opening = useRef(new Map<string, Promise<OpenOutcome>>());

  const openPosition = useCallback((i: OpenInput): Promise<OpenOutcome> => {
    const id = i.id ?? crypto.randomUUID();
    const running = opening.current.get(id);
    if (running) return running; // the same order sent twice (double tap, replayed fill) is one request

    const body: Record<string, unknown> = { account_id: accountId, order_id: id, symbol: i.symbol, side: i.side, leverage: i.leverage, margin: i.margin };
    if (i.tp != null) body.take_profit = i.tp;
    if (i.sl != null) body.stop_loss = i.sl;

    const row = dataRef.current ? optimisticPosition({ id, accountId, symbol: i.symbol, side: i.side, leverage: i.leverage, margin: i.margin, tp: i.tp, sl: i.sl }) : null;

    const run = track(async (): Promise<OpenOutcome> => {
      let reply: { order: Position; replayed?: boolean } | undefined;
      try {
        await mutate(
          async () => {
            reply = await traced(`open ${id.slice(0, 8)} ${i.side} ${i.symbol}`, () => post<{ order: Position; replayed?: boolean }>('/trade/open', body, { timeoutMs: TUNING.tradeMs }));
            return undefined;
          },
          {
            ...(row && { optimisticData: (cur?: PositionsResponse) => (cur ? { ...cur, positions: [row, ...cur.positions.filter((x) => x.id !== id)] } : cur) as PositionsResponse }),
            rollbackOnError: true, // the optimistic row goes away if the request fails
            populateCache: false, // the reply is not written to the cache: the refetch below is
            revalidate: true, // 200 -> GET /trade/positions at once; its rows replace the optimistic one
          },
        );
        return { ok: true, id, order: reply!.order, replayed: !!reply!.replayed };
      } catch (error) {
        const timedOut = isUnanswered(error);
        if (timedOut) {
          toast.warn(TIMEOUT_TOAST.title, TIMEOUT_TOAST.body);
          void mutate(); // the order may well exist: show whatever the database holds
        }
        return { ok: false, id, error, timedOut };
      }
    }).finally(() => { opening.current.delete(id); });
    opening.current.set(id, run);
    return run;
  }, [accountId, track, mutate, toast]);

  // ── close ────────────────────────────────────────────────────────────────────────────────────────────────
  const closingRuns = useRef(new Map<string, Promise<CloseOutcome>>());
  const [closingIds, setClosingIds] = useState<ReadonlySet<string>>(new Set());
  const isClosing = useCallback((id: string) => closingIds.has(id), [closingIds]);
  const setClosing = useCallback((id: string, on: boolean) => setClosingIds((cur) => {
    if (cur.has(id) === on) return cur;
    const next = new Set(cur);
    if (on) next.add(id); else next.delete(id);
    return next;
  }), []);

  const closeOne = useCallback((id: string): Promise<CloseOutcome> => {
    const running = closingRuns.current.get(id);
    if (running) return running; // double tap, hotkey + button, close-all + single close: one request
    setClosing(id, true);
    const run = track(async (): Promise<CloseOutcome> => {
      try {
        const stillOpening = opening.current.get(id);
        if (stillOpening && !(await stillOpening).ok) return { id, ok: true }; // never opened: nothing to close
        const res = await traced(`close ${id.slice(0, 8)}`, async () => {
          try { return await post<CloseResult>('/trade/close', { order_id: id }, { timeoutMs: TUNING.tradeMs }); }
          catch (e) { if (e instanceof ApiError && e.code === 'ORDER_NOT_OPEN') return null; throw e; } // already closed = done
        });
        refreshHistory();
        await invalidate(); // the row leaves the table when the database no longer lists it
        return { id, ok: true, res: res ?? undefined };
      } catch (error) {
        void mutate(); // whatever happened, show what the database holds (the position stays visible)
        return { id, ok: false, error };
      }
    }).finally(() => { closingRuns.current.delete(id); setClosing(id, false); });
    closingRuns.current.set(id, run);
    return run;
  }, [track, invalidate, mutate, setClosing]);

  const closePositions = useCallback((ids: string[]) => Promise.all(ids.map(closeOne)), [closeOne]);

  // ── limit / stop orders ─────────────────────────────────────────────────────────────────────────────────
  const placePending = useCallback(async (i: PendingInput) => {
    const id = crypto.randomUUID();
    try {
      await track(() => traced(`order ${id.slice(0, 8)} ${i.kind} ${i.symbol}`, () => post('/trade/pending', { id, account_id: accountId, symbol: i.symbol, side: i.side, kind: i.kind, trigger_price: i.trigger, leverage: i.leverage, margin: i.margin, take_profit: i.tp, stop_loss: i.sl }, { timeoutMs: TUNING.tradeMs })));
      await invalidate(); // the working order shows up from the server's list
      return { ok: true as const, id };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'FEATURE_UNAVAILABLE') {
        // not enabled on the server yet: the browser watches it, as before
        useTerminal.getState().addPending({ id, accountId, symbol: i.symbol, side: i.side, kind: i.kind, trigger: i.trigger, leverage: i.leverage, margin: i.margin, tp: i.tp, sl: i.sl, createdAt: Date.now(), status: 'working', server: false });
        return { ok: true as const, id };
      }
      if (isUnanswered(error)) { toast.warn(TIMEOUT_TOAST.title, TIMEOUT_TOAST.body); void mutate(); }
      return { ok: false as const, error };
    }
  }, [accountId, track, invalidate, mutate, toast]);

  const cancelPending = useCallback(async (id: string) => {
    const st = useTerminal.getState();
    const o = st.pending.find((x) => x.id === id);
    if (!o) return;
    if (!o.server) { st.removePending(id); return; } // browser-side order
    try {
      await track(() => traced(`cancel ${id.slice(0, 8)}`, () => post('/trade/pending/cancel', { id, account_id: o.accountId }, { timeoutMs: TUNING.tradeMs })));
      await invalidate();
    } catch (e) {
      toast.error('Could not cancel the order', e instanceof Error ? e.message : 'Try again.');
      void mutate();
    }
  }, [track, invalidate, mutate, toast]);

  // ── context ──────────────────────────────────────────────────────────────────────────────────────────────
  const value = useMemo<Ctx>(
    () => ({
      accountId,
      account: data?.account ?? null,
      metrics: view?.metrics ?? null,
      risk: data?.risk ?? null,
      positions: view?.positions ?? [],
      loading: swr.isLoading && !data,
      error: swr.error,
      stale: !!swr.error && !!data,
      inFlight,
      isClosing,
      refresh,
      openPosition,
      closePositions,
      placePending,
      cancelPending,
    }),
    [accountId, view, data, swr.isLoading, swr.error, inFlight, isClosing, refresh, openPosition, closePositions, placePending, cancelPending],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
