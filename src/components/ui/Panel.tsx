import { cn } from '@/lib/cn';

/**
 * Panel — the base surface of the platform: 1px hairline, slate fill, square corners.
 * Compose with <PanelHeader> for a recessed title strip (terminal / ledger look).
 */
export function Panel({ className, children, as: Tag = 'section', ...rest }: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'aside' }) {
  return <Tag className={cn('border border-line bg-panel', className)} {...rest}>{children}</Tag>;
}

export function PanelHeader({ title, icon, meta, actions, className }: {
  title: React.ReactNode; icon?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('panel-head', className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="shrink-0 text-subtle [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        <h2 className="panel-title truncate">{title}</h2>
        {meta && <span className="truncate text-2xs text-subtle">{meta}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** Joined KPI strip: tiles share 1px dividers instead of floating as separate boxes. */
export function StatStrip({ children, className, cols = 4 }: { children: React.ReactNode; className?: string; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4', 5: 'grid-cols-2 lg:grid-cols-5', 6: 'grid-cols-2 lg:grid-cols-6' }[cols];
  return (
    <div className={cn('grid gap-px border border-line bg-line', grid, '[&>*]:border-0', className)}>{children}</div>
  );
}

/** Label / value row used in detail panes (monospace values, hairline separators). */
export function DataRow({ k, v, mono, tone, className }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean; tone?: 'up' | 'down' | 'warn'; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-line/70 py-2 text-sm last:border-0', className)}>
      <dt className="text-muted">{k}</dt>
      <dd className={cn('min-w-0 truncate text-right font-medium', mono && 'num font-mono', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{v}</dd>
    </div>
  );
}
