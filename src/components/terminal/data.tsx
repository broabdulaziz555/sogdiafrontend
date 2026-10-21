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
}

const DataCtx = createContext<Ctx | null>(null);
export const useTerminalData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useTerminalData outside provider');
  return c;
};

const REASON: Record<string, string> = { liquidation: 'Liquidated', stop_loss: 'Stop-loss hit', take_profit: 'Take-profit hit' };

/** Single 2-second poll of /trade/positions shared by every panel. */
export function TerminalDataProvider({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  const toast = useToast();
  const seen = useRef(new Set<string>());
  const soundOn = useTerminal((s) => s.soundOn);

  const swr = useSWR<PositionsResponse>(
    ['terminal-positions', accountId],
    () => get<PositionsResponse>('/trade/positions', { account_id: accountId }),
    { refreshInterval: 2000, dedupingInterval: 1000, revalidateOnFocus: true, keepPreviousData: true, errorRetryInterval: 2000, shouldRetryOnError: true },
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
    }),
    [accountId, data, swr.isLoading, swr.error, refresh],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
