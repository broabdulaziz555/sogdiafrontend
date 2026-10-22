'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ApiError, get, post } from '@/lib/api';
import { fmtSigned, fmtPrice } from '@/lib/format';
import type { Account, AccountMetrics, Position, PositionsResponse, RiskState } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { beep } from './sound';
import { SPREAD, liveMid } from './optimistic';
import { useTerminal } from './store';

interface Ctx {
  accountId: string;
  account: Account | null;
  metrics: AccountMetrics | null;
  risk: RiskState | null;
  positions: Position[];
  loading: boolean;
  error: unknown;
  stale: boolean;
  refresh: () => Promise<unknown>;
  /** Show a just-opened position at once (no waiting for the next poll); the poll then confirms it. */
  applyOpened: (r: { order: Position; account?: Account; metrics?: AccountMetrics }, tmpId?: string) => void;
  /** Put a provisional position on screen the instant the order is sent; replaced by the server's row on reply. */
  addOptimistic: (p: Position) => void;
  dropOptimistic: (id: string) => void;
  /** Remove a closed position at once and apply the account/metrics the close endpoint returned. */
  applyClosed: (id: string, r?: { account?: Account; metrics?: AccountMetrics }) => void;
  /** Close positions instantly on screen; the requests run behind it and a row comes back only if its close is refused. */
  closePositions: (ids: string[]) => Promise<CloseOutcome[]>;
}

export interface CloseResult { order: { pnl: number; close_price: number }; account?: Account; metrics?: AccountMetrics }
export interface CloseOutcome { id: string; ok: boolean; res?: CloseResult; error?: unknown }

const DataCtx = createContext<Ctx | null>(null);
export const useTerminalData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useTerminalData outside provider');
  return c;
};

const PIN_MAX_MS = 5 * 60_000;

const REASON: Record<string, string> = { liquidation: 'Liquidated', stop_loss: 'Stop-loss hit', take_profit: 'Take-profit hit' };

/** Single shared poll of /trade/positions (3 s with open trades, 10 s when flat). */
export function TerminalDataProvider({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const toast = useToast();
  const seen = useRef(new Set<string>());
  const soundOn = useTerminal((s) => s.soundOn);

  const pollStartedAt = useRef(0);
  const swr = useSWR<PositionsResponse>(
    ['terminal-positions', accountId],
    async () => {
      const startedAt = Date.now();
      const res = await get<PositionsResponse>('/trade/positions', { account_id: accountId });
      pollStartedAt.current = startedAt; // the list below reflects the database as it was at this moment
      return res;
    },
    // the server runs its risk sweep on every call, so poll fast only while something is actually open
    { refreshInterval: (d) => (d?.positions?.length ? 2500 : 10_000), dedupingInterval: 1000, revalidateOnFocus: true, keepPreviousData: true, errorRetryInterval: 3000, shouldRetryOnError: true },
  );

  const data = swr.data;
  useEffect(() => {
    if (!data) return;
    for (const ev of data.liquidated ?? []) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      const title = `${ev.symbol.replace('USDT', '/USDT')} · ${REASON[ev.reason ?? 'liquidation'] ?? 'Closed'}`;
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

  const { mutate } = swr; // stable across renders, unlike the `swr` object
  const refresh = useCallback(() => mutate(), [mutate]);
  // Reconciliation layer. The server's list is eventually consistent (a poll can land before the new row is visible),
  // so a row we know about — provisional or just confirmed by /trade/open — is pinned until the server list has it.
  // Likewise a position we just closed stays hidden until the server list stops returning it.
  const [pinned, setPinned] = useState<{ pos: Position; at: number }[]>([]);
  const [closedIds, setClosedIds] = useState<Record<string, number>>({});

  const dropOptimistic = useCallback((id: string) => setPinned((l) => l.filter((x) => x.pos.id !== id)), []);
  const addOptimistic = useCallback((p: Position) => setPinned((l) => [{ pos: p, at: Date.now() }, ...l]), []);

  const applyOpened = useCallback((r: { order: Position; account?: Account; metrics?: AccountMetrics }, tmpId?: string) => {
    // Only the account figures go into the shared list. The position itself stays pinned until a poll that really lists it
    // arrives: writing it into the list here let an older, still-in-flight poll (started before the order existed) wipe it.
    void mutate((cur) => (cur ? { ...cur, account: r.account ?? cur.account, metrics: r.metrics ?? cur.metrics } : cur), { revalidate: false });
    setPinned((l) => [{ pos: r.order, at: Date.now() }, ...l.filter((x) => x.pos.id !== tmpId && x.pos.id !== r.order.id)]);
    setTimeout(() => { void mutate(); }, 1500);
  }, [mutate]);

  const applyClosed = useCallback((id: string, r?: { account?: Account; metrics?: AccountMetrics }) => {
    setClosedIds((c) => ({ ...c, [id]: Date.now() }));
    setPinned((l) => l.filter((x) => x.pos.id !== id));
    void mutate((cur) => (cur ? { ...cur, positions: cur.positions.filter((p) => p.id !== id), account: r?.account ?? cur.account, metrics: r?.metrics ?? cur.metrics } : cur), { revalidate: false });
    setTimeout(() => { void mutate(); }, 1500);
  }, [mutate]);

  const closing = useRef(new Set<string>());
  const closePositions = useCallback(async (ids: string[]): Promise<CloseOutcome[]> => {
    // a close already in flight for an id is not sent again (double tap, hotkey + button, close-all + single close)
    const skipped = ids.filter((id) => closing.current.has(id)).map((id): CloseOutcome => ({ id, ok: true }));
    const real = ids.filter((id) => !id.startsWith('tmp-') && !closing.current.has(id));
    real.forEach((id) => closing.current.add(id));
    const now = Date.now();
    setClosedIds((c) => { const n = { ...c }; for (const id of real) n[id] = now; return n; });
    setPinned((l) => l.filter((x) => !real.includes(x.pos.id)));
    const sent = await Promise.all(real.map(async (id): Promise<CloseOutcome> => {
      try {
        const res = await post<CloseResult>('/trade/close', { order_id: id }, { timeoutMs: 30_000 });
        applyClosed(id, res);
        return { id, ok: true, res };
      } catch (error) {
        // "already closed" is not a failure: it is gone on the server too, so it stays hidden and the list is refreshed.
        if (error instanceof ApiError && error.code === 'ORDER_NOT_OPEN') {
          void mutate();
          return { id, ok: true };
        }
        setClosedIds((c) => { const n = { ...c }; delete n[id]; return n; });
        return { id, ok: false, error };
      } finally {
        closing.current.delete(id);
      }
    }));
    return [...skipped, ...sent];
  }, [applyClosed, mutate]);

  // Housekeeping. A pinned (just opened) position is dropped once the server list shows it, or once a poll that STARTED
  // after it was confirmed still does not list it (so it is genuinely gone: closed by SL/TP/liquidation). A stale or
  // failed poll proves nothing, so it can never remove a position. Same rule for closes we are hiding. 5 min is a safety cap.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.positions.map((p) => p.id));
    const gone = new Set((data.liquidated ?? []).map((l) => l.id));
    const now = Date.now();
    const fresh = pollStartedAt.current;
    setPinned((l) => {
      const n = l.filter((x) => {
        if (ids.has(x.pos.id) || gone.has(x.pos.id)) return false;
        if (x.pos.id.startsWith('tmp-')) return true;
        return !(fresh > x.at) && now - x.at < PIN_MAX_MS;
      });
      return n.length === l.length ? l : n;
    });
    setClosedIds((c) => {
      const keys = Object.keys(c);
      const n = keys.filter((k) => (ids.has(k) || !(fresh > c[k])) && now - c[k] < PIN_MAX_MS);
      return n.length === keys.length ? c : Object.fromEntries(n.map((k) => [k, c[k]]));
    });
  }, [data]);

  const positions = useMemo(() => {
    const server = (data?.positions ?? []).filter((p) => !closedIds[p.id]);
    if (!pinned.length) return server;
    const ids = new Set(server.map((p) => p.id));
    return [...pinned.map((x) => x.pos).filter((p) => !ids.has(p.id) && !closedIds[p.id]), ...server];
  }, [data, pinned, closedIds]);

  // Live profit: between server polls the numbers follow the browser's live price (same spread/maths as the server),
  // so profit, equity and the chart lines move with the market instead of every 2.5 s.
  const [tick, setTick] = useState(0);
  const hasOpen = positions.length > 0;
  useEffect(() => {
    if (!hasOpen) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [hasOpen]);

  const live = useMemo(() => {
    let delta = 0;
    const list = positions.map((p) => {
      const mid = liveMid(p.symbol);
      if (mid == null) return p;
      const exit = p.side === 'long' ? mid * (1 - SPREAD) : mid * (1 + SPREAD);
      const pnl = Math.round(((p.side === 'long' ? exit - p.entry_price : p.entry_price - exit) * p.quantity) * 100) / 100;
      delta += pnl - p.unrealized_pnl;
      return { ...p, mark_price: mid, unrealized_pnl: pnl, unrealized_pnl_pct: p.margin > 0 ? Math.round((pnl / p.margin) * 10000) / 100 : 0 };
    });
    return { list, delta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, tick]);

  const liveMetrics = useMemo(() => {
    const m = data?.metrics ?? null;
    if (!m || !live.delta) return m;
    return { ...m, equity: Math.round((m.equity + live.delta) * 100) / 100, unrealized_pnl: Math.round((m.unrealized_pnl + live.delta) * 100) / 100 };
  }, [data, live.delta]);

  const value = useMemo<Ctx>(
    () => ({
      accountId,
      account: data?.account ?? null,
      metrics: liveMetrics,
      risk: data?.risk ?? null,
      positions: live.list,
      loading: swr.isLoading && !data,
      error: swr.error,
      stale: !!swr.error && !!data,
      refresh,
      applyOpened,
      addOptimistic,
      dropOptimistic,
      applyClosed,
      closePositions,
    }),
    [accountId, data, live.list, liveMetrics, swr.isLoading, swr.error, refresh, applyOpened, addOptimistic, dropOptimistic, applyClosed, closePositions],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
