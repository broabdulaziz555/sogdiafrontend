import type { Plan, PricingResponse } from './types';

/**
 * List prices and rule-sets exactly as published in api-contract.md §3 and §6.
 * Used ONLY as a render fallback when GET /api/pricing is unreachable — the API is the source of truth.
 */
const SIZES = [5000, 10000, 25000, 50000, 100000] as const;
const ONE_STEP = [39, 69, 149, 249, 399];
const INSTANT = [63, 91, 183, 275, 459];

const label = (type: 'one_step' | 'instant', size: number) =>
  `${type === 'one_step' ? 'One-Step' : 'Instant'} $${size / 1000}K`;

export const FALLBACK_PLANS: Plan[] = [
  ...SIZES.map<Plan>((size, i) => ({
    key: `one_step_${size / 1000}k`,
    type: 'one_step',
    label: label('one_step', size),
    size,
    price: ONE_STEP[i],
    effective_price: ONE_STEP[i],
    profit_target_pct: 10,
    daily_dd_pct: 4,
    max_dd_pct: 6,
    max_leverage: 200,
    payout_split_pct: 80,
    payout_cycle_days: 14,
  })),
  ...SIZES.map<Plan>((size, i) => ({
    key: `instant_${size / 1000}k`,
    type: 'instant',
    label: label('instant', size),
    size,
    price: INSTANT[i],
    effective_price: INSTANT[i],
    profit_target_pct: null,
    daily_dd_pct: 3,
    max_dd_pct: 5,
    max_leverage: 200,
    payout_split_pct: 80,
    payout_cycle_days: 14,
  })),
];

export const FALLBACK_PRICING: PricingResponse = {
  payout_split_pct: 80,
  payout_cycle_days: 14,
  discounts: { site_wide_pct: 0, referral_discount_pct: 0, referral_commission_pct: 0, stacking: 'best_single_discount' },
  promos: [],
  plans: FALLBACK_PLANS,
};

export const PLAN_SIZES = SIZES;
