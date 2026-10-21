'use client';

import { useApi } from './useApi';
import type { PricingResponse } from '@/lib/types';
import { FALLBACK_PRICING } from '@/lib/pricing-fallback';

/** Live pricing with a static list-price fallback so marketing pages never render empty. */
export function usePricing() {
  const { data, error, isLoading, mutate } = useApi<PricingResponse>('/pricing', undefined, {
    refreshInterval: 60_000,
  });
  return {
    pricing: data ?? FALLBACK_PRICING,
    live: !!data,
    loading: isLoading && !data,
    failed: !!error && !data,
    retry: () => mutate(),
  };
}
