'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { get } from '@/lib/api';
import { fmtSigned, fmtPrice } from '@/lib/format';
import type { Account, AccountMetrics, Position, PositionsResponse, RiskState } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { beep } from './sound';
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
}

const DataCtx = createContext<Ctx | null>(null);
export const useTerminalData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useTerminalData outside provider');
  return c;
};

const REASON: Record<string, string> = { liquidation: 'Liquidated', stop_loss: 'Stop-loss hit', take_profit: 'Take-profit hit' };

/** Single shared poll of /trade/positions (3 s with open trades, 10 s when flat). */
export function TerminalDataProvider({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const toast = useToast();
  const seen = useRef(new Set<string>());
  const soundOn = useTerminal((s) => s.soundOn);

  const swr = useSWR<PositionsResponse>(
    ['terminal-positions', accountId],
    () => get<PositionsResponse>('/trade/positions', { account_id: accountId }),
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
  const PIN_MS = 30_000;
  const [pinned, setPinned] = useState<{ pos: Position; at: number }[]>([]);
  const [closedIds, setClosedIds] = useState<Record<string, number>>({});

  const dropOptimistic = useCallback((id: string) => setPinned((l) => l.filter((x) => x.pos.id !== id)), []);
  const addOptimistic = useCallback((p: Position) => setPinned((l) => [{ pos: p, at: Date.now() }, ...l]), []);

  const applyOpened = useCallback((r: { order: Position; account?: Account; metrics?: AccountMetrics }, tmpId?: string) => {
    void mutate((cur) => {
      if (!cur) return cur;
      const rest = cur.positions.filter((p) => p.id !== r.order.id);
      return { ...cur, positions: [r.order, ...rest], account: r.account ?? cur.account, metrics: r.metrics ?? cur.metrics };
    }, { revalidate: false });
    setPinned((l) => [{ pos: r.order, at: Date.now() }, ...l.filter((x) => x.pos.id !== tmpId && x.pos.id !== r.order.id)]);
    setTimeout(() => { void mutate(); }, 1500);
  }, [mutate]);

  const applyClosed = useCallback((id: string, r?: { account?: Account; metrics?: AccountMetrics }) => {
    setClosedIds((c) => ({ ...c, [id]: Date.now() }));
    setPinned((l) => l.filter((x) => x.pos.id !== id));
    void mutate((cur) => (cur ? { ...cur, positions: cur.positions.filter((p) => p.id !== id), account: r?.account ?? cur.account, metrics: r?.metrics ?? cur.metrics } : cur), { revalidate: false });
    setTimeout(() => { void mutate(); }, 1500);
  }, [mutate]);

  // housekeeping: forget pins the server now lists (or that outlived the grace period), and closes it has caught up with
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.positions.map((p) => p.id));
    const gone = new Set((data.liquidated ?? []).map((l) => l.id));
    const now = Date.now();
    setPinned((l) => { const n = l.filter((x) => !ids.has(x.pos.id) && !gone.has(x.pos.id) && (x.pos.id.startsWith('tmp-') || now - x.at < PIN_MS)); return n.length === l.length ? l : n; });
    setClosedIds((c) => {
      const keys = Object.keys(c);
      const n = keys.filter((k) => ids.has(k) && now - c[k] < PIN_MS);
      return n.length === keys.length ? c : Object.fromEntries(n.map((k) => [k, c[k]]));
    });
  }, [data]);

  const positions = useMemo(() => {
    const server = (data?.positions ?? []).filter((p) => !closedIds[p.id]);
    if (!pinned.length) return server;
    const ids = new Set(server.map((p) => p.id));
    return [...pinned.map((x) => x.pos).filter((p) => !ids.has(p.id) && !closedIds[p.id]), ...server];
  }, [data, pinned, closedIds]);

  const value = useMemo<Ctx>(
    () => ({
      accountId,
      account: data?.account ?? null,
      metrics: data?.metrics ?? null,
      risk: data?.risk ?? null,
      positions,
      loading: swr.isLoading && !data,
      error: swr.error,
      stale: !!swr.error && !!data,
      refresh,
      applyOpened,
      addOptimistic,
      dropOptimistic,
      applyClosed,
    }),
    [accountId, data, positions, swr.isLoading, swr.error, refresh, applyOpened, addOptimistic, dropOptimistic, applyClosed],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
