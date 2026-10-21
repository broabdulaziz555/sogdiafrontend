'use client';

import useSWR from 'swr';
import { get } from '@/lib/api';
import { useApi } from './useApi';
import type { Account, HistoryOrder, HistoryResponse } from '@/lib/types';

export function useAccounts(status?: string) {
  const r = useApi<{ accounts: Account[] }>('/accounts', status ? { status } : undefined, { refreshInterval: 30_000 });
  return { ...r, accounts: r.data?.accounts };
}

const PAGE = 100;

/** Pulls every closed order for an account (paged) — used by the PnL calendar. */
export function useAllHistory(accountId: string | null) {
  const r = useSWR<{ orders: HistoryOrder[]; truncated: boolean }>(
    accountId ? ['history-all', accountId] : null,
    async () => {
      const orders: HistoryOrder[] = [];
      let offset = 0;
      let total = Infinity;
      let pages = 0;
      while (offset < total && pages < 30) {
        const res = await get<HistoryResponse>('/trade/history', { account_id: accountId!, limit: PAGE, offset, status: 'closed' });
        orders.push(...res.orders);
        total = res.total;
        offset += PAGE;
        pages++;
        if (!res.orders.length) break;
      }
      return { orders, truncated: offset < total };
    },
    { revalidateOnFocus: false, keepPreviousData: false },
  );
  return r;
}
