import { cn } from '@/lib/cn';

export function PageHead({ title, subtitle, actions, className }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile. Standalone it carries its own hairline; inside <StatStrip> the strip supplies the dividers. */
export function Stat({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down'; className?: string }) {
  return (
    <div className={cn('min-w-0 overflow-hidden border border-line bg-panel px-3.5 py-3', className)}>
      <p className="label truncate">{label}</p>
      <p className={cn('num mt-1.5 whitespace-nowrap font-mono text-[clamp(1rem,4.6vw,1.375rem)] font-semibold leading-tight tracking-tight', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</p>
      {sub && <p className="mt-1 truncate text-xs leading-snug text-muted">{sub}</p>}
    </div>
  );
}
