'use client';

import { useSyncExternalStore } from 'react';

export type TerminalLayout = 'mobile' | 'desktop' | 'wide';

function compute(): TerminalLayout {
  const w = window.innerWidth;
  // A phone stays on the mobile layout even when the browser is in "Desktop site" mode
  // (which reports a ~1000px layout viewport). screen.* is the physical screen in CSS px.
  const phone = Math.min(window.screen.width, window.screen.height) < 600;
  if (phone || w < 1024) return 'mobile';
  return w >= 1680 ? 'wide' : 'desktop';
}

function subscribe(cb: () => void) {
  window.addEventListener('resize', cb);
  window.addEventListener('orientationchange', cb);
  return () => { window.removeEventListener('resize', cb); window.removeEventListener('orientationchange', cb); };
}

/** null during SSR / first paint so the terminal never flashes the wrong layout. */
export function useTerminalLayout(): TerminalLayout | null {
  return useSyncExternalStore<TerminalLayout | null>(subscribe, compute, () => null);
}
