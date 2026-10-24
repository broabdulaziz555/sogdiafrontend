import type { Account } from '@/lib/types';

/**
 * What a trader calls the account: "Evaluation" while there is a profit target to hit (step one of a one-step
 * account), "Funded" for every kind of funded account. The product names (One-Step, Instant) stay on the pricing and
 * checkout pages.
 */
export function accountStage(a: Pick<Account, 'profit_target_pct'>): 'Evaluation' | 'Funded' {
  return a.profit_target_pct != null ? 'Evaluation' : 'Funded';
}

/** Only an active account can open trades; every other status is view-only. */
export const isTradingAccount = (a: Pick<Account, 'status'> | null | undefined): boolean => a?.status === 'active';

/** Status as the trader reads it. The engine stores `failed`; the terminal calls it breached. */
export function statusLabel(status: string): string {
  if (status === 'failed' || status === 'breached') return 'Breached';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Which account the terminal opens on: the current one while it still exists, else ?account= / last used, else the
 * first active one, else the first of any status. Breached accounts are never filtered out.
 */
export function pickAccount(list: Pick<Account, 'id' | 'status'>[], current: string | null, wanted: string | null): string | null {
  if (!list.length) return null;
  if (current && list.some((a) => a.id === current)) return current;
  return list.find((a) => a.id === wanted)?.id ?? (list.find((a) => a.status === 'active') ?? list[0]).id;
}
