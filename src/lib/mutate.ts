import { mutate as globalMutate } from 'swr';

/** Revalidate every SWR entry created by `useApi` for a path prefix, e.g. `/payouts`. */
export function revalidatePath(prefix: string) {
  return globalMutate((key) => Array.isArray(key) && typeof key[0] === 'string' && (key[0] as string).startsWith(prefix));
}
