'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { get, type Query } from '@/lib/api';

/**
 * SWR wrapper over the contract client. Pass `null` as path to pause fetching.
 * Data is returned unwrapped from the `{ ok, data }` envelope.
 */
export function useApi<T>(path: string | null, query?: Query, config?: SWRConfiguration<T>) {
  const key = path ? [path, query ? JSON.stringify(query) : ''] : null;
  return useSWR<T>(key, () => get<T>(path as string, query), {
    revalidateOnFocus: false,
    shouldRetryOnError: (e) => !(e && (e as { status?: number }).status && (e as { status: number }).status < 500),
    errorRetryCount: 2,
    ...config,
  });
}
