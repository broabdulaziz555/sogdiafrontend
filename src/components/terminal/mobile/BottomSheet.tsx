'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Phone bottom sheet. z-[80] so confirmation modals (z-[90]) open above it. */
export function BottomSheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('absolute inset-x-0 bottom-0 flex max-h-[92dvh] animate-slide-up flex-col border-t border-line2 bg-panel pb-[env(safe-area-inset-bottom)] shadow-pop', className)}>
        <div className="relative flex shrink-0 items-center justify-between border-b border-line px-4 py-1.5 pt-3">
          <span className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 bg-line2" aria-hidden />
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-fg/[0.06] hover:text-fg"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
