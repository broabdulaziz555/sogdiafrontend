'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { post } from '@/lib/api';
import { relTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';

interface Notif {
  id: string;
  type?: string;
  title?: string;
  message?: string;
  body?: string;
  read?: boolean;
  is_read?: boolean;
  read_at?: string | null;
  created_at: string;
}
interface Resp { notifications: Notif[]; unread: number; total: number }

const isRead = (n: Notif) => !!(n.read ?? n.is_read ?? n.read_at);

export function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, error, isLoading, mutate } = useApi<Resp>('/notifications', { limit: 20 }, { refreshInterval: 60_000 });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markAll = async () => {
    await post('/notifications', { all: true }).catch(() => {});
    mutate();
  };

  const unread = data?.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        className="relative grid h-8 w-8 place-items-center rounded-md border border-line bg-panel2 text-muted transition-colors hover:text-fg"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="num absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 text-2xs font-bold text-accent-fg">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={markAll} disabled={!unread} className="flex items-center gap-1 text-xs text-muted hover:text-fg disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {error && !data ? (
              <ErrorState error={error} onRetry={() => mutate()} compact />
            ) : isLoading && !data ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3" /></div>)}</div>
            ) : !data?.notifications.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted">You’re all caught up.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.notifications.map((n) => (
                  <li key={n.id} className={cn('px-4 py-3', !isRead(n) && 'bg-accent/[0.05]')}>
                    <div className="flex items-start gap-2">
                      {!isRead(n) && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{n.title ?? (n.type ?? 'Notification').replace(/_/g, ' ')}</p>
                        {(n.message ?? n.body) && <p className="mt-0.5 text-xs text-muted">{n.message ?? n.body}</p>}
                        <p className="mt-1 text-2xs text-subtle">{relTime(n.created_at)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
