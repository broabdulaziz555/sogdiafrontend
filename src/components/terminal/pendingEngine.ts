'use client';

import { useEffect } from 'react';
import { errMsg } from '@/lib/api';
import { fmtPrice } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { useTerminalData } from './data';
import { beep } from './sound';
import { useTerminal, type PendingOrder } from './store';
import { liveQuote } from './optimistic';

const STORAGE_KEY = 'sg-terminal-v1';

const crossed = (o: PendingOrder, bid: number, ask: number) => {
  if (o.kind === 'limit') return o.side === 'long' ? ask <= o.trigger : bid >= o.trigger;
  return o.side === 'long' ? ask >= o.trigger : bid <= o.trigger;
};

/**
 * Browser-side Limit / Stop watcher. This is only the FALLBACK: orders normally rest on the server (see data.tsx) and
 * fill there, even with the tab closed. It handles orders placed while the server-side feature is not enabled
 * (migration 004 not run). A fill reuses the order's own id, so a double fire (two tabs, a restart mid-fill) can never
 * open two positions.
 */
export function usePendingEngine(accountId: string | null) {
  const toast = useToast();
  const { openPosition } = useTerminalData();

  // A fill interrupted by a closed tab is simply retried: same id, so it cannot double.
  useEffect(() => {
    const st = useTerminal.getState();
    for (const o of st.pending) if (o.status === 'filling' && !o.server) st.updatePending(o.id, { status: 'working', error: undefined });
  }, []);

  // Stay in sync with other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) void useTerminal.persist.rehydrate(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!accountId) return;

    const fill = (o: PendingOrder) => {
      const st = useTerminal.getState();
      st.updatePending(o.id, { status: 'filling', error: undefined });
      void openPosition({ id: o.id, symbol: o.symbol, side: o.side, leverage: o.leverage, margin: o.margin, tp: o.tp, sl: o.sl, limitPrice: o.kind === 'limit' ? o.trigger : null }).then((r) => {
        const s = useTerminal.getState();
        if (r.ok) {
          s.removePending(o.id);
          toast.success(`${o.kind === 'limit' ? 'Limit' : 'Stop'} filled · ${o.symbol.replace('USDT', '/USDT')}`, `${o.side} ${o.leverage}× at ${fmtPrice(r.order.entry_price)}`);
          if (s.soundOn) beep(o.side === 'long' ? 'up' : 'down');
        } else if (r.unconfirmed) {
          s.updatePending(o.id, { status: 'failed', error: 'Not confirmed — check your positions' });
        } else {
          s.updatePending(o.id, { status: 'failed', error: errMsg(r.error) });
          toast.error(`Conditional order failed · ${o.symbol.replace('USDT', '/USDT')}`, errMsg(r.error));
        }
      });
    };

    const scan = () => {
      for (const o of useTerminal.getState().pending) {
        if (o.accountId !== accountId || o.server || o.status !== 'working') continue;
        const q = liveQuote(o.symbol); // websocket price for the open chart, engine quote otherwise
        if (q && crossed(o, q.bid, q.ask)) fill(o);
      }
    };

    scan();
    return useTerminal.subscribe((s, prev) => { if (s.prices !== prev.prices || s.last !== prev.last || s.pending !== prev.pending) scan(); });
  }, [accountId, openPosition, toast]);
}
