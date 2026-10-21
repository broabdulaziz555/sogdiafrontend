'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'up' | 'down' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg hover:brightness-110 active:brightness-95 shadow-[0_0_0_1px_rgb(var(--accent)/0.5),0_8px_24px_-10px_rgb(var(--accent)/0.55)] hover:shadow-[0_0_0_1px_rgb(var(--accent)/0.7),0_10px_32px_-8px_rgb(var(--accent)/0.65)]',
  secondary: 'bg-panel2 text-fg border border-line hover:border-subtle/70 hover:bg-fg/[0.04] active:bg-fg/[0.07]',
  outline: 'border border-line text-fg hover:border-accent/60 hover:text-accent bg-transparent',
  ghost: 'text-muted hover:text-fg hover:bg-fg/[0.06] active:bg-fg/[0.09]',
  danger: 'bg-down/10 text-down border border-down/30 hover:bg-down/20 active:bg-down/25',
  up: 'bg-up text-black hover:brightness-110 active:brightness-95 font-semibold',
  down: 'bg-down text-white hover:brightness-110 active:brightness-95 font-semibold',
};

const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-xs gap-1 rounded',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-9 px-4 text-base gap-2 rounded-md',
  lg: 'h-11 px-6 text-md gap-2 rounded-lg font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});
