'use client';

import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ApiError, errMsg } from '@/lib/api';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16', className)}>
      <div className="grid h-10 w-10 place-items-center border border-line2 bg-panel2 text-subtle">
        {icon ?? <Inbox className="h-5 w-5" strokeWidth={1.5} />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
  compact,
  title = 'Could not load data',
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
  title?: string;
}) {
  const offline = error instanceof ApiError && error.code === 'NETWORK_ERROR';
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14', className)} role="alert">
      <div className="grid h-10 w-10 place-items-center border border-down/40 bg-down/10 text-down">
        {offline ? <WifiOff className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
      </div>
      <div className="space-y-1">
        <p className="text-md font-medium">{offline ? 'You appear to be offline' : title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted">{errMsg(error)}</p>
        {error instanceof ApiError && error.code !== 'NETWORK_ERROR' && (
          <p className="font-mono text-2xs text-subtle">{error.code}{error.status ? ` · HTTP ${error.status}` : ''}</p>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-accent', className)}
    />
  );
}
