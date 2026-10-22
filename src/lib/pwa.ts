'use client';

import { useCallback, useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
let wired = false;

/** Call once at app start: Chrome fires beforeinstallprompt only once, usually before the menu is ever opened. */
export function captureInstallPrompt() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstall() {
  const [, bump] = useState(0);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    captureInstallPrompt();
    setStandalone(isStandalone());
    const f = () => { bump((n) => n + 1); setStandalone(isStandalone()); };
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const r = await deferred.userChoice;
    deferred = null;
    listeners.forEach((fn) => fn());
    return r.outcome === 'accepted';
  }, []);
  return { canInstall: !!deferred, installed: standalone, ios, install };
}
