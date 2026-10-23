/** Small in-memory trail of what the terminal did (requests, retries, drops), shown in Menu → Diagnostics. Never sent anywhere. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

interface Entry { t: number; msg: string }
const LIMIT = 150;
const trail: Entry[] = [];
const listeners = new Set<() => void>();

export function diag(msg: string) {
  trail.push({ t: Date.now(), msg });
  if (trail.length > LIMIT) trail.splice(0, trail.length - LIMIT);
  listeners.forEach((l) => l());
}

export const diagSubscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function diagText(): string {
  const head = `build ${BUILD_ID} · ${new Date().toISOString()} · ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`;
  const t0 = trail[0]?.t ?? 0;
  const lines = trail.map((e) => `${new Date(e.t).toISOString().slice(11, 23)} +${((e.t - t0) / 1000).toFixed(1)}s ${e.msg}`);
  return [head, ...lines].join('\n');
}
