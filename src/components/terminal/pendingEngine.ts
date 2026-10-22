'use client';

import { useEffect } from 'react';
import { errMsg, post } from '@/lib/api';
import { fmtPrice } from '@/lib/format';
import type { Account, AccountMetrics, Position } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import { beep } from './sound';
import { useTerminal, type PendingOrder } from './store';

const STORAGE_KEY = 'sg-terminal-v1';

function persistedStatus(id: string): PendingOrder['status'] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const list: PendingOrder[] = JSON.parse(raw)?.state?.pending ?? [];
    return list.find((o) => o.id === id)?.status ?? null;
  } catch { return null; }
}

const crossed = (o: PendingOrder, bid: number, ask: number) => {
  if (o.kind === 'limit') return o.side === 'long' ? ask <= o.trigger : bid >= o.trigger;
  return o.side === 'long' ? ask >= o.trigger : bid <= o.trigger;
};

/**
 * Client-side Limit / Stop engine. The contract has no resting-order endpoint, so the browser watches the
 * engine bid/ask and sends a market order when the trigger is crossed. A Web Lock plus a re-read of the
 * persisted list stops two open tabs from filling the same order.
 */
export function usePendingEngine(accountId: string | null, refresh: () => Promise<unknown>, applyOpened?: (r: { order: Position; account?: Account; metrics?: AccountMetrics }) => void) {
  const toast = useToast();

  // Orders left mid-fill by a closed/crashed tab are not retried — we can't know if the server accepted them.
  useEffect(() => {
    const st = useTerminal.getState();
    for (const o of st.pending) if (o.status === 'filling') st.updatePending(o.id, { status: 'failed', error: 'Interrupted — check your positions' });
  }, []);

  // Stay in sync with other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) void useTerminal.persist.rehydrate(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!accountId) return;

    const fill = async (o: PendingOrder) => {
      const st = useTerminal.getState();
      if (persistedStatus(o.id) !== 'working') { void useTerminal.persist.rehydrate(); return; }
      st.updatePending(o.id, { status: 'filling', error: undefined });
      try {
        const body: Record<string, unknown> = { account_id: o.accountId, symbol: o.symbol, side: o.side, leverage: o.leverage, margin: o.margin };
        if (o.tp != null) body.take_profit = o.tp;
        if (o.sl != null) body.stop_loss = o.sl;
        const r = await post<{ order: Position; account?: Account; metrics?: AccountMetrics }>('/trade/open', body, { timeoutMs: 30_000 });
        useTerminal.getState().removePending(o.id);
        toast.success(`${o.kind === 'limit' ? 'Limit' : 'Stop'} filled · ${o.symbol.replace('USDT', '/USDT')}`, `${o.side} ${o.leverage}× at ${fmtPrice(r.order.entry_price)}`);
        if (useTerminal.getState().soundOn) beep(o.side === 'long' ? 'up' : 'down');
        if (applyOpened) applyOpened(r); else void refresh(); // show the filled position at once; the poll re-confirms
      } catch (e) {
        useTerminal.getState().updatePending(o.id, { status: 'failed', error: errMsg(e) });
        toast.error(`Conditional order failed · ${o.symbol.replace('USDT', '/USDT')}`, errMsg(e));
      }
    };

    const tryFill = (o: PendingOrder) => {
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      if (locks?.request) void locks.request(`sg-fill-${o.id}`, { ifAvailable: true }, async (lock) => { if (lock) await fill(o); });
      else void fill(o);
    };

    const scan = () => {
      const st = useTerminal.getState();
      for (const o of st.pending) {
        if (o.accountId !== accountId || o.status !== 'working') continue;
        const px = st.prices[o.symbol];
        if (px && crossed(o, px.bid, px.ask)) tryFill(o);
      }
    };

    scan();
    return useTerminal.subscribe((s, prev) => { if (s.prices !== prev.prices || s.pending !== prev.pending) scan(); });
  }, [accountId, refresh, applyOpened, toast]);
}
