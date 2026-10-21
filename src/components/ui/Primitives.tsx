'use client';

import { forwardRef, useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Badge ─────────────────────────────────────────────────────────────── */
type Tone = 'neutral' | 'accent' | 'up' | 'down' | 'warn' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-fg/[0.07] text-muted border-line',
  accent: 'bg-accent/10 text-accent border-accent/30',
  up: 'bg-up/10 text-up border-up/30',
  down: 'bg-down/10 text-down border-down/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  info: 'bg-info/10 text-info border-info/30',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wider', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  active: 'up', passed: 'accent', verified: 'up', paid: 'up', approved: 'info', pending: 'warn',
  frozen: 'info', failed: 'down', breached: 'down', rejected: 'down', closed: 'neutral',
  not_submitted: 'neutral', expired: 'neutral', inactive: 'neutral', exhausted: 'warn',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{status.replace(/_/g, ' ')}</Badge>;
}

/* ── Field wrappers ────────────────────────────────────────────────────── */
export function Field({ label, hint, error, children, className, htmlFor }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="block text-xs font-medium text-muted">{label}</label>}
      {children}
      {error ? <p role="alert" className="text-xs text-down">{error}</p> : hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn('field', invalid && 'border-down focus:border-down focus:ring-down/25', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn('field h-auto min-h-[80px] py-2 leading-relaxed', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn('field appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238292a6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p}>
      {children}
    </select>
  );
});

/* ── Segmented control ─────────────────────────────────────────────────── */
export function Segmented<T extends string | number>({ value, onChange, options, size = 'md', className, ariaLabel }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; size?: 'sm' | 'md'; className?: string; ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('inline-flex rounded-lg border border-line bg-panel2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            o.value === value ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tabs (underline) ──────────────────────────────────────────────────── */
export function Tabs<T extends string>({ value, onChange, tabs, className }: {
  value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number }[]; className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex items-center gap-4 overflow-x-auto scroll-none border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            'relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 text-sm font-medium transition-colors',
            t.value === value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.label}
          {t.count != null && <span className={cn('num rounded px-1 text-2xs', t.value === value ? 'bg-accent/15 text-accent' : 'bg-fg/[0.07] text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Switch ────────────────────────────────────────────────────────────── */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full border transition-colors', checked ? 'border-accent bg-accent' : 'border-line bg-panel2')}
    >
      <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all', checked ? 'left-[18px] bg-accent-fg' : 'left-0.5 bg-subtle')} />
    </button>
  );
}

/* ── Copy button ───────────────────────────────────────────────────────── */
export function CopyButton({ value, className, label = 'Copy' }: { value: string; className?: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* clipboard blocked */ }
      }}
      className={cn('grid h-6 w-6 place-items-center rounded text-subtle transition-colors hover:bg-fg/10 hover:text-fg', className)}
    >
      {ok ? <Check className="h-3.5 w-3.5 text-up" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ── Tooltip (CSS-only, keyboard-focusable parent) ─────────────────────── */
export function Tip({ text, children, side = 'top' }: { text: string; children: React.ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-panel px-2 py-1 text-xs text-fg opacity-0 shadow-pop transition-opacity delay-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {text}
      </span>
    </span>
  );
}

/* ── Progress meter ────────────────────────────────────────────────────── */
export function Meter({ value, max = 100, tone = 'accent', className }: { value: number; max?: number; tone?: 'accent' | 'up' | 'down' | 'warn'; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = { accent: 'bg-accent', up: 'bg-up', down: 'bg-down', warn: 'bg-warn' }[tone];
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-fg/[0.08]', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
