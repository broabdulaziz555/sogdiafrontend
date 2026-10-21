import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-accent" />
      <path d="M21.2 10.6c-1-1.5-2.8-2.4-5.2-2.4-3 0-5 1.5-5 3.7 0 2 1.4 3 4.5 3.7l1.5.3c1.7.4 2.4.8 2.4 1.6 0 .9-.9 1.5-2.4 1.5-1.6 0-2.8-.6-3.5-1.8l-3 1.4c1.1 2.3 3.4 3.5 6.5 3.5 3.4 0 5.6-1.6 5.6-4.1 0-2.1-1.4-3.2-4.6-3.9l-1.4-.3c-1.5-.3-2.2-.7-2.2-1.4 0-.8.8-1.3 2.1-1.3 1.2 0 2.2.5 2.8 1.4l2.9-1.5z" className="fill-accent-fg" />
    </svg>
  );
}

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[15px] font-bold tracking-[0.18em]">SOGDIA</span>
      {suffix && <span className="rounded border border-line bg-panel2 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-widest text-muted">{suffix}</span>}
    </span>
  );
}
