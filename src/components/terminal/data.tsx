'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
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
  applyOpened: (r: { order: Position; account?: Account; metrics?: AccountMetrics }) => void;
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
    { refreshInterval: (d) => (d?.positions?.length ? 3000 : 10_000), dedupingInterval: 1500, revalidateOnFocus: true, keepPreviousData: true, errorRetryInterval: 3000, shouldRetryOnError: true },
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

  const refresh = useCallback(() => swr.mutate(), [swr]);
  const applyOpened = useCallback((r: { order: Position; account?: Account; metrics?: AccountMetrics }) => {
    void swr.mutate((cur) => {
      if (!cur) return cur;
      const rest = cur.positions.filter((p) => p.id !== r.order.id);
      return { ...cur, positions: [r.order, ...rest], account: r.account ?? cur.account, metrics: r.metrics ?? cur.metrics };
    }, { revalidate: false });
    // confirm with the server a moment later, off the critical path
    setTimeout(() => { void swr.mutate(); }, 800);
  }, [swr]);
  const value = useMemo<Ctx>(
    () => ({
      accountId,
      account: data?.account ?? null,
      metrics: data?.metrics ?? null,
      risk: data?.risk ?? null,
      positions: data?.positions ?? [],
      loading: swr.isLoading && !data,
      error: swr.error,
      stale: !!swr.error && !!data,
      refresh,
      applyOpened,
    }),
    [accountId, data, swr.isLoading, swr.error, refresh, applyOpened],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
