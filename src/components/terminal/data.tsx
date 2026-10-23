'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { ApiError, get, post } from '@/lib/api';
import { fmtSigned, fmtPrice } from '@/lib/format';
import type { Account, AccountMetrics, HistoryOrder, HistoryResponse, Position, PositionsResponse, RiskState, ServerPending, Side } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { beep } from './sound';
import { SPREAD, buildOptimistic, liveMid } from './optimistic';
import { diag } from '@/lib/diag';
import { useTerminal, type PendingOrder } from './store';
import {
  DEFINITIVE_CODES, EMPTY_LEDGER, deriveView, reconcile, withRetry,
  type CloseIntent, type Ledger, type OpenBody, type OpenIntent, type Snapshot,
} from './sync';

/*
 * Terminal data layer. How it works (details in ./sync.ts):
 *
 *   • A poll of /trade/positions gives the authoritative snapshot (positions, limit/stop orders, account).
 *   • Everything the trader does (open, close, place an order) is written to a LEDGER first, so the screen reacts at
 *     once, then sent with a client-generated id and retried until the server answers. Retrying is safe because the
 *     server stores an order under the id it is given.
 *   • The screen is snapshot + ledger. An intent leaves the ledger only when server data settles it, so a slow, failed
 *     or out-of-order poll can never make a position vanish, reappear or double.
 *   • Account figures are computed from the positions on screen, so the table and the panel always agree.
 */

export interface OpenInput {
  /** Reuse an id (a limit order that fills keeps its own id, which makes the fill idempotent). */
  id?: string;
  symbol: string;
  side: Side;
  leverage: number;
  margin: number;
  tp?: number | null;
  sl?: number | null;
  /** A limit order opens at its own price, a market order at the live price. */
  limitPrice?: number | null;
}

export type OpenOutcome =
  | { ok: true; id: string; order: Position; replayed: boolean }
  | { ok: false; id: string; error: unknown; /** The server may or may not have it; it is shown as syncing until it is known. */ unconfirmed?: boolean };

export interface CloseResult { order: { pnl: number; close_price: number } }
export interface CloseOutcome { id: string; ok: boolean; res?: CloseResult; error?: unknown; unconfirmed?: boolean }

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
  stale: boolean;
  /** Intents the server has not confirmed yet (shown on screen, still being sent). */
  syncing: number;
  /** True for a position that is on screen but not yet stored by the server (cannot be closed or edited yet). */
  isUnconfirmed: (id: string) => boolean;
  refresh: () => Promise<unknown>;
  openPosition: (i: OpenInput) => Promise<OpenOutcome>;
  closePositions: (ids: string[]) => Promise<CloseOutcome[]>;
  placePending: (i: PendingInput) => Promise<{ ok: true; id: string } | { ok: false; error: unknown }>;
  cancelPending: (id: string) => void;
}

const DataCtx = createContext<Ctx | null>(null);
export const useTerminalData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useTerminalData outside provider');
  return c;
};

type Snap = PositionsResponse & { startedAt: number };

/** Per-attempt deadline and total budget for sending an intent. After the budget the intent waits for the server's data to decide. */
export const TUNING = { attemptMs: 15_000, budgetMs: 90_000 };
const isDefinitive = (e: unknown) => e instanceof ApiError && DEFINITIVE_CODES.has(e.code);
const errCode = (e: unknown) => (e instanceof ApiError ? `${e.code}${e.status ? ` ${e.status}` : ''}` : e instanceof Error ? e.name : 'error');

/** Run one request attempt and leave a line in the Diagnostics trail (what, how long, how it ended). */
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

/** Show a trade in History the moment it is closed, built from what the screen already knows; the reload that follows swaps in the server's row. */
function addToHistory(accountId: string, p: Position) {
  const exit = p.side === 'long' ? p.mark_price * (1 - SPREAD) : p.mark_price * (1 + SPREAD);
  const row: HistoryOrder = {
    id: p.id, symbol: p.symbol, side: p.side, leverage: p.leverage, margin: p.margin, position_size: p.position_size,
    entry_price: p.entry_price, close_price: exit, pnl: p.unrealized_pnl, status: 'closed', close_reason: 'manual',
    created_at: p.created_at, closed_at: new Date().toISOString(),
  };
  void globalMutate(
    (k: unknown) => Array.isArray(k) && k[0] === 'terminal-history' && k[1] === accountId && k[2] === 0,
    (cur?: HistoryResponse) => {
      if (!cur || cur.orders.some((o) => o.id === row.id)) return cur;
      const st = cur.stats;
      const wins = st.wins + (row.pnl > 0 ? 1 : 0), losses = st.losses + (row.pnl > 0 ? 0 : 1), trades = st.trades + 1;
      return {
        ...cur,
        orders: [row, ...cur.orders].slice(0, Math.max(cur.limit || 0, 1)),
        total: cur.total + 1,
        stats: { trades, wins, losses, win_rate: Math.round((wins / trades) * 10000) / 100, net_pnl: Math.round((st.net_pnl + row.pnl) * 100) / 100 },
      };
    },
    { revalidate: false },
  );
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
  status: s.status === 'failed' ? 'failed' : 'working', error: s.error ?? undefined, server: true, sync: 'synced', syncedAt: 0,
});

/** Single shared poll of /trade/positions (2.5 s with open trades or working orders, 10 s when flat). */
export function TerminalDataProvider({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const toast = useToast();
  const seen = useRef(new Set<string>());
  const soundOn = useTerminal((s) => s.soundOn);

  // ── snapshot ────────────────────────────────────────────────────────────────────────────────────────────────
  const lastCount = useRef(-1);
  const swr = useSWR<Snap>(
    ['terminal-positions', accountId],
    async () => {
      const startedAt = Date.now();
      const res = await get<PositionsResponse>('/trade/positions', { account_id: accountId }, { timeoutMs: 20_000 });
      const ms = Date.now() - startedAt;
      if (ms > 1500 || res.positions.length !== lastCount.current) diag(`poll ok ${ms}ms · ${res.positions.length} position(s), ${res.pending?.length ?? 0} working order(s)`);
      lastCount.current = res.positions.length;
      return { ...res, startedAt };
    },
    // the server runs its engine cycle on every call, so poll fast only while something is open or waiting
    { refreshInterval: (d) => (d?.positions?.length || d?.pending?.length ? 2500 : 10_000), dedupingInterval: 1000, revalidateOnFocus: true, keepPreviousData: true, errorRetryInterval: 3000, shouldRetryOnError: true, onError: (e) => diag(`poll FAILED ${errCode(e)}`) },
  );
  const data = swr.data;
  const { mutate } = swr; // stable across renders, unlike the `swr` object
  const refresh = useCallback(() => mutate(), [mutate]);

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

  // ── ledger (what the trader asked for and the server has not caught up with) ───────────────────────────────
  const [ledger, setLedgerState] = useState<Ledger>(EMPTY_LEDGER);
  const ledgerRef = useRef<Ledger>(EMPTY_LEDGER);
  const setLedger = useCallback((fn: (l: Ledger) => Ledger) => {
    const next = fn(ledgerRef.current);
    if (next === ledgerRef.current) return;
    ledgerRef.current = next;
    setLedgerState(next);
  }, []);
  const patchOpen = useCallback((id: string, p: Partial<OpenIntent>) => setLedger((l) => (l.opens[id] ? { ...l, opens: { ...l.opens, [id]: { ...l.opens[id], ...p } } } : l)), [setLedger]);
  const patchClose = useCallback((id: string, p: Partial<CloseIntent>) => setLedger((l) => (l.closes[id] ? { ...l, closes: { ...l.closes, [id]: { ...l.closes[id], ...p } } } : l)), [setLedger]);
  const dropOpen = useCallback((id: string) => setLedger((l) => { if (!l.opens[id]) return l; const { [id]: _x, ...opens } = l.opens; void _x; return { ...l, opens }; }), [setLedger]);
  const dropClose = useCallback((id: string) => setLedger((l) => { if (!l.closes[id]) return l; const { [id]: _x, ...closes } = l.closes; void _x; return { ...l, closes }; }), [setLedger]);

  useEffect(() => { setLedger(() => EMPTY_LEDGER); }, [accountId, setLedger]);

  // Settle the ledger (and mirror server-side limit/stop orders into the store) every time a new snapshot arrives.
  const cancelled = useRef(new Map<string, number>());
  useEffect(() => {
    if (!data) return;
    const { ledger: next, dropped } = reconcile(ledgerRef.current, data);
    if (next !== ledgerRef.current) {
      diag(`ledger settled by poll: opens ${Object.keys(ledgerRef.current.opens).length}→${Object.keys(next.opens).length}, closes ${Object.keys(ledgerRef.current.closes).length}→${Object.keys(next.closes).length}${dropped.notPlaced.length ? ` · NOT PLACED ${dropped.notPlaced.map((o) => o.id.slice(0, 8)).join(',')}` : ''}${dropped.notClosed.length ? ` · NOT CLOSED ${dropped.notClosed.map((c) => c.id.slice(0, 8)).join(',')}` : ''}`);
      setLedger(() => next);
    }
    for (const o of dropped.notPlaced) toast.error(`Order not placed · ${label(o.body.symbol)}`, 'The server never received it, so nothing was opened. You can place it again.');
    for (const c of dropped.notClosed) toast.warn('Close not confirmed', `The position ${c.id.slice(0, 8)} is still open on the server, so it is shown again.`);
    if (dropped.notClosed.length) refreshHistory();

    // server-side limit / stop orders
    if (!data.pending) return; // older backend: browser-side orders only
    const st = useTerminal.getState();
    const srv = new Map(data.pending.map((s) => [s.id, s]));
    const open = new Set(data.positions.map((p) => p.id));
    const now = Date.now();
    for (const [id, at] of cancelled.current) if (now - at > 120_000) cancelled.current.delete(id);

    let changed = false;
    const out: PendingOrder[] = [];
    for (const o of st.pending) {
      if (o.accountId !== accountId || !o.server || o.sync === 'sending') { out.push(o); continue; }
      const s = srv.get(o.id);
      if (s) {
        const upd = fromServer(s);
        if (o.status !== upd.status || o.error !== upd.error) { changed = true; out.push({ ...o, status: upd.status, error: upd.error }); } else out.push(o);
        continue;
      }
      if (data.startedAt > (o.syncedAt ?? 0)) {
        changed = true; // filled, cancelled elsewhere, or dismissed
        if (open.has(o.id)) {
          const p = data.positions.find((x) => x.id === o.id);
          toast.success(`${o.kind === 'limit' ? 'Limit' : 'Stop'} filled · ${label(o.symbol)}`, `${o.side} ${o.leverage}×${p ? ` at ${fmtPrice(p.entry_price)}` : ''}`);
          if (useTerminal.getState().soundOn) beep(o.side === 'long' ? 'up' : 'down');
        }
        continue;
      }
      out.push(o);
    }
    for (const s of data.pending) {
      if (cancelled.current.has(s.id) || out.some((o) => o.id === s.id)) continue;
      changed = true;
      out.push(fromServer(s));
    }
    if (changed) useTerminal.setState({ pending: out });
  }, [data, accountId, toast, setLedger]);

  // ── live price layer ─────────────────────────────────────────────────────────────────────────────────────
  // Between polls the numbers follow the browser's live price (same spread and maths as the server).
  const [tick, setTick] = useState(0);
  const hasOpen = (data?.positions.length ?? 0) > 0 || Object.keys(ledger.opens).length > 0;
  useEffect(() => {
    if (!hasOpen) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [hasOpen]);

  const view = useMemo(() => {
    if (!data) return null;
    const mark = (p: Position): Position => {
      const mid = liveMid(p.symbol);
      if (mid == null) return p;
      const exit = p.side === 'long' ? mid * (1 - SPREAD) : mid * (1 + SPREAD);
      const pnl = Math.round(((p.side === 'long' ? exit - p.entry_price : p.entry_price - exit) * p.quantity) * 100) / 100;
      return { ...p, mark_price: mid, unrealized_pnl: pnl, unrealized_pnl_pct: p.margin > 0 ? Math.round((pnl / p.margin) * 10000) / 100 : 0 };
    };
    return deriveView(data, ledger, mark);
    // `tick` re-prices the live layer without a new snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ledger, tick]);

  // Latest things the click handlers need to read without waiting for a render.
  const livePositions = useRef<Position[]>([]);
  livePositions.current = view?.positions ?? [];
  const dataRef = useRef<Snap | undefined>(undefined);
  dataRef.current = data;
  /** A position the trader can act on: on screen, being opened, or in the latest server list. */
  const findPosition = useCallback((id: string): Position | null => {
    const o = ledgerRef.current.opens[id];
    return livePositions.current.find((p) => p.id === id) ?? (o ? o.confirmed ?? o.pos : null) ?? dataRef.current?.positions.find((p) => p.id === id) ?? null;
  }, []);

  // ── actions ──────────────────────────────────────────────────────────────────────────────────────────────
  const openDone = useRef(new Map<string, Promise<OpenOutcome>>());

  const openPosition = useCallback((i: OpenInput): Promise<OpenOutcome> => {
    const id = i.id ?? crypto.randomUUID();
    const existing = openDone.current.get(id);
    if (existing) return existing; // the same order sent twice (double tap, replayed fill) is one order

    const body: OpenBody = { account_id: accountId, order_id: id, symbol: i.symbol, side: i.side, leverage: i.leverage, margin: i.margin };
    if (i.tp != null) body.take_profit = i.tp;
    if (i.sl != null) body.stop_loss = i.sl;
    const pos = buildOptimistic({ id, accountId, symbol: i.symbol, side: i.side, leverage: i.leverage, margin: i.margin, tp: i.tp, sl: i.sl, limitPrice: i.limitPrice });
    const intent: OpenIntent = { id, pos, body, createdAt: Date.now(), phase: 'sending' };
    setLedger((l) => ({ ...l, opens: { ...l.opens, [id]: intent } }));

    diag(`open ${id.slice(0, 8)} ${i.side} ${i.symbol} sent${pos ? '' : ' (no live price: waiting for the server)'}`);
    const run = (async (): Promise<OpenOutcome> => {
      const r = await withRetry(() => traced(`open ${id.slice(0, 8)} attempt`, () => post<{ order: Position; replayed?: boolean }>('/trade/open', body, { timeoutMs: TUNING.attemptMs })), { budgetMs: TUNING.budgetMs, isDefinitive });
      if (r.ok) {
        diag(`open ${id.slice(0, 8)} confirmed by server${r.value.replayed ? ' (was already stored)' : ''}`);
        patchOpen(id, { phase: 'acked', ackedAt: Date.now(), confirmed: r.value.order });
        setTimeout(() => { void mutate(); }, 600);
        return { ok: true, id, order: r.value.order, replayed: !!r.value.replayed };
      }
      if (r.definitive) {
        diag(`open ${id.slice(0, 8)} REFUSED ${errCode(r.error)}`);
        dropOpen(id);
        return { ok: false, id, error: r.error };
      }
      // Every attempt went unanswered. The server may well have it; its next snapshot decides (see reconcile).
      diag(`open ${id.slice(0, 8)} UNCONFIRMED after retries — waiting for the server's list to decide`);
      patchOpen(id, { phase: 'lost', lostAt: Date.now() });
      toast.warn(`Still confirming · ${label(i.symbol)}`, 'The server has not answered yet. The order stays on screen and is resolved as soon as it does.');
      void mutate();
      return { ok: false, id, error: r.error, unconfirmed: true };
    })().finally(() => { setTimeout(() => openDone.current.delete(id), 5000); });
    openDone.current.set(id, run);
    return run;
  }, [accountId, setLedger, patchOpen, dropOpen, mutate, toast]);

  const closing = useRef(new Set<string>());

  const closePositions = useCallback(async (ids: string[]): Promise<CloseOutcome[]> => {
    // a close already running for an id is not sent again (double tap, hotkey + button, close-all + single close)
    const skipped = ids.filter((id) => closing.current.has(id) || ledgerRef.current.closes[id]).map((id): CloseOutcome => ({ id, ok: true }));
    const todo = ids.filter((id) => !closing.current.has(id) && !ledgerRef.current.closes[id]);
    todo.forEach((id) => closing.current.add(id));
    const now = Date.now();
    const mine = todo.filter((id) => findPosition(id));
    setLedger((l) => {
      const closes = { ...l.closes };
      for (const id of mine) closes[id] = { id, createdAt: now, phase: 'sending' };
      return { ...l, closes };
    });
    for (const id of mine) { const p = findPosition(id); if (p) addToHistory(accountId, p); }
    for (const id of todo) if (!mine.includes(id)) { closing.current.delete(id); skipped.push({ id, ok: true }); } // not on screen: nothing to close

    const sent = await Promise.all(mine.map(async (id): Promise<CloseOutcome> => {
      try {
        // a position still being stored is closed once the server has it
        const pendingOpen = openDone.current.get(id);
        if (pendingOpen) {
          const o = await pendingOpen;
          if (!o.ok && !o.unconfirmed) { dropClose(id); refreshHistory(); return { id, ok: true }; }
        }
        const r = await withRetry(
          () => traced(`close ${id.slice(0, 8)} attempt`, async () => {
            try { return await post<CloseResult>('/trade/close', { order_id: id }, { timeoutMs: TUNING.attemptMs }); }
            catch (e) { if (e instanceof ApiError && e.code === 'ORDER_NOT_OPEN') return null; throw e; } // already closed = done
          }),
          { budgetMs: TUNING.budgetMs, isDefinitive },
        );
        if (r.ok) {
          patchClose(id, { phase: 'acked', ackedAt: Date.now(), pnl: r.value?.order?.pnl });
          refreshHistory();
          setTimeout(() => { void mutate(); }, 600);
          return { id, ok: true, res: r.value ?? undefined };
        }
        if (!r.ok) diag(`close ${id.slice(0, 8)} ${r.definitive ? 'REFUSED' : 'UNCONFIRMED'} ${errCode(r.error)}`);
        if (r.definitive) {
          dropClose(id); // refused: the position is still open, bring it back
          refreshHistory(); // takes the provisional History row back out
          return { id, ok: false, error: r.error };
        }
        patchClose(id, { phase: 'lost', lostAt: Date.now() });
        toast.warn('Still confirming the close', 'The server has not answered yet. The position stays hidden and is resolved as soon as it does.');
        refreshHistory();
        void mutate();
        return { id, ok: true, unconfirmed: true };
      } finally {
        closing.current.delete(id);
      }
    }));
    return [...skipped, ...sent];
  }, [accountId, setLedger, patchClose, dropClose, mutate, toast, findPosition]);

  // ── limit / stop orders ─────────────────────────────────────────────────────────────────────────────────
  const sendingPending = useRef(new Set<string>());

  const pushPending = useCallback(async (o: PendingOrder) => {
    if (sendingPending.current.has(o.id)) return;
    sendingPending.current.add(o.id);
    try {
      const r = await withRetry(
        () => post('/trade/pending', { id: o.id, account_id: o.accountId, symbol: o.symbol, side: o.side, kind: o.kind, trigger_price: o.trigger, leverage: o.leverage, margin: o.margin, take_profit: o.tp, stop_loss: o.sl }, { timeoutMs: TUNING.attemptMs }),
        { budgetMs: TUNING.budgetMs, isDefinitive },
      );
      const st = useTerminal.getState();
      if (r.ok) { st.updatePending(o.id, { sync: 'synced', syncedAt: Date.now() }); void mutate(); return; }
      if (r.definitive && r.error instanceof ApiError && r.error.code === 'FEATURE_UNAVAILABLE') {
        st.updatePending(o.id, { server: false, sync: undefined }); // not enabled on the server yet: the browser watches it, as before
        return;
      }
      if (r.definitive) {
        st.removePending(o.id);
        toast.error(`Order refused · ${label(o.symbol)}`, r.error instanceof Error ? r.error.message : 'The server refused this order.');
      }
      // otherwise: left as 'sending'; it is re-sent below until the server answers
    } finally {
      sendingPending.current.delete(o.id);
    }
  }, [mutate, toast]);

  const placePending = useCallback(async (i: PendingInput) => {
    const id = crypto.randomUUID();
    const o: PendingOrder = { id, accountId, symbol: i.symbol, side: i.side, kind: i.kind, trigger: i.trigger, leverage: i.leverage, margin: i.margin, tp: i.tp, sl: i.sl, createdAt: Date.now(), status: 'working', server: true, sync: 'sending' };
    useTerminal.getState().addPending(o);
    await pushPending(o);
    return { ok: true as const, id };
  }, [accountId, pushPending]);

  // Orders still waiting for the server's acknowledgement (slow link, tab reopened) are sent again. Same id, so never twice.
  useEffect(() => {
    const resend = () => {
      for (const o of useTerminal.getState().pending) if (o.accountId === accountId && o.server && o.sync === 'sending') void pushPending(o);
    };
    resend();
    const t = setInterval(resend, 10_000);
    return () => clearInterval(t);
  }, [accountId, pushPending]);

  const cancelPending = useCallback((id: string) => {
    const st = useTerminal.getState();
    const o = st.pending.find((x) => x.id === id);
    st.removePending(id);
    if (!o?.server) return;
    cancelled.current.set(id, Date.now());
    void withRetry(() => post('/trade/pending/cancel', { id, account_id: o.accountId }, { timeoutMs: TUNING.attemptMs }), { budgetMs: TUNING.budgetMs, isDefinitive }).then(() => { void mutate(); });
  }, [mutate]);

  // ── context ──────────────────────────────────────────────────────────────────────────────────────────────
  const syncing = useMemo(
    () => Object.values(ledger.opens).filter((o) => o.phase !== 'acked').length + Object.values(ledger.closes).filter((c) => c.phase !== 'acked').length,
    [ledger],
  );
  const unconfirmed = view?.unconfirmed;
  const isUnconfirmed = useCallback((id: string) => !!unconfirmed?.has(id), [unconfirmed]);

  const value = useMemo<Ctx>(
    () => ({
      accountId,
      account: view?.account ?? null,
      metrics: view?.metrics ?? null,
      risk: data?.risk ?? null,
      positions: view?.positions ?? [],
      loading: swr.isLoading && !data,
      error: swr.error,
      stale: !!swr.error && !!data,
      syncing,
      isUnconfirmed,
      refresh,
      openPosition,
      closePositions,
      placePending,
      cancelPending,
    }),
    [accountId, view, data, swr.isLoading, swr.error, syncing, isUnconfirmed, refresh, openPosition, closePositions, placePending, cancelPending],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
