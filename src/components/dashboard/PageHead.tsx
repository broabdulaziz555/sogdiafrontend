import { cn } from '@/lib/cn';

export function PageHead({ title, subtitle, actions, className }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile: a rounded card with a quiet label and a large figure. Tone tints the figure for PnL. */
export function Stat({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down'; className?: string }) {
  return (
    <div className={cn('card min-w-0 overflow-hidden px-4 py-3.5 sm:px-5 sm:py-4', className)}>
      <p className="label truncate">{label}</p>
      <p className={cn('num mt-2 whitespace-nowrap text-[clamp(1.125rem,4.6vw,1.625rem)] font-semibold leading-tight tracking-tight', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</p>
      {sub && <p className="mt-1.5 truncate text-xs leading-snug text-muted">{sub}</p>}
    </div>
  );
}
