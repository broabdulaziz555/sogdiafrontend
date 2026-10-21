'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type Kind = 'success' | 'error' | 'info' | 'warn';
interface ToastItem { id: number; kind: Kind; title: string; description?: string }

interface Ctx {
  push: (t: Omit<ToastItem, 'id'> & { ttl?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warn: (title: string, description?: string) => void;
}

const ToastCtx = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast must be used inside <ToastProvider>');
  return c;
}

const ICONS: Record<Kind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-up" />,
  error: <XCircle className="h-4 w-4 text-down" />,
  info: <Info className="h-4 w-4 text-info" />,
  warn: <AlertTriangle className="h-4 w-4 text-warn" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const push = useCallback<Ctx['push']>(
    ({ ttl = 5000, ...t }) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { ...t, id }]);
      if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const value = useMemo<Ctx>(
    () => ({
      push,
      success: (title, description) => push({ kind: 'success', title, description }),
      error: (title, description) => push({ kind: 'error', title, description, ttl: 8000 }),
      info: (title, description) => push({ kind: 'info', title, description }),
      warn: (title, description) => push({ kind: 'warn', title, description, ttl: 7000 }),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex animate-fade-up items-start gap-3 rounded-lg border bg-panel p-3 pr-2 shadow-pop',
              t.kind === 'error' ? 'border-down/40' : t.kind === 'success' ? 'border-up/30' : 'border-line',
            )}
          >
            <span className="mt-0.5 shrink-0">{ICONS[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-xs text-muted">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-subtle hover:bg-fg/10 hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
