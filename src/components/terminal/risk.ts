import type { Account, AccountMetrics } from '@/lib/types';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Fraction (0–1) of each drawdown allowance already consumed.
 * Derived from the *remaining* amount so it never depends on how the backend
 * labels `*_used_pct`: used = 1 − remaining / allowance.
 */
export function ddUsage(account: Account | null, m: AccountMetrics | null) {
  if (!account || !m) return { daily: 0, max: 0, dailyAllowance: 0, maxAllowance: 0 };
  const dailyAllowance = (account.daily_start_balance * account.daily_dd_pct) / 100;
  const maxAllowance = (account.size * account.max_dd_pct) / 100;
  return {
    daily: dailyAllowance > 0 ? clamp01(1 - m.daily_dd_remaining / dailyAllowance) : 0,
    max: maxAllowance > 0 ? clamp01(1 - m.max_dd_remaining / maxAllowance) : 0,
    dailyAllowance,
    maxAllowance,
  };
}

export const toneFor = (used: number): 'up' | 'warn' | 'down' => (used >= 0.85 ? 'down' : used >= 0.6 ? 'warn' : 'up');

/**
 * Projected PnL if the position closes at `price`. Past the liquidation price the trader can lose no more than the
 * margin (the engine liquidates first), so the figure is capped there.
 */
export function pnlAt(p: { side: 'long' | 'short'; entry: number; quantity: number; margin: number; liquidation?: number | null }, price: number): number | null {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(p.entry) || p.entry <= 0 || !Number.isFinite(p.quantity)) return null;
  const long = p.side === 'long';
  const liq = p.liquidation;
  if (liq != null && Number.isFinite(liq) && liq > 0 && (long ? price <= liq : price >= liq)) return -Math.abs(p.margin);
  return (long ? price - p.entry : p.entry - price) * p.quantity;
}
