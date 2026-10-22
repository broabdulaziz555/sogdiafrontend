'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Shared behaviour for overlays: ESC to close, focus trap, scroll lock, focus restore. */
function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prev.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && el) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (!nodes.length) return;
        const a = nodes[0];
        const z = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}) {
  const stableClose = useCallback(onClose, [onClose]);
  const ref = useOverlay(open, stableClose);
  if (!open || typeof document === 'undefined') return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[min(96vw,1400px)]' };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-[#04060C]/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl border border-line2/70 bg-panel shadow-pop sm:animate-scale-in sm:rounded-3xl',
          widths[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted transition-colors hover:bg-fg/10 hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2.5 border-t border-line/60 bg-panel2/40 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-xl',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
}) {
  const stableClose = useCallback(onClose, [onClose]);
  const ref = useOverlay(open, stableClose);
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-[#04060C]/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn('absolute inset-y-0 right-0 flex w-full animate-slide-left flex-col border-l border-line2/70 bg-panel pb-safe pt-safe shadow-pop sm:inset-y-3 sm:right-3 sm:w-[calc(100%-1.5rem)] sm:rounded-3xl sm:border', width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line/60 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>}
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close panel" className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-muted hover:bg-fg/10 hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-line/60 bg-panel2/40 px-5 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
