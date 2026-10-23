'use client';

import { useEffect } from 'react';
import { BUILD_ID, diag } from '@/lib/diag';

/**
 * A phone keeps an old tab (or installed app) alive for days, so fixes never reach it. Every minute and whenever the
 * app comes back to the foreground, compare the compiled-in build id with the deployed one and reload when they differ.
 * `busy()` lets the caller hold the reload while something is still being sent.
 */
export function useUpdateWatcher(busy: () => boolean) {
  useEffect(() => {
    if (BUILD_ID === 'dev') return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (stopped || !id || id === BUILD_ID) return;
        if (busy()) return; // try again next minute
        const last = Number(sessionStorage.getItem('sg-reloaded-at') || 0);
        if (Date.now() - last < 5 * 60_000) return; // never loop
        sessionStorage.setItem('sg-reloaded-at', String(Date.now()));
        diag(`new build ${id} deployed (running ${BUILD_ID}) — reloading`);
        // let the service worker drop its copies first, then fetch everything fresh
        if ('caches' in window) await Promise.all((await caches.keys()).filter((k) => k.startsWith('sg-pages') || k.startsWith('sg-static')).map((k) => caches.delete(k)));
        window.location.reload();
      } catch { /* offline: next time */ }
    };
    void check();
    const t = setInterval(check, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [busy]);
}
