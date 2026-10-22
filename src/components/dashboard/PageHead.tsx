import { cn } from '@/lib/cn';

export function PageHead({ title, subtitle, actions, className }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'up' | 'down'; className?: string }) {
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-xl border border-line bg-panel p-3.5 sm:p-4', className)}>
      <p className="label truncate">{label}</p>
      <p className={cn('num mt-1.5 whitespace-nowrap text-[clamp(1rem,5vw,1.5rem)] font-bold leading-tight tracking-tight', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs leading-snug text-muted">{sub}</p>}
    </div>
  );
}
