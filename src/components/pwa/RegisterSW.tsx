'use client';

import { useEffect } from 'react';
import { mutate } from 'swr';
import { captureInstallPrompt } from '@/lib/pwa';

export function RegisterSW() {
  useEffect(() => {
    captureInstallPrompt();
    if (!('serviceWorker' in navigator)) return;

    // When the SW revalidates an API response and finds fresher data, refresh matching SWR keys.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'API_REVALIDATED') return;
      const url = String(e.data.url || '');
      mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && url.includes(`/api${key[0]}`), undefined, { revalidate: true });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    if (process.env.NODE_ENV === 'production') {
      const onLoad = () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => console.warn('[sw] registration failed', err));
      };
      if (document.readyState === 'complete') onLoad();
      else window.addEventListener('load', onLoad, { once: true });
    }
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
  return null;
}
